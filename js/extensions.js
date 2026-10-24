/* ==========================================================================
   extensions.js — the extension system and the Extensions view in the
   sidebar. Bigger features (Terminal, pip, Tkinter apps, and new ones
   later) are written as extensions in js/extensions/ so each one can be
   turned on or off on its own.

   An extension file calls SC.extensions.register({
     id, name, version, description, icon: { text, color },
     features: ['what it adds', ...],   // shown in the details
     commands: ['command.id', ...],     // shown with their shortcuts
     activate(ctx), deactivate(),       // turn the feature on / off
     renderDetails(container),          // optional extra UI in the details
   })

   ctx.registerCommand(cmd) and ctx.addPanelTab(id, label, element, opts)
   are undone automatically when the extension is turned off; anything
   else goes in ctx.onDispose(fn).
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const registry = new Map(); // id -> extension
  const active = new Map();   // id -> context of an active extension
  const expanded = new Set();
  let started = false;
  let listEl;
  let searchEl;
  let countEl;

  function register(ext) {
    if (!ext.id || !ext.name) throw new Error('An extension needs an id and a name.');
    registry.set(ext.id, Object.assign({ version: '1.0.0', description: '', features: [], commands: [] }, ext));
    if (started && isEnabled(ext.id)) activate(ext.id);
    render();
  }

  function disabledIds() { return SC.storage.get('extensions.disabled', []); }
  function isEnabled(id) { return !disabledIds().includes(id); }
  function isActive(id) { return active.has(id); }

  function makeContext(ext) {
    const disposers = [];
    return {
      extension: ext,
      onDispose: (fn) => disposers.push(fn),
      registerCommand(cmd) {
        SC.commands.register(Object.assign({ category: ext.name }, cmd));
        disposers.push(() => SC.commands.unregister(cmd.id));
      },
      addPanelTab(id, label, element, opts) {
        SC.panel.addTab(id, label, element, opts);
        disposers.push(() => SC.panel.removeTab(id));
      },
      dispose() { while (disposers.length) { try { disposers.pop()(); } catch (err) { console.error(err); } } },
    };
  }

  function activate(id) {
    const ext = registry.get(id);
    if (!ext || active.has(id)) return;
    const ctx = makeContext(ext);
    active.set(id, ctx);
    try {
      if (ext.activate) ext.activate(ctx);
    } catch (err) {
      console.error(err);
      SC.notify('The "' + ext.name + '" extension could not start: ' + err.message, 'error');
    }
  }

  function deactivate(id) {
    const ext = registry.get(id);
    const ctx = active.get(id);
    if (!ctx) return;
    try { if (ext.deactivate) ext.deactivate(); } catch (err) { console.error(err); }
    ctx.dispose();
    active.delete(id);
  }

  function setEnabled(id, on) {
    const ext = registry.get(id);
    const off = disabledIds().filter((x) => x !== id);
    if (!on) off.push(id);
    SC.storage.set('extensions.disabled', off);
    if (on) activate(id); else deactivate(id);
    render();
    SC.notify((on ? 'Enabled ' : 'Disabled ') + ext.name + '.', 'info', 2200);
  }

  /** Start every enabled extension. Called once by app.js after the UI is built. */
  function init() {
    started = true;
    buildView();
    for (const id of registry.keys()) if (isEnabled(id)) activate(id);
    render();
    SC.commands.register({ id: 'extensions.show', category: 'View', title: 'Show Extensions', keybinding: 'Ctrl+Shift+X', run: () => SC.app.showView('extensions') });
  }

  /* ---------- The Extensions view ---------- */
  function buildView() {
    const view = document.getElementById('view-extensions');
    searchEl = el('input', { class: 'text-input', id: 'extensions-search', type: 'search', placeholder: 'Search extensions', 'aria-label': 'Search extensions', spellcheck: 'false' });
    searchEl.addEventListener('input', render);
    countEl = el('span', { class: 'ext-count' });
    listEl = el('div', { class: 'ext-list' });
    view.append(
      el('div', { class: 'view-header' }, el('span', { text: 'Extensions' })),
      el('div', { class: 'view-body ext-body' },
        el('div', { class: 'ext-search' }, searchEl),
        el('div', { class: 'ext-section' }, el('span', { text: 'Installed' }), countEl),
        listEl,
        el('p', { class: 'ext-note', text: 'New features for Smoki\'s Code arrive here as extensions. Turn off any you don\'t use.' })));
  }

  function icon(ext) {
    const i = ext.icon || {};
    return el('div', { class: 'ext-icon', text: i.text || ext.name.slice(0, 2), style: { background: i.color || 'var(--c-accent)' }, 'aria-hidden': 'true' });
  }

  function render() {
    if (!listEl) return;
    const q = searchEl.value.trim().toLowerCase();
    const all = Array.from(registry.values());
    const shown = all.filter((x) => !q || (x.name + ' ' + x.description + ' ' + x.features.join(' ')).toLowerCase().includes(q));
    countEl.textContent = String(all.length);
    listEl.textContent = '';
    if (!shown.length) listEl.append(el('p', { class: 'ext-empty', text: 'No extensions match "' + searchEl.value + '".' }));
    for (const ext of shown) {
      const on = isEnabled(ext.id);
      const open = expanded.has(ext.id);
      const toggle = el('button', {
        class: 'btn ext-toggle' + (on ? '' : ' primary'), type: 'button', text: on ? 'Disable' : 'Enable',
        onClick: (e) => { e.stopPropagation(); setEnabled(ext.id, !on); },
      });
      const head = el('button', {
        class: 'ext-head', type: 'button', 'aria-expanded': String(open),
        onClick: () => { if (open) expanded.delete(ext.id); else expanded.add(ext.id); render(); },
      },
      icon(ext),
      el('div', { class: 'ext-text' },
        el('div', { class: 'ext-name' }, el('strong', { text: ext.name }), el('span', { class: 'ext-version', text: 'v' + ext.version })),
        el('div', { class: 'ext-desc', text: ext.description }),
        el('div', { class: 'ext-meta' }, el('span', { text: 'Smoki' }), el('span', { class: 'ext-state' + (on ? ' on' : ''), text: on ? 'Enabled' : 'Disabled' }))));
      const item = el('div', { class: 'ext-item' + (on ? '' : ' off') + (open ? ' open' : '') }, head, el('div', { class: 'ext-actions' }, toggle));
      if (open) item.append(details(ext, on));
      listEl.append(item);
    }
  }

  function details(ext, on) {
    const box = el('div', { class: 'ext-details' });
    if (ext.features.length) {
      box.append(el('h3', { text: 'Features' }), el('ul', {}, ext.features.map((f) => el('li', { text: f }))));
    }
    const cmds = ext.commands.map((id) => SC.commands.get(id)).filter(Boolean);
    if (cmds.length) {
      box.append(el('h3', { text: 'Commands' }), el('ul', { class: 'ext-cmds' }, cmds.map((c) => el('li', {},
        el('button', { class: 'welcome-link', type: 'button', text: c.title, onClick: () => SC.commands.run(c.id) }),
        SC.commands.keyFor(c.id) ? el('kbd', { text: SC.commands.keyFor(c.id) }) : null))));
    }
    if (on && ext.renderDetails) {
      const custom = el('div', { class: 'ext-custom' });
      box.append(custom);
      try { ext.renderDetails(custom); } catch (err) { console.error(err); }
    }
    if (!on) box.append(el('p', { class: 'ext-note', text: 'Enable this extension to use it.' }));
    return box;
  }

  SC.extensions = { register, init, isEnabled, isActive, setEnabled, render, list: () => Array.from(registry.values()) };
})(window.SC);
