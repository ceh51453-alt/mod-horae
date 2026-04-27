const fs = require('fs');
const t = fs.readFileSync('e:/horae/index.js', 'utf8');
const lines = t.split('\n');

let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// RPG 骰子系统')) startIdx = i - 1;
    if (lines[i].includes('// 抽屉面板交互')) {
        endIdx = i - 1;
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    const extracted = lines.slice(startIdx, endIdx);
    
    const out = `import { settings, saveSettings, horaeManager, getContext, showToast } from '../core/state.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

` + extracted.join('\n') + `

// Export functions that need to be accessible from outside
export {
    initDiceSystem,
    renderReputationList,
    updateReputationDisplay,
    renderEquipmentList,
    updateEquipmentDisplay
};`;

    fs.writeFileSync('e:/horae/ui/rpg.js', out);
    
    // Replace in index.js
    const importStmt = `import { initDiceSystem, renderReputationList, updateReputationDisplay, renderEquipmentList, updateEquipmentDisplay } from './ui/rpg.js';`;
    
    // Find where to inject imports
    let importInjectIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('import { initTutorial }')) {
            importInjectIdx = i;
            break;
        }
    }
    
    lines.splice(startIdx, endIdx - startIdx);
    lines.splice(importInjectIdx, 0, importStmt);
    
    fs.writeFileSync('e:/horae/index.js', lines.join('\n'));
    console.log('RPG system extracted to ui/rpg.js');
} else {
    console.log('Failed to find RPG boundaries:', startIdx, endIdx);
}
