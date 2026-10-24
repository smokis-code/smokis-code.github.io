/* ==========================================================================
   statusbar.js — the strip at the bottom: cursor position, indentation,
   line endings, language mode and theme. Most items are clickable.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  let bar;
  const items = {};
  let messageTimer = null;

  function item(id, { title, onClick, optional = false, icon } = {}) {
    const node = el(onClick ? 'button' : 'span', {
      class: 'status-item' + (optional ? ' optional' : ''), type: onClick ? 'button' : null, title,
    });
    if (icon) node.append(SC.icons.make(icon));
    const label = el('span');
    node.append(label);
    if (onClick) node.addEventListener('click', onClick);
    items[id] = { node, label };
    return node;
  }

  function init() {
    bar = document.getElementById('statusbar');
    bar.append(
      item('files', { title: 'Show Explorer', icon: 'files', onClick: () => SC.commands.run('view.explorer') }),
      item('message', {}),
      el('div', { class: 'status-spacer' }),
      item('cursor', { title: 'Go to Line (Ctrl+G)', onClick: () => SC.commands.run('editor.goToLine') }),
      item('indent', { title: 'Select Indentation', onClick: () => SC.commands.run('editor.changeIndent'), optional: true }),
      item('encoding', { title: 'Encoding', optional: true }),
      item('eol', { title: 'Select End of Line Sequence', onClick: () => SC.commands.run('editor.changeEol'), optional: true }),
      item('language', { title: 'Select Language Mode', icon: 'brackets', onClick: () => SC.commands.run('editor.changeLanguage') }),
      item('theme', { title: 'Color Theme', icon: 'palette', onClick: () => SC.commands.run('theme.select'), optional: true }),
      item('bell', { title: 'Notifications', icon: 'bell', onClick: () => SC.notify('No new notifications.', 'info', 2500) }));

    SC.tabs.on('active', update);
    SC.tabs.on('cursor', updateCursor);
    SC.tabs.on('language', update);
    SC.tabs.on('change', updateEol);
    SC.tabs.on('dirty', update);
    SC.tabs.on('save', update);
    SC.fs.on('change', updateFiles);
    SC.themes.on('change', update);
    SC.settings.on('change', update);
    update();
    updateFiles();
  }

  function updateFiles() {
    const n = SC.fs.stats().files;
    items.files.label.textContent = n + ' file' + (n === 1 ? '' : 's');
  }

  function updateCursor() {
    const ed = SC.tabs.activeEditor();
    if (!ed) return;
    const c = ed.cursor();
    items.cursor.label.textContent = 'Ln ' + c.line + ', Col ' + c.col + (c.selected ? ' (' + c.selected + ' selected)' : '');
  }

  function updateEol() {
    const ed = SC.tabs.activeEditor();
    if (!ed) return;
    items.eol.label.textContent = ed.value.includes('\r\n') ? 'CRLF' : 'LF';
  }

  function update() {
    const doc = SC.tabs.activeDoc();
    const show = !!doc;
    ['cursor', 'indent', 'encoding', 'eol', 'language'].forEach((k) => { items[k].node.hidden = !show; });
    if (doc) {
      updateCursor();
      updateEol();
      const s = SC.settings.all();
      items.indent.label.textContent = (s.insertSpaces ? 'Spaces: ' : 'Tab Size: ') + s.tabSize;
      items.encoding.label.textContent = 'UTF-8';
      items.language.label.textContent = (SC.languages.byId[doc.langId] || SC.languages.byId.plaintext).name;
    }
    items.theme.label.textContent = SC.themes.current().name;
    const label = document.getElementById('command-center-label');
    if (label) label.textContent = doc ? doc.title + ' — Smoki\'s Code' : 'Smoki\'s Code';
    document.title = (doc ? (doc.dirty ? '● ' : '') + doc.title + ' — ' : '') + 'Smoki\'s Code';
  }

  /** Show a short message on the left of the status bar. */
  function message(text, ms = 0) {
    if (!items.message) return;
    items.message.label.textContent = text || '';
    clearTimeout(messageTimer);
    if (ms) messageTimer = setTimeout(() => { items.message.label.textContent = ''; }, ms);
  }

  SC.statusbar = { init, update, message };
})(window.SC);
