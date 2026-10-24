/* ==========================================================================
   explorer.js — the file explorer in the sidebar.
   Shows open editors and the workspace tree. Create, rename, delete,
   duplicate, drag to move, and drop files from your computer to import.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, basename, dirname, joinPath } = SC.util;
  let view;
  let treeEl;
  let openEditorsEl;
  let expanded = new Set(SC.storage.get('expanded', []));
  let collapsedSections = new Set(SC.storage.get('collapsedSections', []));
  let selected = null;
  let editing = null; // { mode: 'newFile'|'newFolder'|'rename', parent, path }
  let dragPath = null;
  const ROW_INDENT = 12;

  function init() {
    view = document.getElementById('view-explorer');
    view.append(el('div', { class: 'view-header' },
      el('span', { text: 'Explorer' }),
      el('div', { class: 'actions' },
        iconBtn('more', 'More actions', (e) => showEmptyMenu(e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom + 2)))));

    // Open editors section
    openEditorsEl = el('div', { class: 'open-editors' });
    view.append(section('open-editors', 'Open Editors', [
      iconBtn('check', 'Save All (Ctrl+Alt+S)', () => SC.commands.run('file.saveAll')),
      iconBtn('close', 'Close All Editors', () => SC.commands.run('editor.closeAll')),
    ], openEditorsEl));

    // Workspace tree
    treeEl = el('div', { class: 'tree', tabindex: '0', role: 'tree', 'aria-label': 'Workspace files' });
    const wsSection = section('workspace', 'Workspace', [
      iconBtn('new-file', 'New File...', () => SC.commands.run('file.newFile')),
      iconBtn('new-folder', 'New Folder...', () => SC.commands.run('file.newFolder')),
      iconBtn('upload', 'Open File... (import from your computer)', () => SC.commands.run('file.openFile')),
      iconBtn('collapse', 'Collapse Folders in Explorer', collapseAll),
    ], treeEl);
    wsSection.style.flex = '1';
    wsSection.style.minHeight = '0';
    view.append(wsSection);
    SC.icons.hydrate(view);

    bindTree();
    SC.fs.on('change', (evt) => {
      if (evt.type === 'rename') {
        // Keep folders open after they are renamed or moved
        const moved = [...expanded].filter((p) => SC.util.isInside(p, evt.from));
        moved.forEach((p) => { expanded.delete(p); expanded.add(evt.to + p.slice(evt.from.length)); });
        if (selected && SC.util.isInside(selected, evt.from)) selected = evt.to + selected.slice(evt.from.length);
        saveExpanded();
      }
      if (evt.type === 'delete' && selected && SC.util.isInside(selected, evt.path)) selected = null;
      render();
    });
    SC.tabs.on('active', () => { syncActive(); renderOpenEditors(); });
    SC.tabs.on('tabs', renderOpenEditors);
    SC.tabs.on('dirty', () => { renderOpenEditors(); markDirty(); });
    SC.tabs.on('save', () => { renderOpenEditors(); markDirty(); });
    render();
    renderOpenEditors();
  }

  function iconBtn(icon, title, onClick) {
    return el('button', {
      class: 'icon-btn', type: 'button', title, 'aria-label': title, 'data-icon': icon,
      onClick: (e) => { e.stopPropagation(); onClick(e); },
    });
  }

  function section(id, title, actions, body) {
    const isCollapsed = collapsedSections.has(id);
    const chev = el('span', { class: 'chev', 'data-icon': 'chevron', style: { display: 'flex', transform: isCollapsed ? '' : 'rotate(90deg)' } });
    const header = el('div', { class: 'explorer-section-header', role: 'button', tabindex: '0', 'aria-expanded': String(!isCollapsed) },
      chev, el('span', { class: 'title', text: title }), el('div', { class: 'actions' }, actions));
    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0' } }, header, body);
    body.hidden = isCollapsed;
    const toggle = () => {
      body.hidden = !body.hidden;
      chev.style.transform = body.hidden ? '' : 'rotate(90deg)';
      header.setAttribute('aria-expanded', String(!body.hidden));
      if (body.hidden) collapsedSections.add(id); else collapsedSections.delete(id);
      SC.storage.set('collapsedSections', [...collapsedSections]);
      wrap.style.flex = id === 'workspace' && !body.hidden ? '1' : '';
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    return wrap;
  }

  function saveExpanded() { SC.storage.set('expanded', [...expanded]); }

  /* ---------- Rendering ---------- */
  function render() {
    const scroll = treeEl.scrollTop;
    treeEl.textContent = '';
    const files = SC.fs.list('');
    if (!files.length && !editing) {
      treeEl.append(el('div', { class: 'explorer-empty' },
        el('div', { text: 'Your workspace is empty. Create a file or bring in files from your computer.' }),
        el('button', { class: 'btn primary', type: 'button', text: 'New File', onClick: () => SC.commands.run('file.newFile') }),
        el('button', { class: 'btn', type: 'button', text: 'Open File...', onClick: () => SC.commands.run('file.openFile') }),
        el('button', { class: 'btn', type: 'button', text: 'Open Folder...', onClick: () => SC.commands.run('file.openFolder') })));
      return;
    }
    renderChildren('', 0, treeEl);
    treeEl.scrollTop = scroll;
    SC.icons.hydrate(treeEl);
    syncActive();
  }

  function renderChildren(dir, depth, container) {
    if (editing && (editing.mode === 'newFile' || editing.mode === 'newFolder') && editing.parent === dir) {
      container.append(inputRow(depth, editing.mode === 'newFolder', ''));
    }
    for (const node of SC.fs.list(dir)) {
      const path = dir ? dir + '/' + node.name : node.name;
      if (editing && editing.mode === 'rename' && editing.path === path) {
        container.append(inputRow(depth, node.type === 'folder', node.name));
      } else {
        container.append(row(node, path, depth));
      }
      if (node.type === 'folder' && expanded.has(path)) renderChildren(path, depth + 1, container);
    }
  }

  function guides(depth) {
    const out = [];
    for (let i = 0; i < depth; i++) out.push(el('span', { class: 'tree-guide', style: { left: (8 + i * ROW_INDENT + 7) + 'px' } }));
    return out;
  }

  function row(node, path, depth) {
    const isFolder = node.type === 'folder';
    const isOpen = isFolder && expanded.has(path);
    const r = el('div', {
      class: 'tree-row' + (isOpen ? ' expanded' : '') + (path === selected ? ' selected' : '') + (!isFolder && SC.tabs.isDirty(path) ? ' dirty' : ''),
      role: 'treeitem', draggable: 'true', title: path,
      'aria-expanded': isFolder ? String(isOpen) : null,
      dataset: { path, type: node.type },
      style: { paddingLeft: (8 + depth * ROW_INDENT) + 'px' },
    },
    guides(depth),
    el('span', { class: 'chev' }, isFolder ? el('span', { 'data-icon': 'chevron', style: { display: 'flex' } }) : null),
    isFolder ? SC.icons.folderIcon(isOpen) : SC.icons.fileIcon(node.name),
    el('span', { class: 'tree-name', text: node.name }));
    return r;
  }

  function inputRow(depth, isFolder, value) {
    const input = el('input', { class: 'tree-input', id: 'explorer-name-input', value, spellcheck: 'false', 'aria-label': isFolder ? 'Folder name' : 'File name' });
    const r = el('div', { class: 'tree-row', style: { paddingLeft: (8 + depth * ROW_INDENT) + 'px' } },
      guides(depth),
      el('span', { class: 'chev' }),
      isFolder ? SC.icons.folderIcon(false) : SC.icons.fileIcon(value || 'x'),
      input);
    const errorBox = el('div', { class: 'tree-error', hidden: true, role: 'alert' });
    const wrap = el('div', {}, r, errorBox);
    let finished = false;

    const validate = () => {
      if (!editing) return 'cancelled';
      const v = input.value;
      let err = null;
      if (editing.mode === 'rename') {
        err = SC.fs.validateName(v);
        const target = joinPath(dirname(editing.path), v);
        if (!err && target.toLowerCase() !== editing.path.toLowerCase() && SC.fs.exists(target)) err = 'A file or folder "' + v + '" already exists at this location. Please choose a different name.';
      } else {
        err = SC.fs.validatePath(v);
        if (!err && SC.fs.exists(joinPath(editing.parent, v))) err = 'A file or folder "' + v + '" already exists at this location. Please choose a different name.';
      }
      errorBox.hidden = !err || !v;
      errorBox.textContent = err || '';
      return err;
    };

    const commit = () => {
      if (finished || !editing) return;
      const err = validate();
      const v = input.value.trim();
      const mode = editing.mode;
      if (err || !v) { cancel(); return; }
      finished = true;
      const ctx = editing;
      editing = null;
      try {
        if (mode === 'rename') {
          const to = joinPath(dirname(ctx.path), v);
          if (to !== ctx.path) SC.fs.rename(ctx.path, to);
          selected = to;
          render();
        } else if (mode === 'newFolder') {
          const p = SC.fs.createFolder(joinPath(ctx.parent, v));
          expandTo(p);
          expanded.add(p);
          selected = p;
          saveExpanded();
          render();
        } else {
          const p = SC.fs.createFile(joinPath(ctx.parent, v), '');
          expandTo(p);
          selected = p;
          render();
          SC.tabs.open(p);
        }
      } catch (e) {
        SC.notify(e.message, 'error');
        render();
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      editing = null;
      render();
      treeEl.focus();
    };

    input.addEventListener('input', () => {
      validate();
      const icon = r.querySelector('.file-icon:not(.folder-icon)');
      if (icon) icon.replaceWith(SC.icons.fileIcon(input.value || 'x'));
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (!validate()) commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => setTimeout(commit, 0));
    requestAnimationFrame(() => {
      input.focus();
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, isFolder || dot <= 0 ? value.length : dot);
      r.scrollIntoView({ block: 'nearest' });
    });
    return wrap;
  }

  function syncActive() {
    const doc = SC.tabs.activeDoc();
    treeEl.querySelectorAll('.tree-row.active-file').forEach((r) => r.classList.remove('active-file'));
    if (doc && doc.path) {
      const r = treeEl.querySelector('.tree-row[data-path="' + CSS.escape(doc.path) + '"]');
      if (r) r.classList.add('active-file');
    }
  }

  function markDirty() {
    treeEl.querySelectorAll('.tree-row[data-type="file"]').forEach((r) => r.classList.toggle('dirty', SC.tabs.isDirty(r.dataset.path)));
  }

  function renderOpenEditors() {
    if (!openEditorsEl) return;
    openEditorsEl.textContent = '';
    const docs = SC.tabs.docs();
    const active = SC.tabs.activeDoc();
    if (!docs.length) {
      openEditorsEl.append(el('div', { class: 'tree-row', style: { color: 'var(--c-fg-muted)', cursor: 'default', paddingLeft: '28px' }, text: 'No open editors' }));
      return;
    }
    for (const doc of docs) {
      const closeBtn = el('button', { class: 'row-close icon-btn', type: 'button', title: 'Close', 'data-icon': 'close', style: { width: '20px', height: '20px' } });
      const r = el('div', { class: 'tree-row' + (doc === active ? ' selected' : '') + (doc.dirty ? ' dirty' : ''), title: doc.path || doc.title },
        SC.icons.fileIcon(doc.title),
        el('span', { class: 'tree-name', text: doc.title }),
        doc.path && dirname(doc.path) ? el('span', { class: 'tree-path', text: dirname(doc.path) }) : null,
        closeBtn);
      r.addEventListener('click', (e) => {
        if (e.target.closest('.row-close')) { SC.tabs.close(doc.key); return; }
        SC.tabs.activate(doc.key);
      });
      openEditorsEl.append(r);
    }
    SC.icons.hydrate(openEditorsEl);
  }

  /* ---------- Tree interaction ---------- */
  function bindTree() {
    treeEl.addEventListener('click', (e) => {
      const r = e.target.closest('.tree-row[data-path]');
      if (!r) { select(null); return; }
      const path = r.dataset.path;
      select(path);
      if (r.dataset.type === 'folder') toggleFolder(path);
      else SC.tabs.open(path, { focus: e.detail > 1 });
    });
    treeEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = e.target.closest('.tree-row[data-path]');
      if (!r) { select(null); showEmptyMenu(e.clientX, e.clientY); return; }
      select(r.dataset.path);
      showItemMenu(r.dataset.path, r.dataset.type, e.clientX, e.clientY);
    });
    treeEl.addEventListener('keydown', onTreeKey);

    // Drag to move, drop files from the computer to import
    treeEl.addEventListener('dragstart', (e) => {
      const r = e.target.closest('.tree-row[data-path]');
      if (!r) return;
      dragPath = r.dataset.path;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragPath);
    });
    treeEl.addEventListener('dragend', () => { dragPath = null; clearDrop(); });
    treeEl.addEventListener('dragover', (e) => {
      const external = !dragPath && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      if (!dragPath && !external) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = external ? 'copy' : 'move';
      clearDrop();
      const target = dropTarget(e);
      if (target) {
        const r = treeEl.querySelector('.tree-row[data-path="' + CSS.escape(target) + '"]');
        if (r) r.classList.add('drop-target');
      } else {
        treeEl.classList.add('drop-root');
      }
    });
    treeEl.addEventListener('dragleave', (e) => { if (!treeEl.contains(e.relatedTarget)) clearDrop(); });
    treeEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      clearDrop();
      const target = dropTarget(e);
      if (dragPath) {
        const from = dragPath;
        dragPath = null;
        const to = joinPath(target, basename(from));
        if (to === from) return;
        try {
          SC.fs.rename(from, to);
          expandTo(to);
          if (target) expanded.add(target);
          saveExpanded();
          selected = to;
          render();
        } catch (err) { SC.notify(err.message, 'error'); }
      } else if (e.dataTransfer) {
        await SC.fileio.importDataTransfer(e.dataTransfer, target);
        if (target) { expanded.add(target); saveExpanded(); render(); }
      }
    });
  }

  function dropTarget(e) {
    const r = e.target.closest && e.target.closest('.tree-row[data-path]');
    if (!r) return '';
    return r.dataset.type === 'folder' ? r.dataset.path : dirname(r.dataset.path);
  }

  function clearDrop() {
    treeEl.classList.remove('drop-root');
    treeEl.querySelectorAll('.drop-target').forEach((r) => r.classList.remove('drop-target'));
  }

  function onTreeKey(e) {
    const rows = Array.from(treeEl.querySelectorAll('.tree-row[data-path]'));
    const idx = rows.findIndex((r) => r.dataset.path === selected);
    const cur = rows[idx];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1)];
      if (next) select(next.dataset.path, true);
    } else if (e.key === 'ArrowRight' && cur && cur.dataset.type === 'folder') {
      e.preventDefault();
      if (!expanded.has(selected)) toggleFolder(selected);
      else if (rows[idx + 1]) select(rows[idx + 1].dataset.path, true);
    } else if (e.key === 'ArrowLeft' && cur) {
      e.preventDefault();
      if (cur.dataset.type === 'folder' && expanded.has(selected)) toggleFolder(selected);
      else if (dirname(selected)) select(dirname(selected), true);
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      if (cur.dataset.type === 'folder') toggleFolder(selected);
      else SC.tabs.open(selected);
    }
  }

  function select(path, scroll = false) {
    selected = path;
    treeEl.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'));
    if (!path) return;
    const r = treeEl.querySelector('.tree-row[data-path="' + CSS.escape(path) + '"]');
    if (r) {
      r.classList.add('selected');
      if (scroll) r.scrollIntoView({ block: 'nearest' });
    }
  }

  function toggleFolder(path) {
    if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
    saveExpanded();
    render();
  }

  function expandTo(path) {
    let dir = dirname(path);
    while (dir) {
      expanded.add(dir);
      dir = dirname(dir);
    }
    saveExpanded();
  }

  function collapseAll() {
    expanded.clear();
    saveExpanded();
    render();
  }

  /* ---------- Menus ---------- */
  function showItemMenu(path, type, x, y) {
    const isFolder = type === 'folder';
    const items = [];
    if (!isFolder) items.push({ label: 'Open', run: () => SC.tabs.open(path) }, '-');
    items.push(
      { label: 'New File...', run: () => startCreate('newFile', isFolder ? path : dirname(path)) },
      { label: 'New Folder...', run: () => startCreate('newFolder', isFolder ? path : dirname(path)) },
      '-',
      { label: 'Rename...', keybinding: 'F2', run: () => startRename(path) },
      { label: 'Delete', keybinding: 'Delete', run: () => remove(path) },
      { label: 'Duplicate', run: () => duplicate(path) },
      '-',
      { label: 'Copy Path', run: () => SC.tabs.copyText(path) },
      isFolder
        ? { label: 'Download Folder as ZIP', run: () => SC.fileio.exportZip(path) }
        : { label: 'Download', run: () => SC.fileio.downloadFile(path) });
    if (isFolder) items.push('-', { label: 'Collapse Folders in Explorer', run: collapseAll });
    SC.menu.show(items, { x, y });
  }

  function showEmptyMenu(x, y) {
    SC.menu.show([
      { command: 'file.newFile' },
      { command: 'file.newFolder' },
      '-',
      { command: 'file.openFile' },
      { command: 'file.openFolder' },
      '-',
      { command: 'workspace.exportZip' },
      { label: 'Collapse Folders in Explorer', run: collapseAll },
      '-',
      { command: 'workspace.reset' },
    ], { x, y });
  }

  /* ---------- Actions ---------- */
  function showView() {
    if (SC.app) SC.app.showView('explorer');
    const body = treeEl;
    if (body.hidden) {
      collapsedSections.delete('workspace');
      body.hidden = false;
    }
  }

  function startCreate(mode, parent = targetFolder()) {
    showView();
    if (parent) { expanded.add(parent); expandTo(parent + '/x'); saveExpanded(); }
    editing = { mode, parent };
    render();
  }

  function startRename(path = selected) {
    if (!path) { SC.notify('Select a file or folder in the explorer first.', 'info'); return; }
    showView();
    expandTo(path);
    editing = { mode: 'rename', path };
    render();
  }

  async function remove(path = selected) {
    if (!path) return;
    const node = SC.fs.get(path);
    if (!node) return;
    if (SC.settings.get('confirmDelete')) {
      const count = node.type === 'folder' ? SC.fs.allFiles(path).length : 0;
      const choice = await SC.dialog.confirm({
        title: 'Are you sure you want to delete \'' + basename(path) + '\'' + (node.type === 'folder' ? ' and its contents?' : '?'),
        message: (count ? 'The folder holds ' + count + ' file' + (count === 1 ? '' : 's') + '. ' : '') + 'This can\'t be undone.',
        buttons: [{ label: 'Delete', value: 'delete', primary: true, danger: false }, { label: 'Cancel', value: 'cancel' }],
      });
      if (choice !== 'delete') { treeEl.focus(); return; }
    }
    SC.fs.remove(path);
    SC.statusbar.message('Deleted ' + path, 2000);
    treeEl.focus();
  }

  function duplicate(path) {
    const target = SC.fs.uniquePath(dirname(path), basename(path).replace(/(\.[^.]*)?$/, ' copy$1'));
    try {
      SC.fs.copy(path, target);
      selected = target;
      render();
    } catch (err) { SC.notify(err.message, 'error'); }
  }

  /** The folder new files go into: the selected folder, or the selected file's folder. */
  function targetFolder() {
    if (!selected || !SC.fs.exists(selected)) return '';
    return SC.fs.isFolder(selected) ? selected : dirname(selected);
  }

  function reveal(path, { expand = false } = {}) {
    showView();
    expandTo(path);
    if (expand && SC.fs.isFolder(path)) expanded.add(path);
    saveExpanded();
    selected = path;
    render();
    select(path, true);
  }

  SC.explorer = {
    init, render, startCreate, startRename, remove, reveal, targetFolder, collapseAll,
    selected: () => selected, focus: () => treeEl.focus(),
  };
})(window.SC);
