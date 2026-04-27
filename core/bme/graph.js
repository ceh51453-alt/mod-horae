/**
 * BME Engine — Graph Data Model (v2)
 * Manages node/edge CRUD, adjacency map construction for PEDSA diffusion
 * Extended with scope, storyTime, cluster tags, and helper queries
 *
 * Ported from ST-BME graph/graph.js — adapted for Horae
 */

import { EDGE_TYPES, EDGE_TYPE_CODES } from './schema.js';

const GRAPH_VERSION = 2;

/** Generate UUID v4 */
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Create empty BME graph state
 * @returns {object} graph state
 */
export function createEmptyBmeGraph() {
    return {
        version: GRAPH_VERSION,
        lastProcessedSeq: -1,
        nodes: [],
        edges: [],
        timeline: [],
        knowledgeState: null,
        lastRecallResult: null,
        consolidationStats: { totalRuns: 0, lastRunAt: null },
        compressionStats: { totalRuns: 0, lastRunAt: null },
    };
}

// ==================== Node Operations ====================

/**
 * Create a new graph node
 * @param {object} params
 * @returns {object} new node
 */
export function createNode({
    type,
    fields = {},
    seq = 0,
    seqRange = null,
    importance = 5.0,
    scope = null,
    storyTime = null,
    clusters = [],
}) {
    const now = Date.now();
    return {
        id: uuid(),
        type,
        level: 0,
        parentId: null,
        childIds: [],
        seq,
        seqRange: seqRange || [seq, seq],
        archived: false,
        fields,
        embedding: null,
        importance: Math.max(0, Math.min(10, importance)),
        accessCount: 0,
        updatedAt: now,
        lastAccessTime: now,
        createdTime: now,
        prevId: null,
        nextId: null,
        // Phase 2 extensions
        scope: scope || null,
        storyTime: storyTime || null,
        storyTimeSpan: null,
        clusters: Array.isArray(clusters) ? clusters : [],
    };
}

/**
 * Add node to graph, maintaining temporal linked list per type
 * @param {object} graph
 * @param {object} node
 * @returns {object} added node
 */
export function addNode(graph, node) {
    const sameTypeNodes = graph.nodes
        .filter(n => n.type === node.type && !n.archived && n.level === 0)
        .sort((a, b) => a.seq - b.seq);

    if (sameTypeNodes.length > 0) {
        const lastNode = sameTypeNodes[sameTypeNodes.length - 1];
        lastNode.nextId = node.id;
        node.prevId = lastNode.id;
    }

    graph.nodes.push(node);
    return node;
}

/**
 * Get node by ID
 * @param {object} graph
 * @param {string} nodeId
 * @returns {object|null}
 */
export function getNode(graph, nodeId) {
    return graph.nodes.find(n => n.id === nodeId) || null;
}

/**
 * Update node fields (partial update)
 * @param {object} graph
 * @param {string} nodeId
 * @param {object} updates
 * @returns {boolean} whether found and updated
 */
export function updateNode(graph, nodeId, updates) {
    const node = getNode(graph, nodeId);
    if (!node) return false;

    if (updates.fields) {
        node.fields = { ...node.fields, ...updates.fields };
        delete updates.fields;
    }

    Object.assign(node, updates);
    node.updatedAt = Date.now();
    return true;
}

/**
 * Remove node and associated edges
 * @param {object} graph
 * @param {string} nodeId
 * @returns {boolean}
 */
export function removeNode(graph, nodeId) {
    const idx = graph.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return false;

    const node = graph.nodes[idx];

    // Fix linked list pointers
    if (node.prevId) {
        const prev = getNode(graph, node.prevId);
        if (prev) prev.nextId = node.nextId;
    }
    if (node.nextId) {
        const next = getNode(graph, node.nextId);
        if (next) next.prevId = node.prevId;
    }

    // Remove associated edges
    graph.edges = graph.edges.filter(
        e => e.sourceId !== nodeId && e.targetId !== nodeId,
    );

    graph.nodes.splice(idx, 1);
    return true;
}

/**
 * Get all active (non-archived) nodes
 * @param {object} graph
 * @returns {object[]}
 */
export function getActiveNodes(graph) {
    return graph.nodes.filter(n => !n.archived);
}

/**
 * Get active nodes of a specific type
 * @param {object} graph
 * @param {string} type
 * @returns {object[]}
 */
export function getActiveNodesByType(graph, type) {
    return graph.nodes.filter(n => n.type === type && !n.archived);
}

/**
 * Find the most recent active node of a type
 * @param {object} graph
 * @param {string} type
 * @returns {object|null}
 */
export function findLatestNode(graph, type) {
    const nodes = getActiveNodesByType(graph, type)
        .sort((a, b) => b.seq - a.seq);
    return nodes.length > 0 ? nodes[0] : null;
}

// ==================== Edge Operations ====================

/**
 * Create a new edge
 * @param {object} params
 * @returns {object} new edge
 */
export function createEdge({
    sourceId,
    targetId,
    type = EDGE_TYPES.TEMPORAL,
    strength = 0.5,
    label = '',
}) {
    return {
        id: uuid(),
        sourceId,
        targetId,
        type,
        edgeType: type === EDGE_TYPES.INHIBIT ? EDGE_TYPE_CODES.INHIBIT : EDGE_TYPE_CODES.NORMAL,
        strength: Math.max(0, Math.min(1, strength)),
        label,
        createdTime: Date.now(),
        invalidAt: null,
    };
}

/**
 * Add edge to graph (dedup: skip if same source→target+type exists)
 * @param {object} graph
 * @param {object} edge
 * @returns {object|null} added edge, or null if duplicate
 */
export function addEdge(graph, edge) {
    const exists = graph.edges.find(
        e => e.sourceId === edge.sourceId && e.targetId === edge.targetId && e.type === edge.type && !e.invalidAt,
    );
    if (exists) return null;

    graph.edges.push(edge);
    return edge;
}

/**
 * Remove edge by ID
 * @param {object} graph
 * @param {string} edgeId
 * @returns {boolean}
 */
export function removeEdge(graph, edgeId) {
    const idx = graph.edges.findIndex(e => e.id === edgeId);
    if (idx === -1) return false;
    graph.edges.splice(idx, 1);
    return true;
}

/**
 * Soft-delete an edge (mark as invalid rather than removing)
 * @param {object} graph
 * @param {string} edgeId
 * @returns {boolean}
 */
export function invalidateEdge(graph, edgeId) {
    const edge = graph.edges.find(e => e.id === edgeId);
    if (!edge) return false;
    edge.invalidAt = Date.now();
    return true;
}

/**
 * Get all edges connected to a node (either source or target)
 * @param {object} graph
 * @param {string} nodeId
 * @returns {object[]}
 */
export function getNodeEdges(graph, nodeId) {
    return graph.edges.filter(
        e => (e.sourceId === nodeId || e.targetId === nodeId) && !e.invalidAt,
    );
}

/**
 * Get all valid (non-invalidated) edges
 * @param {object} graph
 * @returns {object[]}
 */
export function getValidEdges(graph) {
    return graph.edges.filter(e => !e.invalidAt);
}

// ==================== Adjacency Map ====================

/**
 * Build adjacency map for PEDSA diffusion
 * Includes explicit edges + synthetic temporal edges from node linked list
 *
 * @param {object} graph
 * @returns {Map<string, Array<{targetId: string, strength: number, edgeType: number}>>}
 */
export function buildTemporalAdjacencyMap(graph) {
    /** @type {Map<string, Array<{targetId: string, strength: number, edgeType: number}>>} */
    const adjMap = new Map();

    const ensureList = (nodeId) => {
        if (!adjMap.has(nodeId)) adjMap.set(nodeId, []);
        return adjMap.get(nodeId);
    };

    // 1. Explicit edges (skip invalidated)
    for (const edge of graph.edges) {
        if (edge.invalidAt) continue;

        const list = ensureList(edge.sourceId);
        list.push({
            targetId: edge.targetId,
            strength: edge.strength,
            edgeType: edge.edgeType || EDGE_TYPE_CODES.NORMAL,
        });

        // Bidirectional for non-inhibitory edges (diffusion propagates both ways)
        if (edge.edgeType !== EDGE_TYPE_CODES.INHIBIT) {
            const reverseList = ensureList(edge.targetId);
            reverseList.push({
                targetId: edge.sourceId,
                strength: edge.strength * 0.5, // reverse direction at half strength
                edgeType: EDGE_TYPE_CODES.NORMAL,
            });
        }
    }

    // 2. Synthetic temporal edges from node linked list (prevId/nextId)
    for (const node of graph.nodes) {
        if (node.archived) continue;

        if (node.nextId) {
            const list = ensureList(node.id);
            list.push({
                targetId: node.nextId,
                strength: 0.3, // temporal proximity weight
                edgeType: EDGE_TYPE_CODES.NORMAL,
            });
        }
        if (node.prevId) {
            const list = ensureList(node.id);
            list.push({
                targetId: node.prevId,
                strength: 0.3,
                edgeType: EDGE_TYPE_CODES.NORMAL,
            });
        }
    }

    return adjMap;
}

// ==================== Query Helpers ====================

/**
 * Find node by seq (message index)
 * @param {object} graph
 * @param {number} seq
 * @param {string} [type] - optional type filter
 * @returns {object[]} matching nodes
 */
export function findNodesBySeq(graph, seq, type = null) {
    return graph.nodes.filter(n => {
        if (n.archived) return false;
        if (type && n.type !== type) return false;
        if (n.seqRange) {
            return seq >= n.seqRange[0] && seq <= n.seqRange[1];
        }
        return n.seq === seq;
    });
}

/**
 * Count active nodes by type
 * @param {object} graph
 * @returns {Object<string, number>}
 */
export function countNodesByType(graph) {
    const counts = {};
    for (const node of getActiveNodes(graph)) {
        counts[node.type] = (counts[node.type] || 0) + 1;
    }
    return counts;
}

/**
 * Get graph statistics summary
 * @param {object} graph
 * @returns {object}
 */
export function getGraphStats(graph) {
    const activeNodes = getActiveNodes(graph);
    const validEdges = getValidEdges(graph);
    return {
        totalNodes: graph.nodes.length,
        activeNodes: activeNodes.length,
        archivedNodes: graph.nodes.length - activeNodes.length,
        totalEdges: graph.edges.length,
        validEdges: validEdges.length,
        nodesByType: countNodesByType(graph),
        timelineSegments: (graph.timeline || []).length,
        lastProcessedSeq: graph.lastProcessedSeq,
    };
}
