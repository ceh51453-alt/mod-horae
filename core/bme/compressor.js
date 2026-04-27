/**
 * BME Engine — Memory Compressor
 * Hierarchical summarization of old memories + SleepGate forgetting
 *
 * Two-phase maintenance:
 * 1. compress() — groups same-type nodes and LLM-summarizes into parent nodes
 * 2. sleepCycle() — proactive forgetting of low-retention-value memories
 *
 * Ported from ST-BME maintenance/compressor.js — adapted for Horae
 */

import {
    getActiveNodes, getActiveNodesByType, createNode, addNode,
    getNode, createEdge, addEdge, updateNode, getNodeEdges,
} from './graph.js';
import { getSchemaForType, isCompressibleType, EDGE_TYPES, COMPRESSION_MODE } from './schema.js';
import { canMergeScopedMemories, normalizeMemoryScope } from './memory-scope.js';
import { isStoryTimeCompatible, deriveStoryTimeSpanFromNodes, normalizeStoryTime } from './story-timeline.js';
import { timeDecayFactor } from './dynamics.js';

const LOG_PREFIX = '[Horae BME Compressor]';

// ==================== Hierarchical Compression ====================

/**
 * Run compression on all compressible node types
 * Groups same-type nodes by scope + story segment, then compresses groups that exceed threshold
 *
 * @param {object} graph - BME graph state
 * @param {object} options
 * @param {Function} [options.callLLM] - async (systemPrompt, userPrompt) => string
 * @param {object} [options.settings]
 * @returns {Promise<object>} compression stats
 */
export async function compress(graph, options = {}) {
    const { callLLM, settings = {} } = options;

    const stats = { compressed: 0, nodesArchived: 0, parentsCreated: 0, errors: 0 };

    const compressibleTypes = getActiveNodes(graph)
        .map(n => n.type)
        .filter((t, i, arr) => arr.indexOf(t) === i && isCompressibleType(t));

    for (const type of compressibleTypes) {
        try {
            const typeResult = await _compressType(graph, type, { callLLM, settings });
            stats.compressed += typeResult.compressed;
            stats.nodesArchived += typeResult.nodesArchived;
            stats.parentsCreated += typeResult.parentsCreated;
        } catch (err) {
            console.warn(`${LOG_PREFIX} Error compressing type ${type}:`, err);
            stats.errors++;
        }
    }

    // Update graph compression stats
    if (!graph.compressionStats) graph.compressionStats = { totalRuns: 0, lastRunAt: null };
    graph.compressionStats.totalRuns++;
    graph.compressionStats.lastRunAt = Date.now();

    console.log(`${LOG_PREFIX} Compression complete:`, stats);
    return stats;
}

/**
 * Compress a specific node type
 * @param {object} graph
 * @param {string} type
 * @param {object} options
 * @returns {Promise<object>}
 */
async function _compressType(graph, type, { callLLM, settings }) {
    const schema = getSchemaForType(type);
    if (!schema?.compression || schema.compression.mode !== COMPRESSION_MODE.HIERARCHICAL) {
        return { compressed: 0, nodesArchived: 0, parentsCreated: 0 };
    }

    const { threshold, fanIn, maxDepth = 2, keepRecentLeaves = 2 } = schema.compression;

    // Get all active leaf-level nodes of this type
    const leafNodes = getActiveNodesByType(graph, type)
        .filter(n => n.level === 0)
        .sort((a, b) => a.seq - b.seq);

    if (leafNodes.length < threshold) {
        return { compressed: 0, nodesArchived: 0, parentsCreated: 0 };
    }

    // Group by scope compatibility + story time segment
    const groups = _groupByCompatibility(leafNodes);

    let compressed = 0, nodesArchived = 0, parentsCreated = 0;

    for (const group of groups) {
        if (group.length < threshold) continue;

        // Keep the N most recent leaves uncompressed
        const toCompress = group.slice(0, group.length - keepRecentLeaves);
        if (toCompress.length < fanIn) continue;

        // Split into fanIn-sized batches
        const batches = [];
        for (let i = 0; i < toCompress.length; i += fanIn) {
            const batch = toCompress.slice(i, i + fanIn);
            if (batch.length >= 2) batches.push(batch); // Need at least 2 to compress
        }

        for (const batch of batches) {
            try {
                const parent = await _compressBatch(graph, batch, type, { callLLM, settings });
                if (parent) {
                    parentsCreated++;
                    nodesArchived += batch.length;
                    compressed++;
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} Error compressing batch:`, err);
            }
        }
    }

    return { compressed, nodesArchived, parentsCreated };
}

/**
 * Group nodes by scope and story time compatibility
 * @param {object[]} nodes
 * @returns {object[][]}
 */
function _groupByCompatibility(nodes) {
    const groups = [];
    const assigned = new Set();

    for (const node of nodes) {
        if (assigned.has(node.id)) continue;

        const group = [node];
        assigned.add(node.id);

        for (const candidate of nodes) {
            if (assigned.has(candidate.id)) continue;
            if (canMergeScopedMemories(node, candidate) && isStoryTimeCompatible(node, candidate)) {
                group.push(candidate);
                assigned.add(candidate.id);
            }
        }

        groups.push(group);
    }

    return groups;
}

/**
 * Compress a batch of nodes into a single parent node
 * @param {object} graph
 * @param {object[]} batch - nodes to compress
 * @param {string} type
 * @param {object} options
 * @returns {Promise<object|null>} parent node, or null on failure
 */
async function _compressBatch(graph, batch, type, { callLLM, settings }) {
    // Build summary
    let summary;

    if (callLLM) {
        try {
            summary = await _generateCompressedSummary(batch, type, callLLM);
        } catch (err) {
            console.warn(`${LOG_PREFIX} LLM compression failed, using heuristic:`, err);
            summary = _heuristicSummary(batch);
        }
    } else {
        summary = _heuristicSummary(batch);
    }

    if (!summary) return null;

    // Derive metadata from batch
    const minSeq = Math.min(...batch.map(n => n.seqRange[0]));
    const maxSeq = Math.max(...batch.map(n => n.seqRange[1]));
    const maxImportance = Math.max(...batch.map(n => n.importance));
    const totalAccess = batch.reduce((sum, n) => sum + (n.accessCount || 0), 0);
    const storyTimeSpan = deriveStoryTimeSpanFromNodes(batch);

    // Create parent node at level + 1
    const parentNode = createNode({
        type,
        fields: { summary, title: `${type} tổng hợp (${batch.length} sự kiện)` },
        seq: maxSeq,
        seqRange: [minSeq, maxSeq],
        importance: maxImportance,
        scope: batch[0].scope ? normalizeMemoryScope(batch[0].scope) : null,
        storyTime: batch[0].storyTime ? normalizeStoryTime(batch[0].storyTime) : null,
    });

    parentNode.level = (batch[0].level || 0) + 1;
    parentNode.accessCount = Math.ceil(totalAccess / batch.length);
    parentNode.storyTimeSpan = storyTimeSpan;
    parentNode.childIds = batch.map(n => n.id);

    addNode(graph, parentNode);

    // Archive leaf nodes and create COMPRESSED_FROM edges
    for (const child of batch) {
        child.archived = true;
        child.parentId = parentNode.id;

        addEdge(graph, createEdge({
            sourceId: parentNode.id,
            targetId: child.id,
            type: EDGE_TYPES.COMPRESSED_FROM,
            strength: 1.0,
            label: 'compressed',
        }));

        // Migrate child's outgoing edges to parent (except temporal linked-list)
        _migrateEdgesToParent(graph, child.id, parentNode.id);
    }

    console.log(`${LOG_PREFIX} Compressed ${batch.length} ${type} nodes → parent ${parentNode.id} (level ${parentNode.level})`);
    return parentNode;
}

/**
 * Migrate non-temporal edges from child to parent
 * @param {object} graph
 * @param {string} childId
 * @param {string} parentId
 */
function _migrateEdgesToParent(graph, childId, parentId) {
    for (const edge of graph.edges) {
        if (edge.invalidAt) continue;
        if (edge.type === EDGE_TYPES.TEMPORAL || edge.type === EDGE_TYPES.COMPRESSED_FROM) continue;

        if (edge.sourceId === childId) edge.sourceId = parentId;
        if (edge.targetId === childId) edge.targetId = parentId;
    }
}

// ==================== Sleep Cycle (Active Forgetting) ====================

/**
 * Run the sleep cycle to proactively archive low-retention-value memories
 *
 * Retention Value = (importance/10) × recency × (1 + accessFrequency)
 * Nodes below the forget threshold get archived
 *
 * @param {object} graph
 * @param {object} [settings]
 * @returns {object} sleep stats
 */
export function sleepCycle(graph, settings = {}) {
    const forgetThreshold = settings.bmeForgetThreshold ?? 0.5;
    const now = Date.now();

    const stats = { evaluated: 0, forgotten: 0, preserved: 0 };

    const activeNodes = getActiveNodes(graph).filter(n => n.level === 0);

    for (const node of activeNodes) {
        stats.evaluated++;

        const rv = computeRetentionValue(node, now);

        if (rv < forgetThreshold) {
            // Check if this node type is protected from forgetting
            const schema = getSchemaForType(node.type);
            if (schema?.alwaysInject) {
                stats.preserved++;
                continue;
            }

            // Archive the node
            node.archived = true;
            node.updatedAt = now;
            stats.forgotten++;

            console.log(`${LOG_PREFIX} SleepGate archived node ${node.id} (rv=${rv.toFixed(3)}, type=${node.type})`);
        }
    }

    console.log(`${LOG_PREFIX} Sleep cycle: ${stats.forgotten} forgotten, ${stats.preserved} preserved out of ${stats.evaluated}`);
    return stats;
}

/**
 * Compute retention value for a node
 *
 * retentionValue = (importance/10) × recency × (1 + accessFrequency)
 * where:
 *   recency = 1 / (1 + log₁₀(1 + ageHours))
 *   accessFrequency = min(accessCount, 20) / 20
 *
 * @param {object} node
 * @param {number} [now]
 * @returns {number} 0.0–1.0+
 */
export function computeRetentionValue(node, now = Date.now()) {
    const importance = (node.importance || 5) / 10;
    const ageHours = (now - (node.lastAccessTime || node.createdTime || now)) / (1000 * 60 * 60);
    const recency = 1 / (1 + Math.log10(1 + Math.max(0, ageHours)));
    const accessFreq = Math.min((node.accessCount || 0), 20) / 20;

    return importance * recency * (1 + accessFreq);
}

/**
 * Preview sleep cycle results without applying (dry run)
 * @param {object} graph
 * @param {object} [settings]
 * @returns {object[]} nodes that would be forgotten
 */
export function previewSleepCycle(graph, settings = {}) {
    const forgetThreshold = settings.bmeForgetThreshold ?? 0.5;
    const now = Date.now();

    return getActiveNodes(graph)
        .filter(n => n.level === 0)
        .map(n => ({ node: n, rv: computeRetentionValue(n, now) }))
        .filter(({ rv }) => rv < forgetThreshold)
        .filter(({ node }) => {
            const schema = getSchemaForType(node.type);
            return !schema?.alwaysInject;
        })
        .sort((a, b) => a.rv - b.rv);
}

// ==================== Compression Summary Generation ====================

/**
 * Generate compressed summary via LLM
 * @param {object[]} batch
 * @param {string} type
 * @param {Function} callLLM
 * @returns {Promise<string>}
 */
async function _generateCompressedSummary(batch, type, callLLM) {
    const systemPrompt = `Bạn là hệ thống nén ký ức. Tóm tắt ${batch.length} sự kiện cùng loại thành một bản tổng hợp ngắn gọn.
Giữ lại các chi tiết quan trọng (nhân vật, hành động, kết quả) nhưng loại bỏ thông tin trùng lặp.
Chỉ trả về nội dung tóm tắt, KHÔNG thêm tiêu đề hay định dạng markdown.`;

    const items = batch.map((n, i) => {
        const text = _nodeFieldsToText(n);
        return `${i + 1}. [Importance: ${n.importance}] ${text}`;
    }).join('\n');

    const userPrompt = `## Các ${type} cần nén\n${items}\n\nTóm tắt:`;

    const response = await callLLM(systemPrompt, userPrompt);
    return (response || '').trim();
}

/**
 * Generate heuristic summary (no LLM)
 * @param {object[]} batch
 * @returns {string}
 */
function _heuristicSummary(batch) {
    // Take the top-importance nodes' summaries
    const sorted = [...batch].sort((a, b) => b.importance - a.importance);
    const top = sorted.slice(0, 3);
    const summaries = top.map(n => _nodeFieldsToText(n)).filter(Boolean);

    if (summaries.length === 0) return null;
    return `[Tổng hợp ${batch.length} mục] ${summaries.join(' | ')}`;
}

/**
 * Convert node fields to readable text
 * @param {object} node
 * @returns {string}
 */
function _nodeFieldsToText(node) {
    if (!node?.fields) return '';
    const parts = [];
    if (node.fields.title) parts.push(node.fields.title);
    if (node.fields.summary) parts.push(node.fields.summary);
    if (node.fields.name) parts.push(node.fields.name);
    if (node.fields.insight) parts.push(node.fields.insight);
    if (node.fields.description) parts.push(node.fields.description);
    return parts.join(': ').trim();
}
