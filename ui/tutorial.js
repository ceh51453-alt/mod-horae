import { settings, appState, saveSettings } from '../core/state.js';
import { t } from '../core/i18n.js';

// ============================================
// 新用户导航教学
// ============================================

function _getTutorialSteps() {
    return [
        { title: t('tutorial.step1Title'), content: t('tutorial.step1Content'), target: null, action: null },
        { title: t('tutorial.step2Title'), content: t('tutorial.step2Content'), target: '#horae-btn-ai-scan', action: null },
        { title: t('tutorial.step3Title'), content: t('tutorial.step3Content'), target: '#horae-autosummary-collapse-toggle',
          action: () => { const b = document.getElementById('horae-autosummary-collapse-body'); if (b && b.style.display === 'none') document.getElementById('horae-autosummary-collapse-toggle')?.click(); } },
        { title: t('tutorial.step4Title'), content: t('tutorial.step4Content'), target: '#horae-vector-collapse-toggle',
          action: () => { const b = document.getElementById('horae-vector-collapse-body'); if (b && b.style.display === 'none') document.getElementById('horae-vector-collapse-toggle')?.click(); } },
        { title: t('tutorial.step5Title'), content: t('tutorial.step5Content'), target: '#horae-setting-context-depth', action: null },
        { title: t('tutorial.step6Title'), content: t('tutorial.step6Content'), target: '#horae-setting-injection-position', action: null },
        { title: t('tutorial.step7Title'), content: t('tutorial.step7Content'), target: '#horae-prompt-collapse-toggle',
          action: () => { const b = document.getElementById('horae-prompt-collapse-body'); if (b && b.style.display === 'none') document.getElementById('horae-prompt-collapse-toggle')?.click(); } },
        { title: t('tutorial.step8Title'), content: t('tutorial.step8Content'), target: '#horae-custom-tables-list', action: null },
        { title: t('tutorial.step9Title'), content: t('tutorial.step9Content'), target: '#horae-setting-send-location-memory', action: null },
        { title: t('tutorial.step10Title'), content: t('tutorial.step10Content'), target: null, action: null }
    ];
}

async function startTutorial() {
    let drawerOpened = false;
    const steps = _getTutorialSteps();

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isLast = i === steps.length - 1;

        // 首个需要面板的步骤时打开抽屉并切到设置 tab
        if (step.target && !drawerOpened) {
            const drawerIcon = $('#horae_drawer_icon');
            if (drawerIcon.hasClass('closedIcon')) {
                drawerIcon.trigger('click');
                await new Promise(r => setTimeout(r, 400));
            }
            $(`.horae-tab[data-tab="settings"]`).trigger('click');
            await new Promise(r => setTimeout(r, 200));
            drawerOpened = true;
        }

        if (step.action) step.action();

        if (step.target) {
            await new Promise(r => setTimeout(r, 200));
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        const continued = await showTutorialStep(step, i + 1, steps.length, isLast);
        if (!continued) break;
    }

    settings.tutorialCompleted = true;
    saveSettings();
}

function showTutorialStep(step, current, total, isLast) {
    return new Promise(resolve => {
        document.querySelectorAll('.horae-tutorial-card').forEach(e => e.remove());
        document.querySelectorAll('.horae-tutorial-highlight').forEach(e => e.classList.remove('horae-tutorial-highlight'));

        // 高亮目标并定位插入点
        let highlightEl = null;
        let insertAfterEl = null;
        if (step.target) {
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                highlightEl = targetEl.closest('.horae-settings-section') || targetEl;
                highlightEl.classList.add('horae-tutorial-highlight');
                insertAfterEl = highlightEl;
            }
        }

        const card = document.createElement('div');
        card.className = 'horae-tutorial-card' + (isLightMode() ? ' horae-light' : '');
        card.innerHTML = `
            <div class="horae-tutorial-card-head">
                <span class="horae-tutorial-step-indicator">${current}/${total}</span>
                <strong>${step.title}</strong>
            </div>
            <div class="horae-tutorial-card-body">${step.content}</div>
            <div class="horae-tutorial-card-foot">
                <button class="horae-tutorial-skip">${t('tutorial.skip')}</button>
                <button class="horae-tutorial-next">${isLast ? t('tutorial.done') : t('tutorial.next')}</button>
            </div>
        `;

        // 紧跟在目标区域后面插入，没有目标则放到设置页顶部
        if (insertAfterEl && insertAfterEl.parentNode) {
            insertAfterEl.parentNode.insertBefore(card, insertAfterEl.nextSibling);
        } else {
            const container = document.getElementById('horae-tab-settings') || document.getElementById('horae_drawer_content');
            if (container) {
                container.insertBefore(card, container.firstChild);
            } else {
                document.body.appendChild(card);
            }
        }

        // 自动滚到高亮目标（教学卡片紧跟其后，一起可见）
        const scrollTarget = highlightEl || card;
        setTimeout(() => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

        const cleanup = () => {
            if (highlightEl) highlightEl.classList.remove('horae-tutorial-highlight');
            card.remove();
        };
        card.querySelector('.horae-tutorial-next').addEventListener('click', () => { cleanup(); resolve(true); });
        card.querySelector('.horae-tutorial-skip').addEventListener('click', () => { cleanup(); resolve(false); });
    });
}


export {
    _getTutorialSteps,
    startTutorial,
    showTutorialStep
};
