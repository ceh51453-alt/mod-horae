const fs = require('fs');

const stateCode = `
export const appState = {
    doNavbarIconClick: null,
    isInitialized: false,
    _isSummaryGeneration: false,
    _summaryInProgress: false,
    _chatFullyLoaded: false,
    itemsMultiSelectMode: false,
    selectedItems: new Set(),
    longPressTimer: null,
    agendaMultiSelectMode: false,
    selectedAgendaIndices: new Set(),
    agendaLongPressTimer: null,
    npcMultiSelectMode: false,
    selectedNpcs: new Set()
};
`;

let content = fs.readFileSync('e:/horae/core/state.js', 'utf8');
if (!content.includes('export const appState')) {
    content += stateCode;
    fs.writeFileSync('e:/horae/core/state.js', content);
}
