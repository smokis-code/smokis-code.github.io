/* ==========================================================================
   extensions/app-tab.js — the App tab in the bottom panel: a small
   "desktop" where program windows open. Shared by the Tkinter and the C
   Graphics extensions. The tab is shown while at least one of them is on.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  let pane;
  let desk;
  let emptyEl;
  let statusEl;
  const users = new Set();
  const statuses = new Map();

  function build() {
    emptyEl = el('div', { class: 'app-empty' },
      el('p', { text: 'Program windows open here.' }),
      el('p', { class: 'app-hint', text: 'Run a Python program that uses tkinter, or a C program that uses raylib, GLUT or GLFW (install them with pacman in the MSYS2 terminal), and its window appears here.' }));
    desk = el('div', { class: 'app-desk' }, emptyEl);
    statusEl = el('span', { class: 'app-status' });
    pane = el('div', { class: 'app-pane' },
      el('div', { class: 'term-bar' }, statusEl, el('div', { class: 'spacer' }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Close the program (Shift+F5)', 'data-icon': 'stop', onClick: () => { if (SC.runner.isRunning()) SC.runner.stop(); } })),
      desk);
    SC.icons.hydrate(pane);
  }

  /** Called by an extension when it turns on. */
  function acquire(id) {
    if (!pane) build();
    if (!users.size) SC.panel.addTab('app', 'App', pane);
    users.add(id);
  }

  /** Called by an extension when it turns off. */
  function release(id) {
    users.delete(id);
    statuses.delete(id);
    if (!users.size) SC.panel.removeTab('app');
    else refresh();
  }

  function setStatus(id, text) {
    statuses.set(id, text);
    statusEl.textContent = Array.from(statuses.values()).filter(Boolean).join(' · ');
    refresh();
  }

  /** Show the "windows open here" hint when no window is open. */
  function refresh() {
    if (emptyEl) emptyEl.hidden = !!desk.querySelector('.tkw:not([hidden])');
  }

  function show() {
    SC.panel.show('app');
    SC.panel.ensureHeight(Math.min(window.innerHeight * 0.75, 560));
  }

  SC.appTab = { acquire, release, setStatus, refresh, show, desk: () => { if (!pane) build(); return desk; } };
})(window.SC);
