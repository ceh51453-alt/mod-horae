const fs = require('fs');
const t = fs.readFileSync('e:/horae/index.js', 'utf8');
const lines = t.split('\n');

// Find Constants section
let constStart = -1, constEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// 常量定义')) constStart = i - 1;
    if (constStart !== -1 && lines[i].includes('// 全局变量')) {
        constEnd = i - 1;
        break;
    }
}

if (constStart !== -1 && constEnd !== -1) {
    const extracted = lines.slice(constStart, constEnd);
    let out = extracted.join('\n');
    
    // Add exports
    out = out.replace(/const EXTENSION_NAME/, 'export const EXTENSION_NAME');
    out = out.replace(/let extFolder/, 'export let extFolder');
    out = out.replace(/const EXTENSION_FOLDER/, 'export const EXTENSION_FOLDER');
    out = out.replace(/const TEMPLATE_PATH/, 'export const TEMPLATE_PATH');
    out = out.replace(/const VERSION/, 'export const VERSION');
    out = out.replace(/const HORAE_REGEX_RULES/, 'export const HORAE_REGEX_RULES');
    out = out.replace(/const DEFAULT_SETTINGS/, 'export const DEFAULT_SETTINGS');
    
    fs.writeFileSync('e:/horae/core/constants.js', out);
    lines.splice(constStart, constEnd - constStart);
    
    // Insert import into index.js
    const importStr = `import { EXTENSION_NAME, EXTENSION_FOLDER, TEMPLATE_PATH, VERSION, HORAE_REGEX_RULES, DEFAULT_SETTINGS } from './core/constants.js';\nimport { settings, setSettings, loadSettings, saveSettings, showToast, getTemplate } from './core/state.js';`;
    lines.splice(constStart, 0, importStr);
    
    fs.writeFileSync('e:/horae/index.js', lines.join('\n'));
    console.log('Constants extracted to core/constants.js');
} else {
    console.log('Failed to extract constants');
}
