/**
 * BME Engine — Memory Consolidator
 * Merges duplicate/overlapping memories via vector similarity + LLM classification
 * Creates evolution edges (RELATED, SUPERSEDES) to strengthen the graph
 *
 * Ported from ST-BME maintenance/consolidator.js — adapted for Horae's API
 */

import { getActiveNodes, getNode, createEdge, addEdge, updateNode } from './graph.js';
import { EDGE_TYPES } from './schema.js';
import { canMergeScopedMemories } from './memory-scope.js';
import { isStoryTimeCompatible } from './story-timeline.js';

const LOG_PREFIX = '[Horae BME Consolidator]';

// ==================== Consolidation Pipeline ====================

/**
 * Run the consolidation pipeline on a batch of newly created nodes
 *
 * Pipeline:
 * 1. Collect embeddings for new nodes
 * 2. Find nearest neighbors among existing nodes
 * 3. Classify: keep / merge / skip via LLM
 * 4. Apply evolution: create edges, update context
 *
 * @param {object} graph - BME graph state
 * @param {object[]} newNodeIds - IDs of newly created nodes to consolidate
 * @param {object} options
 * @param {Function} options.getEmbedding - async (text) => number[] — embedding function
 * @param {Function} [options.callLLM] - async (systemPrompt, userPrompt) => string — LLM call
 * @param {object} [options.settings] - BME settings
 * @returns {Promise<object>} consolidation stats
 */
export async function runConsolidation(graph, newNodeIds, options = {}) {
    const { getEmbedding, callLLM, settings = {} } = options;
    const threshold = settings.bmeConsolidationThreshold ?? 0.85;

    const stats = { merged: 0, skipped: 0, kept: 0, evolved: 0, connections: 0, updates: 0, errors: 0 };

    if (!newNodeIds || newNodeIds.length === 0) return stats;

    console.log(`${LOG_PREFIX} Starting consolidation for ${newNodeIds.length} new nodes`);

    for (const nodeId of newNodeIds) {
        const node = getNode(graph, nodeId);
        if (!node || node.archived) continue;

        try {
            const result = await _consolidateNode(graph, node, { getEmbedding, callLLM, threshold, settings });
            stats.merged += result.merged ? 1 : 0;
            stats.skipped += result.skipped ? 1 : 0;
            stats.kept += result.kept ? 1 : 0;
            stats.evolved += result.evolved ? 1 : 0;
            stats.connections += result.connections;
            stats.updates += result.updates;
        } catch (err) {
            console.warn(`${LOG_PREFIX} Error consolidating node ${nodeId}:`, err);
            stats.errors++;
        }
    }

    // Update graph consolidation stats
    if (!graph.consolidationStats) graph.consolidationStats = { totalRuns: 0, lastRunAt: null };
    graph.consolidationStats.totalRuns++;
    graph.consolidationStats.lastRunAt = Date.now();

    console.log(`${LOG_PREFIX} Consolidation complete:`, stats);
    return stats;
}

/**
 * Analyze whether auto-consolidation should trigger for a batch
 * Returns true if any new node has a neighbor above the similarity threshold
 *
 * @param {object} graph
 * @param {object[]} newNodeIds
 * @param {object} options
 * @returns {Promise<boolean>}
 */
export async function analyzeAutoConsolidationGate(graph, newNodeIds, options = {}) {
    const { getEmbedding, settings = {} } = options;
    const threshold = settings.bmeConsolidationThreshold ?? 0.85;

    if (!getEmbedding || newNodeIds.length === 0) return false;

    // Quick check: find if any new node has a high-similarity neighbor
    for (const nodeId of newNodeIds.slice(0, 3)) { // Check max 3 nodes for performance
        const node = getNode(graph, nodeId);
        if (!node || node.archived) continue;

        const text = _nodeToText(node);
        if (!text) continue;

        try {
            const embedding = await getEmbedding(text);
            if (!embedding) continue;

            const neighbors = _findNearestNeighbors(graph, node, embedding, threshold, 1);
            if (neighbors.length > 0) {
                console.log(`${LOG_PREFIX} Auto-consolidation gate: TRIGGERED (similarity ${neighbors[0].similarity.toFixed(3)})`);
                return true;
            }
        } catch {
            continue;
        }
    }

    return false;
}

// ==================== Core Consolidation Logic ====================

/**
 * Consolidate a single node against existing graph
 * @param {object} graph
 * @param {object} node
 * @param {object} options
 * @returns {Promise<object>}
 */
async function _consolidateNode(graph, node, { getEmbedding, callLLM, threshold, settings }) {
    const result = { merged: false, skipped: false, kept: false, evolved: false, connections: 0, updates: 0 };

    const text = _nodeToText(node);
    if (!text) {
        result.skipped = true;
        return result;
    }

    // Step 1: Get embedding for this node
    let embedding = node.embedding;
    if (!embedding && getEmbedding) {
        try {
            embedding = await getEmbedding(text);
            if (embedding) node.embedding = embedding;
        } catch {
            result.skipped = true;
            return result;
        }
    }

    if (!embedding) {
        result.kept = true;
        return result;
    }

    // Step 2: Find nearest neighbors
    const neighbors = _findNearestNeighbors(graph, node, embedding, threshold, 5);

    if (neighbors.length === 0) {
        result.kept = true;
        return result;
    }

    // Step 3: LLM classification (or heuristic if no LLM)
    let action = 'keep';

    if (callLLM) {
        try {
            action = await _classifyWithLLM(node, neighbors, callLLM, settings);
        } catch (err) {
            console.warn(`${LOG_PREFIX} LLM classification failed, using heuristic:`, err);
            action = _classifyHeuristic(node, neighbors, threshold);
        }
    } else {
        action = _classifyHeuristic(node, neighbors, threshold);
    }

    // Step 4: Apply action
    switch (action) {
        case 'merge': {
            const bestNeighbor = neighbors[0];
            _mergeNodes(graph, bestNeighbor.node, node);
            result.merged = true;
            result.updates++;
            break;
        }
        case 'evolve': {
            // Create RELATED edges to high-similarity neighbors
            for (const neighbor of neighbors.slice(0, 3)) {
                const edge = createEdge({
                    sourceId: node.id,
                    targetId: neighbor.node.id,
                    type: EDGE_TYPES.RELATED,
                    strength: neighbor.similarity,
                    label: 'consolidation-link',
                });
                if (addEdge(graph, edge)) result.connections++;
            }
            result.evolved = true;
            break;
        }
        case 'skip':
            node.archived = true;
            result.skipped = true;
            break;
        default:
            result.kept = true;
    }

    return result;
}

// ==================== Similarity Search ====================

/**
 * Find nearest neighbor nodes by cosine similarity
 * @param {object} graph
 * @param {object} queryNode - node to find neighbors for
 * @param {number[]} queryEmbedding
 * @param {number} threshold
 * @param {number} topK
 * @returns {Array<{node: object, similarity: number}>}
 */
function _findNearestNeighbors(graph, queryNode, queryEmbedding, threshold, topK) {
    const results = [];

    for (const node of getActiveNodes(graph)) {
        // Skip self, archived, or different type
        if (node.id === queryNode.id) continue;
        if (node.type !== queryNode.type) continue;
        if (!node.embedding) continue;

        // Scope compatibility check
        if (!canMergeScopedMemories(queryNode, node)) continue;

        // Story time compatibility check
        if (!isStoryTimeCompatible(queryNode, node)) continue;

        const similarity = _cosineSimilarity(queryEmbedding, node.embedding);
        if (similarity >= threshold) {
            results.push({ node, similarity });
        }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
}

/**
 * Cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}

// ==================== Classification ====================

/**
 * Classify using LLM: merge / evolve / keep / skip
 * @param {object} newNode
 * @param {Array<{node: object, similarity: number}>} neighbors
 * @param {Function} callLLM
 * @param {object} settings
 * @returns {Promise<string>}
 */
async function _classifyWithLLM(newNode, neighbors, callLLM, settings) {
    const systemPrompt = `Bạn là hệ thống hợp nhất ký ức. Phân tích ký ức mới so với các ký ức hiện có tương tự.
Trả về JSON: {"action": "merge"|"evolve"|"keep"|"skip", "reason": "lý do ngắn gọn"}

Quy tắc:
- "merge": Ký ức mới trùng lặp hoàn toàn với ký ức cũ → gộp lại
- "evolve": Ký ức mới bổ sung thông tin mới cho ký ức cũ → tạo liên kết
- "keep": Ký ức mới hoàn toàn khác biệt → giữ nguyên
- "skip": Ký ức mới là thông tin lỗi thời hoặc nhiễu → bỏ qua`;

    const userPrompt = `## Ký ức mới
Loại: ${newNode.type}
Nội dung: ${_nodeToText(newNode)}

## Ký ức tương tự đã có
${neighbors.slice(0, 3).map((n, i) =>
        `${i + 1}. [Similarity: ${n.similarity.toFixed(3)}] ${_nodeToText(n.node)}`
    ).join('\n')}

Phân loại:`;

    try {
        const response = await callLLM(systemPrompt, userPrompt);
        const json = _parseJSON(response);
        if (json?.action && ['merge', 'evolve', 'keep', 'skip'].includes(json.action)) {
            return json.action;
        }
    } catch {
        // Fall through to heuristic
    }

    return _classifyHeuristic(newNode, neighbors, settings.bmeConsolidationThreshold ?? 0.85);
}

/**
 * Heuristic classification (no LLM needed)
 * @param {object} newNode
 * @param {Array<{node: object, similarity: number}>} neighbors
 * @param {number} threshold
 * @returns {string}
 */
function _classifyHeuristic(newNode, neighbors, threshold) {
    if (neighbors.length === 0) return 'keep';

    const best = neighbors[0];

    // Very high similarity → merge
    if (best.similarity >= 0.95) return 'merge';

    // High similarity → evolve
    if (best.similarity >= threshold) return 'evolve';

    return 'keep';
}

// ==================== Merge Logic ====================

/**
 * Merge source node into target node
 * Archives source, updates target with combined information
 *
 * @param {object} graph
 * @param {object} target - existing node to keep
 * @param {object} source - new node to merge in
 */
function _mergeNodes(graph, target, source) {
    // Expand seq range
    const minSeq = Math.min(target.seqRange[0], source.seqRange[0]);
    const maxSeq = Math.max(target.seqRange[1], source.seqRange[1]);
    target.seqRange = [minSeq, maxSeq];

    // Update importance (take max)
    target.importance = Math.max(target.importance, source.importance);

    // Merge access counts
    target.accessCount = (target.accessCount || 0) + (source.accessCount || 0);

    // Merge fields (new fields supplement, don't overwrite)
    if (source.fields) {
        for (const [key, value] of Object.entries(source.fields)) {
            if (!target.fields[key] || target.fields[key] === '') {
                target.fields[key] = value;
            }
        }
    }

    // Merge cluster tags
    if (source.clusters?.length) {
        const existingClusters = new Set(target.clusters || []);
        for (const tag of source.clusters) {
            existingClusters.add(tag);
        }
        target.clusters = Array.from(existingClusters);
    }

    // Create SUPERSEDES edge
    addEdge(graph, createEdge({
        sourceId: target.id,
        targetId: source.id,
        type: EDGE_TYPES.SUPERSEDES,
        strength: 1.0,
        label: 'merged',
    }));

    // Migrate source's edges to target
    _migrateEdges(graph, source.id, target.id);

    // Archive source
    source.archived = true;
    target.updatedAt = Date.now();

    console.log(`${LOG_PREFIX} Merged node ${source.id} → ${target.id}`);
}

/**
 * Migrate edges from old node to new node
 * @param {object} graph
 * @param {string} fromNodeId
 * @param {string} toNodeId
 */
function _migrateEdges(graph, fromNodeId, toNodeId) {
    for (const edge of graph.edges) {
        if (edge.invalidAt) continue;
        if (edge.sourceId === fromNodeId) edge.sourceId = toNodeId;
        if (edge.targetId === fromNodeId) edge.targetId = toNodeId;
    }
}

// ==================== Helpers ====================

/**
 * Convert node to text for embedding/display
 * @param {object} node
 * @returns {string}
 */
function _nodeToText(node) {
    if (!node?.fields) return '';
    const parts = [];
    if (node.fields.title) parts.push(node.fields.title);
    if (node.fields.summary) parts.push(node.fields.summary);
    if (node.fields.name) parts.push(node.fields.name);
    if (node.fields.insight) parts.push(node.fields.insight);
    if (node.fields.description) parts.push(node.fields.description);
    if (node.fields.traits) parts.push(node.fields.traits);
    if (node.fields.state) parts.push(node.fields.state);
    return parts.join('. ').trim();
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 * @param {string} text
 * @returns {object|null}
 */
function _parseJSON(text) {
    if (!text) return null;
    try {
        // Try direct parse
        return JSON.parse(text);
    } catch {
        // Try extracting from markdown code block
        const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (match) {
            try { return JSON.parse(match[1]); } catch { /* fallthrough */ }
        }
        // Try extracting bare JSON object
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[0]); } catch { /* fallthrough */ }
        }
        return null;
    }
}
