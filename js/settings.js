/* ==========================================================================
   settings.js — user preferences (font size, tab size, auto save...).
   Other modules listen with SC.settings.on('change', fn).
   ========================================================================== */
(function (SC) {
  'use strict';

  const DEFAULTS = {
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    tabSize: 4,
    insertSpaces: true,
    autoCloseBrackets: true,
    autoSave: false,
    lineNumbers: true,
    highlightActiveLine: true,
    trimTrailingWhitespaceOnSave: false,
    confirmDelete: true,
  };

  const FONT_STACKS = {
    'JetBrains Mono': '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    'Cascadia / Consolas': '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
    'Fira Code': '"Fira Code", "JetBrains Mono", Consolas, monospace',
    'System monospace': 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    'Courier New': '"Courier New", Courier, monospace',
  };

  const events = SC.util.emitter();
  let values = Object.assign({}, DEFAULTS, SC.storage.get('settings', {}));

  function applyCss() {
    const root = document.documentElement.style;
    const size = SC.util.clamp(Number(values.fontSize) || 14, 8, 40);
    root.setProperty('--font-size', size + 'px');
    root.setProperty('--line-height', Math.round(size * 1.5) + 'px');
    root.setProperty('--tab-size', String(values.tabSize));
    root.setProperty('--font-code', FONT_STACKS[values.fontFamily] || FONT_STACKS['JetBrains Mono']);
    document.body.classList.toggle('hide-line-numbers', !values.lineNumbers);
    document.body.classList.toggle('no-line-highlight', !values.highlightActiveLine);
  }

  SC.settings = {
    DEFAULTS,
    FONT_STACKS,
    get(key) { return values[key]; },
    all() { return Object.assign({}, values); },
    set(key, value) {
      if (values[key] === value) return;
      values[key] = value;
      SC.storage.set('settings', values);
      applyCss();
      events.emit('change', { key, value });
    },
    reset() {
      values = Object.assign({}, DEFAULTS);
      SC.storage.set('settings', values);
      applyCss();
      events.emit('change', { key: '*', value: null });
    },
    lineHeight() { return Math.round(SC.util.clamp(Number(values.fontSize) || 14, 8, 40) * 1.5); },
    indentUnit() { return values.insertSpaces ? ' '.repeat(values.tabSize) : '\t'; },
    on: events.on,
    applyCss,
  };
})(window.SC);
