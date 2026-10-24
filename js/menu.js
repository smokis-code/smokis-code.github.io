/* ==========================================================================
   menu.js — context menus (right click) and the top menu bar
   (File, Edit, Selection, View, Go, Run, Help).
   Also SC.overlay, which tracks whether a popup currently owns the keyboard.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;

  /* ---------- Overlay bookkeeping ---------- */
  let openCount = 0;
  SC.overlay = {
    isOpen: () => openCount > 0,
    push() { openCount++; },
    pop() { openCount = Math.max(0, openCount - 1); },
    root: () => document.getElementById('overlay-root'),
  };

  /* ---------- Context menu ---------- */
  let active = null; // { close }

  /**
   * items: [{ label, command, args, run, keybinding, disabled }, '-' for separator]
   * position: { x, y } or { anchor: element }
   */
  function show(items, position, { onClose } = {}) {
    closeActive();
    const backdrop = el('div', { class: 'overlay-backdrop' });
    const menu = el('div', { class: 'menu', role: 'menu', tabindex: '-1' });
    const buttons = [];

    for (const item of items) {
      if (item === '-' || item.separator) {
        if (menu.lastChild && !menu.lastChild.classList.contains('menu-sep')) menu.append(el('div', { class: 'menu-sep' }));
        continue;
      }
      const cmd = item.command ? SC.commands.get(item.command) : null;
      const label = item.label || (cmd ? cmd.title : '?');
      const key = item.keybinding != null ? item.keybinding : (item.command ? SC.commands.keyFor(item.command) : '');
      const btn = el('button', { class: 'menu-item', type: 'button', role: 'menuitem', disabled: !!item.disabled },
        el('span', { text: label }),
        key ? el('span', { class: 'menu-key', text: key }) : null);
      btn.addEventListener('click', () => {
        close();
        if (item.run) item.run();
        else if (item.command) SC.commands.run(item.command, ...(item.args || []));
      });
      btn.addEventListener('mouseenter', () => focusIndex(buttons.indexOf(btn), false));
      buttons.push(btn);
      menu.append(btn);
    }
    if (menu.lastChild && menu.lastChild.classList.contains('menu-sep')) menu.lastChild.remove();

    SC.overlay.root().append(backdrop, menu);
    SC.overlay.push();

    // Position inside the viewport
    const rect = menu.getBoundingClientRect();
    let x, y;
    if (position.anchor) {
      const r = position.anchor.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 2;
    } else {
      x = position.x;
      y = position.y;
    }
    x = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    let focused = -1;
    function focusIndex(i, scroll = true) {
      buttons.forEach((b) => b.classList.remove('focused'));
      focused = i;
      if (buttons[i]) {
        buttons[i].classList.add('focused');
        if (scroll) buttons[i].focus();
      }
    }

    function onKey(e) {
      const enabled = buttons.map((b, i) => (b.disabled ? -1 : i)).filter((i) => i >= 0);
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!enabled.length) return;
        const pos = enabled.indexOf(focused);
        const next = e.key === 'ArrowDown' ? enabled[(pos + 1) % enabled.length] : enabled[(pos - 1 + enabled.length) % enabled.length];
        focusIndex(next);
      } else if (e.key === 'Enter' && buttons[focused]) { e.preventDefault(); buttons[focused].click(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && position.onArrow) { e.preventDefault(); position.onArrow(e.key === 'ArrowRight' ? 1 : -1); }
    }

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      menu.remove();
      SC.overlay.pop();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      if (active && active.close === close) active = null;
      if (onClose) onClose();
    }

    backdrop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      close();
      if (position.onBackdrop) position.onBackdrop(e);
    });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    menu.focus({ preventScroll: true });
    if (position.focusFirst) focusIndex(buttons.findIndex((b) => !b.disabled));

    active = { close, menu };
    return { close, menu };
  }

  function closeActive() { if (active) active.close(); }

  /* ---------- Menu bar ---------- */
  const MENUS = [
    { label: 'File', items: ['file.newFile', 'file.newUntitled', 'file.newFolder', '-', 'file.openFile', 'file.openFolder', '-', 'file.save', 'file.saveAs', 'file.saveAll', '-', 'file.download', 'workspace.exportZip', '-', 'editor.close', 'editor.closeAll', '-', 'workspace.reset'] },
    { label: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.find', 'edit.replace', 'search.focus', '-', 'edit.toggleComment', 'edit.duplicateLine', 'edit.deleteLine', '-', 'edit.trimWhitespace'] },
    { label: 'Selection', items: ['edit.selectAll', 'edit.selectLine', '-', 'edit.copyLineUp', 'edit.copyLineDown', 'edit.moveLineUp', 'edit.moveLineDown', '-', 'edit.sortLines', 'edit.upperCase', 'edit.lowerCase'] },
    { label: 'View', items: ['workbench.commandPalette', 'workbench.quickOpen', '-', 'view.explorer', 'view.search', 'view.settings', '-', 'view.toggleSidebar', 'view.togglePanel', '-', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset', '-', 'theme.select', 'theme.customize'] },
    { label: 'Go', items: ['workbench.quickOpen', 'editor.goToLine', '-', 'editor.next', 'editor.previous'] },
    { label: 'Run', items: ['run.file', 'run.stop', 'run.previewHtml', '-', 'panel.clear'] },
    { label: 'Help', items: ['help.welcome', 'help.shortcuts', '-', 'help.about'] },
  ];

  function buildMenubar(host) {
    let openIndex = -1;
    let current = null;
    const buttons = MENUS.map((m, i) => {
      const b = el('button', { class: 'menubar-item', type: 'button', text: m.label, 'aria-haspopup': 'true' });
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (openIndex === i) { closeActive(); return; }
        openAt(i);
      });
      b.addEventListener('click', (e) => { if (e.detail === 0) openAt(i, true); }); // keyboard activation
      b.addEventListener('mouseenter', () => { if (openIndex >= 0 && openIndex !== i) openAt(i); });
      host.append(b);
      return b;
    });

    function openAt(i, focusFirst = false) {
      if (current) current.close();
      openIndex = i;
      buttons.forEach((b, j) => b.classList.toggle('open', j === i));
      const items = MENUS[i].items.map((id) => (id === '-' ? '-' : { command: id }));
      current = show(items, {
        anchor: buttons[i],
        focusFirst,
        onArrow: (dir) => openAt((i + dir + MENUS.length) % MENUS.length, true),
        onBackdrop: (e) => {
          // Clicking another menu title while one is open switches menus
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const idx = buttons.indexOf(target);
          if (idx >= 0 && idx !== i) openAt(idx);
        },
      }, {
        onClose: () => {
          if (openIndex === i) {
            openIndex = -1;
            buttons[i].classList.remove('open');
          }
          current = null;
        },
      });
      // Hovering other titles while open (the backdrop covers them)
      const backdrop = current.menu.previousSibling;
      backdrop.addEventListener('mousemove', (e) => {
        backdrop.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        backdrop.style.pointerEvents = '';
        const idx = buttons.indexOf(target);
        if (idx >= 0 && idx !== openIndex) openAt(idx);
      });
    }
  }

  SC.menu = { show, closeActive, buildMenubar, MENUS };
})(window.SC);
