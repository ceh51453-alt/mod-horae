/**
 * BME Graph Visualizer
 * Dynamically loads vis-network to render the cognitive memory graph
 */

const VIS_CDN = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';

let isVisLoaded = false;
let isVisLoading = false;

/**
 * Ensures vis-network is loaded into the page.
 */
function loadVisLibrary() {
    return new Promise((resolve, reject) => {
        if (window.vis || isVisLoaded) {
            resolve();
            return;
        }
        if (isVisLoading) {
            // Wait for it to finish loading
            const checkInterval = setInterval(() => {
                if (window.vis) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            return;
        }

        isVisLoading = true;
        const script = document.createElement('script');
        script.src = VIS_CDN;
        script.type = 'text/javascript';
        script.onload = () => {
            isVisLoaded = true;
            isVisLoading = false;
            resolve();
        };
        script.onerror = (e) => {
            isVisLoading = false;
            console.error('[BME Visualizer] Failed to load vis-network script', e);
            reject(new Error('Failed to load vis-network library.'));
        };
        document.head.appendChild(script);
    });
}

/**
 * Prepares the graph data for vis-network format
 */
function prepareGraphData(graph) {
    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();

    const STYLES = {
        LEVEL_0: { background: '#2c3e50', border: '#34495e', font: '#ecf0f1' },
        LEVEL_1: { background: '#8e44ad', border: '#9b59b6', font: '#ffffff' },
        ARCHIVED: { background: '#2b2b2b', border: '#444444', font: '#7f8c8d' },
    };

    graph.nodes.forEach(node => {
        // Truncate content for label
        let labelText = node.content;
        if (labelText && labelText.length > 50) {
            labelText = labelText.substring(0, 47) + '...';
        }

        let style = node.level > 0 ? STYLES.LEVEL_1 : STYLES.LEVEL_0;
        let opacity = 1;

        if (node.archived) {
            style = STYLES.ARCHIVED;
            opacity = 0.6;
        }

        // Include node ID in the title (tooltip)
        let titleHtml = `
            <div style="max-width: 300px; white-space: pre-wrap; font-family: sans-serif; font-size: 12px; color: #fff;">
                <b>ID:</b> ${node.id}<br/>
                <b>Level:</b> ${node.level}<br/>
                <b>Archived:</b> ${!!node.archived}<br/>
                <b>Energy:</b> ${(node.energy || 0).toFixed(3)}<br/>
                <b>StoryTime:</b> ${node.storyTime || 'Unknown'}<br/>
                <b>Scope:</b> ${node.scope || 'Global'}<br/>
                <hr style="border-color: #555;"/>
                ${node.content}
            </div>
        `;

        nodes.add({
            id: node.id,
            label: labelText,
            title: titleHtml,
            shape: 'box',
            color: {
                background: style.background,
                border: style.border,
                highlight: {
                    background: '#2980b9',
                    border: '#3498db'
                }
            },
            font: { color: style.font, face: 'monospace', size: 12 },
            borderWidth: 2,
            opacity: opacity,
            shadow: true,
            margin: 10
        });
    });

    graph.edges.forEach(edge => {
        edges.add({
            id: edge.id,
            from: edge.source,
            to: edge.target,
            label: edge.type,
            font: { size: 10, color: '#aaa', align: 'horizontal' },
            color: { color: '#666', highlight: '#3498db' },
            arrows: {
                to: { enabled: true, scaleFactor: 0.5, type: 'arrow' }
            },
            dashes: edge.type === 'TEMPORAL' ? true : false,
            smooth: { type: 'continuous' }
        });
    });

    return { nodes, edges };
}

/**
 * Opens a full-screen modal to render the vis-network graph
 * @param {Object} graph - The Horae BME Graph object
 */
export async function openGraphModal(graph) {
    try {
        await loadVisLibrary();
    } catch (err) {
        if (window.toastr) {
            window.toastr.error('Failed to load vis-network for Graph Visualization.');
        }
        return;
    }

    if (!graph || !graph.nodes) {
        if (window.toastr) {
            window.toastr.warning('Graph is empty or not loaded.');
        }
        return;
    }

    // 1. Create Modal Container
    const modalId = 'horae-bme-vis-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        Object.assign(modal.style, {
            position: 'fixed',
            top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(10, 10, 15, 0.95)',
            zIndex: '99999',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'sans-serif'
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '12px 20px',
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff'
        });
        
        const title = document.createElement('h3');
        title.style.margin = '0';
        title.innerHTML = '<i class="fa-solid fa-diagram-project"></i> BME Cognitive Memory Graph';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Close';
        Object.assign(closeBtn.style, {
            background: 'transparent', border: '1px solid #555',
            color: '#fff', padding: '6px 12px', borderRadius: '4px',
            cursor: 'pointer'
        });
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Network Container
        const networkContainer = document.createElement('div');
        networkContainer.id = 'horae-bme-vis-container';
        Object.assign(networkContainer.style, {
            flex: '1',
            width: '100%',
            position: 'relative'
        });
        modal.appendChild(networkContainer);

        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    const container = document.getElementById('horae-bme-vis-container');

    // 2. Prepare Data and Render
    const data = prepareGraphData(graph);
    
    const options = {
        layout: {
            improvedLayout: true
        },
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -50,
                centralGravity: 0.01,
                springLength: 100,
                springConstant: 0.08,
                damping: 0.4
            },
            minVelocity: 0.75,
            solver: 'forceAtlas2Based'
        },
        interaction: {
            tooltipDelay: 200,
            hover: true,
            zoomView: true,
            dragView: true
        }
    };

    // Render it
    new window.vis.Network(container, data, options);
}
