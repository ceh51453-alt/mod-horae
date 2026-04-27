/**
 * BME Engine — IndexedDB Persistence
 * Local database for graph state, independent of chat JSON
 * Uses raw IndexedDB (no Dexie dependency) with chat-scoped database names
 *
 * Ported from ST-BME sync/bme-db.js — simplified for Horae
 */

const DB_PREFIX = 'HoraeBME_';
const DB_VERSION = 1;
const STORE_GRAPH = 'graphState';
const STORE_NODES = 'nodes';
const STORE_EDGES = 'edges';
const STORE_META = 'meta';

const LOG_PREFIX = '[Horae BME DB]';

// ==================== Database Lifecycle ====================

/**
 * Open or create an IndexedDB database for a specific chat
 * @param {string} chatId - unique chat identifier
 * @returns {Promise<IDBDatabase>}
 */
export async function openBmeDb(chatId) {
    if (!chatId) throw new Error('chatId is required');

    const dbName = `${DB_PREFIX}${_sanitizeChatId(chatId)}`;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Graph state store (single document)
            if (!db.objectStoreNames.contains(STORE_GRAPH)) {
                db.createObjectStore(STORE_GRAPH, { keyPath: 'key' });
            }

            // Individual nodes store (for fast lookup)
            if (!db.objectStoreNames.contains(STORE_NODES)) {
                const nodeStore = db.createObjectStore(STORE_NODES, { keyPath: 'id' });
                nodeStore.createIndex('type', 'type', { unique: false });
                nodeStore.createIndex('archived', 'archived', { unique: false });
                nodeStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // Edges store
            if (!db.objectStoreNames.contains(STORE_EDGES)) {
                const edgeStore = db.createObjectStore(STORE_EDGES, { keyPath: 'id' });
                edgeStore.createIndex('sourceId', 'sourceId', { unique: false });
                edgeStore.createIndex('targetId', 'targetId', { unique: false });
            }

            // Metadata store (settings, stats, etc.)
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'key' });
            }

            console.log(`${LOG_PREFIX} Database ${dbName} created/upgraded to v${DB_VERSION}`);
        };

        request.onsuccess = () => {
            console.log(`${LOG_PREFIX} Database ${dbName} opened`);
            resolve(request.result);
        };

        request.onerror = () => {
            console.warn(`${LOG_PREFIX} Failed to open database ${dbName}:`, request.error);
            reject(request.error);
        };
    });
}

/**
 * Close a BME database connection
 * @param {IDBDatabase} db
 */
export function closeBmeDb(db) {
    if (db) {
        db.close();
        console.log(`${LOG_PREFIX} Database closed`);
    }
}

/**
 * Delete the BME database for a specific chat
 * @param {string} chatId
 * @returns {Promise<void>}
 */
export async function deleteBmeDb(chatId) {
    const dbName = `${DB_PREFIX}${_sanitizeChatId(chatId)}`;
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => {
            console.log(`${LOG_PREFIX} Database ${dbName} deleted`);
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// ==================== Graph Persistence ====================

/**
 * Save full graph state to IndexedDB
 * Stores graph metadata + individual nodes/edges for fast lookup
 *
 * @param {IDBDatabase} db
 * @param {object} graph - BME graph state
 * @returns {Promise<void>}
 */
export async function saveGraphToDb(db, graph) {
    if (!db || !graph) return;

    const tx = db.transaction([STORE_GRAPH, STORE_NODES, STORE_EDGES, STORE_META], 'readwrite');

    return new Promise((resolve, reject) => {
        // 1. Save graph metadata (version, lastProcessedSeq, timeline, knowledgeState, stats)
        const graphStore = tx.objectStore(STORE_GRAPH);
        graphStore.put({
            key: 'current',
            version: graph.version,
            lastProcessedSeq: graph.lastProcessedSeq,
            timeline: graph.timeline || [],
            knowledgeState: graph.knowledgeState || null,
            lastRecallResult: graph.lastRecallResult || null,
            consolidationStats: graph.consolidationStats || null,
            compressionStats: graph.compressionStats || null,
            savedAt: Date.now(),
        });

        // 2. Save nodes (clear + re-add)
        const nodeStore = tx.objectStore(STORE_NODES);
        nodeStore.clear();
        for (const node of graph.nodes) {
            nodeStore.put(node);
        }

        // 3. Save edges (clear + re-add)
        const edgeStore = tx.objectStore(STORE_EDGES);
        edgeStore.clear();
        for (const edge of graph.edges) {
            edgeStore.put(edge);
        }

        // 4. Save meta counters
        const metaStore = tx.objectStore(STORE_META);
        metaStore.put({
            key: 'counts',
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            activeNodeCount: graph.nodes.filter(n => !n.archived).length,
            lastSavedAt: Date.now(),
        });

        tx.oncomplete = () => {
            console.log(`${LOG_PREFIX} Graph saved (${graph.nodes.length} nodes, ${graph.edges.length} edges)`);
            resolve();
        };

        tx.onerror = () => {
            console.warn(`${LOG_PREFIX} Failed to save graph:`, tx.error);
            reject(tx.error);
        };
    });
}

/**
 * Load full graph state from IndexedDB
 * @param {IDBDatabase} db
 * @returns {Promise<object|null>} graph state, or null if not found
 */
export async function loadGraphFromDb(db) {
    if (!db) return null;

    try {
        const [graphMeta, nodes, edges] = await Promise.all([
            _getAll(db, STORE_GRAPH),
            _getAll(db, STORE_NODES),
            _getAll(db, STORE_EDGES),
        ]);

        const meta = graphMeta.find(g => g.key === 'current');
        if (!meta) return null;

        const graph = {
            version: meta.version || 1,
            lastProcessedSeq: meta.lastProcessedSeq ?? -1,
            nodes: nodes || [],
            edges: edges || [],
            timeline: meta.timeline || [],
            knowledgeState: meta.knowledgeState || null,
            lastRecallResult: meta.lastRecallResult || null,
            consolidationStats: meta.consolidationStats || null,
            compressionStats: meta.compressionStats || null,
        };

        console.log(`${LOG_PREFIX} Graph loaded from IDB (${graph.nodes.length} nodes, ${graph.edges.length} edges)`);
        return graph;
    } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to load graph from IDB:`, err);
        return null;
    }
}

// ==================== Incremental Operations ====================

/**
 * Save a single node to IndexedDB (incremental update)
 * @param {IDBDatabase} db
 * @param {object} node
 * @returns {Promise<void>}
 */
export async function saveNodeToDb(db, node) {
    if (!db || !node) return;
    return _put(db, STORE_NODES, node);
}

/**
 * Save multiple nodes to IndexedDB (batch update)
 * @param {IDBDatabase} db
 * @param {object[]} nodes
 * @returns {Promise<void>}
 */
export async function saveNodesToDb(db, nodes) {
    if (!db || !nodes?.length) return;

    const tx = db.transaction(STORE_NODES, 'readwrite');
    const store = tx.objectStore(STORE_NODES);

    return new Promise((resolve, reject) => {
        for (const node of nodes) {
            store.put(node);
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Get node count from metadata
 * @param {IDBDatabase} db
 * @returns {Promise<object>}
 */
export async function getDbStats(db) {
    if (!db) return { nodeCount: 0, edgeCount: 0, activeNodeCount: 0 };

    try {
        const meta = await _get(db, STORE_META, 'counts');
        return meta || { nodeCount: 0, edgeCount: 0, activeNodeCount: 0 };
    } catch {
        return { nodeCount: 0, edgeCount: 0, activeNodeCount: 0 };
    }
}

// ==================== Internal IDB Helpers ====================

/**
 * Get all records from an object store
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<object[]>}
 */
function _getAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a single record by key
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {*} key
 * @returns {Promise<object|null>}
 */
function _get(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Put a record into an object store
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<void>}
 */
function _put(db, storeName, record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Sanitize chat ID for use as database name
 * @param {string} chatId
 * @returns {string}
 */
function _sanitizeChatId(chatId) {
    return String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}
