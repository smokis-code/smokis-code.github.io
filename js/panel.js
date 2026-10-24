/* ==========================================================================
   panel.js — bottom panel with OUTPUT (what a running program prints) and
   PREVIEW (renders HTML and Markdown files). Running code lives in
   runner.js; this file only shows the results. Extensions add their own
   tabs with SC.panel.addTab() (for example Terminal and App).
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, escapeHtml } = SC.util;
  let panel;
  let sash;
  let outputEl;
  let previewFrame;
  let activeTab = 'output';
  const tabButtons = {};
  const panes = {};     // tab id -> { el, onShow, onClear }
  let tabStrip;
  let bodyEl;
  let openLine = null; // the last output line, while it has no newline yet
  let runBtn;
  let stopBtn;

  function init() {
    panel = document.getElementById('panel');
    sash = document.getElementById('panel-sash');
    outputEl = el('pre', { class: 'panel-output', id: 'panel-output', 'aria-live': 'polite' });
    previewFrame = el('iframe', { class: 'panel-preview', title: 'HTML preview', sandbox: 'allow-scripts allow-modals allow-forms', hidden: true });
    const header = el('div', { class: 'panel-header' });
    tabStrip = el('div', { class: 'panel-tabs', role: 'tablist' });
    bodyEl = el('div', { class: 'panel-body' });
    header.append(tabStrip);
    addTab('output', 'Output', outputEl, { onClear: clear });
    addTab('preview', 'Preview', previewFrame);
    runBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Run Active File (F5)', 'data-icon': 'play', onClick: () => SC.commands.run('run.file') });
    stopBtn = el('button', { class: 'icon-btn stop-btn', type: 'button', title: 'Stop (Shift+F5)', 'data-icon': 'stop', hidden: true, onClick: () => SC.commands.run('run.stop') });
    header.append(
      el('div', { class: 'spacer' }),
      runBtn,
      stopBtn,
      el('button', { class: 'icon-btn', type: 'button', title: 'Clear', 'data-icon': 'clear', onClick: () => { const p = panes[activeTab]; if (p && p.onClear) p.onClear(); } }),
      el('button', { class: 'icon-btn', type: 'button', title: 'Close Panel', 'data-icon': 'close', onClick: hide }));
    panel.append(header, bodyEl);
    SC.icons.hydrate(panel);
    showTab('output');
    log('Press F5 to run the open file. JavaScript, TypeScript, Python, Lua, SQL and Ruby run in your browser; C, C++, Rust, Go, Java and C# are compiled on godbolt.org. HTML and Markdown files open in the Preview tab.', 'info');

    initSash();
    const h = SC.storage.get('panelHeight', null);
    if (h) document.querySelector('.workbench').style.setProperty('--panel-height', h + 'px');
    if (SC.storage.get('panelOpen', false)) show();
  }

  function initSash() {
    sash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sash.setPointerCapture(e.pointerId);
      sash.classList.add('dragging');
      const startY = e.clientY;
      const startH = panel.getBoundingClientRect().height;
      const wb = document.querySelector('.workbench');
      panel.classList.add('resizing'); // iframes would swallow the pointer
      const move = (ev) => {
        const h = SC.util.clamp(startH + (startY - ev.clientY), 80, window.innerHeight * 0.75);
        wb.style.setProperty('--panel-height', h + 'px');
      };
      const up = () => {
        sash.classList.remove('dragging');
        panel.classList.remove('resizing');
        sash.removeEventListener('pointermove', move);
        sash.removeEventListener('pointerup', up);
        SC.storage.set('panelHeight', Math.round(panel.getBoundingClientRect().height));
      };
      sash.addEventListener('pointermove', move);
      sash.addEventListener('pointerup', up);
    });
  }

  function show(tab) {
    panel.hidden = false;
    sash.hidden = false;
    if (tab) showTab(tab);
    SC.storage.set('panelOpen', true);
    document.getElementById('tb-toggle-panel').classList.add('active');
  }
  function hide() {
    panel.hidden = true;
    sash.hidden = true;
    SC.storage.set('panelOpen', false);
    document.getElementById('tb-toggle-panel').classList.remove('active');
    const ed = SC.tabs.activeEditor();
    if (ed) ed.focus();
  }
  function toggle() { if (panel.hidden) show(); else hide(); }

  function showTab(id) {
    if (!panes[id]) id = 'output';
    activeTab = id;
    Object.entries(tabButtons).forEach(([k, b]) => b.classList.toggle('active', k === id));
    Object.entries(panes).forEach(([k, p]) => { p.el.hidden = k !== id; });
    if (panes[id].onShow) panes[id].onShow();
  }

  /** Add a tab to the panel. element fills the panel body while the tab is shown. */
  function addTab(id, label, element, { onShow, onClear } = {}) {
    if (panes[id]) removeTab(id);
    tabButtons[id] = el('button', { class: 'panel-tab', type: 'button', role: 'tab', text: label, onClick: () => showTab(id) });
    tabStrip.append(tabButtons[id]);
    element.classList.add('panel-pane');
    element.hidden = true;
    bodyEl.append(element);
    panes[id] = { el: element, onShow, onClear };
    if (activeTab === id) showTab(id);
  }

  function removeTab(id) {
    const p = panes[id];
    if (!p || id === 'output') return;
    p.el.remove();
    tabButtons[id].remove();
    delete panes[id];
    delete tabButtons[id];
    if (activeTab === id) showTab('output');
  }

  /** Make the panel at least this tall (in pixels), up to 75% of the window. */
  function ensureHeight(px) {
    const h = Math.min(px, window.innerHeight * 0.75);
    if (panel.getBoundingClientRect().height >= h) return;
    document.querySelector('.workbench').style.setProperty('--panel-height', Math.round(h) + 'px');
  }

  /** Add a whole line. An unfinished line from write() is closed first. */
  function log(text, kind = '') {
    openLine = null;
    const line = el('div', { class: kind ? 'log-' + kind : '' });
    line.textContent = text;
    append(line);
  }

  /** Stream text: it continues the last line until a newline ends it. */
  function write(text, kind = '') {
    const parts = String(text).split('\n');
    parts.forEach((part, i) => {
      if (part) {
        if (!openLine) { openLine = el('div'); append(openLine); }
        openLine.append(kind ? el('span', { class: 'log-' + kind, text: part }) : document.createTextNode(part));
      }
      if (i < parts.length - 1) { // a newline follows
        if (!openLine) append(el('div'));
        openLine = null;
      }
    });
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  /** True while the last output line has no newline yet. */
  function isLineOpen() { return !!openLine; }

  function append(line) {
    outputEl.append(line);
    while (outputEl.childNodes.length > 5000) outputEl.firstChild.remove();
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function clear() { outputEl.textContent = ''; openLine = null; }

  /** Show the Stop button while a program runs. */
  function setRunning(on) {
    runBtn.hidden = on;
    stopBtn.hidden = !on;
    document.getElementById('run-btn').classList.toggle('running', on);
  }

  /* ---------- HTML preview ---------- */
  /** Inline <link rel=stylesheet href="x.css"> and <script src="x.js"> from the workspace. */
  function buildPreview(html, basePath) {
    const dir = SC.util.dirname(basePath || '');
    const resolve = (ref) => {
      if (/^(https?:|data:|\/\/)/i.test(ref)) return null;
      const parts = (dir ? dir + '/' : '') + ref.replace(/^\.\//, '');
      const stack = [];
      for (const p of parts.split('/')) {
        if (p === '..') stack.pop();
        else if (p && p !== '.') stack.push(p);
      }
      const path = stack.join('/');
      const doc = SC.tabs.docs().find((d) => d.path === path);
      if (doc) return doc.editor.value;
      return SC.fs.isFile(path) ? SC.fs.readFile(path) : null;
    };
    let out = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
      const href = /href=["']([^"']+)["']/i.exec(tag);
      const css = href ? resolve(href[1]) : null;
      return css == null ? tag : '<style>/* ' + escapeHtml(href[1]) + ' */\n' + css + '\n</style>';
    });
    out = out.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
      const js = resolve(src);
      return js == null ? tag : '<script' + a + b + '>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n<\/script>';
    });
    return out;
  }

  function previewHtml(html, path) {
    previewDoc(buildPreview(html, path), '[Preview] ' + (path || 'Untitled'));
  }

  /** Show a full HTML document in the Preview tab. */
  function previewDoc(html, label) {
    show('preview');
    previewFrame.srcdoc = html;
    if (label) log(label, 'system');
  }

  SC.panel = { init, show, hide, toggle, log, write, isLineOpen, clear, setRunning, previewHtml, previewDoc, addTab, removeTab, showTab, ensureHeight, isOpen: () => !panel.hidden, activeTab: () => activeTab };
})(window.SC);
