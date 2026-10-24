/* ==========================================================================
   util.js — small helpers shared by every module.
   All modules hang off one global object, window.SC ("Smoki's Code").
   Plain <script> files (no ES modules) so the app also works when you
   open index.html straight from disk.
   ========================================================================== */
window.SC = window.SC || {};

(function (SC) {
  'use strict';

  const U = {};

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Create an element: el('div', {class: 'x', onClick: fn}, child1, 'text') */
  U.el = function (tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key in node && typeof value !== 'string') node[key] = value;
        else node.setAttribute(key, value === true ? '' : value);
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  U.escapeHtml = (str) => String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  U.debounce = function (fn, ms) {
    let timer = null;
    const wrapped = function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
    wrapped.flush = () => { clearTimeout(timer); fn(); };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  };

  /** Tiny event emitter mixin */
  U.emitter = function () {
    const handlers = new Map();
    return {
      on(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
        return () => handlers.get(type).delete(fn);
      },
      emit(type, data) {
        (handlers.get(type) || []).forEach((fn) => {
          try { fn(data); } catch (err) { console.error(err); }
        });
      },
    };
  };

  /* ---------- Paths ---------- */
  U.normPath = (p) => String(p || '').replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').join('/');
  U.basename = (p) => { const parts = U.normPath(p).split('/'); return parts[parts.length - 1] || ''; };
  U.dirname = (p) => { const parts = U.normPath(p).split('/'); parts.pop(); return parts.join('/'); };
  U.extname = (p) => { const b = U.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
  U.joinPath = (...parts) => U.normPath(parts.filter(Boolean).join('/'));
  U.isInside = (child, parent) => !parent || child === parent || child.startsWith(parent + '/');

  /* ---------- Fuzzy matching for the command palette ---------- */
  /** Returns {score, indices} or null when `query` does not match `text`. */
  U.fuzzy = function (query, text) {
    if (!query) return { score: 0, indices: [] };
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const at = t.indexOf(q);
    if (at >= 0) {
      const indices = [];
      for (let i = at; i < at + q.length; i++) indices.push(i);
      const wordStart = at === 0 || /[\s\-_./:]/.test(t[at - 1]);
      return { score: 1000 - at + (wordStart ? 60 : 0) - t.length * 0.1, indices };
    }
    let ti = 0;
    let last = -2;
    let score = 0;
    const indices = [];
    for (const ch of q) {
      if (ch === ' ') continue;
      ti = t.indexOf(ch, ti);
      if (ti < 0) return null;
      indices.push(ti);
      score += ti === last + 1 ? 5 : 1;
      if (ti === 0 || /[\s\-_./:]/.test(t[ti - 1])) score += 4;
      last = ti;
      ti++;
    }
    return { score: score - t.length * 0.05, indices };
  };

  /** Wrap matched characters in <b> for display. */
  U.markMatches = function (text, indices) {
    if (!indices || !indices.length) return U.escapeHtml(text);
    const set = new Set(indices);
    let out = '';
    let open = false;
    for (let i = 0; i < text.length; i++) {
      const hit = set.has(i);
      if (hit && !open) { out += '<b>'; open = true; }
      if (!hit && open) { out += '</b>'; open = false; }
      out += U.escapeHtml(text[i]);
    }
    if (open) out += '</b>';
    return out;
  };

  /* ---------- Downloads ---------- */
  U.download = function (filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = U.el('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /** Pick files with a hidden <input type=file>. Resolves to an array of File. */
  U.pickFiles = function ({ multiple = true, accept = '', directory = false } = {}) {
    return new Promise((resolve) => {
      const input = U.el('input', { type: 'file', style: { display: 'none' } });
      if (multiple) input.multiple = true;
      if (accept) input.accept = accept;
      if (directory) { input.webkitdirectory = true; input.setAttribute('webkitdirectory', ''); }
      input.addEventListener('change', () => {
        resolve(Array.from(input.files || []));
        input.remove();
      });
      input.addEventListener('cancel', () => { resolve([]); input.remove(); });
      document.body.append(input);
      input.click();
    });
  };

  /** True when bytes look like a binary (non-text) file. */
  U.looksBinary = function (text) {
    const sample = text.slice(0, 8000);
    return sample.includes('\u0000');
  };

  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  U.clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  U.countLines = (text) => {
    let n = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  };

  U.formatBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  /* ---------- Toast notifications ---------- */
  SC.notify = function (message, type = 'info', ms = 4200) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const close = U.el('button', { class: 'toast-close icon-btn', title: 'Dismiss', 'data-icon': 'close', type: 'button' });
    const toast = U.el('div', { class: 'toast ' + type, role: 'status' },
      U.el('span', { class: 'toast-dot' }),
      U.el('div', { class: 'toast-msg', text: message }),
      close);
    if (SC.icons) SC.icons.hydrate(toast);
    const remove = () => toast.remove();
    close.addEventListener('click', remove);
    host.append(toast);
    while (host.children.length > 4) host.firstElementChild.remove();
    if (ms) setTimeout(remove, ms);
  };

  SC.util = U;
})(window.SC);
