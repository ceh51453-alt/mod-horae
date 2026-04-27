const fs = require('fs');
const files = [
    'e:/horae/index.js',
    'e:/horae/ui/timeline.js',
    'e:/horae/ui/rpg_dice.js',
    'e:/horae/ui/rpg_rep.js',
    'e:/horae/ui/rpg_equip.js',
    'e:/horae/ui/tables.js',
    'e:/horae/ui/themeDesigner.js',
    'e:/horae/ui/tutorial.js'
];

const globals = [
    'doNavbarIconClick',
    'isInitialized',
    '_isSummaryGeneration',
    '_summaryInProgress',
    '_chatFullyLoaded',
    'itemsMultiSelectMode',
    'selectedItems',
    'longPressTimer',
    'agendaMultiSelectMode',
    'selectedAgendaIndices',
    'agendaLongPressTimer',
    'npcMultiSelectMode',
    'selectedNpcs'
];

files.forEach(f => {
    if (!fs.existsSync(f)) return;
    let content = fs.readFileSync(f, 'utf8');
    
    // In index.js, remove declarations
    if (f.endsWith('index.js')) {
        globals.forEach(g => {
            const regex = new RegExp(`^let ${g} = .*;\r?\n?`, 'gm');
            content = content.replace(regex, '');
        });
    }
    
    // Replace usages (excluding the import statement for appState if it exists)
    // To be safe, we replace only when it's not preceded by appState.
    // Also we need to make sure we import appState in these files.
    
    // Add import appState
    if (!content.includes('appState')) {
        if (content.includes('import { settings,')) {
            content = content.replace('import { settings,', 'import { settings, appState,');
        } else if (content.includes('import { getContext,')) { // For state.js or extensions.js? we are not touching state.js
            content = content.replace('import { getContext,', 'import { appState, getContext,');
        } else {
            // just append at top
            const importsEnd = content.lastIndexOf('import ');
            if (importsEnd !== -1) {
                const nextLine = content.indexOf('\n', importsEnd);
                content = content.slice(0, nextLine + 1) + "import { appState } from '../core/state.js';\n" + content.slice(nextLine + 1);
            }
        }
    }
    
    globals.forEach(g => {
        // Regex to match the global but not appState.global
        const regex = new RegExp(`(?<!appState\\.)\\b${g}\\b`, 'g');
        content = content.replace(regex, `appState.${g}`);
    });
    
    fs.writeFileSync(f, content);
});

console.log('Globals replaced with appState');
