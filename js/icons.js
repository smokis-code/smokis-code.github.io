/* ==========================================================================
   icons.js — inline SVG icons and file-type badges.
   Any element with data-icon="name" gets its SVG filled in by hydrate().
   ========================================================================== */
(function (SC) {
  'use strict';

  const P = {
    files: '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.12a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z"/>',
    extensions: '<rect x="3" y="11" width="10" height="10" rx="1"/><rect x="3" y="3" width="8" height="8" rx="1" transform="translate(0 -0)"/><rect x="14" y="2" width="8" height="8" rx="1" transform="rotate(12 18 6)"/><rect x="11" y="11" width="10" height="10" rx="1"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    'new-file': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    'new-folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    collapse: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'folder-open': '<path d="M3 17V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3 17l2.6-5.6A2 2 0 0 1 7.4 10H21l-2.8 7.4A2.5 2.5 0 0 1 15.9 19H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14M5 12l7 7 7-7"/>',
    replace: '<path d="M4 7h11M11 3l4 4-4 4"/><path d="M20 17H9M13 13l-4 4 4 4"/>',
    'replace-all': '<path d="M4 6h12M12 2l4 4-4 4"/><path d="M4 14h16M4 19h16"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 17V5M7 10l5-5 5 5M5 21h14"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    warning: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    clear: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    brackets: '<path d="M8 3H6a2 2 0 0 0-2 2v5l-2 2 2 2v5a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v5l2 2-2 2v5a2 2 0 0 1-2 2h-2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  };

  function svg(name) {
    const body = P[name];
    if (!body) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /** Fill every [data-icon] inside root with its SVG. */
  function hydrate(root = document) {
    const nodes = root.matches && root.matches('[data-icon]') ? [root] : [];
    nodes.push(...root.querySelectorAll('[data-icon]'));
    for (const node of nodes) {
      if (node.dataset.iconDone === node.dataset.icon) continue;
      node.innerHTML = svg(node.dataset.icon);
      node.dataset.iconDone = node.dataset.icon;
    }
  }

  function make(name, cls = 'icon') {
    const span = document.createElement('span');
    span.className = cls;
    span.innerHTML = svg(name);
    return span;
  }

  /* File-type badges: short label + color, like the icon themes in editors */
  const BADGES = {
    js: ['JS', '#e8c547'], mjs: ['JS', '#e8c547'], cjs: ['JS', '#e8c547'], jsx: ['JSX', '#5fd0e6'],
    ts: ['TS', '#3d8fd6'], tsx: ['TSX', '#3d8fd6'],
    py: ['PY', '#5a9fd4'], pyw: ['PY', '#5a9fd4'],
    html: ['<>', '#e8743b'], htm: ['<>', '#e8743b'], xml: ['<>', '#d98c4a'], svg: ['SVG', '#f0a33c'],
    css: ['#', '#4aa3e8'], scss: ['#', '#d36a9d'], less: ['#', '#6b8fd1'],
    json: ['{}', '#cbcb41'], md: ['M↓', '#6fb3e8'], markdown: ['M↓', '#6fb3e8'],
    c: ['C', '#7a9fd9'], h: ['H', '#a37acc'], cpp: ['C++', '#6c8fd6'], cc: ['C++', '#6c8fd6'], hpp: ['H+', '#a37acc'],
    java: ['J', '#e76f00'], cs: ['C#', '#a074c4'], rs: ['RS', '#dea584'], go: ['GO', '#00add8'],
    sh: ['$', '#89e051'], bash: ['$', '#89e051'], zsh: ['$', '#89e051'], ps1: ['PS', '#4d8fd1'],
    sql: ['DB', '#e38c00'], txt: ['≡', '#9a9690'], log: ['≡', '#9a9690'],
    yml: ['YML', '#cb5b5b'], yaml: ['YML', '#cb5b5b'], toml: ['TML', '#9c4221'], ini: ['INI', '#8a8a8a'],
    lua: ['LUA', '#5d6dd8'], rb: ['RB', '#cc342d'], php: ['PHP', '#8892bf'], kt: ['KT', '#a97bff'], swift: ['SW', '#f05138'], dart: ['DT', '#40c4ff'],
  };

  function fileIcon(name) {
    const ext = SC.util.extname(name);
    const badge = BADGES[ext];
    const span = document.createElement('span');
    span.className = 'file-icon';
    if (badge) {
      span.textContent = badge[0];
      span.style.color = badge[1];
      if (badge[0].length >= 3) span.style.fontSize = '7px';
    } else {
      span.innerHTML = svg('file');
      span.style.color = 'var(--c-fg-muted)';
    }
    return span;
  }

  function folderIcon(open) {
    const span = make(open ? 'folder-open' : 'folder', 'file-icon folder-icon');
    return span;
  }

  SC.icons = { svg, hydrate, make, fileIcon, folderIcon, names: Object.keys(P) };
})(window.SC);
