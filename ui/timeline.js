import { settings, appState, saveSettings, getContext, showToast } from '../core/state.js';
import { horaeManager } from '../core/horaeManager.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

// ============================================
// NPC 多选模式
// ============================================

function enterNpcMultiSelect(initialName) {
    appState.npcMultiSelectMode = true;
    appState.selectedNpcs.clear();
    if (initialName) appState.selectedNpcs.add(initialName);
    const bar = document.getElementById('horae-npc-multiselect-bar');
    if (bar) bar.style.display = 'flex';
    const btn = document.getElementById('horae-btn-npc-multiselect');
    if (btn) { btn.classList.add('active'); btn.title = t('ui.exitMultiSelect'); }
    updateCharactersDisplay();
    _updateNpcSelectedCount();
}

function exitNpcMultiSelect() {
    appState.npcMultiSelectMode = false;
    appState.selectedNpcs.clear();
    const bar = document.getElementById('horae-npc-multiselect-bar');
    if (bar) bar.style.display = 'none';
    const btn = document.getElementById('horae-btn-npc-multiselect');
    if (btn) { btn.classList.remove('active'); btn.title = t('ui.multiSelectMode'); }
    updateCharactersDisplay();
}

function toggleNpcSelection(name) {
    if (appState.selectedNpcs.has(name)) appState.selectedNpcs.delete(name);
    else appState.selectedNpcs.add(name);
    const item = document.querySelector(`#horae-npc-list .horae-npc-item[data-npc-name="${name}"]`);
    if (item) {
        const cb = item.querySelector('.horae-npc-select-cb input');
        if (cb) cb.checked = appState.selectedNpcs.has(name);
        item.classList.toggle('selected', appState.selectedNpcs.has(name));
    }
    _updateNpcSelectedCount();
}

function _updateNpcSelectedCount() {
    const el = document.getElementById('horae-npc-selected-count');
    if (el) el.textContent = appState.selectedNpcs.size;
}

async function deleteSelectedNpcs() {
    if (appState.selectedNpcs.size === 0) { showToast(t('toast.insufficientEvents'), 'warning'); return; }
    if (!confirm(t('confirm.deleteNpc', {name: `${appState.selectedNpcs.size}`}))) return;
    
    _cascadeDeleteNpcs(Array.from(appState.selectedNpcs));
    await getContext().saveChat();
    showToast(t('toast.saveSuccess'), 'success');
    exitNpcMultiSelect();
    refreshAllDisplays();
}

// 异常状态 → FontAwesome 图标映射
const RPG_STATUS_ICONS = {
    '昏': 'fa-dizzy', '眩': 'fa-dizzy', '晕': 'fa-dizzy', '暈': 'fa-dizzy',
    '流血': 'fa-droplet', '出血': 'fa-droplet', '血': 'fa-droplet',
    '重伤': 'fa-heart-crack', '重傷': 'fa-heart-crack', '濒死': 'fa-heart-crack', '瀕死': 'fa-heart-crack',
    '冻': 'fa-snowflake', '凍': 'fa-snowflake', '冰': 'fa-snowflake', '寒': 'fa-snowflake',
    '石化': 'fa-gem', '钙化': 'fa-gem', '鈣化': 'fa-gem', '结晶': 'fa-gem', '結晶': 'fa-gem',
    '毒': 'fa-skull-crossbones', '腐蚀': 'fa-skull-crossbones', '腐蝕': 'fa-skull-crossbones',
    '火': 'fa-fire', '烧': 'fa-fire', '燒': 'fa-fire', '灼': 'fa-fire', '燃': 'fa-fire', '炎': 'fa-fire',
    '慢': 'fa-hourglass-half', '减速': 'fa-hourglass-half', '減速': 'fa-hourglass-half', '迟缓': 'fa-hourglass-half', '遲緩': 'fa-hourglass-half',
    '盲': 'fa-eye-slash', '失明': 'fa-eye-slash',
    '沉默': 'fa-comment-slash', '禁言': 'fa-comment-slash', '封印': 'fa-ban',
    '麻': 'fa-bolt', '痹': 'fa-bolt', '痺': 'fa-bolt', '电': 'fa-bolt', '電': 'fa-bolt', '雷': 'fa-bolt',
    '弱': 'fa-feather', '衰': 'fa-feather', '虚': 'fa-feather', '虛': 'fa-feather',
    '恐': 'fa-ghost', '惧': 'fa-ghost', '懼': 'fa-ghost', '惊': 'fa-ghost', '驚': 'fa-ghost',
    '乱': 'fa-shuffle', '亂': 'fa-shuffle', '混乱': 'fa-shuffle', '混亂': 'fa-shuffle', '狂暴': 'fa-shuffle',
    '眠': 'fa-moon', '睡': 'fa-moon', '催眠': 'fa-moon',
    '缚': 'fa-link', '縛': 'fa-link', '禁锢': 'fa-link', '禁錮': 'fa-link', '束': 'fa-link',
    '饥': 'fa-utensils', '飢': 'fa-utensils', '饿': 'fa-utensils', '餓': 'fa-utensils', '饥饿': 'fa-utensils', '飢餓': 'fa-utensils',
    '渴': 'fa-glass-water', '脱水': 'fa-glass-water', '脫水': 'fa-glass-water',
    '疲': 'fa-battery-quarter', '累': 'fa-battery-quarter', '倦': 'fa-battery-quarter', '乏': 'fa-battery-quarter',
    '伤': 'fa-bandage', '傷': 'fa-bandage', '创': 'fa-bandage', '創': 'fa-bandage',
    '愈': 'fa-heart-pulse', '恢复': 'fa-heart-pulse', '恢復': 'fa-heart-pulse', '再生': 'fa-heart-pulse',
    '隐': 'fa-user-secret', '隱': 'fa-user-secret', '伪装': 'fa-user-secret', '偽裝': 'fa-user-secret', '潜行': 'fa-user-secret', '潛行': 'fa-user-secret',
    '护盾': 'fa-shield', '護盾': 'fa-shield', '防御': 'fa-shield', '防禦': 'fa-shield', '铁壁': 'fa-shield', '鐵壁': 'fa-shield',
    '正常': 'fa-circle-check',
};

/** 根据异常状态文本匹配图标 */
function getStatusIcon(text) {
    for (const [kw, icon] of Object.entries(RPG_STATUS_ICONS)) {
        if (text.includes(kw)) return icon;
    }
    return 'fa-triangle-exclamation';
}

/** 根据配置获取属性条颜色 */
function getRpgBarColor(key) {
    const cfg = (settings.rpgBarConfig || []).find(b => b.key === key);
    return cfg?.color || '#6366f1';
}

/** 根据配置获取属性条显示名（用户自定义名 > AI标签 > 默认key大写） */
function getRpgBarName(key, aiLabel) {
    const cfg = (settings.rpgBarConfig || []).find(b => b.key === key);
    const cfgName = cfg?.name;
    if (cfgName && cfgName !== key.toUpperCase()) return cfgName;
    return aiLabel || cfgName || key.toUpperCase();
}


export {
    enterNpcMultiSelect,
    exitNpcMultiSelect,
    toggleNpcSelection,
    _updateNpcSelectedCount,
    deleteSelectedNpcs,
    getStatusIcon,
    getRpgBarColor,
    getRpgBarName
};
