/**
 * BME Engine — PEDSA Diffusion Algorithm
 * Ported from ST-BME: Parallel Energy-Decay Spreading Activation
 *
 * Core formula: E_{t+1}(j) = Σ_{i∈N(j)} E_t(i) × W_ij × D_decay
 *
 * Features:
 * - Energy decay: each propagation step multiplied by decay factor
 * - Dynamic pruning: only top-K active nodes kept per step
 * - Inhibitory edges: special edge type propagates negative energy
 * - Energy clamping: constrained to [-2.0, 2.0]
 */

/** Inhibitory edge type marker */
const INHIBIT_EDGE_TYPE = 255;

/** Default diffusion configuration */
const DEFAULT_OPTIONS = {
    maxSteps: 2,            // max diffusion steps
    decayFactor: 0.6,       // energy decay per step
    topK: 100,              // max active nodes retained per step
    minEnergy: 0.01,        // minimum valid energy (below = inactive)
    maxEnergy: 2.0,         // energy upper bound
    minEnergy_clamp: -2.0,  // energy lower bound (inhibition)
    teleportAlpha: 0.0,     // PPR-style pull-back probability
    inhibitMultiplier: 2.0, // negative propagation multiplier for inhibitory edges
};

/**
 * Execute PEDSA spreading activation
 *
 * @param {Map<string, Array<{targetId: string, strength: number, edgeType: number}>>} adjacencyMap
 *   Adjacency table: nodeId → [{targetId, strength, edgeType}]
 *
 * @param {Array<{id: string, energy: number}>} seedNodes
 *   Initial seed nodes and their energies
 *   - Vector-matched nodes: energy = vectorScore (0~1)
 *   - Entity anchor nodes: energy = 2.0 (max)
 *
 * @param {object} [options] - Configuration overrides
 *
 * @returns {Map<string, number>} Final energy of all activated nodes
 *   nodeId → energy (positive = activated, negative = inhibited)
 */
export function propagateActivation(adjacencyMap, seedNodes, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const teleportAlpha = clamp01(opts.teleportAlpha);

    /** @type {Map<string, number>} */
    let currentEnergy = new Map();
    /** @type {Map<string, number>} */
    const initialEnergy = new Map();

    for (const seed of seedNodes || []) {
        if (!seed?.id) continue;
        const clamped = clampEnergy(Number(seed.energy) || 0, opts);
        if (Math.abs(clamped) >= opts.minEnergy) {
            const existing = currentEnergy.get(seed.id) || 0;
            const next = clampEnergy(existing + clamped, opts);
            currentEnergy.set(seed.id, next);
            initialEnergy.set(seed.id, next);
        }
    }

    // Accumulated result (max absolute energy across all steps)
    /** @type {Map<string, number>} */
    const result = new Map(currentEnergy);

    // Step 1~N: stepwise diffusion
    for (let step = 0; step < opts.maxSteps; step++) {
        /** @type {Map<string, number>} */
        const nextEnergy = new Map();

        // For each currently active node, propagate energy to neighbors
        for (const [nodeId, energy] of currentEnergy) {
            const neighbors = adjacencyMap.get(nodeId);
            if (!Array.isArray(neighbors) || neighbors.length === 0) continue;

            for (const neighbor of neighbors) {
                if (!neighbor?.targetId) continue;
                let propagated =
                    energy *
                    (Number(neighbor.strength) || 0) *
                    opts.decayFactor *
                    (1 - teleportAlpha);

                // Inhibitory edge: propagate negative energy
                if (neighbor.edgeType === INHIBIT_EDGE_TYPE) {
                    propagated =
                        -Math.abs(energy) *
                        (Number(neighbor.strength) || 0) *
                        opts.decayFactor *
                        (Number(opts.inhibitMultiplier) || 1);
                }

                // Accumulate into neighbor
                const existing = nextEnergy.get(neighbor.targetId) || 0;
                nextEnergy.set(neighbor.targetId, existing + propagated);
            }
        }

        // Clamp + filter low energy
        for (const [nodeId, energy] of nextEnergy) {
            const clamped = clampEnergy(energy, opts);
            if (Math.abs(clamped) < opts.minEnergy) {
                nextEnergy.delete(nodeId);
            } else {
                nextEnergy.set(nodeId, clamped);
            }
        }

        // PPR teleportation
        if (teleportAlpha > 0) {
            for (const [nodeId, seedEnergy] of initialEnergy) {
                const current = nextEnergy.get(nodeId) || 0;
                const teleported =
                    (1 - teleportAlpha) * current + teleportAlpha * seedEnergy;
                const clamped = clampEnergy(teleported, opts);
                if (Math.abs(clamped) >= opts.minEnergy) {
                    nextEnergy.set(nodeId, clamped);
                } else {
                    nextEnergy.delete(nodeId);
                }
            }
        }

        // Dynamic pruning: keep only top-K
        if (nextEnergy.size > opts.topK) {
            const sorted = [...nextEnergy.entries()].sort(
                (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
            );
            nextEnergy.clear();
            for (let i = 0; i < opts.topK && i < sorted.length; i++) {
                nextEnergy.set(sorted[i][0], sorted[i][1]);
            }
        }

        // Update accumulated result (keep max absolute value across steps)
        for (const [nodeId, energy] of nextEnergy) {
            const existing = result.get(nodeId) || 0;
            if (Math.abs(energy) > Math.abs(existing)) {
                result.set(nodeId, energy);
            }
        }

        // Prepare for next step
        currentEnergy = nextEnergy;

        // Early termination if no active nodes remain
        if (currentEnergy.size === 0) break;
    }

    return result;
}

/**
 * Clamp energy within configured bounds
 * @param {number} energy
 * @param {object} opts
 * @returns {number}
 */
function clampEnergy(energy, opts) {
    return Math.max(opts.minEnergy_clamp, Math.min(opts.maxEnergy, energy));
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * Convenience: diffuse from seed list and return energy-ranked results
 *
 * @param {Map} adjacencyMap - adjacency table
 * @param {Array<{id: string, energy: number}>} seeds - seed nodes
 * @param {object} [options]
 * @returns {Array<{nodeId: string, energy: number}>} sorted descending by energy
 */
export function diffuseAndRank(adjacencyMap, seeds, options = {}) {
    const energyMap = propagateActivation(adjacencyMap, seeds, options);

    return [...energyMap.entries()]
        .filter(([_, energy]) => energy > 0)
        .map(([nodeId, energy]) => ({ nodeId, energy }))
        .sort((a, b) => {
            if (b.energy !== a.energy) return b.energy - a.energy;
            return String(a.nodeId).localeCompare(String(b.nodeId));
        });
}
