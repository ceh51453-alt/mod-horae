const fs = require('fs');

function extractSection(lines, startKeyword, endKeyword) {
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(startKeyword)) startIdx = i - 1; 
        if (startIdx !== -1 && lines[i].includes(endKeyword)) {
            endIdx = i - 1;
            break;
        }
    }
    if (startIdx !== -1 && endIdx !== -1) {
        const extracted = lines.splice(startIdx, endIdx - startIdx);
        return { extracted: extracted.join('\n'), success: true };
    }
    return { success: false, startIdx, endIdx };
}

let lines = fs.readFileSync('e:/horae/index.js', 'utf8').split('\n');

const sections = [
    { start: '// Excel风格自定义表格功能', end: '// NPC 多选模式', file: 'e:/horae/ui/tables.js', hasExisting: true },
    { start: '// NPC 多选模式', end: '// RPG 骰子系统', file: 'e:/horae/ui/timeline.js' },
    { start: '// RPG 骰子系统', end: '// 声望系统 UI', file: 'e:/horae/ui/rpg_dice.js' },
    { start: '// 声望系统 UI', end: '// 装备栏 UI', file: 'e:/horae/ui/rpg_rep.js' },
    { start: '// 装备栏 UI', end: '// 自助美化工具 (Theme Designer)', file: 'e:/horae/ui/rpg_equip.js' },
    { start: '// 自助美化工具 (Theme Designer)', end: '// 抽屉面板交互', file: 'e:/horae/ui/themeDesigner.js', hasExisting: true },
    { start: '// 新用户导航教学', end: '// 初始化', file: 'e:/horae/ui/tutorial.js', hasExisting: true }
];

for (const sec of sections) {
    const res = extractSection(lines, sec.start, sec.end);
    if (res.success) {
        console.log(`Extracted ${sec.file}`);
        if (!sec.hasExisting) {
            // Write standard imports for UI modules
            const out = `import { settings, saveSettings, getContext, showToast } from '../core/state.js';\nimport { horaeManager } from '../core/horaeManager.js';\nimport { t, applyI18nToDOM } from '../core/i18n.js';\nimport { escapeHtml } from '../utils/timeUtils.js';\n\n` + res.extracted;
            fs.writeFileSync(sec.file, out);
        }
    } else {
        console.log(`Failed to extract ${sec.file}`);
    }
}

// Re-extract constants
const constRes = extractSection(lines, '// 常量定义', '// 全局变量');
if (constRes.success) {
    let out = constRes.extracted;
    out = out.replace(/const EXTENSION_NAME/, 'export const EXTENSION_NAME');
    out = out.replace(/let extFolder/, 'export let extFolder');
    out = out.replace(/const EXTENSION_FOLDER/, 'export const EXTENSION_FOLDER');
    out = out.replace(/const TEMPLATE_PATH/, 'export const TEMPLATE_PATH');
    out = out.replace(/const VERSION/, 'export const VERSION');
    out = out.replace(/const HORAE_REGEX_RULES/, 'export const HORAE_REGEX_RULES');
    out = out.replace(/const DEFAULT_SETTINGS/, 'export const DEFAULT_SETTINGS');
    fs.writeFileSync('e:/horae/core/constants.js', out);
}

// Also add imports to the top of index.js
const imports = `
import { EXTENSION_NAME, EXTENSION_FOLDER, TEMPLATE_PATH, VERSION, HORAE_REGEX_RULES, DEFAULT_SETTINGS } from './core/constants.js';
import { settings, setSettings, loadSettings, saveSettings, showToast, getTemplate } from './core/state.js';
`;
lines.splice(20, 0, imports);

fs.writeFileSync('e:/horae/index.js', lines.join('\n'));
