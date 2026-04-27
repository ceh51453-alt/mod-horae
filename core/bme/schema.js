/**
 * BME Engine — Node Type Schema (v2)
 * Defines supported node types, fields, edge types, and compression modes
 * Extended with memory scope, story timeline, and cognitive node types
 */

export const COMPRESSION_MODE = { NONE: 'none', HIERARCHICAL: 'hierarchical' };

export const EDGE_TYPES = {
    TEMPORAL: 'temporal',
    PARTICIPATED: 'participated',
    OCCURRED_AT: 'occurred_at',
    CO_OCCURRED: 'co_occurred',
    CAUSAL: 'causal',
    INHIBIT: 'inhibit',
    RELATED: 'related',
    SUPERSEDES: 'supersedes',
    COMPRESSED_FROM: 'compressed_from',
    SUPPORTS: 'supports',
    CONTRADICTS: 'contradicts',
};

export const EDGE_TYPE_CODES = { NORMAL: 0, INHIBIT: 255 };

/**
 * Relation types used by the consolidator for edge evolution
 */
export const RELATION_TYPES = [
    'temporal', 'participated', 'occurred_at', 'co_occurred',
    'causal', 'inhibit', 'related', 'supersedes', 'compressed_from',
    'supports', 'contradicts',
];

/**
 * Memory scope layers
 */
export const SCOPE_LAYERS = {
    OBJECTIVE: 'objective',
    POV: 'pov',
};

export const DEFAULT_NODE_SCHEMA = [
    // === Core types ===
    {
        id: 'event', label: 'Event',
        columns: [
            { name: 'title', required: false },
            { name: 'summary', required: true },
            { name: 'participants', required: false },
            { name: 'status', required: false },
            { name: 'level', required: false },
        ],
        // Keep backward compat — 'fields' alias for 'columns'
        get fields() { return this.columns; },
        alwaysInject: true, latestOnly: false,
        compression: { mode: COMPRESSION_MODE.HIERARCHICAL, threshold: 9, fanIn: 3, maxDepth: 2, keepRecentLeaves: 2 },
    },
    {
        id: 'character', label: 'Character',
        columns: [
            { name: 'name', required: true },
            { name: 'traits', required: false },
            { name: 'state', required: false },
            { name: 'relationship', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: false, latestOnly: true,
        compression: { mode: COMPRESSION_MODE.NONE },
    },
    {
        id: 'location', label: 'Location',
        columns: [
            { name: 'name', required: true },
            { name: 'state', required: false },
            { name: 'features', required: false },
            { name: 'atmosphere', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: false, latestOnly: true,
        compression: { mode: COMPRESSION_MODE.NONE },
    },

    // === Extended cognitive types (Phase 2) ===
    {
        id: 'rule', label: 'Rule',
        columns: [
            { name: 'name', required: true },
            { name: 'description', required: true },
            { name: 'scope', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: true, latestOnly: true,
        compression: { mode: COMPRESSION_MODE.NONE },
    },
    {
        id: 'thread', label: 'Thread',
        columns: [
            { name: 'title', required: true },
            { name: 'summary', required: true },
            { name: 'status', required: false }, // active / resolved / abandoned
            { name: 'participants', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: true, latestOnly: false,
        compression: { mode: COMPRESSION_MODE.NONE },
    },
    {
        id: 'synopsis', label: 'Synopsis',
        columns: [
            { name: 'title', required: false },
            { name: 'summary', required: true },
            { name: 'period', required: false }, // e.g. "messages 10-30"
        ],
        get fields() { return this.columns; },
        alwaysInject: false, latestOnly: false,
        compression: { mode: COMPRESSION_MODE.HIERARCHICAL, threshold: 5, fanIn: 3, maxDepth: 1 },
    },
    {
        id: 'reflection', label: 'Reflection',
        columns: [
            { name: 'insight', required: true },
            { name: 'triggers', required: false }, // what prompted this reflection
            { name: 'confidence', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: false, latestOnly: false,
        compression: { mode: COMPRESSION_MODE.NONE },
    },
    {
        id: 'pov_memory', label: 'POV Memory',
        columns: [
            { name: 'owner', required: true }, // character name
            { name: 'summary', required: true },
            { name: 'emotion', required: false },
            { name: 'perspective', required: false },
        ],
        get fields() { return this.columns; },
        alwaysInject: false, latestOnly: false,
        compression: { mode: COMPRESSION_MODE.HIERARCHICAL, threshold: 12, fanIn: 4, maxDepth: 1 },
    },
];

/**
 * Get schema definition for a node type
 * @param {string} typeId
 * @returns {object|null}
 */
export function getSchemaForType(typeId) {
    return DEFAULT_NODE_SCHEMA.find(s => s.id === typeId) || null;
}

/**
 * Get all valid node type IDs
 * @returns {string[]}
 */
export function getValidNodeTypes() {
    return DEFAULT_NODE_SCHEMA.map(s => s.id);
}

/**
 * Check if a node type supports hierarchical compression
 * @param {string} typeId
 * @returns {boolean}
 */
export function isCompressibleType(typeId) {
    const schema = getSchemaForType(typeId);
    return schema?.compression?.mode === COMPRESSION_MODE.HIERARCHICAL;
}

/**
 * Get types that should always be injected into recall
 * @returns {string[]}
 */
export function getAlwaysInjectTypes() {
    return DEFAULT_NODE_SCHEMA.filter(s => s.alwaysInject).map(s => s.id);
}

/**
 * Get types that follow latestOnly semantics (only most recent instance retained)
 * @returns {string[]}
 */
export function getLatestOnlyTypes() {
    return DEFAULT_NODE_SCHEMA.filter(s => s.latestOnly).map(s => s.id);
}
