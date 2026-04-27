const fs = require('fs');
const t = fs.readFileSync('e:/horae/index.js', 'utf8');
const lines = t.split('\n');

// 1. Extract Tutorial
const tutImports = `import { settings, saveSettings } from '../core/state.js';\nimport { t } from '../core/i18n.js';`;
let tutStart = -1, tutEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// 新用户导航教学')) tutStart = i - 1;
    if (tutStart !== -1 && lines[i].includes('// 初始化')) {
        tutEnd = i - 1;
        break;
    }
}
if (tutStart !== -1 && tutEnd !== -1) {
    const extracted = lines.slice(tutStart, tutEnd);
    fs.writeFileSync('e:/horae/ui/tutorial.js', tutImports + '\n\n' + extracted.join('\n'));
    lines.splice(tutStart, tutEnd - tutStart);
    console.log(`Extracted Tutorial to e:/horae/ui/tutorial.js`);
}

// 2. Extract Theme Designer
const themeImports = `import { settings, saveSettings, showToast, getTemplate } from '../core/state.js';\nimport { t, applyI18nToDOM } from '../core/i18n.js';\nimport { extension_settings } from '/scripts/extensions.js';`;
let tdStart = -1, tdEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// 自助美化工具 (Theme Designer)')) tdStart = i - 1;
    if (tdStart !== -1 && lines[i].includes('// 抽屉面板交互')) {
        tdEnd = i - 1;
        break;
    }
}
if (tdStart !== -1 && tdEnd !== -1) {
    const extracted = lines.slice(tdStart, tdEnd);
    fs.writeFileSync('e:/horae/ui/themeDesigner.js', themeImports + '\n\n' + extracted.join('\n'));
    lines.splice(tdStart, tdEnd - tdStart);
    console.log(`Extracted Theme Designer to e:/horae/ui/themeDesigner.js`);
}

// 3. Extract Tables
const tableImports = `import { settings, saveSettings, horaeManager, getContext, showToast } from '../core/state.js';\nimport { t, applyI18nToDOM } from '../core/i18n.js';\nimport { escapeHtml } from '../utils/timeUtils.js';`;
let tbStart = -1, tbEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Excel风格自定义表格功能')) tbStart = i - 1;
    if (tbStart !== -1 && lines[i].includes('//  装备穿脱系统')) {
        tbEnd = i - 1;
        break;
    }
}
if (tbStart !== -1 && tbEnd !== -1) {
    const extracted = lines.slice(tbStart, tbEnd);
    fs.writeFileSync('e:/horae/ui/tables.js', tableImports + '\n\n' + extracted.join('\n'));
    lines.splice(tbStart, tbEnd - tbStart);
    console.log(`Extracted Tables to e:/horae/ui/tables.js`);
}

fs.writeFileSync('e:/horae/index.js', lines.join('\n'));
console.log('Extraction complete!');
