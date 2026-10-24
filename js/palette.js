/* ==========================================================================
   palette.js — the Command Palette and every "quick pick" list.

   SC.palette.open('>')   command mode     (Ctrl+Shift+P / F1)
   SC.palette.open('')    go to file       (Ctrl+P)
   SC.palette.open(':')   go to line       (Ctrl+G)
   SC.palette.pick(items, options)  -> Promise<item | undefined>
   SC.palette.prompt(options)       -> Promise<string | undefined>
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, fuzzy, markMatches, escapeHtml } = SC.util;
  const MAX_ITEMS = 300;
  let session = null; // the currently open quick input

  /**
   * Low-level quick input.
   * provider(value) -> { items: [...], message?: string } is called on every keystroke.
   * Item: { label, description, detail, keybinding, icon, swatch, group, highlights, run? }
   */
  function openQuickInput({ value = '', placeholder = '', provider, onAccept, onFocus, onCancel, selectValue = null }) {
    if (session) session.close(true);

    const backdrop = el('div', { class: 'overlay-backdrop' });
    const input = el('input', { class: 'text-input', id: 'quick-input-field', type: 'text', placeholder, autocomplete: 'off', spellcheck: 'false', 'aria-label': placeholder || 'Quick input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'quick-list' });
    const message = el('div', { class: 'quick-input-message', hidden: true });
    const listEl = el('div', { class: 'quick-list', id: 'quick-list', role: 'listbox' });
    const box = el('div', { class: 'quick-input' },
      el('div', { class: 'quick-input-header' }, input),
      message,
      listEl);

    let items = [];
    let focused = 0;
    let closed = false;

    function render() {
      const result = provider(input.value) || { items: [] };
      items = (result.items || []).slice(0, MAX_ITEMS);
      if (result.message) {
        message.hidden = false;
        message.textContent = result.message;
        message.classList.toggle('error', !!result.error);
      } else {
        message.hidden = true;
      }
      focused = Math.min(Math.max(0, result.focusIndex != null ? result.focusIndex : 0), Math.max(0, items.length - 1));
      listEl.textContent = '';
      if (!items.length && !result.message) {
        listEl.append(el('div', { class: 'quick-empty', text: 'No matching results' }));
      }
      let lastGroup = null;
      items.forEach((item, i) => {
        const row = el('div', { class: 'quick-item', role: 'option', id: 'qi-' + i });
        if (item.group && item.group !== lastGroup && i > 0) row.classList.add('has-separator');
        if (item.icon) row.append(item.icon.nodeType ? el('span', { class: 'qi-icon' }, item.icon) : el('span', { class: 'qi-icon', 'data-icon': item.icon }));
        if (item.swatch) row.append(el('span', { class: 'qi-swatch', style: { background: item.swatch } }));
        row.append(el('span', { class: 'qi-label', html: markMatches(item.label, item.highlights) }));
        if (item.description) row.append(el('span', { class: 'qi-desc', text: item.description }));
        const right = el('span', { class: 'qi-right' });
        if (item.group && item.group !== lastGroup) right.append(el('span', { text: item.group }));
        if (item.keybinding) right.append(...item.keybinding.split(' ').map((k) => el('kbd', { text: k })));
        if (right.childNodes.length) row.append(right);
        lastGroup = item.group;
        row.addEventListener('mousemove', () => { if (focused !== i) setFocus(i, false); });
        row.addEventListener('mousedown', (e) => e.preventDefault());
        row.addEventListener('click', () => accept(i));
        listEl.append(row);
      });
      SC.icons.hydrate(listEl);
      setFocus(focused, true);
    }

    function setFocus(i, scroll) {
      const rows = listEl.querySelectorAll('.quick-item');
      rows.forEach((r) => r.classList.remove('focused'));
      focused = i;
      if (rows[i]) {
        rows[i].classList.add('focused');
        input.setAttribute('aria-activedescendant', rows[i].id);
        if (scroll) rows[i].scrollIntoView({ block: 'nearest' });
        if (onFocus) onFocus(items[i]);
      }
    }

    function accept(i) {
      const item = items[i];
      const value = input.value;
      close(false);
      if (onAccept) onAccept(item, value);
    }

    function close(cancelled) {
      if (closed) return;
      closed = true;
      backdrop.remove();
      box.remove();
      SC.overlay.pop();
      if (session && session.box === box) session = null;
      if (cancelled && onCancel) onCancel();
      const ed = SC.tabs && SC.tabs.activeEditor();
      if (ed && cancelled !== 'keep-focus') ed.focus();
    }

    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setFocus((focused + 1) % items.length, true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setFocus((focused - 1 + items.length) % items.length, true); }
      else if (e.key === 'PageDown') { e.preventDefault(); if (items.length) setFocus(Math.min(items.length - 1, focused + 10), true); }
      else if (e.key === 'PageUp') { e.preventDefault(); if (items.length) setFocus(Math.max(0, focused - 10), true); }
      else if (e.key === 'Enter') { e.preventDefault(); accept(focused); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    });
    backdrop.addEventListener('mousedown', (e) => { e.preventDefault(); close(true); });

    SC.overlay.root().append(backdrop, box);
    SC.overlay.push();
    input.value = value;
    input.focus();
    if (selectValue) input.setSelectionRange(selectValue[0], selectValue[1]);
    else input.setSelectionRange(value.length, value.length);
    render();

    session = { box, close, input, render };
    return session;
  }

  /* ---------- Providers for the main palette ---------- */
  function commandItems(query) {
    const q = query.trim();
    const recent = SC.storage.get('recentCommands', []);
    const cmds = SC.commands.list();
    const scored = [];
    for (const cmd of cmds) {
      const label = SC.commands.label(cmd);
      const m = fuzzy(q, label);
      if (!m) continue;
      const r = recent.indexOf(cmd.id);
      scored.push({
        label, highlights: m.indices,
        keybinding: SC.commands.keyFor(cmd.id),
        commandId: cmd.id,
        score: q ? m.score + (r >= 0 ? 8 - r : 0) : (r >= 0 ? 1000 - r : 0),
        recent: r >= 0,
      });
    }
    scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    if (!q) {
      scored.forEach((it) => { it.group = it.recent ? 'recently used' : 'other commands'; });
    }
    return scored;
  }

  function fileItems(query) {
    const q = query.trim();
    const files = SC.fs.allFiles();
    const out = [];
    for (const f of files) {
      const name = SC.util.basename(f.path);
      const mName = fuzzy(q, name);
      const mPath = mName ? null : fuzzy(q, f.path);
      if (!mName && !mPath) continue;
      out.push({
        label: name,
        description: SC.util.dirname(f.path),
        highlights: mName ? mName.indices : [],
        icon: SC.icons.fileIcon(name),
        path: f.path,
        score: mName ? mName.score + 100 : mPath.score,
      });
    }
    if (!q) {
      // Show recently opened files first
      const recent = SC.storage.get('recentFiles', []);
      out.forEach((it) => {
        const r = recent.indexOf(it.path);
        it.score = r >= 0 ? 1000 - r : 0;
        it.group = r >= 0 ? 'recently opened' : 'files';
      });
    }
    out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return out;
  }

  function lineProvider(query) {
    const ed = SC.tabs.activeEditor();
    if (!ed) return { items: [], message: 'Open a file first to go to a line.' };
    const total = ed.lineCount();
    const raw = query.trim();
    if (!raw) {
      const pos = ed.cursor();
      return { items: [], message: 'Current line: ' + pos.line + ', character: ' + pos.col + '. Type a line number between 1 and ' + total + ' to navigate to.' };
    }
    const m = /^(\d+)(?:[:,](\d+))?$/.exec(raw);
    if (!m) return { items: [], message: 'Type a line number, like 42 or 42:7 (line:column).', error: true };
    const line = Math.min(Number(m[1]), total);
    const col = m[2] ? Number(m[2]) : 1;
    return { items: [{ label: 'Go to line ' + line + (m[2] ? ', character ' + col : ''), line, col }] };
  }

  /** The main palette with mode prefixes: '>' commands, ':' line, '' files. */
  function open(prefix = '>') {
    openQuickInput({
      value: prefix,
      placeholder: 'Search files by name (type > for commands, : to go to a line)',
      provider(value) {
        if (value.startsWith('>')) return { items: commandItems(value.slice(1)) };
        if (value.startsWith(':')) return lineProvider(value.slice(1));
        if (value.startsWith('?')) {
          return {
            items: [
              { label: '…', description: 'Go to file', mode: '' },
              { label: '>', description: 'Show and run commands', mode: '>' },
              { label: ':', description: 'Go to line', mode: ':' },
            ],
          };
        }
        const items = fileItems(value);
        return { items, message: SC.fs.allFiles().length ? null : 'Your workspace has no files yet. Type > and run "File: New File".' };
      },
      onAccept(item, value) {
        if (!item) return;
        if (item.mode != null) { open(item.mode); return; }
        if (item.commandId) { SC.commands.run(item.commandId); return; }
        if (item.path) { SC.tabs.open(item.path); return; }
        if (item.line) {
          const ed = SC.tabs.activeEditor();
          if (ed) ed.goToLine(item.line, item.col);
        }
      },
    });
  }

  /** Generic picker. Resolves with the chosen item or undefined. */
  function pick(items, { placeholder = '', activeIndex = 0, onFocus, matchOnDescription = false } = {}) {
    return new Promise((resolve) => {
      let firstRender = true;
      openQuickInput({
        placeholder,
        provider(value) {
          const q = value.trim();
          const out = [];
          for (const item of items) {
            const m = fuzzy(q, item.label) || (matchOnDescription && item.description && fuzzy(q, item.description) ? { score: 0, indices: [] } : null);
            if (!m) continue;
            out.push(Object.assign({}, item, { highlights: m.indices, _score: m.score }));
          }
          if (q) out.sort((a, b) => b._score - a._score);
          const focusIndex = firstRender && !q ? activeIndex : 0;
          firstRender = false;
          return { items: out, focusIndex };
        },
        onFocus,
        onAccept: (item) => resolve(item),
        onCancel: () => resolve(undefined),
      });
    });
  }

  /** Ask for a line of text. validate(value) may return an error message. */
  function prompt({ placeholder = '', value = '', prompt: hint = 'Press Enter to confirm or Escape to cancel', validate, selectValue } = {}) {
    return new Promise((resolve) => {
      openQuickInput({
        value,
        placeholder,
        selectValue,
        provider(v) {
          const err = validate ? validate(v) : null;
          if (err) return { items: [], message: err, error: true };
          return { items: [], message: hint };
        },
        onAccept(_item, v) {
          const err = validate ? validate(v) : null;
          if (err) {
            SC.notify(err, 'error');
            resolve(undefined);
            return;
          }
          resolve(v);
        },
        onCancel: () => resolve(undefined),
      });
    });
  }

  SC.palette = { open, pick, prompt, isOpen: () => !!session, escapeHtml };
})(window.SC);
