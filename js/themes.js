/* ==========================================================================
   themes.js — built-in color themes plus your own custom themes.
   A theme is { id, name, type: 'dark'|'light', ui: {...}, tokens: {...} }.
   apply() writes every color into CSS variables on <html>:
     ui.fgMuted -> --c-fg-muted      tokens.string -> --t-string
   ========================================================================== */
(function (SC) {
  'use strict';

  const UI_KEYS = {
    bg: 'Editor background', fg: 'Text', fgMuted: 'Muted text',
    sidebarBg: 'Sidebar background', activityBg: 'Activity bar background', activityFg: 'Activity bar icons',
    activityActive: 'Activity bar active icon', titlebarBg: 'Title bar background',
    tabBg: 'Tab bar background', tabActiveBg: 'Active tab background', tabActiveFg: 'Active tab text',
    border: 'Borders', hover: 'Hover background', listActive: 'Selected list item',
    accent: 'Accent', accentFg: 'Text on accent', inputBg: 'Input background', widgetBg: 'Popup background',
    lineNumber: 'Line numbers', lineNumberActive: 'Active line number', currentLine: 'Current line',
    selection: 'Selection', findMatch: 'Find match', cursor: 'Cursor',
    statusbarBg: 'Status bar background', statusbarFg: 'Status bar text', scrollbar: 'Scrollbar',
    error: 'Error', warning: 'Warning', success: 'Success',
  };

  const TOKEN_KEYS = {
    text: 'Plain text', comment: 'Comments', string: 'Strings', number: 'Numbers',
    keyword: 'Keywords (const, def, class)', control: 'Control flow (if, return, import)',
    constant: 'Constants (true, null)', function: 'Functions', type: 'Types & classes',
    variable: 'Variables', property: 'Properties', operator: 'Operators', punct: 'Punctuation',
    tag: 'HTML tags', attr: 'HTML attributes', decorator: 'Decorators', builtin: 'Built-ins', regex: 'Regular expressions',
  };

  const BUILT_IN = [
    {
      id: 'smoki-dark', name: 'Smoki Dark', type: 'dark',
      ui: { bg: '#1c1d21', fg: '#d9d6d0', fgMuted: '#8d8a86', sidebarBg: '#17181b', activityBg: '#121315', activityFg: '#75726e', activityActive: '#f1ede6', titlebarBg: '#121315', tabBg: '#17181b', tabActiveBg: '#1c1d21', tabActiveFg: '#f1ede6', border: '#2a2b30', hover: '#26272c', listActive: '#33302d', accent: '#ff8a4c', accentFg: '#1a1208', inputBg: '#232429', widgetBg: '#222328', lineNumber: '#55535a', lineNumberActive: '#c9c5be', currentLine: '#24252a', selection: '#4a3b30', findMatch: '#6b4a2a', cursor: '#ff8a4c', statusbarBg: '#2a1d16', statusbarFg: '#f0c9ad', scrollbar: '#3a3b41', error: '#f2685c', warning: '#e6b450', success: '#7fc47a' },
      tokens: { text: '#d9d6d0', comment: '#6f6c69', string: '#d9a46c', number: '#b8d68b', keyword: '#6fb3e8', control: '#d48ec9', constant: '#6fb3e8', function: '#f0d488', type: '#5fcfb8', variable: '#a8cff0', property: '#a8cff0', operator: '#c9c5be', punct: '#a29f9a', tag: '#6fb3e8', attr: '#a8cff0', decorator: '#e6b450', builtin: '#5fcfb8', regex: '#f2685c' },
    },
    {
      id: 'smoki-light', name: 'Smoki Light', type: 'light',
      ui: { bg: '#fbfaf8', fg: '#2b2a28', fgMuted: '#74706b', sidebarBg: '#f3f1ed', activityBg: '#ebe8e3', activityFg: '#8f8a84', activityActive: '#2b2a28', titlebarBg: '#ebe8e3', tabBg: '#f3f1ed', tabActiveBg: '#fbfaf8', tabActiveFg: '#1f1e1c', border: '#e0dcd5', hover: '#e8e5e0', listActive: '#f5dccb', accent: '#d9622b', accentFg: '#ffffff', inputBg: '#ffffff', widgetBg: '#f6f4f0', lineNumber: '#b4afa8', lineNumberActive: '#3a3835', currentLine: '#f2efe9', selection: '#f6d3bd', findMatch: '#f2c27a', cursor: '#d9622b', statusbarBg: '#d9622b', statusbarFg: '#ffffff', scrollbar: '#cfcac2', error: '#c9372c', warning: '#b7791f', success: '#2f855a' },
      tokens: { text: '#2b2a28', comment: '#8a8580', string: '#a3521c', number: '#2f7d3b', keyword: '#1f5fb0', control: '#a2389b', constant: '#1f5fb0', function: '#7a5a00', type: '#11786b', variable: '#20507a', property: '#20507a', operator: '#4b4843', punct: '#6b6762', tag: '#1f5fb0', attr: '#b43c2a', decorator: '#8a6100', builtin: '#11786b', regex: '#b4232a' },
    },
    {
      id: 'classic-dark', name: 'Classic Dark', type: 'dark',
      ui: { bg: '#1f1f1f', fg: '#cccccc', fgMuted: '#9d9d9d', sidebarBg: '#181818', activityBg: '#181818', activityFg: '#868686', activityActive: '#d7d7d7', titlebarBg: '#181818', tabBg: '#181818', tabActiveBg: '#1f1f1f', tabActiveFg: '#ffffff', border: '#2b2b2b', hover: '#2a2d2e', listActive: '#04395e', accent: '#0078d4', accentFg: '#ffffff', inputBg: '#313131', widgetBg: '#202020', lineNumber: '#6e7681', lineNumberActive: '#cccccc', currentLine: '#282828', selection: '#264f78', findMatch: '#623315', cursor: '#aeafad', statusbarBg: '#0078d4', statusbarFg: '#ffffff', scrollbar: '#424242', error: '#f14c4c', warning: '#cca700', success: '#89d185' },
      tokens: { text: '#d4d4d4', comment: '#6a9955', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6', control: '#c586c0', constant: '#569cd6', function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', property: '#9cdcfe', operator: '#d4d4d4', punct: '#d4d4d4', tag: '#569cd6', attr: '#9cdcfe', decorator: '#dcdcaa', builtin: '#4ec9b0', regex: '#d16969' },
    },
    {
      id: 'monokai', name: 'Monokai', type: 'dark',
      ui: { bg: '#272822', fg: '#f8f8f2', fgMuted: '#90908a', sidebarBg: '#1e1f1c', activityBg: '#1e1f1c', activityFg: '#75715e', activityActive: '#f8f8f2', titlebarBg: '#1e1f1c', tabBg: '#1e1f1c', tabActiveBg: '#272822', tabActiveFg: '#ffffff', border: '#3e3d32', hover: '#3e3d32', listActive: '#49483e', accent: '#a6e22e', accentFg: '#1e1f1c', inputBg: '#3e3d32', widgetBg: '#1e1f1c', lineNumber: '#75715e', lineNumberActive: '#f8f8f2', currentLine: '#3e3d32', selection: '#575649', findMatch: '#6b6a3a', cursor: '#f8f8f0', statusbarBg: '#414339', statusbarFg: '#f8f8f2', scrollbar: '#4e4d43', error: '#f92672', warning: '#e6db74', success: '#a6e22e' },
      tokens: { text: '#f8f8f2', comment: '#75715e', string: '#e6db74', number: '#ae81ff', keyword: '#66d9ef', control: '#f92672', constant: '#ae81ff', function: '#a6e22e', type: '#66d9ef', variable: '#f8f8f2', property: '#f8f8f2', operator: '#f92672', punct: '#f8f8f2', tag: '#f92672', attr: '#a6e22e', decorator: '#a6e22e', builtin: '#66d9ef', regex: '#e6db74' },
    },
    {
      id: 'dracula', name: 'Dracula', type: 'dark',
      ui: { bg: '#282a36', fg: '#f8f8f2', fgMuted: '#8b93c0', sidebarBg: '#21222c', activityBg: '#21222c', activityFg: '#6272a4', activityActive: '#f8f8f2', titlebarBg: '#21222c', tabBg: '#21222c', tabActiveBg: '#282a36', tabActiveFg: '#f8f8f2', border: '#191a21', hover: '#343746', listActive: '#44475a', accent: '#bd93f9', accentFg: '#191a21', inputBg: '#21222c', widgetBg: '#21222c', lineNumber: '#6272a4', lineNumberActive: '#f8f8f2', currentLine: '#343746', selection: '#44475a', findMatch: '#6d5a3f', cursor: '#f8f8f0', statusbarBg: '#bd93f9', statusbarFg: '#191a21', scrollbar: '#44475a', error: '#ff5555', warning: '#ffb86c', success: '#50fa7b' },
      tokens: { text: '#f8f8f2', comment: '#6272a4', string: '#f1fa8c', number: '#bd93f9', keyword: '#ff79c6', control: '#ff79c6', constant: '#bd93f9', function: '#50fa7b', type: '#8be9fd', variable: '#f8f8f2', property: '#f8f8f2', operator: '#ff79c6', punct: '#f8f8f2', tag: '#ff79c6', attr: '#50fa7b', decorator: '#50fa7b', builtin: '#8be9fd', regex: '#ff5555' },
    },
    {
      id: 'one-dark', name: 'One Dark', type: 'dark',
      ui: { bg: '#282c34', fg: '#abb2bf', fgMuted: '#7f848e', sidebarBg: '#21252b', activityBg: '#21252b', activityFg: '#5c6370', activityActive: '#d7dae0', titlebarBg: '#21252b', tabBg: '#21252b', tabActiveBg: '#282c34', tabActiveFg: '#e6e6e6', border: '#181a1f', hover: '#2c313a', listActive: '#3a3f4b', accent: '#61afef', accentFg: '#1b1d23', inputBg: '#1d1f23', widgetBg: '#21252b', lineNumber: '#495162', lineNumberActive: '#abb2bf', currentLine: '#2c313c', selection: '#3e4451', findMatch: '#42557b', cursor: '#528bff', statusbarBg: '#21252b', statusbarFg: '#9da5b4', scrollbar: '#4e5666', error: '#e06c75', warning: '#e5c07b', success: '#98c379' },
      tokens: { text: '#abb2bf', comment: '#7f848e', string: '#98c379', number: '#d19a66', keyword: '#c678dd', control: '#c678dd', constant: '#d19a66', function: '#61afef', type: '#e5c07b', variable: '#e06c75', property: '#e06c75', operator: '#56b6c2', punct: '#abb2bf', tag: '#e06c75', attr: '#d19a66', decorator: '#e5c07b', builtin: '#e5c07b', regex: '#56b6c2' },
    },
    {
      id: 'nord', name: 'Nord', type: 'dark',
      ui: { bg: '#2e3440', fg: '#d8dee9', fgMuted: '#8a95ab', sidebarBg: '#292e39', activityBg: '#2e3440', activityFg: '#616e88', activityActive: '#d8dee9', titlebarBg: '#2e3440', tabBg: '#292e39', tabActiveBg: '#2e3440', tabActiveFg: '#eceff4', border: '#3b4252', hover: '#3b4252', listActive: '#434c5e', accent: '#88c0d0', accentFg: '#2e3440', inputBg: '#3b4252', widgetBg: '#3b4252', lineNumber: '#4c566a', lineNumberActive: '#d8dee9', currentLine: '#3b4252', selection: '#434c5e', findMatch: '#5e6f8c', cursor: '#d8dee9', statusbarBg: '#3b4252', statusbarFg: '#d8dee9', scrollbar: '#4c566a', error: '#bf616a', warning: '#ebcb8b', success: '#a3be8c' },
      tokens: { text: '#d8dee9', comment: '#616e88', string: '#a3be8c', number: '#b48ead', keyword: '#81a1c1', control: '#81a1c1', constant: '#81a1c1', function: '#88c0d0', type: '#8fbcbb', variable: '#d8dee9', property: '#d8dee9', operator: '#81a1c1', punct: '#eceff4', tag: '#81a1c1', attr: '#8fbcbb', decorator: '#d08770', builtin: '#8fbcbb', regex: '#ebcb8b' },
    },
    {
      id: 'solarized-dark', name: 'Solarized Dark', type: 'dark',
      ui: { bg: '#002b36', fg: '#93a1a1', fgMuted: '#6c8389', sidebarBg: '#00212b', activityBg: '#00212b', activityFg: '#586e75', activityActive: '#93a1a1', titlebarBg: '#00212b', tabBg: '#00212b', tabActiveBg: '#002b36', tabActiveFg: '#c5d0d0', border: '#073642', hover: '#073642', listActive: '#005a6f', accent: '#2aa198', accentFg: '#002b36', inputBg: '#003847', widgetBg: '#00212b', lineNumber: '#4a646b', lineNumberActive: '#93a1a1', currentLine: '#073642', selection: '#274642', findMatch: '#584c27', cursor: '#d30102', statusbarBg: '#00212b', statusbarFg: '#93a1a1', scrollbar: '#0b4f60', error: '#dc322f', warning: '#b58900', success: '#859900' },
      tokens: { text: '#839496', comment: '#586e75', string: '#2aa198', number: '#d33682', keyword: '#859900', control: '#859900', constant: '#cb4b16', function: '#268bd2', type: '#b58900', variable: '#268bd2', property: '#93a1a1', operator: '#859900', punct: '#839496', tag: '#268bd2', attr: '#93a1a1', decorator: '#cb4b16', builtin: '#b58900', regex: '#dc322f' },
    },
    {
      id: 'solarized-light', name: 'Solarized Light', type: 'light',
      ui: { bg: '#fdf6e3', fg: '#586e75', fgMuted: '#839496', sidebarBg: '#eee8d5', activityBg: '#ddd6c1', activityFg: '#839496', activityActive: '#586e75', titlebarBg: '#eee8d5', tabBg: '#eee8d5', tabActiveBg: '#fdf6e3', tabActiveFg: '#333333', border: '#ddd6c1', hover: '#e6dfca', listActive: '#dfca88', accent: '#b58900', accentFg: '#fdf6e3', inputBg: '#fffbf0', widgetBg: '#eee8d5', lineNumber: '#9ca8a6', lineNumberActive: '#586e75', currentLine: '#eee8d5', selection: '#dfd5b8', findMatch: '#f2d67a', cursor: '#657b83', statusbarBg: '#eee8d5', statusbarFg: '#586e75', scrollbar: '#d3cbb7', error: '#dc322f', warning: '#b58900', success: '#859900' },
      tokens: { text: '#657b83', comment: '#93a1a1', string: '#2aa198', number: '#d33682', keyword: '#859900', control: '#859900', constant: '#cb4b16', function: '#268bd2', type: '#b58900', variable: '#268bd2', property: '#657b83', operator: '#859900', punct: '#657b83', tag: '#268bd2', attr: '#93a1a1', decorator: '#cb4b16', builtin: '#b58900', regex: '#dc322f' },
    },
    {
      id: 'github-light', name: 'GitHub Light', type: 'light',
      ui: { bg: '#ffffff', fg: '#1f2328', fgMuted: '#59636e', sidebarBg: '#f6f8fa', activityBg: '#f6f8fa', activityFg: '#636c76', activityActive: '#1f2328', titlebarBg: '#f6f8fa', tabBg: '#f6f8fa', tabActiveBg: '#ffffff', tabActiveFg: '#1f2328', border: '#d1d9e0', hover: '#eaeef2', listActive: '#ddf4ff', accent: '#0969da', accentFg: '#ffffff', inputBg: '#ffffff', widgetBg: '#ffffff', lineNumber: '#8c959f', lineNumberActive: '#1f2328', currentLine: '#f6f8fa', selection: '#b6e3ff', findMatch: '#fae17d', cursor: '#0969da', statusbarBg: '#f6f8fa', statusbarFg: '#59636e', scrollbar: '#c8d1da', error: '#cf222e', warning: '#9a6700', success: '#1a7f37' },
      tokens: { text: '#1f2328', comment: '#59636e', string: '#0a3069', number: '#0550ae', keyword: '#cf222e', control: '#cf222e', constant: '#0550ae', function: '#8250df', type: '#953800', variable: '#1f2328', property: '#0550ae', operator: '#cf222e', punct: '#1f2328', tag: '#116329', attr: '#0550ae', decorator: '#8250df', builtin: '#0550ae', regex: '#116329' },
    },
    {
      id: 'high-contrast', name: 'High Contrast', type: 'dark',
      ui: { bg: '#000000', fg: '#ffffff', fgMuted: '#c8c8c8', sidebarBg: '#000000', activityBg: '#000000', activityFg: '#ffffff', activityActive: '#ffffff', titlebarBg: '#000000', tabBg: '#000000', tabActiveBg: '#000000', tabActiveFg: '#ffffff', border: '#6fc3df', hover: '#1a1a1a', listActive: '#0a3a52', accent: '#f38518', accentFg: '#000000', inputBg: '#000000', widgetBg: '#0c0c0c', lineNumber: '#b0b0b0', lineNumberActive: '#ffffff', currentLine: '#141414', selection: '#264f78', findMatch: '#a85d00', cursor: '#ffffff', statusbarBg: '#000000', statusbarFg: '#ffffff', scrollbar: '#6fc3df', error: '#ff5f5f', warning: '#ffd700', success: '#89d185' },
      tokens: { text: '#ffffff', comment: '#7ca668', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6', control: '#c586c0', constant: '#569cd6', function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', property: '#9cdcfe', operator: '#d4d4d4', punct: '#ffffff', tag: '#569cd6', attr: '#9cdcfe', decorator: '#dcdcaa', builtin: '#4ec9b0', regex: '#d16969' },
    },
  ];

  const events = SC.util.emitter();
  let custom = SC.storage.get('customThemes', []);
  if (!Array.isArray(custom)) custom = [];
  let currentId = SC.storage.get('theme', 'smoki-dark');

  const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

  function list() { return [...BUILT_IN, ...custom]; }
  function get(id) { return list().find((t) => t.id === id) || null; }
  function current() { return get(currentId) || BUILT_IN[0]; }

  /** Fill gaps in a theme with values from the matching default theme. */
  function complete(theme) {
    const base = theme.type === 'light' ? BUILT_IN[1] : BUILT_IN[0];
    return {
      id: theme.id, name: theme.name, type: theme.type === 'light' ? 'light' : 'dark',
      ui: Object.assign({}, base.ui, theme.ui || {}),
      tokens: Object.assign({}, base.tokens, theme.tokens || {}),
    };
  }

  /** Paint the page with a theme. persist=false is used for live previews. */
  function apply(themeOrId, { persist = true } = {}) {
    const theme = complete(typeof themeOrId === 'string' ? (get(themeOrId) || BUILT_IN[0]) : themeOrId);
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(theme.ui)) style.setProperty('--c-' + kebab(key), value);
    for (const [key, value] of Object.entries(theme.tokens)) style.setProperty('--t-' + key, value);
    style.setProperty('color-scheme', theme.type);
    document.documentElement.dataset.themeType = theme.type;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme.ui.titlebarBg;
    if (persist) {
      currentId = theme.id;
      SC.storage.set('theme', currentId);
      events.emit('change', theme);
    }
    return theme;
  }

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
  }

  /** Save (or overwrite) a custom theme and return its id. */
  function saveCustom(theme) {
    const t = complete(theme);
    if (!t.id || !t.id.startsWith('custom-')) {
      let id = 'custom-' + slug(t.name);
      let i = 2;
      while (get(id) && !(get(id).id === theme.id)) id = 'custom-' + slug(t.name) + '-' + i++;
      t.id = id;
    }
    const idx = custom.findIndex((c) => c.id === t.id);
    if (idx >= 0) custom[idx] = t; else custom.push(t);
    SC.storage.set('customThemes', custom);
    events.emit('list', null);
    return t.id;
  }

  function deleteCustom(id) {
    custom = custom.filter((t) => t.id !== id);
    SC.storage.set('customThemes', custom);
    if (currentId === id) apply('smoki-dark');
    events.emit('list', null);
  }

  function exportJson(id) {
    const t = complete(get(id) || current());
    return JSON.stringify({ name: t.name, type: t.type, ui: t.ui, tokens: t.tokens }, null, 2);
  }

  /** Accepts the JSON produced by exportJson. Returns the new theme id. */
  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || (!data.ui && !data.tokens)) {
      throw new Error('This file is not a Smoki\'s Code theme. It needs "ui" and/or "tokens" color maps.');
    }
    const clean = (map, keys) => {
      const out = {};
      for (const k of Object.keys(keys)) if (map && typeof map[k] === 'string') out[k] = map[k];
      return out;
    };
    return saveCustom({
      name: String(data.name || 'Imported Theme').slice(0, 60),
      type: data.type === 'light' ? 'light' : 'dark',
      ui: clean(data.ui, UI_KEYS),
      tokens: clean(data.tokens, TOKEN_KEYS),
    });
  }

  SC.themes = {
    UI_KEYS, TOKEN_KEYS, BUILT_IN,
    list, get, current, apply, complete, saveCustom, deleteCustom, exportJson, importJson,
    isCustom: (id) => String(id).startsWith('custom-'),
    on: events.on,
  };
})(window.SC);
