/* ==========================================================================
   commands.js — every action in the app is a "command" with an id.
   Menus, the command palette and keyboard shortcuts all run commands
   through here, so a feature only needs to be written once.

   SC.commands.register({ id, title, category, keybinding, when, run })
     keybinding: 'Ctrl+Shift+P', or a chord like 'Ctrl+K Ctrl+T'
     when:       name of a context check (see CONTEXTS) or a function
   ========================================================================== */
(function (SC) {
  'use strict';

  const isMac = SC.util.isMac;
  const registry = new Map();
  let pendingChord = null;
  let chordTimer = null;

  /* Context checks used by `when` */
  const CONTEXTS = {
    always: () => true,
    editor: () => !!(SC.tabs && SC.tabs.activeEditor()),
    editorFocus: () => !!(SC.tabs && SC.tabs.activeEditor() && document.activeElement === SC.tabs.activeEditor().ta),
    explorerFocus: () => !!document.activeElement && !!document.activeElement.closest('.tree'),
    notInput: () => {
      const a = document.activeElement;
      return !a || !(a.tagName === 'INPUT' || a.tagName === 'SELECT' || (a.tagName === 'TEXTAREA' && !a.classList.contains('editor-input')));
    },
  };

  function check(when) {
    if (!when) return true;
    if (typeof when === 'function') return !!when();
    return when.split('&&').every((part) => {
      const name = part.trim();
      const neg = name.startsWith('!');
      const fn = CONTEXTS[neg ? name.slice(1) : name];
      const result = fn ? fn() : true;
      return neg ? !result : result;
    });
  }

  function normalizeBinding(binding) {
    return binding.split(' ').map((stroke) => {
      const parts = stroke.split('+');
      const key = parts.pop();
      const mods = ['Ctrl', 'Shift', 'Alt', 'Meta'].filter((m) => parts.includes(m));
      return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
    }).join(' ');
  }

  const CODE_KEYS = {
    Slash: '/', Backslash: '\\', Backquote: '`', Equal: '=', Minus: '-', Comma: ',', Period: '.',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", NumpadAdd: '=', NumpadSubtract: '-', Space: 'Space',
  };
  const NAMED_KEYS = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space' };

  /** KeyboardEvent -> 'Ctrl+Shift+P' (layout independent for letters/digits). */
  function eventToStroke(e) {
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return null;
    const mods = [];
    if (e.ctrlKey || (isMac && e.metaKey)) mods.push('Ctrl');
    if (e.shiftKey) mods.push('Shift');
    if (e.altKey) mods.push('Alt');
    if (e.metaKey && !isMac) mods.push('Meta');
    const code = e.code || '';
    let key;
    if (code.startsWith('Key')) key = code.slice(3);
    else if (code.startsWith('Digit')) key = code.slice(5);
    else if (CODE_KEYS[code]) key = CODE_KEYS[code];
    else if (NAMED_KEYS[e.key]) key = NAMED_KEYS[e.key];
    else key = e.key && e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return [...mods, key].join('+');
  }

  /** 'Ctrl+Shift+P' -> what to show the user ('⌘⇧P' on a Mac). */
  function formatBinding(binding) {
    if (!binding) return '';
    if (!isMac) return binding;
    return binding.split(' ').map((s) => s.replace('Ctrl+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥')).join(' ');
  }

  function register(cmd) {
    if (!cmd.id || typeof cmd.run !== 'function') throw new Error('Command needs id and run()');
    const entry = Object.assign({ category: '', title: cmd.id }, cmd);
    if (entry.keybinding) entry.keys = [].concat(entry.keybinding).map(normalizeBinding);
    registry.set(cmd.id, entry);
    return entry;
  }

  async function run(id, ...args) {
    const cmd = registry.get(id);
    if (!cmd) {
      SC.notify('Command "' + id + '" not found.', 'error');
      return;
    }
    try {
      if (!cmd.hidden) {
        const recent = SC.storage.get('recentCommands', []).filter((c) => c !== id);
        recent.unshift(id);
        SC.storage.set('recentCommands', recent.slice(0, 8));
      }
      return await cmd.run(...args);
    } catch (err) {
      console.error(err);
      SC.notify(err.message || String(err), 'error');
    }
  }

  function list({ includeHidden = false } = {}) {
    return Array.from(registry.values()).filter((c) => includeHidden || !c.hidden);
  }

  function label(cmd) { return cmd.category ? cmd.category + ': ' + cmd.title : cmd.title; }

  function keyFor(id) {
    const cmd = registry.get(id);
    if (!cmd) return '';
    if (cmd.keys) return formatBinding(cmd.keys[0]);
    return cmd.displayKey ? formatBinding(cmd.displayKey) : '';
  }

  function onKeyDown(e) {
    if (SC.overlay && SC.overlay.isOpen()) return; // palette/dialog handles its own keys
    const stroke = eventToStroke(e);
    if (!stroke) return;
    const seq = pendingChord ? pendingChord + ' ' + stroke : stroke;
    let exact = null;
    let partial = false;
    for (const cmd of registry.values()) {
      if (!cmd.keys) continue;
      for (const k of cmd.keys) {
        if (k === seq && check(cmd.when)) exact = exact || cmd;
        else if (k.startsWith(seq + ' ') && check(cmd.when)) partial = true;
      }
    }
    if (exact) {
      e.preventDefault();
      e.stopPropagation();
      clearChord();
      run(exact.id);
      return;
    }
    if (partial) {
      e.preventDefault();
      e.stopPropagation();
      pendingChord = seq;
      SC.statusbar && SC.statusbar.message('(' + formatBinding(seq) + ') was pressed. Waiting for second key of chord...');
      clearTimeout(chordTimer);
      chordTimer = setTimeout(clearChord, 3000);
      return;
    }
    if (pendingChord) {
      e.preventDefault();
      SC.statusbar && SC.statusbar.message('The key combination (' + formatBinding(seq) + ') is not a command.', 2500);
      pendingChord = null;
    }
  }

  function clearChord() {
    pendingChord = null;
    clearTimeout(chordTimer);
    SC.statusbar && SC.statusbar.message('');
  }

  function install() {
    window.addEventListener('keydown', onKeyDown, true);
  }

  function unregister(id) { registry.delete(id); }

  SC.commands = { register, unregister, run, list, label, keyFor, formatBinding, eventToStroke, check, install, get: (id) => registry.get(id), CONTEXTS };
})(window.SC);
