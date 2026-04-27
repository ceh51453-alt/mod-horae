const fs = require('fs');

const files = [
    'e:/horae/ui/timeline.js',
    'e:/horae/ui/rpg_dice.js',
    'e:/horae/ui/rpg_rep.js',
    'e:/horae/ui/rpg_equip.js',
];

const allExports = {};

files.forEach(f => {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const exports = [];
    lines.forEach(l => {
        const m = l.match(/^function ([a-zA-Z0-9_]+)\(/) || l.match(/^async function ([a-zA-Z0-9_]+)\(/);
        if (m) {
            // we export all functions just in case
            exports.push(m[1]);
            // prefix the line with export
        }
    });
    allExports[f] = exports;
    
    // Add exports at the end
    const out = fs.readFileSync(f, 'utf8') + '\n\nexport {\n    ' + exports.join(',\n    ') + '\n};\n';
    fs.writeFileSync(f, out);
});

// Also add exports for tables, themeDesigner, tutorial
const existingFiles = [
    'e:/horae/ui/tables.js',
    'e:/horae/ui/themeDesigner.js',
    'e:/horae/ui/tutorial.js'
];

existingFiles.forEach(f => {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const exports = [];
    lines.forEach(l => {
        const m = l.match(/^function ([a-zA-Z0-9_]+)\(/) || l.match(/^async function ([a-zA-Z0-9_]+)\(/);
        if (m) {
            if (m[1] !== 'escapeHtml') { // Avoid duplicate
                exports.push(m[1]);
            }
        }
    });
    allExports[f] = exports;
    
    // Check if it already has exports
    if (!fs.readFileSync(f, 'utf8').includes('export {') && !fs.readFileSync(f, 'utf8').includes('export function')) {
        const out = fs.readFileSync(f, 'utf8') + '\n\nexport {\n    ' + exports.join(',\n    ') + '\n};\n';
        fs.writeFileSync(f, out);
    }
});

let indexContent = fs.readFileSync('e:/horae/index.js', 'utf8');

// Generate imports
let importStr = '\n';
for (const [file, exports] of Object.entries(allExports)) {
    const baseName = require('path').basename(file);
    if (exports.length > 0) {
        importStr += `import { ${exports.join(', ')} } from './ui/${baseName}';\n`;
    }
}

// Insert imports right after core imports
const lines = indexContent.split('\n');
lines.splice(22, 0, importStr);
fs.writeFileSync('e:/horae/index.js', lines.join('\n'));

console.log('Exports and imports generated.');
