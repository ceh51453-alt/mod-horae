import { settings, appState, saveSettings, getContext, showToast } from '../core/state.js';
import { horaeManager } from '../core/horaeManager.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

// ============================================
// 声望系统 UI
// ============================================

/** 获取 _rpgConfigs 权威存储（顶层键，独立于 rpg 对象，不受 rebuild 影响） */
function _ensureRpgConfigs() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return null;
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta._rpgConfigs) {
        chat[0].horae_meta._rpgConfigs = {};
    }
    return chat[0].horae_meta._rpgConfigs;
}

/** 将 _rpgConfigs 同步到 rpg 对象上（供 _mergeRpgData 等内部函数使用） */
function _syncConfigsToRpg() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return;
    const meta = chat[0].horae_meta;
    if (!meta?._rpgConfigs) return;
    if (!meta.rpg) meta.rpg = {};
    const c = meta._rpgConfigs;
    if (c.reputationConfig) meta.rpg.reputationConfig = c.reputationConfig;
    if (c.equipmentConfig) meta.rpg.equipmentConfig = c.equipmentConfig;
    if (c.currencyConfig) meta.rpg.currencyConfig = c.currencyConfig;
    if (c._deletedSkills) meta.rpg._deletedSkills = c._deletedSkills;
    if (c._deletedStrongholds) meta.rpg._deletedStrongholds = c._deletedStrongholds;
}

function _getRepConfig() {
    const c = _ensureRpgConfigs();
    if (!c) return { categories: [], _deletedCategories: [] };
    if (!c.reputationConfig) {
        // 迁移：从 rpg 内部读旧数据
        const chat = horaeManager.getChat();
        const oldCfg = chat[0]?.horae_meta?.rpg?.reputationConfig;
        c.reputationConfig = oldCfg && oldCfg.categories?.length
            ? oldCfg
            : { categories: [], _deletedCategories: [] };
    }
    return c.reputationConfig;
}

function _getRepValues() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return {};
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = {};
    if (!chat[0].horae_meta.rpg.reputation) chat[0].horae_meta.rpg.reputation = {};
    return chat[0].horae_meta.rpg.reputation;
}

function _saveRepData() {
    _syncConfigsToRpg();
    getContext().saveChat();
}

/** 渲染声望分类配置列表 */
function renderReputationConfig() {
    const list = document.getElementById('horae-rpg-rep-config-list');
    if (!list) return;
    const config = _getRepConfig();
    if (!config.categories.length) {
        list.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.noReputationCategories')}</div>`;
        return;
    }
    list.innerHTML = config.categories.map((cat, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-rep-name" value="${escapeHtml(cat.name)}" placeholder="${t('placeholder.reputationName')}" data-idx="${i}" />
            <input class="horae-rpg-rep-range" value="${cat.min}" type="number" style="width:48px" title="${t('label.minValue')}" data-idx="${i}" data-field="min" />
            <span style="opacity:.5">~</span>
            <input class="horae-rpg-rep-range" value="${cat.max}" type="number" style="width:48px" title="${t('label.maxValue')}" data-idx="${i}" data-field="max" />
            <button class="horae-rpg-btn-sm horae-rpg-rep-subitems" data-idx="${i}" title="${t('tooltip.editSubitems')}"><i class="fa-solid fa-list-ul"></i></button>
            <button class="horae-rpg-rep-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** 渲染声望数值（每个角色的声望列表） */
function renderReputationValues() {
    const section = document.getElementById('horae-rpg-rep-values-section');
    if (!section) return;
    const config = _getRepConfig();
    const repValues = _getRepValues();
    if (!config.categories.length) { section.innerHTML = ''; return; }

    const allOwners = new Set(Object.keys(repValues));
    const rpg = horaeManager.getRpgStateAt(0);
    for (const name of Object.keys(rpg.bars || {})) allOwners.add(name);

    const _repUO = !!settings.rpgReputationUserOnly;
    const _userName = getContext().name1 || '';

    if (!allOwners.size) {
        section.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.noReputationValues')}</div>`;
        return;
    }

    let html = '';
    for (const owner of allOwners) {
        if (_repUO && owner !== _userName) continue;
        const ownerData = repValues[owner] || {};
        html += `<details class="horae-rpg-char-detail"><summary class="horae-rpg-char-summary"><span class="horae-rpg-char-detail-name">${escapeHtml(owner)} ${t('ui.reputation')}</span></summary><div class="horae-rpg-char-detail-body">`;
        for (const cat of config.categories) {
            const data = ownerData[cat.name] || { value: cat.default ?? 0, subItems: {} };
            const range = (cat.max ?? 100) - (cat.min ?? -100);
            const offset = data.value - (cat.min ?? -100);
            const pct = range > 0 ? Math.min(100, Math.round(offset / range * 100)) : 50;
            const color = data.value >= 0 ? '#22c55e' : '#ef4444';
            html += `<div class="horae-rpg-bar">
                <span class="horae-rpg-bar-label">${escapeHtml(cat.name)}</span>
                <div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:${color};"></div></div>
                <span class="horae-rpg-bar-val horae-rpg-rep-val-edit" data-owner="${escapeHtml(owner)}" data-cat="${escapeHtml(cat.name)}" title="${t('common.edit')}">${data.value}</span>
            </div>`;
            if (Object.keys(data.subItems || {}).length > 0) {
                html += '<div style="padding-left:16px;opacity:.8;font-size:.85em;">';
                for (const [subName, subVal] of Object.entries(data.subItems)) {
                    html += `<div>${escapeHtml(subName)}: ${subVal}</div>`;
                }
                html += '</div>';
            }
        }
        html += '</div></details>';
    }
    section.innerHTML = html;
}


/** 弹出编辑声望分类细项的对话框 */
function _openRepSubItemsDialog(catIndex) {
    const config = _getRepConfig();
    const cat = config.categories[catIndex];
    if (!cat) return;
    const subItems = (cat.subItems || []).slice();
    const modal = document.createElement('div');
    modal.className = 'horae-modal';
    modal.innerHTML = `
        <div class="horae-modal-content" style="max-width:400px;width:92vw;box-sizing:border-box;">
            <div class="horae-modal-header"><h3>${t('ui.reputationSubitemTitle', {name: escapeHtml(cat.name)})}</h3></div>
            <div class="horae-modal-body">
                <p style="margin-bottom:8px;opacity:.7;font-size:.9em;">${t('ui.reputationSubitemHint')}</p>
                <div id="horae-rep-subitems-list"></div>
                <button id="horae-rep-subitems-add" class="horae-btn-add-rep-subitem"><i class="fa-solid fa-plus"></i> ${t('ui.addSubitem')}</button>
            </div>
            <div class="horae-modal-footer">
                <button id="horae-rep-subitems-ok" class="horae-btn primary">${t('common.confirm')}</button>
                <button id="horae-rep-subitems-cancel" class="horae-btn">${t('common.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    preventModalBubble(modal);

    function renderList() {
        const list = modal.querySelector('#horae-rep-subitems-list');
        list.innerHTML = subItems.map((s, i) => `
            <div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">
                <input class="horae-rpg-rep-subitem-input" value="${escapeHtml(s)}" data-idx="${i}" style="flex:1;" placeholder="${t('placeholder.subitemName')}" />
                <button class="horae-rpg-rep-subitem-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join('');
    }
    renderList();

    modal.querySelector('#horae-rep-subitems-add').onclick = () => { subItems.push(''); renderList(); };
    modal.addEventListener('click', e => {
        if (e.target.closest('.horae-rpg-rep-subitem-del')) {
            const idx = parseInt(e.target.closest('.horae-rpg-rep-subitem-del').dataset.idx);
            subItems.splice(idx, 1);
            renderList();
        }
    });
    modal.addEventListener('input', e => {
        if (e.target.matches('.horae-rpg-rep-subitem-input')) {
            subItems[parseInt(e.target.dataset.idx)] = e.target.value.trim();
        }
    });
    modal.querySelector('#horae-rep-subitems-ok').onclick = () => {
        cat.subItems = subItems.filter(s => s);
        _saveRepData();
        modal.remove();
        renderReputationConfig();
    };
    modal.querySelector('#horae-rep-subitems-cancel').onclick = () => modal.remove();
}

/** 声望分类配置事件绑定 */
function _bindReputationConfigEvents() {
    const container = document.getElementById('horae-tab-rpg');
    if (!container) return;

    // 添加声望分类
    $('#horae-rpg-rep-add').off('click').on('click', () => {
        const config = _getRepConfig();
        config.categories.push({ name: t('ui.newReputation'), min: -100, max: 100, default: 0, subItems: [] });
        _saveRepData();
        renderReputationConfig();
        renderReputationValues();
    });

    // 名称/范围编辑
    $(container).off('input.repconfig').on('input.repconfig', '.horae-rpg-rep-name, .horae-rpg-rep-range', function() {
        const idx = parseInt(this.dataset.idx);
        const config = _getRepConfig();
        const cat = config.categories[idx];
        if (!cat) return;
        if (this.classList.contains('horae-rpg-rep-name')) {
            cat.name = this.value.trim();
        } else {
            const field = this.dataset.field;
            cat[field] = parseInt(this.value) || 0;
        }
        _saveRepData();
    });

    // 细项编辑按钮
    $(container).off('click.repsubitems').on('click.repsubitems', '.horae-rpg-rep-subitems', function() {
        _openRepSubItemsDialog(parseInt(this.dataset.idx));
    });

    // 删除声望分类
    $(container).off('click.repdel').on('click.repdel', '.horae-rpg-rep-del', function() {
        if (!confirm(t('confirm.deleteTable'))) return;
        const idx = parseInt(this.dataset.idx);
        const config = _getRepConfig();
        const deleted = config.categories.splice(idx, 1)[0];
        if (deleted?.name) {
            if (!config._deletedCategories) config._deletedCategories = [];
            config._deletedCategories.push(deleted.name);
            // 清除所有角色该分类的数值
            const repValues = _getRepValues();
            for (const owner of Object.keys(repValues)) {
                delete repValues[owner][deleted.name];
                if (!Object.keys(repValues[owner]).length) delete repValues[owner];
            }
        }
        _saveRepData();
        renderReputationConfig();
        renderReputationValues();
    });

    // 手动编辑声望数值
    $(container).off('click.repvaledit').on('click.repvaledit', '.horae-rpg-rep-val-edit', function() {
        const owner = this.dataset.owner;
        const catName = this.dataset.cat;
        const config = _getRepConfig();
        const cat = config.categories.find(c => c.name === catName);
        if (!cat) return;
        const repValues = _getRepValues();
        if (!repValues[owner]) repValues[owner] = {};
        if (!repValues[owner][catName]) repValues[owner][catName] = { value: cat.default ?? 0, subItems: {} };
        const current = repValues[owner][catName].value;
        const newVal = prompt(t('toast.reputationPrompt', {owner, cat: catName, min: cat.min ?? -100, max: cat.max ?? 100}), current);
        if (newVal === null) return;
        const parsed = parseInt(newVal);
        if (isNaN(parsed)) return;
        repValues[owner][catName].value = Math.max(cat.min ?? -100, Math.min(cat.max ?? 100, parsed));
        repValues[owner][catName]._userEdited = true;
        _saveRepData();
        renderReputationValues();
    });

    // 导出声望配置
    $('#horae-rpg-rep-export').off('click').on('click', () => {
        const config = _getRepConfig();
        const data = { horae_reputation_config: { version: 1, categories: config.categories } };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'horae-reputation-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(t('toast.reputationExported'), 'success');
    });

    // 导入声望配置
    $('#horae-rpg-rep-import').off('click').on('click', () => {
        document.getElementById('horae-rpg-rep-import-file')?.click();
    });
    $('#horae-rpg-rep-import-file').off('change').on('change', function() {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const imported = data?.horae_reputation_config;
                if (!imported?.categories?.length) {
                    showToast(t('toast.invalidFile'), 'error');
                    return;
                }
                if (!confirm(t('confirm.importReputation', {n: imported.categories.length}))) return;
                const config = _getRepConfig();
                const existingNames = new Set(config.categories.map(c => c.name));
                let added = 0;
                for (const cat of imported.categories) {
                    if (existingNames.has(cat.name)) continue;
                    config.categories.push({
                        name: cat.name,
                        min: cat.min ?? -100,
                        max: cat.max ?? 100,
                        default: cat.default ?? 0,
                        subItems: cat.subItems || [],
                    });
                    // 从删除黑名单中移除（如果之前删过同名的）
                    if (config._deletedCategories) {
                        config._deletedCategories = config._deletedCategories.filter(n => n !== cat.name);
                    }
                    added++;
                }
                _saveRepData();
                renderReputationConfig();
                renderReputationValues();
                showToast(t('toast.reputationImported', {n: added}), 'success');
            } catch (err) {
                showToast(t('toast.importFailed', {error: err.message}), 'error');
            }
        };
        reader.readAsText(file);
        this.value = '';
    });
}


export {
    _ensureRpgConfigs,
    _syncConfigsToRpg,
    _getRepConfig,
    _getRepValues,
    _saveRepData,
    renderReputationConfig,
    renderReputationValues,
    _openRepSubItemsDialog,
    _bindReputationConfigEvents
};
