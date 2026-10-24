/* ==========================================================================
   settings-view.js — the "Settings" sidebar view (gear icon / Ctrl+,).
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  let list;

  function init() {
    const view = document.getElementById('view-settings');
    list = el('div', { class: 'settings-list' });
    view.append(
      el('div', { class: 'view-header' }, el('span', { text: 'Settings' })),
      el('div', { class: 'view-body' }, list));
    render();
    SC.settings.on('change', render);
    SC.themes.on('change', render);
    SC.themes.on('list', render);
  }

  function setting(title, cat, desc, control) {
    return el('div', { class: 'setting' },
      el('div', { class: 'setting-title' }, el('span', { class: 'cat', text: cat + ': ' }), title),
      desc ? el('div', { class: 'setting-desc', text: desc }) : null,
      control);
  }

  function select(id, options, value, onChange) {
    const s = el('select', { id });
    for (const [v, label] of options) s.append(el('option', { value: v, text: label }));
    s.value = String(value);
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  function number(id, value, min, max, onChange) {
    const n = el('input', { type: 'number', id, value: String(value), min: String(min), max: String(max), style: { width: '90px' } });
    n.addEventListener('change', () => {
      const v = SC.util.clamp(Number(n.value) || min, min, max);
      n.value = v;
      onChange(v);
    });
    return n;
  }

  function check(id, label, key) {
    const box = el('input', { type: 'checkbox', id });
    box.checked = !!SC.settings.get(key);
    box.addEventListener('change', () => SC.settings.set(key, box.checked));
    return el('label', { class: 'check', for: id }, box, el('span', { text: label }));
  }

  function render() {
    if (!list) return;
    const active = document.activeElement;
    const activeId = active && list.contains(active) ? active.id : null;
    const s = SC.settings.all();
    list.textContent = '';

    list.append(
      setting('Color Theme', 'Workbench', 'Specifies the color theme used in the workbench.',
        el('div', { class: 'row' },
          select('set-theme', SC.themes.list().map((t) => [t.id, t.name]), SC.themes.current().id, (v) => SC.themes.apply(v)),
          el('button', { class: 'btn', type: 'button', text: 'Customize...', onClick: () => SC.commands.run('theme.customize') }),
          el('button', { class: 'btn', type: 'button', text: 'Import...', onClick: () => SC.commands.run('theme.import') }))),
      setting('Font Size', 'Editor', 'Controls the font size in pixels.',
        number('set-font-size', s.fontSize, 8, 40, (v) => SC.settings.set('fontSize', v))),
      setting('Font Family', 'Editor', 'Controls the font family. Fonts you have not installed fall back to the next one in the list.',
        select('set-font-family', Object.keys(SC.settings.FONT_STACKS).map((f) => [f, f]), s.fontFamily, (v) => SC.settings.set('fontFamily', v))),
      setting('Tab Size', 'Editor', 'The number of spaces a tab is equal to.',
        select('set-tab-size', [[2, '2'], [4, '4'], [8, '8']], s.tabSize, (v) => SC.settings.set('tabSize', Number(v)))),
      setting('Insert Spaces', 'Editor', null, check('set-insert-spaces', 'Insert spaces when pressing Tab (turn off to insert tab characters).', 'insertSpaces')),
      setting('Auto Closing Brackets', 'Editor', null, check('set-auto-close', 'Automatically close brackets, quotes and HTML tags after you type the opening one.', 'autoCloseBrackets')),
      setting('Line Numbers', 'Editor', null, check('set-line-numbers', 'Show line numbers in the gutter.', 'lineNumbers')),
      setting('Highlight Active Line', 'Editor', null, check('set-active-line', 'Highlight the line the cursor is on.', 'highlightActiveLine')),
      setting('Auto Save', 'Files', null, check('set-auto-save', 'Save files automatically shortly after you stop typing.', 'autoSave')),
      setting('Trim Trailing Whitespace', 'Files', null, check('set-trim', 'Remove trailing spaces from every line when saving.', 'trimTrailingWhitespaceOnSave')),
      setting('Confirm Delete', 'Explorer', null, check('set-confirm-delete', 'Ask before deleting a file or folder.', 'confirmDelete')),
      setting('Storage', 'Workspace', storageText(), el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', text: 'Export workspace as ZIP', onClick: () => SC.commands.run('workspace.exportZip') }),
        el('button', { class: 'btn', type: 'button', text: 'Reset settings', onClick: () => SC.settings.reset() }))));

    if (activeId) {
      const again = document.getElementById(activeId);
      if (again) again.focus();
    }
  }

  function storageText() {
    const st = SC.fs.stats();
    const where = SC.storage.available ? 'saved in this browser\'s local storage' : 'kept in memory only (this browser blocks storage), so export before closing the tab';
    return 'Your workspace has ' + st.files + ' file' + (st.files === 1 ? '' : 's') + ' (' + SC.util.formatBytes(st.bytes) + '), ' + where + '.';
  }

  SC.settingsView = { init, render };
})(window.SC);
