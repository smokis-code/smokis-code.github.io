/* ==========================================================================
   tabs.js — open files ("documents"), the tab bar, breadcrumbs, saving.

   A document is either a workspace file (has a path) or an "Untitled-N"
   buffer that gets a path on its first save.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, basename, dirname } = SC.util;
  const events = SC.util.emitter();
  const docs = new Map(); // key -> doc
  let order = [];
  let activeKey = null;
  let untitledCounter = 1;
  let tabsEl;
  let editorsEl;
  let welcomeEl;
  let crumbsEl;
  let dragKey = null;

  const keyForPath = (path) => 'file:' + path;

  function init() {
    tabsEl = document.getElementById('tabs');
    editorsEl = document.getElementById('editors');
    welcomeEl = document.getElementById('welcome');
    crumbsEl = document.getElementById('breadcrumbs');

    SC.fs.on('change', onFsChange);
    SC.settings.on('change', () => docs.forEach((d) => { d.editor.refreshMetrics(); d.editor.render(); }));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => docs.forEach((d) => d.editor.refreshMetrics()));
    }
    tabsEl.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabsEl.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('beforeunload', (e) => {
      saveSession();
      SC.fs.flush();
      // Unsaved changes survive a reload (they are kept in the session), so no prompt is needed.
      void e;
    });
  }

  /* ---------- Documents ---------- */
  function createDoc({ key, path, untitledName, value, langId, savedValue }) {
    const lang = langId || (path ? SC.languages.forPath(path).id : 'plaintext');
    const editor = new SC.Editor({ value, langId: lang });
    const doc = {
      key, path, untitledName, editor,
      langId: lang,
      savedValue: savedValue != null ? savedValue : value,
      get title() { return this.path ? basename(this.path) : this.untitledName; },
      get dirty() { return this.editor.value !== this.savedValue; },
    };
    editor.onChange = () => {
      updateTab(doc);
      events.emit('change', doc);
      if (SC.find.isOpen() && doc.key === activeKey) SC.find.refresh();
      if (SC.settings.get('autoSave') && doc.path) autoSave(doc);
      saveSessionSoon();
    };
    editor.onCursor = () => { if (doc.key === activeKey) events.emit('cursor', doc); };
    editor.hide();
    editorsEl.append(editor.root);
    docs.set(key, doc);
    return doc;
  }

  const autoSaveTimers = new Map();
  function autoSave(doc) {
    clearTimeout(autoSaveTimers.get(doc.key));
    autoSaveTimers.set(doc.key, setTimeout(() => { if (docs.has(doc.key) && doc.dirty) save(doc.key, { silent: true }); }, 900));
  }

  /** Open a workspace file in a tab (or switch to it). */
  function open(path, { focus = true, line, col } = {}) {
    path = SC.util.normPath(path);
    const node = SC.fs.get(path);
    if (!node) { SC.notify('The file "' + path + '" does not exist.', 'error'); return null; }
    if (node.type !== 'file') { SC.notify('"' + path + '" is a folder.', 'info'); return null; }
    const key = keyForPath(path);
    let doc = docs.get(key);
    if (!doc) {
      doc = createDoc({ key, path, value: node.content });
      const idx = activeKey ? order.indexOf(activeKey) + 1 : order.length;
      order.splice(idx, 0, key);
    }
    activate(key, { focus });
    if (line) doc.editor.goToLine(line, col || 1);
    rememberRecent(path);
    return doc;
  }

  function newUntitled(content = '', langId = 'plaintext') {
    const name = 'Untitled-' + untitledCounter++;
    const key = 'untitled:' + name;
    createDoc({ key, path: null, untitledName: name, value: content, langId, savedValue: '' });
    const idx = activeKey ? order.indexOf(activeKey) + 1 : order.length;
    order.splice(idx, 0, key);
    activate(key);
    return docs.get(key);
  }

  function activate(key, { focus = true } = {}) {
    const doc = docs.get(key);
    if (!doc) return;
    const prev = docs.get(activeKey);
    if (prev && prev !== doc) prev.editor.hide();
    activeKey = key;
    doc.editor.show();
    welcomeEl.hidden = true;
    renderTabs();
    renderCrumbs();
    if (focus) doc.editor.focus();
    if (SC.find.isOpen()) SC.find.refresh();
    events.emit('active', doc);
    saveSessionSoon();
  }

  async function close(key = activeKey, { force = false } = {}) {
    const doc = docs.get(key);
    if (!doc) return true;
    if (doc.dirty && !force) {
      activate(key);
      const choice = await SC.dialog.confirm({
        title: 'Do you want to save the changes you made to ' + doc.title + '?',
        message: 'Your changes will be lost if you don\'t save them.',
        buttons: [
          { label: 'Save', value: 'save', primary: true },
          { label: 'Don\'t Save', value: 'discard' },
          { label: 'Cancel', value: 'cancel' },
        ],
      });
      if (choice === 'cancel') return false;
      if (choice === 'save') {
        const ok = await save(key);
        if (!ok) return false;
      }
    }
    const idx = order.indexOf(key);
    order.splice(idx, 1);
    docs.delete(key);
    doc.editor.destroy();
    if (activeKey === key) {
      activeKey = null;
      const next = order[Math.min(idx, order.length - 1)];
      if (next) activate(next);
      else showWelcome();
    }
    renderTabs();
    events.emit('close', doc);
    saveSessionSoon();
    return true;
  }

  async function closeAll({ except } = {}) {
    for (const key of [...order]) {
      if (key === except) continue;
      const ok = await close(key);
      if (!ok) return false;
    }
    return true;
  }

  function showWelcome() {
    welcomeEl.hidden = false;
    renderCrumbs();
    if (SC.welcome) SC.welcome.render();
    events.emit('active', null);
  }

  /* ---------- Saving ---------- */
  async function save(key = activeKey, { silent = false } = {}) {
    const doc = docs.get(key);
    if (!doc) return false;
    if (!doc.path) return saveAs(key);
    if (SC.settings.get('trimTrailingWhitespaceOnSave') && key === activeKey) doc.editor.trimTrailingWhitespace();
    try {
      SC.fs.writeFile(doc.path, doc.editor.value);
      doc.savedValue = doc.editor.value;
      updateTab(doc);
      events.emit('save', doc);
      if (!silent) SC.statusbar.message('Saved ' + doc.path, 2000);
      return true;
    } catch (err) {
      SC.notify('Could not save "' + doc.title + '": ' + err.message, 'error');
      return false;
    }
  }

  async function saveAs(key = activeKey) {
    const doc = docs.get(key);
    if (!doc) return false;
    const suggested = doc.path || SC.fs.uniquePath(SC.explorer ? SC.explorer.targetFolder() : '', doc.untitledName.toLowerCase() + extFor(doc.langId));
    const path = await SC.palette.prompt({
      placeholder: 'File path, e.g. src/app.js',
      value: suggested,
      selectValue: [suggested.lastIndexOf('/') + 1, suggested.lastIndexOf('.') > suggested.lastIndexOf('/') ? suggested.lastIndexOf('.') : suggested.length],
      prompt: 'Save as: type a path inside the workspace and press Enter',
      validate: (v) => SC.fs.validatePath(v),
    });
    if (!path) return false;
    const clean = SC.util.normPath(path);
    if (SC.fs.exists(clean)) {
      if (SC.fs.isFolder(clean)) { SC.notify('"' + clean + '" is a folder.', 'error'); return false; }
      const choice = await SC.dialog.confirm({
        title: '"' + basename(clean) + '" already exists. Do you want to replace it?',
        message: 'A file with the same name already exists in the folder. Replacing it will overwrite its current contents.',
        buttons: [{ label: 'Replace', value: 'replace', primary: true }, { label: 'Cancel', value: 'cancel' }],
      });
      if (choice !== 'replace') return false;
      const other = docs.get(keyForPath(clean));
      if (other && other !== doc) await close(other.key, { force: true });
    }
    SC.fs.createFile(clean, doc.editor.value, { overwrite: true });
    // Re-key the document to its new path
    const newKey = keyForPath(clean);
    docs.delete(doc.key);
    order[order.indexOf(doc.key)] = newKey;
    if (activeKey === doc.key) activeKey = newKey;
    doc.key = newKey;
    doc.path = clean;
    doc.savedValue = doc.editor.value;
    docs.set(newKey, doc);
    if (doc.langId === 'plaintext') setLanguage(SC.languages.forPath(clean).id, doc);
    renderTabs();
    renderCrumbs();
    rememberRecent(clean);
    events.emit('save', doc);
    events.emit('active', docs.get(activeKey));
    SC.statusbar.message('Saved ' + clean, 2000);
    return true;
  }

  async function saveAll() {
    let n = 0;
    for (const key of [...order]) {
      const doc = docs.get(key);
      if (doc && doc.dirty) { if (await save(key, { silent: true })) n++; }
    }
    SC.statusbar.message(n ? 'Saved ' + n + ' file' + (n === 1 ? '' : 's') : 'Nothing to save', 2000);
  }

  function extFor(langId) {
    const lang = SC.languages.byId[langId];
    return lang && lang.exts && lang.exts[0] ? '.' + lang.exts[0] : '.txt';
  }

  function setLanguage(langId, doc = docs.get(activeKey)) {
    if (!doc) return;
    doc.langId = langId;
    doc.editor.setLanguage(langId);
    events.emit('language', doc);
    saveSessionSoon();
  }

  /* ---------- Reacting to file system changes ---------- */
  function onFsChange(evt) {
    if (evt.type === 'rename') {
      for (const doc of [...docs.values()]) {
        if (!doc.path || !SC.util.isInside(doc.path, evt.from)) continue;
        const newPath = evt.to + doc.path.slice(evt.from.length);
        const newKey = keyForPath(newPath);
        docs.delete(doc.key);
        order[order.indexOf(doc.key)] = newKey;
        if (activeKey === doc.key) activeKey = newKey;
        doc.key = newKey;
        doc.path = newPath;
        docs.set(newKey, doc);
        const lang = SC.languages.forPath(newPath).id;
        if (lang !== doc.langId) setLanguage(lang, doc);
      }
      renderTabs();
      renderCrumbs();
      renameRecent(evt.from, evt.to);
      events.emit('active', docs.get(activeKey) || null);
    } else if (evt.type === 'delete' || evt.type === 'reset') {
      for (const doc of [...docs.values()]) {
        if (doc.path && (evt.type === 'reset' || SC.util.isInside(doc.path, evt.path))) close(doc.key, { force: true });
      }
    } else if (evt.type === 'write') {
      // File changed by something else (import, replace): reload clean editors
      const doc = docs.get(keyForPath(evt.path));
      if (doc && !doc.dirty) {
        const content = SC.fs.readFile(evt.path);
        if (content !== doc.editor.value) {
          doc.editor.setValue(content);
          doc.savedValue = content;
          updateTab(doc);
        }
      }
    }
  }

  /* ---------- Tab bar ---------- */
  function renderTabs() {
    tabsEl.textContent = '';
    // When two tabs share a file name, show their folder to tell them apart
    const nameCount = {};
    for (const key of order) { const t = docs.get(key).title; nameCount[t] = (nameCount[t] || 0) + 1; }

    for (const key of order) {
      const doc = docs.get(key);
      const closeBtn = el('button', { class: 'tab-close', type: 'button', title: 'Close (Alt+W)', 'aria-label': 'Close ' + doc.title, 'data-icon': 'close' });
      const label = el('span', { class: 'tab-label', text: doc.title });
      const tab = el('div', {
        class: 'tab' + (key === activeKey ? ' active' : '') + (doc.dirty ? ' dirty' : ''),
        role: 'tab', 'aria-selected': String(key === activeKey), draggable: 'true',
        title: doc.path || doc.untitledName, dataset: { key },
      }, SC.icons.fileIcon(doc.title), label, closeBtn);
      if (nameCount[doc.title] > 1 && doc.path && dirname(doc.path)) {
        label.append(el('span', { class: 'qi-desc', text: ' ' + basename(dirname(doc.path)), style: { marginLeft: '4px' } }));
      }
      tab.addEventListener('mousedown', (e) => {
        if (e.button === 1) { e.preventDefault(); close(key); }
      });
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) { close(key); return; }
        activate(key);
      });
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        SC.menu.show([
          { label: 'Close', keybinding: SC.commands.keyFor('editor.close'), run: () => close(key) },
          { label: 'Close Others', run: () => closeAll({ except: key }) },
          { label: 'Close All', run: () => closeAll() },
          '-',
          { label: 'Copy Path', disabled: !doc.path, run: () => copyText(doc.path) },
          { label: 'Reveal in Explorer', disabled: !doc.path, run: () => SC.explorer.reveal(doc.path) },
          { label: 'Download', run: () => SC.util.download(doc.title, doc.editor.value) },
        ], { x: e.clientX, y: e.clientY });
      });
      tab.addEventListener('dragstart', (e) => {
        dragKey = key;
        tab.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', doc.path || doc.title);
      });
      tab.addEventListener('dragend', () => { dragKey = null; tab.classList.remove('dragging'); });
      tab.addEventListener('dragover', (e) => {
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        tab.classList.add('drop-target');
      });
      tab.addEventListener('dragleave', () => tab.classList.remove('drop-target'));
      tab.addEventListener('drop', (e) => {
        tab.classList.remove('drop-target');
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        order.splice(order.indexOf(dragKey), 1);
        order.splice(order.indexOf(key), 0, dragKey);
        renderTabs();
        saveSessionSoon();
      });
      tabsEl.append(tab);
    }
    SC.icons.hydrate(tabsEl);
    const activeTab = tabsEl.querySelector('.tab.active');
    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    events.emit('tabs', null);
  }

  function updateTab(doc) {
    const tab = tabsEl.querySelector('.tab[data-key="' + CSS.escape(doc.key) + '"]');
    if (tab) tab.classList.toggle('dirty', doc.dirty);
    events.emit('dirty', doc);
  }

  function renderCrumbs() {
    crumbsEl.textContent = '';
    const doc = docs.get(activeKey);
    if (!doc) return;
    const parts = doc.path ? doc.path.split('/') : [doc.untitledName];
    parts.forEach((part, i) => {
      if (i > 0) crumbsEl.append(el('span', { class: 'crumb-sep', 'data-icon': 'chevron', style: { display: 'flex', width: '14px' } }));
      const isFile = i === parts.length - 1;
      const crumb = el('button', { class: 'crumb', type: 'button', text: part });
      if (isFile) crumb.prepend(SC.icons.fileIcon(part));
      crumb.style.display = 'inline-flex';
      crumb.style.gap = '4px';
      crumb.style.alignItems = 'center';
      crumb.addEventListener('click', () => {
        if (!doc.path) return;
        if (isFile) SC.explorer.reveal(doc.path);
        else SC.explorer.reveal(parts.slice(0, i + 1).join('/'), { expand: true });
      });
      crumbsEl.append(crumb);
    });
    SC.icons.hydrate(crumbsEl);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => SC.statusbar.message('Copied ' + text, 1800), () => SC.notify('Could not copy to the clipboard: ' + text, 'warn'));
    } else {
      SC.notify(text, 'info');
    }
  }

  /* ---------- Recent files ---------- */
  function rememberRecent(path) {
    const list = SC.storage.get('recentFiles', []).filter((p) => p !== path);
    list.unshift(path);
    SC.storage.set('recentFiles', list.slice(0, 12));
  }
  function renameRecent(from, to) {
    const list = SC.storage.get('recentFiles', []).map((p) => (SC.util.isInside(p, from) ? to + p.slice(from.length) : p));
    SC.storage.set('recentFiles', list);
  }

  /* ---------- Session (open tabs survive a reload) ---------- */
  function saveSession() {
    const open = order.map((key) => {
      const d = docs.get(key);
      const entry = { key, path: d.path, untitledName: d.untitledName, langId: d.langId, view: d.editor.viewState() };
      if (d.dirty || !d.path) { entry.value = d.editor.value; entry.savedValue = d.savedValue; }
      return entry;
    });
    SC.storage.set('session', { open, active: activeKey, untitledCounter });
  }
  const saveSessionSoon = SC.util.debounce(saveSession, 400);

  function restoreSession() {
    const s = SC.storage.get('session', null);
    if (!s || !Array.isArray(s.open)) return false;
    untitledCounter = s.untitledCounter || 1;
    for (const entry of s.open) {
      try {
        if (entry.path) {
          if (!SC.fs.isFile(entry.path)) continue;
          const content = SC.fs.readFile(entry.path);
          const value = entry.value != null ? entry.value : content;
          const doc = createDoc({ key: keyForPath(entry.path), path: entry.path, value, langId: entry.langId, savedValue: content });
          doc.editor.restoreViewState(entry.view);
          order.push(doc.key);
        } else if (entry.untitledName) {
          const key = 'untitled:' + entry.untitledName;
          const doc = createDoc({ key, path: null, untitledName: entry.untitledName, value: entry.value || '', langId: entry.langId, savedValue: entry.savedValue || '' });
          doc.editor.restoreViewState(entry.view);
          order.push(key);
        }
      } catch (err) { console.warn('Could not restore tab', entry, err); }
    }
    const active = docs.has(s.active) ? s.active : order[0];
    if (active) { activate(active, { focus: false }); return true; }
    return false;
  }

  function cycle(dir) {
    if (!order.length) return;
    const idx = order.indexOf(activeKey);
    activate(order[(idx + dir + order.length) % order.length]);
  }

  SC.tabs = {
    init, open, newUntitled, activate, close, closeAll, save, saveAs, saveAll, setLanguage, cycle,
    restoreSession, saveSession, showWelcome, copyText,
    activeDoc: () => docs.get(activeKey) || null,
    activeEditor: () => { const d = docs.get(activeKey); return d ? d.editor : null; },
    docs: () => order.map((k) => docs.get(k)),
    isOpen: (path) => docs.has(keyForPath(path)),
    isDirty: (path) => { const d = docs.get(keyForPath(path)); return !!(d && d.dirty); },
    on: events.on,
  };
})(window.SC);
