/**
 * BME Engine — Memory Dynamics
 * Ported from ST-BME: access reinforcement, time decay, hybrid scoring
 *
 * Implements the memory lifecycle model from PeroCore's cognitive engine:
 * - Access reinforcement: recalled nodes gain importance
 * - Logarithmic time decay: old-but-important memories don't vanish too fast
 * - Hybrid scoring: merges graph energy, vector similarity, lexical overlap, and importance
 * - Edge weight decay: inactive edges gradually weaken
 */

/**
 * Access reinforcement: called when a node is recalled/injected
 * - accessCount += 1
 * - importance += 0.1 (capped at 10)
 * - lastAccessTime updated
 *
 * @param {object} node - graph node to reinforce
 */
export function reinforceAccess(node) {
    node.accessCount = (node.accessCount || 0) + 1;
    node.importance = Math.min(10, (node.importance || 5) + 0.1);
    node.lastAccessTime = Date.now();
}

/**
 * Compute time decay factor using logarithmic decay (PeroCore-style)
 * instead of exponential decay:
 *   factor = 0.8 + 0.2 / (1 + ln(1 + Δt_days))
 *
 * Properties: old-but-important memories don't disappear too fast
 * - Δt = 0 days  → factor = 1.0
 * - Δt = 1 day   → factor ≈ 0.93
 * - Δt = 7 days  → factor ≈ 0.89
 * - Δt = 30 days → factor ≈ 0.85
 * - Δt = 365 days → factor ≈ 0.83
 *
 * @param {number} createdTime - creation timestamp (ms)
 * @param {number} [now] - current timestamp (ms)
 * @returns {number} decay factor [0.8, 1.0]
 */
export function timeDecayFactor(createdTime, now = Date.now()) {
    const deltaDays = Math.max(0, (now - createdTime) / (1000 * 60 * 60 * 24));
    return 0.8 + 0.2 / (1 + Math.log(1 + deltaDays));
}

/**
 * Hybrid scoring formula
 *   FinalScore = (GraphScore×α + VecScore×β + LexicalScore×δ + ImportanceNorm×γ) × TimeDecay
 *
 * Default weights: α=0.6, β=0.3, γ=0.1, δ=0
 *
 * @param {object} params
 * @param {number} params.graphScore - graph diffusion energy [0, 2]
 * @param {number} params.vectorScore - vector similarity [0, 1]
 * @param {number} params.lexicalScore - lexical overlap [0, 1]
 * @param {number} params.importance - node importance [0, 10]
 * @param {number} params.createdTime - node creation time
 * @param {object} [weights] - weight configuration
 * @returns {number} final score
 */
export function hybridScore({
    graphScore = 0,
    vectorScore = 0,
    lexicalScore = 0,
    importance = 5,
    createdTime = Date.now(),
}, weights = {}) {
    const alpha = weights.graphWeight ?? 0.6;
    const beta = weights.vectorWeight ?? 0.3;
    const gamma = weights.importanceWeight ?? 0.1;
    const delta = weights.lexicalWeight ?? 0;

    // Normalize to [0, 1]
    const normGraph = Math.max(0, Math.min(1, graphScore / 2.0)); // PEDSA energy range [-2, 2] → [0, 1]
    const normVec = Math.max(0, Math.min(1, vectorScore));
    const normLexical = Math.max(0, Math.min(1, lexicalScore));
    const normImportance = Math.max(0, Math.min(1, importance / 10.0));
    const totalWeight = Math.max(
        1e-6,
        Math.max(0, alpha) + Math.max(0, beta) + Math.max(0, gamma) + Math.max(0, delta),
    );

    const baseScore =
        (normGraph * alpha +
            normVec * beta +
            normLexical * delta +
            normImportance * gamma) /
        totalWeight;
    const decay = timeDecayFactor(createdTime);

    return baseScore * decay;
}

/**
 * Edge weight decay: inactive edges lose strength over time
 * Minimum strength is 0.1 (never reaches 0)
 *
 * @param {object[]} edges - array of graph edges
 * @param {Set<string>} activatedEdgeIds - IDs of recently activated edges (on diffusion path)
 * @param {number} [decayRate=0.02] - decay amount per call
 */
export function decayEdgeWeights(edges, activatedEdgeIds = new Set(), decayRate = 0.02) {
    for (const edge of edges) {
        if (activatedEdgeIds.has(edge.id)) {
            // Activated edges get slightly reinforced
            edge.strength = Math.min(1.0, edge.strength + decayRate * 0.5);
        } else {
            // Inactive edges decay slightly
            edge.strength = Math.max(0.1, edge.strength - decayRate);
        }
    }
}

/**
 * Batch access reinforcement for recalled nodes
 * @param {object[]} nodes - list of recalled nodes
 */
export function reinforceAccessBatch(nodes) {
    for (const node of nodes) {
        reinforceAccess(node);
    }
}
