/**
 * BME Engine — Maintenance Runner
 * Orchestrates consolidation and compression in the background
 */

import { loadGraphFromChat, saveGraphToChat } from './bme-bridge.js';
import { runConsolidation, analyzeAutoConsolidationGate } from './consolidator.js';
import { compress, sleepCycle } from './compressor.js';

const LOG_PREFIX = '[Horae BME Maintenance]';

let isMaintenanceRunning = false;

/**
 * Triggers background maintenance for the BME graph
 * Runs sleep cycle immediately, then checks if consolidation/compression is needed
 *
 * @param {object[]} chat - SillyTavern chat array
 * @param {object} settings - Horae settings
 * @param {object} tools - { getEmbedding, callLLM, saveChat }
 */
export async function triggerBmeMaintenance(chat, settings, tools) {
    if (!settings.bmeEnabled || isMaintenanceRunning) return;
    
    isMaintenanceRunning = true;
    try {
        const graph = await loadGraphFromChat(chat, { useIdb: true, chatId: tools.chatId });
        let graphModified = false;

        // 1. Always run Sleep Cycle (Active Forgetting)
        if (settings.bmeSleepEnabled !== false) {
            const sleepStats = sleepCycle(graph, settings);
            if (sleepStats.forgotten > 0) graphModified = true;
        }

        // 2. Consolidation check
        if (settings.bmeConsolidationEnabled !== false && tools.getEmbedding) {
            // Find nodes that need consolidation (recent nodes that haven't been checked)
            const recentUnconsolidatedNodes = graph.nodes
                .filter(n => !n.archived && n.level === 0 && !n.parentId && n.seq >= graph.lastProcessedSeq - 20)
                .map(n => n.id);
                
            if (recentUnconsolidatedNodes.length > 0) {
                const needsConsolidation = await analyzeAutoConsolidationGate(graph, recentUnconsolidatedNodes, {
                    getEmbedding: tools.getEmbedding,
                    settings
                });
                
                if (needsConsolidation) {
                    const stats = await runConsolidation(graph, recentUnconsolidatedNodes, {
                        getEmbedding: tools.getEmbedding,
                        callLLM: tools.callLLM,
                        settings
                    });
                    if (stats.merged > 0 || stats.evolved > 0) graphModified = true;
                }
            }
        }

        // 3. Compression check (Summarization)
        if (settings.bmeCompressionEnabled !== false) {
            const compressStats = await compress(graph, {
                callLLM: tools.callLLM,
                settings
            });
            if (compressStats.compressed > 0) graphModified = true;
        }

        // Save if any changes were made
        if (graphModified) {
            await saveGraphToChat(chat, graph, { useIdb: true, chatId: tools.chatId });
            if (tools.saveChat) await tools.saveChat();
            console.log(`${LOG_PREFIX} Maintenance complete, graph saved.`);
        }

    } catch (err) {
        console.error(`${LOG_PREFIX} Maintenance error:`, err);
    } finally {
        isMaintenanceRunning = false;
    }
}
