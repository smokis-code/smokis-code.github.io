/* ==========================================================================
   search.js — "Search" sidebar view: find text across every file in the
   workspace, with optional replace-all.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, escapeHtml, basename, dirname } = SC.util;
  const MAX_RESULTS = 2000;
  const opts = { caseSensitive: false, wholeWord: false, regex: false };
  let input;
  let replaceInput;
  let summary;
  let results;
  const collapsed = new Set();

  function init() {
    const view = document.getElementById('view-search');
    input = el('input', { class: 'text-input', id: 'search-input', placeholder: 'Search', 'aria-label': 'Search in all files', spellcheck: 'false' });
    replaceInput = el('input', { class: 'text-input', id: 'search-replace-input', placeholder: 'Replace', 'aria-label': 'Replace in all files', spellcheck: 'false' });
    summary = el('div', { class: 'search-summary' });
    results = el('div', { class: 'search-results' });

    const opt = (key, label, title) => {
      const b = el('button', { class: 'opt-btn', type: 'button', text: label, title, 'aria-pressed': 'false' });
      b.addEventListener('click', () => {
        opts[key] = !opts[key];
        b.classList.toggle('on', opts[key]);
        b.setAttribute('aria-pressed', String(opts[key]));
        run();
      });
      return b;
    };

    view.append(
      el('div', { class: 'view-header' }, el('span', { text: 'Search' }),
        el('div', { class: 'actions' },
          el('button', { class: 'icon-btn', type: 'button', title: 'Clear Search Results', 'data-icon': 'clear', onClick: () => { input.value = ''; replaceInput.value = ''; run(); input.focus(); } }))),
      el('div', { class: 'search-form' },
        el('div', { class: 'search-field' }, input,
          el('div', { class: 'field-opts' }, opt('caseSensitive', 'Aa', 'Match Case'), opt('wholeWord', 'ab', 'Match Whole Word'), opt('regex', '.*', 'Use Regular Expression'))),
        el('div', { class: 'search-field', style: { display: 'flex', gap: '4px' } }, replaceInput,
          el('button', { class: 'icon-btn', type: 'button', title: 'Replace All in Workspace', 'data-icon': 'replace-all', onClick: replaceAll }))),
      summary,
      results);
    SC.icons.hydrate(view);

    const debounced = SC.util.debounce(run, 200);
    input.addEventListener('input', debounced);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); debounced.flush(); } });
    replaceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceAll(); } });
    SC.fs.on('change', SC.util.debounce(() => { if (input.value) run(); }, 400));
  }

  function buildRegex() {
    const q = input.value;
    if (!q) return null;
    let source = opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (opts.wholeWord) source = '\\b' + source + '\\b';
    try {
      return new RegExp(source, 'g' + (opts.caseSensitive ? '' : 'i'));
    } catch (err) {
      return { error: err.message };
    }
  }

  /** Text for a file: unsaved editor contents win over what is on "disk". */
  function contentOf(path) {
    const doc = SC.tabs.docs().find((d) => d.path === path);
    return doc ? doc.editor.value : SC.fs.readFile(path);
  }

  function run() {
    results.textContent = '';
    const re = buildRegex();
    if (!re) { summary.textContent = ''; return; }
    if (re.error) { summary.textContent = 'Invalid regular expression: ' + re.error; return; }
    let total = 0;
    let fileCount = 0;
    for (const { path } of SC.fs.allFiles()) {
      if (total >= MAX_RESULTS) break;
      const text = contentOf(path);
      const lines = text.split('\n');
      const hits = [];
      let offset = 0;
      for (let li = 0; li < lines.length && total < MAX_RESULTS; li++) {
        const line = lines[li];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) && total < MAX_RESULTS) {
          if (!m[0].length) { re.lastIndex++; continue; }
          hits.push({ line: li, col: m.index, len: m[0].length, text: line, offset: offset + m.index });
          total++;
        }
        offset += line.length + 1;
      }
      if (!hits.length) continue;
      fileCount++;
      renderFile(path, hits);
    }
    summary.textContent = total
      ? total + (total >= MAX_RESULTS ? '+' : '') + ' result' + (total === 1 ? '' : 's') + ' in ' + fileCount + ' file' + (fileCount === 1 ? '' : 's')
      : 'No results found.';
    SC.icons.hydrate(results);
  }

  function renderFile(path, hits) {
    const isCollapsed = collapsed.has(path);
    const header = el('div', { class: 'search-file', title: path },
      el('span', { 'data-icon': 'chevron', style: { display: 'flex', width: '16px', transform: isCollapsed ? '' : 'rotate(90deg)' } }),
      SC.icons.fileIcon(path),
      el('span', { text: basename(path) }),
      el('span', { class: 'dir', text: dirname(path) }),
      el('span', { class: 'count', text: String(hits.length) }));
    const list = el('div', { hidden: isCollapsed });
    header.addEventListener('click', () => {
      if (collapsed.has(path)) collapsed.delete(path); else collapsed.add(path);
      list.hidden = !list.hidden;
      header.firstChild.style.transform = list.hidden ? '' : 'rotate(90deg)';
    });
    for (const hit of hits) {
      const start = Math.max(0, hit.col - 30);
      const pre = (start > 0 ? '…' : '') + hit.text.slice(start, hit.col).trimStart();
      const match = hit.text.slice(hit.col, hit.col + hit.len);
      const post = hit.text.slice(hit.col + hit.len, hit.col + hit.len + 120);
      const row = el('div', {
        class: 'search-match', title: 'Line ' + (hit.line + 1),
        html: escapeHtml(pre) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(post),
      });
      row.addEventListener('click', () => {
        const doc = SC.tabs.open(path);
        if (doc) doc.editor.setSelection(hit.offset, hit.offset + hit.len, true, true);
      });
      list.append(row);
    }
    results.append(header, list);
  }

  async function replaceAll() {
    const re = buildRegex();
    if (!re || re.error) return;
    const replacement = replaceInput.value;
    let count = 0;
    let files = 0;
    const plan = [];
    for (const { path } of SC.fs.allFiles()) {
      const text = contentOf(path);
      let n = 0;
      const out = text.replace(re, (m) => { n++; return opts.regex ? m.replace(new RegExp(re.source, re.flags.replace('g', '')), replacement) : replacement; });
      if (n) { plan.push({ path, out }); count += n; files++; }
    }
    if (!count) { SC.notify('No matches to replace.', 'info'); return; }
    const choice = await SC.dialog.confirm({
      title: 'Replace ' + count + ' occurrence' + (count === 1 ? '' : 's') + ' across ' + files + ' file' + (files === 1 ? '' : 's') + ' with "' + replacement + '"?',
      message: 'Open files are changed in their editors (you can undo there). Closed files are saved right away.',
      buttons: [{ label: 'Replace', value: 'replace', primary: true }, { label: 'Cancel', value: 'cancel' }],
    });
    if (choice !== 'replace') return;
    for (const { path, out } of plan) {
      const doc = SC.tabs.docs().find((d) => d.path === path);
      if (doc) doc.editor.replaceRange(0, doc.editor.value.length, out, 0, 0);
      else SC.fs.writeFile(path, out);
    }
    run();
    SC.notify('Replaced ' + count + ' occurrence' + (count === 1 ? '' : 's') + '.', 'success');
  }

  function focus() {
    if (SC.app) SC.app.showView('search');
    const ed = SC.tabs.activeEditor();
    const sel = ed ? ed.selection().text : '';
    if (sel && !sel.includes('\n') && sel.length < 200) { input.value = sel; run(); }
    input.focus();
    input.select();
  }

  SC.search = { init, focus, run };
})(window.SC);
