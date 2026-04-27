import { settings, appState, saveSettings, showToast, getTemplate } from '../core/state.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { extension_settings } from '/scripts/extensions.js';

// ============================================
// 自助美化工具 (Theme Designer)
// ============================================

function _tdHslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * Math.max(0, Math.min(1, c))).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function _tdHexToHsl(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function _tdHexToRgb(hex) {
    hex = hex.replace('#', '');
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

function _tdParseColorHsl(str) {
    if (!str) return { h: 265, s: 84, l: 58 };
    str = str.trim();
    if (str.startsWith('#')) return _tdHexToHsl(str);
    const hm = str.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
    if (hm) return { h: +hm[1], s: +hm[2], l: +hm[3] };
    const rm = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rm) return _tdHexToHsl('#' + [rm[1], rm[2], rm[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join(''));
    return { h: 265, s: 84, l: 58 };
}

function _tdGenerateVars(hue, sat, brightness, accentHex, colorLight) {
    const isDark = brightness <= 50;
    const s = Math.max(15, sat);
    const pL = colorLight || 50;
    const v = {};
    if (isDark) {
        const bgL = 6 + (brightness / 50) * 10;
        v['--horae-primary'] = _tdHslToHex(hue, s, pL);
        v['--horae-primary-light'] = _tdHslToHex(hue, Math.max(s - 12, 25), Math.min(pL + 16, 90));
        v['--horae-primary-dark'] = _tdHslToHex(hue, Math.min(s + 5, 100), Math.max(pL - 14, 10));
        v['--horae-bg'] = _tdHslToHex(hue, Math.min(s, 22), bgL);
        v['--horae-bg-secondary'] = _tdHslToHex(hue, Math.min(s, 16), bgL + 5);
        v['--horae-bg-hover'] = _tdHslToHex(hue, Math.min(s, 14), bgL + 10);
        v['--horae-border'] = `rgba(255,255,255,0.1)`;
        v['--horae-text'] = _tdHslToHex(hue, 8, 90);
        v['--horae-text-muted'] = _tdHslToHex(hue, 6, 63);
        v['--horae-shadow'] = `0 4px 20px rgba(0,0,0,0.3)`;
    } else {
        const bgL = 92 + ((brightness - 50) / 50) * 5;
        v['--horae-primary'] = _tdHslToHex(hue, s, pL);
        v['--horae-primary-light'] = _tdHslToHex(hue, s, Math.max(pL - 8, 10));
        v['--horae-primary-dark'] = _tdHslToHex(hue, Math.max(s - 12, 25), Math.min(pL + 14, 85));
        v['--horae-bg'] = _tdHslToHex(hue, Math.min(s, 12), bgL);
        v['--horae-bg-secondary'] = _tdHslToHex(hue, Math.min(s, 10), bgL - 4);
        v['--horae-bg-hover'] = _tdHslToHex(hue, Math.min(s, 10), bgL - 8);
        v['--horae-border'] = `rgba(0,0,0,0.12)`;
        v['--horae-text'] = _tdHslToHex(hue, 8, 12);
        v['--horae-text-muted'] = _tdHslToHex(hue, 5, 38);
        v['--horae-shadow'] = `0 4px 20px rgba(0,0,0,0.08)`;
    }
    if (accentHex) v['--horae-accent'] = accentHex;
    v['--horae-success'] = '#10b981';
    v['--horae-warning'] = '#f59e0b';
    v['--horae-danger'] = '#ef4444';
    v['--horae-info'] = '#3b82f6';
    return v;
}

function _tdBuildImageCSS(images, opacities, bgHex, drawerBg) {
    const parts = [];
    // 顶部图标（#horae_drawer）
    if (images.drawer && bgHex) {
        const c = _tdHexToRgb(drawerBg || bgHex);
        const a = (1 - (opacities.drawer || 30) / 100).toFixed(2);
        parts.push(`#horae_drawer {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.drawer}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    }
    // 抽屉头部图片
    if (images.header) {
        parts.push(`#horae_drawer .drawer-header {
  background-image: url('${images.header}') !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}`);
    }
    // 抽屉背景图片
    const bodyBg = drawerBg || bgHex;
    if (images.body && bodyBg) {
        const c = _tdHexToRgb(bodyBg);
        const a = (1 - (opacities.body || 30) / 100).toFixed(2);
        parts.push(`.horae-tab-contents {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.body}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    } else if (drawerBg) {
        parts.push(`.horae-tab-contents { background-color: ${drawerBg} !important; }`);
    }
    // 底部消息栏图片 — 仅作用于收缩的 toggle 条，展开内容不叠加图片
    if (images.panel && bgHex) {
        const c = _tdHexToRgb(bgHex);
        const a = (1 - (opacities.panel || 30) / 100).toFixed(2);
        parts.push(`.horae-message-panel > .horae-panel-toggle {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.panel}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    }
    return parts.join('\n');
}

function openThemeDesigner() {
    document.querySelector('.horae-theme-designer')?.remove();

    const drawer = document.getElementById('horae_drawer');
    const cs = drawer ? getComputedStyle(drawer) : null;
    const priStr = cs?.getPropertyValue('--horae-primary').trim() || '#7c3aed';
    const accStr = cs?.getPropertyValue('--horae-accent').trim() || '#f59e0b';
    const initHsl = _tdParseColorHsl(priStr);

    // 尝试从当前自定义主题恢复全部设置
    let savedImages = { drawer: '', header: '', body: '', panel: '' };
    let savedImgOp = { drawer: 30, header: 50, body: 30, panel: 30 };
    let savedName = '', savedAuthor = '', savedDrawerBg = '';
    let savedDesigner = null;
    const curTheme = resolveTheme(settings.themeMode || 'dark');
    if (curTheme) {
        if (curTheme.images) savedImages = { ...savedImages, ...curTheme.images };
        if (curTheme.imageOpacity) savedImgOp = { ...savedImgOp, ...curTheme.imageOpacity };
        if (curTheme.name) savedName = curTheme.name;
        if (curTheme.author) savedAuthor = curTheme.author;
        if (curTheme.drawerBg) savedDrawerBg = curTheme.drawerBg;
        if (curTheme._designerState) savedDesigner = curTheme._designerState;
    }

    const st = {
        hue: savedDesigner?.hue ?? initHsl.h,
        sat: savedDesigner?.sat ?? initHsl.s,
        colorLight: savedDesigner?.colorLight ?? initHsl.l,
        bright: savedDesigner?.bright ?? ((isLightMode()) ? 70 : 25),
        accent: savedDesigner?.accent ?? (accStr.startsWith('#') ? accStr : '#f59e0b'),
        images: savedImages,
        imgOp: savedImgOp,
        drawerBg: savedDrawerBg,
        rpgColor: savedDesigner?.rpgColor ?? '#000000',
        rpgOpacity: savedDesigner?.rpgOpacity ?? 85,
        diceColor: savedDesigner?.diceColor ?? '#1a1a2e',
        diceOpacity: savedDesigner?.diceOpacity ?? 15,
        radarColor: savedDesigner?.radarColor ?? '',
        radarLabel: savedDesigner?.radarLabel ?? '',
        overrides: {}
    };

    const abortCtrl = new AbortController();
    const sig = abortCtrl.signal;

    const imgHtml = (key, label) => {
        const url = st.images[key] || '';
        const op = st.imgOp[key];
        return `<div class="htd-img-group">
        <div class="htd-img-label">${label}</div>
        <input type="text" id="htd-img-${key}" class="htd-input" placeholder="${t('placeholder.imageUrl')}" value="${escapeHtml(url)}">
        <div class="htd-img-ctrl"><span>${t('ui.visibility')} <em id="htd-imgop-${key}">${op}</em>%</span>
            <input type="range" class="htd-slider" id="htd-imgsl-${key}" min="5" max="100" value="${op}"></div>
        <img id="htd-imgpv-${key}" class="htd-img-preview" ${url ? `src="${escapeHtml(url)}"` : 'style="display:none;"'}>
    </div>`;
    };

    const modal = document.createElement('div');
    modal.className = 'horae-modal horae-theme-designer' + (isLightMode() ? ' horae-light' : '');
    modal.innerHTML = `
    <div class="horae-modal-content htd-content">
        <div class="htd-header"><i class="fa-solid fa-paint-roller"></i> ${t('ui.themeDesignerTitle')}</div>
        <div class="htd-body">
            <div class="htd-section">
                <div class="htd-section-title">${t('ui.quickColor')}</div>
                <div class="htd-field">
                    <span class="htd-label">${t('ui.hue')}</span>
                    <div class="htd-hue-bar" id="htd-hue-bar"><div class="htd-hue-ind" id="htd-hue-ind"></div></div>
                </div>
                <div class="htd-field">
                    <span class="htd-label">${t('ui.saturation')} <em id="htd-satv">${st.sat}</em>%</span>
                    <input type="range" class="htd-slider" id="htd-sat" min="10" max="100" value="${st.sat}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">${t('ui.brightness')} <em id="htd-clv">${st.colorLight}</em></span>
                    <input type="range" class="htd-slider htd-colorlight" id="htd-cl" min="15" max="85" value="${st.colorLight}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">${t('ui.dayNight')} <em id="htd-briv">${st.bright <= 50 ? t('ui.night') : t('ui.day')}</em></span>
                    <input type="range" class="htd-slider htd-daynight" id="htd-bri" min="0" max="100" value="${st.bright}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">${t('ui.accentColor')}</span>
                    <div class="htd-color-row">
                        <input type="color" id="htd-accent" value="${st.accent}" class="htd-cpick">
                        <span class="htd-hex" id="htd-accent-hex">${st.accent}</span>
                    </div>
                </div>
                <div class="htd-swatches" id="htd-swatches"></div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-fine-t">
                    <i class="fa-solid fa-sliders"></i> ${t('ui.fineColor')}
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-fine-body" style="display:none;"></div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-img-t">
                    <i class="fa-solid fa-image"></i> ${t('ui.decorImages')}
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-imgs-section" style="display:none;">
                    ${imgHtml('drawer', t('ui.topIcon'))}
                    ${imgHtml('header', t('ui.drawerHeader'))}
                    ${imgHtml('body', t('ui.drawerBody'))}
                    <div class="htd-img-group">
                        <div class="htd-img-label">${t('ui.drawerBgColor')}</div>
                        <div class="htd-field">
                            <span class="htd-label"><em id="htd-dbg-hex">${st.drawerBg || t('ui.followTheme')}</em></span>
                            <div class="htd-color-row">
                                <input type="color" id="htd-dbg" value="${st.drawerBg || '#2d2d3c'}" class="htd-cpick">
                                <button class="horae-btn" id="htd-dbg-clear" style="font-size:10px;padding:2px 8px;">${t('ui.clearBtn')}</button>
                            </div>
                        </div>
                    </div>
                    ${imgHtml('panel', t('ui.bottomPanel'))}
                </div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-rpg-t">
                    <i class="fa-solid fa-shield-halved"></i> ${t('ui.rpgStatusBar')}
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-rpg-section" style="display:none;">
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.backgroundColor')}</span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-rpg-color" value="${st.rpgColor}" class="htd-cpick">
                            <span class="htd-hex" id="htd-rpg-color-hex">${st.rpgColor}</span>
                        </div>
                    </div>
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.opacityLabel')} <em id="htd-rpg-opv">${st.rpgOpacity}</em>%</span>
                        <input type="range" class="htd-slider" id="htd-rpg-op" min="0" max="100" value="${st.rpgOpacity}">
                    </div>
                </div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-dice-t">
                    <i class="fa-solid fa-dice-d20"></i> ${t('ui.dicePanel')}
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-dice-section" style="display:none;">
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.backgroundColor')}</span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-dice-color" value="${st.diceColor}" class="htd-cpick">
                            <span class="htd-hex" id="htd-dice-color-hex">${st.diceColor}</span>
                        </div>
                    </div>
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.visibility')} <em id="htd-dice-opv">${st.diceOpacity}</em>%</span>
                        <input type="range" class="htd-slider" id="htd-dice-op" min="0" max="100" value="${st.diceOpacity}">
                    </div>
                </div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-radar-t">
                    <i class="fa-solid fa-chart-simple"></i> ${t('ui.radarChart')}
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-radar-section" style="display:none;">
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.dataColor')} <em style="opacity:.5">${t('ui.emptyFollowTheme')}</em></span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-radar-color" value="${st.radarColor || priStr}" class="htd-cpick">
                            <span class="htd-hex" id="htd-radar-color-hex">${st.radarColor || t('ui.followTheme')}</span>
                            <button class="horae-btn" id="htd-radar-color-clear" style="font-size:10px;padding:2px 8px;">${t('ui.clearBtn')}</button>
                        </div>
                    </div>
                    <div class="htd-field">
                        <span class="htd-label">${t('ui.labelColor')} <em style="opacity:.5">${t('ui.emptyFollowText')}</em></span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-radar-label" value="${st.radarLabel || '#e2e8f0'}" class="htd-cpick">
                            <span class="htd-hex" id="htd-radar-label-hex">${st.radarLabel || t('ui.followText')}</span>
                            <button class="horae-btn" id="htd-radar-label-clear" style="font-size:10px;padding:2px 8px;">${t('ui.clearBtn')}</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="htd-section htd-save-sec">
                <div class="htd-field"><span class="htd-label">${t('label.name')}</span><input type="text" id="htd-name" class="htd-input" placeholder="${t('placeholder.themeName')}" value="${escapeHtml(savedName)}"></div>
                <div class="htd-field"><span class="htd-label">${t('ui.authorLabel')}</span><input type="text" id="htd-author" class="htd-input" placeholder="${t('placeholder.anonymous')}" value="${escapeHtml(savedAuthor)}"></div>
                <div class="htd-btn-row">
                    <button class="horae-btn primary" id="htd-save"><i class="fa-solid fa-floppy-disk"></i> ${t('common.save')}</button>
                    <button class="horae-btn" id="htd-export"><i class="fa-solid fa-file-export"></i> ${t('common.export')}</button>
                    <button class="horae-btn" id="htd-reset"><i class="fa-solid fa-rotate-left"></i> ${t('common.reset')}</button>
                    <button class="horae-btn" id="htd-cancel"><i class="fa-solid fa-xmark"></i> ${t('common.cancel')}</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(modal);
    preventModalBubble(modal);

    const hueBar = modal.querySelector('#htd-hue-bar');
    const hueInd = modal.querySelector('#htd-hue-ind');
    hueInd.style.left = `${(st.hue / 360) * 100}%`;
    hueInd.style.background = `hsl(${st.hue}, 100%, 50%)`;

    // ---- Live preview ----
    function update() {
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };

        // RPG HUD 背景变量（透明度：100=全透明, 0=不透明）
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        // 骰子面板背景变量
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }
        // 雷达图颜色变量
        if (st.radarColor) vars['--horae-radar-color'] = st.radarColor;
        if (st.radarLabel) vars['--horae-radar-label'] = st.radarLabel;

        let previewEl = document.getElementById('horae-designer-preview');
        if (!previewEl) { previewEl = document.createElement('style'); previewEl.id = 'horae-designer-preview'; document.head.appendChild(previewEl); }
        const cssLines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v} !important;`).join('\n');
        previewEl.textContent = `#horae_drawer, .horae-message-panel, .horae-modal, .horae-context-menu, .horae-rpg-hud, .horae-rpg-dice-panel, .horae-progress-overlay {\n${cssLines}\n}`;

        const isLight = st.bright > 50;
        drawer?.classList.toggle('horae-light', isLight);
        modal.classList.toggle('horae-light', isLight);
        document.querySelectorAll('.horae-message-panel').forEach(p => p.classList.toggle('horae-light', isLight));
        document.querySelectorAll('.horae-rpg-hud').forEach(h => h.classList.toggle('horae-light', isLight));
        document.querySelectorAll('.horae-rpg-dice-panel').forEach(d => d.classList.toggle('horae-light', isLight));

        let imgEl = document.getElementById('horae-designer-images');
        const imgCSS = _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg);
        if (imgCSS) {
            if (!imgEl) { imgEl = document.createElement('style'); imgEl.id = 'horae-designer-images'; document.head.appendChild(imgEl); }
            imgEl.textContent = imgCSS;
        } else { imgEl?.remove(); }

        const sw = modal.querySelector('#htd-swatches');
        const swKeys = ['--horae-primary', '--horae-primary-light', '--horae-primary-dark', '--horae-accent',
            '--horae-bg', '--horae-bg-secondary', '--horae-bg-hover', '--horae-text', '--horae-text-muted'];
        sw.innerHTML = swKeys.map(k =>
            `<div class="htd-swatch" style="background:${vars[k]}" title="${k.replace('--horae-', '')}: ${vars[k]}"></div>`
        ).join('');

        const fineBody = modal.querySelector('#htd-fine-body');
        if (fineBody.style.display !== 'none') {
            fineBody.querySelectorAll('.htd-fine-cpick').forEach(inp => {
                const vn = inp.dataset.vn;
                if (!st.overrides[vn] && vars[vn]?.startsWith('#')) {
                    inp.value = vars[vn];
                    inp.nextElementSibling.textContent = vars[vn];
                }
            });
        }
    }

    // ---- Hue bar drag ----
    let hueDrag = false;
    function onHue(e) {
        const r = hueBar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(r.width, cx - r.left));
        st.hue = Math.round((x / r.width) * 360);
        hueInd.style.left = `${(st.hue / 360) * 100}%`;
        hueInd.style.background = `hsl(${st.hue}, 100%, 50%)`;
        st.overrides = {};
        update();
    }
    hueBar.addEventListener('mousedown', e => { hueDrag = true; onHue(e); }, { signal: sig });
    hueBar.addEventListener('touchstart', e => { hueDrag = true; onHue(e); }, { signal: sig, passive: true });
    document.addEventListener('mousemove', e => { if (hueDrag) onHue(e); }, { signal: sig });
    document.addEventListener('touchmove', e => { if (hueDrag) onHue(e); }, { signal: sig, passive: true });
    document.addEventListener('mouseup', () => hueDrag = false, { signal: sig, capture: true });
    document.addEventListener('touchend', () => hueDrag = false, { signal: sig, capture: true });

    // ---- Sliders ----
    modal.querySelector('#htd-sat').addEventListener('input', function () {
        st.sat = +this.value; modal.querySelector('#htd-satv').textContent = st.sat;
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-cl').addEventListener('input', function () {
        st.colorLight = +this.value; modal.querySelector('#htd-clv').textContent = st.colorLight;
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-bri').addEventListener('input', function () {
        st.bright = +this.value;
        modal.querySelector('#htd-briv').textContent = st.bright <= 50 ? t('ui.night') : t('ui.day');
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-accent').addEventListener('input', function () {
        st.accent = this.value;
        modal.querySelector('#htd-accent-hex').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- Collapsible ----
    modal.querySelector('#htd-fine-t').addEventListener('click', () => {
        const body = modal.querySelector('#htd-fine-body');
        const show = body.style.display === 'none';
        body.style.display = show ? 'block' : 'none';
        if (show) buildFine();
    }, { signal: sig });
    modal.querySelector('#htd-img-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-imgs-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });

    // ---- Fine pickers ----
    const FINE_VARS = [
        ['--horae-primary', t('ui.primaryColor')], ['--horae-primary-light', t('ui.primaryLight')], ['--horae-primary-dark', t('ui.primaryDark')],
        ['--horae-accent', t('ui.accentColor')], ['--horae-success', t('ui.successColor')], ['--horae-warning', t('ui.warningColor')],
        ['--horae-danger', t('ui.dangerColor')], ['--horae-info', t('ui.infoColor')],
        ['--horae-bg', t('ui.bgColor')], ['--horae-bg-secondary', t('ui.bgSecondary')], ['--horae-bg-hover', t('ui.bgHover')],
        ['--horae-text', 'Text'], ['--horae-text-muted', 'Text Muted']
    ];
    function buildFine() {
        const c = modal.querySelector('#htd-fine-body');
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        c.innerHTML = FINE_VARS.map(([vn, label]) => {
            const val = vars[vn] || '#888888';
            const hex = val.startsWith('#') ? val : '#888888';
            return `<div class="htd-fine-row"><span>${label}</span>
                <input type="color" class="htd-fine-cpick" data-vn="${vn}" value="${hex}">
                <span class="htd-fine-hex">${val}</span></div>`;
        }).join('');
        c.querySelectorAll('.htd-fine-cpick').forEach(inp => {
            inp.addEventListener('input', () => {
                st.overrides[inp.dataset.vn] = inp.value;
                inp.nextElementSibling.textContent = inp.value;
                update();
            }, { signal: sig });
        });
    }

    // ---- Image inputs ----
    ['drawer', 'header', 'body', 'panel'].forEach(key => {
        const urlIn = modal.querySelector(`#htd-img-${key}`);
        const opSl = modal.querySelector(`#htd-imgsl-${key}`);
        const pv = modal.querySelector(`#htd-imgpv-${key}`);
        const opV = modal.querySelector(`#htd-imgop-${key}`);
        pv.onerror = () => pv.style.display = 'none';
        pv.onload = () => pv.style.display = 'block';
        urlIn.addEventListener('input', () => {
            st.images[key] = urlIn.value.trim();
            if (st.images[key]) pv.src = st.images[key]; else pv.style.display = 'none';
            update();
        }, { signal: sig });
        opSl.addEventListener('input', () => {
            st.imgOp[key] = +opSl.value;
            opV.textContent = opSl.value;
            update();
        }, { signal: sig });
    });

    // ---- Drawer bg color ----
    modal.querySelector('#htd-dbg').addEventListener('input', function () {
        st.drawerBg = this.value;
        modal.querySelector('#htd-dbg-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-dbg-clear').addEventListener('click', () => {
        st.drawerBg = '';
        modal.querySelector('#htd-dbg-hex').textContent = t('ui.followTheme');
        update();
    }, { signal: sig });

    // ---- RPG 状态栏 ----
    modal.querySelector('#htd-rpg-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-rpg-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });
    modal.querySelector('#htd-rpg-color').addEventListener('input', function () {
        st.rpgColor = this.value;
        modal.querySelector('#htd-rpg-color-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-rpg-op').addEventListener('input', function () {
        st.rpgOpacity = +this.value;
        modal.querySelector('#htd-rpg-opv').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- 骰子面板 ----
    modal.querySelector('#htd-dice-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-dice-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });
    modal.querySelector('#htd-dice-color').addEventListener('input', function () {
        st.diceColor = this.value;
        modal.querySelector('#htd-dice-color-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-dice-op').addEventListener('input', function () {
        st.diceOpacity = +this.value;
        modal.querySelector('#htd-dice-opv').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- 雷达图 ----
    modal.querySelector('#htd-radar-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-radar-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });
    modal.querySelector('#htd-radar-color').addEventListener('input', function () {
        st.radarColor = this.value;
        modal.querySelector('#htd-radar-color-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-radar-color-clear').addEventListener('click', () => {
        st.radarColor = '';
        modal.querySelector('#htd-radar-color-hex').textContent = t('ui.followTheme');
        update();
    }, { signal: sig });
    modal.querySelector('#htd-radar-label').addEventListener('input', function () {
        st.radarLabel = this.value;
        modal.querySelector('#htd-radar-label-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-radar-label-clear').addEventListener('click', () => {
        st.radarLabel = '';
        modal.querySelector('#htd-radar-label-hex').textContent = t('ui.followText');
        update();
    }, { signal: sig });

    // ---- Close ----
    function closeDesigner() {
        abortCtrl.abort();
        document.getElementById('horae-designer-preview')?.remove();
        document.getElementById('horae-designer-images')?.remove();
        modal.remove();
        applyThemeMode();
    }
    modal.querySelector('#htd-cancel').addEventListener('click', closeDesigner, { signal: sig });
    modal.addEventListener('click', e => { if (e.target === modal) closeDesigner(); }, { signal: sig });

    // ---- Save ----
    modal.querySelector('#htd-save').addEventListener('click', () => {
        const name = modal.querySelector('#htd-name').value.trim() || t('ui.customThemeName');
        const author = modal.querySelector('#htd-author').value.trim() || '';
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }
        if (st.radarColor) vars['--horae-radar-color'] = st.radarColor;
        if (st.radarLabel) vars['--horae-radar-label'] = st.radarLabel;
        const theme = {
            name, author, version: '1.0', variables: vars,
            images: { ...st.images }, imageOpacity: { ...st.imgOp },
            drawerBg: st.drawerBg,
            isLight: st.bright > 50,
            _designerState: { hue: st.hue, sat: st.sat, colorLight: st.colorLight, bright: st.bright, accent: st.accent, rpgColor: st.rpgColor, rpgOpacity: st.rpgOpacity, diceColor: st.diceColor, diceOpacity: st.diceOpacity, radarColor: st.radarColor, radarLabel: st.radarLabel },
            css: _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg)
        };
        if (!settings.customThemes) settings.customThemes = [];
        settings.customThemes.push(theme);
        settings.themeMode = `custom-${settings.customThemes.length - 1}`;
        abortCtrl.abort();
        document.getElementById('horae-designer-preview')?.remove();
        document.getElementById('horae-designer-images')?.remove();
        modal.remove();
        saveSettings();
        applyThemeMode();
        refreshThemeSelector();
        showToast(t('toast.themeSaved', {name}), 'success');
    }, { signal: sig });

    // ---- Export ----
    modal.querySelector('#htd-export').addEventListener('click', () => {
        const name = modal.querySelector('#htd-name').value.trim() || t('ui.customThemeName');
        const author = modal.querySelector('#htd-author').value.trim() || '';
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }
        if (st.radarColor) vars['--horae-radar-color'] = st.radarColor;
        if (st.radarLabel) vars['--horae-radar-label'] = st.radarLabel;
        const theme = {
            name, author, version: '1.0', variables: vars,
            images: { ...st.images }, imageOpacity: { ...st.imgOp },
            drawerBg: st.drawerBg,
            isLight: st.bright > 50,
            _designerState: { hue: st.hue, sat: st.sat, colorLight: st.colorLight, bright: st.bright, accent: st.accent, rpgColor: st.rpgColor, rpgOpacity: st.rpgOpacity, diceColor: st.diceColor, diceOpacity: st.diceOpacity, radarColor: st.radarColor, radarLabel: st.radarLabel },
            css: _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg)
        };
        const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `horae-${name}.json`; a.click();
        URL.revokeObjectURL(url);
        showToast(t('toast.themeExported'), 'info');
    }, { signal: sig });

    // ---- Reset ----
    modal.querySelector('#htd-reset').addEventListener('click', () => {
        st.hue = 265; st.sat = 84; st.colorLight = 50; st.bright = 25; st.accent = '#f59e0b';
        st.overrides = {}; st.drawerBg = '';
        st.rpgColor = '#000000'; st.rpgOpacity = 85;
        st.diceColor = '#1a1a2e'; st.diceOpacity = 15;
        st.radarColor = ''; st.radarLabel = '';
        st.images = { drawer: '', header: '', body: '', panel: '' };
        st.imgOp = { drawer: 30, header: 50, body: 30, panel: 30 };
        hueInd.style.left = `${(265 / 360) * 100}%`;
        hueInd.style.background = `hsl(265, 100%, 50%)`;
        modal.querySelector('#htd-sat').value = 84; modal.querySelector('#htd-satv').textContent = '84';
        modal.querySelector('#htd-cl').value = 50; modal.querySelector('#htd-clv').textContent = '50';
        modal.querySelector('#htd-bri').value = 25; modal.querySelector('#htd-briv').textContent = t('ui.night');
        modal.querySelector('#htd-accent').value = '#f59e0b';
        modal.querySelector('#htd-accent-hex').textContent = '#f59e0b';
        modal.querySelector('#htd-dbg-hex').textContent = t('ui.followTheme');
        modal.querySelector('#htd-rpg-color').value = '#000000';
        modal.querySelector('#htd-rpg-color-hex').textContent = '#000000';
        modal.querySelector('#htd-rpg-op').value = 85;
        modal.querySelector('#htd-rpg-opv').textContent = '85';
        modal.querySelector('#htd-dice-color').value = '#1a1a2e';
        modal.querySelector('#htd-dice-color-hex').textContent = '#1a1a2e';
        modal.querySelector('#htd-dice-op').value = 15;
        modal.querySelector('#htd-dice-opv').textContent = '15';
        modal.querySelector('#htd-radar-color-hex').textContent = t('ui.followTheme');
        modal.querySelector('#htd-radar-label-hex').textContent = t('ui.followText');
        ['drawer', 'header', 'body', 'panel'].forEach(k => {
            const u = modal.querySelector(`#htd-img-${k}`); if (u) u.value = '';
            const defOp = k === 'header' ? 50 : 30;
            const s = modal.querySelector(`#htd-imgsl-${k}`); if (s) s.value = defOp;
            const v = modal.querySelector(`#htd-imgop-${k}`); if (v) v.textContent = String(defOp);
            const p = modal.querySelector(`#htd-imgpv-${k}`); if (p) p.style.display = 'none';
        });
        const fBody = modal.querySelector('#htd-fine-body');
        if (fBody.style.display !== 'none') buildFine();
        update();
        showToast(t('toast.themeReset'), 'info');
    }, { signal: sig });

    update();
}

/**
 * 为消息添加元数据面板
 */
function addMessagePanel(messageEl, messageIndex) {
    try {
    const existingPanel = messageEl.querySelector('.horae-message-panel');
    if (existingPanel) return;
    
    const meta = horaeManager.getMessageMeta(messageIndex);
    if (!meta) return;
    
    // 格式化时间（标准日历添加周几）
    let time = '--';
    if (meta.timestamp?.story_date) {
        const parsed = parseStoryDate(meta.timestamp.story_date);
        if (parsed && parsed.type === 'standard') {
            time = formatStoryDate(parsed, true);
        } else {
            time = meta.timestamp.story_date;
        }
        if (meta.timestamp.story_time) {
            time += ' ' + meta.timestamp.story_time;
        }
    }
    // 兼容新旧事件格式
    const eventsArr = meta.events || (meta.event ? [meta.event] : []);
    const eventSummary = eventsArr.length > 0 
        ? eventsArr.map(e => e.summary).join(' | ') 
        : t('ui.noSpecialEvents');
    const charCount = meta.scene?.characters_present?.length || 0;
    const isSkipped = !!meta._skipHorae;
    const sideplayBtnStyle = settings.sideplayMode ? '' : 'display:none;';
    
    const panelHtml = `
        <div class="horae-message-panel${isSkipped ? ' horae-sideplay' : ''}" data-message-id="${messageIndex}">
            <div class="horae-panel-toggle">
                <div class="horae-panel-icon">
                    <i class="fa-regular ${isSkipped ? 'fa-eye-slash' : 'fa-clock'}"></i>
                </div>
                <div class="horae-panel-summary">
                    ${isSkipped ? `<span class="horae-sideplay-badge">${t('badge.sideplay')}</span>` : ''}
                    <span class="horae-summary-time">${isSkipped ? t('badge.noTracking') : time}</span>
                    <span class="horae-summary-divider">|</span>
                    <span class="horae-summary-event">${isSkipped ? t('badge.sideplayMarked') : eventSummary}</span>
                    <span class="horae-summary-divider">|</span>
                    <span class="horae-summary-chars">${isSkipped ? '' : charCount + ' ' + t('characters.present')}</span>
                </div>
                <div class="horae-panel-actions">
                    <button class="horae-btn-sideplay" title="${t('tooltip.sideplayMark')}" style="${sideplayBtnStyle}">
                        <i class="fa-solid ${isSkipped ? 'fa-eye' : 'fa-masks-theater'}"></i>
                    </button>
                    <button class="horae-btn-rescan" title="${t('tooltip.rescan')}">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                    <button class="horae-btn-expand" title="${t('tooltip.expandCollapse')}">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="horae-panel-content" style="display: none;">
                ${buildPanelContent(messageIndex, meta)}
            </div>
        </div>
    `;
    
    const mesTextEl = messageEl.querySelector('.mes_text');
    if (mesTextEl) {
        mesTextEl.insertAdjacentHTML('afterend', panelHtml);
        const panelEl = messageEl.querySelector('.horae-message-panel');
        bindPanelEvents(panelEl);
        if (!settings.showMessagePanel && panelEl) {
            panelEl.style.display = 'none';
        }
        // 应用自定义宽度和偏移
        const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
        if (w < 100 && panelEl) {
            panelEl.style.maxWidth = `${w}%`;
        }
        const ofs = Math.max(0, settings.panelOffset || 0);
        if (ofs > 0 && panelEl) {
            panelEl.style.marginLeft = `${ofs}px`;
        }
        // 继承主题模式
        if (isLightMode() && panelEl) {
            panelEl.classList.add('horae-light');
        }
        renderRpgHud(messageEl, messageIndex);
    }
    } catch (err) {
        console.error(`[Horae] addMessagePanel #${messageIndex} 失败:`, err);
    }
}

/**
 * 构建已删除物品显示
 */
function buildDeletedItemsDisplay(deletedItems) {
    if (!deletedItems || deletedItems.length === 0) {
        return '';
    }
    return deletedItems.map(item => `
        <div class="horae-deleted-item-tag">
            <i class="fa-solid fa-xmark"></i> ${item}
        </div>
    `).join('');
}

/**
 * 构建待办事项编辑行
 */
function buildAgendaEditorRows(agenda) {
    if (!agenda || agenda.length === 0) {
        return '';
    }
    return agenda.map(item => `
        <div class="horae-editor-row horae-agenda-edit-row">
            <input type="text" class="horae-agenda-date" style="flex:0 0 90px;max-width:90px;" value="${escapeHtml(item.date || '')}" placeholder="${t('label.date')}">
            <input type="text" class="horae-agenda-text" style="flex:1 1 0;min-width:0;" value="${escapeHtml(item.text || '')}" placeholder="${t('placeholder.agendaContentHint')}">
            <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** 关系网络面板渲染 — 数据源为 chat[0].horae_meta，不消耗 AI 输出 */
function buildPanelRelationships(meta) {
    if (!settings.sendRelationships) return '';
    const presentChars = meta.scene?.characters_present || [];
    const rels = horaeManager.getRelationshipsForCharacters(presentChars);
    if (rels.length === 0) return '';
    
    const rows = rels.map(r => {
        const noteStr = r.note ? ` <span class="horae-rel-note-sm">(${r.note})</span>` : '';
        return `<div class="horae-panel-rel-row">${r.from} <span class="horae-rel-arrow-sm">→</span> ${r.to}: <strong>${r.type}</strong>${noteStr}</div>`;
    }).join('');
    
    return `
        <div class="horae-panel-row full-width">
            <label><i class="fa-solid fa-diagram-project"></i> ${t('characters.relationships')}</label>
            <div class="horae-panel-relationships">${rows}</div>
        </div>`;
}

function buildPanelMoodEditable(meta) {
    if (!settings.sendMood) return '';
    const moodEntries = Object.entries(meta.mood || {});
    const rows = moodEntries.map(([char, emotion]) => `
        <div class="horae-editor-row horae-mood-row">
            <span class="mood-char">${escapeHtml(char)}</span>
            <input type="text" class="mood-emotion" value="${escapeHtml(emotion)}" placeholder="${t('placeholder.moodState')}"
            <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
    return `
        <div class="horae-panel-row full-width">
            <label><i class="fa-solid fa-face-smile"></i> ${t('ui.moodLabel')}</label>
            <div class="horae-mood-editor">${rows}</div>
            <button class="horae-btn-add-mood"><i class="fa-solid fa-plus"></i> ${t('common.add')}</button>
        </div>`;
}

function buildPanelContent(messageIndex, meta) {
    const costumeRows = Object.entries(meta.costumes || {}).map(([char, costume]) => `
        <div class="horae-editor-row">
            <input type="text" class="char-input" value="${escapeHtml(char)}" placeholder="${t('placeholder.holderName')}">
            <input type="text" value="${escapeHtml(costume)}" placeholder="${t('placeholder.costumeDesc')}">
            <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
    
    // 物品分类由主页面管理，底部栏不显示
    const itemRows = Object.entries(meta.items || {}).map(([name, info]) => {
        return `
            <div class="horae-editor-row horae-item-row">
                <input type="text" class="horae-item-icon" value="${escapeHtml(info.icon || '')}" placeholder="📦" maxlength="2">
                <input type="text" class="horae-item-name" value="${escapeHtml(name)}" placeholder="${t('placeholder.itemName')}">
                <input type="text" class="horae-item-holder" value="${escapeHtml(info.holder || '')}" placeholder="${t('label.holder')}">
                <input type="text" class="horae-item-location" value="${escapeHtml(info.location || '')}" placeholder="${t('label.location')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="horae-editor-row horae-item-desc-row">
                <input type="text" class="horae-item-description" value="${escapeHtml(info.description || '')}" placeholder="${t('placeholder.itemDesc')}">
            </div>
        `;
    }).join('');
    
    // 获取前一条消息的好感总值（使用缓存避免 O(n²) 重复遍历）
    const prevTotals = {};
    const chat = horaeManager.getChat();
    if (!buildPanelContent._affCache || buildPanelContent._affCacheLen !== chat.length) {
        buildPanelContent._affCache = [];
        buildPanelContent._affCacheLen = chat.length;
        const running = {};
        for (let i = 0; i < chat.length; i++) {
            const m = chat[i]?.horae_meta;
            if (m?.affection) {
                for (const [k, v] of Object.entries(m.affection)) {
                    let val = 0;
                    if (typeof v === 'object' && v !== null) {
                        if (v.type === 'absolute') val = parseFloat(v.value) || 0;
                        else if (v.type === 'relative') val = (running[k] || 0) + (parseFloat(v.value) || 0);
                    } else {
                        val = (running[k] || 0) + (parseFloat(v) || 0);
                    }
                    running[k] = val;
                }
            }
            buildPanelContent._affCache[i] = { ...running };
        }
    }
    if (messageIndex > 0 && buildPanelContent._affCache[messageIndex - 1]) {
        Object.assign(prevTotals, buildPanelContent._affCache[messageIndex - 1]);
    }
    
    const affectionRows = Object.entries(meta.affection || {}).map(([key, value]) => {
        // 解析当前层的值
        let delta = 0, newTotal = 0;
        const prevVal = prevTotals[key] || 0;
        
        if (typeof value === 'object' && value !== null) {
            if (value.type === 'absolute') {
                newTotal = parseFloat(value.value) || 0;
                delta = newTotal - prevVal;
            } else if (value.type === 'relative') {
                delta = parseFloat(value.value) || 0;
                newTotal = prevVal + delta;
            }
        } else {
            delta = parseFloat(value) || 0;
            newTotal = prevVal + delta;
        }
        
        const roundedDelta = Math.round(delta * 100) / 100;
        const roundedTotal = Math.round(newTotal * 100) / 100;
        const deltaStr = roundedDelta >= 0 ? `+${roundedDelta}` : `${roundedDelta}`;
        return `
            <div class="horae-editor-row horae-affection-row" data-char="${escapeHtml(key)}" data-prev="${prevVal}">
                <span class="horae-affection-char">${escapeHtml(key)}</span>
                <input type="text" class="horae-affection-delta" value="${deltaStr}" placeholder="${t('placeholder.affectionDelta')}">
                <input type="number" class="horae-affection-total" value="${roundedTotal}" placeholder="${t('placeholder.affectionTotal')}" step="any">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }).join('');
    
    // 兼容新旧事件格式
    const eventsArr = meta.events || (meta.event ? [meta.event] : []);
    const firstEvent = eventsArr[0] || {};
    const eventLevel = firstEvent.level || '';
    const eventSummary = firstEvent.summary || '';
    const multipleEventsNote = eventsArr.length > 1 ? `<span class="horae-note">${t('ui.multipleEventsNote', {n: eventsArr.length})}</span>` : '';
    
    return `
        <div class="horae-panel-grid">
            <div class="horae-panel-row">
                <label><i class="fa-regular fa-clock"></i> ${t('label.time')}</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-datetime" placeholder="${t('placeholder.dateTime')}" value="${escapeHtml((() => {
                        let val = meta.timestamp?.story_date || '';
                        if (meta.timestamp?.story_time) val += (val ? ' ' : '') + meta.timestamp.story_time;
                        return val;
                    })())}">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-location-dot"></i> ${t('label.location')}</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-location" value="${escapeHtml(meta.scene?.location || '')}" placeholder="${t('label.location')}">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-cloud"></i> ${t('label.atmosphere')}</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-atmosphere" value="${escapeHtml(meta.scene?.atmosphere || '')}" placeholder="${t('label.atmosphere')}">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-users"></i> ${t('characters.present')}</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-characters" value="${escapeHtml((meta.scene?.characters_present || []).join(', '))}" placeholder="${t('placeholder.charactersSeparated')}">
                </div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-shirt"></i> ${t('status.costumes')}</label>
                <div class="horae-costume-editor">${costumeRows}</div>
                <button class="horae-btn-add-costume"><i class="fa-solid fa-plus"></i> ${t('common.add')}</button>
            </div>
            ${buildPanelMoodEditable(meta)}
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-box-open"></i> ${t('status.itemTracking')}</label>
                <div class="horae-items-editor">${itemRows}</div>
                <button class="horae-btn-add-item"><i class="fa-solid fa-plus"></i> ${t('common.add')}</button>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-trash-can"></i> ${t('items.deletedItems')}</label>
                <div class="horae-deleted-items-display">${buildDeletedItemsDisplay(meta.deletedItems)}</div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-bookmark"></i> ${t('timeline.events')} ${multipleEventsNote}</label>
                <div class="horae-event-editor">
                    <select class="horae-input-event-level">
                        <option value="">${t('levels.none')}</option>
                        <option value="一般" ${eventLevel === '一般' ? 'selected' : ''}>${t('levels.normal')}</option>
                        <option value="重要" ${eventLevel === '重要' ? 'selected' : ''}>${t('levels.important')}</option>
                        <option value="关键" ${eventLevel === '关键' || eventLevel === '關鍵' ? 'selected' : ''}>${t('levels.critical')}</option>
                    </select>
                    <input type="text" class="horae-input-event-summary" value="${escapeHtml(eventSummary)}" placeholder="${t('placeholder.eventSummary')}">
                </div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-heart"></i> ${t('characters.affection')}</label>
                <div class="horae-affection-editor">${affectionRows}</div>
                <button class="horae-btn-add-affection"><i class="fa-solid fa-plus"></i> ${t('common.add')}</button>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-list-check"></i> ${t('timeline.agenda')}</label>
                <div class="horae-agenda-editor">${buildAgendaEditorRows(meta.agenda)}</div>
                <button class="horae-btn-add-agenda-row"><i class="fa-solid fa-plus"></i> ${t('common.add')}</button>
            </div>
            ${buildPanelRelationships(meta)}
        </div>
        <div class="horae-panel-rescan">
            <div class="horae-rescan-label"><i class="fa-solid fa-rotate"></i> ${t('ui.rescanMessage')}</div>
            <div class="horae-rescan-buttons">
                <button class="horae-btn-quick-scan horae-btn" title="${t('ui.quickScanTitle')}">
                    <i class="fa-solid fa-bolt"></i> ${t('tooltip.quickScan')}
                </button>
                <button class="horae-btn-ai-analyze horae-btn" title="${t('ui.aiAnalyzeTitle')}">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> ${t('tooltip.aiAnalysis')}
                </button>
            </div>
        </div>
        <div class="horae-panel-footer">
            <button class="horae-btn-save horae-btn"><i class="fa-solid fa-check"></i> ${t('common.save')}</button>
            <button class="horae-btn-cancel horae-btn"><i class="fa-solid fa-xmark"></i> ${t('common.cancel')}</button>
            <button class="horae-btn-open-drawer horae-btn" title="${t('tooltip.openPanel')}"><i class="fa-solid fa-clock-rotate-left"></i></button>
        </div>
    `;
}

/**
 * 绑定面板事件
 */
function bindPanelEvents(panelEl) {
    if (!panelEl) return;
    
    const messageId = parseInt(panelEl.dataset.messageId);
    const contentEl = panelEl.querySelector('.horae-panel-content');
    
    // 头部区域事件只绑定一次，避免重复绑定导致 toggle 互相抵消
    if (!panelEl._horaeBound) {
        panelEl._horaeBound = true;
        const toggleEl = panelEl.querySelector('.horae-panel-toggle');
        const expandBtn = panelEl.querySelector('.horae-btn-expand');
        const rescanBtn = panelEl.querySelector('.horae-btn-rescan');
        
        const togglePanel = () => {
            const isHidden = contentEl.style.display === 'none';
            contentEl.style.display = isHidden ? 'block' : 'none';
            const icon = expandBtn?.querySelector('i');
            if (icon) icon.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        };
        
        const sideplayBtn = panelEl.querySelector('.horae-btn-sideplay');
        
        toggleEl?.addEventListener('click', (e) => {
            if (e.target.closest('.horae-btn-expand') || e.target.closest('.horae-btn-rescan') || e.target.closest('.horae-btn-sideplay')) return;
            togglePanel();
        });
        expandBtn?.addEventListener('click', togglePanel);
        rescanBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            rescanMessageMeta(messageId, panelEl);
        });
        sideplayBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSideplay(messageId, panelEl);
        });
    }
    
    // 标记面板已修改
    let panelDirty = false;
    contentEl?.addEventListener('input', () => { panelDirty = true; });
    contentEl?.addEventListener('change', () => { panelDirty = true; });
    
    panelEl.querySelector('.horae-btn-save')?.addEventListener('click', () => {
        savePanelData(panelEl, messageId);
        panelDirty = false;
    });
    
    panelEl.querySelector('.horae-btn-cancel')?.addEventListener('click', () => {
        if (panelDirty && !confirm(t('confirm.closeUnsaved'))) return;
        contentEl.style.display = 'none';
        panelDirty = false;
    });
    
    panelEl.querySelector('.horae-btn-open-drawer')?.addEventListener('click', () => {
        const drawerIcon = $('#horae_drawer_icon');
        const drawerContent = $('#horae_drawer_content');
        const isOpen = drawerIcon.hasClass('openIcon');
        if (isOpen) {
            drawerIcon.removeClass('openIcon').addClass('closedIcon');
            drawerContent.removeClass('openDrawer').addClass('closedDrawer').css('display', 'none');
        } else {
            // 关闭其他抽屉
            $('.openDrawer').not('#horae_drawer_content').not('.pinnedOpen').css('display', 'none')
                .removeClass('openDrawer').addClass('closedDrawer');
            $('.openIcon').not('#horae_drawer_icon').not('.drawerPinnedOpen')
                .removeClass('openIcon').addClass('closedIcon');
            drawerIcon.removeClass('closedIcon').addClass('openIcon');
            drawerContent.removeClass('closedDrawer').addClass('openDrawer').css('display', '');
        }
    });
    
    panelEl.querySelector('.horae-btn-add-costume')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-costume-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row">
                <input type="text" class="char-input" placeholder="${t('placeholder.holderName')}">
                <input type="text" placeholder="${t('placeholder.costumeDesc')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-mood')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-mood-editor');
        if (!editor) return;
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-mood-row">
                <input type="text" class="mood-char" placeholder="${t('placeholder.holderName')}">
                <input type="text" class="mood-emotion" placeholder="${t('placeholder.moodState')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-item')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-items-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-item-row">
                <input type="text" class="horae-item-icon" placeholder="📦" maxlength="2">
                <input type="text" class="horae-item-name" placeholder="${t('placeholder.itemName')}">
                <input type="text" class="horae-item-holder" placeholder="${t('label.holder')}">
                <input type="text" class="horae-item-location" placeholder="${t('label.location')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="horae-editor-row horae-item-desc-row">
                <input type="text" class="horae-item-description" placeholder="${t('placeholder.itemDesc')}">
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-affection')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-affection-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-affection-row" data-char="" data-prev="0">
                <input type="text" class="horae-affection-char-input" placeholder="${t('placeholder.holderName')}">
                <input type="text" class="horae-affection-delta" value="+0" placeholder="${t('placeholder.affectionDelta')}">
                <input type="number" class="horae-affection-total" value="0" placeholder="${t('placeholder.affectionTotal')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
        bindAffectionInputs(editor);
    });
    
    // 添加待办事项行
    panelEl.querySelector('.horae-btn-add-agenda-row')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-agenda-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-agenda-edit-row">
                <input type="text" class="horae-agenda-date" style="flex:0 0 90px;max-width:90px;" value="" placeholder="${t('label.date')}">
                <input type="text" class="horae-agenda-text" style="flex:1 1 0;min-width:0;" value="" placeholder="${t('placeholder.agendaContentHint')}">
                <button class="horae-delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    // 绑定好感度输入联动
    bindAffectionInputs(panelEl.querySelector('.horae-affection-editor'));
    
    // 绑定现有删除按钮
    bindDeleteButtons(panelEl);
    
    // 快速解析按钮（不消耗API）
    panelEl.querySelector('.horae-btn-quick-scan')?.addEventListener('click', async () => {
        const chat = horaeManager.getChat();
        const message = chat[messageId];
        if (!message) {
            showToast(t('toast.cannotGetContent'), 'error');
            return;
        }
        
        // 先尝试解析标准标签
        let parsed = horaeManager.parseHoraeTag(message.mes);
        
        // 如果没有标签，尝试宽松解析
        if (!parsed) {
            parsed = horaeManager.parseLooseFormat(message.mes);
        }
        
        if (parsed) {
            // 获取现有元数据并合并
            const existingMeta = horaeManager.getMessageMeta(messageId) || createEmptyMeta();
            const newMeta = horaeManager.mergeParsedToMeta(existingMeta, parsed);
            // 处理表格更新
            if (newMeta._tableUpdates) {
                horaeManager.applyTableUpdates(newMeta._tableUpdates);
                delete newMeta._tableUpdates;
            }
            // 处理已完成待办
            if (parsed.deletedAgenda && parsed.deletedAgenda.length > 0) {
                horaeManager.removeCompletedAgenda(parsed.deletedAgenda);
            }
            // 全局同步
            if (parsed.relationships?.length > 0) {
                horaeManager._mergeRelationships(parsed.relationships);
            }
            if (parsed.scene?.scene_desc && parsed.scene?.location) {
                horaeManager._updateLocationMemory(parsed.scene.location, parsed.scene.scene_desc);
            }
            horaeManager.setMessageMeta(messageId, newMeta);
            
            const contentEl = panelEl.querySelector('.horae-panel-content');
            if (contentEl) {
                contentEl.innerHTML = buildPanelContent(messageId, newMeta);
                bindPanelEvents(panelEl);
            }
            
            getContext().saveChat();
            refreshAllDisplays();
            showToast(t('toast.saveSuccess'), 'success');
        } else {
            showToast(t('toast.noFormatData'), 'warning');
        }
    });
    
    // AI分析按钮（消耗API）
    panelEl.querySelector('.horae-btn-ai-analyze')?.addEventListener('click', async () => {
        const chat = horaeManager.getChat();
        const message = chat[messageId];
        if (!message) {
            showToast(t('toast.cannotGetContent'), 'error');
            return;
        }
        
        const btn = panelEl.querySelector('.horae-btn-ai-analyze');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('ui.analyzing')}`;
        btn.disabled = true;
        
        try {
            // 调用AI分析
            const result = await analyzeMessageWithAI(message.mes);
            
            if (result) {
                const existingMeta = horaeManager.getMessageMeta(messageId) || createEmptyMeta();
                const newMeta = horaeManager.mergeParsedToMeta(existingMeta, result);
                if (newMeta._tableUpdates) {
                    horaeManager.applyTableUpdates(newMeta._tableUpdates);
                    delete newMeta._tableUpdates;
                }
                // 处理已完成待办
                if (result.deletedAgenda && result.deletedAgenda.length > 0) {
                    horaeManager.removeCompletedAgenda(result.deletedAgenda);
                }
                // 全局同步
                if (result.relationships?.length > 0) {
                    horaeManager._mergeRelationships(result.relationships);
                }
                if (result.scene?.scene_desc && result.scene?.location) {
                    horaeManager._updateLocationMemory(result.scene.location, result.scene.scene_desc);
                }
                horaeManager.setMessageMeta(messageId, newMeta);
                
                const contentEl = panelEl.querySelector('.horae-panel-content');
                if (contentEl) {
                    contentEl.innerHTML = buildPanelContent(messageId, newMeta);
                    bindPanelEvents(panelEl);
                }
                
                getContext().saveChat();
                refreshAllDisplays();
                showToast(t('toast.saveSuccess'), 'success');
            } else {
                showToast(t('toast.aiAnalysisNoData'), 'warning');
            }
        } catch (error) {
            console.error('[Horae] AI分析失败:', error);
            showToast(t('toast.aiAnalysisFailed', {error: error.message}), 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

/**
 * 绑定删除按钮事件
 */
function bindDeleteButtons(container) {
    container.querySelectorAll('.horae-delete-btn').forEach(btn => {
        btn.onclick = () => {
            const row = btn.closest('.horae-editor-row');
            if (row?.classList.contains('horae-item-row')) {
                const descRow = row.nextElementSibling;
                if (descRow?.classList.contains('horae-item-desc-row')) {
                    descRow.remove();
                }
            }
            row?.remove();
        };
    });
}

/**
 * 绑定好感度输入框联动
 */
function bindAffectionInputs(container) {
    if (!container) return;
    
    container.querySelectorAll('.horae-affection-row').forEach(row => {
        const deltaInput = row.querySelector('.horae-affection-delta');
        const totalInput = row.querySelector('.horae-affection-total');
        const prevVal = parseFloat(row.dataset.prev) || 0;
        
        deltaInput?.addEventListener('input', () => {
            const deltaStr = deltaInput.value.replace(/[^\d\.\-+]/g, '');
            const delta = parseFloat(deltaStr) || 0;
            totalInput.value = parseFloat((prevVal + delta).toFixed(2));
        });
        
        totalInput?.addEventListener('input', () => {
            const total = parseFloat(totalInput.value) || 0;
            const delta = parseFloat((total - prevVal).toFixed(2));
            deltaInput.value = delta >= 0 ? `+${delta}` : `${delta}`;
        });
    });
}

/** 切换消息的番外/小剧场标记 */
function toggleSideplay(messageId, panelEl) {
    const meta = horaeManager.getMessageMeta(messageId);
    if (!meta) return;
    const wasSkipped = !!meta._skipHorae;
    meta._skipHorae = !wasSkipped;
    horaeManager.setMessageMeta(messageId, meta);
    getContext().saveChat();
    
    // 重建面板
    const messageEl = panelEl.closest('.mes');
    if (messageEl) {
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
    }
    refreshAllDisplays();
    showToast(meta._skipHorae ? t('badge.sideplayMarked') : t('toast.saveSuccess'), 'success');
}

/** 重新扫描消息并更新面板（完全替换） */
function rescanMessageMeta(messageId, panelEl) {
    // 从DOM获取最新的消息内容（用户可能已编辑）
    const messageEl = panelEl.closest('.mes');
    if (!messageEl) {
        showToast(t('toast.msgElementNotFound'), 'error');
        return;
    }
    
    // 获取文本内容（包括隐藏的horae标签）
    // 先尝试从chat数组获取最新内容
    const context = window.SillyTavern?.getContext?.() || getContext?.();
    let messageContent = '';
    
    if (context?.chat?.[messageId]) {
        messageContent = context.chat[messageId].mes;
    }
    
    // 如果chat中没有或为空，从DOM获取
    if (!messageContent) {
        const mesTextEl = messageEl.querySelector('.mes_text');
        if (mesTextEl) {
            messageContent = mesTextEl.innerHTML;
        }
    }
    
    if (!messageContent) {
        showToast(t('toast.cannotGetContent'), 'error');
        return;
    }
    
    const parsed = horaeManager.parseHoraeTag(messageContent);
    
    if (parsed) {
        const existingMeta = horaeManager.getMessageMeta(messageId);
        // 用 mergeParsedToMeta 以空 meta 为基础，确保所有字段一致处理
        const newMeta = horaeManager.mergeParsedToMeta(createEmptyMeta(), parsed);
        
        // 只保留原有的NPC数据（如果新解析中没有）
        if ((!parsed.npcs || Object.keys(parsed.npcs).length === 0) && existingMeta?.npcs) {
            newMeta.npcs = existingMeta.npcs;
        }
        
        // 无新agenda则保留旧数据
        if ((!newMeta.agenda || newMeta.agenda.length === 0) && existingMeta?.agenda?.length > 0) {
            newMeta.agenda = existingMeta.agenda;
        }
        
        // 处理表格更新
        if (newMeta._tableUpdates) {
            horaeManager.applyTableUpdates(newMeta._tableUpdates);
            delete newMeta._tableUpdates;
        }
        
        // 处理已完成待办
        if (parsed.deletedAgenda && parsed.deletedAgenda.length > 0) {
            horaeManager.removeCompletedAgenda(parsed.deletedAgenda);
        }
        
        // 全局同步：关系网络合并到 chat[0]
        if (parsed.relationships?.length > 0) {
            horaeManager._mergeRelationships(parsed.relationships);
        }
        // 全局同步：场景记忆更新
        if (parsed.scene?.scene_desc && parsed.scene?.location) {
            horaeManager._updateLocationMemory(parsed.scene.location, parsed.scene.scene_desc);
        }
        
        horaeManager.setMessageMeta(messageId, newMeta);
        getContext().saveChat();
        
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
        
        // 同时刷新主显示
        refreshAllDisplays();
        
        showToast(t('toast.saveSuccess'), 'success');
    } else {
        // 无标签，清空数据（保留NPC）
        const existingMeta = horaeManager.getMessageMeta(messageId);
        const newMeta = createEmptyMeta();
        if (existingMeta?.npcs) {
            newMeta.npcs = existingMeta.npcs;
        }
        horaeManager.setMessageMeta(messageId, newMeta);
        
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
        refreshAllDisplays();
        
        showToast(t('toast.noHoraeTagsFound'), 'warning');
    }
}

/**
 * 保存面板数据
 */
function savePanelData(panelEl, messageId) {
    // 获取现有的 meta，保留面板中没有编辑区的数据（如 NPC）
    const existingMeta = horaeManager.getMessageMeta(messageId);
    const meta = createEmptyMeta();
    
    // 保留面板中没有编辑区的数据
    if (existingMeta?.npcs) {
        meta.npcs = JSON.parse(JSON.stringify(existingMeta.npcs));
    }
    if (existingMeta?.relationships?.length) {
        meta.relationships = JSON.parse(JSON.stringify(existingMeta.relationships));
    }
    if (existingMeta?.scene?.scene_desc) {
        meta.scene.scene_desc = existingMeta.scene.scene_desc;
    }
    if (existingMeta?.mood && Object.keys(existingMeta.mood).length > 0) {
        meta.mood = JSON.parse(JSON.stringify(existingMeta.mood));
    }
    
    // 分离日期时间
    const datetimeVal = (panelEl.querySelector('.horae-input-datetime')?.value || '').trim();
    const clockMatch = datetimeVal.match(/\b(\d{1,2}:\d{2})\s*$/);
    if (clockMatch) {
        meta.timestamp.story_time = clockMatch[1];
        meta.timestamp.story_date = datetimeVal.substring(0, datetimeVal.lastIndexOf(clockMatch[1])).trim();
    } else {
        meta.timestamp.story_date = datetimeVal;
        meta.timestamp.story_time = '';
    }
    meta.timestamp.absolute = new Date().toISOString();
    
    // 场景
    meta.scene.location = panelEl.querySelector('.horae-input-location')?.value || '';
    meta.scene.atmosphere = panelEl.querySelector('.horae-input-atmosphere')?.value || '';
    const charsInput = panelEl.querySelector('.horae-input-characters')?.value || '';
    meta.scene.characters_present = charsInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    
    // 服装
    panelEl.querySelectorAll('.horae-costume-editor .horae-editor-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 2) {
            const char = inputs[0].value.trim();
            const costume = inputs[1].value.trim();
            if (char && costume) {
                meta.costumes[char] = costume;
            }
        }
    });
    
    // 情绪
    panelEl.querySelectorAll('.horae-mood-editor .horae-mood-row').forEach(row => {
        const charEl = row.querySelector('.mood-char');
        const emotionInput = row.querySelector('.mood-emotion');
        const char = (charEl?.tagName === 'INPUT' ? charEl.value : charEl?.textContent)?.trim();
        const emotion = emotionInput?.value?.trim();
        if (char && emotion) meta.mood[char] = emotion;
    });
    
    // 物品配对处理
    const itemMainRows = panelEl.querySelectorAll('.horae-items-editor .horae-item-row');
    const itemDescRows = panelEl.querySelectorAll('.horae-items-editor .horae-item-desc-row');
    const latestState = horaeManager.getLatestState();
    const existingItems = latestState.items || {};
    
    itemMainRows.forEach((row, idx) => {
        const iconInput = row.querySelector('.horae-item-icon');
        const nameInput = row.querySelector('.horae-item-name');
        const holderInput = row.querySelector('.horae-item-holder');
        const locationInput = row.querySelector('.horae-item-location');
        const descRow = itemDescRows[idx];
        const descInput = descRow?.querySelector('.horae-item-description');
        
        if (nameInput) {
            const name = nameInput.value.trim();
            if (name) {
                // 从物品栏获取已保存的importance，底部栏不再编辑分类
                const existingImportance = existingItems[name]?.importance || existingMeta?.items?.[name]?.importance || '';
                meta.items[name] = {
                    icon: iconInput?.value.trim() || null,
                    importance: existingImportance,  // 保留物品栏的分类
                    holder: holderInput?.value.trim() || null,
                    location: locationInput?.value.trim() || '',
                    description: descInput?.value.trim() || ''
                };
            }
        }
    });
    
    // 事件
    const eventLevel = panelEl.querySelector('.horae-input-event-level')?.value;
    const eventSummary = panelEl.querySelector('.horae-input-event-summary')?.value;
    if (eventLevel && eventSummary) {
        meta.events = [{
            is_important: eventLevel === '重要' || eventLevel === '关键' || eventLevel === '關鍵',
            level: eventLevel,
            summary: eventSummary
        }];
    }
    
    panelEl.querySelectorAll('.horae-affection-editor .horae-affection-row').forEach(row => {
        const charSpan = row.querySelector('.horae-affection-char');
        const charInput = row.querySelector('.horae-affection-char-input');
        const totalInput = row.querySelector('.horae-affection-total');
        
        const key = charSpan?.textContent?.trim() || charInput?.value?.trim() || '';
        const total = parseFloat(totalInput?.value) || 0;
        
        if (key) {
            meta.affection[key] = { type: 'absolute', value: total };
        }
    });
    
    // 兼容旧格式
    panelEl.querySelectorAll('.horae-affection-editor .horae-editor-row:not(.horae-affection-row)').forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 2) {
            const key = inputs[0].value.trim();
            const value = inputs[1].value.trim();
            if (key && value) {
                meta.affection[key] = value;
            }
        }
    });
    
    const agendaItems = [];
    panelEl.querySelectorAll('.horae-agenda-editor .horae-agenda-edit-row').forEach(row => {
        const dateInput = row.querySelector('.horae-agenda-date');
        const textInput = row.querySelector('.horae-agenda-text');
        const date = dateInput?.value?.trim() || '';
        const text = textInput?.value?.trim() || '';
        if (text) {
            // 保留原 source
            const existingAgendaItem = existingMeta?.agenda?.find(a => a.text === text);
            const source = existingAgendaItem?.source || 'user';
            agendaItems.push({ date, text, source, done: false });
        }
    });
    if (agendaItems.length > 0) {
        meta.agenda = agendaItems;
    } else if (existingMeta?.agenda?.length > 0) {
        // 无编辑行时保留原有待办
        meta.agenda = existingMeta.agenda;
    }
    
    horaeManager.setMessageMeta(messageId, meta);
    
    // 全局同步
    if (meta.relationships?.length > 0) {
        horaeManager._mergeRelationships(meta.relationships);
    }
    if (meta.scene?.scene_desc && meta.scene?.location) {
        horaeManager._updateLocationMemory(meta.scene.location, meta.scene.scene_desc);
    }
    
    // 同步写入正文标签
    injectHoraeTagToMessage(messageId, meta);
    
    getContext().saveChat();
    
    showToast(t('toast.saveSuccess'), 'success');
    refreshAllDisplays();
    
    // 更新面板摘要
    const summaryTime = panelEl.querySelector('.horae-summary-time');
    const summaryEvent = panelEl.querySelector('.horae-summary-event');
    const summaryChars = panelEl.querySelector('.horae-summary-chars');
    
    if (summaryTime) {
        if (meta.timestamp.story_date) {
            const parsed = parseStoryDate(meta.timestamp.story_date);
            let dateDisplay = meta.timestamp.story_date;
            if (parsed && parsed.type === 'standard') {
                dateDisplay = formatStoryDate(parsed, true);
            }
            summaryTime.textContent = dateDisplay + (meta.timestamp.story_time ? ' ' + meta.timestamp.story_time : '');
        } else {
            summaryTime.textContent = '--';
        }
    }
    if (summaryEvent) {
        const evts = meta.events || (meta.event ? [meta.event] : []);
        summaryEvent.textContent = evts.length > 0 ? evts.map(e => e.summary).join(' | ') : t('ui.noSpecialEvents');
    }
    if (summaryChars) {
        summaryChars.textContent = t('ui.presentCount', {n: meta.scene.characters_present.length});
    }
}

/** 构建 <horae> 标签字符串 */
function buildHoraeTagFromMeta(meta) {
    const lines = [];
    
    if (meta.timestamp?.story_date) {
        let timeLine = `time:${meta.timestamp.story_date}`;
        if (meta.timestamp.story_time) timeLine += ` ${meta.timestamp.story_time}`;
        lines.push(timeLine);
    }
    
    if (meta.scene?.location) {
        lines.push(`location:${meta.scene.location}`);
    }
    
    if (meta.scene?.atmosphere) {
        lines.push(`atmosphere:${meta.scene.atmosphere}`);
    }
    
    if (meta.scene?.characters_present?.length > 0) {
        lines.push(`characters:${meta.scene.characters_present.join(',')}`);
    }
    
    if (meta.costumes) {
        for (const [char, costume] of Object.entries(meta.costumes)) {
            if (char && costume) {
                lines.push(`costume:${char}=${costume}`);
            }
        }
    }
    
    if (meta.items) {
        for (const [name, info] of Object.entries(meta.items)) {
            if (!name) continue;
            const imp = info.importance === '!!' ? '!!' : info.importance === '!' ? '!' : '';
            const icon = info.icon || '';
            const desc = info.description ? `|${info.description}` : '';
            const holder = info.holder || '';
            const loc = info.location ? `@${info.location}` : '';
            lines.push(`item${imp}:${icon}${name}${desc}=${holder}${loc}`);
        }
    }
    
    // deleted items
    if (meta.deletedItems?.length > 0) {
        for (const item of meta.deletedItems) {
            lines.push(`item-:${item}`);
        }
    }
    
    if (meta.affection) {
        for (const [name, value] of Object.entries(meta.affection)) {
            if (!name) continue;
            if (typeof value === 'object') {
                if (value.type === 'relative') {
                    lines.push(`affection:${name}${value.value}`);
                } else {
                    lines.push(`affection:${name}=${value.value}`);
                }
            } else {
                lines.push(`affection:${name}=${value}`);
            }
        }
    }
    
    // npcs（使用新格式：npc:名|外貌=性格@关系~扩展字段）
    if (meta.npcs) {
        for (const [name, info] of Object.entries(meta.npcs)) {
            if (!name) continue;
            const app = info.appearance || '';
            const per = info.personality || '';
            const rel = info.relationship || '';
            let npcLine = '';
            if (app || per || rel) {
                npcLine = `npc:${name}|${app}=${per}@${rel}`;
            } else {
                npcLine = `npc:${name}`;
            }
            const extras = [];
            if (info.gender) extras.push(`性别:${info.gender}`);
            if (info.age) extras.push(`年龄:${info.age}`);
            if (info.race) extras.push(`种族:${info.race}`);
            if (info.job) extras.push(`职业:${info.job}`);
            if (info.birthday) extras.push(`生日:${info.birthday}`);
            if (info.note) extras.push(`补充:${info.note}`);
            if (extras.length > 0) npcLine += `~${extras.join('~')}`;
            lines.push(npcLine);
        }
    }
    
    if (meta.agenda?.length > 0) {
        for (const item of meta.agenda) {
            if (item.text) {
                const datePart = item.date ? `${item.date}|` : '';
                lines.push(`agenda:${datePart}${item.text}`);
            }
        }
    }

    if (meta.relationships?.length > 0) {
        for (const r of meta.relationships) {
            if (r.from && r.to && r.type) {
                lines.push(`rel:${r.from}>${r.to}=${r.type}${r.note ? '|' + r.note : ''}`);
            }
        }
    }

    if (meta.mood && Object.keys(meta.mood).length > 0) {
        for (const [char, emotion] of Object.entries(meta.mood)) {
            if (char && emotion) lines.push(`mood:${char}=${emotion}`);
        }
    }

    if (meta.scene?.scene_desc) {
        lines.push(`scene_desc:${meta.scene.scene_desc}`);
    }
    
    if (lines.length === 0) return '';
    return `<horae>\n${lines.join('\n')}\n</horae>`;
}

/** 构建 <horaeevent> 标签字符串 */
function buildHoraeEventTagFromMeta(meta) {
    const events = meta.events || (meta.event ? [meta.event] : []);
    if (events.length === 0) return '';
    
    const lines = events
        .filter(e => e.summary)
        .map(e => `event:${e.level || '一般'}|${e.summary}`);
    
    if (lines.length === 0) return '';
    return `<horaeevent>\n${lines.join('\n')}\n</horaeevent>`;
}

/** 同步注入正文标签 */
function injectHoraeTagToMessage(messageId, meta) {
    try {
        const chat = horaeManager.getChat();
        if (!chat?.[messageId]) return;
        
        const message = chat[messageId];
        let mes = message.mes;
        
        // === 处理 <horae> 标签 ===
        const newHoraeTag = buildHoraeTagFromMeta(meta);
        const hasHoraeTag = /<horae>[\s\S]*?<\/horae>/i.test(mes);
        
        if (hasHoraeTag) {
            mes = newHoraeTag
                ? mes.replace(/<horae>[\s\S]*?<\/horae>/gi, newHoraeTag)
                : mes.replace(/<horae>[\s\S]*?<\/horae>/gi, '').trim();
        } else if (newHoraeTag) {
            mes = mes.trimEnd() + '\n\n' + newHoraeTag;
        }
        
        // === 处理 <horaeevent> 标签 ===
        const newEventTag = buildHoraeEventTagFromMeta(meta);
        const hasEventTag = /<horaeevent>[\s\S]*?<\/horaeevent>/i.test(mes);
        
        if (hasEventTag) {
            mes = newEventTag
                ? mes.replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, newEventTag)
                : mes.replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, '').trim();
        } else if (newEventTag) {
            mes = mes.trimEnd() + '\n' + newEventTag;
        }
        
        message.mes = mes;
        console.log(`[Horae] 已同步写入消息 #${messageId} 的标签`);
    } catch (error) {
        console.error(`[Horae] 写入标签失败:`, error);
    }
}


export {
    _tdHslToHex,
    _tdHexToHsl,
    _tdHexToRgb,
    _tdParseColorHsl,
    _tdGenerateVars,
    _tdBuildImageCSS,
    openThemeDesigner,
    addMessagePanel,
    buildDeletedItemsDisplay,
    buildAgendaEditorRows,
    buildPanelRelationships,
    buildPanelMoodEditable,
    buildPanelContent,
    bindPanelEvents,
    bindDeleteButtons,
    bindAffectionInputs,
    toggleSideplay,
    rescanMessageMeta,
    savePanelData,
    buildHoraeTagFromMeta,
    buildHoraeEventTagFromMeta,
    injectHoraeTagToMessage
};
