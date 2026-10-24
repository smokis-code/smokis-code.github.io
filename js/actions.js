/* ==========================================================================
   actions.js — registers every command with its title and shortcut.
   This is the one place to look for "what does Ctrl+X do?".

   Note: browsers reserve some shortcuts (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab),
   so those actions use Alt-based shortcuts instead.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { basename } = SC.util;

  /** Run fn with the active editor, or explain that a file must be open. */
  function withEditor(fn) {
    return () => {
      const ed = SC.tabs.activeEditor();
      if (!ed) { SC.notify('Open a file first.', 'info'); return; }
      return fn(ed, SC.tabs.activeDoc());
    };
  }

  function sidebarShowsExplorer() {
    const wb = document.querySelector('.workbench');
    return !wb.classList.contains('sidebar-hidden') && window.innerWidth > 760;
  }

  async function promptNew(kind) {
    const dir = SC.explorer.targetFolder();
    const value = dir ? dir + '/' : '';
    const path = await SC.palette.prompt({
      placeholder: kind === 'folder' ? 'Folder path, e.g. src/components' : 'File path, e.g. src/app.js',
      value,
      prompt: kind === 'folder' ? 'Type a name for the new folder and press Enter' : 'Type a name for the new file (folders are created as needed) and press Enter',
      validate: (v) => {
        if (!v || v.endsWith('/')) return null;
        const err = SC.fs.validatePath(v);
        if (err) return err;
        if (SC.fs.exists(v)) return 'A file or folder "' + basename(v) + '" already exists. Choose a different name.';
        return null;
      },
    });
    if (!path || !SC.util.normPath(path)) return;
    if (kind === 'folder') {
      const p = SC.fs.createFolder(path);
      SC.explorer.reveal(p, { expand: true });
    } else {
      const p = SC.fs.createFile(path, '');
      SC.explorer.reveal(p);
      SC.tabs.open(p);
    }
  }

  function zoom(delta) {
    const size = delta === 0 ? SC.settings.DEFAULTS.fontSize : SC.util.clamp(SC.settings.get('fontSize') + delta, 8, 40);
    SC.settings.set('fontSize', size);
    SC.statusbar.message('Editor font size: ' + size + 'px', 1500);
  }

  async function pickTheme() {
    const original = SC.themes.current();
    const themes = SC.themes.list();
    const light = themes.filter((t) => t.type === 'light');
    const dark = themes.filter((t) => t.type !== 'light');
    const items = [
      { label: 'Customize Current Theme...', icon: 'edit', action: 'customize', group: '' },
      { label: 'Import Theme from File...', icon: 'upload', action: 'import' },
      ...light.map((t) => ({ label: t.name, theme: t, swatch: t.ui.bg, description: SC.themes.isCustom(t.id) ? 'Custom' : '', group: 'light themes' })),
      ...dark.map((t) => ({ label: t.name, theme: t, swatch: t.ui.bg, description: SC.themes.isCustom(t.id) ? 'Custom' : '', group: 'dark themes' })),
    ];
    const activeIndex = Math.max(0, items.findIndex((i) => i.theme && i.theme.id === original.id));
    const chosen = await SC.palette.pick(items, {
      placeholder: 'Select Color Theme (Up/Down keys to preview)',
      activeIndex,
      onFocus: (item) => { if (item && item.theme) SC.themes.apply(item.theme, { persist: false }); },
    });
    if (!chosen) { SC.themes.apply(original.id); return; }
    if (chosen.action === 'customize') { SC.themes.apply(original.id); SC.dialog.themeEditor(); return; }
    if (chosen.action === 'import') { SC.themes.apply(original.id); importTheme(); return; }
    SC.themes.apply(chosen.theme.id);
  }

  async function importTheme() {
    const [file] = await SC.util.pickFiles({ multiple: false, accept: '.json,application/json' });
    if (!file) return;
    try {
      const id = SC.themes.importJson(await file.text());
      SC.themes.apply(id);
      SC.notify('Imported theme "' + SC.themes.get(id).name + '".', 'success');
    } catch (err) {
      SC.notify('Could not import theme: ' + err.message, 'error');
    }
  }

  async function deleteTheme() {
    const custom = SC.themes.list().filter((t) => SC.themes.isCustom(t.id));
    if (!custom.length) { SC.notify('You have no custom themes yet. Use "Preferences: Customize Current Theme" to make one.', 'info'); return; }
    const item = await SC.palette.pick(custom.map((t) => ({ label: t.name, id: t.id, swatch: t.ui.bg })), { placeholder: 'Select a custom theme to delete' });
    if (!item) return;
    SC.themes.deleteCustom(item.id);
    SC.notify('Deleted theme "' + item.label + '".', 'success');
  }

  async function changeLanguage() {
    const doc = SC.tabs.activeDoc();
    if (!doc) { SC.notify('Open a file first.', 'info'); return; }
    const items = [];
    if (doc.path) items.push({ label: 'Auto Detect', description: 'Use the file extension', auto: true });
    SC.languages.all.forEach((l) => items.push({ label: l.name, description: l.id === doc.langId ? '(current)' : '.' + (l.exts[0] || ''), id: l.id }));
    const chosen = await SC.palette.pick(items, { placeholder: 'Select Language Mode', activeIndex: items.findIndex((i) => i.id === doc.langId) });
    if (!chosen) return;
    SC.tabs.setLanguage(chosen.auto ? SC.languages.forPath(doc.path).id : chosen.id, doc);
  }

  async function changeIndent() {
    const s = SC.settings.all();
    const items = [
      { label: 'Indent Using Spaces', spaces: true },
      { label: 'Indent Using Tabs', spaces: false },
      ...[2, 4, 8].map((n) => ({ label: 'Tab Size: ' + n, size: n, description: n === s.tabSize ? '(current)' : '' })),
      { label: 'Convert Indentation to Spaces', convert: 'spaces' },
      { label: 'Convert Indentation to Tabs', convert: 'tabs' },
    ];
    const chosen = await SC.palette.pick(items, { placeholder: 'Select action' });
    if (!chosen) return;
    if (chosen.spaces != null) SC.settings.set('insertSpaces', chosen.spaces);
    if (chosen.size) SC.settings.set('tabSize', chosen.size);
    if (chosen.convert) {
      const ed = SC.tabs.activeEditor();
      if (!ed) return;
      const tab = s.tabSize;
      const v = ed.value;
      const out = chosen.convert === 'spaces'
        ? v.replace(/^\t+/gm, (m) => ' '.repeat(m.length * tab))
        : v.replace(/^( +)/gm, (m) => '\t'.repeat(Math.floor(m.length / tab)) + ' '.repeat(m.length % tab));
      if (out !== v) ed.replaceRange(0, v.length, out, 0, 0);
    }
  }

  async function changeEol() {
    const ed = SC.tabs.activeEditor();
    if (!ed) return;
    const chosen = await SC.palette.pick([{ label: 'LF', eol: '\n', description: 'Linux / macOS' }, { label: 'CRLF', eol: '\r\n', description: 'Windows' }], { placeholder: 'Select End of Line Sequence' });
    if (!chosen) return;
    const v = ed.value;
    const out = v.replace(/\r?\n/g, chosen.eol);
    if (out !== v) ed.replaceRange(0, v.length, out, 0, 0);
  }

  async function resetWorkspace() {
    const choice = await SC.dialog.confirm({
      title: 'Reset the whole workspace?',
      message: 'Every file and folder in the workspace will be deleted. Export it as a ZIP first if you want to keep a copy. This can\'t be undone.',
      buttons: [
        { label: 'Delete Everything', value: 'delete', danger: true },
        { label: 'Cancel', value: 'cancel', primary: true },
      ],
    });
    if (choice !== 'delete') return;
    for (const doc of SC.tabs.docs()) await SC.tabs.close(doc.key, { force: true });
    SC.fs.reset();
    SC.storage.set('recentFiles', []);
    SC.tabs.showWelcome();
    SC.notify('Workspace cleared.', 'success');
  }

  function showShortcuts() {
    const items = SC.commands.list()
      .filter((c) => SC.commands.keyFor(c.id))
      .map((c) => ({ label: SC.commands.label(c), keybinding: SC.commands.keyFor(c.id), id: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    SC.palette.pick(items, { placeholder: 'Keyboard shortcuts (select one to run it)' }).then((item) => { if (item) SC.commands.run(item.id); });
  }

  function register() {
    const R = SC.commands.register;

    /* Workbench */
    R({ id: 'workbench.commandPalette', category: 'View', title: 'Command Palette...', keybinding: ['Ctrl+Shift+P', 'F1'], run: () => SC.palette.open('>') });
    R({ id: 'workbench.quickOpen', category: 'Go', title: 'Go to File...', keybinding: 'Ctrl+P', run: () => SC.palette.open('') });

    /* File */
    R({ id: 'file.newFile', category: 'File', title: 'New File...', keybinding: 'Alt+N', run: () => (sidebarShowsExplorer() ? SC.explorer.startCreate('newFile') : promptNew('file')) });
    R({ id: 'file.newUntitled', category: 'File', title: 'New Untitled Text File', keybinding: 'Ctrl+Alt+N', run: () => SC.tabs.newUntitled() });
    R({ id: 'file.newFolder', category: 'File', title: 'New Folder...', keybinding: 'Alt+Shift+N', run: () => (sidebarShowsExplorer() ? SC.explorer.startCreate('newFolder') : promptNew('folder')) });
    R({ id: 'file.openFile', category: 'File', title: 'Open File...', keybinding: 'Ctrl+O', run: () => SC.fileio.openFiles() });
    R({ id: 'file.openFolder', category: 'File', title: 'Open Folder...', keybinding: 'Ctrl+K Ctrl+O', run: () => SC.fileio.openFolder() });
    R({ id: 'file.save', category: 'File', title: 'Save', keybinding: 'Ctrl+S', run: () => (SC.tabs.activeDoc() ? SC.tabs.save() : SC.notify('Nothing to save.', 'info')) });
    R({ id: 'file.saveAs', category: 'File', title: 'Save As...', keybinding: 'Ctrl+Shift+S', run: () => (SC.tabs.activeDoc() ? SC.tabs.saveAs() : SC.notify('Nothing to save.', 'info')) });
    R({ id: 'file.saveAll', category: 'File', title: 'Save All', keybinding: 'Ctrl+Alt+S', run: () => SC.tabs.saveAll() });
    R({ id: 'file.revert', category: 'File', title: 'Revert File', run: withEditor((ed, doc) => { ed.replaceRange(0, ed.value.length, doc.savedValue, 0, 0); }) });
    R({ id: 'file.download', category: 'File', title: 'Download Current File', run: () => SC.fileio.downloadActive() });
    R({ id: 'file.renameActive', category: 'File', title: 'Rename Current File...', run: withEditor((ed, doc) => (doc.path ? SC.explorer.startRename(doc.path) : SC.tabs.saveAs())) });
    R({ id: 'file.deleteActive', category: 'File', title: 'Delete Current File', run: withEditor((ed, doc) => (doc.path ? SC.explorer.remove(doc.path) : SC.tabs.close(doc.key))) });
    R({ id: 'file.copyPath', category: 'File', title: 'Copy Path of Active File', run: withEditor((ed, doc) => SC.tabs.copyText(doc.path || doc.title)) });
    R({ id: 'workspace.exportZip', category: 'File', title: 'Export Workspace as ZIP', run: () => SC.fileio.exportZip('') });
    R({ id: 'workspace.reset', category: 'File', title: 'Reset Workspace...', run: resetWorkspace });

    /* Editors / tabs */
    R({ id: 'editor.close', category: 'View', title: 'Close Editor', keybinding: 'Alt+W', run: () => SC.tabs.close() });
    R({ id: 'editor.closeAll', category: 'View', title: 'Close All Editors', keybinding: 'Ctrl+K Ctrl+W', run: () => SC.tabs.closeAll() });
    R({ id: 'editor.closeOthers', category: 'View', title: 'Close Other Editors', run: withEditor((ed, doc) => SC.tabs.closeAll({ except: doc.key })) });
    R({ id: 'editor.next', category: 'View', title: 'Open Next Editor', keybinding: 'Alt+PageDown', run: () => SC.tabs.cycle(1) });
    R({ id: 'editor.previous', category: 'View', title: 'Open Previous Editor', keybinding: 'Alt+PageUp', run: () => SC.tabs.cycle(-1) });
    R({ id: 'editor.goToLine', category: 'Go', title: 'Go to Line/Column...', keybinding: 'Ctrl+G', run: () => SC.palette.open(':') });
    R({ id: 'editor.changeLanguage', category: 'Editor', title: 'Change Language Mode', keybinding: 'Ctrl+K M', run: changeLanguage });
    R({ id: 'editor.changeIndent', category: 'Editor', title: 'Change Indentation', run: changeIndent });
    R({ id: 'editor.changeEol', category: 'Editor', title: 'Change End of Line Sequence', run: changeEol });

    /* Edit */
    R({ id: 'edit.undo', category: 'Edit', title: 'Undo', displayKey: 'Ctrl+Z', run: withEditor((ed) => { ed.focus(); document.execCommand('undo'); }) });
    R({ id: 'edit.redo', category: 'Edit', title: 'Redo', displayKey: 'Ctrl+Y', run: withEditor((ed) => { ed.focus(); document.execCommand('redo'); }) });
    R({ id: 'edit.selectAll', category: 'Selection', title: 'Select All', displayKey: 'Ctrl+A', run: withEditor((ed) => { ed.focus(); ed.ta.select(); }) });
    R({ id: 'edit.find', category: 'Edit', title: 'Find', keybinding: 'Ctrl+F', when: 'editor', run: () => SC.find.open(false) });
    R({ id: 'edit.replace', category: 'Edit', title: 'Replace', keybinding: 'Ctrl+H', when: 'editor', run: () => SC.find.open(true) });
    R({ id: 'edit.findNext', category: 'Edit', title: 'Find Next', keybinding: 'F3', when: 'editor', run: () => SC.find.next() });
    R({ id: 'edit.findPrevious', category: 'Edit', title: 'Find Previous', keybinding: 'Shift+F3', when: 'editor', run: () => SC.find.prev() });
    R({ id: 'edit.toggleComment', category: 'Edit', title: 'Toggle Line Comment', keybinding: 'Ctrl+/', when: 'editorFocus', run: withEditor((ed) => ed.toggleComment()) });
    R({ id: 'edit.duplicateLine', category: 'Edit', title: 'Duplicate Line', run: withEditor((ed) => ed.copyLines(1)) });
    R({ id: 'edit.copyLineDown', category: 'Selection', title: 'Copy Line Down', keybinding: 'Shift+Alt+Down', when: 'editorFocus', run: withEditor((ed) => ed.copyLines(1)) });
    R({ id: 'edit.copyLineUp', category: 'Selection', title: 'Copy Line Up', keybinding: 'Shift+Alt+Up', when: 'editorFocus', run: withEditor((ed) => ed.copyLines(-1)) });
    R({ id: 'edit.moveLineDown', category: 'Selection', title: 'Move Line Down', keybinding: 'Alt+Down', when: 'editorFocus', run: withEditor((ed) => ed.moveLines(1)) });
    R({ id: 'edit.moveLineUp', category: 'Selection', title: 'Move Line Up', keybinding: 'Alt+Up', when: 'editorFocus', run: withEditor((ed) => ed.moveLines(-1)) });
    R({ id: 'edit.deleteLine', category: 'Edit', title: 'Delete Line', keybinding: 'Ctrl+Shift+K', when: 'editorFocus', run: withEditor((ed) => ed.deleteLines()) });
    R({ id: 'edit.insertLineBelow', category: 'Edit', title: 'Insert Line Below', keybinding: 'Ctrl+Enter', when: 'editorFocus', run: withEditor((ed) => ed.insertLineBelow()) });
    R({ id: 'edit.selectLine', category: 'Selection', title: 'Expand Line Selection', keybinding: 'Ctrl+L', when: 'editorFocus', run: withEditor((ed) => ed.selectLine()) });
    R({ id: 'edit.indent', category: 'Edit', title: 'Indent Line', keybinding: 'Ctrl+]', when: 'editorFocus', run: withEditor((ed) => ed.indent()) });
    R({ id: 'edit.outdent', category: 'Edit', title: 'Outdent Line', keybinding: 'Ctrl+[', when: 'editorFocus', run: withEditor((ed) => ed.outdent()) });
    R({ id: 'edit.sortLines', category: 'Edit', title: 'Sort Lines Ascending', run: withEditor((ed) => ed.transformSelection((t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'), true)) });
    R({ id: 'edit.sortLinesDesc', category: 'Edit', title: 'Sort Lines Descending', run: withEditor((ed) => ed.transformSelection((t) => t.split('\n').sort((a, b) => b.localeCompare(a)).join('\n'), true)) });
    R({ id: 'edit.upperCase', category: 'Edit', title: 'Transform to Uppercase', run: withEditor((ed) => ed.transformSelection((t) => t.toUpperCase())) });
    R({ id: 'edit.lowerCase', category: 'Edit', title: 'Transform to Lowercase', run: withEditor((ed) => ed.transformSelection((t) => t.toLowerCase())) });
    R({ id: 'edit.trimWhitespace', category: 'Edit', title: 'Trim Trailing Whitespace', run: withEditor((ed) => { if (!ed.trimTrailingWhitespace()) SC.statusbar.message('No trailing whitespace found', 1800); }) });

    /* Explorer */
    R({ id: 'explorer.rename', category: 'Explorer', title: 'Rename Selected', keybinding: 'F2', when: 'explorerFocus', run: () => SC.explorer.startRename() });
    R({ id: 'explorer.delete', category: 'Explorer', title: 'Delete Selected', keybinding: 'Delete', when: 'explorerFocus', run: () => SC.explorer.remove() });
    R({ id: 'explorer.collapse', category: 'Explorer', title: 'Collapse Folders in Explorer', run: () => SC.explorer.collapseAll() });
    R({ id: 'explorer.revealActive', category: 'Explorer', title: 'Reveal Active File in Explorer', run: withEditor((ed, doc) => doc.path && SC.explorer.reveal(doc.path)) });

    /* View */
    R({ id: 'view.explorer', category: 'View', title: 'Show Explorer', keybinding: 'Ctrl+Shift+E', run: () => { SC.app.showView('explorer'); SC.explorer.focus(); } });
    R({ id: 'view.search', category: 'View', title: 'Show Search', run: () => SC.search.focus() });
    R({ id: 'search.focus', category: 'Search', title: 'Find in Files', keybinding: 'Ctrl+Shift+F', run: () => SC.search.focus() });
    R({ id: 'view.settings', category: 'Preferences', title: 'Open Settings', keybinding: 'Ctrl+,', run: () => SC.app.showView('settings') });
    R({ id: 'view.toggleSidebar', category: 'View', title: 'Toggle Primary Side Bar Visibility', keybinding: 'Ctrl+B', run: () => SC.app.toggleSidebar() });
    R({ id: 'view.togglePanel', category: 'View', title: 'Toggle Panel Visibility', keybinding: ['Ctrl+J', 'Ctrl+`'], run: () => SC.panel.toggle() });
    R({ id: 'view.zoomIn', category: 'View', title: 'Zoom In (editor font size)', keybinding: 'Ctrl+=', run: () => zoom(1) });
    R({ id: 'view.zoomOut', category: 'View', title: 'Zoom Out (editor font size)', keybinding: 'Ctrl+-', run: () => zoom(-1) });
    R({ id: 'view.zoomReset', category: 'View', title: 'Reset Zoom', keybinding: 'Ctrl+0', run: () => zoom(0) });
    R({ id: 'view.toggleLineNumbers', category: 'View', title: 'Toggle Line Numbers', run: () => SC.settings.set('lineNumbers', !SC.settings.get('lineNumbers')) });
    R({ id: 'view.toggleAutoSave', category: 'File', title: 'Toggle Auto Save', run: () => { SC.settings.set('autoSave', !SC.settings.get('autoSave')); SC.notify('Auto Save is ' + (SC.settings.get('autoSave') ? 'on' : 'off') + '.', 'info', 2000); } });

    /* Themes */
    R({ id: 'theme.select', category: 'Preferences', title: 'Color Theme', keybinding: 'Ctrl+K Ctrl+T', run: pickTheme });
    R({ id: 'theme.customize', category: 'Preferences', title: 'Customize Current Theme...', run: () => SC.dialog.themeEditor() });
    R({ id: 'theme.import', category: 'Preferences', title: 'Import Color Theme from File...', run: importTheme });
    R({ id: 'theme.export', category: 'Preferences', title: 'Export Current Color Theme', run: () => { const t = SC.themes.current(); SC.util.download(t.id + '.theme.json', SC.themes.exportJson(t.id), 'application/json'); } });
    R({ id: 'theme.delete', category: 'Preferences', title: 'Delete Custom Color Theme...', run: deleteTheme });

    /* Run */
    R({ id: 'run.file', category: 'Run', title: 'Run Active File', keybinding: 'F5', run: () => SC.runner.run() });
    R({ id: 'run.stop', category: 'Run', title: 'Stop Running Program', keybinding: 'Shift+F5', run: () => SC.runner.stop() });
    R({ id: 'run.previewHtml', category: 'Run', title: 'Preview HTML File', run: withEditor((ed, doc) => SC.panel.previewHtml(ed.value, doc.path)) });
    R({ id: 'panel.clear', category: 'Run', title: 'Clear Output', run: () => SC.panel.clear() });
    /* Help */
    R({ id: 'help.welcome', category: 'Help', title: 'Welcome', run: () => { SC.welcome.render(); SC.tabs.closeAll(); } });
    R({ id: 'help.shortcuts', category: 'Help', title: 'Keyboard Shortcuts Reference', keybinding: 'Ctrl+K Ctrl+S', run: showShortcuts });
    R({
      id: 'help.about', category: 'Help', title: 'About',
      run: () => SC.dialog.confirm({
        title: 'Smoki\'s Code 1.0',
        message: 'A code editor that runs entirely in your browser: syntax highlighting for ' + (SC.languages.all.length - 1) + ' languages, ' + SC.themes.BUILT_IN.length + ' color themes plus your own, a file explorer and a command palette. F5 runs 12 languages: six in the browser and six compiled on godbolt.org. Your files are stored in this browser.',
        buttons: [{ label: 'OK', value: 'ok', primary: true }],
        cancelValue: 'ok',
      }),
    });
  }

  SC.actions = { register };
})(window.SC);
