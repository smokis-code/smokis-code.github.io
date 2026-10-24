/* ==========================================================================
   extensions/tkinter.js — runs Python tkinter programs in the App tab.

   The Python side (tkinter-py.js) sends the whole window tree as JSON
   after every change. This file draws it like a Windows app, lays it out
   with Tk's pack/grid/place rules, and sends clicks, typing and key
   presses back to Python.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;

  let pane;
  let desk;
  let emptyEl;
  let statusEl;
  let appRun = null;
  let data = null;
  let lastFocus = null;
  let lastSizes = '';
  let measuring = false;
  const nodes = new Map(); // widget id -> node
  const winState = {};     // window id -> { x, y, max, min }
  const send = (ev) => { if (appRun) SC.runner.send(appRun, { appEvent: ev }); };

  /* ---------- Values ---------- */
  const UNITS = { c: 37.8, m: 3.78, i: 96, p: 4 / 3 };
  function num(v, d = 0) {
    if (v == null || v === '') return d;
    if (typeof v === 'number') return v;
    const m = /^(-?[\d.]+)\s*([cmip]?)$/.exec(String(v).trim());
    return m ? parseFloat(m[1]) * (UNITS[m[2]] || 1) : d;
  }
  function pair(v) {
    if (Array.isArray(v)) return [num(v[0]), num(v.length > 1 ? v[1] : v[0])];
    const s = String(v == null ? 0 : v).trim().split(/\s+/);
    return [num(s[0]), num(s.length > 1 ? s[1] : s[0])];
  }

  const SYSTEM_COLORS = {
    systembuttonface: '#f0f0f0', systembuttontext: '#000000', systemwindow: '#ffffff', systemwindowtext: '#000000',
    systemhighlight: '#0078d7', systemhighlighttext: '#ffffff', systemdisabledtext: '#6d6d6d', systemmenu: '#f0f0f0',
    systemmenutext: '#000000', systemscrollbar: '#c8c8c8', systembuttonhighlight: '#ffffff', systembuttonshadow: '#a0a0a0',
    system3dlight: '#e3e3e3', systemactivecaption: '#99b4d1', systeminfobackground: '#ffffe1', systeminfotext: '#000000',
  };
  const colorCache = new Map();
  function color(c, fallback = '') {
    if (c == null || c === '') return fallback;
    const key = String(c);
    if (colorCache.has(key)) return colorCache.get(key) || fallback;
    let s = key.trim();
    let out = '';
    if (s[0] === '#') {
      if (s.length === 13) s = '#' + s.slice(1, 3) + s.slice(5, 7) + s.slice(9, 11);
      out = CSS.supports('color', s) ? s : '';
    } else {
      const k = s.toLowerCase().replace(/\s+/g, '');
      const g = /^gr[ae]y(\d{1,3})$/.exec(k);
      if (SYSTEM_COLORS[k]) out = SYSTEM_COLORS[k];
      else if (g) { const v = Math.round(255 * Math.min(100, +g[1]) / 100); out = 'rgb(' + v + ',' + v + ',' + v + ')'; }
      else if (CSS.supports('color', k)) out = k;
      else if (CSS.supports('color', k.replace(/\d+$/, ''))) out = k.replace(/\d+$/, '');
    }
    colorCache.set(key, out);
    return out || fallback;
  }

  const FAMILIES = { helvetica: 'Arial', times: '"Times New Roman"', courier: '"Courier New"', tkdefaultfont: '' };
  const NAMED = {
    tkdefaultfont: ['Segoe UI', 9], tktextfont: ['Segoe UI', 9], tkmenufont: ['Segoe UI', 9], tkheadingfont: ['Segoe UI', 9, 'bold'],
    tkcaptionfont: ['Segoe UI', 9], tksmallcaptionfont: ['Segoe UI', 8], tkiconfont: ['Segoe UI', 9], tktooltipfont: ['Segoe UI', 8],
    tkfixedfont: ['Consolas', 10],
  };
  /** Tk font ("Arial 12 bold", ["Arial", 12, "bold"], "TkFixedFont") -> CSS font */
  function cssFont(f) {
    if (f == null || f === '') return '';
    let parts;
    if (Array.isArray(f)) parts = f.map(String);
    else {
      const s = String(f).trim();
      if (NAMED[s.toLowerCase()]) parts = NAMED[s.toLowerCase()].map(String);
      else {
        parts = [];
        const re = /\{([^}]*)\}|(\S+)/g;
        let m;
        while ((m = re.exec(s))) parts.push(m[1] != null ? m[1] : m[2]);
      }
    }
    const family = parts[0] || 'Segoe UI';
    const size = parts.length > 1 && /^-?\d+$/.test(parts[1]) ? +parts[1] : 9;
    const styles = parts.slice(size !== 9 || parts[1] === '9' ? 2 : 1).join(' ').toLowerCase();
    const px = size < 0 ? -size : Math.round(size * 4 / 3);
    const fam = FAMILIES[family.toLowerCase()] != null ? FAMILIES[family.toLowerCase()] : '"' + family.replace(/"/g, '') + '"';
    return (/italic/.test(styles) ? 'italic ' : '') + (/bold/.test(styles) ? '700 ' : '400 ') + px + 'px ' + (fam ? fam + ', ' : '') + '"Segoe UI", Tahoma, Arial, sans-serif';
  }
  const CURSORS = { hand2: 'pointer', hand1: 'pointer', xterm: 'text', watch: 'wait', cross: 'crosshair', crosshair: 'crosshair', arrow: 'default', fleur: 'move', sb_h_double_arrow: 'ew-resize', sb_v_double_arrow: 'ns-resize', plus: 'cell', circle: 'not-allowed', question_arrow: 'help' };
  const RELIEF = { raised: 'outset', sunken: 'inset', groove: 'groove', ridge: 'ridge', solid: 'solid', flat: 'none' };
  // Anchors: n, ne, e, se, s, sw, w, nw or center ("center" must not count as e or n)
  const ANCHOR_X = (a) => { a = String(a || 'center'); return a === 'center' ? 0.5 : /w/.test(a) ? 0 : /e/.test(a) ? 1 : 0.5; };
  const ANCHOR_Y = (a) => { a = String(a || 'center'); return a === 'center' ? 0.5 : /n/.test(a) ? 0 : /s/.test(a) ? 1 : 0.5; };

  /* ---------- Creating elements ---------- */
  const isWindow = (w) => w.type === 'Tk' || w.type === 'Toplevel';

  function create(w) {
    const n = { id: w.id, type: w.type, sent: [] };
    const attrs = { 'data-tkid': w.id };
    switch (w.type) {
      case 'Tk': case 'Toplevel': {
        n.title = el('span', { class: 'tkw-title' });
        n.menubar = el('div', { class: 'tkw-menubar', hidden: true });
        n.content = el('div', { class: 'tkw-client' });
        const btn = (cls, label, fn) => el('button', { class: 'tkw-btn ' + cls, type: 'button', title: label, 'aria-label': label, onClick: fn });
        n.bar = el('div', { class: 'tkw-bar' },
          el('span', { class: 'tkw-icon', 'aria-hidden': 'true' }), n.title,
          el('div', { class: 'tkw-btns' },
            btn('min', 'Minimize', () => { state(w.id).min = !state(w.id).min; redraw(); }),
            btn('max', 'Maximize', () => { state(w.id).max = !state(w.id).max; redraw(); }),
            btn('close', 'Close', () => send({ type: 'close', id: w.id }))));
        n.bar.addEventListener('pointerdown', (e) => dragWindow(e, n));
        n.bar.addEventListener('dblclick', () => { state(w.id).max = !state(w.id).max; redraw(); });
        n.el = el('div', Object.assign({ class: 'tkw', tabindex: '-1', role: 'dialog' }, attrs), n.bar, n.menubar, n.content);
        break;
      }
      case 'Frame': case 'Separator':
        n.el = el('div', Object.assign({ class: 'tkx tk-' + w.type.toLowerCase() }, attrs));
        n.content = n.el;
        break;
      case 'LabelFrame':
        n.label = el('span', { class: 'tk-lf-label' });
        n.content = el('div', { class: 'tk-lf-body' });
        n.el = el('div', Object.assign({ class: 'tkx tk-labelframe' }, attrs), el('div', { class: 'tk-lf-box' }), n.label, n.content);
        break;
      case 'Label': case 'Message':
        n.text = el('span', { class: 'tk-text' });
        n.el = el('div', Object.assign({ class: 'tkx tk-label' }, attrs), n.text);
        break;
      case 'Button': case 'Menubutton':
        n.text = el('span', { class: 'tk-text' });
        n.el = el('button', Object.assign({ class: 'tkx tk-button', type: 'button' }, attrs), n.text);
        n.el.addEventListener('click', () => send({ type: 'invoke', id: w.id }));
        break;
      case 'Checkbutton': case 'Radiobutton':
        n.text = el('span', { class: 'tk-text' });
        n.box = el('span', { class: 'tk-box' + (w.type === 'Radiobutton' ? ' radio' : '') });
        n.el = el('div', Object.assign({ class: 'tkx tk-check', tabindex: '0', role: w.type === 'Radiobutton' ? 'radio' : 'checkbox' }, attrs), n.box, n.text);
        n.el.addEventListener('click', () => { if (!n.el.classList.contains('is-disabled')) send({ type: 'invoke', id: w.id }); });
        n.el.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); send({ type: 'invoke', id: w.id }); } });
        break;
      case 'Entry':
        n.input = el('input', { class: 'tk-input', type: 'text', spellcheck: 'false', autocomplete: 'off' });
        n.el = el('div', Object.assign({ class: 'tkx tk-entry' }, attrs), n.input);
        textInput(n);
        break;
      case 'Spinbox':
        n.input = el('input', { class: 'tk-input', type: 'text', spellcheck: 'false', autocomplete: 'off' });
        n.el = el('div', Object.assign({ class: 'tkx tk-entry tk-spin' }, attrs), n.input,
          el('div', { class: 'tk-spin-btns' },
            el('button', { type: 'button', tabindex: '-1', 'aria-label': 'Up', text: '▴', onClick: () => spin(n, 1) }),
            el('button', { type: 'button', tabindex: '-1', 'aria-label': 'Down', text: '▾', onClick: () => spin(n, -1) })));
        textInput(n);
        break;
      case 'Combobox':
        n.input = el('input', { class: 'tk-input', type: 'text', spellcheck: 'false', autocomplete: 'off' });
        n.el = el('div', Object.assign({ class: 'tkx tk-entry tk-combo' }, attrs), n.input,
          el('button', { class: 'tk-drop-btn', type: 'button', tabindex: '-1', 'aria-label': 'Open list', text: '▾', onClick: () => comboList(n) }));
        n.input.addEventListener('mousedown', () => { if (n.input.readOnly && !n.disabled) setTimeout(() => comboList(n)); });
        textInput(n);
        break;
      case 'OptionMenu':
        n.text = el('span', { class: 'tk-text' });
        n.el = el('button', Object.assign({ class: 'tkx tk-button tk-optionmenu', type: 'button' }, attrs), n.text, el('span', { class: 'tk-arrow', text: '▾' }));
        n.el.addEventListener('click', () => openList(n.el, n.data.values || [], n.data.value, (v) => send({ type: 'value', id: n.id, value: v })));
        break;
      case 'Text':
        n.input = el('textarea', { class: 'tk-textarea', spellcheck: 'false' });
        n.el = el('div', Object.assign({ class: 'tkx tk-textbox' }, attrs), n.input);
        textInput(n);
        break;
      case 'Scale':
        n.label = el('span', { class: 'tk-scale-label' });
        n.valueEl = el('span', { class: 'tk-scale-value' });
        n.input = el('input', { class: 'tk-range', type: 'range' });
        n.el = el('div', Object.assign({ class: 'tkx tk-scale' }, attrs), n.label, n.valueEl, n.input);
        n.input.addEventListener('input', () => send({ type: 'value', id: n.id, value: Number(n.input.value) }));
        break;
      case 'Listbox':
        n.el = el('div', Object.assign({ class: 'tkx tk-listbox', tabindex: '0', role: 'listbox' }, attrs));
        n.el.addEventListener('click', (e) => listClick(n, e));
        n.el.addEventListener('keydown', (e) => listKey(n, e));
        break;
      case 'Canvas':
        n.canvas = el('canvas', { class: 'tk-canvas-el' });
        n.el = el('div', Object.assign({ class: 'tkx tk-canvas', tabindex: '-1' }, attrs), n.canvas);
        n.content = n.el;
        break;
      case 'Scrollbar':
        n.el = el('div', Object.assign({ class: 'tkx tk-scrollbar' }, attrs), el('div', { class: 'tk-scroll-thumb' }));
        break;
      case 'Progressbar':
        n.bar = el('div', { class: 'tk-progress-bar' });
        n.el = el('div', Object.assign({ class: 'tkx tk-progress', role: 'progressbar' }, attrs), n.bar);
        break;
      case 'Notebook':
        n.tabs = el('div', { class: 'tk-nb-tabs', role: 'tablist' });
        n.content = el('div', { class: 'tk-nb-body' });
        n.el = el('div', Object.assign({ class: 'tkx tk-notebook' }, attrs), n.tabs, n.content);
        break;
      case 'Treeview':
        n.table = el('table', { class: 'tk-tree-table' });
        n.el = el('div', Object.assign({ class: 'tkx tk-tree', tabindex: '0' }, attrs), n.table);
        n.el.addEventListener('click', (e) => treeClick(n, e));
        break;
      case 'Menu':
        n.el = el('div', { hidden: true });
        break;
      default:
        n.el = el('div', Object.assign({ class: 'tkx' }, attrs));
        n.content = n.el;
    }
    return n;
  }

  /** Typing in Entry, Text, Spinbox and Combobox goes to Python as it happens. */
  function textInput(n) {
    n.input.addEventListener('input', () => {
      n.sent.push(n.input.value);
      if (n.sent.length > 40) n.sent.shift();
      send({ type: 'value', id: n.id, value: n.input.value });
    });
    n.input.addEventListener('change', () => {
      if (n.type === 'Combobox' && (n.data.values || []).includes(n.input.value)) send({ type: 'value', id: n.id, value: n.input.value, select: true });
    });
    n.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Tab') n.sent = []; });
    n.input.addEventListener('blur', () => { n.sent = []; });
  }

  function spin(n, dir) {
    if (n.disabled) return;
    const o = n.data.opts;
    const values = Array.isArray(o.values) ? o.values.map(String) : o.values ? String(o.values).split(/\s+/) : null;
    let next;
    if (values && values.length) {
      const i = values.indexOf(n.input.value);
      next = values[Math.max(0, Math.min(values.length - 1, (i === -1 ? 0 : i + dir)))];
    } else {
      const inc = num(o.increment, 1) || 1;
      const lo = num(o.from, 0);
      const hi = num(o.to, 100);
      const v = Math.max(lo, Math.min(hi, (parseFloat(n.input.value) || 0) + dir * inc));
      next = String(Number.isInteger(inc) && Number.isInteger(lo) ? Math.round(v) : +v.toFixed(6));
    }
    n.input.value = next;
    send({ type: 'value', id: n.id, value: next, step: true });
  }

  function comboList(n) {
    if (n.disabled) return;
    openList(n.el, n.data.values || [], n.input.value, (v) => { n.input.value = v; send({ type: 'value', id: n.id, value: v, select: true }); });
  }

  function listClick(n, e) {
    const item = e.target.closest('.tk-lb-item');
    if (!item || n.disabled) return;
    const i = Number(item.dataset.index);
    const mode = String(n.data.opts.selectmode || 'browse');
    let sel = new Set(n.data.selection || []);
    if (mode === 'multiple') { if (sel.has(i)) sel.delete(i); else sel.add(i); }
    else if (mode === 'extended' && (e.ctrlKey || e.metaKey)) { if (sel.has(i)) sel.delete(i); else sel.add(i); }
    else if (mode === 'extended' && e.shiftKey && sel.size) { const a = Math.min(...sel); sel = new Set(); for (let k = Math.min(a, i); k <= Math.max(a, i); k++) sel.add(k); }
    else sel = new Set([i]);
    n.data.selection = Array.from(sel);
    paintList(n);
    send({ type: 'value', id: n.id, value: n.data.selection });
  }

  function listKey(n, e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = n.data.items || [];
    if (!items.length) return;
    const cur = (n.data.selection || [])[0];
    const i = Math.max(0, Math.min(items.length - 1, cur == null ? 0 : cur + (e.key === 'ArrowDown' ? 1 : -1)));
    n.data.selection = [i];
    paintList(n);
    send({ type: 'value', id: n.id, value: [i] });
  }

  function treeClick(n, e) {
    const row = e.target.closest('tr[data-iid]');
    if (!row) return;
    const iid = row.dataset.iid;
    let sel = (n.data.selection || []).slice();
    if (String(n.data.opts.selectmode || 'extended') === 'extended' && (e.ctrlKey || e.metaKey)) sel = sel.includes(iid) ? sel.filter((x) => x !== iid) : sel.concat(iid);
    else sel = [iid];
    n.data.selection = sel;
    n.table.querySelectorAll('tr[data-iid]').forEach((tr) => tr.classList.toggle('selected', sel.includes(tr.dataset.iid)));
    send({ type: 'value', id: n.id, value: sel });
  }

  /* ---------- Updating elements from Python's state ---------- */
  function update(n, w) {
    const o = w.opts || {};
    const st = n.el.style;
    n.data = w;
    n.disabled = o.state === 'disabled';
    n.el.classList.toggle('is-disabled', n.disabled);
    n.el.classList.toggle('is-ttk', !!w.ttk);
    if (n.type === 'Menu') return;
    if (isWindow(w)) return updateWindow(n, w);
    st.font = cssFont(o.font);
    const bg = color(o.background);
    const fg = color(o.foreground);
    if (n.input && n.type !== 'Scale') { n.input.style.background = bg; n.input.style.color = fg; n.input.style.caretColor = color(o.insertbackground) || ''; }
    else st.background = bg;
    st.color = fg;
    st.cursor = CURSORS[o.cursor] || '';
    const bw = o.borderwidth;
    const relief = o.relief;
    if ((relief && relief !== 'flat') || (bw != null && n.type !== 'Button' && n.type !== 'Entry')) {
      const width = num(bw, relief && relief !== 'flat' ? 2 : 0);
      st.border = width && relief !== 'flat' ? width + 'px ' + (RELIEF[relief] || 'solid') + ' ' + (relief === 'solid' ? '#404040' : '#b5b5b5') : width ? width + 'px solid transparent' : '0';
    } else st.border = '';
    if (o.padx != null || o.pady != null) {
      if (n.content === n.el) st.padding = '';
      else st.padding = num(o.pady) + 'px ' + num(o.padx) + 'px';
    } else st.padding = '';
    if (n.text) {
      n.text.textContent = w.text != null ? w.text : o.text != null ? String(o.text) : '';
      const wrap = num(o.wraplength) || (n.type === 'Message' ? 300 : 0);
      n.text.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
      n.text.style.maxWidth = wrap ? wrap + 'px' : '';
      n.text.style.textAlign = o.justify || 'center';
      st.justifyContent = ['flex-start', 'center', 'flex-end'][ANCHOR_X(o.anchor || 'center') * 2];
      st.alignItems = ['flex-start', 'center', 'flex-end'][ANCHOR_Y(o.anchor || 'center') * 2];
    }
    if (n.el.tagName === 'BUTTON') n.el.disabled = n.disabled;
    switch (n.type) {
      case 'LabelFrame':
        n.label.textContent = o.text != null ? String(o.text) : '';
        n.label.hidden = !n.label.textContent;
        break;
      case 'Checkbutton': case 'Radiobutton':
        n.el.classList.toggle('checked', !!w.checked);
        n.el.setAttribute('aria-checked', String(!!w.checked));
        break;
      case 'Entry': case 'Spinbox': case 'Combobox':
        setText(n, w.value || '');
        n.input.type = o.show ? 'password' : 'text';
        n.input.readOnly = o.state === 'readonly';
        n.input.disabled = n.disabled;
        n.input.style.textAlign = o.justify || 'left';
        break;
      case 'OptionMenu':
        n.text.textContent = w.value || '';
        break;
      case 'Text':
        setText(n, w.value || '');
        n.input.readOnly = n.disabled;
        n.input.style.whiteSpace = o.wrap === 'none' ? 'pre' : 'pre-wrap';
        n.input.style.wordBreak = o.wrap === 'char' || !o.wrap ? 'break-all' : 'normal';
        break;
      case 'Scale': {
        const vertical = (o.orient || (w.ttk ? 'horizontal' : 'vertical')) === 'vertical';
        n.el.classList.toggle('vertical', vertical);
        const lo = num(o.from, 0);
        const hi = num(o.to, 100);
        n.input.min = String(Math.min(lo, hi));
        n.input.max = String(Math.max(lo, hi));
        n.input.step = num(o.resolution, w.ttk ? 0 : 1) > 0 ? String(num(o.resolution, 1)) : 'any';
        if (document.activeElement !== n.input) n.input.value = String(w.value);
        n.input.disabled = n.disabled;
        n.label.textContent = o.label ? String(o.label) : '';
        n.label.hidden = !o.label;
        const show = o.showvalue == null ? !w.ttk : !!Number(o.showvalue);
        n.valueEl.hidden = !show;
        n.valueEl.textContent = String(w.value);
        break;
      }
      case 'Listbox': paintList(n); break;
      case 'Progressbar': {
        const max = num(o.maximum, 100) || 100;
        const vertical = o.orient === 'vertical';
        n.el.classList.toggle('vertical', vertical);
        n.el.classList.toggle('indeterminate', o.mode === 'indeterminate' && !!o.running);
        const pct = Math.max(0, Math.min(100, (num(w.value) / max) * 100));
        n.bar.style.width = vertical ? '100%' : (o.mode === 'indeterminate' ? '' : pct + '%');
        n.bar.style.height = vertical ? pct + '%' : '100%';
        break;
      }
      case 'Separator': n.el.classList.toggle('vertical', o.orient === 'vertical'); break;
      case 'Scrollbar': n.el.classList.toggle('horizontal', o.orient === 'horizontal'); break;
      case 'Notebook': paintTabs(n); break;
      case 'Treeview': paintTree(n); break;
      default: break;
    }
  }

  /** Set an input's text unless it is only Python echoing what the user just typed. */
  function setText(n, value) {
    if (n.input.value === value) return;
    if (document.activeElement === n.input && n.sent.includes(value)) return;
    n.input.value = value;
  }

  function paintList(n) {
    const items = n.data.items || [];
    const sel = new Set(n.data.selection || []);
    const key = JSON.stringify(items);
    if (n.listKey !== key) {
      n.listKey = key;
      n.el.textContent = '';
      items.forEach((t, i) => n.el.append(el('div', { class: 'tk-lb-item', 'data-index': String(i), role: 'option', text: t || ' ' })));
    }
    Array.from(n.el.children).forEach((c, i) => c.classList.toggle('selected', sel.has(i)));
  }

  function paintTabs(n) {
    const tabs = n.data.tabs || [];
    n.tabs.textContent = '';
    tabs.forEach((t, i) => {
      const b = el('button', { class: 'tk-nb-tab' + (t.id === n.data.selected ? ' active' : ''), type: 'button', role: 'tab', text: t.text || ' ' });
      b.disabled = t.state === 'disabled';
      b.addEventListener('click', () => send({ type: 'tab', id: n.id, index: i }));
      n.tabs.append(b);
    });
  }

  function paintTree(n) {
    const d = n.data;
    const show = String(d.opts.show || 'tree headings');
    const cols = (show.includes('tree') ? ['#0'] : []).concat(d.columns || []);
    const head = show.includes('headings') ? el('tr', {}, cols.map((c) => {
      const cfg = (d.colcfg || {})[c] || {};
      return el('th', { text: ((d.headings || {})[c] || {}).text || '', style: { width: num(cfg.width, 200) + 'px' } });
    })) : null;
    const sel = d.selection || [];
    const rows = (d.rows || []).map((r) => el('tr', { 'data-iid': r.id, class: sel.includes(r.id) ? 'selected' : '' }, cols.map((c, k) => {
      const cfg = (d.colcfg || {})[c] || {};
      const text = c === '#0' ? r.text : r.values[(d.columns || []).indexOf(c)] || '';
      return el('td', { text, style: { paddingLeft: (k === 0 && c === '#0' ? 4 + r.depth * 18 : 4) + 'px', textAlign: { e: 'right', center: 'center' }[cfg.anchor] || 'left' } });
    })));
    n.table.textContent = '';
    if (head) n.table.append(el('thead', {}, head));
    n.table.append(el('tbody', {}, rows));
  }

  function updateWindow(n, w) {
    const o = w.opts || {};
    n.title.textContent = o.title != null ? String(o.title) : 'tk';
    n.content.style.background = color(o.background, '#f0f0f0');
    n.el.hidden = !!o.withdrawn;
    const menu = o.menu ? nodes.get(o.menu) : null;
    n.menubar.hidden = !menu;
    n.menubar.textContent = '';
    if (menu) {
      (menu.data.entries || []).forEach((entry, i) => {
        if (entry.type === 'separator') return;
        const item = el('button', { class: 'tk-mb-item', type: 'button', text: entry.label });
        item.disabled = entry.state === 'disabled';
        item.addEventListener('click', () => {
          if (entry.type === 'cascade' && entry.menu) openMenu(entry.menu, item);
          else send({ type: 'menu', id: menu.id, index: i });
        });
        n.menubar.append(item);
      });
    }
  }

  /* ---------- Layout (Tk's pack, grid and place) ---------- */
  function kidsOf(n) {
    const out = [];
    for (const k of nodes.values()) if (k.data && k.data.parent === n.id && k.data.manager && !isWindow(k.data)) out.push(k);
    return out;
  }

  /** Space a container takes around its children: total [w, h] and where children start [x, y]. */
  function insets(n) {
    const o = n.data.opts || {};
    const bw = n.content === n.el ? num(o.borderwidth, 0) + (o.relief && o.relief !== 'flat' && o.borderwidth == null ? 2 : 0) : 0;
    let px = 0;
    let py = 0;
    if (n.data.ttk && o.padding != null) [px, py] = pair(o.padding);
    else if (n.type === 'Frame' || n.type === 'Toplevel' || n.type === 'Tk') { px = num(o.padx); py = num(o.pady); }
    if (n.type === 'LabelFrame') {
      const lh = n.label.hidden ? 4 : (n.labelH || 16);
      return { w: 4 + 2 * num(o.padx), h: lh + 2 + 2 * num(o.pady), x: num(o.padx), y: num(o.pady) };
    }
    if (n.type === 'Notebook') return { w: 2, h: 26, x: 0, y: 0 };
    return { w: 2 * (bw + px), h: 2 * (bw + py), x: px, y: py };
  }

  function req(n) {
    if (n.req) return n.req;
    const kids = kidsOf(n);
    const o = n.data.opts || {};
    let size;
    if (n.content || kids.length) {
      const ins = insets(n);
      let inner = null;
      if (n.type === 'Notebook') {
        inner = [0, 0];
        for (const k of kids) { const r = req(k); inner = [Math.max(inner[0], r[0]), Math.max(inner[1], r[1])]; }
        inner[0] = Math.max(inner[0], (n.data.tabs || []).length * 70);
      } else if (kids.length && n.data.propagate !== false) {
        const p = packReq(kids.filter((k) => k.data.manager === 'pack'));
        const g = gridReq(n, kids.filter((k) => k.data.manager === 'grid'));
        inner = [Math.max(p[0], g[0]), Math.max(p[1], g[1])];
      }
      if (inner && (inner[0] || inner[1])) size = [inner[0] + ins.w, inner[1] + ins.h];
      else if (n.type === 'Canvas') size = n.natural;
      else if (isWindow(n.data)) size = [200, 200]; // an empty Tk window
      else size = [Math.max(num(o.width), ins.w), Math.max(num(o.height), ins.h)];
      if (n.type === 'LabelFrame') size[0] = Math.max(size[0], (n.labelW || 0) + 20);
      if (n.natural && n.type !== 'Frame' && n.type !== 'LabelFrame' && n.type !== 'Notebook') size = [Math.max(size[0], n.natural[0]), Math.max(size[1], n.natural[1])];
    } else size = n.natural || [0, 0];
    n.req = size;
    return size;
  }

  function packReq(kids) {
    let width = 0;
    let height = 0;
    let maxW = 0;
    let maxH = 0;
    for (const k of kids.sort((a, b) => (a.data.layout.seq || 0) - (b.data.layout.seq || 0))) {
      const l = k.data.layout;
      const [rw, rh] = req(k);
      const px = pair(l.padx);
      const py = pair(l.pady);
      const cw = rw + px[0] + px[1] + 2 * num(l.ipadx);
      const ch = rh + py[0] + py[1] + 2 * num(l.ipady);
      const side = l.side || 'top';
      if (side === 'top' || side === 'bottom') { maxW = Math.max(maxW, cw + width); height += ch; }
      else { maxH = Math.max(maxH, ch + height); width += cw; }
    }
    return [Math.max(maxW, width), Math.max(maxH, height)];
  }

  function packArrange(kids, W, H, ox, oy) {
    kids.sort((a, b) => (a.data.layout.seq || 0) - (b.data.layout.seq || 0));
    let cx = 0;
    let cy = 0;
    let cw = W;
    let ch = H;
    const dims = kids.map((k) => {
      const l = k.data.layout;
      const [rw, rh] = req(k);
      return { k, l, rw, rh, px: pair(l.padx), py: pair(l.pady), ipx: 2 * num(l.ipadx), ipy: 2 * num(l.ipady), side: l.side || 'top', expand: !!l.expand && l.expand !== '0' && l.expand !== 'false' };
    });
    const vertical = (d) => d.side === 'top' || d.side === 'bottom';
    function expansion(i, cavity, horizontal) {
      let minExpand = cavity;
      let count = 0;
      for (let j = i; j < dims.length; j++) {
        const d = dims[j];
        const size = horizontal ? d.rw + d.px[0] + d.px[1] + d.ipx : d.rh + d.py[0] + d.py[1] + d.ipy;
        if (horizontal ? vertical(d) : !vertical(d)) {
          if (count) minExpand = Math.min(minExpand, (cavity - size) / count);
        } else {
          cavity -= size;
          if (d.expand) count++;
        }
      }
      if (count) minExpand = Math.min(minExpand, cavity / count);
      return Math.max(0, count ? minExpand : 0);
    }
    dims.forEach((d, i) => {
      let fx;
      let fy;
      let fw;
      let fh;
      if (vertical(d)) {
        fh = d.rh + d.py[0] + d.py[1] + d.ipy;
        if (d.expand) fh += expansion(i, ch, false);
        fh = Math.max(0, Math.min(fh, ch));
        fw = cw;
        fx = cx;
        fy = d.side === 'top' ? cy : cy + ch - fh;
        if (d.side === 'top') cy += fh;
        ch -= fh;
      } else {
        fw = d.rw + d.px[0] + d.px[1] + d.ipx;
        if (d.expand) fw += expansion(i, cw, true);
        fw = Math.max(0, Math.min(fw, cw));
        fh = ch;
        fy = cy;
        fx = d.side === 'left' ? cx : cx + cw - fw;
        if (d.side === 'left') cx += fw;
        cw -= fw;
      }
      const availW = Math.max(0, fw - d.px[0] - d.px[1]);
      const availH = Math.max(0, fh - d.py[0] - d.py[1]);
      const fill = String(d.l.fill || 'none');
      let ww = d.rw + d.ipx;
      let wh = d.rh + d.ipy;
      if (fill === 'x' || fill === 'both' || ww > availW) ww = availW;
      if (fill === 'y' || fill === 'both' || wh > availH) wh = availH;
      const a = d.l.anchor || 'center';
      place(d.k, ox + fx + d.px[0] + (availW - ww) * ANCHOR_X(a), oy + fy + d.py[0] + (availH - wh) * ANCHOR_Y(a), ww, wh);
    });
  }

  function gridTable(n, kids) {
    const cells = kids.map((k) => {
      const l = k.data.layout;
      const [rw, rh] = req(k);
      const px = pair(l.padx);
      const py = pair(l.pady);
      const ipx = 2 * num(l.ipadx);
      const ipy = 2 * num(l.ipady);
      return { k, l, c: num(l.column), r: num(l.row), cs: Math.max(1, num(l.columnspan, 1)), rs: Math.max(1, num(l.rowspan, 1)), rw: rw + ipx, rh: rh + ipy, px, py, sticky: String(l.sticky || '').toLowerCase() };
    });
    const nc = Math.max(0, ...cells.map((x) => x.c + x.cs), ...Object.keys(n.data.cols || {}).map((x) => +x + 1).filter((x) => x <= 50));
    const nr = Math.max(0, ...cells.map((x) => x.r + x.rs), ...Object.keys(n.data.rows || {}).map((x) => +x + 1).filter((x) => x <= 50));
    const cfg = (table, i) => (table || {})[String(i)] || {};
    const colW = Array.from({ length: nc }, (_, i) => num(cfg(n.data.cols, i).minsize));
    const rowH = Array.from({ length: nr }, (_, i) => num(cfg(n.data.rows, i).minsize));
    const fit = (sizes, start, span, need, cfgTable) => {
      let have = 0;
      for (let i = start; i < start + span; i++) have += sizes[i];
      if (need <= have) return;
      const idx = [];
      for (let i = start; i < start + span; i++) idx.push(i);
      const weighted = idx.filter((i) => num(cfg(cfgTable, i).weight) > 0);
      const share = weighted.length ? weighted : idx;
      share.forEach((i) => { sizes[i] += (need - have) / share.length; });
    };
    cells.filter((x) => x.cs === 1).forEach((x) => { colW[x.c] = Math.max(colW[x.c], x.rw + x.px[0] + x.px[1]); });
    cells.filter((x) => x.rs === 1).forEach((x) => { rowH[x.r] = Math.max(rowH[x.r], x.rh + x.py[0] + x.py[1]); });
    cells.filter((x) => x.cs > 1).forEach((x) => fit(colW, x.c, x.cs, x.rw + x.px[0] + x.px[1], n.data.cols));
    cells.filter((x) => x.rs > 1).forEach((x) => fit(rowH, x.r, x.rs, x.rh + x.py[0] + x.py[1], n.data.rows));
    return { cells, colW, rowH };
  }

  function gridReq(n, kids) {
    if (!kids.length) return [0, 0];
    const t = gridTable(n, kids);
    return [t.colW.reduce((a, b) => a + b, 0), t.rowH.reduce((a, b) => a + b, 0)];
  }

  function spread(sizes, extra, cfgTable) {
    const weights = sizes.map((_, i) => num(((cfgTable || {})[String(i)] || {}).weight));
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total || !extra) return sizes;
    return sizes.map((s, i) => Math.max(0, s + (extra * weights[i]) / total));
  }

  function gridArrange(n, kids, W, H, ox, oy) {
    const t = gridTable(n, kids);
    const colW = spread(t.colW, W - t.colW.reduce((a, b) => a + b, 0), n.data.cols);
    const rowH = spread(t.rowH, H - t.rowH.reduce((a, b) => a + b, 0), n.data.rows);
    const colX = [0];
    colW.forEach((w, i) => colX.push(colX[i] + w));
    const rowY = [0];
    rowH.forEach((h, i) => rowY.push(rowY[i] + h));
    for (const x of t.cells) {
      const cellW = colX[x.c + x.cs] - colX[x.c];
      const cellH = rowY[x.r + x.rs] - rowY[x.r];
      const availW = Math.max(0, cellW - x.px[0] - x.px[1]);
      const availH = Math.max(0, cellH - x.py[0] - x.py[1]);
      const sw = x.sticky.includes('w');
      const se = x.sticky.includes('e');
      const sn = x.sticky.includes('n');
      const ss = x.sticky.includes('s');
      const ww = sw && se ? availW : Math.min(x.rw, availW);
      const wh = sn && ss ? availH : Math.min(x.rh, availH);
      const dx = sw ? 0 : se ? availW - ww : (availW - ww) / 2;
      const dy = sn ? 0 : ss ? availH - wh : (availH - wh) / 2;
      place(x.k, ox + colX[x.c] + x.px[0] + dx, oy + rowY[x.r] + x.py[0] + dy, ww, wh);
    }
  }

  function placeArrange(kids, W, H, ox, oy) {
    for (const k of kids) {
      const l = k.data.layout;
      const [rw, rh] = req(k);
      const w = l.width != null || l.relwidth != null ? num(l.width) + num(l.relwidth) * W : rw;
      const h = l.height != null || l.relheight != null ? num(l.height) + num(l.relheight) * H : rh;
      const a = l.anchor || 'nw';
      const x = num(l.x) + num(l.relx) * W - w * ANCHOR_X(a);
      const y = num(l.y) + num(l.rely) * H - h * ANCHOR_Y(a);
      place(k, ox + x, oy + y, w, h);
    }
  }

  function place(k, x, y, w, h) {
    const st = k.el.style;
    st.left = Math.round(x) + 'px';
    st.top = Math.round(y) + 'px';
    st.width = Math.max(0, Math.round(w)) + 'px';
    st.height = Math.max(0, Math.round(h)) + 'px';
    k.box = [Math.round(w), Math.round(h), Math.round(x), Math.round(y)];
    k.placed = true;
    arrange(k, w, h);
  }

  function arrange(n, W, H) {
    const kids = kidsOf(n);
    if (!kids.length) return;
    const ins = insets(n);
    const cw = Math.max(0, W - ins.w);
    const chh = Math.max(0, H - ins.h);
    if (n.type === 'Notebook') {
      for (const k of kids) {
        const visible = k.id === n.data.selected;
        k.el.hidden = !visible;
        if (visible) place(k, 0, 0, cw, chh);
      }
      return;
    }
    const by = (m) => kids.filter((k) => k.data.manager === m);
    packArrange(by('pack'), cw, chh, ins.x, ins.y);
    gridArrange(n, by('grid'), cw, chh, ins.x, ins.y);
    placeArrange(by('place'), cw, chh, ins.x, ins.y);
  }

  /** Measure each widget's natural size, the way Tk asks for "requested size". */
  function measure(list) {
    desk.classList.add('measuring');
    for (const n of list) {
      const o = n.data.opts || {};
      const st = n.el.style;
      st.left = '0';
      st.top = '0';
      st.width = '';
      st.height = '';
      const t = n.type;
      const lines = (k) => 'calc(' + k + ' * 1.25em + 2px)';
      if (n.text && t !== 'OptionMenu') {
        st.width = num(o.width) > 0 ? num(o.width) + 'ch' : 'max-content';
        if (num(o.height) > 0) st.height = 'calc(' + num(o.height) + ' * 1.34em)';
      } else if (t === 'OptionMenu') st.width = 'max-content';
      else if (t === 'Entry' || t === 'Spinbox' || t === 'Combobox') st.width = num(o.width, 20) + 'ch';
      else if (t === 'Text') { st.width = num(o.width, 80) + 'ch'; st.height = lines(num(o.height, 24)); }
      else if (t === 'Listbox') {
        st.width = num(o.width, 20) > 0 ? num(o.width, 20) + 'ch' : 'max-content';
        st.height = num(o.height, 10) > 0 ? 'calc(' + num(o.height, 10) + ' * 1.34em + 4px)' : 'max-content';
      } else if (t === 'Canvas') { st.width = num(o.width, 378) + 'px'; st.height = num(o.height, 265) + 'px'; }
      else if (t === 'Scale') {
        const len = num(o.length, 100) + 'px';
        if (n.el.classList.contains('vertical')) st.height = len; else st.width = len;
      } else if (t === 'Progressbar') {
        const len = num(o.length, 100);
        if (o.orient === 'vertical') { st.width = '20px'; st.height = len + 'px'; } else { st.width = len + 'px'; st.height = '20px'; }
      } else if (t === 'Treeview') {
        const show = String(o.show || 'tree headings');
        const cols = (show.includes('tree') ? ['#0'] : []).concat(n.data.columns || []);
        st.width = cols.reduce((a, c) => a + num(((n.data.colcfg || {})[c] || {}).width, 200), 0) + 'px';
        st.height = (num(o.height, 10) + (show.includes('headings') ? 1 : 0)) * 21 + 4 + 'px';
      }
    }
    for (const n of list) {
      n.natural = [n.el.offsetWidth, n.el.offsetHeight];
      if (n.type === 'LabelFrame') { n.labelH = n.label.offsetHeight; n.labelW = n.label.offsetWidth; }
    }
    desk.classList.remove('measuring');
  }

  /* ---------- Drawing ---------- */
  function state(id) { return (winState[id] = winState[id] || {}); }

  function redraw() { if (data) draw(data); }

  function draw(d) {
    closePopups();
    const byId = new Map(d.widgets.map((w) => [w.id, w]));
    for (const [id, n] of nodes) {
      if (!byId.has(id) || byId.get(id).type !== n.type) { n.el.remove(); nodes.delete(id); }
    }
    for (const w of d.widgets) {
      let n = nodes.get(w.id);
      if (!n) { n = create(w); nodes.set(w.id, n); }
      n.data = w;
      n.req = null;
      n.placed = false;
    }
    for (const w of d.widgets) {
      if (w.type === 'Menu') continue;
      const n = nodes.get(w.id);
      const parent = w.parent ? nodes.get(w.parent) : null;
      const host = isWindow(w) || !parent ? desk : parent.content || parent.el;
      if (n.el.parentNode !== host) host.append(n.el);
    }
    for (const w of d.widgets) update(nodes.get(w.id), w);
    // Which widgets are shown: managed, inside a shown parent
    const shown = (n) => {
      if (isWindow(n.data)) return !n.data.opts.withdrawn;
      if (!n.data.manager) return false;
      const p = nodes.get(n.data.parent);
      return p ? shown(p) : false;
    };
    const visible = [];
    for (const n of nodes.values()) {
      if (n.type === 'Menu') continue;
      const on = shown(n);
      n.el.hidden = !on;
      if (on && !isWindow(n.data)) visible.push(n);
    }
    measure(visible);
    const windows = Array.from(nodes.values()).filter((n) => isWindow(n.data));
    windows.forEach((n, i) => layoutWindow(n, i));
    for (const n of visible) if (!n.placed) n.el.hidden = true;
    for (const n of visible) if (n.type === 'Canvas' && n.placed) drawCanvas(n);
    renderDialogs(d.dialogs || []);
    if (d.popup) { const m = nodes.get(d.popup.id); if (m) openMenuAt(d.popup.id, d.popup.x, d.popup.y); }
    emptyEl.hidden = windows.some((n) => !n.el.hidden);
    statusEl.textContent = windows.length ? 'Running: ' + windows.map((n) => n.title.textContent).join(', ') : '';
    if (d.focus !== lastFocus) {
      lastFocus = d.focus;
      const f = nodes.get(d.focus);
      if (f && !f.el.hidden) (f.input || f.el).focus();
    }
    reportSizes();
  }

  function layoutWindow(n, index) {
    const o = n.data.opts || {};
    const s = state(n.id);
    if (s.x == null) {
      const g = /^(?:=?(\d+)x(\d+))?(?:([+-]-?\d+)([+-]-?\d+))?$/.exec(String(o.geometry || ''));
      s.x = g && g[3] ? Math.max(0, Math.min(parseInt(g[3], 10) / 2, 400)) : 24 + index * 32;
      s.y = g && g[4] ? Math.max(0, Math.min(parseInt(g[4], 10) / 2, 300)) : 16 + index * 32;
    }
    const geo = /^=?(\d+)x(\d+)/.exec(String(o.geometry || ''));
    const r = req(n);
    let W = geo ? +geo[1] : r[0];
    let H = geo ? +geo[2] : r[1];
    if (o.minsize) { W = Math.max(W, num(o.minsize[0])); H = Math.max(H, num(o.minsize[1])); }
    W = Math.max(W, 120);
    H = Math.max(H, 1);
    const chrome = 30 + (n.menubar.hidden ? 0 : 22) + 2;
    if (s.max) {
      W = Math.max(120, desk.clientWidth - 2);
      H = Math.max(1, desk.clientHeight - chrome);
    }
    n.el.style.left = (s.max ? 0 : s.x) + 'px';
    n.el.style.top = (s.max ? 0 : s.y) + 'px';
    n.el.style.width = W + 2 + 'px';
    n.el.classList.toggle('minimized', !!s.min);
    n.content.style.width = W + 'px';
    n.content.style.height = H + 'px';
    n.box = [W, H, s.x, s.y];
    if (!s.min) arrange(n, W, H);
  }

  function drawCanvas(n) {
    const [W, H] = n.box;
    const dpr = window.devicePixelRatio || 1;
    const cv = n.canvas;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const it of n.data.items || []) {
      try { drawItem(ctx, it); } catch (err) { /* skip a broken item */ }
    }
  }

  function drawItem(ctx, it) {
    const o = it.opts || {};
    if (o.state === 'hidden') return;
    const c = it.coords || [];
    const lw = num(o.width, 1);
    const dash = o.dash ? (Array.isArray(o.dash) ? o.dash.map(Number) : [4, 4]) : [];
    ctx.setLineDash(dash);
    ctx.lineWidth = lw;
    const fill = color(o.fill, '');
    const outline = (key, d) => (o[key] === '' ? '' : color(o[key], d));
    switch (it.type) {
      case 'line': {
        if (c.length < 4) return;
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
        ctx.lineCap = o.capstyle === 'round' ? 'round' : o.capstyle === 'projecting' ? 'square' : 'butt';
        ctx.lineJoin = o.joinstyle === 'bevel' ? 'bevel' : o.joinstyle === 'miter' ? 'miter' : 'round';
        ctx.strokeStyle = o.fill === '' ? 'transparent' : color(o.fill, '#000');
        ctx.stroke();
        const head = (x1, y1, x2, y2) => {
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const len = 8 + lw * 2;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - len * Math.cos(ang - 0.4), y2 - len * Math.sin(ang - 0.4));
          ctx.lineTo(x2 - len * Math.cos(ang + 0.4), y2 - len * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fillStyle = color(o.fill, '#000');
          ctx.fill();
        };
        if (o.arrow === 'last' || o.arrow === 'both') head(c[c.length - 4], c[c.length - 3], c[c.length - 2], c[c.length - 1]);
        if (o.arrow === 'first' || o.arrow === 'both') head(c[2], c[3], c[0], c[1]);
        break;
      }
      case 'rectangle': case 'oval': case 'arc': {
        if (c.length < 4) return;
        const x = Math.min(c[0], c[2]);
        const y = Math.min(c[1], c[3]);
        const w = Math.abs(c[2] - c[0]);
        const h = Math.abs(c[3] - c[1]);
        ctx.beginPath();
        if (it.type === 'rectangle') ctx.rect(x, y, w, h);
        else if (it.type === 'oval') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else {
          const start = -num(o.start, 0) * Math.PI / 180;
          const end = start - num(o.extent, 90) * Math.PI / 180;
          const style = o.style || 'pieslice';
          if (style === 'pieslice') ctx.moveTo(x + w / 2, y + h / 2);
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, start, end, end < start);
          if (style !== 'arc') ctx.closePath();
          if (style === 'arc') { ctx.strokeStyle = outline('outline', '#000'); if (lw) ctx.stroke(); return; }
        }
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        const ol = outline('outline', '#000');
        if (ol && lw) { ctx.strokeStyle = ol; ctx.stroke(); }
        break;
      }
      case 'polygon': {
        if (c.length < 4) return;
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
        ctx.closePath();
        const pf = o.fill === '' ? '' : color(o.fill, '#000');
        if (pf) { ctx.fillStyle = pf; ctx.fill(); }
        const ol = color(o.outline, '');
        if (ol && lw) { ctx.strokeStyle = ol; ctx.stroke(); }
        break;
      }
      case 'text': {
        const text = String(o.text == null ? '' : o.text);
        ctx.font = cssFont(o.font) || '400 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = o.fill === '' ? 'transparent' : color(o.fill, '#000');
        const a = o.anchor || 'center';
        const linesOf = text.split('\n');
        const size = parseFloat(/(\d+)px/.exec(ctx.font) ? /(\d+)px/.exec(ctx.font)[1] : 12) * 1.25;
        const widths = linesOf.map((l) => ctx.measureText(l).width);
        const blockW = Math.max(0, ...widths);
        const blockH = size * linesOf.length;
        const left = c[0] - blockW * ANCHOR_X(a);
        const top = c[1] - blockH * ANCHOR_Y(a);
        ctx.textBaseline = 'middle';
        linesOf.forEach((l, i) => {
          const j = o.justify || 'left';
          const lx = j === 'center' ? left + (blockW - widths[i]) / 2 : j === 'right' ? left + blockW - widths[i] : left;
          ctx.fillText(l, lx, top + size * (i + 0.5));
        });
        break;
      }
      default: break;
    }
    ctx.setLineDash([]);
  }

  function reportSizes() {
    const sizes = {};
    for (const n of nodes.values()) if (n.box && !n.el.hidden) sizes[n.id] = n.box;
    const key = JSON.stringify(sizes);
    if (key === lastSizes) return;
    lastSizes = key;
    send({ type: 'sizes', sizes });
  }

  /* ---------- Menus, drop-down lists, dialogs ---------- */
  function closePopups() { desk && desk.querySelectorAll('.tk-pop').forEach((p) => p.remove()); }

  function deskPoint(target, below) {
    const r = target.getBoundingClientRect();
    const d = desk.getBoundingClientRect();
    return { x: r.left - d.left + desk.scrollLeft, y: (below ? r.bottom : r.top) - d.top + desk.scrollTop, w: r.width };
  }

  function popup(x, y, minWidth) {
    const pop = el('div', { class: 'tk-pop', style: { left: x + 'px', top: y + 'px', minWidth: (minWidth || 0) + 'px' } });
    desk.append(pop);
    return pop;
  }

  function openList(anchor, items, current, onPick) {
    closePopups();
    const p = deskPoint(anchor, true);
    const pop = popup(p.x, p.y, p.w);
    pop.classList.add('tk-droplist');
    items.forEach((it) => pop.append(el('div', { class: 'tk-drop-item' + (String(it) === String(current) ? ' selected' : ''), text: String(it), onClick: () => { closePopups(); onPick(String(it)); } })));
  }

  function openMenu(menuId, anchor) {
    closePopups();
    const p = deskPoint(anchor, true);
    openMenuAt(menuId, p.x, p.y, true);
  }

  function openMenuAt(menuId, x, y, keep) {
    if (!keep) closePopups();
    const menu = nodes.get(menuId);
    if (!menu) return;
    const pop = popup(x, y, 160);
    pop.classList.add('tk-menu');
    (menu.data.entries || []).forEach((e, i) => {
      if (e.type === 'separator') { pop.append(el('div', { class: 'tk-menu-sep' })); return; }
      const row = el('div', { class: 'tk-menu-item' + (e.state === 'disabled' ? ' disabled' : ''), role: 'menuitem' },
        el('span', { class: 'tk-menu-check', text: e.checked ? (e.type === 'radiobutton' ? '•' : '✓') : '' }),
        el('span', { class: 'tk-menu-label', text: e.label }),
        el('span', { class: 'tk-menu-acc', text: e.type === 'cascade' ? '›' : e.accelerator || '' }));
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (e.state === 'disabled') return;
        if (e.type === 'cascade' && e.menu) {
          pop.querySelectorAll('.tk-pop').forEach((p) => p.remove());
          const r = deskPoint(row, false);
          openMenuAt(e.menu, r.x + r.w, r.y, true);
          return;
        }
        closePopups();
        send({ type: 'menu', id: menuId, index: i });
      });
      pop.append(row);
    });
  }

  const DIALOG_ICON = { info: 'i', warning: '!', error: '×', question: '?' };
  function renderDialogs(list) {
    desk.querySelectorAll('.tk-dialog-layer').forEach((x) => x.remove());
    if (!list.length) return;
    const dlg = list[0];
    const box = el('div', { class: 'tkw tk-dialog', role: 'alertdialog', 'aria-label': dlg.title || 'Message' },
      el('div', { class: 'tkw-bar' }, el('span', { class: 'tkw-title', text: dlg.title || ' ' }),
        el('div', { class: 'tkw-btns' }, el('button', { class: 'tkw-btn close', type: 'button', 'aria-label': 'Close', onClick: () => send({ type: 'dialog', dialog: dlg.id }) }))),
      el('div', { class: 'tk-dialog-body' },
        el('span', { class: 'tk-dialog-icon ' + dlg.icon, text: DIALOG_ICON[dlg.icon] || 'i' }),
        el('div', { class: 'tk-dialog-text', text: dlg.message })),
      el('div', { class: 'tk-dialog-buttons' }, dlg.buttons.map((b, i) => el('button', {
        class: 'tkx tk-button' + (i === 0 ? ' default' : ''), type: 'button', text: b, onClick: () => send({ type: 'dialog', dialog: dlg.id }),
      }))));
    const layer = el('div', { class: 'tk-dialog-layer' }, box);
    desk.append(layer);
    const first = box.querySelector('.tk-dialog-buttons button');
    if (first) first.focus();
  }

  /* ---------- Events back to Python ---------- */
  const KEYSYMS = {
    Enter: 'Return', ' ': 'space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Escape',
    Backspace: 'BackSpace', Tab: 'Tab', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'Prior', PageDown: 'Next',
    Shift: 'Shift_L', Control: 'Control_L', Alt: 'Alt_L', Meta: 'Win_L', CapsLock: 'Caps_Lock', '.': 'period', ',': 'comma',
    '-': 'minus', '+': 'plus', '=': 'equal', '/': 'slash', '\\': 'backslash', ';': 'semicolon', "'": 'apostrophe',
    '[': 'bracketleft', ']': 'bracketright', '`': 'grave', '!': 'exclam', '@': 'at', '#': 'numbersign', $: 'dollar',
    '%': 'percent', '^': 'asciicircum', '&': 'ampersand', '*': 'asterisk', '(': 'parenleft', ')': 'parenright',
    _: 'underscore', '?': 'question', ':': 'colon', '"': 'quotedbl', '<': 'less', '>': 'greater', '{': 'braceleft',
    '}': 'braceright', '|': 'bar', '~': 'asciitilde',
  };
  const CHARS = { Enter: '\r', Backspace: '\b', Tab: '\t', Escape: '\x1b' };
  let buttons = 0;

  function bound(kind) { return !!(data && (data.bound || []).includes(kind)); }

  function nodeOf(target) {
    if (!target || !target.closest || target.closest('.tkw-bar, .tkw-menubar, .tk-pop, .tk-dialog-layer')) return null;
    const t = target.closest('[data-tkid]');
    return t ? nodes.get(t.dataset.tkid) : null;
  }

  function stateBits(e) {
    return (e.shiftKey ? 1 : 0) | (e.getModifierState && e.getModifierState('CapsLock') ? 2 : 0) | (e.ctrlKey ? 4 : 0) | (e.altKey ? 8 : 0) | (buttons & 1 ? 256 : 0) | (buttons & 4 ? 512 : 0) | (buttons & 2 ? 1024 : 0);
  }

  function mouseInfo(n, e) {
    const r = (n.canvas || n.content || n.el).getBoundingClientRect();
    const d = desk.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top),
      x_root: Math.round(e.clientX - d.left + desk.scrollLeft), y_root: Math.round(e.clientY - d.top + desk.scrollTop),
      state: stateBits(e), num: e.button != null ? [1, 2, 3][e.button] || 1 : '??', width: n.box ? n.box[0] : 0, height: n.box ? n.box[1] : 0,
    };
  }

  function sendEvent(kind, n, event) { if (n && bound(kind)) send({ type: 'event', id: n.id, kind, event }); }

  let motion = null;
  function bindDeskEvents() {
    desk.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.tk-pop')) closePopups();
      buttons = e.buttons;
      const n = nodeOf(e.target);
      if (!n) return;
      if (isWindow(n.data) && !e.target.closest('input, textarea, button')) n.el.focus({ preventScroll: true });
      if (n.type === 'Canvas') n.el.focus({ preventScroll: true });
      sendEvent('ButtonPress', n, mouseInfo(n, e));
    });
    desk.addEventListener('mouseup', (e) => { buttons = e.buttons; sendEvent('ButtonRelease', nodeOf(e.target), mouseInfo(nodeOf(e.target) || { el: desk }, e)); });
    desk.addEventListener('dblclick', (e) => { const n = nodeOf(e.target); if (n) sendEvent('DoubleClick', n, mouseInfo(n, e)); });
    desk.addEventListener('contextmenu', (e) => { const n = nodeOf(e.target); if (n && bound('ButtonPress')) e.preventDefault(); });
    desk.addEventListener('mousemove', (e) => {
      if (!bound('Motion')) return;
      buttons = e.buttons;
      const n = nodeOf(e.target);
      if (!n) return;
      const pending = !motion;
      motion = { n, info: mouseInfo(n, e) };
      if (pending) requestAnimationFrame(() => { const m = motion; motion = null; if (m) sendEvent('Motion', m.n, m.info); });
    });
    desk.addEventListener('mouseover', (e) => {
      const n = nodeOf(e.target);
      if (n && !(e.relatedTarget && n.el.contains(e.relatedTarget))) sendEvent('Enter', n, mouseInfo(n, e));
    });
    desk.addEventListener('mouseout', (e) => {
      const n = nodeOf(e.target);
      if (n && !(e.relatedTarget && n.el.contains(e.relatedTarget))) sendEvent('Leave', n, mouseInfo(n, e));
    });
    desk.addEventListener('wheel', (e) => {
      const n = nodeOf(e.target);
      if (n && bound('MouseWheel')) { e.preventDefault(); sendEvent('MouseWheel', n, Object.assign(mouseInfo(n, e), { delta: e.deltaY < 0 ? 120 : -120 })); }
    }, { passive: false });
    const key = (kind) => (e) => {
      if (e.target.closest('.tk-pop, .tk-dialog-layer')) return;
      const n = nodeOf(e.target);
      if (!n || !bound(kind)) return;
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (!typing && (e.key.startsWith('Arrow') || e.key === ' ' || e.key === 'Tab' || e.key === 'Backspace')) e.preventDefault();
      sendEvent(kind, n, {
        keysym: KEYSYMS[e.key] || e.key, char: e.key.length === 1 ? e.key : CHARS[e.key] || '', keycode: e.keyCode,
        state: stateBits(e), x: 0, y: 0,
      });
    };
    desk.addEventListener('keydown', key('KeyPress'));
    desk.addEventListener('keyup', key('KeyRelease'));
    desk.addEventListener('focusin', (e) => { const n = nodeOf(e.target); if (n && !isWindow(n.data)) sendEvent('FocusIn', n, {}); });
    desk.addEventListener('focusout', (e) => { const n = nodeOf(e.target); if (n && !isWindow(n.data)) sendEvent('FocusOut', n, {}); });
  }

  function dragWindow(e, n) {
    if (e.target.closest('.tkw-btns') || e.button !== 0) return;
    const s = state(n.id);
    if (s.max) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const sx = e.clientX - s.x;
    const sy = e.clientY - s.y;
    const move = (ev) => {
      s.x = Math.max(-200, ev.clientX - sx);
      s.y = Math.max(0, ev.clientY - sy);
      n.el.style.left = s.x + 'px';
      n.el.style.top = s.y + 'px';
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  }

  /* ---------- Messages from the runner ---------- */
  function onApp(msg, run) {
    let d;
    try { d = JSON.parse(msg.ui); } catch (err) { return; }
    if (run !== appRun) { clearAll(); appRun = run; }
    if (!d.alive) { clearAll(); return; }
    const first = !data;
    data = d;
    if (first) {
      SC.panel.show('app');
      SC.panel.ensureHeight(Math.min(window.innerHeight * 0.75, 520));
    }
    draw(d);
    if (first) {
      const win = Array.from(nodes.values()).find((n) => isWindow(n.data));
      if (win && !document.activeElement.closest('.tkw input, .tkw textarea')) win.el.focus({ preventScroll: true });
    }
  }

  function onFinish(run) {
    if (run === appRun) { clearAll(); appRun = null; }
  }

  function clearAll() {
    for (const n of nodes.values()) n.el.remove();
    nodes.clear();
    closePopups();
    if (desk) desk.querySelectorAll('.tk-dialog-layer').forEach((x) => x.remove());
    data = null;
    lastFocus = null;
    lastSizes = '';
    Object.keys(winState).forEach((k) => delete winState[k]);
    if (emptyEl) emptyEl.hidden = false;
    if (statusEl) statusEl.textContent = '';
  }

  function buildPane() {
    emptyEl = el('div', { class: 'app-empty' },
      el('p', { text: 'Python tkinter windows open here.' }),
      el('p', { class: 'app-hint', text: 'Write a program that uses tkinter (import tkinter as tk) and press F5. Run "New Tkinter App" from the command palette for a starting point.' }));
    desk = el('div', { class: 'app-desk' }, emptyEl);
    statusEl = el('span', { class: 'app-status' });
    pane = el('div', { class: 'app-pane' },
      el('div', { class: 'term-bar' }, statusEl, el('div', { class: 'spacer' }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Close the app (Shift+F5)', 'data-icon': 'stop', onClick: () => { if (appRun) SC.runner.stop(); } })),
      desk);
    SC.icons.hydrate(pane);
    bindDeskEvents();
    new ResizeObserver(() => { if (data && Object.values(winState).some((s) => s.max)) redraw(); }).observe(desk);
    return pane;
  }

  const STARTER = [
    'import tkinter as tk',
    'from tkinter import ttk, messagebox',
    '',
    'root = tk.Tk()',
    'root.title("My App")',
    'root.geometry("360x220")',
    '',
    'name = tk.StringVar()',
    'ttk.Label(root, text="What is your name?").pack(pady=(20, 6))',
    'entry = ttk.Entry(root, textvariable=name, width=30)',
    'entry.pack()',
    'entry.focus_set()',
    '',
    'def greet(event=None):',
    '    messagebox.showinfo("Hello", "Hello, " + (name.get() or "stranger") + "!")',
    '',
    'ttk.Button(root, text="Say hello", command=greet).pack(pady=12)',
    'root.bind("<Return>", greet)',
    '',
    'root.mainloop()',
    '',
  ].join('\n');

  function newApp() {
    const path = SC.fs.uniquePath(SC.explorer ? SC.explorer.targetFolder() : '', 'app.py');
    SC.fs.createFile(path, STARTER);
    SC.explorer.reveal(path);
    SC.tabs.open(path);
  }

  SC.extensions.register({
    id: 'smoki.tkinter',
    name: 'Tkinter Apps',
    version: '1.0.0',
    icon: { text: 'Tk', color: '#c17d11' },
    description: 'Run Python tkinter programs. Their windows open in the App tab, drawn like Windows apps.',
    features: [
      'Widgets: Label, Button, Entry, Text, Checkbutton, Radiobutton, Scale, Spinbox, Listbox, Canvas, Frame, LabelFrame, Menu, OptionMenu, Toplevel.',
      'ttk: Button, Entry, Combobox, Notebook, Progressbar, Treeview, Separator and more.',
      'pack, grid and place work like in Tk, with variables (StringVar, IntVar...), bind() events, after() timers and message boxes.',
      'mainloop() returns right away: the program keeps running until you close the window or press Shift+F5.',
      'Not available: pictures (PhotoImage), file dialogs, and questions that wait for an answer (askyesno answers Yes).',
    ],
    commands: ['tkinter.showApp', 'tkinter.newApp'],
    activate(ctx) {
      ctx.addPanelTab('app', 'App', pane || buildPane(), { onClear: () => { if (!appRun) clearAll(); } });
      ctx.onDispose(SC.runner.addPythonProvider(() => ({ pyModules: SC.tkinterPython })));
      SC.runner.on('app', onApp);
      SC.runner.on('finish', onFinish);
      ctx.onDispose(() => { SC.runner.off('app', onApp); SC.runner.off('finish', onFinish); clearAll(); });
      ctx.registerCommand({ id: 'tkinter.showApp', title: 'Show App Window', run: () => SC.panel.show('app') });
      ctx.registerCommand({ id: 'tkinter.newApp', title: 'New Tkinter App', run: newApp });
    },
  });
})(window.SC);
