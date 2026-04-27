/**
 * BME Engine — Bridge Layer v2 (Horae ↔ BME)
 * Maps existing horae_meta structures to BME graph nodes and edges
 * Extended with scope, storyTime, knowledge state, consolidation/compression triggers
 *
 * Mapping:
 *   horae_meta.events[]          → BME node type="event"
 *   horae_meta.npcs{}            → BME node type="character"
 *   horae_meta.scene.location    → BME node type="location"
 *   horae_meta.scene.characters_present → edges (CO_OCCURRED, PARTICIPATED)
 *   horae_meta.timestamp         → storyTime derivation
 *   is_user message              → POV scope layer
 */

import {
    createEmptyBmeGraph, createNode, addNode, getNode,
    getActiveNodes, getActiveNodesByType, createEdge, addEdge,
    buildTemporalAdjacencyMap, findNodesBySeq, getGraphStats,
    findLatestNode, getNodeEdges, invalidateEdge,
} from './graph.js';
import { EDGE_TYPES } from './schema.js';
import { createObjectiveScope, createPovScope, normalizeMemoryScope } from './memory-scope.js';
import { deriveStoryTimeFromHoraeMeta, normalizeStoryTime, resolveActiveStoryContext } from './story-timeline.js';
import { normalizeGraphCognitiveState, applyCognitionUpdates, applyRegionUpdates } from './knowledge-state.js';
import { openBmeDb, saveGraphToDb, loadGraphFromDb, closeBmeDb } from './bme-db.js';

const LOG_PREFIX = '[Horae BME]';

// ==================== DB Connection Cache ====================
let _dbCache = new Map(); // chatId → IDBDatabase

// ==================== Graph Persistence ====================

/**
 * Load BME graph: prefer IndexedDB, fallback to chat JSON
 * @param {object[]} chat - SillyTavern chat array
 * @param {object} [options]
 * @param {boolean} [options.useIdb] - whether to try IndexedDB
 * @param {string} [options.chatId] - chat ID for IndexedDB lookup
 * @returns {Promise<object>} graph state
 */
export async function loadGraphFromChat(chat, options = {}) {
    const { useIdb = false, chatId = '' } = options;

    // Try IndexedDB first
    if (useIdb && chatId) {
        try {
            const db = await _getOrOpenDb(chatId);
            const idbGraph = await loadGraphFromDb(db);
            if (idbGraph && idbGraph.nodes?.length > 0) {
                console.log(`${LOG_PREFIX} Graph loaded from IndexedDB (${idbGraph.nodes.length} nodes)`);
                return idbGraph;
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} IndexedDB load failed, falling back to chat JSON:`, err);
        }
    }

    // Fallback to chat JSON
    if (!chat?.[0]?.horae_meta?.bmeGraph) {
        return createEmptyBmeGraph();
    }
    const stored = chat[0].horae_meta.bmeGraph;
    if (!stored.version || !Array.isArray(stored.nodes)) {
        return createEmptyBmeGraph();
    }
    return stored;
}

/**
 * Save BME graph: to chat JSON + optionally IndexedDB
 * @param {object[]} chat
 * @param {object} graph
 * @param {object} [options]
 * @param {boolean} [options.useIdb]
 * @param {string} [options.chatId]
 */
export async function saveGraphToChat(chat, graph, options = {}) {
    const { useIdb = false, chatId = '' } = options;

    // Always save to chat JSON (portability)
    if (chat?.[0]) {
        if (!chat[0].horae_meta) chat[0].horae_meta = {};
        chat[0].horae_meta.bmeGraph = graph;
    }

    // Also save to IndexedDB if enabled
    if (useIdb && chatId) {
        try {
            const db = await _getOrOpenDb(chatId);
            await saveGraphToDb(db, graph);
        } catch (err) {
            console.warn(`${LOG_PREFIX} IndexedDB save failed:`, err);
        }
    }
}

// ==================== Entity Dedup ====================

/**
 * Find or create an entity node (character/location) by name
 * Deduplicates by matching fields.name (case-insensitive)
 *
 * @param {object} graph
 * @param {string} type - 'character' or 'location'
 * @param {string} name - entity name
 * @param {number} seq - message index for creation
 * @param {object} [extraFields] - additional fields to set
 * @param {object} [nodeOptions] - scope, storyTime, etc.
 * @returns {object} existing or newly created node
 */
export function getOrCreateEntityNode(graph, type, name, seq, extraFields = {}, nodeOptions = {}) {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    // Try exact match first, then case-insensitive
    const existing = getActiveNodesByType(graph, type).find(n => {
        const nodeName = n.fields?.name || '';
        return nodeName === normalizedName || nodeName.toLowerCase() === normalizedName.toLowerCase();
    });

    if (existing) {
        // Update fields if new data is provided
        if (Object.keys(extraFields).length > 0) {
            existing.fields = { ...existing.fields, ...extraFields };
            existing.updatedAt = Date.now();
        }
        return existing;
    }

    // Create new entity node
    const node = createNode({
        type,
        fields: { name: normalizedName, ...extraFields },
        seq,
        importance: type === 'character' ? 6 : 4,
        scope: nodeOptions.scope || null,
        storyTime: nodeOptions.storyTime || null,
    });
    addNode(graph, node);
    return node;
}

// ==================== Meta → Graph Sync ====================

/**
 * Synchronize horae_meta from chat messages into BME graph nodes/edges
 * Now also derives scope + storyTime from message context
 *
 * @param {object} graph - BME graph state
 * @param {object[]} chat - SillyTavern chat array
 * @param {number} [fromSeq] - override start sequence
 * @param {object} [settings] - BME settings
 * @returns {{ nodesCreated: number, edgesCreated: number, newNodeIds: string[] }} sync stats
 */
export function syncMetaToGraph(graph, chat, fromSeq = null, settings = {}) {
    const startSeq = fromSeq ?? (graph.lastProcessedSeq + 1);
    let nodesCreated = 0;
    let edgesCreated = 0;
    const newNodeIds = [];

    // Ensure knowledge state is initialized
    normalizeGraphCognitiveState(graph, chat);

    for (let i = Math.max(0, startSeq); i < chat.length; i++) {
        const msg = chat[i];
        const meta = msg?.horae_meta;
        if (!meta || meta._skipHorae) continue;

        // Derive scope for this message
        const scope = _deriveScopeForMessage(msg, graph, settings);

        // Derive story time from Horae's timestamp
        const storyTime = (settings.bmeStoryTimelineEnabled !== false)
            ? deriveStoryTimeFromHoraeMeta(meta, graph, i)
            : null;

        const result = _processMessageMeta(graph, meta, i, { scope, storyTime, settings });
        nodesCreated += result.nodesCreated;
        edgesCreated += result.edgesCreated;
        newNodeIds.push(...result.newNodeIds);
    }

    // Update knowledge state from the latest scene data
    _updateKnowledgeStateFromChat(graph, chat);

    graph.lastProcessedSeq = chat.length - 1;
    return { nodesCreated, edgesCreated, newNodeIds };
}

/**
 * Derive memory scope for a message based on who sent it
 * @param {object} msg
 * @param {object} graph
 * @param {object} settings
 * @returns {object} scope
 */
function _deriveScopeForMessage(msg, graph, settings = {}) {
    if (!settings.bmeScopedMemoryEnabled) return null;

    const isUser = msg.is_user;
    const meta = msg.horae_meta;
    const region = meta?.scene?.location || '';

    if (isUser && settings.bmePovMemoryEnabled) {
        return createPovScope('user', region);
    }

    // AI messages are generally objective (world narration)
    return createObjectiveScope(region);
}

/**
 * Update knowledge state from the latest chat messages
 * @param {object} graph
 * @param {object[]} chat
 */
function _updateKnowledgeStateFromChat(graph, chat) {
    const ks = normalizeGraphCognitiveState(graph);

    // Find latest scene
    for (let i = chat.length - 1; i >= 0; i--) {
        const meta = chat[i]?.horae_meta;
        if (!meta?.scene) continue;

        if (meta.scene.location) {
            applyRegionUpdates(graph, { location: meta.scene.location });
        }

        const chars = meta.scene.characters_present || [];
        if (chars.length > 0) {
            applyCognitionUpdates(graph, { activeOwnerKey: chars[0] });
        }

        break;
    }
}

/**
 * Process a single message's horae_meta into graph nodes/edges
 * @param {object} graph
 * @param {object} meta - horae_meta object
 * @param {number} seq - message index
 * @param {object} options - { scope, storyTime, settings }
 * @returns {{ nodesCreated: number, edgesCreated: number, newNodeIds: string[] }}
 */
function _processMessageMeta(graph, meta, seq, options = {}) {
    const { scope, storyTime, settings } = options;
    let nodesCreated = 0;
    let edgesCreated = 0;
    const newNodeIds = [];

    // --- Event nodes ---
    const events = meta.events || (meta.event ? [meta.event] : []);
    const eventNodes = [];

    for (const evt of events) {
        if (!evt?.summary) continue;
        if (evt.isSummary || evt.level === '摘要' || evt._summaryId) continue;

        const importance = (evt.level === '关键' || evt.level === '關鍵') ? 9
            : (evt.level === '重要') ? 7 : 5;

        const node = createNode({
            type: 'event',
            fields: {
                summary: evt.summary,
                level: evt.level || '一般',
                participants: (meta.scene?.characters_present || []).join(', '),
                status: 'resolved',
            },
            seq,
            importance,
            scope: scope || null,
            storyTime: storyTime || null,
        });

        // Carry over access count from horae_meta events
        if (evt.accessCount) {
            node.accessCount = evt.accessCount;
        }

        addNode(graph, node);
        eventNodes.push(node);
        newNodeIds.push(node.id);
        nodesCreated++;
    }

    // --- Location node ---
    let locationNode = null;
    if (meta.scene?.location) {
        locationNode = getOrCreateEntityNode(graph, 'location', meta.scene.location, seq, {
            atmosphere: meta.scene?.atmosphere || '',
        }, { scope: createObjectiveScope(meta.scene.location), storyTime });
        if (locationNode && !locationNode._existed) nodesCreated++;
    }

    // --- Character nodes ---
    const charNodes = [];
    const presentChars = meta.scene?.characters_present || [];
    for (const charName of presentChars) {
        const charNode = getOrCreateEntityNode(graph, 'character', charName, seq, {}, {
            scope: createObjectiveScope(),
            storyTime,
        });
        if (charNode) charNodes.push(charNode);
    }

    // NPC data → character nodes with enriched fields
    if (meta.npcs) {
        for (const [name, info] of Object.entries(meta.npcs)) {
            const charNode = getOrCreateEntityNode(graph, 'character', name, seq, {
                traits: info.appearance || '',
                relationship: info.relationship || '',
                state: info.personality || '',
            }, { scope: createObjectiveScope(), storyTime });
            if (charNode && !charNodes.find(c => c.id === charNode.id)) {
                charNodes.push(charNode);
                nodesCreated++;
            }
        }
    }

    // --- Edges ---
    for (const eventNode of eventNodes) {
        // Event → Location (OCCURRED_AT)
        if (locationNode) {
            const edge = createEdge({
                sourceId: eventNode.id,
                targetId: locationNode.id,
                type: EDGE_TYPES.OCCURRED_AT,
                strength: 0.6,
            });
            if (addEdge(graph, edge)) edgesCreated++;
        }

        // Event → Characters (PARTICIPATED)
        for (const charNode of charNodes) {
            const edge = createEdge({
                sourceId: eventNode.id,
                targetId: charNode.id,
                type: EDGE_TYPES.PARTICIPATED,
                strength: 0.7,
            });
            if (addEdge(graph, edge)) edgesCreated++;
        }
    }

    // Character CO_OCCURRED edges (pairs of characters in same scene)
    for (let a = 0; a < charNodes.length; a++) {
        for (let b = a + 1; b < charNodes.length; b++) {
            const edge = createEdge({
                sourceId: charNodes[a].id,
                targetId: charNodes[b].id,
                type: EDGE_TYPES.CO_OCCURRED,
                strength: 0.4,
            });
            if (addEdge(graph, edge)) edgesCreated++;
        }
    }

    return { nodesCreated, edgesCreated, newNodeIds };
}

// ==================== Query Helpers ====================

/**
 * Find BME nodes associated with a given message index (seq)
 * @param {object} graph
 * @param {number} messageIndex
 * @returns {object[]} matching nodes
 */
export function findNodesForMessage(graph, messageIndex) {
    return findNodesBySeq(graph, messageIndex);
}

/**
 * Map vector search results (messageIndex-based) to BME node IDs
 * Returns seed entries suitable for PEDSA diffusion
 *
 * @param {object} graph
 * @param {Array<{messageIndex: number, similarity: number}>} vectorResults
 * @returns {Array<{id: string, energy: number}>} seed nodes for diffusion
 */
export function vectorResultsToSeeds(graph, vectorResults) {
    const seeds = [];
    const seenIds = new Set();

    for (const result of vectorResults) {
        const nodes = findNodesBySeq(graph, result.messageIndex);
        for (const node of nodes) {
            if (!seenIds.has(node.id)) {
                seenIds.add(node.id);
                seeds.push({
                    id: node.id,
                    energy: result.similarity,
                });
            }
        }
    }

    return seeds;
}

/**
 * Map BME node IDs back to message indices for recall output
 * @param {object} graph
 * @param {Array<{nodeId: string, energy: number}>} diffusionResults
 * @returns {Map<number, {energy: number, nodeId: string, node: object}>}
 */
export function diffusionResultsToMessages(graph, diffusionResults) {
    const messageMap = new Map();

    for (const dr of diffusionResults) {
        const node = getNode(graph, dr.nodeId);
        if (!node || node.archived) continue;

        const seq = node.seq;
        const existing = messageMap.get(seq);
        if (!existing || dr.energy > existing.energy) {
            messageMap.set(seq, {
                energy: dr.energy,
                nodeId: dr.nodeId,
                node,
            });
        }
    }

    return messageMap;
}

// ==================== IDB Connection Helpers ====================

/**
 * Get or open a cached IDB connection
 * @param {string} chatId
 * @returns {Promise<IDBDatabase>}
 */
async function _getOrOpenDb(chatId) {
    if (_dbCache.has(chatId)) {
        return _dbCache.get(chatId);
    }
    const db = await openBmeDb(chatId);
    _dbCache.set(chatId, db);
    return db;
}

/**
 * Close all cached DB connections (call on chat switch)
 */
export function closeAllBmeConnections() {
    for (const [chatId, db] of _dbCache) {
        closeBmeDb(db);
    }
    _dbCache.clear();
}

// Re-export core graph functions for convenience
export { createEmptyBmeGraph, buildTemporalAdjacencyMap, getNode, getActiveNodes, getGraphStats };
