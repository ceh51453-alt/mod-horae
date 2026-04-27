import { getContext, extension_settings, renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { saveSettingsDebounced } from '/script.js';
import { DEFAULT_SETTINGS, TEMPLATE_PATH } from './constants.js';

export let settings = {};

export function setSettings(newSettings) {
    settings = newSettings;
}

export function loadSettings(EXTENSION_NAME) {
    if (extension_settings[EXTENSION_NAME]) {
        settings = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };
    } else {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
        settings = { ...DEFAULT_SETTINGS };
    }
    return settings;
}

export function saveSettings(EXTENSION_NAME = 'horae') {
    extension_settings[EXTENSION_NAME] = settings;
    saveSettingsDebounced();
}

/** 显示 Toast 消息 */
export function showToast(message, type = 'info') {
    if (window.toastr) {
        toastr[type](message, 'Horae');
    } else {
        console.log(`[Horae] ${type}: ${message}`);
    }
}

/** 获取HTML模板 */
export async function getTemplate(name) {
    return await renderExtensionTemplateAsync(TEMPLATE_PATH, name);
}

// To allow cyclic dependency resolution with core manager
export let horaeManager = null;
export function setHoraeManager(m) { horaeManager = m; }

export { getContext, extension_settings };

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
