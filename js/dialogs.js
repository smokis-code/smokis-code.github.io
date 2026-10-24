/* ==========================================================================
   dialogs.js — in-page dialogs (the browser's confirm()/prompt() are not
   used, so the app also works inside sandboxed frames) and the theme
   customizer.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;

  /**
   * Show a modal message with buttons.
   * buttons: [{ label, value, primary, danger }]. Escape resolves to `cancelValue`.
   */
  function confirm({ title, message, buttons, cancelValue = 'cancel' }) {
    return new Promise((resolve) => {
      const backdrop = el('div', { class: 'overlay-backdrop dim' });
      const btnRow = el('div', { class: 'dialog-buttons' });
      const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
        el('div', { class: 'dialog-body' },
          el('h2', { class: 'dialog-title', id: 'dialog-title', text: title }),
          message ? el('p', { class: 'dialog-message', text: message }) : null),
        btnRow);
      const list = buttons || [{ label: 'OK', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }];
      let primaryBtn = null;
      for (const b of list) {
        const btn = el('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button', text: b.label });
        btn.addEventListener('click', () => done(b.value));
        btnRow.append(btn);
        if (b.primary) primaryBtn = btn;
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(cancelValue); }
        if (e.key === 'Tab') { // keep focus inside the dialog
          const items = Array.from(btnRow.querySelectorAll('button'));
          const idx = items.indexOf(document.activeElement);
          e.preventDefault();
          items[(idx + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
        }
      }
      function done(value) {
        window.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        dialog.remove();
        SC.overlay.pop();
        resolve(value);
      }
      backdrop.addEventListener('mousedown', (e) => e.preventDefault());
      SC.overlay.root().append(backdrop, dialog);
      SC.overlay.push();
      window.addEventListener('keydown', onKey, true);
      (primaryBtn || btnRow.querySelector('button')).focus();
    });
  }

  /**
   * Ask for several lines of text (used for program input).
   * Resolves to the text, or null if cancelled. Ctrl+Enter confirms.
   */
  function promptText({ title, message, value = '', placeholder = 'One answer per line', okLabel = 'OK' }) {
    return new Promise((resolve) => {
      const backdrop = el('div', { class: 'overlay-backdrop dim' });
      const area = el('textarea', { class: 'text-input prompt-text', rows: '6', spellcheck: 'false', placeholder, 'aria-label': title });
      area.value = value;
      const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
        el('div', { class: 'dialog-body' },
          el('h2', { class: 'dialog-title', id: 'dialog-title', text: title }),
          message ? el('p', { class: 'dialog-message', text: message }) : null,
          area,
          el('p', { class: 'dialog-hint', text: 'Ctrl+Enter to ' + okLabel.toLowerCase() + ', Escape to cancel' })),
        el('div', { class: 'dialog-buttons' },
          el('button', { class: 'btn', type: 'button', text: 'Cancel', onClick: () => done(null) }),
          el('button', { class: 'btn primary', type: 'button', text: okLabel, onClick: () => done(area.value) })));
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); done(area.value); }
      }
      function done(result) {
        window.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        dialog.remove();
        SC.overlay.pop();
        resolve(result);
      }
      backdrop.addEventListener('mousedown', (e) => e.preventDefault());
      SC.overlay.root().append(backdrop, dialog);
      SC.overlay.push();
      window.addEventListener('keydown', onKey, true);
      area.focus();
      area.select();
    });
  }

  /* ---------- Theme customizer ---------- */
  const SAMPLE = [
    ['comment', '# Smoki\'s Code theme preview'], [null, '\n'],
    ['decorator', '@cached'], [null, '\n'],
    ['keyword', 'def'], [null, ' '], ['function', 'brew'], ['punct', '('], ['variable', 'beans'], ['punct', ','], [null, ' '], ['variable', 'cups'], ['operator', '='], ['number', '2'], ['punct', '):'], [null, '\n    '],
    ['control', 'if'], [null, ' '], ['builtin', 'len'], ['punct', '('], ['variable', 'beans'], ['punct', ')'], [null, ' '], ['operator', '=='], [null, ' '], ['number', '0'], ['punct', ':'], [null, '\n        '],
    ['control', 'return'], [null, ' '], ['constant', 'None'], [null, '\n    '],
    ['variable', 'pot'], [null, ' '], ['operator', '='], [null, ' '], ['type', 'Kettle'], ['punct', '('], ['string', '"smoky"'], ['punct', ')'], [null, '\n    '],
    ['control', 'return'], [null, ' '], ['variable', 'pot'], ['punct', '.'], ['function', 'pour'], ['punct', '('], ['variable', 'cups'], ['punct', ')'], [null, '  '], ['comment', '# done'], [null, '\n'],
    ['punct', '<'], ['tag', 'div'], [null, ' '], ['attr', 'class'], ['operator', '='], ['string', '"cup"'], ['punct', '>'], [null, 'Hot!'], ['punct', '</'], ['tag', 'div'], ['punct', '>'], [null, '  '], ['regex', '/^\\d+$/'],
  ];

  function themeEditor() {
    const original = SC.themes.current();
    const working = SC.themes.complete(JSON.parse(JSON.stringify(original)));
    const isCustom = SC.themes.isCustom(original.id);
    if (!isCustom) working.name = original.name + ' (Custom)';
    let tab = 'tokens';

    const backdrop = el('div', { class: 'overlay-backdrop dim' });
    const nameInput = el('input', { class: 'text-input', id: 'theme-name', value: working.name, 'aria-label': 'Theme name', maxlength: '60' });
    const typeSelect = el('select', { class: 'text-input', id: 'theme-type', 'aria-label': 'Theme type' },
      el('option', { value: 'dark', text: 'Dark' }), el('option', { value: 'light', text: 'Light' }));
    typeSelect.value = working.type;
    const grid = el('div', { class: 'te-grid' });
    const preview = el('div', { class: 'te-preview', html: SC.highlighter.tokensToHtml(SAMPLE) });
    const tabs = el('div', { class: 'te-tabs' });
    const tabBtns = {};
    for (const [id, label] of [['tokens', 'Syntax colors'], ['ui', 'Workbench colors']]) {
      tabBtns[id] = el('button', { class: 'te-tab', type: 'button', text: label, onClick: () => { tab = id; renderGrid(); } });
      tabs.append(tabBtns[id]);
    }

    const dialog = el('div', { class: 'dialog theme-editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Customize theme' },
      el('div', { class: 'te-head' },
        el('strong', { text: 'Customize theme' }),
        nameInput, typeSelect),
      preview,
      tabs,
      grid,
      el('div', { class: 'dialog-buttons' },
        el('button', { class: 'btn', type: 'button', text: 'Export JSON', onClick: exportCurrent }),
        el('div', { style: { flex: '1' } }),
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onClick: cancel }),
        el('button', { class: 'btn primary', type: 'button', text: isCustom ? 'Save theme' : 'Save as new theme', onClick: save })));

    const toHex6 = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map((c) => c + c).join('') : /^#[0-9a-f]{8}$/i.test(v) ? v.slice(0, 7) : '#000000');

    function renderGrid() {
      Object.entries(tabBtns).forEach(([id, b]) => b.classList.toggle('active', id === tab));
      grid.textContent = '';
      const keys = tab === 'tokens' ? SC.themes.TOKEN_KEYS : SC.themes.UI_KEYS;
      const map = tab === 'tokens' ? working.tokens : working.ui;
      for (const [key, label] of Object.entries(keys)) {
        const id = 'te-' + tab + '-' + key;
        const color = el('input', { type: 'color', id, value: toHex6(map[key]), 'aria-label': label });
        const hex = el('input', { class: 'text-input te-hex', value: map[key], 'aria-label': label + ' hex value', spellcheck: 'false' });
        color.addEventListener('input', () => { map[key] = color.value; hex.value = color.value; live(); });
        hex.addEventListener('input', () => {
          const v = hex.value.trim();
          if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) { map[key] = v; color.value = toHex6(v); live(); }
        });
        grid.append(el('label', { class: 'te-field', for: id }, color, el('span', { class: 'te-name', text: label, title: label }), hex));
      }
    }

    function live() { SC.themes.apply(working, { persist: false }); }

    function close() {
      window.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      dialog.remove();
      SC.overlay.pop();
    }
    function cancel() { SC.themes.apply(original.id); close(); }
    function save() {
      working.name = nameInput.value.trim() || 'My Theme';
      working.type = typeSelect.value;
      if (!isCustom) delete working.id;
      const id = SC.themes.saveCustom(working);
      SC.themes.apply(id);
      close();
      SC.notify('Saved theme "' + working.name + '". Pick it any time from Preferences: Color Theme.', 'success');
    }
    function exportCurrent() {
      working.name = nameInput.value.trim() || working.name;
      working.type = typeSelect.value;
      const json = JSON.stringify({ name: working.name, type: working.type, ui: working.ui, tokens: working.tokens }, null, 2);
      SC.util.download(working.name.replace(/[^\w-]+/g, '-').toLowerCase() + '.theme.json', json, 'application/json');
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    }
    typeSelect.addEventListener('change', () => { working.type = typeSelect.value; live(); });

    renderGrid();
    SC.overlay.root().append(backdrop, dialog);
    SC.overlay.push();
    window.addEventListener('keydown', onKey, true);
    nameInput.focus();
  }

  SC.dialog = { confirm, promptText, themeEditor };
})(window.SC);
