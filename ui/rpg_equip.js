import { settings, appState, saveSettings, getContext, showToast } from '../core/state.js';
import { horaeManager } from '../core/horaeManager.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

// ============================================
// 装备栏 UI
// ============================================

/** 获取装备配置根对象 { locked, perChar: { name: { slots, _deletedSlots } } } */
function _getEqConfigMap() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return { locked: false, perChar: {} };
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = {};
    const c = _ensureRpgConfigs();
    // 优先从 _rpgConfigs 读取
    let cfg = c?.equipmentConfig || chat[0].horae_meta.rpg.equipmentConfig;
    if (!cfg) {
        cfg = { locked: false, perChar: {} };
        if (c) c.equipmentConfig = cfg;
        chat[0].horae_meta.rpg.equipmentConfig = cfg;
        return cfg;
    }
    // 旧格式迁移：{ slots: [...] } → { perChar: { owner: { slots } } }
    if (Array.isArray(cfg.slots)) {
        const oldSlots = cfg.slots;
        const locked = !!cfg.locked;
        const oldDeleted = cfg._deletedSlots || [];
        const eqValues = chat[0].horae_meta.rpg.equipment || {};
        const perChar = {};
        for (const owner of Object.keys(eqValues)) {
            perChar[owner] = { slots: JSON.parse(JSON.stringify(oldSlots)), _deletedSlots: [...oldDeleted] };
        }
        cfg = { locked, perChar };
    }
    if (!cfg.perChar) cfg.perChar = {};
    // 同步到两个存储位置
    if (c) c.equipmentConfig = cfg;
    chat[0].horae_meta.rpg.equipmentConfig = cfg;
    return cfg;
}

/** 获取某角色的装备格位配置 */
function _getCharEqConfig(owner) {
    const map = _getEqConfigMap();
    if (!map.perChar[owner]) map.perChar[owner] = { slots: [], _deletedSlots: [] };
    return map.perChar[owner];
}

function _getEqValues() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return {};
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = {};
    if (!chat[0].horae_meta.rpg.equipment) chat[0].horae_meta.rpg.equipment = {};
    return chat[0].horae_meta.rpg.equipment;
}

function _saveEqData() {
    getContext().saveChat();
}

/** renderEquipmentSlotConfig 已废弃，格位配置合并到角色装备面板 */
function renderEquipmentSlotConfig() { /* noop - per-char config in renderEquipmentValues */ }

/** 渲染统一装备面板（每角色独立格位 + 装备） */
function renderEquipmentValues() {
    const section = document.getElementById('horae-rpg-eq-values-section');
    if (!section) return;
    const eqValues = _getEqValues();
    const cfgMap = _getEqConfigMap();
    const lockBtn = document.getElementById('horae-rpg-eq-lock');
    if (lockBtn) {
        lockBtn.querySelector('i').className = cfgMap.locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
        lockBtn.title = cfgMap.locked ? t('ui.equipLocked') : t('ui.equipUnlocked');
    }
    const rpg = horaeManager.getRpgStateAt(0);
    const allOwners = new Set([...Object.keys(eqValues), ...Object.keys(cfgMap.perChar), ...Object.keys(rpg.bars || {})]);
    const _eqUO = !!settings.rpgEquipmentUserOnly;
    const _eqUserName = getContext().name1 || '';

    if (!allOwners.size) {
        section.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.noEquipCharData')}</div>`;
        return;
    }

    let html = '';
    for (const owner of allOwners) {
        if (_eqUO && owner !== _eqUserName) continue;
        const charCfg = _getCharEqConfig(owner);
        const ownerSlots = eqValues[owner] || {};
        const deletedSlots = new Set(charCfg._deletedSlots || []);
        let hasItems = false;
        let itemsHtml = '';
        for (const slot of charCfg.slots) {
            if (deletedSlots.has(slot.name)) continue;
            const items = ownerSlots[slot.name] || [];
            if (items.length > 0) hasItems = true;
            itemsHtml += `<div class="horae-rpg-eq-slot-group"><span class="horae-rpg-eq-slot-label">${escapeHtml(slot.name)} (${items.length}/${slot.maxCount ?? 1})</span>`;
            if (items.length > 0) {
                for (const item of items) {
                    const attrStr = Object.entries(item.attrs || {}).map(([k, v]) => `<span class="horae-rpg-eq-attr">${escapeHtml(k)} ${v >= 0 ? '+' : ''}${v}</span>`).join(' ');
                    const meta = item._itemMeta || {};
                    const iconHtml = meta.icon ? `<span class="horae-rpg-eq-item-icon">${meta.icon}</span>` : '';
                    const descHtml = meta.description ? `<div class="horae-rpg-eq-item-desc">${escapeHtml(meta.description)}</div>` : '';
                    itemsHtml += `<div class="horae-rpg-eq-item">
                        <div class="horae-rpg-eq-item-header">
                            ${iconHtml}<span class="horae-rpg-eq-item-name">${escapeHtml(item.name)}</span> ${attrStr}
                            <button class="horae-rpg-eq-item-del" data-owner="${escapeHtml(owner)}" data-slot="${escapeHtml(slot.name)}" data-item="${escapeHtml(item.name)}" title="${t('tooltip.unequipReturn')}"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
                        </div>
                        ${descHtml}
                    </div>`;
                }
            } else {
                itemsHtml += `<div style="opacity:.4;font-size:.85em;padding:2px 0;">${t('ui.emptySlot')}</div>`;
            }
            itemsHtml += '</div>';
        }
        html += `<details class="horae-rpg-char-detail"${hasItems ? ' open' : ''}>
            <summary class="horae-rpg-char-summary">
                <span class="horae-rpg-char-detail-name">${t('ui.equipLabel', {owner: escapeHtml(owner)})}</span>
                <span style="flex:1;"></span>
                <button class="horae-rpg-btn-sm horae-rpg-eq-char-tpl" data-owner="${escapeHtml(owner)}" title="${t('tooltip.loadTemplate')}"><i class="fa-solid fa-shapes"></i></button>
                <button class="horae-rpg-btn-sm horae-rpg-eq-char-add-slot" data-owner="${escapeHtml(owner)}" title="${t('tooltip.addSlot')}"><i class="fa-solid fa-plus"></i></button>
                <button class="horae-rpg-btn-sm horae-rpg-eq-char-del-slot" data-owner="${escapeHtml(owner)}" title="${t('tooltip.deleteSlot')}"><i class="fa-solid fa-minus"></i></button>
            </summary>
            <div class="horae-rpg-char-detail-body">${itemsHtml}
                <button class="horae-rpg-btn-sm horae-rpg-eq-add-item" data-owner="${escapeHtml(owner)}" style="margin-top:6px;width:100%;"><i class="fa-solid fa-plus"></i> ${t('ui.addEquipManual')}</button>
            </div>
        </details>`;
    }
    section.innerHTML = html;
    // 隐藏旧的全局格位列表
    const oldList = document.getElementById('horae-rpg-eq-slot-list');
    if (oldList) oldList.innerHTML = '';
}

/** 手动添加装备对话框 */
function _openAddEquipDialog(owner) {
    const charCfg = _getCharEqConfig(owner);
    if (!charCfg.slots.length) { showToast(t('toast.noSlots', {owner}), 'warning'); return; }
    const modal = document.createElement('div');
    modal.className = 'horae-modal';
    modal.innerHTML = `
        <div class="horae-modal-content" style="max-width:420px;width:92vw;box-sizing:border-box;">
            <div class="horae-modal-header"><h3>${t('modal.addEquipment')}</h3></div>
            <div class="horae-modal-body">
                <div class="horae-edit-field">
                    <label>${t('label.slot')}</label>
                    <select id="horae-eq-add-slot">
                        ${charCfg.slots.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${s.maxCount ?? 1})</option>`).join('')}
                    </select>
                </div>
                <div class="horae-edit-field">
                    <label>${t('label.name')}</label>
                    <input id="horae-eq-add-name" type="text" placeholder="${t('placeholder.equipName')}" />
                </div>
                <div class="horae-edit-field">
                    <label>${t('label.attributes')}</label>
                    <textarea id="horae-eq-add-attrs" rows="4" placeholder="${t('placeholder.equipAttrs')}"></textarea>
                </div>
            </div>
            <div class="horae-modal-footer">
                <button id="horae-eq-add-ok" class="horae-btn primary">${t('common.confirm')}</button>
                <button id="horae-eq-add-cancel" class="horae-btn">${t('common.cancel')}</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    preventModalBubble(modal);
    modal.querySelector('#horae-eq-add-ok').onclick = () => {
        const slotName = modal.querySelector('#horae-eq-add-slot').value;
        const itemName = modal.querySelector('#horae-eq-add-name').value.trim();
        if (!itemName) { showToast(t('toast.equipNameRequired'), 'warning'); return; }
        const attrsText = modal.querySelector('#horae-eq-add-attrs').value;
        const attrs = {};
        for (const line of attrsText.split('\n')) {
            const m = line.trim().match(/^(.+?)=(-?\d+)$/);
            if (m) attrs[m[1].trim()] = parseInt(m[2]);
        }
        const eqValues = _getEqValues();
        if (!eqValues[owner]) eqValues[owner] = {};
        if (!eqValues[owner][slotName]) eqValues[owner][slotName] = [];
        const slotCfg = charCfg.slots.find(s => s.name === slotName);
        const maxCount = slotCfg?.maxCount ?? 1;
        if (eqValues[owner][slotName].length >= maxCount) {
            if (!confirm(t('confirm.importEquipment'))) return;
            const bumped = eqValues[owner][slotName].shift();
            if (bumped) _unequipToItems(owner, slotName, bumped.name, true);
        }
        eqValues[owner][slotName].push({ name: itemName, attrs, _itemMeta: {} });
        _saveEqData();
        modal.remove();
        renderEquipmentValues();
        _bindEquipmentEvents();
    };
    modal.querySelector('#horae-eq-add-cancel').onclick = () => modal.remove();
}

/** 装备栏事件绑定 */
function _bindEquipmentEvents() {
    const container = document.getElementById('horae-tab-rpg');
    if (!container) return;

    // 为角色加载模板
    $(container).off('click.eqchartpl').on('click.eqchartpl', '.horae-rpg-eq-char-tpl', function(e) {
        e.stopPropagation();
        const owner = this.dataset.owner;
        const tpls = settings.equipmentTemplates || [];
        if (!tpls.length) { showToast(t('toast.noTemplates'), 'warning'); return; }
        const modal = document.createElement('div');
        modal.className = 'horae-modal';
        let listHtml = tpls.map((tpl, i) => {
            const slotsStr = tpl.slots.map(s => s.name).join('、');
            return `<div class="horae-rpg-tpl-item" data-idx="${i}" style="cursor:pointer;">
                <div class="horae-rpg-tpl-name">${escapeHtml(tpl.name)}</div>
                <div class="horae-rpg-tpl-slots">${escapeHtml(slotsStr)}</div>
            </div>`;
        }).join('');
        modal.innerHTML = `
            <div class="horae-modal-content" style="max-width:400px;width:90vw;box-sizing:border-box;">
                <div class="horae-modal-header"><h3>${t('modal.selectTemplate', {owner: escapeHtml(owner)})}</h3></div>
                <div class="horae-modal-body" style="max-height:50vh;overflow-y:auto;">
                    <div style="margin-bottom:8px;font-size:11px;color:var(--horae-text-muted);">
                        ${t('ui.templateReplaceHint')}
                    </div>
                    ${listHtml}
                </div>
                <div class="horae-modal-footer">
                    <button class="horae-btn primary" id="horae-eq-tpl-save"><i class="fa-solid fa-floppy-disk"></i> ${t('ui.saveAsTemplate')}</button>
                    <button class="horae-btn" id="horae-eq-tpl-close">${t('common.cancel')}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        preventModalBubble(modal);
        modal.querySelector('#horae-eq-tpl-close').onclick = () => modal.remove();
        modal.querySelector('#horae-eq-tpl-save').onclick = () => {
            const charCfg = _getCharEqConfig(owner);
            if (!charCfg.slots.length) { showToast(t('toast.noSlotsToSave', {owner}), 'warning'); return; }
            const name = prompt(t('label.name') + ':', '');
            if (!name?.trim()) return;
            settings.equipmentTemplates.push({
                name: name.trim(),
                slots: JSON.parse(JSON.stringify(charCfg.slots.map(s => ({ name: s.name, maxCount: s.maxCount ?? 1 })))),
            });
            saveSettingsDebounced();
            modal.remove();
            showToast(t('toast.templateSaved', {name: name.trim()}), 'success');
        };
        modal.querySelectorAll('.horae-rpg-tpl-item').forEach(item => {
            item.onclick = () => {
                const idx = parseInt(item.dataset.idx);
                const tpl = tpls[idx];
                if (!tpl) return;
                const charCfg = _getCharEqConfig(owner);
                charCfg.slots = JSON.parse(JSON.stringify(tpl.slots));
                charCfg._deletedSlots = [];
                charCfg._template = tpl.name;
                _saveEqData();
                renderEquipmentValues();
                _bindEquipmentEvents();
                horaeManager.init(getContext(), settings);
                _refreshSystemPromptDisplay();
                updateTokenCounter();
                modal.remove();
                showToast(t('toast.templateLoaded', {owner, name: tpl.name}), 'success');
            };
        });
    });

    // 为角色添加格位
    $(container).off('click.eqcharaddslot').on('click.eqcharaddslot', '.horae-rpg-eq-char-add-slot', function(e) {
        e.stopPropagation();
        const owner = this.dataset.owner;
        const name = prompt(t('label.name') + ':', '');
        if (!name?.trim()) return;
        const maxStr = prompt(t('label.quantity') + ':', '1');
        const maxCount = Math.max(1, parseInt(maxStr) || 1);
        const charCfg = _getCharEqConfig(owner);
        if (charCfg.slots.some(s => s.name === name.trim())) { showToast(t('toast.slotExists'), 'warning'); return; }
        charCfg.slots.push({ name: name.trim(), maxCount });
        if (charCfg._deletedSlots) charCfg._deletedSlots = charCfg._deletedSlots.filter(n => n !== name.trim());
        _saveEqData();
        renderEquipmentValues();
        _bindEquipmentEvents();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // 为角色删除格位
    $(container).off('click.eqchardelslot').on('click.eqchardelslot', '.horae-rpg-eq-char-del-slot', function(e) {
        e.stopPropagation();
        const owner = this.dataset.owner;
        const charCfg = _getCharEqConfig(owner);
        if (!charCfg.slots.length) { showToast(t('toast.charNoSlots'), 'warning'); return; }
        const names = charCfg.slots.map(s => s.name);
        const name = prompt(t('toast.deleteSlotPrompt', {slots: names.join(', ')}), '');
        if (!name?.trim()) return;
        const idx = charCfg.slots.findIndex(s => s.name === name.trim());
        if (idx < 0) { showToast(t('toast.itemNotFound', {name: name.trim()}), 'warning'); return; }
        if (!confirm(t('confirm.deleteTable'))) return;
        const deleted = charCfg.slots.splice(idx, 1)[0];
        if (!charCfg._deletedSlots) charCfg._deletedSlots = [];
        charCfg._deletedSlots.push(deleted.name);
        const eqValues = _getEqValues();
        if (eqValues[owner]) {
            delete eqValues[owner][deleted.name];
            if (!Object.keys(eqValues[owner]).length) delete eqValues[owner];
        }
        _saveEqData();
        renderEquipmentValues();
        _bindEquipmentEvents();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // 锁定/解锁
    $('#horae-rpg-eq-lock').off('click').on('click', () => {
        const cfgMap = _getEqConfigMap();
        cfgMap.locked = !cfgMap.locked;
        _saveEqData();
        const lockBtn = document.getElementById('horae-rpg-eq-lock');
        if (lockBtn) {
            lockBtn.querySelector('i').className = cfgMap.locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            lockBtn.title = cfgMap.locked ? t('ui.locked') : t('ui.clickToLock');
        }
    });

    // 卸下装备
    $(container).off('click.eqitemdel').on('click.eqitemdel', '.horae-rpg-eq-item-del', function() {
        const owner = this.dataset.owner;
        const slotName = this.dataset.slot;
        const itemName = this.dataset.item;
        _unequipToItems(owner, slotName, itemName, false);
        renderEquipmentValues();
        _bindEquipmentEvents();
        updateItemsDisplay();
        updateAllRpgHuds();
        showToast(t('toast.itemUnequipped', {item: itemName, owner, slot: slotName}), 'info');
    });

    // 手动添加装备
    $(container).off('click.eqadditem').on('click.eqadditem', '.horae-rpg-eq-add-item', function() {
        _openAddEquipDialog(this.dataset.owner);
    });

    // 导出全部装备配置
    $('#horae-rpg-eq-export').off('click').on('click', () => {
        const cfgMap = _getEqConfigMap();
        const blob = new Blob([JSON.stringify({ horae_equipment_config: { version: 2, perChar: cfgMap.perChar, locked: cfgMap.locked } }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'horae-equipment-config.json'; a.click();
        showToast(t('toast.equipmentExported'), 'success');
    });

    // 导入装备配置
    $('#horae-rpg-eq-import').off('click').on('click', () => {
        document.getElementById('horae-rpg-eq-import-file')?.click();
    });
    $('#horae-rpg-eq-import-file').off('change').on('change', function() {
        const file = this.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const imported = data?.horae_equipment_config;
                if (!imported) { showToast(t('toast.invalidFile'), 'error'); return; }
                if (imported.version === 2 && imported.perChar) {
                    if (!confirm(t('confirm.importEquipment'))) return;
                    const cfgMap = _getEqConfigMap();
                    for (const [owner, cfg] of Object.entries(imported.perChar)) {
                        cfgMap.perChar[owner] = JSON.parse(JSON.stringify(cfg));
                    }
                    if (imported.locked !== undefined) cfgMap.locked = imported.locked;
                } else if (imported.slots?.length) {
                    if (!confirm(t('confirm.importEquipment'))) return;
                    const cfgMap = _getEqConfigMap();
                    const eqValues = _getEqValues();
                    for (const owner of Object.keys(eqValues)) {
                        const charCfg = _getCharEqConfig(owner);
                        const existing = new Set(charCfg.slots.map(s => s.name));
                        for (const slot of imported.slots) {
                            if (!existing.has(slot.name)) charCfg.slots.push({ name: slot.name, maxCount: slot.maxCount ?? 1 });
                        }
                    }
                } else { showToast(t('toast.invalidFile'), 'error'); return; }
                _saveEqData();
                renderEquipmentValues();
                _bindEquipmentEvents();
                horaeManager.init(getContext(), settings);
                _refreshSystemPromptDisplay();
                updateTokenCounter();
                showToast(t('toast.equipmentImported'), 'success');
            } catch (err) { showToast(t('toast.importFailed', {error: err.message}), 'error'); }
        };
        reader.readAsText(file);
        this.value = '';
    });

    // 管理模板（全局模板增删）
    $('#horae-rpg-eq-preset').off('click').on('click', () => {
        _openEquipTemplateManageModal();
    });
}

/** 全局模板管理（增删模板，不加载到角色） */
function _openEquipTemplateManageModal() {
    const modal = document.createElement('div');
    modal.className = 'horae-modal';
    function _render() {
        const tpls = settings.equipmentTemplates || [];
        let listHtml = tpls.map((tpl, i) => {
            const slotsStr = tpl.slots.map(s => s.name).join('、');
            return `<div class="horae-rpg-tpl-item"><div class="horae-rpg-tpl-name">${escapeHtml(tpl.name)}</div>
                <div class="horae-rpg-tpl-slots">${escapeHtml(slotsStr)}</div>
                <button class="horae-rpg-btn-sm horae-rpg-tpl-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        }).join('');
        if (!tpls.length) listHtml = `<div class="horae-rpg-skills-empty">${t('ui.noCustomTemplates')}</div>`;
        modal.innerHTML = `<div class="horae-modal-content" style="max-width:460px;width:90vw;box-sizing:border-box;">
            <div class="horae-modal-header"><h3>${t('modal.presetManager')}</h3></div>
            <div class="horae-modal-body" style="max-height:55vh;overflow-y:auto;">
                <div style="margin-bottom:6px;font-size:11px;color:var(--horae-text-muted);">${t('ui.templateManageHint')}</div>
                ${listHtml}
            </div>
            <div class="horae-modal-footer"><button class="horae-btn" id="horae-tpl-mgmt-close">${t('common.close')}</button></div>
        </div>`;
        modal.querySelector('#horae-tpl-mgmt-close').onclick = () => modal.remove();
        modal.querySelectorAll('.horae-rpg-tpl-del').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx);
                const tpl = settings.equipmentTemplates[idx];
                if (!confirm(t('confirm.deleteTheme', {name: tpl.name}))) return;
                settings.equipmentTemplates.splice(idx, 1);
                saveSettingsDebounced();
                _render();
            };
        });
    }
    document.body.appendChild(modal);
    preventModalBubble(modal);
    _render();
}

// ============ 货币系统配置 ============

function _getCurConfig() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return { denominations: [] };
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = {};
    const c = _ensureRpgConfigs();
    let cfg = c?.currencyConfig || chat[0].horae_meta.rpg.currencyConfig;
    if (!cfg) {
        cfg = { denominations: [] };
    }
    if (c) c.currencyConfig = cfg;
    chat[0].horae_meta.rpg.currencyConfig = cfg;
    return cfg;
}

function _saveCurData() {
    const ctx = getContext();
    if (ctx?.saveChat) ctx.saveChat();
}

function renderCurrencyConfig() {
    const list = document.getElementById('horae-rpg-cur-denom-list');
    if (!list) return;
    const config = _getCurConfig();
    if (!config.denominations.length) {
        list.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.noCurrencies')}</div>`;
        return;
    }
    list.innerHTML = config.denominations.map((d, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-cur-emoji" value="${escapeHtml(d.emoji || '')}" placeholder="${t('placeholder.currencyEmoji')}" maxlength="2" data-idx="${i}" title="${t('label.icon')}" />
            <input class="horae-rpg-cur-name" value="${escapeHtml(d.name)}" placeholder="${t('placeholder.currencyName')}" data-idx="${i}" />
            <span style="opacity:.5;font-size:11px">${t('placeholder.currencyRate')}</span>
            <input class="horae-rpg-cur-rate" value="${d.rate}" type="number" min="1" style="width:60px" title="${t('placeholder.currencyRate')}" data-idx="${i}" />
            <button class="horae-rpg-cur-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
    _renderCurrencyHint(config);
}

function _renderCurrencyHint(config) {
    const section = document.getElementById('horae-rpg-cur-values-section');
    if (!section) return;
    const denoms = config.denominations;
    if (denoms.length < 2) { section.innerHTML = ''; return; }
    const sorted = [...denoms].sort((a, b) => a.rate - b.rate);
    const base = sorted[0];
    const parts = sorted.map(d => `${d.rate / base.rate}${d.name}`).join(' = ');
    section.innerHTML = `<div class="horae-rpg-skills-empty" style="font-size:11px;opacity:.7">${t('ui.exchangeRate', {parts: escapeHtml(parts)})}</div>`;
}

function _bindCurrencyEvents() {
    // 添加币种
    $('#horae-rpg-cur-add').off('click').on('click', () => {
        const config = _getCurConfig();
        config.denominations.push({ name: t('ui.newCurrency'), rate: 1, emoji: '💰' });
        _saveCurData();
        renderCurrencyConfig();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // 编辑币种 emoji
    $(document).off('change', '.horae-rpg-cur-emoji').on('change', '.horae-rpg-cur-emoji', function() {
        const config = _getCurConfig();
        const idx = parseInt(this.dataset.idx);
        config.denominations[idx].emoji = this.value.trim();
        _saveCurData();
    });

    // 编辑币种名称
    $(document).off('change', '.horae-rpg-cur-name').on('change', '.horae-rpg-cur-name', function() {
        const config = _getCurConfig();
        const idx = parseInt(this.dataset.idx);
        const oldName = config.denominations[idx].name;
        const newName = this.value.trim() || oldName;
        if (newName !== oldName) {
            config.denominations[idx].name = newName;
            _saveCurData();
            renderCurrencyConfig();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
        }
    });

    // 编辑兑换率
    $(document).off('change', '.horae-rpg-cur-rate').on('change', '.horae-rpg-cur-rate', function() {
        const config = _getCurConfig();
        const idx = parseInt(this.dataset.idx);
        const val = Math.max(1, parseInt(this.value) || 1);
        config.denominations[idx].rate = val;
        _saveCurData();
        renderCurrencyConfig();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // 删除币种
    $(document).off('click', '.horae-rpg-cur-del').on('click', '.horae-rpg-cur-del', function() {
        const config = _getCurConfig();
        const idx = parseInt(this.dataset.idx);
        const name = config.denominations[idx].name;
        if (!confirm(t('confirm.deleteTable'))) return;
        config.denominations.splice(idx, 1);
        // 清除所有角色该币种的数值
        const chat = horaeManager.getChat();
        const curData = chat?.[0]?.horae_meta?.rpg?.currency;
        if (curData) {
            for (const owner of Object.keys(curData)) {
                delete curData[owner][name];
                if (!Object.keys(curData[owner]).length) delete curData[owner];
            }
        }
        _saveCurData();
        renderCurrencyConfig();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // 导出
    $('#horae-rpg-cur-export').off('click').on('click', () => {
        const config = _getCurConfig();
        const blob = new Blob([JSON.stringify({ denominations: config.denominations }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'horae_currency_config.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    // 导入
    $('#horae-rpg-cur-import').off('click').on('click', () => {
        document.getElementById('horae-rpg-cur-import-file')?.click();
    });
    $('#horae-rpg-cur-import-file').off('change').on('change', function() {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!imported.denominations?.length) { showToast(t('toast.invalidFile'), 'error'); return; }
                if (!confirm(t('confirm.importReputation', {n: imported.denominations.length}))) return;
                const config = _getCurConfig();
                const existingNames = new Set(config.denominations.map(d => d.name));
                let added = 0;
                for (const d of imported.denominations) {
                    if (existingNames.has(d.name)) continue;
                    config.denominations.push({ name: d.name, rate: d.rate ?? 1 });
                    added++;
                }
                _saveCurData();
                renderCurrencyConfig();
                horaeManager.init(getContext(), settings);
                _refreshSystemPromptDisplay();
                updateTokenCounter();
                showToast(t('toast.currencyImported', {n: added}), 'success');
            } catch (err) {
                showToast(t('toast.importFailed', {error: err.message}), 'error');
            }
        };
        reader.readAsText(file);
        this.value = '';
    });
}

// ══════════════ 据点/基地系统 ══════════════

function _getStrongholdData() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return [];
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = {};
    const c = _ensureRpgConfigs();
    let nodes = c?.strongholds || chat[0].horae_meta.rpg.strongholds;
    if (!nodes) nodes = [];
    if (c) c.strongholds = nodes;
    chat[0].horae_meta.rpg.strongholds = nodes;
    return nodes;
}
function _saveStrongholdData() { _syncConfigsToRpg(); getContext().saveChat(); }

function _genShId() { return 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 构建子节点树 */
function _buildShTree(nodes, parentId) {
    return nodes
        .filter(n => (n.parent || null) === parentId)
        .map(n => ({ ...n, children: _buildShTree(nodes, n.id) }));
}

/** 渲染据点树形 UI */
function renderStrongholdTree() {
    const container = document.getElementById('horae-rpg-sh-tree');
    if (!container) return;
    const nodes = _getStrongholdData();
    if (!nodes.length) {
        container.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.noStrongholds')}</div>`;
        return;
    }
    const tree = _buildShTree(nodes, null);
    container.innerHTML = _renderShNodes(tree, 0);
}

function _renderShNodes(nodes, depth) {
    let html = '';
    for (const n of nodes) {
        const indent = depth * 16;
        const hasChildren = n.children && n.children.length > 0;
        const lvBadge = n.level != null ? `<span class="horae-rpg-hud-lv-badge" style="font-size:10px;">Lv.${n.level}</span>` : '';
        html += `<div class="horae-rpg-sh-node" data-id="${escapeHtml(n.id)}" style="padding-left:${indent}px;">`;
        html += `<div class="horae-rpg-sh-node-head">`;
        html += `<span class="horae-rpg-sh-node-name">${hasChildren ? '▼ ' : '• '}${escapeHtml(n.name)}</span>`;
        html += lvBadge;
        html += `<div class="horae-rpg-sh-node-actions">`;
        html += `<button class="horae-rpg-btn-sm horae-rpg-sh-add-child" data-id="${escapeHtml(n.id)}" title="${t('tooltip.addChild')}"><i class="fa-solid fa-plus"></i></button>`;
        html += `<button class="horae-rpg-btn-sm horae-rpg-sh-edit" data-id="${escapeHtml(n.id)}" title="${t('common.edit')}"><i class="fa-solid fa-pen"></i></button>`;
        html += `<button class="horae-rpg-btn-sm horae-rpg-sh-del" data-id="${escapeHtml(n.id)}" title="${t('common.delete')}"><i class="fa-solid fa-trash"></i></button>`;
        html += `</div></div>`;
        if (n.desc) {
            html += `<div class="horae-rpg-sh-node-desc" style="padding-left:${indent + 12}px;">${escapeHtml(n.desc)}</div>`;
        }
        if (hasChildren) html += _renderShNodes(n.children, depth + 1);
        html += '</div>';
    }
    return html;
}

function _openShEditDialog(nodeId) {
    const nodes = _getStrongholdData();
    const node = nodeId ? nodes.find(n => n.id === nodeId) : null;
    const isNew = !node;
    const modal = document.createElement('div');
    modal.className = 'horae-modal';
    modal.innerHTML = `
        <div class="horae-modal-content" style="max-width:400px;width:90vw;box-sizing:border-box;">
            <div class="horae-modal-header"><h3>${isNew ? t('ui.addStrongholdTitle') : t('ui.editStrongholdTitle')}</h3></div>
            <div class="horae-modal-body">
                <div class="horae-edit-field">
                    <label>${t('label.name')}</label>
                    <input id="horae-sh-name" type="text" value="${escapeHtml(node?.name || '')}" placeholder="${t('placeholder.strongholdName')}" />
                </div>
                <div class="horae-edit-field">
                    <label>${t('label.level')} (${t('common.skip').toLowerCase()})</label>
                    <input id="horae-sh-level" type="number" min="0" max="999" value="${node?.level ?? ''}" />
                </div>
                <div class="horae-edit-field">
                    <label>${t('label.description')}</label>
                    <textarea id="horae-sh-desc" rows="3" placeholder="${t('placeholder.strongholdDesc')}">${escapeHtml(node?.desc || '')}</textarea>
                </div>
            </div>
            <div class="horae-modal-footer">
                <button class="horae-btn primary" id="horae-sh-ok">${isNew ? t('common.add') : t('common.save')}</button>
                <button class="horae-btn" id="horae-sh-cancel">${t('common.cancel')}</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    preventModalBubble(modal);
    modal.querySelector('#horae-sh-ok').onclick = () => {
        const name = modal.querySelector('#horae-sh-name').value.trim();
        if (!name) { showToast(t('toast.strongholdNameRequired'), 'warning'); return; }
        const lvRaw = modal.querySelector('#horae-sh-level').value;
        const level = lvRaw !== '' ? parseInt(lvRaw) : null;
        const desc = modal.querySelector('#horae-sh-desc').value.trim();
        if (node) {
            node.name = name;
            node.level = level;
            node.desc = desc;
        }
        _saveStrongholdData();
        renderStrongholdTree();
        _bindStrongholdEvents();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
        modal.remove();
    };
    modal.querySelector('#horae-sh-cancel').onclick = () => modal.remove();
    return modal;
}

function _bindStrongholdEvents() {
    const container = document.getElementById('horae-rpg-sh-tree');
    if (!container) return;

    // 添加根据点
    $('#horae-rpg-sh-add').off('click').on('click', () => {
        const nodes = _getStrongholdData();
        const modal = _openShEditDialog(null);
        modal.querySelector('#horae-sh-ok').onclick = () => {
            const name = modal.querySelector('#horae-sh-name').value.trim();
            if (!name) { showToast(t('toast.strongholdNameRequired'), 'warning'); return; }
            const lvRaw = modal.querySelector('#horae-sh-level').value;
            const level = lvRaw !== '' ? parseInt(lvRaw) : null;
            const desc = modal.querySelector('#horae-sh-desc').value.trim();
            nodes.push({ id: _genShId(), name, level, desc, parent: null, _userAdded: true });
            _saveStrongholdData();
            renderStrongholdTree();
            _bindStrongholdEvents();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
            modal.remove();
        };
    });

    // 添加子节点
    container.querySelectorAll('.horae-rpg-sh-add-child').forEach(btn => {
        btn.onclick = () => {
            const parentId = btn.dataset.id;
            const nodes = _getStrongholdData();
            const modal = _openShEditDialog(null);
            modal.querySelector('#horae-sh-ok').onclick = () => {
                const name = modal.querySelector('#horae-sh-name').value.trim();
                if (!name) { showToast(t('toast.nameRequired'), 'warning'); return; }
                const lvRaw = modal.querySelector('#horae-sh-level').value;
                const level = lvRaw !== '' ? parseInt(lvRaw) : null;
                const desc = modal.querySelector('#horae-sh-desc').value.trim();
                nodes.push({ id: _genShId(), name, level, desc, parent: parentId, _userAdded: true });
                _saveStrongholdData();
                renderStrongholdTree();
                _bindStrongholdEvents();
                horaeManager.init(getContext(), settings);
                modal.remove();
            };
        };
    });

    // 编辑
    container.querySelectorAll('.horae-rpg-sh-edit').forEach(btn => {
        btn.onclick = () => { _openShEditDialog(btn.dataset.id); };
    });

    // 删除（递归删除子节点 + 记录到 _deletedStrongholds 防回滚）
    container.querySelectorAll('.horae-rpg-sh-del').forEach(btn => {
        btn.onclick = () => {
            const nodes = _getStrongholdData();
            const id = btn.dataset.id;
            const node = nodes.find(n => n.id === id);
            if (!node) return;
            function countDescendants(pid) {
                const kids = nodes.filter(n => n.parent === pid);
                return kids.length + kids.reduce((s, k) => s + countDescendants(k.id), 0);
            }
            const desc = countDescendants(id);
            const childDesc = desc > 0 ? t('ui.andChildNodes', {n: desc}) : '';
            const msg = t('confirm.deleteStronghold', {name: node.name, childDesc}) + (desc > 0 ? ' ' + t('confirm.deleteStrongholdUndo') : '');
            if (!confirm(msg)) return;
            const chat = horaeManager.getChat();
            const rpg = chat?.[0]?.horae_meta?.rpg;
            if (rpg) {
                if (!rpg._deletedStrongholds) rpg._deletedStrongholds = [];
                const cfgs = _ensureRpgConfigs();
                if (cfgs && !cfgs._deletedStrongholds) cfgs._deletedStrongholds = rpg._deletedStrongholds;
                function collectDeleted(pid) {
                    const n = nodes.find(x => x.id === pid);
                    if (n) {
                        const parentNode = n.parent ? nodes.find(x => x.id === n.parent) : null;
                        const entry = { name: n.name, parent: parentNode?.name || null };
                        rpg._deletedStrongholds.push(entry);
                        if (cfgs && cfgs._deletedStrongholds !== rpg._deletedStrongholds) cfgs._deletedStrongholds.push(entry);
                    }
                    nodes.filter(x => x.parent === pid).forEach(k => collectDeleted(k.id));
                }
                collectDeleted(id);
            }
            function removeRecursive(pid) {
                const kids = nodes.filter(n => n.parent === pid);
                for (const k of kids) removeRecursive(k.id);
                const idx = nodes.findIndex(n => n.id === pid);
                if (idx >= 0) nodes.splice(idx, 1);
            }
            removeRecursive(id);
            _saveStrongholdData();
            renderStrongholdTree();
            _bindStrongholdEvents();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
        };
    });

    // 导出
    $('#horae-rpg-sh-export').off('click').on('click', () => {
        const data = _getStrongholdData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'horae_strongholds.json'; a.click();
    });
    // 导入
    $('#horae-rpg-sh-import').off('click').on('click', () => {
        document.getElementById('horae-rpg-sh-import-file')?.click();
    });
    $('#horae-rpg-sh-import-file').off('change').on('change', function() {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error(t('ui.invalidFormat'));
                const nodes = _getStrongholdData();
                const existingNames = new Set(nodes.map(n => n.name));
                const idMap = {};
                let added = 0;
                for (const n of imported) {
                    if (!n.name) continue;
                    if (existingNames.has(n.name)) {
                        const existing = nodes.find(x => x.name === n.name);
                        if (existing && n.id) idMap[n.id] = existing.id;
                        continue;
                    }
                    const newId = _genShId();
                    if (n.id) idMap[n.id] = newId;
                    nodes.push({ id: newId, name: n.name, level: n.level ?? null, desc: n.desc || '', parent: n.parent || null });
                    existingNames.add(n.name);
                    added++;
                }
                for (const node of nodes) {
                    if (node.parent && idMap[node.parent]) {
                        node.parent = idMap[node.parent];
                    }
                }
                _saveStrongholdData();
                renderStrongholdTree();
                _bindStrongholdEvents();
                showToast(t('toast.strongholdImported', {n: added}), 'success');
            } catch (err) { showToast(t('toast.importFailed', {error: err.message}), 'error'); }
        };
        reader.readAsText(file);
        this.value = '';
    });
}

/** 渲染等级/经验值数据（配置面板） */
function renderLevelValues() {
    const section = document.getElementById('horae-rpg-level-values-section');
    if (!section) return;
    const snapshot = horaeManager.getRpgStateAt(0);
    const chat = horaeManager.getChat();
    const baseRpg = chat?.[0]?.horae_meta?.rpg || {};
    const mergedLevels = { ...(snapshot.levels || {}), ...(baseRpg.levels || {}) };
    const mergedXp = { ...(snapshot.xp || {}), ...(baseRpg.xp || {}) };
    const allNames = new Set([...Object.keys(mergedLevels), ...Object.keys(mergedXp), ...Object.keys(snapshot.bars || {})]);
    const _lvUO = !!settings.rpgLevelUserOnly;
    const _lvUserName = getContext().name1 || '';
    let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:6px;"><button class="horae-rpg-btn-sm horae-rpg-lv-add" title="${t('ui.addLevelCharTitle')}"><i class="fa-solid fa-plus"></i> ${t('ui.addLevelChar')}</button></div>`;
    if (!allNames.size) {
        html += `<div class="horae-rpg-skills-empty">${t('ui.noLevelData')}</div>`;
    }
    for (const name of allNames) {
        if (_lvUO && name !== _lvUserName) continue;
        const lv = mergedLevels[name];
        const xp = mergedXp[name];
        const xpCur = xp ? xp[0] : 0;
        const xpMax = xp ? xp[1] : 0;
        const pct = xpMax > 0 ? Math.min(100, Math.round(xpCur / xpMax * 100)) : 0;
        html += `<div class="horae-rpg-lv-entry" data-char="${escapeHtml(name)}">`;
        html += `<div class="horae-rpg-lv-entry-header">`;
        html += `<span class="horae-rpg-lv-entry-name">${escapeHtml(name)}</span>`;
        html += `<span class="horae-rpg-hud-lv-badge">${lv != null ? 'Lv.' + lv : '--'}</span>`;
        html += `<button class="horae-rpg-btn-sm horae-rpg-lv-edit" data-char="${escapeHtml(name)}" title="${t('tooltip.editLevelXp')}"><i class="fa-solid fa-pen-to-square"></i></button>`;
        html += `</div>`;
        if (xpMax > 0) {
            html += `<div class="horae-rpg-lv-xp-row"><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:#a78bfa;"></div></div><span class="horae-rpg-lv-xp-label">${xpCur}/${xpMax} (${pct}%)</span></div>`;
        }
        html += '</div>';
    }
    section.innerHTML = html;

    const _lvEditHandler = (charName) => {
        const chat2 = horaeManager.getChat();
        if (!chat2?.length) return;
        if (!chat2[0].horae_meta) chat2[0].horae_meta = createEmptyMeta();
        if (!chat2[0].horae_meta.rpg) chat2[0].horae_meta.rpg = {};
        const rpgData = chat2[0].horae_meta.rpg;
        const curLv = rpgData.levels?.[charName] ?? '';
        const newLv = prompt(t('toast.levelPrompt', {name: charName}), curLv);
        if (newLv === null) return;
        const lvVal = parseInt(newLv);
        if (isNaN(lvVal) || lvVal < 0) { showToast(t('toast.invalidLevelNumber'), 'warning'); return; }
        if (!rpgData.levels) rpgData.levels = {};
        if (!rpgData.xp) rpgData.xp = {};
        rpgData.levels[charName] = lvVal;
        const xpMax = Math.max(100, lvVal * 100);
        const curXp = rpgData.xp[charName];
        if (!curXp || curXp[1] <= 0) {
            rpgData.xp[charName] = [0, xpMax];
        } else {
            rpgData.xp[charName] = [curXp[0], xpMax];
        }
        getContext().saveChat();
        renderLevelValues();
        updateAllRpgHuds();
        showToast(t('toast.levelSet', {name: charName, level: lvVal, xp: xpMax}), 'success');
    };

    section.querySelectorAll('.horae-rpg-lv-edit').forEach(btn => {
        btn.addEventListener('click', () => _lvEditHandler(btn.dataset.char));
    });

    const addBtn = section.querySelector('.horae-rpg-lv-add');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const charName = prompt(t('label.npcName') + ':');
            if (!charName?.trim()) return;
            _lvEditHandler(charName.trim());
        });
    }
}

/**
 * 构建单个角色在 HUD 中的 HTML
 * 布局: 角色名(+状态图标) | Lv.X 💵999 | XP条 | 属性条
 */
function _buildCharHudHtml(name, rpg) {
    const bars = rpg.bars[name] || {};
    const effects = rpg.status?.[name] || [];
    const charLv = rpg.levels?.[name];
    const charXp = rpg.xp?.[name];
    const charCur = rpg.currency?.[name] || {};
    const denomCfg = rpg.currencyConfig?.denominations || [];
    const sendLvl = !!settings.sendRpgLevel;
    const sendCur = !!settings.sendRpgCurrency;

    let html = '<div class="horae-rpg-hud-row">';

    // 第一行: 角色名 + 等级 + 状态图标 ....... 货币(右端)
    html += '<div class="horae-rpg-hud-header">';
    html += `<span class="horae-rpg-hud-name">${escapeHtml(name)}</span>`;
    if (sendLvl && charLv != null) html += `<span class="horae-rpg-hud-lv-badge">Lv.${charLv}</span>`;
    for (const e of effects) {
        html += `<i class="fa-solid ${getStatusIcon(e)} horae-rpg-hud-effect" title="${escapeHtml(e)}"></i>`;
    }
    // 货币：推到最右
    if (sendCur && denomCfg.length > 0) {
        let curHtml = '';
        for (const d of denomCfg) {
            const v = charCur[d.name];
            if (v == null) continue;
            curHtml += `<span class="horae-rpg-hud-cur-tag">${d.emoji || '💰'}${escapeHtml(String(v))}</span>`;
        }
        if (curHtml) html += `<span class="horae-rpg-hud-right">${curHtml}</span>`;
    }
    html += '</div>';

    // XP 条（如果有）
    if (sendLvl && charXp && charXp[1] > 0) {
        const pct = Math.min(100, Math.round(charXp[0] / charXp[1] * 100));
        html += `<div class="horae-rpg-hud-bar horae-rpg-hud-xp"><span class="horae-rpg-hud-lbl">XP</span><div class="horae-rpg-hud-track"><div class="horae-rpg-hud-fill" style="width:${pct}%;background:#a78bfa;"></div></div><span class="horae-rpg-hud-val">${charXp[0]}/${charXp[1]}</span></div>`;
    }

    // 属性条
    for (const [type, val] of Object.entries(bars)) {
        const label = getRpgBarName(type, val[2]);
        const cur = val[0], max = val[1];
        const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
        const color = getRpgBarColor(type);
        html += `<div class="horae-rpg-hud-bar"><span class="horae-rpg-hud-lbl">${escapeHtml(label)}</span><div class="horae-rpg-hud-track"><div class="horae-rpg-hud-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-hud-val">${cur}/${max}</span></div>`;
    }

    html += '</div>';
    return html;
}

/**
 * 从 present 列表与 RPG 数据中匹配在场角色
 */
function _matchPresentChars(present, rpg) {
    const userName = getContext().name1 || '';
    const allRpgNames = new Set([
        ...Object.keys(rpg.bars || {}), ...Object.keys(rpg.status || {}),
        ...Object.keys(rpg.levels || {}), ...Object.keys(rpg.xp || {}),
        ...Object.keys(rpg.currency || {}),
    ]);
    const chars = [];
    for (const p of present) {
        const n = p.trim();
        if (!n) continue;
        let match = null;
        if (allRpgNames.has(n)) match = n;
        else if (n === userName && allRpgNames.has(userName)) match = userName;
        else {
            for (const rn of allRpgNames) {
                if (rn.includes(n) || n.includes(rn)) { match = rn; break; }
            }
        }
        if (match && !chars.includes(match)) chars.push(match);
    }
    return chars;
}

/** 为单个消息面板渲染 RPG HUD（简易状态条） */
function renderRpgHud(messageEl, messageIndex) {
    const old = messageEl.querySelector('.horae-rpg-hud');
    if (old) old.remove();
    if (!settings.rpgMode || settings.sendRpgBars === false) return;

    const _hChat = horaeManager.getChat();
    const chatLen = _hChat?.length || 0;
    const skip = Math.max(0, chatLen - messageIndex - 1);
    const rpg = horaeManager.getRpgStateAt(skip);
    const _hCfgs = _hChat?.[0]?.horae_meta?._rpgConfigs;
    if (!rpg.currencyConfig) rpg.currencyConfig = _hCfgs?.currencyConfig || _hChat?.[0]?.horae_meta?.rpg?.currencyConfig || { denominations: [] };

    const meta = horaeManager.getMessageMeta(messageIndex);
    const present = meta?.scene?.characters_present || [];
    if (present.length === 0) return;

    let chars = _matchPresentChars(present, rpg);
    if (settings.rpgBarsUserOnly) {
        const _huN = getContext().name1 || '';
        chars = chars.filter(n => n === _huN);
    }
    if (chars.length === 0) return;

    let html = '<div class="horae-rpg-hud">';
    for (const name of chars) html += _buildCharHudHtml(name, rpg);
    html += '</div>';

    const panel = messageEl.querySelector('.horae-message-panel');
    if (panel) {
        panel.insertAdjacentHTML('beforebegin', html);
        const hudEl = messageEl.querySelector('.horae-rpg-hud');
        if (hudEl) {
            const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
            if (w < 100) hudEl.style.maxWidth = `${w}%`;
            const ofs = Math.max(0, settings.panelOffset || 0);
            if (ofs > 0) hudEl.style.marginLeft = `${ofs}px`;
            if (isLightMode()) hudEl.classList.add('horae-light');
        }
    }
}

/** 刷新所有可见面板的 RPG HUD */
function updateAllRpgHuds() {
    if (!settings.rpgMode || settings.sendRpgBars === false) return;
    // 单次前向遍历构建每条消息的 RPG 累积快照
    const chat = horaeManager.getChat();
    if (!chat?.length) return;
    const snapMap = _buildRpgSnapshotMap(chat);
    document.querySelectorAll('.mes').forEach(mesEl => {
        const id = parseInt(mesEl.getAttribute('mesid'));
        if (!isNaN(id)) _renderRpgHudFromSnapshot(mesEl, id, snapMap.get(id));
    });
}

/** 单次遍历构建消息→RPG快照的映射 */
function _buildRpgSnapshotMap(chat) {
    const map = new Map();
    const baseRpg = chat[0]?.horae_meta?.rpg || {};
    const acc = {
        bars: {}, status: {}, skills: {}, attributes: {},
        levels: { ...(baseRpg.levels || {}) },
        xp: { ...(baseRpg.xp || {}) },
        currency: JSON.parse(JSON.stringify(baseRpg.currency || {})),
    };
    const resolve = (raw) => horaeManager._resolveRpgOwner(raw);
    const _bCfgs = chat[0]?.horae_meta?._rpgConfigs;
    const curConfig = _bCfgs?.currencyConfig || baseRpg.currencyConfig || { denominations: [] };
    const validDenoms = new Set((curConfig.denominations || []).map(d => d.name));

    for (let i = 0; i < chat.length; i++) {
        const changes = chat[i]?.horae_meta?._rpgChanges;
        if (changes && i > 0) {
            for (const [raw, bd] of Object.entries(changes.bars || {})) {
                const o = resolve(raw);
                if (!acc.bars[o]) acc.bars[o] = {};
                Object.assign(acc.bars[o], bd);
            }
            for (const [raw, ef] of Object.entries(changes.status || {})) {
                acc.status[resolve(raw)] = ef;
            }
            for (const sk of (changes.skills || [])) {
                const o = resolve(sk.owner);
                if (!acc.skills[o]) acc.skills[o] = [];
                const idx = acc.skills[o].findIndex(s => s.name === sk.name);
                if (idx >= 0) { if (sk.level) acc.skills[o][idx].level = sk.level; if (sk.desc) acc.skills[o][idx].desc = sk.desc; }
                else acc.skills[o].push({ name: sk.name, level: sk.level, desc: sk.desc });
            }
            for (const sk of (changes.removedSkills || [])) {
                const o = resolve(sk.owner);
                if (acc.skills[o]) acc.skills[o] = acc.skills[o].filter(s => s.name !== sk.name);
            }
            for (const [raw, vals] of Object.entries(changes.attributes || {})) {
                const o = resolve(raw);
                acc.attributes[o] = { ...(acc.attributes[o] || {}), ...vals };
            }
            for (const [raw, val] of Object.entries(changes.levels || {})) {
                acc.levels[resolve(raw)] = val;
            }
            for (const [raw, val] of Object.entries(changes.xp || {})) {
                acc.xp[resolve(raw)] = val;
            }
            for (const c of (changes.currency || [])) {
                const o = resolve(c.owner);
                if (!validDenoms.has(c.name)) continue;
                if (!acc.currency[o]) acc.currency[o] = {};
                if (c.isDelta) {
                    acc.currency[o][c.name] = (acc.currency[o][c.name] || 0) + c.value;
                } else {
                    acc.currency[o][c.name] = c.value;
                }
            }
        }
        const snap = JSON.parse(JSON.stringify(acc));
        snap.currencyConfig = curConfig;
        map.set(i, snap);
    }
    return map;
}

/** 用预构建的快照渲染单条消息的 RPG HUD */
function _renderRpgHudFromSnapshot(messageEl, messageIndex, rpg) {
    const old = messageEl.querySelector('.horae-rpg-hud');
    if (old) old.remove();
    if (!rpg) return;

    const meta = horaeManager.getMessageMeta(messageIndex);
    const present = meta?.scene?.characters_present || [];
    if (present.length === 0) return;

    let chars = _matchPresentChars(present, rpg);
    if (settings.rpgBarsUserOnly) {
        const _huN = getContext().name1 || '';
        chars = chars.filter(n => n === _huN);
    }
    if (chars.length === 0) return;

    let html = '<div class="horae-rpg-hud">';
    for (const name of chars) html += _buildCharHudHtml(name, rpg);
    html += '</div>';

    const panel = messageEl.querySelector('.horae-message-panel');
    if (panel) {
        panel.insertAdjacentHTML('beforebegin', html);
        const hudEl = messageEl.querySelector('.horae-rpg-hud');
        if (hudEl) {
            const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
            if (w < 100) hudEl.style.maxWidth = `${w}%`;
            const ofs = Math.max(0, settings.panelOffset || 0);
            if (ofs > 0) hudEl.style.marginLeft = `${ofs}px`;
            if (isLightMode()) hudEl.classList.add('horae-light');
        }
    }
}

/**
 * 刷新所有显示
 */
function refreshAllDisplays() {
    buildPanelContent._affCache = null;
    enforceHiddenState();
    updateStatusDisplay();
    updateAgendaDisplay();
    updateTimelineDisplay();
    updateCharactersDisplay();
    updateItemsDisplay();
    updateLocationMemoryDisplay();
    updateRpgDisplay();
    updateTokenCounter();
}

/** chat[0] 上的全局键——无法由 rebuild 系列函数重建，需在 meta 重置时保留 */
const _GLOBAL_META_KEYS = [
    'autoSummaries', '_deletedNpcs', '_deletedAgendaTexts',
    'locationMemory', 'relationships', 'rpg',
    '_rpgConfigs', '_pendingScanReview',
];

function _saveGlobalMeta(meta) {
    if (!meta) return null;
    const saved = {};
    for (const key of _GLOBAL_META_KEYS) {
        if (meta[key] !== undefined) saved[key] = meta[key];
    }
    return Object.keys(saved).length ? saved : null;
}

function _restoreGlobalMeta(meta, saved) {
    if (!saved || !meta) return;
    for (const key of _GLOBAL_META_KEYS) {
        if (saved[key] === undefined) continue;
        if (meta[key] === undefined) {
            meta[key] = saved[key];
        } else if (key === 'rpg' && typeof saved[key] === 'object' && typeof meta[key] === 'object') {
            for (const rk of Object.keys(saved[key])) {
                if (meta[key][rk] === undefined) {
                    meta[key][rk] = saved[key][rk];
                }
            }
        }
    }
}

/**
 * 提取消息事件上的摘要压缩标记（_compressedBy / _summaryId），
 * 用于在 createEmptyMeta() 重置后恢复，防止摘要事件从时间线中逃逸
 */
function _saveCompressedFlags(meta) {
    if (!meta?.events?.length) return null;
    const flags = [];
    for (const evt of meta.events) {
        if (evt._compressedBy || evt._summaryId) {
            flags.push({
                summary: evt.summary || '',
                _compressedBy: evt._compressedBy || null,
                _summaryId: evt._summaryId || null,
                isSummary: !!evt.isSummary,
            });
        }
    }
    return flags.length ? flags : null;
}

/**
 * 将保存的压缩标记恢复到重新解析后的事件上；
 * 若新事件数量少于保存的标记，则将多出的摘要事件追加回去
 */
function _restoreCompressedFlags(meta, saved) {
    if (!saved?.length || !meta) return;
    if (!meta.events) meta.events = [];
    const nonSummaryFlags = saved.filter(f => !f.isSummary);
    const summaryFlags = saved.filter(f => f.isSummary);
    for (let i = 0; i < Math.min(nonSummaryFlags.length, meta.events.length); i++) {
        const evt = meta.events[i];
        if (evt.isSummary || evt._summaryId) continue;
        if (nonSummaryFlags[i]._compressedBy) {
            evt._compressedBy = nonSummaryFlags[i]._compressedBy;
        }
    }
    // 如果非摘要事件数量不匹配，按 summaryId 暴力匹配
    if (nonSummaryFlags.length > 0 && meta.events.length > 0) {
        const chat = horaeManager.getChat();
        const sums = chat?.[0]?.horae_meta?.autoSummaries || [];
        const activeSumIds = new Set(sums.filter(s => s.active).map(s => s.id));
        for (const evt of meta.events) {
            if (evt.isSummary || evt._summaryId || evt._compressedBy) continue;
            const matchFlag = nonSummaryFlags.find(f => f._compressedBy && activeSumIds.has(f._compressedBy));
            if (matchFlag) evt._compressedBy = matchFlag._compressedBy;
        }
    }
    // 将摘要卡片事件追加回去（processAIResponse 不会从原文解析出摘要卡片）
    for (const sf of summaryFlags) {
        const alreadyExists = meta.events.some(e => e._summaryId === sf._summaryId);
        if (!alreadyExists && sf._summaryId) {
            meta.events.push({
                summary: sf.summary,
                isSummary: true,
                _summaryId: sf._summaryId,
                level: '摘要',
            });
        }
    }
}

/**
 * 清理孤儿摘要：如果某个 active 摘要的卡片事件在整个聊天中找不到，
 * 则清除该摘要范围内的 _compressedBy / is_hidden，并将摘要标记为 inactive。
 * 返回清理的摘要数量。
 */
function cleanOrphanSummaries() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return 0;
    const sums = chat[0]?.horae_meta?.autoSummaries;
    if (!sums?.length) return 0;

    let cleaned = 0;
    for (const s of sums) {
        if (!s.active || !s.range || !s.id) continue;
        const summaryId = s.id;
        let cardFound = false;
        for (let i = s.range[0]; i <= s.range[1] && i < chat.length; i++) {
            const evts = chat[i]?.horae_meta?.events;
            if (evts?.some(e => e._summaryId === summaryId && e.isSummary)) {
                cardFound = true;
                break;
            }
        }
        if (cardFound) continue;

        console.log(`[Horae] 孤儿摘要 ${summaryId}: 卡片事件缺失，清理压缩标记`);
        s.active = false;
        for (let i = s.range[0]; i <= s.range[1] && i < chat.length; i++) {
            if (i === 0 || !chat[i]) continue;
            if (chat[i].is_hidden) {
                chat[i].is_hidden = false;
                const $el = $(`.mes[mesid="${i}"]`);
                if ($el.length) $el.attr('is_hidden', 'false');
            }
            const evts = chat[i]?.horae_meta?.events;
            if (evts) {
                for (const evt of evts) {
                    if (evt._compressedBy === summaryId) delete evt._compressedBy;
                }
            }
        }
        cleaned++;
    }
    if (cleaned > 0) {
        console.log(`[Horae] cleanOrphanSummaries: 清理了 ${cleaned} 个孤儿摘要`);
    }
    return cleaned;
}

/**
 * 校验并修复摘要范围内消息的 is_hidden 和 _compressedBy 状态，
 * 防止 SillyTavern 重渲染或 saveChat 竞态导致隐藏/压缩标记丢失。
 * 会先清理孤儿摘要，再对仍然有效的摘要补全标记。
 */
async function enforceHiddenState() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return;
    const sums = chat[0]?.horae_meta?.autoSummaries;
    if (!sums?.length) return;

    const orphansCleaned = cleanOrphanSummaries();

    let fixed = 0;
    for (const s of sums) {
        if (!s.active || !s.range) continue;
        const summaryId = s.id;
        for (let i = s.range[0]; i <= s.range[1]; i++) {
            if (i === 0 || !chat[i]) continue;
            if (!chat[i].is_hidden) {
                chat[i].is_hidden = true;
                fixed++;
                const $el = $(`.mes[mesid="${i}"]`);
                if ($el.length) $el.attr('is_hidden', 'true');
            }
            const events = chat[i].horae_meta?.events;
            if (events) {
                for (const evt of events) {
                    if (!evt.isSummary && !evt._summaryId && !evt._compressedBy) {
                        evt._compressedBy = summaryId;
                        fixed++;
                    }
                }
            }
        }
    }
    if (fixed > 0 || orphansCleaned > 0) {
        console.log(`[Horae] enforceHiddenState: 修复了 ${fixed} 处摘要状态, 清理了 ${orphansCleaned} 个孤儿`);
        await getContext().saveChat();
    }
}

/**
 * 手动一键修复：先清理孤儿摘要，再对仍然有效的活跃摘要
 * 强制恢复 is_hidden + _compressedBy，并同步 DOM 属性。返回修复的条目数。
 */
function repairAllSummaryStates() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return 0;
    const sums = chat[0]?.horae_meta?.autoSummaries;
    if (!sums?.length) return 0;

    const orphansCleaned = cleanOrphanSummaries();

    let fixed = 0;
    for (const s of sums) {
        if (!s.active || !s.range) continue;
        const summaryId = s.id;
        for (let i = s.range[0]; i <= s.range[1]; i++) {
            if (i === 0 || !chat[i]) continue;
            if (!chat[i].is_hidden) {
                chat[i].is_hidden = true;
                fixed++;
            }
            const $el = $(`.mes[mesid="${i}"]`);
            if ($el.length) $el.attr('is_hidden', 'true');
            const events = chat[i].horae_meta?.events;
            if (events) {
                for (const evt of events) {
                    if (!evt.isSummary && !evt._summaryId && !evt._compressedBy) {
                        evt._compressedBy = summaryId;
                        fixed++;
                    }
                }
            }
        }
    }
    if (fixed > 0 || orphansCleaned > 0) {
        console.log(`[Horae] repairAllSummaryStates: 修复了 ${fixed} 处, 清理了 ${orphansCleaned} 个孤儿`);
        getContext().saveChat();
    }
    return fixed + orphansCleaned;
}

/** 刷新所有已展开的底部面板 */
function refreshVisiblePanels() {
    document.querySelectorAll('.horae-message-panel').forEach(panelEl => {
        const msgEl = panelEl.closest('.mes');
        if (!msgEl) return;
        const msgId = parseInt(msgEl.getAttribute('mesid'));
        if (isNaN(msgId)) return;
        const chat = horaeManager.getChat();
        const meta = chat?.[msgId]?.horae_meta;
        if (!meta) return;
        const contentEl = panelEl.querySelector('.horae-panel-content');
        if (contentEl) {
            contentEl.innerHTML = buildPanelContent(msgId, meta);
            bindPanelEvents(panelEl);
        }
    });
}

/**
 * 更新场景记忆列表显示
 */
function updateLocationMemoryDisplay() {
    const listEl = document.getElementById('horae-location-list');
    if (!listEl) return;
    
    const locMem = horaeManager.getLocationMemory();
    const entries = Object.entries(locMem).filter(([, info]) => !info._deleted);
    const currentLoc = horaeManager.getLatestState()?.scene?.location || '';
    
    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="horae-empty-state">
                <i class="fa-solid fa-map-location-dot"></i>
                <span>${t('locations.noLocations')}</span>
                <span style="font-size:11px;opacity:0.6;margin-top:4px;">${t('locations.noLocationsHint')}</span>
            </div>`;
        return;
    }
    
    // 按父级分组：「酒馆·大厅」→ parent=酒馆, child=大厅
    const SEP = /[·・\-\/\|]/;
    const groups = {};   // { parentName: { info?, children: [{name,info}] } }
    const standalone = []; // 无子级的独立条目
    
    for (const [name, info] of entries) {
        const sepMatch = name.match(SEP);
        if (sepMatch) {
            const parent = name.substring(0, sepMatch.index).trim();
            if (!groups[parent]) groups[parent] = { children: [] };
            groups[parent].children.push({ name, info });
            // 如果恰好也存在同名的父级条目，关联
            if (locMem[parent]) groups[parent].info = locMem[parent];
        } else if (groups[name]) {
            groups[name].info = info;
        } else {
            // 检查是否已有子级引用
            const hasChildren = entries.some(([n]) => n !== name && n.startsWith(name) && SEP.test(n.charAt(name.length)));
            if (hasChildren) {
                if (!groups[name]) groups[name] = { children: [] };
                groups[name].info = info;
            } else {
                standalone.push({ name, info });
            }
        }
    }
    
    const buildCard = (name, info, indent = false) => {
        const isCurrent = name === currentLoc || currentLoc.includes(name) || name.includes(currentLoc);
        const currentClass = isCurrent ? 'horae-location-current' : '';
        const currentBadge = isCurrent ? `<span class="horae-loc-current-badge">${t('ui.currentBadge')}</span>` : '';
        const dateStr = info.lastUpdated ? new Date(info.lastUpdated).toLocaleDateString() : '';
        const indentClass = indent ? ' horae-loc-child' : '';
        const displayName = indent ? name.split(SEP).pop().trim() : name;
        return `
            <div class="horae-location-card ${currentClass}${indentClass}" data-location-name="${escapeHtml(name)}">
                <div class="horae-loc-header">
                    <div class="horae-loc-name"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(displayName)} ${currentBadge}</div>
                    <div class="horae-loc-actions">
                        <button class="horae-loc-edit" title="${t('common.edit')}"><i class="fa-solid fa-pen"></i></button>
                        <button class="horae-loc-delete" title="${t('common.delete')}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="horae-loc-desc">${info.desc || `<span class="horae-empty-hint">${t('ui.noDescription')}</span>`}</div>
                ${dateStr ? `<div class="horae-loc-date">${dateStr}</div>` : ''}
            </div>`;
    };
    
    let html = '';
    // 渲染有子级的分组
    for (const [parentName, group] of Object.entries(groups)) {
        const isParentCurrent = currentLoc.startsWith(parentName);
        html += `<div class="horae-loc-group${isParentCurrent ? ' horae-loc-group-active' : ''}">
            <div class="horae-loc-group-header" data-parent="${escapeHtml(parentName)}">
                <i class="fa-solid fa-chevron-${isParentCurrent ? 'down' : 'right'} horae-loc-fold-icon"></i>
                <i class="fa-solid fa-building"></i> <strong>${escapeHtml(parentName)}</strong>
                <span class="horae-loc-group-count">${group.children.length + (group.info ? 1 : 0)}</span>
            </div>
            <div class="horae-loc-group-body" style="display:${isParentCurrent ? 'block' : 'none'};">`;
        if (group.info) html += buildCard(parentName, group.info, false);
        for (const child of group.children) html += buildCard(child.name, child.info, true);
        html += '</div></div>';
    }
    // 渲染独立条目
    for (const { name, info } of standalone) html += buildCard(name, info, false);
    
    listEl.innerHTML = html;
    
    // 折叠切换
    listEl.querySelectorAll('.horae-loc-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const icon = header.querySelector('.horae-loc-fold-icon');
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'block' : 'none';
            icon.className = `fa-solid fa-chevron-${hidden ? 'down' : 'right'} horae-loc-fold-icon`;
        });
    });
    
    listEl.querySelectorAll('.horae-loc-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.closest('.horae-location-card').dataset.locationName;
            openLocationEditModal(name);
        });
    });
    
    listEl.querySelectorAll('.horae-loc-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.closest('.horae-location-card').dataset.locationName;
            if (!confirm(t('confirm.deleteLocation', {name}))) return;
            const chat = horaeManager.getChat();
            if (chat?.[0]?.horae_meta?.locationMemory) {
                // 标记为已删除而非直接delete，防止rebuildLocationMemory从历史消息重建
                chat[0].horae_meta.locationMemory[name] = {
                    ...chat[0].horae_meta.locationMemory[name],
                    _deleted: true
                };
                await getContext().saveChat();
                updateLocationMemoryDisplay();
                showToast(t('toast.saveSuccess'), 'info');
            }
        });
    });
}

/**
 * 打开场景记忆编辑弹窗
 */
function openLocationEditModal(locationName) {
    closeEditModal();
    const locMem = horaeManager.getLocationMemory();
    const isNew = !locationName || !locMem[locationName];
    const existing = isNew ? { desc: '' } : locMem[locationName];
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-map-location-dot"></i> ${isNew ? t('locations.addLocation') : t('modal.editLocation')}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>${t('label.locationNameLabel')}</label>
                        <input type="text" id="horae-loc-edit-name" value="${escapeHtml(locationName || '')}" placeholder="${t('placeholder.locationName')}">
                    </div>
                    <div class="horae-edit-field">
                        <label>${t('label.sceneDescription')}</label>
                        <textarea id="horae-loc-edit-desc" rows="5" placeholder="${t('placeholder.locationDesc')}">${escapeHtml(existing.desc || '')}</textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-loc-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> ${t('common.save')}
                    </button>
                    <button id="horae-loc-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> ${t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    document.getElementById('horae-loc-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = document.getElementById('horae-loc-edit-name').value.trim();
        const desc = document.getElementById('horae-loc-edit-desc').value.trim();
        if (!name) { showToast(t('toast.locationNameRequired'), 'warning'); return; }
        
        const chat = horaeManager.getChat();
        if (!chat?.length) return;
        if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
        if (!chat[0].horae_meta.locationMemory) chat[0].horae_meta.locationMemory = {};
        const mem = chat[0].horae_meta.locationMemory;
        
        const now = new Date().toISOString();
        if (isNew) {
            mem[name] = { desc, firstSeen: now, lastUpdated: now, _userEdited: true };
        } else if (locationName !== name) {
            // 改名：级联更新子级 + 记录曾用名
            const SEP = /[·・\-\/\|]/;
            const oldEntry = mem[locationName] || {};
            const aliases = oldEntry._aliases || [];
            if (!aliases.includes(locationName)) aliases.push(locationName);
            delete mem[locationName];
            mem[name] = { ...oldEntry, desc, lastUpdated: now, _userEdited: true, _aliases: aliases };
            // 检测是否为父级改名，级联所有子级
            const childKeys = Object.keys(mem).filter(k => {
                const sepMatch = k.match(SEP);
                return sepMatch && k.substring(0, sepMatch.index).trim() === locationName;
            });
            for (const childKey of childKeys) {
                const sepMatch = childKey.match(SEP);
                const childPart = childKey.substring(sepMatch.index);
                const newChildKey = name + childPart;
                const childEntry = mem[childKey];
                const childAliases = childEntry._aliases || [];
                if (!childAliases.includes(childKey)) childAliases.push(childKey);
                delete mem[childKey];
                mem[newChildKey] = { ...childEntry, lastUpdated: now, _aliases: childAliases };
            }
        } else {
            mem[name] = { ...existing, desc, lastUpdated: now, _userEdited: true };
        }
        
        await getContext().saveChat();
        closeEditModal();
        updateLocationMemoryDisplay();
        showToast(t('toast.saveSuccess'), 'success');
    });
    
    document.getElementById('horae-loc-cancel').addEventListener('click', () => closeEditModal());
}

/**
 * 合并两个地点的场景记忆
 */
function openLocationMergeModal() {
    closeEditModal();
    const locMem = horaeManager.getLocationMemory();
    const entries = Object.entries(locMem).filter(([, info]) => !info._deleted);
    
    if (entries.length < 2) {
        showToast(t('toast.mergeMin2'), 'warning');
        return;
    }
    
    const options = entries.map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-code-merge"></i> ${t('modal.mergeLocations')}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-setting-hint" style="margin-bottom: 12px;">
                        <i class="fa-solid fa-circle-info"></i>
                        ${t('locations.mergeLocations')}
                    </div>
                    <div class="horae-edit-field">
                        <label>${t('label.mergeSource')}</label>
                        <select id="horae-merge-source">${options}</select>
                    </div>
                    <div class="horae-edit-field">
                        <label>${t('label.mergeTarget')}</label>
                        <select id="horae-merge-target">${options}</select>
                    </div>
                    <div id="horae-merge-preview" class="horae-merge-preview" style="display:none;">
                        <strong>${t('ui.mergePreviewLabel')}</strong><br><span id="horae-merge-preview-text"></span>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-merge-confirm" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> ${t('common.confirm')}
                    </button>
                    <button id="horae-merge-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> ${t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    if (entries.length >= 2) {
        document.getElementById('horae-merge-target').selectedIndex = 1;
    }
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    const updatePreview = () => {
        const source = document.getElementById('horae-merge-source').value;
        const target = document.getElementById('horae-merge-target').value;
        const previewEl = document.getElementById('horae-merge-preview');
        const textEl = document.getElementById('horae-merge-preview-text');
        
        if (source === target) {
            previewEl.style.display = 'block';
            textEl.textContent = t('ui.sameSourceTarget');
            return;
        }
        
        const sourceDesc = locMem[source]?.desc || '';
        const targetDesc = locMem[target]?.desc || '';
        const merged = targetDesc + (targetDesc && sourceDesc ? '\n' : '') + sourceDesc;
        previewEl.style.display = 'block';
        textEl.textContent = t('ui.mergePreview', {source, target, desc: merged.substring(0, 100) + (merged.length > 100 ? '...' : '')});
    };
    
    document.getElementById('horae-merge-source').addEventListener('change', updatePreview);
    document.getElementById('horae-merge-target').addEventListener('change', updatePreview);
    updatePreview();
    
    document.getElementById('horae-merge-confirm').addEventListener('click', async (e) => {
        e.stopPropagation();
        const source = document.getElementById('horae-merge-source').value;
        const target = document.getElementById('horae-merge-target').value;
        
        if (source === target) {
            showToast(t('toast.mergeSameError'), 'warning');
            return;
        }
        
        if (!confirm(t('confirm.deleteLocation', {name: source}))) return;
        
        const chat = horaeManager.getChat();
        const mem = chat?.[0]?.horae_meta?.locationMemory;
        if (!mem) return;
        
        const sourceDesc = mem[source]?.desc || '';
        const targetDesc = mem[target]?.desc || '';
        mem[target].desc = targetDesc + (targetDesc && sourceDesc ? '\n' : '') + sourceDesc;
        mem[target].lastUpdated = new Date().toISOString();
        delete mem[source];
        
        await getContext().saveChat();
        closeEditModal();
        updateLocationMemoryDisplay();
        showToast(t('toast.saveSuccess'), 'success');
    });
    
    document.getElementById('horae-merge-cancel').addEventListener('click', () => closeEditModal());
}

function updateTokenCounter() {
    const el = document.getElementById('horae-token-value');
    if (!el) return;
    try {
        const dataPrompt = horaeManager.generateCompactPrompt();
        const rulesPrompt = horaeManager.generateSystemPromptAddition();
        const combined = `${dataPrompt}\n${rulesPrompt}`;
        const tokens = estimateTokens(combined);
        el.textContent = `≈ ${tokens.toLocaleString()}`;
    } catch (err) {
        console.warn('[Horae] Token 计数失败:', err);
        el.textContent = '--';
    }
}

/**
 * 滚动到指定消息（支持折叠/懒加载的消息展开跳转）
 */
async function scrollToMessage(messageId) {
    let messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.classList.add('horae-highlight');
        setTimeout(() => messageEl.classList.remove('horae-highlight'), 2000);
        return;
    }
    // 消息不在 DOM 中（被酒馆折叠/懒加载），提示用户展开
    if (!confirm(t('confirm.jumpToFarMessage', {id: messageId}))) return;
    try {
        const slashModule = await import('/scripts/slash-commands.js');
        const exec = slashModule.executeSlashCommandsWithOptions;
        await exec(`/go ${messageId}`);
        await new Promise(r => setTimeout(r, 300));
        messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.classList.add('horae-highlight');
            setTimeout(() => messageEl.classList.remove('horae-highlight'), 2000);
        } else {
            showToast(t('toast.jumpFailed', {id: messageId}), 'warning');
        }
    } catch (err) {
        console.warn('[Horae] 跳转失败:', err);
        showToast(t('toast.jumpError', {error: err.message || 'unknown'}), 'error');
    }
}

/** 应用顶部图标可见性 */
function applyTopIconVisibility() {
    const show = settings.showTopIcon !== false;
    if (show) {
        $('#horae_drawer').show();
    } else {
        // 先关闭抽屉再隐藏
        if ($('#horae_drawer_icon').hasClass('openIcon')) {
            $('#horae_drawer_icon').toggleClass('openIcon closedIcon');
            $('#horae_drawer_content').toggleClass('openDrawer closedDrawer').hide();
        }
        $('#horae_drawer').hide();
    }
    // 同步两处开关
    $('#horae-setting-show-top-icon').prop('checked', show);
    $('#horae-ext-show-top-icon').prop('checked', show);
}

/** 应用消息面板宽度和偏移设置（底部栏 + RPG HUD 统一跟随） */
function applyPanelWidth() {
    const width = Math.max(50, Math.min(100, settings.panelWidth || 100));
    const offset = Math.max(0, settings.panelOffset || 0);
    const mw = width < 100 ? `${width}%` : '';
    const ml = offset > 0 ? `${offset}px` : '';
    document.querySelectorAll('.horae-message-panel, .horae-rpg-hud').forEach(el => {
        el.style.maxWidth = mw;
        el.style.marginLeft = ml;
    });
}

/** 内置预设主题 */
const BUILTIN_THEMES = {
    'sakura': {
        name: '樱花粉',
        variables: {
            '--horae-primary': '#ec4899', '--horae-primary-light': '#f472b6', '--horae-primary-dark': '#be185d',
            '--horae-accent': '#fb923c', '--horae-success': '#34d399', '--horae-warning': '#fbbf24',
            '--horae-danger': '#f87171', '--horae-info': '#60a5fa',
            '--horae-bg': '#1f1018', '--horae-bg-secondary': '#2d1825', '--horae-bg-hover': '#3d2535',
            '--horae-border': 'rgba(236, 72, 153, 0.15)', '--horae-text': '#fce7f3', '--horae-text-muted': '#d4a0b9',
            '--horae-shadow': '0 4px 20px rgba(190, 24, 93, 0.2)'
        }
    },
    'forest': {
        name: '森林绿',
        variables: {
            '--horae-primary': '#059669', '--horae-primary-light': '#34d399', '--horae-primary-dark': '#047857',
            '--horae-accent': '#fbbf24', '--horae-success': '#10b981', '--horae-warning': '#f59e0b',
            '--horae-danger': '#ef4444', '--horae-info': '#60a5fa',
            '--horae-bg': '#0f1a14', '--horae-bg-secondary': '#1a2e22', '--horae-bg-hover': '#2a3e32',
            '--horae-border': 'rgba(16, 185, 129, 0.15)', '--horae-text': '#d1fae5', '--horae-text-muted': '#6ee7b7',
            '--horae-shadow': '0 4px 20px rgba(4, 120, 87, 0.2)'
        }
    },
    'ocean': {
        name: '海洋蓝',
        variables: {
            '--horae-primary': '#3b82f6', '--horae-primary-light': '#60a5fa', '--horae-primary-dark': '#1d4ed8',
            '--horae-accent': '#f59e0b', '--horae-success': '#10b981', '--horae-warning': '#f59e0b',
            '--horae-danger': '#ef4444', '--horae-info': '#93c5fd',
            '--horae-bg': '#0c1929', '--horae-bg-secondary': '#162a45', '--horae-bg-hover': '#1e3a5f',
            '--horae-border': 'rgba(59, 130, 246, 0.15)', '--horae-text': '#dbeafe', '--horae-text-muted': '#93c5fd',
            '--horae-shadow': '0 4px 20px rgba(29, 78, 216, 0.2)'
        }
    }
};

/** 获取当前主题对象（内置或自定义） */
function resolveTheme(mode) {
    if (BUILTIN_THEMES[mode]) return BUILTIN_THEMES[mode];
    if (mode.startsWith('custom-')) {
        const idx = parseInt(mode.split('-')[1]);
        return (settings.customThemes || [])[idx] || null;
    }
    return null;
}

function isLightMode() {
    const mode = settings.themeMode || 'dark';
    if (mode === 'light') return true;
    const theme = resolveTheme(mode);
    return !!(theme && theme.isLight);
}

/** 应用主题模式（dark / light / 内置预设 / custom-{index}） */
function applyThemeMode() {
    const mode = settings.themeMode || 'dark';
    const theme = resolveTheme(mode);
    const isLight = mode === 'light' || !!(theme && theme.isLight);
    const hasCustomVars = !!(theme && theme.variables);

    // 切换 horae-light 类（日间模式需要此类激活 UI 细节样式如 checkbox 边框等）
    const targets = [
        document.getElementById('horae_drawer'),
        ...document.querySelectorAll('.horae-message-panel'),
        ...document.querySelectorAll('.horae-modal'),
        ...document.querySelectorAll('.horae-rpg-hud')
    ].filter(Boolean);
    targets.forEach(el => el.classList.toggle('horae-light', isLight));

    // 注入主题变量
    let themeStyleEl = document.getElementById('horae-theme-vars');
    if (hasCustomVars) {
        if (!themeStyleEl) {
            themeStyleEl = document.createElement('style');
            themeStyleEl.id = 'horae-theme-vars';
            document.head.appendChild(themeStyleEl);
        }
        const vars = Object.entries(theme.variables)
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n');
        // 日间自定义主题：必须追加 .horae-light 选择器以覆盖 style.css 中同名类的默认变量
        const needsLightOverride = isLight && mode !== 'light';
        const selectors = needsLightOverride
            ? '#horae_drawer,\n#horae_drawer.horae-light,\n.horae-message-panel,\n.horae-message-panel.horae-light,\n.horae-modal,\n.horae-modal.horae-light,\n.horae-context-menu,\n.horae-context-menu.horae-light,\n.horae-rpg-hud,\n.horae-rpg-hud.horae-light,\n.horae-rpg-dice-panel,\n.horae-rpg-dice-panel.horae-light,\n.horae-progress-overlay,\n.horae-progress-overlay.horae-light'
            : '#horae_drawer,\n.horae-message-panel,\n.horae-modal,\n.horae-context-menu,\n.horae-rpg-hud,\n.horae-rpg-dice-panel,\n.horae-progress-overlay';
        themeStyleEl.textContent = `${selectors} {\n${vars}\n}`;
    } else {
        if (themeStyleEl) themeStyleEl.remove();
    }

    // 注入主题附带CSS
    let themeCssEl = document.getElementById('horae-theme-css');
    if (theme && theme.css) {
        if (!themeCssEl) {
            themeCssEl = document.createElement('style');
            themeCssEl.id = 'horae-theme-css';
            document.head.appendChild(themeCssEl);
        }
        themeCssEl.textContent = theme.css;
    } else {
        if (themeCssEl) themeCssEl.remove();
    }
}

/** 注入用户自定义CSS */
function applyCustomCSS() {
    let styleEl = document.getElementById('horae-custom-style');
    const css = (settings.customCSS || '').trim();
    if (!css) {
        if (styleEl) styleEl.remove();
        return;
    }
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'horae-custom-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
}

/** 导出当前美化为JSON文件 */
function exportTheme() {
    const theme = {
        name: '我的Horae美化',
        author: '',
        version: '1.0',
        variables: {},
        css: settings.customCSS || ''
    };
    // 读取当前主题变量
    const root = document.getElementById('horae_drawer');
    if (root) {
        const style = getComputedStyle(root);
        const varNames = [
            '--horae-primary', '--horae-primary-light', '--horae-primary-dark',
            '--horae-accent', '--horae-success', '--horae-warning', '--horae-danger', '--horae-info',
            '--horae-bg', '--horae-bg-secondary', '--horae-bg-hover',
            '--horae-border', '--horae-text', '--horae-text-muted',
            '--horae-shadow', '--horae-radius', '--horae-radius-sm'
        ];
        varNames.forEach(name => {
            const val = style.getPropertyValue(name).trim();
            if (val) theme.variables[name] = val;
        });
    }
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'horae-theme.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('toast.configExported'), 'info');
}

/** 导入美化JSON文件 */
function importTheme() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const theme = JSON.parse(text);
            if (!theme.variables || typeof theme.variables !== 'object') {
                showToast(t('toast.themeInvalidFile'), 'error');
                return;
            }
            theme.name = theme.name || file.name.replace('.json', '');
            if (!settings.customThemes) settings.customThemes = [];
            settings.customThemes.push(theme);
            saveSettings();
            refreshThemeSelector();
            showToast(t('toast.themeImported', {name: theme.name}), 'success');
        } catch (err) {
            showToast(t('toast.themeParseFailed'), 'error');
            console.error('[Horae] 导入美化失败:', err);
        }
    });
    input.click();
}

/** 刷新主题选择器下拉选项 */
function refreshThemeSelector() {
    const sel = document.getElementById('horae-setting-theme-mode');
    if (!sel) return;
    // 清除动态选项（内置预设 + 用户导入）
    sel.querySelectorAll('option:not([value="dark"]):not([value="light"])').forEach(o => o.remove());
    // 内置预设主题
    for (const [key, theme] of Object.entries(BUILTIN_THEMES)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `🎨 ${theme.name}`;
        sel.appendChild(opt);
    }
    // 用户导入的主题
    const themes = settings.customThemes || [];
    themes.forEach((theme, i) => {
        const opt = document.createElement('option');
        opt.value = `custom-${i}`;
        opt.textContent = `📁 ${theme.name}`;
        sel.appendChild(opt);
    });
    sel.value = settings.themeMode || 'dark';
}

/** 删除已导入的自定义主题 */
function deleteCustomTheme(index) {
    const themes = settings.customThemes || [];
    if (!themes[index]) return;
    if (!confirm(t('confirm.deleteTheme', {name: themes[index].name}))) return;
    const currentMode = settings.themeMode || 'dark';
    themes.splice(index, 1);
    settings.customThemes = themes;
    // 如果删除的是当前使用的主题，回退暗色
    if (currentMode === `custom-${index}` || (currentMode.startsWith('custom-') && parseInt(currentMode.split('-')[1]) >= index)) {
        settings.themeMode = 'dark';
        applyThemeMode();
    }
    saveSettings();
    refreshThemeSelector();
    showToast(t('toast.saveSuccess'), 'info');
}


export {
    _getEqConfigMap,
    _getCharEqConfig,
    _getEqValues,
    _saveEqData,
    renderEquipmentSlotConfig,
    renderEquipmentValues,
    _openAddEquipDialog,
    _bindEquipmentEvents,
    _openEquipTemplateManageModal,
    _getCurConfig,
    _saveCurData,
    renderCurrencyConfig,
    _renderCurrencyHint,
    _bindCurrencyEvents,
    _getStrongholdData,
    _saveStrongholdData,
    _genShId,
    _buildShTree,
    renderStrongholdTree,
    _renderShNodes,
    _openShEditDialog,
    _bindStrongholdEvents,
    renderLevelValues,
    _buildCharHudHtml,
    _matchPresentChars,
    renderRpgHud,
    updateAllRpgHuds,
    _buildRpgSnapshotMap,
    _renderRpgHudFromSnapshot,
    refreshAllDisplays,
    _saveGlobalMeta,
    _restoreGlobalMeta,
    _saveCompressedFlags,
    _restoreCompressedFlags,
    cleanOrphanSummaries,
    enforceHiddenState,
    repairAllSummaryStates,
    refreshVisiblePanels,
    updateLocationMemoryDisplay,
    openLocationEditModal,
    openLocationMergeModal,
    updateTokenCounter,
    scrollToMessage,
    applyTopIconVisibility,
    applyPanelWidth,
    resolveTheme,
    isLightMode,
    applyThemeMode,
    applyCustomCSS,
    exportTheme,
    importTheme,
    refreshThemeSelector,
    deleteCustomTheme
};
