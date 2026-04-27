/**
 * BME Engine — Knowledge State
 * Tracks active character POV, spatial region, and computes visibility gates
 * Used to filter/weight memories based on "who knows what" and "where"
 *
 * Ported from ST-BME graph/knowledge-state.js — adapted for Horae's scene model
 */

import { normalizeMemoryScope, isObjectiveScope, isPovScope, getScopeOwnerKey, getScopeRegionKey } from './memory-scope.js';

// ==================== State Management ====================

/**
 * Normalize the cognitive state stored in graph.knowledgeState
 * Ensures all required fields exist with sane defaults
 *
 * @param {object} graph - BME graph state
 * @param {object[]} [chat] - SillyTavern chat array (for deriving state)
 * @returns {object} normalized knowledge state
 */
export function normalizeGraphCognitiveState(graph, chat = null) {
    if (!graph.knowledgeState) graph.knowledgeState = {};
    const ks = graph.knowledgeState;

    // Active owner (the character whose POV is "active" for recall filtering)
    if (!ks.activeOwnerKey) ks.activeOwnerKey = '';
    if (!ks.recentOwners) ks.recentOwners = [];

    // Active region (spatial context for location-scoped retrieval)
    if (!ks.activeRegion) ks.activeRegion = '';
    if (!ks.recentRegions) ks.recentRegions = [];
    if (!ks.adjacentRegions) ks.adjacentRegions = [];

    // Auto-derive from chat if provided
    if (chat) {
        _deriveFromChat(ks, chat);
    }

    return ks;
}

/**
 * Derive knowledge state from the latest chat messages
 * @param {object} ks - knowledge state
 * @param {object[]} chat
 */
function _deriveFromChat(ks, chat) {
    // Scan from most recent message backward to find active scene
    for (let i = chat.length - 1; i >= 0; i--) {
        const meta = chat[i]?.horae_meta;
        if (!meta?.scene) continue;

        // Active region from scene location
        if (meta.scene.location && !ks._regionLocked) {
            const region = meta.scene.location.trim().toLowerCase();
            if (region !== ks.activeRegion) {
                ks.activeRegion = region;
                pushRecentRegion(ks, region);
            }
        }

        // Active owner from first character present (typically the AI character)
        const chars = meta.scene.characters_present || [];
        if (chars.length > 0 && !ks._ownerLocked) {
            const ownerKey = chars[0].trim().toLowerCase();
            if (ownerKey !== ks.activeOwnerKey) {
                ks.activeOwnerKey = ownerKey;
                pushRecentRecallOwner(ks, ownerKey);
            }
        }

        break; // Only need the most recent scene
    }
}

// ==================== Owner Management ====================

/**
 * Resolve the knowledge owner key for a given scope
 * Maps POV scopes to their owner, objective scopes return ''
 * @param {object} scope
 * @returns {string}
 */
export function resolveKnowledgeOwner(scope) {
    if (isPovScope(scope)) {
        return getScopeOwnerKey(scope);
    }
    return '';
}

/**
 * Resolve knowledge owner key from a scope object
 * @param {object} scope
 * @returns {string}
 */
export function resolveKnowledgeOwnerKeyFromScope(scope) {
    return resolveKnowledgeOwner(scope);
}

/**
 * Get list of unique knowledge owners in the graph
 * @param {object} graph
 * @returns {string[]}
 */
export function listKnowledgeOwners(graph) {
    const owners = new Set();
    for (const node of graph.nodes || []) {
        if (node.scope?.ownerKey) {
            owners.add(node.scope.ownerKey);
        }
    }
    return Array.from(owners);
}

/**
 * Push a recent recall owner (ring buffer of last 5)
 * @param {object} ks - knowledge state
 * @param {string} ownerKey
 */
export function pushRecentRecallOwner(ks, ownerKey) {
    if (!ks.recentOwners) ks.recentOwners = [];
    const normalized = ownerKey.trim().toLowerCase();
    if (!normalized) return;

    // Remove existing and push to front
    ks.recentOwners = ks.recentOwners.filter(o => o !== normalized);
    ks.recentOwners.unshift(normalized);

    // Keep only last 5
    if (ks.recentOwners.length > 5) ks.recentOwners.length = 5;
}

// ==================== Region Management ====================

/**
 * Resolve the active region context for retrieval
 * @param {object} ks - knowledge state
 * @returns {{ activeRegion: string, adjacentRegions: string[] }}
 */
export function resolveActiveRegionContext(ks) {
    return {
        activeRegion: ks.activeRegion || '',
        adjacentRegions: ks.adjacentRegions || [],
    };
}

/**
 * Resolve adjacent regions (based on recent movement patterns)
 * @param {object} ks - knowledge state
 * @returns {string[]}
 */
export function resolveAdjacentRegions(ks) {
    // Use recent regions as adjacency approximation
    return (ks.recentRegions || []).filter(r => r !== ks.activeRegion).slice(0, 3);
}

/**
 * Push a recent region (ring buffer of last 5)
 * @param {object} ks
 * @param {string} region
 */
function pushRecentRegion(ks, region) {
    if (!ks.recentRegions) ks.recentRegions = [];
    const normalized = region.trim().toLowerCase();
    if (!normalized) return;

    ks.recentRegions = ks.recentRegions.filter(r => r !== normalized);
    ks.recentRegions.unshift(normalized);
    if (ks.recentRegions.length > 5) ks.recentRegions.length = 5;

    // Recalculate adjacency
    ks.adjacentRegions = resolveAdjacentRegions(ks);
}

// ==================== Visibility Gates ====================

/**
 * Compute a visibility gate (0.0–1.0) for a node based on knowledge state
 * Used to filter/suppress memories that the active character shouldn't know
 *
 * @param {object} node - graph node
 * @param {string} activeOwnerKey - current active character
 * @param {object} [settings]
 * @returns {number} 0.0 (hidden) to 1.0 (fully visible)
 */
export function computeKnowledgeGateForNode(node, activeOwnerKey = '', settings = {}) {
    const scope = normalizeMemoryScope(node?.scope);

    // Objective memories are always visible
    if (isObjectiveScope(scope)) {
        return scope.visibility ?? 1.0;
    }

    // POV memories
    if (isPovScope(scope)) {
        const nodeOwner = scope.ownerKey;
        const normalizedActive = activeOwnerKey.trim().toLowerCase();

        // Same character → full visibility
        if (nodeOwner === normalizedActive) {
            return scope.visibility ?? 1.0;
        }

        // User POV is always accessible (the player knows everything they've done)
        if (nodeOwner === 'user' || nodeOwner === '{{user}}') {
            return scope.visibility ?? 0.9;
        }

        // Other character's private memory
        if (settings.crossPovVisibility === true) {
            // Cross-POV mode: other characters' memories are partially visible
            return (scope.visibility ?? 1.0) * 0.3;
        }

        // Default: other character memories are hidden
        return 0;
    }

    return 1.0;
}

// ==================== Update Helpers ====================

/**
 * Apply cognition updates to the knowledge state
 * Called after extraction to update character state tracking
 *
 * @param {object} graph
 * @param {object} updates - { activeOwnerKey?, activeRegion? }
 */
export function applyCognitionUpdates(graph, updates) {
    const ks = normalizeGraphCognitiveState(graph);

    if (updates.activeOwnerKey) {
        const key = updates.activeOwnerKey.trim().toLowerCase();
        if (key !== ks.activeOwnerKey) {
            ks.activeOwnerKey = key;
            pushRecentRecallOwner(ks, key);
        }
    }

    if (updates.activeRegion) {
        const region = updates.activeRegion.trim().toLowerCase();
        if (region !== ks.activeRegion) {
            ks.activeRegion = region;
            pushRecentRegion(ks, region);
        }
    }
}

/**
 * Apply region updates from scene data
 * @param {object} graph
 * @param {object} regionData - { location }
 */
export function applyRegionUpdates(graph, regionData) {
    if (regionData?.location) {
        applyCognitionUpdates(graph, { activeRegion: regionData.location });
    }
}
