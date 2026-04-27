/**
 * BME Engine — Memory Scope
 * Implements POV layers: objective (world-truth) vs pov (character-subjective)
 * Provides bucket classification for scope-aware retrieval weighting
 *
 * Ported from ST-BME graph/memory-scope.js — adapted for Horae's data model
 */

import { SCOPE_LAYERS } from './schema.js';

// ==================== Scope Constants ====================

export const MEMORY_SCOPE_BUCKETS = {
    CHARACTER_POV: 'characterPov',
    USER_POV: 'userPov',
    OBJECTIVE_CURRENT_REGION: 'objectiveCurrentRegion',
    OBJECTIVE_ADJACENT_REGION: 'objectiveAdjacentRegion',
    OBJECTIVE_GLOBAL: 'objectiveGlobal',
    EXCLUDED: 'excluded',
};

const DEFAULT_SCOPE = {
    layer: SCOPE_LAYERS.OBJECTIVE,
    ownerKey: '',
    region: '',
    visibility: 1.0,
};

// ==================== Scope Normalization ====================

/**
 * Normalize a raw scope object into a clean, consistent format
 * @param {object} [rawScope] - raw scope data
 * @returns {object} normalized scope
 */
export function normalizeMemoryScope(rawScope) {
    if (!rawScope || typeof rawScope !== 'object') {
        return { ...DEFAULT_SCOPE };
    }

    const layer = rawScope.layer === SCOPE_LAYERS.POV
        ? SCOPE_LAYERS.POV
        : SCOPE_LAYERS.OBJECTIVE;

    return {
        layer,
        ownerKey: String(rawScope.ownerKey || '').trim().toLowerCase(),
        region: String(rawScope.region || '').trim().toLowerCase(),
        visibility: Number.isFinite(rawScope.visibility)
            ? Math.max(0, Math.min(1, rawScope.visibility))
            : 1.0,
    };
}

/**
 * Create a POV scope for a character
 * @param {string} characterName - character name
 * @param {string} [region] - optional region
 * @returns {object} scope
 */
export function createPovScope(characterName, region = '') {
    return normalizeMemoryScope({
        layer: SCOPE_LAYERS.POV,
        ownerKey: characterName,
        region,
    });
}

/**
 * Create an objective scope for world-truth memory
 * @param {string} [region] - optional region
 * @returns {object} scope
 */
export function createObjectiveScope(region = '') {
    return normalizeMemoryScope({
        layer: SCOPE_LAYERS.OBJECTIVE,
        region,
    });
}

// ==================== Scope Keys ====================

/**
 * Get normalized owner key from scope
 * @param {object} scope
 * @returns {string}
 */
export function getScopeOwnerKey(scope) {
    const normalized = normalizeMemoryScope(scope);
    return normalized.ownerKey || '';
}

/**
 * Get normalized region key from scope
 * @param {object} scope
 * @returns {string}
 */
export function getScopeRegionKey(scope) {
    const normalized = normalizeMemoryScope(scope);
    return normalized.region || '';
}

/**
 * Check if scope is an objective layer
 * @param {object} scope
 * @returns {boolean}
 */
export function isObjectiveScope(scope) {
    return normalizeMemoryScope(scope).layer === SCOPE_LAYERS.OBJECTIVE;
}

/**
 * Check if scope is a POV layer
 * @param {object} scope
 * @returns {boolean}
 */
export function isPovScope(scope) {
    return normalizeMemoryScope(scope).layer === SCOPE_LAYERS.POV;
}

// ==================== Bucket Classification ====================

/**
 * Classify a node into a scope bucket based on current context
 * Returns the bucket key + a weight multiplier for scoring
 *
 * @param {object} node - graph node
 * @param {string} activeOwnerKey - current active character's owner key
 * @param {string} activeRegion - current active region
 * @param {object} [settings] - scope settings
 * @returns {{ bucket: string, weight: number, reason: string }}
 */
export function classifyNodeScopeBucket(node, activeOwnerKey = '', activeRegion = '', settings = {}) {
    const scope = normalizeMemoryScope(node?.scope);
    const normalizedOwner = activeOwnerKey.trim().toLowerCase();
    const normalizedRegion = activeRegion.trim().toLowerCase();

    // POV layer
    if (scope.layer === SCOPE_LAYERS.POV) {
        if (!settings.enablePovMemory) {
            return { bucket: MEMORY_SCOPE_BUCKETS.EXCLUDED, weight: 0, reason: 'pov-disabled' };
        }

        if (scope.ownerKey === normalizedOwner) {
            return {
                bucket: MEMORY_SCOPE_BUCKETS.CHARACTER_POV,
                weight: settings.recallCharacterPovWeight ?? 1.25,
                reason: 'character-pov-match',
            };
        }

        // Check if this is the user's POV
        if (scope.ownerKey === 'user' || scope.ownerKey === '{{user}}') {
            return {
                bucket: MEMORY_SCOPE_BUCKETS.USER_POV,
                weight: settings.recallUserPovWeight ?? 1.05,
                reason: 'user-pov',
            };
        }

        // Other character's POV — lower weight but still accessible
        return {
            bucket: MEMORY_SCOPE_BUCKETS.CHARACTER_POV,
            weight: (settings.recallCharacterPovWeight ?? 1.25) * 0.5,
            reason: 'other-character-pov',
        };
    }

    // Objective layer — weight by region proximity
    if (scope.region && normalizedRegion) {
        if (scope.region === normalizedRegion) {
            return {
                bucket: MEMORY_SCOPE_BUCKETS.OBJECTIVE_CURRENT_REGION,
                weight: settings.recallObjectiveCurrentRegionWeight ?? 1.15,
                reason: 'objective-current-region',
            };
        }

        // Simple adjacency heuristic: regions sharing a word are "adjacent"
        const regionWords = new Set(normalizedRegion.split(/[\s,/]+/).filter(Boolean));
        const scopeWords = scope.region.split(/[\s,/]+/).filter(Boolean);
        const hasOverlap = scopeWords.some(w => regionWords.has(w));

        if (hasOverlap && settings.enableSpatialAdjacency !== false) {
            return {
                bucket: MEMORY_SCOPE_BUCKETS.OBJECTIVE_ADJACENT_REGION,
                weight: settings.recallObjectiveAdjacentRegionWeight ?? 0.9,
                reason: 'objective-adjacent-region',
            };
        }
    }

    // Global objective (no region or non-matching region)
    return {
        bucket: MEMORY_SCOPE_BUCKETS.OBJECTIVE_GLOBAL,
        weight: settings.recallObjectiveGlobalWeight ?? 0.75,
        reason: scope.region ? 'objective-distant-region' : 'objective-global',
    };
}

/**
 * Check if two nodes are in compatible scopes for merging
 * Same-scope or both objective nodes can be merged
 *
 * @param {object} nodeA
 * @param {object} nodeB
 * @returns {boolean}
 */
export function canMergeScopedMemories(nodeA, nodeB) {
    const scopeA = normalizeMemoryScope(nodeA?.scope);
    const scopeB = normalizeMemoryScope(nodeB?.scope);

    // Different layers cannot merge
    if (scopeA.layer !== scopeB.layer) return false;

    // POV nodes must belong to the same owner
    if (scopeA.layer === SCOPE_LAYERS.POV) {
        return scopeA.ownerKey === scopeB.ownerKey;
    }

    // Objective nodes can always merge (cross-region is OK)
    return true;
}

// ==================== Display Helpers ====================

/**
 * Build a badge text for scope display
 * @param {object} scope
 * @returns {string}
 */
export function buildScopeBadgeText(scope) {
    const normalized = normalizeMemoryScope(scope);
    if (normalized.layer === SCOPE_LAYERS.POV) {
        return `POV:${normalized.ownerKey || 'unknown'}`;
    }
    if (normalized.region) {
        return `Obj:${normalized.region}`;
    }
    return 'Obj:Global';
}

/**
 * Describe memory scope in natural language
 * @param {object} scope
 * @returns {string}
 */
export function describeMemoryScope(scope) {
    const normalized = normalizeMemoryScope(scope);
    if (normalized.layer === SCOPE_LAYERS.POV) {
        const owner = normalized.ownerKey || 'unknown';
        return `Ký ức chủ quan của ${owner}`;
    }
    if (normalized.region) {
        return `Sự thật khách quan tại ${normalized.region}`;
    }
    return 'Sự thật khách quan toàn cục';
}

/**
 * Describe a scope bucket in short label form
 * @param {string} bucket
 * @returns {string}
 */
export function describeScopeBucket(bucket) {
    switch (bucket) {
        case MEMORY_SCOPE_BUCKETS.CHARACTER_POV: return 'Character POV';
        case MEMORY_SCOPE_BUCKETS.USER_POV: return 'User POV';
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_CURRENT_REGION: return 'Current Region';
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_ADJACENT_REGION: return 'Adjacent Region';
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_GLOBAL: return 'Global';
        case MEMORY_SCOPE_BUCKETS.EXCLUDED: return 'Excluded';
        default: return 'Unknown';
    }
}

/**
 * Resolve the scope bucket weight multiplier
 * @param {string} bucket
 * @param {object} [settings]
 * @returns {number}
 */
export function resolveScopeBucketWeight(bucket, settings = {}) {
    switch (bucket) {
        case MEMORY_SCOPE_BUCKETS.CHARACTER_POV:
            return settings.recallCharacterPovWeight ?? 1.25;
        case MEMORY_SCOPE_BUCKETS.USER_POV:
            return settings.recallUserPovWeight ?? 1.05;
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_CURRENT_REGION:
            return settings.recallObjectiveCurrentRegionWeight ?? 1.15;
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_ADJACENT_REGION:
            return settings.recallObjectiveAdjacentRegionWeight ?? 0.9;
        case MEMORY_SCOPE_BUCKETS.OBJECTIVE_GLOBAL:
            return settings.recallObjectiveGlobalWeight ?? 0.75;
        case MEMORY_SCOPE_BUCKETS.EXCLUDED:
            return 0;
        default:
            return 1.0;
    }
}
