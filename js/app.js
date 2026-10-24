/* ==========================================================================
   app.js — starts Smoki's Code: loads saved state, builds the UI and
   connects the activity bar, sidebar and title bar buttons.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { $, $$ } = SC.util;
  let currentView = SC.storage.get('view', 'explorer');

  function showView(name) {
    const wb = $('.workbench');
    wb.classList.remove('sidebar-hidden');
    currentView = name;
    SC.storage.set('view', name);
    SC.storage.set('sidebarHidden', false);
    $$('.sidebar-view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    $$('.activity-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $('#tb-toggle-sidebar').classList.add('active');
  }

  function toggleSidebar(force) {
    const wb = $('.workbench');
    const hide = force != null ? force : !wb.classList.contains('sidebar-hidden');
    wb.classList.toggle('sidebar-hidden', hide);
    SC.storage.set('sidebarHidden', hide);
    $$('.activity-btn[data-view]').forEach((b) => b.classList.toggle('active', !hide && b.dataset.view === currentView));
    $('#tb-toggle-sidebar').classList.toggle('active', !hide);
    if (hide) { const ed = SC.tabs.activeEditor(); if (ed) ed.focus(); }
  }

  function isNarrow() { return window.innerWidth <= 760; }

  function initSidebarSash() {
    const sash = $('#sidebar-sash');
    const wb = $('.workbench');
    const saved = SC.storage.get('sidebarWidth', null);
    if (saved) wb.style.setProperty('--sidebar-width', saved + 'px');
    sash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sash.setPointerCapture(e.pointerId);
      sash.classList.add('dragging');
      const startX = e.clientX;
      const startW = $('#sidebar').getBoundingClientRect().width;
      const move = (ev) => {
        const w = SC.util.clamp(startW + ev.clientX - startX, 170, window.innerWidth * 0.6);
        wb.style.setProperty('--sidebar-width', w + 'px');
      };
      const up = () => {
        sash.classList.remove('dragging');
        sash.removeEventListener('pointermove', move);
        sash.removeEventListener('pointerup', up);
        SC.storage.set('sidebarWidth', Math.round($('#sidebar').getBoundingClientRect().width));
      };
      sash.addEventListener('pointermove', move);
      sash.addEventListener('pointerup', up);
    });
  }

  function bindChrome() {
    $$('.activity-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action) { SC.commands.run(btn.dataset.action); return; }
        const wb = $('.workbench');
        if (btn.dataset.view === currentView && !wb.classList.contains('sidebar-hidden')) toggleSidebar(true);
        else {
          showView(btn.dataset.view);
          if (btn.dataset.view === 'search') SC.search.focus();
        }
      });
    });
    $('#tb-toggle-sidebar').addEventListener('click', () => toggleSidebar());
    $('#tb-toggle-panel').addEventListener('click', () => SC.panel.toggle());
    $('#command-center').addEventListener('click', () => SC.palette.open(''));
    $('#run-btn').addEventListener('click', () => SC.commands.run('run.file'));
    $('#tabs-more').addEventListener('click', (e) => {
      SC.menu.show([
        { command: 'file.save' }, { command: 'file.saveAll' }, '-',
        { command: 'editor.closeOthers' }, { command: 'editor.closeAll' }, '-',
        { command: 'editor.changeLanguage' }, { command: 'file.download' }, { command: 'explorer.revealActive' },
      ], { anchor: e.currentTarget });
    });

    // On phones the sidebar floats over the editor: close it after opening a file
    SC.tabs.on('active', () => { if (isNarrow() && !$('.workbench').classList.contains('sidebar-hidden')) toggleSidebar(true); });

    // Drop files from the computer anywhere on the editor area to import them
    const editors = $('#editors');
    editors.addEventListener('dragover', (e) => {
      if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    editors.addEventListener('drop', async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      const created = await SC.fileio.importDataTransfer(e.dataTransfer, SC.explorer.targetFolder());
      if (created.length > 1) SC.tabs.open(created[0]);
    });
    // Ignore drops elsewhere so the browser doesn't navigate away to the file
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  function start() {
    SC.settings.applyCss();
    SC.themes.apply(SC.themes.current().id, { persist: false });
    SC.icons.hydrate(document);

    SC.actions.register();
    SC.commands.install();
    SC.menu.buildMenubar($('#menubar'));

    const firstRun = !SC.storage.get('fs', null);
    SC.fs.load(() => SC.seed.seed());

    SC.tabs.init();
    SC.explorer.init();
    SC.search.init();
    SC.settingsView.init();
    SC.panel.init();
    SC.runner.init();
    SC.statusbar.init();
    bindChrome();
    initSidebarSash();

    showView(['explorer', 'search', 'settings'].includes(currentView) ? currentView : 'explorer');
    if (SC.storage.get('sidebarHidden', false) || isNarrow()) toggleSidebar(true);

    const restored = SC.tabs.restoreSession();
    if (!restored) {
      if (firstRun && SC.fs.isFile('my-project/README.md')) {
        SC.explorer.reveal('my-project', { expand: true });
        SC.tabs.open('my-project/main.py', { focus: false });
        SC.tabs.open('my-project/README.md', { focus: false });
        if (isNarrow()) toggleSidebar(true);
      } else {
        SC.tabs.showWelcome();
      }
    }
    SC.welcome.render();
    SC.statusbar.update();
    if (!SC.storage.available) {
      SC.notify('This browser blocks local storage, so your files only last until you close the tab. Use File > Export Workspace as ZIP to keep them.', 'warn', 10000);
    }
  }

  SC.app = { showView, toggleSidebar, start };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.SC);
