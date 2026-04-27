/**
 * BME Engine — Story Timeline
 * Manages narrative time segments, story time per node, and temporal bucket weighting
 * Provides compatibility checks for merge/compression guards
 *
 * Ported from ST-BME graph/story-timeline.js — adapted for Horae's timestamp model
 */

// ==================== Constants ====================

export const STORY_TEMPORAL_BUCKETS = {
    CURRENT: 'current',
    ADJACENT: 'adjacent',
    NEAR_PAST: 'nearPast',
    DISTANT_PAST: 'distantPast',
    FUTURE: 'future',
    FLASHBACK: 'flashback',
    UNKNOWN: 'unknown',
};

const TEMPORAL_BUCKET_WEIGHTS = {
    [STORY_TEMPORAL_BUCKETS.CURRENT]: 1.0,
    [STORY_TEMPORAL_BUCKETS.ADJACENT]: 0.85,
    [STORY_TEMPORAL_BUCKETS.NEAR_PAST]: 0.65,
    [STORY_TEMPORAL_BUCKETS.DISTANT_PAST]: 0.35,
    [STORY_TEMPORAL_BUCKETS.FUTURE]: 0.25,
    [STORY_TEMPORAL_BUCKETS.FLASHBACK]: 0.45,
    [STORY_TEMPORAL_BUCKETS.UNKNOWN]: 0.5,
};

const TENSE = { PAST: 'past', PRESENT: 'present', FUTURE: 'future' };

// ==================== Timeline Segments ====================

/**
 * Create a timeline segment
 * @param {object} params
 * @returns {object} timeline segment
 */
export function createTimelineSegment({
    label = '',
    sortKey = 0,
    storyDate = '',
    storyTime = '',
    tense = TENSE.PRESENT,
    anchorSeq = null,
} = {}) {
    return {
        id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        label: label || `Segment ${sortKey}`,
        sortKey,
        storyDate,
        storyTime,
        tense,
        anchorSeq,
        createdAt: Date.now(),
    };
}

/**
 * Upsert a timeline segment into graph.timeline (dedup by sortKey + storyDate)
 * @param {object} graph - BME graph state
 * @param {object} segment
 * @returns {object} the created or existing segment
 */
export function upsertTimelineSegment(graph, segment) {
    if (!graph.timeline) graph.timeline = [];

    // Deduplicate by same sortKey OR same storyDate (if non-empty)
    const existing = graph.timeline.find(s =>
        s.sortKey === segment.sortKey ||
        (segment.storyDate && s.storyDate === segment.storyDate),
    );

    if (existing) {
        // Update label and time if newer
        if (segment.label) existing.label = segment.label;
        if (segment.storyTime) existing.storyTime = segment.storyTime;
        if (segment.anchorSeq !== null) existing.anchorSeq = segment.anchorSeq;
        return existing;
    }

    graph.timeline.push(segment);
    graph.timeline.sort((a, b) => a.sortKey - b.sortKey);
    return segment;
}

/**
 * Get all timeline segments, sorted by sortKey
 * @param {object} graph
 * @returns {object[]}
 */
export function getTimelineSegments(graph) {
    return (graph.timeline || []).slice().sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * Find the active (most recent) timeline segment
 * @param {object} graph
 * @returns {object|null}
 */
export function resolveActiveStoryContext(graph) {
    const segments = getTimelineSegments(graph);
    return segments.length > 0 ? segments[segments.length - 1] : null;
}

// ==================== Story Time Per Node ====================

/**
 * Normalize raw story time into a clean object
 * @param {object} [raw]
 * @returns {object} normalized story time
 */
export function normalizeStoryTime(raw) {
    if (!raw || typeof raw !== 'object') {
        return { segmentId: null, label: '', tense: TENSE.PRESENT, relation: '' };
    }
    return {
        segmentId: raw.segmentId || null,
        label: String(raw.label || ''),
        tense: Object.values(TENSE).includes(raw.tense) ? raw.tense : TENSE.PRESENT,
        relation: String(raw.relation || ''),
    };
}

/**
 * Derive story time from Horae's timestamp fields
 * @param {object} horaeMeta - message's horae_meta
 * @param {object} graph - BME graph state
 * @param {number} seq - message index
 * @returns {object} story time
 */
export function deriveStoryTimeFromHoraeMeta(horaeMeta, graph, seq) {
    const ts = horaeMeta?.timestamp;
    if (!ts) return normalizeStoryTime(null);

    const storyDate = ts.story_date || '';
    const storyTime = ts.story_time || '';

    // Find or create a timeline segment for this date
    let segment = null;
    if (storyDate) {
        const sortKey = parseDateToSortKey(storyDate);
        segment = upsertTimelineSegment(graph, createTimelineSegment({
            label: buildSegmentLabel(storyDate, storyTime),
            sortKey,
            storyDate,
            storyTime,
            anchorSeq: seq,
        }));
    }

    return normalizeStoryTime({
        segmentId: segment?.id || null,
        label: storyDate ? `${storyDate} ${storyTime}`.trim() : '',
        tense: TENSE.PRESENT,
        relation: '',
    });
}

/**
 * Derive a story time span from a group of nodes
 * @param {object[]} nodes
 * @returns {{ start: string, end: string }}
 */
export function deriveStoryTimeSpanFromNodes(nodes) {
    const labels = nodes
        .map(n => n.storyTime?.label)
        .filter(Boolean)
        .sort();

    if (labels.length === 0) return { start: '', end: '' };
    return { start: labels[0], end: labels[labels.length - 1] };
}

// ==================== Temporal Bucket Classification ====================

/**
 * Classify a node into a story temporal bucket relative to the active segment
 * Returns the bucket key for scoring purposes
 *
 * @param {object} graph
 * @param {object} node
 * @param {string|null} activeSegmentId
 * @returns {string} bucket key from STORY_TEMPORAL_BUCKETS
 */
export function classifyStoryTemporalBucket(graph, node, activeSegmentId = null) {
    const nodeStoryTime = normalizeStoryTime(node?.storyTime);

    // No story time data → unknown
    if (!nodeStoryTime.segmentId && !nodeStoryTime.label) {
        return STORY_TEMPORAL_BUCKETS.UNKNOWN;
    }

    // Flashback detection
    if (nodeStoryTime.tense === TENSE.PAST && nodeStoryTime.relation === 'flashback') {
        return STORY_TEMPORAL_BUCKETS.FLASHBACK;
    }

    // Future tense
    if (nodeStoryTime.tense === TENSE.FUTURE) {
        return STORY_TEMPORAL_BUCKETS.FUTURE;
    }

    // No active segment to compare against → treat as current
    if (!activeSegmentId) {
        return STORY_TEMPORAL_BUCKETS.CURRENT;
    }

    // Same segment → current
    if (nodeStoryTime.segmentId === activeSegmentId) {
        return STORY_TEMPORAL_BUCKETS.CURRENT;
    }

    // Compare sort keys to determine temporal distance
    const segments = getTimelineSegments(graph);
    const activeIdx = segments.findIndex(s => s.id === activeSegmentId);
    const nodeIdx = segments.findIndex(s => s.id === nodeStoryTime.segmentId);

    if (activeIdx === -1 || nodeIdx === -1) {
        return STORY_TEMPORAL_BUCKETS.UNKNOWN;
    }

    const distance = activeIdx - nodeIdx;

    if (distance === 1 || distance === -1) return STORY_TEMPORAL_BUCKETS.ADJACENT;
    if (distance >= 2 && distance <= 5) return STORY_TEMPORAL_BUCKETS.NEAR_PAST;
    if (distance > 5) return STORY_TEMPORAL_BUCKETS.DISTANT_PAST;
    if (distance < -1) return STORY_TEMPORAL_BUCKETS.FUTURE;

    return STORY_TEMPORAL_BUCKETS.UNKNOWN;
}

/**
 * Get the weight multiplier for a temporal bucket
 * @param {string} bucket
 * @param {object} [settings]
 * @returns {number}
 */
export function resolveTemporalBucketWeight(bucket, settings = {}) {
    const customWeights = settings.temporalBucketWeights || {};
    return customWeights[bucket] ?? TEMPORAL_BUCKET_WEIGHTS[bucket] ?? 0.5;
}

// ==================== Story Time Compatibility ====================

/**
 * Check if two nodes are in compatible story time for merging
 * Same segment or unknown-segment nodes can merge
 *
 * @param {object} nodeA
 * @param {object} nodeB
 * @returns {boolean}
 */
export function isStoryTimeCompatible(nodeA, nodeB) {
    const stA = normalizeStoryTime(nodeA?.storyTime);
    const stB = normalizeStoryTime(nodeB?.storyTime);

    // Unknown segments are always compatible
    if (!stA.segmentId || !stB.segmentId) return true;

    // Same segment
    return stA.segmentId === stB.segmentId;
}

// ==================== Display Helpers ====================

/**
 * Describe a node's story time for display
 * @param {object} node
 * @returns {string}
 */
export function describeNodeStoryTime(node) {
    const st = normalizeStoryTime(node?.storyTime);
    if (st.label) return st.label;
    if (st.relation) return st.relation;
    return 'Thời gian không xác định';
}

/**
 * Describe story cue mode for active context
 * @param {object} graph
 * @returns {string}
 */
export function resolveStoryCueMode(graph) {
    const active = resolveActiveStoryContext(graph);
    if (!active) return 'Không có dòng thời gian';
    return `Hiện tại: ${active.label || 'Không rõ'}`;
}

/**
 * Apply batch story time to multiple nodes
 * @param {object[]} nodes
 * @param {object} storyTime
 */
export function applyBatchStoryTime(nodes, storyTime) {
    const normalized = normalizeStoryTime(storyTime);
    for (const node of nodes) {
        if (!node.storyTime?.segmentId) {
            node.storyTime = { ...normalized };
        }
    }
}

/**
 * Create a story time span from explicit start/end dates
 * @param {object} storyTime
 * @returns {object}
 */
export function createSpanFromStoryTime(storyTime) {
    const normalized = normalizeStoryTime(storyTime);
    return {
        start: normalized.label,
        end: normalized.label,
        segmentId: normalized.segmentId,
    };
}

// ==================== Internal Helpers ====================

/**
 * Parse a story date string into a numeric sort key
 * Supports formats: "10/1", "Day 3", "三月五日", "2024-03-15"
 * @param {string} dateStr
 * @returns {number}
 */
function parseDateToSortKey(dateStr) {
    if (!dateStr) return 0;

    // ISO date
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return parseInt(isoMatch[1]) * 10000 + parseInt(isoMatch[2]) * 100 + parseInt(isoMatch[3]);
    }

    // M/D format
    const slashMatch = dateStr.match(/(\d+)\/(\d+)/);
    if (slashMatch) {
        return parseInt(slashMatch[1]) * 100 + parseInt(slashMatch[2]);
    }

    // "Day N" format
    const dayMatch = dateStr.match(/Day\s+(\d+)/i);
    if (dayMatch) {
        return parseInt(dayMatch[1]);
    }

    // Fallback: hash the string
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 100000;
}

/**
 * Build a human-readable segment label from date/time
 * @param {string} storyDate
 * @param {string} storyTime
 * @returns {string}
 */
function buildSegmentLabel(storyDate, storyTime) {
    const parts = [];
    if (storyDate) parts.push(storyDate);
    if (storyTime) parts.push(storyTime);
    return parts.join(' — ') || 'Unknown';
}
