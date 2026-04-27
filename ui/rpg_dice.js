import { settings, appState, saveSettings, getContext, showToast } from '../core/state.js';
import { horaeManager } from '../core/horaeManager.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

// ============================================
// RPG 骰子系统
// ============================================

const RPG_DICE_TYPES = [
    { faces: 4,   label: 'D4' },
    { faces: 6,   label: 'D6' },
    { faces: 8,   label: 'D8' },
    { faces: 10,  label: 'D10' },
    { faces: 12,  label: 'D12' },
    { faces: 20,  label: 'D20' },
    { faces: 100, label: 'D100' },
];

function rollDice(count, faces, modifier = 0) {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(Math.ceil(Math.random() * faces));
    const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
    const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
    return {
        notation: `${count}d${faces}${modStr}`,
        rolls,
        total: sum,
        display: `🎲 ${count}d${faces}${modStr} = [${rolls.join(', ')}]${modStr} = ${sum}`,
    };
}

function injectDiceToChat(text) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    const cur = textarea.value;
    textarea.value = cur ? `${cur}\n${text}` : text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
}

let _diceAbort = null;
function renderDicePanel() {
    if (_diceAbort) { _diceAbort.abort(); _diceAbort = null; }
    const existing = document.getElementById('horae-rpg-dice-panel');
    if (existing) existing.remove();
    if (!settings.rpgMode || !settings.rpgDiceEnabled) return;

    _diceAbort = new AbortController();
    const sig = _diceAbort.signal;

    const btns = RPG_DICE_TYPES.map(d =>
        `<button class="horae-rpg-dice-btn" data-faces="${d.faces}">${d.label}</button>`
    ).join('');

    const html = `
        <div id="horae-rpg-dice-panel" class="horae-rpg-dice-panel">
            <div class="horae-rpg-dice-toggle" title="${t('tooltip.diceDraggable')}">
                <i class="fa-solid fa-dice-d20"></i>
            </div>
            <div class="horae-rpg-dice-body" style="display:none;">
                <div class="horae-rpg-dice-types">${btns}</div>
                <div class="horae-rpg-dice-config">
                    <label>${t('ui.diceCount')}<input type="number" id="horae-dice-count" value="1" min="1" max="20" class="horae-rpg-dice-input"></label>
                    <label>${t('ui.diceMod')}<input type="number" id="horae-dice-mod" value="0" min="-99" max="99" class="horae-rpg-dice-input"></label>
                </div>
                <div class="horae-rpg-dice-result" id="horae-dice-result"></div>
                <button id="horae-dice-inject" class="horae-rpg-dice-inject" style="display:none;">
                    <i class="fa-solid fa-paper-plane"></i> ${t('ui.diceInject')}
                </button>
            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    document.body.appendChild(wrapper.firstChild);

    const panel = document.getElementById('horae-rpg-dice-panel');
    if (!panel) return;

    _applyDicePos(panel);

    let lastResult = null;
    let selectedFaces = 20;

    // ---- 拖拽逻辑（mouse + touch 双端通用） ----
    const toggle = panel.querySelector('.horae-rpg-dice-toggle');
    let dragging = false, dragMoved = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function onDragStart(e) {
        const ev = e.touches ? e.touches[0] : e;
        dragging = true; dragMoved = false;
        startX = ev.clientX; startY = ev.clientY;
        const rect = panel.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        panel.style.transition = 'none';
    }
    function onDragMove(e) {
        if (!dragging) return;
        const ev = e.touches ? e.touches[0] : e;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragMoved = true;
            // 首次移动时移除居中 transform，切换为绝对像素定位
            if (!panel.classList.contains('horae-dice-placed')) {
                panel.style.left = origLeft + 'px';
                panel.style.top = origTop + 'px';
                panel.classList.add('horae-dice-placed');
            }
        }
        if (!dragMoved) return;
        e.preventDefault();
        let nx = origLeft + dx, ny = origTop + dy;
        const vw = window.innerWidth, vh = window.innerHeight;
        nx = Math.max(0, Math.min(nx, vw - 48));
        ny = Math.max(0, Math.min(ny, vh - 48));
        panel.style.left = nx + 'px';
        panel.style.top = ny + 'px';
    }
    function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = '';
        if (dragMoved) {
            panel.classList.add('horae-dice-placed');
            settings.dicePosX = parseInt(panel.style.left);
            settings.dicePosY = parseInt(panel.style.top);
            panel.classList.toggle('horae-dice-flip-down', settings.dicePosY < 300);
            saveSettings();
        }
    }
    toggle.addEventListener('mousedown', onDragStart, { signal: sig });
    document.addEventListener('mousemove', onDragMove, { signal: sig });
    document.addEventListener('mouseup', onDragEnd, { signal: sig });
    toggle.addEventListener('touchstart', onDragStart, { passive: false, signal: sig });
    document.addEventListener('touchmove', onDragMove, { passive: false, signal: sig });
    document.addEventListener('touchend', onDragEnd, { signal: sig });

    // 点击展开/收起（仅无拖拽时触发）
    toggle.addEventListener('click', () => {
        if (dragMoved) return;
        const body = panel.querySelector('.horae-rpg-dice-body');
        body.style.display = body.style.display === 'none' ? '' : 'none';
    }, { signal: sig });

    panel.querySelectorAll('.horae-rpg-dice-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.faces) === selectedFaces);
        btn.addEventListener('click', () => {
            selectedFaces = parseInt(btn.dataset.faces);
            panel.querySelectorAll('.horae-rpg-dice-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const count = parseInt(document.getElementById('horae-dice-count')?.value) || 1;
            const mod = parseInt(document.getElementById('horae-dice-mod')?.value) || 0;
            lastResult = rollDice(count, selectedFaces, mod);
            const resultEl = document.getElementById('horae-dice-result');
            if (resultEl) resultEl.textContent = lastResult.display;
            const injectBtn = document.getElementById('horae-dice-inject');
            if (injectBtn) injectBtn.style.display = '';
        }, { signal: sig });
    });

    document.getElementById('horae-dice-inject')?.addEventListener('click', () => {
        if (lastResult) {
            injectDiceToChat(lastResult.display);
            showToast(t('toast.diceInjected'), 'success');
        }
    }, { signal: sig });
}

/** 应用骰子面板保存的位置；坐标超出当前视口则自动重置 */
function _applyDicePos(panel) {
    if (settings.dicePosX != null && settings.dicePosY != null) {
        const vw = window.innerWidth, vh = window.innerHeight;
        if (settings.dicePosX > vw || settings.dicePosY > vh) {
            settings.dicePosX = null;
            settings.dicePosY = null;
            return;
        }
        const x = Math.max(0, Math.min(settings.dicePosX, vw - 48));
        const y = Math.max(0, Math.min(settings.dicePosY, vh - 48));
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        panel.classList.add('horae-dice-placed');
        panel.classList.toggle('horae-dice-flip-down', y < 300);
    }
}

/** 渲染属性条配置列表 */
function renderBarConfig() {
    const list = document.getElementById('horae-rpg-bar-config-list');
    if (!list) return;
    const bars = settings.rpgBarConfig || [];
    list.innerHTML = bars.map((b, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-config-key" value="${escapeHtml(b.key)}" maxlength="10" data-idx="${i}" />
            <input class="horae-rpg-config-name" value="${escapeHtml(b.name)}" maxlength="8" data-idx="${i}" />
            <input type="color" class="horae-rpg-config-color" value="${b.color}" data-idx="${i}" />
            <button class="horae-rpg-config-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** 构建角色下拉选项（{{user}} + NPC列表） */
function buildCharacterOptions() {
    const userName = getContext().name1 || '{{user}}';
    let html = `<option value="__user__">${escapeHtml(userName)}</option>`;
    const state = horaeManager.getLatestState();
    for (const [name, info] of Object.entries(state.npcs || {})) {
        const prefix = info._id ? `N${info._id} ` : '';
        html += `<option value="${escapeHtml(name)}">${escapeHtml(prefix + name)}</option>`;
    }
    return html;
}

/** 在 Canvas 上绘制雷达图（自适应 DPI + 动态尺寸 + 跟随主题色） */
function drawRadarChart(canvas, values, config, maxVal = 100) {
    const n = config.length;
    if (n < 3) return;
    const dpr = window.devicePixelRatio || 1;

    // 从 CSS 变量读取颜色，自动跟随美化主题
    const themeRoot = canvas.closest('#horae_drawer') || canvas.closest('.horae-rpg-char-detail-body') || document.getElementById('horae_drawer') || document.body;
    const cs = getComputedStyle(themeRoot);
    const radarHex = cs.getPropertyValue('--horae-radar-color').trim() || cs.getPropertyValue('--horae-primary').trim() || '#7c3aed';
    const labelColor = cs.getPropertyValue('--horae-radar-label').trim() || cs.getPropertyValue('--horae-text').trim() || '#e2e8f0';
    const gridColor = cs.getPropertyValue('--horae-border').trim() || 'rgba(255,255,255,0.1)';
    const rr = parseInt(radarHex.slice(1, 3), 16) || 124;
    const rg = parseInt(radarHex.slice(3, 5), 16) || 58;
    const rb = parseInt(radarHex.slice(5, 7), 16) || 237;

    // 根据最长属性名动态选字号
    const maxNameLen = Math.max(...config.map(c => c.name.length));
    const fontSize = maxNameLen > 3 ? 11 : 12;

    const tmpCtx = canvas.getContext('2d');
    tmpCtx.font = `${fontSize}px sans-serif`;
    let maxLabelW = 0;
    for (const c of config) {
        const w = tmpCtx.measureText(`${c.name} ${maxVal}`).width;
        if (w > maxLabelW) maxLabelW = w;
    }

    // 动态布局：保证侧面标签不超出画布
    const labelGap = 18;
    const labelMargin = 4;
    const pad = Math.max(38, Math.ceil(maxLabelW) + labelGap + labelMargin);
    const r = 92;
    const cssW = Math.min(400, 2 * (r + pad));
    const cssH = cssW;
    const cx = cssW / 2, cy = cssH / 2;
    const actualR = Math.min(r, cx - pad);

    canvas.style.width = cssW + 'px';
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const angle = i => -Math.PI / 2 + (2 * Math.PI * i) / n;

    // 底层网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let lv = 1; lv <= 4; lv++) {
        ctx.beginPath();
        const lr = (actualR * lv) / 4;
        for (let i = 0; i <= n; i++) {
            const a = angle(i % n);
            const x = cx + lr * Math.cos(a), y = cy + lr * Math.sin(a);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    // 辐射线
    for (let i = 0; i < n; i++) {
        const a = angle(i);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + actualR * Math.cos(a), cy + actualR * Math.sin(a));
        ctx.stroke();
    }
    // 数据区
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const a = angle(i % n);
        const v = Math.min(maxVal, values[config[i % n].key] || 0);
        const dr = (v / maxVal) * actualR;
        const x = cx + dr * Math.cos(a), y = cy + dr * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.fillStyle = `rgba(${rr},${rg},${rb},0.25)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rr},${rg},${rb},0.8)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 顶点圆点 + 标签
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
        const a = angle(i);
        const v = Math.min(maxVal, values[config[i].key] || 0);
        const dr = (v / maxVal) * actualR;
        ctx.beginPath();
        ctx.arc(cx + dr * Math.cos(a), cy + dr * Math.sin(a), 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rr},${rg},${rb},1)`;
        ctx.fill();
        const labelR = actualR + labelGap;
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        ctx.fillStyle = labelColor;
        const cosA = Math.cos(a);
        ctx.textAlign = cosA < -0.1 ? 'right' : cosA > 0.1 ? 'left' : 'center';
        ctx.textBaseline = ly < cy - 5 ? 'bottom' : ly > cy + 5 ? 'top' : 'middle';
        ctx.fillText(`${config[i].name} ${v}`, lx, ly);
    }
}

/** 同步 RPG 分页可见性及各子区段显隐 */
function _syncRpgTabVisibility() {
    const sendBars = settings.rpgMode && settings.sendRpgBars !== false;
    const sendAttrs = settings.rpgMode && settings.sendRpgAttributes !== false;
    const sendSkills = settings.rpgMode && settings.sendRpgSkills !== false;
    const sendRep = settings.rpgMode && !!settings.sendRpgReputation;
    const sendEq = settings.rpgMode && !!settings.sendRpgEquipment;
    const sendLvl = settings.rpgMode && !!settings.sendRpgLevel;
    const sendCur = settings.rpgMode && !!settings.sendRpgCurrency;
    const sendSh = settings.rpgMode && !!settings.sendRpgStronghold;
    const hasContent = sendBars || sendAttrs || sendSkills || sendRep || sendEq || sendLvl || sendCur || sendSh;
    $('#horae-tab-btn-rpg').toggle(hasContent);
    $('#horae-rpg-bar-config-area').toggle(sendBars);
    $('#horae-rpg-attr-config-area').toggle(sendAttrs);
    $('.horae-rpg-manual-section').toggle(sendAttrs);
    $('.horae-rpg-skills-area').toggle(sendSkills);
    $('#horae-rpg-reputation-area').toggle(sendRep);
    $('#horae-rpg-equipment-area').toggle(sendEq);
    $('#horae-rpg-level-area').toggle(sendLvl);
    $('#horae-rpg-currency-area').toggle(sendCur);
    $('#horae-rpg-stronghold-area').toggle(sendSh);
}

/** 更新 RPG 分页（角色卡模式，按当前消息位置快照） */
function updateRpgDisplay() {
    if (!settings.rpgMode) return;
    const rpg = horaeManager.getRpgStateAt(0);
    const state = horaeManager.getLatestState();
    const container = document.getElementById('horae-tab-rpg');
    if (!container) return;

    const sendBars = settings.sendRpgBars !== false;
    const sendAttrs = settings.sendRpgAttributes !== false;
    const sendSkills = settings.sendRpgSkills !== false;
    const sendEq = !!settings.sendRpgEquipment;
    const sendRep = !!settings.sendRpgReputation;
    const sendLvl = !!settings.sendRpgLevel;
    const sendCur = !!settings.sendRpgCurrency;
    const sendSh = !!settings.sendRpgStronghold;
    const attrCfg = settings.rpgAttributeConfig || [];
    const hasAttrModule = sendAttrs && attrCfg.length > 0;
    const detailModules = [hasAttrModule, sendSkills, sendEq, sendRep, sendCur, sendSh].filter(Boolean).length;
    const moduleCount = [sendBars, hasAttrModule, sendSkills, sendEq, sendRep, sendLvl, sendCur, sendSh].filter(Boolean).length;
    const useCardLayout = detailModules >= 1 || moduleCount >= 2;

    // 配置区始终渲染
    renderBarConfig();
    renderAttrConfig();
    if (sendRep) {
        renderReputationConfig();
        renderReputationValues();
    }
    if (sendEq) {
        renderEquipmentValues();
        _bindEquipmentEvents();
    }
    if (sendCur) renderCurrencyConfig();
    if (sendLvl) renderLevelValues();
    if (sendSh) { renderStrongholdTree(); _bindStrongholdEvents(); }

    const barsSection = document.getElementById('horae-rpg-bars-section');
    const charCardsSection = document.getElementById('horae-rpg-char-cards');
    if (!barsSection || !charCardsSection) return;

    // 收集所有角色
    const allNames = new Set([
        ...Object.keys(rpg.bars || {}),
        ...Object.keys(rpg.status || {}),
        ...Object.keys(rpg.skills || {}),
        ...Object.keys(rpg.attributes || {}),
        ...Object.keys(rpg.reputation || {}),
        ...Object.keys(rpg.equipment || {}),
        ...Object.keys(rpg.levels || {}),
        ...Object.keys(rpg.xp || {}),
        ...Object.keys(rpg.currency || {}),
    ]);

    const _uoUserName = getContext().name1 || '';

    /** 构建单个角色的分页标签 HTML */
    function _buildCharTabs(name) {
        const tabs = [];
        const panels = [];
        const eid = name.replace(/[^a-zA-Z0-9]/g, '_');
        const _isU = (name === _uoUserName);
        const attrs = rpg.attributes?.[name] || {};
        const skills = rpg.skills?.[name] || [];
        const charEq = rpg.equipment?.[name] || {};
        const charRep = rpg.reputation?.[name] || {};
        const charCur = rpg.currency?.[name] || {};
        const charLv = rpg.levels?.[name];
        const charXp = rpg.xp?.[name];

        if (hasAttrModule && (!settings.rpgAttrsUserOnly || _isU)) {
            tabs.push({ id: `attr_${eid}`, label: t('ui.rpgTabAttr') });
            const hasAttrs = Object.keys(attrs).length > 0;
            const viewMode = settings.rpgAttrViewMode || 'radar';
            let html = '<div class="horae-rpg-attr-section">';
            html += `<div class="horae-rpg-attr-header"><span>${t('label.attributes')}</span><button class="horae-rpg-charattr-edit" data-char="${escapeHtml(name)}" title="${t('tooltip.addEditCharAttr')}"><i class="fa-solid fa-pen-to-square"></i></button></div>`;
            if (hasAttrs) {
                if (viewMode === 'radar') {
                    html += `<canvas class="horae-rpg-radar" data-char="${escapeHtml(name)}"></canvas>`;
                } else {
                    html += '<div class="horae-rpg-attr-text">';
                    for (const a of attrCfg) html += `<div class="horae-rpg-attr-row"><span>${escapeHtml(a.name)}</span><span>${attrs[a.key] ?? '?'}</span></div>`;
                    html += '</div>';
                }
            } else {
                html += `<div class="horae-rpg-skills-empty">${t('characters.noRecords')}</div>`;
            }
            html += '</div>';
            panels.push(html);
        }
        if (sendSkills && (!settings.rpgSkillsUserOnly || _isU)) {
            tabs.push({ id: `skill_${eid}`, label: t('ui.rpgTabSkill') });
            let html = '';
            if (skills.length > 0) {
                html += '<div class="horae-rpg-card-skills">';
                for (const sk of skills) {
                    html += `<details class="horae-rpg-skill-detail"><summary class="horae-rpg-skill-summary">${escapeHtml(sk.name)}`;
                    if (sk.level) html += ` <span class="horae-rpg-skill-lv">${escapeHtml(sk.level)}</span>`;
                    html += `<button class="horae-rpg-skill-del" data-owner="${escapeHtml(name)}" data-skill="${escapeHtml(sk.name)}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button></summary>`;
                    if (sk.desc) html += `<div class="horae-rpg-skill-desc">${escapeHtml(sk.desc)}</div>`;
                    html += '</details>';
                }
                html += '</div>';
            } else {
                html += `<div class="horae-rpg-skills-empty">${t('ui.noSkills')}</div>`;
            }
            panels.push(html);
        }
        if (sendEq && (!settings.rpgEquipmentUserOnly || _isU)) {
            tabs.push({ id: `eq_${eid}`, label: t('ui.rpgTabEquip') });
            let html = '';
            const slotEntries = Object.entries(charEq);
            if (slotEntries.length > 0) {
                html += '<div class="horae-rpg-card-eq">';
                for (const [slotName, items] of slotEntries) {
                    for (const item of items) {
                        const attrStr = Object.entries(item.attrs || {}).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(', ');
                        html += `<div class="horae-rpg-card-eq-item"><span class="horae-rpg-card-eq-slot">[${escapeHtml(slotName)}]</span> ${escapeHtml(item.name)}`;
                        if (attrStr) html += ` <span class="horae-rpg-card-eq-attrs">(${attrStr})</span>`;
                        html += '</div>';
                    }
                }
                html += '</div>';
            } else {
                html += `<div class="horae-rpg-skills-empty">${t('ui.noEquipment')}</div>`;
            }
            panels.push(html);
        }
        if (sendRep && (!settings.rpgReputationUserOnly || _isU)) {
            tabs.push({ id: `rep_${eid}`, label: t('ui.rpgTabReputation') });
            let html = '';
            const catEntries = Object.entries(charRep);
            if (catEntries.length > 0) {
                html += '<div class="horae-rpg-card-rep">';
                for (const [catName, data] of catEntries) {
                    html += `<div class="horae-rpg-card-rep-row"><span>${escapeHtml(catName)}</span><span>${data.value}</span></div>`;
                }
                html += '</div>';
            } else {
                html += `<div class="horae-rpg-skills-empty">${t('ui.noReputationData')}</div>`;
            }
            panels.push(html);
        }
        // 等级/XP 现在直接显示在状态条上方，不再作为独立标签
        if (sendCur && (!settings.rpgCurrencyUserOnly || _isU)) {
            tabs.push({ id: `cur_${eid}`, label: t('ui.rpgTabCurrency') });
            const denomConfig = rpg.currencyConfig?.denominations || [];
            let html = '<div class="horae-rpg-card-cur">';
            const hasCur = denomConfig.some(d => charCur[d.name] != null);
            if (hasCur) {
                for (const d of denomConfig) {
                    const val = charCur[d.name] ?? 0;
                    const emojiStr = d.emoji ? `${d.emoji} ` : '';
                    html += `<div class="horae-rpg-card-cur-row"><span>${emojiStr}${escapeHtml(d.name)}</span><span>${val}</span></div>`;
                }
            } else {
                html += `<div class="horae-rpg-skills-empty">${t('ui.noCurrencyData')}</div>`;
            }
            html += '</div>';
            panels.push(html);
        }
        if (tabs.length === 0) return '';
        let html = '<div class="horae-rpg-card-tabs" data-char="' + escapeHtml(name) + '">';
        html += '<div class="horae-rpg-card-tab-bar">';
        for (let i = 0; i < tabs.length; i++) {
            html += `<button class="horae-rpg-card-tab-btn${i === 0 ? ' active' : ''}" data-idx="${i}">${tabs[i].label}</button>`;
        }
        html += '</div>';
        for (let i = 0; i < panels.length; i++) {
            html += `<div class="horae-rpg-card-tab-panel${i === 0 ? ' active' : ''}" data-idx="${i}">${panels[i]}</div>`;
        }
        html += '</div>';
        return html;
    }

    if (useCardLayout) {
        barsSection.style.display = '';
        const presentChars = new Set((state.scene?.characters_present || []).map(n => n.trim()).filter(Boolean));
        const userName = getContext().name1 || '';
        const inScene = [], offScene = [];
        for (const name of allNames) {
            let isInScene = presentChars.has(name);
            if (!isInScene && name === userName) {
                for (const p of presentChars) {
                    if (p.includes(name) || name.includes(p)) { isInScene = true; break; }
                }
            }
            if (!isInScene) {
                for (const p of presentChars) {
                    if (p.includes(name) || name.includes(p)) { isInScene = true; break; }
                }
            }
            (isInScene ? inScene : offScene).push(name);
        }
        const sortedNames = [...inScene, ...offScene];

        let barsHtml = '';
        for (const name of sortedNames) {
            const bars = rpg.bars[name];
            const effects = rpg.status?.[name] || [];
            const npc = state.npcs[name];
            const profession = npc?.personality?.split(/[,，]/)?.[0]?.trim() || '';
            const isPresent = inScene.includes(name);
            const charLv = rpg.levels?.[name];

            if (!isPresent) continue;
            const _isUser = (name === userName);
            barsHtml += '<div class="horae-rpg-char-block">';

            if (sendBars && (!settings.rpgBarsUserOnly || _isUser)) {
                barsHtml += '<div class="horae-rpg-char-card horae-rpg-bar-card">';
                // 角色名行: 名称 + 等级 + 状态图标 ...... 货币（右端）
                barsHtml += '<div class="horae-rpg-bar-card-header">';
                barsHtml += `<span class="horae-rpg-char-name">${escapeHtml(name)}</span>`;
                if (sendLvl && charLv != null && (!settings.rpgLevelUserOnly || _isUser)) barsHtml += `<span class="horae-rpg-lv-badge">Lv.${charLv}</span>`;
                for (const e of effects) {
                    barsHtml += `<i class="fa-solid ${getStatusIcon(e)} horae-rpg-hud-effect" title="${escapeHtml(e)}"></i>`;
                }
                let curRightHtml = '';
                const charCurTop = rpg.currency?.[name] || {};
                const denomCfgTop = rpg.currencyConfig?.denominations || [];
                if (sendCur && (!settings.rpgCurrencyUserOnly || _isUser) && denomCfgTop.length > 0) {
                    for (const d of denomCfgTop) {
                        const v = charCurTop[d.name];
                        if (v != null) curRightHtml += `<span class="horae-rpg-hud-cur-tag">${d.emoji || '💰'}${v}</span>`;
                    }
                }
                if (curRightHtml) barsHtml += `<span class="horae-rpg-bar-card-right">${curRightHtml}</span>`;
                barsHtml += '</div>';
                // XP 条
                const charXpTop = rpg.xp?.[name];
                if (sendLvl && (!settings.rpgLevelUserOnly || _isUser) && charXpTop && charXpTop[1] > 0) {
                    const xpPct = Math.min(100, Math.round(charXpTop[0] / charXpTop[1] * 100));
                    barsHtml += `<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">XP</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${xpPct}%;background:#a78bfa;"></div></div><span class="horae-rpg-bar-val">${charXpTop[0]}/${charXpTop[1]}</span></div>`;
                }
                if (bars) {
                    for (const [type, val] of Object.entries(bars)) {
                        const label = getRpgBarName(type, val[2]);
                        const cur = val[0], max = val[1];
                        const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
                        const color = getRpgBarColor(type);
                        barsHtml += `<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">${escapeHtml(label)}</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-bar-val">${cur}/${max}</span></div>`;
                    }
                }
                if (effects.length > 0) {
                    barsHtml += `<div class="horae-rpg-status-label">${t('ui.statusList')}</div><div class="horae-rpg-status-detail">`;
                    for (const e of effects) barsHtml += `<div class="horae-rpg-status-item"><i class="fa-solid ${getStatusIcon(e)} horae-rpg-status-icon"></i><span>${escapeHtml(e)}</span></div>`;
                    barsHtml += '</div>';
                }
                barsHtml += '</div>';
            }

            const tabContent = _buildCharTabs(name);
            if (tabContent) {
                barsHtml += `<details class="horae-rpg-char-detail"><summary class="horae-rpg-char-summary"><span class="horae-rpg-char-detail-name">${escapeHtml(name)}</span>`;
                if (sendLvl && (!settings.rpgLevelUserOnly || _isUser) && rpg.levels?.[name] != null) barsHtml += `<span class="horae-rpg-lv-badge">Lv.${rpg.levels[name]}</span>`;
                if (profession) barsHtml += `<span class="horae-rpg-char-prof">${escapeHtml(profession)}</span>`;
                barsHtml += `</summary><div class="horae-rpg-char-detail-body">${tabContent}</div></details>`;
            }
            barsHtml += '</div>';
        }
        barsSection.innerHTML = barsHtml;
        charCardsSection.innerHTML = '';
        charCardsSection.style.display = 'none';

        // 分页标签点击事件
        barsSection.querySelectorAll('.horae-rpg-card-tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tabs = this.closest('.horae-rpg-card-tabs');
                const idx = this.dataset.idx;
                tabs.querySelectorAll('.horae-rpg-card-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.idx === idx));
                tabs.querySelectorAll('.horae-rpg-card-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.idx === idx));
            });
        });
    } else {
        charCardsSection.innerHTML = '';
        charCardsSection.style.display = 'none';
        let barsHtml = '';
        for (const name of allNames) {
            if (settings.rpgBarsUserOnly && name !== userName) continue;
            const bars = rpg.bars[name] || {};
            const effects = rpg.status?.[name] || [];
            if (!Object.keys(bars).length && !effects.length) continue;
            let h = `<div class="horae-rpg-char-card"><div class="horae-rpg-char-name">${escapeHtml(name)}</div>`;
            for (const [type, val] of Object.entries(bars)) {
                const label = getRpgBarName(type, val[2]);
                const cur = val[0], max = val[1];
                const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
                const color = getRpgBarColor(type);
                h += `<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">${escapeHtml(label)}</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-bar-val">${cur}/${max}</span></div>`;
            }
            if (effects.length > 0) {
                h += `<div class="horae-rpg-status-label">${t('ui.statusList')}</div><div class="horae-rpg-status-detail">`;
                for (const e of effects) h += `<div class="horae-rpg-status-item"><i class="fa-solid ${getStatusIcon(e)} horae-rpg-status-icon"></i><span>${escapeHtml(e)}</span></div>`;
                h += '</div>';
            }
            h += '</div>';
            barsHtml += h;
        }
        barsSection.innerHTML = barsHtml;
    }

    // 技能平铺列表：角色卡模式下隐藏
    const skillsSection = document.getElementById('horae-rpg-skills-section');
    if (skillsSection) {
        if (useCardLayout && sendSkills) {
            skillsSection.innerHTML = `<div class="horae-rpg-skills-empty">${t('ui.skillsInCard')}</div>`;
        } else {
            const hasSkills = Object.values(rpg.skills).some(arr => arr?.length > 0);
            let skillsHtml = '';
            if (hasSkills) {
                for (const [name, skills] of Object.entries(rpg.skills)) {
                    if (!skills?.length) continue;
                    if (settings.rpgSkillsUserOnly && name !== userName) continue;
                    skillsHtml += `<div class="horae-rpg-skill-group"><div class="horae-rpg-char-name">${escapeHtml(name)}</div>`;
                    for (const sk of skills) {
                        const lv = sk.level ? `<span class="horae-rpg-skill-lv">${escapeHtml(sk.level)}</span>` : '';
                        const desc = sk.desc ? `<div class="horae-rpg-skill-desc">${escapeHtml(sk.desc)}</div>` : '';
                        skillsHtml += `<div class="horae-rpg-skill-card"><div class="horae-rpg-skill-header"><span class="horae-rpg-skill-name">${escapeHtml(sk.name)}</span>${lv}<button class="horae-rpg-skill-del" data-owner="${escapeHtml(name)}" data-skill="${escapeHtml(sk.name)}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button></div>${desc}</div>`;
                    }
                    skillsHtml += '</div>';
                }
            } else {
                skillsHtml = `<div class="horae-rpg-skills-empty">${t('ui.noSkillsAddManually')}</div>`;
            }
            skillsSection.innerHTML = skillsHtml;
        }
    }

    // 绘制雷达图
    document.querySelectorAll('.horae-rpg-radar').forEach(canvas => {
        const charName = canvas.dataset.char;
        const vals = rpg.attributes?.[charName] || {};
        drawRadarChart(canvas, vals, attrCfg);
    });

    updateAllRpgHuds();
}

/** 渲染属性面板配置列表 */
function renderAttrConfig() {
    const list = document.getElementById('horae-rpg-attr-config-list');
    if (!list) return;
    const attrs = settings.rpgAttributeConfig || [];
    list.innerHTML = attrs.map((a, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-config-key" value="${escapeHtml(a.key)}" maxlength="10" data-idx="${i}" data-type="attr" />
            <input class="horae-rpg-config-name" value="${escapeHtml(a.name)}" maxlength="8" data-idx="${i}" data-type="attr" />
            <input class="horae-rpg-attr-desc" value="${escapeHtml(a.desc || '')}" placeholder="${t('label.description')}" data-idx="${i}" />
            <button class="horae-rpg-attr-del" data-idx="${i}" title="${t('common.delete')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}


export {
    rollDice,
    injectDiceToChat,
    renderDicePanel,
    _applyDicePos,
    renderBarConfig,
    buildCharacterOptions,
    drawRadarChart,
    _syncRpgTabVisibility,
    updateRpgDisplay,
    renderAttrConfig
};
