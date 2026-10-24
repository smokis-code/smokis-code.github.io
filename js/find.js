/* ==========================================================================
   find.js — Find / Replace widget for the active editor (Ctrl+F, Ctrl+H).
   Supports match case, whole word and regular expressions.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const MAX_MATCHES = 20000;
  let host;
  let findInput;
  let replaceInput;
  let countEl;
  let replaceRow;
  const opts = { caseSensitive: false, wholeWord: false, regex: false };
  let matches = [];
  let current = -1;
  let open = false;

  function build() {
    host = document.getElementById('find-widget');
    findInput = el('input', { class: 'text-input', id: 'find-input', placeholder: 'Find', 'aria-label': 'Find', spellcheck: 'false' });
    replaceInput = el('input', { class: 'text-input', id: 'replace-input', placeholder: 'Replace', 'aria-label': 'Replace', spellcheck: 'false' });
    countEl = el('span', { class: 'find-count', text: 'No results' });

    const optBtn = (key, label, title) => {
      const b = el('button', { class: 'opt-btn', type: 'button', text: label, title, 'aria-pressed': 'false' });
      b.addEventListener('click', () => {
        opts[key] = !opts[key];
        b.classList.toggle('on', opts[key]);
        b.setAttribute('aria-pressed', String(opts[key]));
        search(true);
        findInput.focus();
      });
      return b;
    };

    const toggle = el('button', { class: 'icon-btn find-toggle-replace', type: 'button', title: 'Toggle Replace', 'data-icon': 'chevron' });
    toggle.addEventListener('click', () => setReplaceVisible(!replaceRow.classList.contains('show')));

    replaceRow = el('div', { class: 'find-row find-replace-row' },
      el('div', { class: 'find-field' }, replaceInput),
      el('button', { class: 'icon-btn', type: 'button', title: 'Replace (Enter)', 'data-icon': 'replace', onClick: replaceOne }),
      el('button', { class: 'icon-btn', type: 'button', title: 'Replace All (Ctrl+Alt+Enter)', 'data-icon': 'replace-all', onClick: replaceAll }));

    host.append(
      toggle,
      el('div', { class: 'find-row' },
        el('div', { class: 'find-field' }, findInput,
          el('div', { class: 'field-opts' },
            optBtn('caseSensitive', 'Aa', 'Match Case'),
            optBtn('wholeWord', 'ab', 'Match Whole Word'),
            optBtn('regex', '.*', 'Use Regular Expression'))),
        countEl,
        el('button', { class: 'icon-btn', type: 'button', title: 'Previous Match (Shift+Enter)', 'data-icon': 'arrow-up', onClick: () => step(-1) }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Next Match (Enter)', 'data-icon': 'arrow-down', onClick: () => step(1) }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Close (Escape)', 'data-icon': 'close', onClick: close })),
      replaceRow);
    SC.icons.hydrate(host);

    findInput.addEventListener('input', () => search(true));
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); replaceAll(); }
      else if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  function setReplaceVisible(show) {
    replaceRow.classList.toggle('show', show);
    host.classList.toggle('replace-open', show);
  }

  /** Build the RegExp for the current query, or return an error message. */
  function buildRegex() {
    const q = findInput.value;
    if (!q) return null;
    let source = opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (opts.wholeWord) source = '\\b' + source + '\\b';
    try {
      return new RegExp(source, 'g' + (opts.caseSensitive ? '' : 'i') + 'm');
    } catch (err) {
      return { error: 'Invalid regular expression: ' + err.message };
    }
  }

  function search(selectNearest) {
    const ed = SC.tabs.activeEditor();
    matches = [];
    current = -1;
    if (!ed) { updateCount(); return; }
    const re = buildRegex();
    if (!re || re.error) {
      ed.setMarks([]);
      countEl.textContent = re && re.error ? 'Invalid regex' : 'No results';
      countEl.title = re && re.error ? re.error : '';
      countEl.classList.toggle('none', !!(re && re.error));
      return;
    }
    const text = ed.value;
    let m;
    while ((m = re.exec(text)) && matches.length < MAX_MATCHES) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (matches.length) {
      const from = ed.ta.selectionStart;
      current = matches.findIndex((x) => x.start >= from);
      if (current < 0) current = 0;
    }
    ed.setMarks(matches, current);
    updateCount();
    if (selectNearest && current >= 0) reveal();
  }

  function updateCount() {
    countEl.title = '';
    if (!findInput.value) { countEl.textContent = 'No results'; countEl.classList.remove('none'); return; }
    countEl.textContent = matches.length ? (current + 1) + ' of ' + matches.length + (matches.length >= MAX_MATCHES ? '+' : '') : 'No results';
    countEl.classList.toggle('none', !matches.length);
  }

  function reveal() {
    const ed = SC.tabs.activeEditor();
    if (!ed || current < 0) return;
    const m = matches[current];
    ed.ta.setSelectionRange(m.start, m.end);
    ed.setMarks(matches, current);
    ed.revealOffset(m.start, false);
    ed.revealOffset(m.end, false);
    updateCount();
  }

  function step(dir) {
    if (!matches.length) { search(false); if (!matches.length) return; }
    const ed = SC.tabs.activeEditor();
    if (current < 0) current = 0;
    else {
      // If the user moved the caret, continue from there
      const sel = ed.ta.selectionStart;
      const atCurrent = matches[current] && matches[current].start === sel;
      if (!atCurrent) {
        current = dir > 0 ? matches.findIndex((x) => x.start > sel) : findLastIndex(matches, (x) => x.start < sel);
        if (current < 0) current = dir > 0 ? 0 : matches.length - 1;
      } else {
        current = (current + dir + matches.length) % matches.length;
      }
    }
    reveal();
  }

  function findLastIndex(arr, fn) {
    for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
    return -1;
  }

  function replacementFor(matchText) {
    if (!opts.regex) return replaceInput.value;
    const re = buildRegex();
    return matchText.replace(new RegExp(re.source, re.flags.replace('g', '')), replaceInput.value);
  }

  function replaceOne() {
    const ed = SC.tabs.activeEditor();
    if (!ed) return;
    if (!matches.length) search(false);
    if (current < 0 || !matches[current]) return;
    const m = matches[current];
    const text = replacementFor(ed.value.slice(m.start, m.end));
    ed.replaceRange(m.start, m.end, text, m.start + text.length);
    search(false);
    if (matches.length) {
      current = matches.findIndex((x) => x.start >= m.start + text.length);
      if (current < 0) current = 0;
      reveal();
    }
    replaceInput.focus();
  }

  function replaceAll() {
    const ed = SC.tabs.activeEditor();
    const re = buildRegex();
    if (!ed || !re || re.error) return;
    const before = ed.value;
    let count = 0;
    const after = before.replace(re, (...args) => {
      count++;
      return opts.regex ? args[0].replace(new RegExp(re.source, re.flags.replace('g', '')), replaceInput.value) : replaceInput.value;
    });
    if (!count) { SC.notify('No matches to replace.', 'info'); return; }
    ed.replaceRange(0, before.length, after, 0, 0);
    search(false);
    SC.notify('Replaced ' + count + ' occurrence' + (count === 1 ? '' : 's') + '.', 'success');
    replaceInput.focus();
  }

  function show(withReplace = false) {
    const ed = SC.tabs.activeEditor();
    if (!ed) { SC.notify('Open a file to search inside it.', 'info'); return; }
    if (!host) build();
    const sel = ed.selection().text;
    if (sel && !sel.includes('\n') && sel.length < 200) findInput.value = sel;
    host.hidden = false;
    open = true;
    setReplaceVisible(withReplace || replaceRow.classList.contains('show'));
    findInput.focus();
    findInput.select();
    search(false);
    updateCount();
    if (withReplace && findInput.value) replaceInput.focus();
  }

  function close() {
    if (!host) return;
    host.hidden = true;
    open = false;
    const ed = SC.tabs.activeEditor();
    if (ed) {
      ed.setMarks([]);
      ed.focus();
    }
  }

  const refresh = SC.util.debounce(() => { if (open) search(false); }, 120);

  SC.find = {
    open: show, close, isOpen: () => open, refresh,
    next: () => (open ? step(1) : show()), prev: () => (open ? step(-1) : show()),
  };
})(window.SC);
