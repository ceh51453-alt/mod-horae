import { settings, appState, saveSettings, horaeManager, getContext, showToast } from '../core/state.js';
import { t, applyI18nToDOM } from '../core/i18n.js';
import { escapeHtml } from '../utils/timeUtils.js';

// ============================================
// Excel风格自定义表格功能
// ============================================

// 每个表格独立的 Undo/Redo 栈，key = tableId
const TABLE_HISTORY_MAX = 20;
const _perTableUndo = {};  // { tableId: [snapshot, ...] }
const _perTableRedo = {};  // { tableId: [snapshot, ...] }

function _getTableId(scope, tableIndex) {
    const tables = getTablesByScope(scope);
    return tables[tableIndex]?.id || `${scope}_${tableIndex}`;
}

function _deepCopyOneTable(scope, tableIndex) {
    const tables = getTablesByScope(scope);
    if (!tables[tableIndex]) return null;
    return JSON.parse(JSON.stringify(tables[tableIndex]));
}

/** 在修改前调用：保存指定表格的快照到其独立 undo 栈 */
function pushTableSnapshot(scope, tableIndex) {
    if (tableIndex == null) return;
    const tid = _getTableId(scope, tableIndex);
    const snap = _deepCopyOneTable(scope, tableIndex);
    if (!snap) return;
    if (!_perTableUndo[tid]) _perTableUndo[tid] = [];
    _perTableUndo[tid].push({ scope, tableIndex, table: snap });
    if (_perTableUndo[tid].length > TABLE_HISTORY_MAX) _perTableUndo[tid].shift();
    _perTableRedo[tid] = [];
    _updatePerTableUndoRedoButtons(tid);
}

/** 撤回指定表格 */
function undoSingleTable(tid) {
    const stack = _perTableUndo[tid];
    if (!stack?.length) return;
    const snap = stack.pop();
    const tables = getTablesByScope(snap.scope);
    if (!tables[snap.tableIndex]) return;
    // 当前状态入 redo
    if (!_perTableRedo[tid]) _perTableRedo[tid] = [];
    _perTableRedo[tid].push({
        scope: snap.scope,
        tableIndex: snap.tableIndex,
        table: JSON.parse(JSON.stringify(tables[snap.tableIndex]))
    });
    tables[snap.tableIndex] = snap.table;
    setTablesByScope(snap.scope, tables);
    renderCustomTablesList();
    showToast(t('toast.tableUndone'), 'info');
}

/** 复原指定表格 */
function redoSingleTable(tid) {
    const stack = _perTableRedo[tid];
    if (!stack?.length) return;
    const snap = stack.pop();
    const tables = getTablesByScope(snap.scope);
    if (!tables[snap.tableIndex]) return;
    if (!_perTableUndo[tid]) _perTableUndo[tid] = [];
    _perTableUndo[tid].push({
        scope: snap.scope,
        tableIndex: snap.tableIndex,
        table: JSON.parse(JSON.stringify(tables[snap.tableIndex]))
    });
    tables[snap.tableIndex] = snap.table;
    setTablesByScope(snap.scope, tables);
    renderCustomTablesList();
    showToast(t('toast.tableRedone'), 'info');
}

function _updatePerTableUndoRedoButtons(tid) {
    const undoBtn = document.querySelector(`.horae-table-undo-btn[data-table-id="${tid}"]`);
    const redoBtn = document.querySelector(`.horae-table-redo-btn[data-table-id="${tid}"]`);
    if (undoBtn) undoBtn.disabled = !_perTableUndo[tid]?.length;
    if (redoBtn) redoBtn.disabled = !_perTableRedo[tid]?.length;
}

/** 切换聊天时清空所有 undo/redo 栈 */
function clearTableHistory() {
    for (const k of Object.keys(_perTableUndo)) delete _perTableUndo[k];
    for (const k of Object.keys(_perTableRedo)) delete _perTableRedo[k];
}

let activeContextMenu = null;

/**
 * 渲染自定义表格列表
 */
function renderCustomTablesList() {
    const listEl = document.getElementById('horae-custom-tables-list');
    if (!listEl) return;

    const globalTables = getGlobalTables();
    const charTables = getCharacterTables();
    const chatTables = getChatTables();

    if (globalTables.length === 0 && charTables.length === 0 && chatTables.length === 0) {
        listEl.innerHTML = `
            <div class="horae-custom-tables-empty">
                <i class="fa-solid fa-table-cells"></i>
                <div>${t('settings.customTables')}</div>
                <div style="font-size:11px;opacity:0.7;margin-top:4px;">${t('common.add')}</div>
            </div>
        `;
        return;
    }

    /** 渲染单个表格 */
    function renderOneTable(table, idx, scope) {
        const rows = table.rows || 2;
        const cols = table.cols || 2;
        const data = table.data || {};
        const lockedRows = new Set(table.lockedRows || []);
        const lockedCols = new Set(table.lockedCols || []);
        const lockedCells = new Set(table.lockedCells || []);
        const scopeConfig = {
            global:    { icon: 'fa-globe',     label: t('ui.scopeGlobal'),     title: t('ui.scopeGlobalDesc'),     color: 'var(--horae-accent)' },
            character: { icon: 'fa-id-card',   label: t('ui.scopeCharacter'),  title: t('ui.scopeCharacterDesc'),  color: 'var(--horae-warning)' },
            local:     { icon: 'fa-bookmark',  label: t('ui.scopeLocal'),      title: t('ui.scopeLocalDesc'),      color: 'var(--horae-primary-light)' },
        };
        const sc = scopeConfig[scope] || scopeConfig.local;
        const isGlobal = scope === 'global';
        const scopeIcon = sc.icon;
        const scopeLabel = sc.label;
        const scopeTitle = sc.title;

        let tableHtml = '<table class="horae-excel-table">';
        for (let r = 0; r < rows; r++) {
            const rowLocked = lockedRows.has(r);
            tableHtml += '<tr>';
            for (let c = 0; c < cols; c++) {
                const cellKey = `${r}-${c}`;
                const cellValue = data[cellKey] || '';
                const isHeader = r === 0 || c === 0;
                const tag = isHeader ? 'th' : 'td';
                const cellLocked = rowLocked || lockedCols.has(c) || lockedCells.has(cellKey);
                const charLen = [...cellValue].reduce((sum, ch) => sum + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
                const inputSize = Math.max(4, Math.min(charLen + 2, 40));
                const lockedClass = cellLocked ? ' horae-cell-locked' : '';
                tableHtml += `<${tag} data-row="${r}" data-col="${c}" class="${lockedClass}">`;
                tableHtml += `<input type="text" value="${escapeHtml(cellValue)}" size="${inputSize}" data-scope="${scope}" data-table="${idx}" data-row="${r}" data-col="${c}" placeholder="${isHeader ? t('ui.tableHeader') : ''}">`;
                tableHtml += `</${tag}>`;
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</table>';

        const tid = table.id || `${scope}_${idx}`;
        const hasUndo = !!(_perTableUndo[tid]?.length);
        const hasRedo = !!(_perTableRedo[tid]?.length);

        return `
            <div class="horae-excel-table-container" data-table-index="${idx}" data-scope="${scope}" data-table-id="${tid}">
                <div class="horae-excel-table-header">
                    <div class="horae-excel-table-title">
                        <i class="fa-solid ${scopeIcon}" title="${scopeTitle}" style="color:${sc.color}; cursor:pointer;" data-toggle-scope="${idx}" data-scope="${scope}"></i>
                        <span class="horae-table-scope-label" data-toggle-scope="${idx}" data-scope="${scope}" title="${t('ui.clickToToggleScope')}">${scopeLabel}</span>
                        <input type="text" value="${escapeHtml(table.name || '')}" placeholder="${t('ui.tableName')}" data-table-name="${idx}" data-scope="${scope}">
                    </div>
                    <div class="horae-excel-table-actions">
                        <button class="horae-table-undo-btn" title="${t('ui.undoBtn')}" data-table-id="${tid}" ${hasUndo ? '' : 'disabled'}>
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                        <button class="horae-table-redo-btn" title="${t('ui.redoBtn')}" data-table-id="${tid}" ${hasRedo ? '' : 'disabled'}>
                            <i class="fa-solid fa-rotate-right"></i>
                        </button>
                        <button class="clear-table-data-btn" title="${t('ui.clearDataBtn')}" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-eraser"></i>
                        </button>
                        <button class="export-table-btn" title="${t('ui.exportTableBtn')}" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="delete-table-btn danger" title="${t('ui.deleteTableBtn')}" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div><!-- header -->
                <div class="horae-excel-table-wrapper">
                    ${tableHtml}
                </div>
                <div class="horae-table-prompt-row">
                    <input type="text" value="${escapeHtml(table.prompt || '')}" placeholder="${t('ui.tablePromptPlaceholder')}" data-table-prompt="${idx}" data-scope="${scope}">
                </div>
            </div>
        `;
    }

    let html = '';
    if (globalTables.length > 0) {
        html += `<div class="horae-tables-group-label"><i class="fa-solid fa-globe"></i> ${t('ui.globalTables')}</div>`;
        html += globalTables.map((tbl, i) => renderOneTable(tbl, i, 'global')).join('');
    }
    if (charTables.length > 0) {
        const charName = getContext()?.name2 || '';
        html += `<div class="horae-tables-group-label"><i class="fa-solid fa-id-card"></i> ${t('ui.characterTables')}${charName ? ` (${charName})` : ''}</div>`;
        html += charTables.map((tbl, i) => renderOneTable(tbl, i, 'character')).join('');
    }
    if (chatTables.length > 0) {
        html += `<div class="horae-tables-group-label"><i class="fa-solid fa-bookmark"></i> ${t('ui.localTables')}</div>`;
        html += chatTables.map((tbl, i) => renderOneTable(tbl, i, 'local')).join('');
    }
    listEl.innerHTML = html;

    bindExcelTableEvents();
}


/**
 * 绑定Excel表格事件
 */
function bindExcelTableEvents() {
    /** 从元素属性获取scope */
    const getScope = (el) => el.dataset.scope || el.closest('[data-scope]')?.dataset.scope || 'local';

    // 单元格输入事件 - 自动保存 + 动态调整宽度
    document.querySelectorAll('.horae-excel-table input').forEach(input => {
        input.addEventListener('focus', (e) => {
            e.target._horaeSnapshotPushed = false;
        });
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.table);
            if (!e.target._horaeSnapshotPushed) {
                pushTableSnapshot(scope, tableIndex);
                e.target._horaeSnapshotPushed = true;
            }
            const row = parseInt(e.target.dataset.row);
            const col = parseInt(e.target.dataset.col);
            const value = e.target.value;

            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            if (!tables[tableIndex].data) tables[tableIndex].data = {};
            const key = `${row}-${col}`;
            if (value.trim()) {
                tables[tableIndex].data[key] = value;
            } else {
                delete tables[tableIndex].data[key];
            }
            if (row > 0 && col > 0) {
                purgeTableContributions((tables[tableIndex].name || '').trim(), scope);
            }
            setTablesByScope(scope, tables);
        });
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            const charLen = [...val].reduce((sum, ch) => sum + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
            e.target.size = Math.max(4, Math.min(charLen + 2, 40));
        });
    });

    // 表格名称输入事件
    document.querySelectorAll('input[data-table-name]').forEach(input => {
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.tableName);
            pushTableSnapshot(scope, tableIndex);
            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            tables[tableIndex].name = e.target.value;
            setTablesByScope(scope, tables);
        });
    });

    // 表格提示词输入事件
    document.querySelectorAll('input[data-table-prompt]').forEach(input => {
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.tablePrompt);
            pushTableSnapshot(scope, tableIndex);
            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            tables[tableIndex].prompt = e.target.value;
            setTablesByScope(scope, tables);
        });
    });

    // 导出表格按钮
    document.querySelectorAll('.export-table-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const scope = getScope(btn);
            const tableIndex = parseInt(btn.dataset.tableIndex);
            exportTable(tableIndex, scope);
        });
    });

    // 删除表格按钮
    document.querySelectorAll('.delete-table-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const container = btn.closest('.horae-excel-table-container');
            const scope = getScope(container);
            const tableIndex = parseInt(container.dataset.tableIndex);
            deleteCustomTable(tableIndex, scope);
        });
    });

    // 清空表格数据按钮（保留表头）
    document.querySelectorAll('.clear-table-data-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const scope = getScope(btn);
            const tableIndex = parseInt(btn.dataset.tableIndex);
            clearTableData(tableIndex, scope);
        });
    });

    // 全局/本地切换
    document.querySelectorAll('[data-toggle-scope]').forEach(el => {
        el.addEventListener('click', (e) => {
            const currentScope = el.dataset.scope;
            const tableIndex = parseInt(el.dataset.toggleScope);
            toggleTableScope(tableIndex, currentScope);
        });
    });
    
    // 所有单元格长按/右键显示菜单
    document.querySelectorAll('.horae-excel-table th, .horae-excel-table td').forEach(cell => {
        let pressTimer = null;

        const startPress = (e) => {
            pressTimer = setTimeout(() => {
                const tableContainer = cell.closest('.horae-excel-table-container');
                const tableIndex = parseInt(tableContainer.dataset.tableIndex);
                const scope = tableContainer.dataset.scope || 'local';
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                showTableContextMenu(e, tableIndex, row, col, scope);
            }, 500);
        };

        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };

        cell.addEventListener('mousedown', (e) => { e.stopPropagation(); startPress(e); });
        cell.addEventListener('touchstart', (e) => { e.stopPropagation(); startPress(e); }, { passive: false });
        cell.addEventListener('mouseup', (e) => { e.stopPropagation(); cancelPress(); });
        cell.addEventListener('mouseleave', cancelPress);
        cell.addEventListener('touchend', (e) => { e.stopPropagation(); cancelPress(); });
        cell.addEventListener('touchcancel', cancelPress);

        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tableContainer = cell.closest('.horae-excel-table-container');
            const tableIndex = parseInt(tableContainer.dataset.tableIndex);
            const scope = tableContainer.dataset.scope || 'local';
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            showTableContextMenu(e, tableIndex, row, col, scope);
        });
    });

    // 每个表格独立的撤回/复原按钮
    document.querySelectorAll('.horae-table-undo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            undoSingleTable(btn.dataset.tableId);
        });
    });
    document.querySelectorAll('.horae-table-redo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            redoSingleTable(btn.dataset.tableId);
        });
    });
}

/** 显示表格右键菜单 */
let contextMenuCloseHandler = null;

function showTableContextMenu(e, tableIndex, row, col, scope = 'local') {
    hideContextMenu();

    const tables = getTablesByScope(scope);
    const table = tables[tableIndex];
    if (!table) return;
    const lockedRows = new Set(table.lockedRows || []);
    const lockedCols = new Set(table.lockedCols || []);
    const lockedCells = new Set(table.lockedCells || []);
    const cellKey = `${row}-${col}`;
    const isCellLocked = lockedCells.has(cellKey) || lockedRows.has(row) || lockedCols.has(col);

    const isRowHeader = col === 0;
    const isColHeader = row === 0;
    const isCorner = row === 0 && col === 0;

    let menuItems = '';

    // 行操作（第一列所有行 / 任何单元格都能添加行）
    if (isCorner) {
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-plus"></i> ${t('ui.addRowBelow')}</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-plus"></i> ${t('ui.addColRight')}</div>
        `;
    } else if (isColHeader) {
        const colLocked = lockedCols.has(col);
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-col-left"><i class="fa-solid fa-arrow-left"></i> ${t('ui.addColLeft')}</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-arrow-right"></i> ${t('ui.addColRight')}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-col"><i class="fa-solid ${colLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${colLocked ? t('ui.unlockCol') : t('ui.lockCol')}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item danger" data-action="delete-col"><i class="fa-solid fa-trash-can"></i> ${t('ui.deleteCol')}</div>
        `;
    } else if (isRowHeader) {
        const rowLocked = lockedRows.has(row);
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-above"><i class="fa-solid fa-arrow-up"></i> ${t('ui.addRowAbove')}</div>
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-arrow-down"></i> ${t('ui.addRowBelow')}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-row"><i class="fa-solid ${rowLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${rowLocked ? t('ui.unlockRow') : t('ui.lockRow')}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item danger" data-action="delete-row"><i class="fa-solid fa-trash-can"></i> ${t('ui.deleteRow')}</div>
        `;
    } else {
        // 普通数据单元格
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-above"><i class="fa-solid fa-arrow-up"></i> ${t('ui.addRowAbove')}</div>
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-arrow-down"></i> ${t('ui.addRowBelow')}</div>
            <div class="horae-context-menu-item" data-action="add-col-left"><i class="fa-solid fa-arrow-left"></i> ${t('ui.addColLeft')}</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-arrow-right"></i> ${t('ui.addColRight')}</div>
        `;
    }

    // 所有非角落单元格都可以锁定/解锁单格
    if (!isCorner) {
        const cellLocked = lockedCells.has(cellKey);
        menuItems += `
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-cell"><i class="fa-solid ${cellLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${cellLocked ? t('ui.unlockCell') : t('ui.lockCell')}</div>
        `;
    }
    
    const menu = document.createElement('div');
    menu.className = 'horae-context-menu';
    if (isLightMode()) menu.classList.add('horae-light');
    menu.innerHTML = menuItems;
    
    // 获取位置
    const x = e.clientX || e.touches?.[0]?.clientX || 100;
    const y = e.clientY || e.touches?.[0]?.clientY || 100;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    document.body.appendChild(menu);
    activeContextMenu = menu;
    
    // 确保菜单不超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
    
    // 绑定菜单项点击 - 执行操作后关闭菜单
    menu.querySelectorAll('.horae-context-menu-item').forEach(item => {
        item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const action = item.dataset.action;
            hideContextMenu();
            setTimeout(() => {
                executeTableAction(tableIndex, row, col, action, scope);
            }, 10);
        });
        
        item.addEventListener('touchend', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const action = item.dataset.action;
            hideContextMenu();
            setTimeout(() => {
                executeTableAction(tableIndex, row, col, action, scope);
            }, 10);
        });
    });
    
    ['click', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(eventType => {
        menu.addEventListener(eventType, (ev) => {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
        });
    });
    
    // 延迟绑定，避免当前事件触发
    setTimeout(() => {
        contextMenuCloseHandler = (ev) => {
            if (activeContextMenu && !activeContextMenu.contains(ev.target)) {
                hideContextMenu();
            }
        };
        document.addEventListener('click', contextMenuCloseHandler, true);
        document.addEventListener('touchstart', contextMenuCloseHandler, true);
    }, 50);
    
    e.preventDefault();
    e.stopPropagation();
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    if (contextMenuCloseHandler) {
        document.removeEventListener('click', contextMenuCloseHandler, true);
        document.removeEventListener('touchstart', contextMenuCloseHandler, true);
        contextMenuCloseHandler = null;
    }
    
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

/**
 * 执行表格操作
 */
function executeTableAction(tableIndex, row, col, action, scope = 'local') {
    pushTableSnapshot(scope, tableIndex);
    // 先将DOM中未提交的输入值写入data，防止正在编辑的值丢失
    const container = document.querySelector(`.horae-excel-table-container[data-table-index="${tableIndex}"][data-scope="${scope}"]`);
    if (container) {
        const tbl = getTablesByScope(scope)[tableIndex];
        if (tbl) {
            if (!tbl.data) tbl.data = {};
            container.querySelectorAll('.horae-excel-table input[data-table]').forEach(inp => {
                const r = parseInt(inp.dataset.row);
                const c = parseInt(inp.dataset.col);
                tbl.data[`${r}-${c}`] = inp.value;
            });
        }
    }

    const tables = getTablesByScope(scope);
    const table = tables[tableIndex];
    if (!table) return;

    const oldRows = table.rows || 2;
    const oldCols = table.cols || 2;
    const oldData = table.data || {};
    const newData = {};

    switch (action) {
        case 'add-row-above':
            table.rows = oldRows + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r >= row ? r + 1 : r}-${c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-row-below':
            table.rows = oldRows + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r > row ? r + 1 : r}-${c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-col-left':
            table.cols = oldCols + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r}-${c >= col ? c + 1 : c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-col-right':
            table.cols = oldCols + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r}-${c > col ? c + 1 : c}`] = val;
            }
            table.data = newData;
            break;

        case 'delete-row':
            if (oldRows <= 2) { showToast(t('toast.tableMinRows'), 'warning'); return; }
            table.rows = oldRows - 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                if (r === row) continue;
                newData[`${r > row ? r - 1 : r}-${c}`] = val;
            }
            table.data = newData;
            purgeTableContributions((table.name || '').trim(), scope);
            break;

        case 'delete-col':
            if (oldCols <= 2) { showToast(t('toast.tableMinCols'), 'warning'); return; }
            table.cols = oldCols - 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                if (c === col) continue;
                newData[`${r}-${c > col ? c - 1 : c}`] = val;
            }
            table.data = newData;
            purgeTableContributions((table.name || '').trim(), scope);
            break;

        case 'toggle-lock-row': {
            if (!table.lockedRows) table.lockedRows = [];
            const idx = table.lockedRows.indexOf(row);
            if (idx >= 0) {
                table.lockedRows.splice(idx, 1);
                showToast(t('toast.rowUnlocked', {n: row + 1}), 'info');
            } else {
                table.lockedRows.push(row);
                showToast(t('toast.rowLocked', {n: row + 1}), 'success');
            }
            break;
        }

        case 'toggle-lock-col': {
            if (!table.lockedCols) table.lockedCols = [];
            const idx = table.lockedCols.indexOf(col);
            if (idx >= 0) {
                table.lockedCols.splice(idx, 1);
                showToast(t('toast.colUnlocked', {n: col + 1}), 'info');
            } else {
                table.lockedCols.push(col);
                showToast(t('toast.colLocked', {n: col + 1}), 'success');
            }
            break;
        }

        case 'toggle-lock-cell': {
            if (!table.lockedCells) table.lockedCells = [];
            const cellKey = `${row}-${col}`;
            const idx = table.lockedCells.indexOf(cellKey);
            if (idx >= 0) {
                table.lockedCells.splice(idx, 1);
                showToast(t('toast.cellUnlocked', {row, col}), 'info');
            } else {
                table.lockedCells.push(cellKey);
                showToast(t('toast.cellLocked', {row, col}), 'success');
            }
            break;
        }
    }

    setTablesByScope(scope, tables);
    renderCustomTablesList();
}

/**
 * 添加新的2x2表格
 */
function addNewExcelTable(scope = 'local') {
    const tables = getTablesByScope(scope);

    tables.push({
        id: Date.now().toString(),
        name: '',
        rows: 2,
        cols: 2,
        data: {},
        baseData: {},
        baseRows: 2,
        baseCols: 2,
        prompt: '',
        lockedRows: [],
        lockedCols: [],
        lockedCells: []
    });

    setTablesByScope(scope, tables);
    renderCustomTablesList();
    const toastKey = { global: 'toast.tableAddedGlobal', character: 'toast.tableAddedCharacter', local: 'toast.tableAddedLocal' };
    showToast(t(toastKey[scope] || toastKey.local), 'success');
}

/**
 * 删除表格
 */
function deleteCustomTable(index, scope = 'local') {
    if (!confirm(t('confirm.deleteTable'))) return;
    pushTableSnapshot(scope, index);

    const tables = getTablesByScope(scope);
    const deletedTable = tables[index];
    const deletedName = (deletedTable?.name || '').trim();
    tables.splice(index, 1);
    setTablesByScope(scope, tables);

    // 清除所有消息中引用该表格名的 tableContributions
    const chat = horaeManager.getChat();
    if (deletedName) {
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i]?.horae_meta;
            if (meta?.tableContributions) {
                meta.tableContributions = meta.tableContributions.filter(
                    tc => (tc.name || '').trim() !== deletedName
                );
                if (meta.tableContributions.length === 0) {
                    delete meta.tableContributions;
                }
            }
        }
    }

    // 全局表格：清除 per-card overlay
    if (scope === 'global' && deletedName && chat?.[0]?.horae_meta?.globalTableData) {
        delete chat[0].horae_meta.globalTableData[deletedName];
    }
    // 角色表格：清除 per-chat overlay
    if (scope === 'character' && deletedName && chat?.[0]?.horae_meta?.charTableData) {
        delete chat[0].horae_meta.charTableData[deletedName];
    }

    horaeManager.rebuildTableData();
    getContext().saveChat();
    if ((scope === 'global' || scope === 'character') && typeof saveSettingsDebounced.flush === 'function') {
        saveSettingsDebounced.flush();
    }
    renderCustomTablesList();
    showToast(t('toast.saveSuccess'), 'info');
}

/** 清除指定表格的所有 tableContributions，将当前数据写入 baseData 作为新基准 */
function purgeTableContributions(tableName, scope = 'local') {
    if (!tableName) return;
    const chat = horaeManager.getChat();
    if (!chat?.length) return;

    // 清除所有消息中该表格的全部 tableContributions（AI 贡献 + 旧用户快照一并清除）
    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i]?.horae_meta;
        if (meta?.tableContributions) {
            meta.tableContributions = meta.tableContributions.filter(
                tc => (tc.name || '').trim() !== tableName
            );
            if (meta.tableContributions.length === 0) {
                delete meta.tableContributions;
            }
        }
    }

    // 将当前完整数据（含用户编辑）写入 baseData 作为新基准
    // 这样即使消息被滑动/重新生成，rebuildTableData 也能从正确的基准恢复
    const tables = getTablesByScope(scope);
    const table = tables.find(tbl => (tbl.name || '').trim() === tableName);
    if (table) {
        table.baseData = JSON.parse(JSON.stringify(table.data || {}));
        table.baseRows = table.rows;
        table.baseCols = table.cols;
    }
    if (scope === 'global' && chat[0]?.horae_meta?.globalTableData?.[tableName]) {
        const overlay = chat[0].horae_meta.globalTableData[tableName];
        overlay.baseData = JSON.parse(JSON.stringify(overlay.data || {}));
        overlay.baseRows = overlay.rows;
        overlay.baseCols = overlay.cols;
    }
    if (scope === 'character' && chat[0]?.horae_meta?.charTableData?.[tableName]) {
        const overlay = chat[0].horae_meta.charTableData[tableName];
        overlay.baseData = JSON.parse(JSON.stringify(overlay.data || {}));
        overlay.baseRows = overlay.rows;
        overlay.baseCols = overlay.cols;
    }
}

/** 清空表格数据区（保留第0行和第0列的表头） */
function clearTableData(index, scope = 'local') {
    if (!confirm(t('confirm.clearTableData'))) return;
    pushTableSnapshot(scope, index);

    const tables = getTablesByScope(scope);
    if (!tables[index]) return;
    const table = tables[index];
    const data = table.data || {};
    const tableName = (table.name || '').trim();

    // 删除所有 row>0 且 col>0 的单元格数据
    for (const key of Object.keys(data)) {
        const [r, c] = key.split('-').map(Number);
        if (r > 0 && c > 0) {
            delete data[key];
        }
    }

    table.data = data;

    // 同步更新 baseData（清除数据区，保留表头）
    if (table.baseData) {
        for (const key of Object.keys(table.baseData)) {
            const [r, c] = key.split('-').map(Number);
            if (r > 0 && c > 0) {
                delete table.baseData[key];
            }
        }
    }

    // 清除所有消息中该表格的 tableContributions（防止 rebuildTableData 回放旧数据）
    const chat = horaeManager.getChat();
    if (tableName) {
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i]?.horae_meta;
            if (meta?.tableContributions) {
                meta.tableContributions = meta.tableContributions.filter(
                    tc => (tc.name || '').trim() !== tableName
                );
                if (meta.tableContributions.length === 0) {
                    delete meta.tableContributions;
                }
            }
        }
    }

    // 全局/角色表格：同步清除 overlay 的数据区和 baseData
    const overlayKey = scope === 'global' ? 'globalTableData' : scope === 'character' ? 'charTableData' : null;
    if (overlayKey && tableName && chat?.[0]?.horae_meta?.[overlayKey]?.[tableName]) {
        const overlay = chat[0].horae_meta[overlayKey][tableName];
        for (const key of Object.keys(overlay.data || {})) {
            const [r, c] = key.split('-').map(Number);
            if (r > 0 && c > 0) delete overlay.data[key];
        }
        if (overlay.baseData) {
            for (const key of Object.keys(overlay.baseData)) {
                const [r, c] = key.split('-').map(Number);
                if (r > 0 && c > 0) delete overlay.baseData[key];
            }
        }
    }

    setTablesByScope(scope, tables);
    horaeManager.rebuildTableData();
    getContext().saveChat();
    renderCustomTablesList();
    showToast(t('toast.saveSuccess'), 'info');
}

/** 切换表格的 scope：local → character → global → local */
function toggleTableScope(tableIndex, currentScope) {
    const scopeCycle = ['local', 'character', 'global'];
    const curIdx = scopeCycle.indexOf(currentScope);
    const newScope = scopeCycle[(curIdx + 1) % scopeCycle.length];

    if (newScope === 'character' && getContext()?.characterId == null) {
        showToast(t('toast.noCharacterCard'), 'warning');
        return;
    }

    const labelMap = {
        global: t('ui.scopeGlobalFull'),
        character: t('ui.scopeCharacterFull'),
        local: t('ui.scopeLocalFull'),
    };
    const label = labelMap[newScope];
    if (!confirm(t('confirm.convertTableScope', {scope: label}))) return;
    pushTableSnapshot(currentScope, tableIndex);

    const srcTables = getTablesByScope(currentScope);
    if (!srcTables[tableIndex]) return;
    const table = JSON.parse(JSON.stringify(srcTables[tableIndex]));
    const tableName = (table.name || '').trim();

    if (currentScope === 'global' && tableName) {
        const chat = horaeManager.getChat();
        if (chat?.[0]?.horae_meta?.globalTableData) {
            delete chat[0].horae_meta.globalTableData[tableName];
        }
    }
    if (currentScope === 'character' && tableName) {
        const chat = horaeManager.getChat();
        if (chat?.[0]?.horae_meta?.charTableData) {
            delete chat[0].horae_meta.charTableData[tableName];
        }
    }

    srcTables.splice(tableIndex, 1);
    setTablesByScope(currentScope, srcTables);

    const dstTables = getTablesByScope(newScope);
    dstTables.push(table);
    setTablesByScope(newScope, dstTables);

    renderCustomTablesList();
    getContext().saveChat();
    showToast(t('toast.tableScopeChanged', {scope: label}), 'success');
}


/**
 * 绑定物品列表事件
 */
function bindItemsEvents() {
    const items = document.querySelectorAll('#horae-items-full-list .horae-full-item');
    
    items.forEach(item => {
        const itemName = item.dataset.itemName;
        if (!itemName) return;
        
        // 长按进入多选模式
        item.addEventListener('mousedown', (e) => startLongPress(e, itemName));
        item.addEventListener('touchstart', (e) => startLongPress(e, itemName), { passive: true });
        item.addEventListener('mouseup', cancelLongPress);
        item.addEventListener('mouseleave', cancelLongPress);
        item.addEventListener('touchend', cancelLongPress);
        item.addEventListener('touchcancel', cancelLongPress);
        
        // 多选模式下点击切换选中
        item.addEventListener('click', () => {
            if (appState.itemsMultiSelectMode) {
                toggleItemSelection(itemName);
            }
        });
    });

    document.querySelectorAll('.horae-item-equip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _openEquipItemDialog(btn.dataset.itemName);
        });
    });

    document.querySelectorAll('.horae-item-lock-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.dataset.itemName;
            if (!name) return;
            const state = horaeManager.getLatestState();
            const itemInfo = state.items?.[name];
            if (!itemInfo) return;
            const chat = horaeManager.getChat();
            for (let i = chat.length - 1; i >= 0; i--) {
                const meta = chat[i]?.horae_meta;
                if (!meta?.items) continue;
                const key = Object.keys(meta.items).find(k => k === name || k.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, '').trim() === name);
                if (key) {
                    meta.items[key]._locked = !meta.items[key]._locked;
                    getContext().saveChat();
                    updateItemsDisplay();
                    showToast(meta.items[key]._locked ? t('toast.itemLocked', {name}) : t('toast.itemUnlocked', {name}), meta.items[key]._locked ? 'success' : 'info');
                    return;
                }
            }
            const first = chat[0];
            if (!first.horae_meta) first.horae_meta = createEmptyMeta();
            if (!first.horae_meta.items) first.horae_meta.items = {};
            first.horae_meta.items[name] = { ...itemInfo, _locked: true };
            getContext().saveChat();
            updateItemsDisplay();
            showToast(t('toast.itemLocked', {name}), 'success');
        });
    });
}


export {
    _getTableId,
    _deepCopyOneTable,
    pushTableSnapshot,
    undoSingleTable,
    redoSingleTable,
    _updatePerTableUndoRedoButtons,
    clearTableHistory,
    renderCustomTablesList,
    bindExcelTableEvents,
    showTableContextMenu,
    hideContextMenu,
    executeTableAction,
    addNewExcelTable,
    deleteCustomTable,
    purgeTableContributions,
    clearTableData,
    toggleTableScope,
    bindItemsEvents
};
