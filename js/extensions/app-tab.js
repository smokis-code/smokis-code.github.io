/* ==========================================================================
   extensions/app-tab.js — the App window: a pane on the right of the code
   where program windows open (a small "desktop"). Shared by the Tkinter and
   the C Graphics extensions. It can be used while at least one of them is on.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  let side;      // the #app-side section next to the editor
  let sash;      // drag handle between the code and the App window
  let pane;
  let desk;
  let emptyEl;
  let statusEl;
  const users = new Set();
  const statuses = new Map();

  function build() {
    side = document.getElementById('app-side');
    sash = document.getElementById('app-sash');
    emptyEl = el('div', { class: 'app-empty' },
      el('p', { text: 'Program windows open here.' }),
      el('p', { class: 'app-hint', text: 'Run a Python program that uses tkinter, or a C program that uses raylib, GLUT or GLFW (install them with pacman in the MSYS2 terminal), and its window appears here.' }));
    desk = el('div', { class: 'app-desk' }, emptyEl);
    statusEl = el('span', { class: 'app-status' });
    pane = el('div', { class: 'app-pane' },
      el('div', { class: 'app-side-header' },
        el('span', { class: 'app-side-title', text: 'App' }), statusEl, el('div', { class: 'spacer' }),
        el('button', { class: 'icon-btn stop-btn', type: 'button', title: 'Close the program (Shift+F5)', 'data-icon': 'stop', onClick: () => { if (SC.runner.isRunning()) SC.runner.stop(); } }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Hide the App window', 'data-icon': 'close', onClick: hide })),
      desk);
    side.append(pane);
    SC.icons.hydrate(pane);
    const w = SC.storage.get('appWidth', null);
    if (w) document.querySelector('.workbench').style.setProperty('--app-width', w + 'px');
    initSash();
  }

  /** Drag the handle to make the App window wider or narrower. */
  function initSash() {
    sash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sash.setPointerCapture(e.pointerId);
      sash.classList.add('dragging');
      side.classList.add('resizing'); // canvases and frames would swallow the pointer
      const startX = e.clientX;
      const startW = side.getBoundingClientRect().width;
      const row = side.parentNode.getBoundingClientRect().width;
      const move = (ev) => {
        const w = SC.util.clamp(startW + (startX - ev.clientX), 240, row - 200);
        document.querySelector('.workbench').style.setProperty('--app-width', w + 'px');
      };
      const up = () => {
        sash.classList.remove('dragging');
        side.classList.remove('resizing');
        sash.removeEventListener('pointermove', move);
        sash.removeEventListener('pointerup', up);
        SC.storage.set('appWidth', Math.round(side.getBoundingClientRect().width));
      };
      sash.addEventListener('pointermove', move);
      sash.addEventListener('pointerup', up);
    });
  }

  /** Called by an extension when it turns on. */
  function acquire(id) {
    if (!pane) build();
    users.add(id);
  }

  /** Called by an extension when it turns off. */
  function release(id) {
    users.delete(id);
    statuses.delete(id);
    if (!users.size) hide();
    else refresh();
  }

  function setStatus(id, text) {
    statuses.set(id, text);
    if (statusEl) statusEl.textContent = Array.from(statuses.values()).filter(Boolean).join(' · ');
    refresh();
  }

  /** Show the "windows open here" hint when no window is open. */
  function refresh() {
    if (emptyEl) emptyEl.hidden = !!desk.querySelector('.tkw:not([hidden])');
  }

  function show() {
    if (!pane) build();
    side.hidden = false;
    sash.hidden = false;
    // A fullscreen panel would cover the App window
    if (SC.panel.isMaximized && SC.panel.isMaximized()) SC.panel.toggleMaximize(false);
  }
  function hide() {
    if (!side) return;
    side.hidden = true;
    sash.hidden = true;
  }
  function toggle() {
    if (!users.size) { SC.notify('Turn on the Tkinter or C Graphics extension to use the App window.', 'info'); return; }
    if (side && !side.hidden) hide(); else show();
  }

  SC.appTab = { acquire, release, setStatus, refresh, show, hide, toggle, isOpen: () => !!side && !side.hidden, desk: () => { if (!pane) build(); return desk; } };
})(window.SC);
