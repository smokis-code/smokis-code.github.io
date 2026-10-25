/* ==========================================================================
   editor.js — one code editor per open file.

   Layout inside .editor:
     .editor-scroller            (scrolls)
       .editor-content           (flex row)
         .editor-gutter          (line numbers, sticky on the left)
         .editor-code
           .editor-line-highlight
           .editor-marks         (find-match boxes)
           pre.editor-highlight  (colored copy of the text)
           textarea.editor-input (what you actually type into, transparent)

   Edits go through document.execCommand('insertText') where possible so
   the browser's own Undo/Redo (Ctrl+Z / Ctrl+Y) keeps working.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  const CLOSERS = ')]}"\'`';
  const QUOTES = '"\'`';
  const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  class Editor {
    constructor({ value = '', langId = 'plaintext' } = {}) {
      this.langId = langId;
      this.onChange = null;
      this.onCursor = null;
      this.marks = [];
      this.currentMark = -1;
      this._lineStarts = null;
      this._renderedLines = 0;
      this._activeLine = -1;
      this._savedScroll = { top: 0, left: 0 };

      this.root = el('div', { class: 'editor' });
      this.scroller = el('div', { class: 'editor-scroller' });
      this.content = el('div', { class: 'editor-content' });
      this.gutter = el('div', { class: 'editor-gutter', 'aria-hidden': 'true' });
      this.code = el('div', { class: 'editor-code' });
      this.lineHL = el('div', { class: 'editor-line-highlight' });
      this.marksEl = el('div', { class: 'editor-marks' });
      this.pre = el('pre', { class: 'editor-highlight', 'aria-hidden': 'true' });
      this.ta = el('textarea', {
        class: 'editor-input', wrap: 'off', spellcheck: 'false', autocapitalize: 'off',
        autocomplete: 'off', autocorrect: 'off', 'aria-label': 'Code editor', 'aria-multiline': 'true',
      });
      this.measureEl = el('span', { class: 'editor-measure', text: 'x'.repeat(100) });

      this.code.append(this.lineHL, this.marksEl, this.pre, this.ta);
      this.content.append(this.gutter, this.code);
      this.scroller.append(this.content);
      this.root.append(this.scroller, this.measureEl);

      this.ta.value = value;
      this.ta.setSelectionRange(0, 0); // setting .value puts the caret at the end
      this._bind();
      this.render();
    }

    /* ---------- Setup ---------- */
    _bind() {
      const ta = this.ta;
      ta.addEventListener('input', () => this._onInput());
      ta.addEventListener('keydown', (e) => this._onKeyDown(e));
      ta.addEventListener('scroll', () => { if (ta.scrollTop || ta.scrollLeft) { ta.scrollTop = 0; ta.scrollLeft = 0; } });
      const cursorUpdate = () => requestAnimationFrame(() => this._updateCursorUI());
      ta.addEventListener('keyup', cursorUpdate);
      ta.addEventListener('mouseup', cursorUpdate);
      ta.addEventListener('focus', cursorUpdate);
      ta.addEventListener('select', cursorUpdate);
      document.addEventListener('selectionchange', () => {
        if (document.activeElement === ta) this._updateCursorUI();
      });
      // Click a line number to select that line
      this.gutter.addEventListener('mousedown', (e) => {
        const ln = e.target.closest('.ln');
        if (!ln) return;
        e.preventDefault();
        const line = Number(ln.dataset.n) - 1;
        const starts = this.lineStarts();
        const start = starts[line];
        const end = line + 1 < starts.length ? starts[line + 1] : this.ta.value.length;
        this.focus();
        this.ta.setSelectionRange(start, end);
        this._updateCursorUI();
      });
    }

    /* ---------- Basic accessors ---------- */
    get value() { return this.ta.value; }
    setValue(text) {
      const { selectionStart: s, selectionEnd: e } = this.ta;
      this.ta.value = text;
      this.ta.setSelectionRange(Math.min(s, text.length), Math.min(e, text.length));
      this._onInput(true);
    }
    lineStarts() {
      if (!this._lineStarts) {
        const v = this.ta.value;
        const starts = [0];
        for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) === 10) starts.push(i + 1);
        this._lineStarts = starts;
      }
      return this._lineStarts;
    }
    lineCount() { return this.lineStarts().length; }

    /** Offset -> {line, col} (both 0-based; col counts characters). */
    posAt(offset) {
      const starts = this.lineStarts();
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
      }
      return { line: lo, col: offset - starts[lo] };
    }

    /** Column on screen, counting tabs as tabSize spaces. */
    visualCol(line, col) {
      const start = this.lineStarts()[line];
      const text = this.ta.value.slice(start, start + col);
      if (!text.includes('\t')) return col;
      const tab = SC.settings.get('tabSize');
      let vc = 0;
      for (const ch of text) vc = ch === '\t' ? vc + tab - (vc % tab) : vc + 1;
      return vc;
    }

    /** 1-based cursor position for the status bar. */
    cursor() {
      const ta = this.ta;
      const head = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
      const p = this.posAt(head);
      return { line: p.line + 1, col: this.visualCol(p.line, p.col) + 1, selected: Math.abs(ta.selectionEnd - ta.selectionStart) };
    }

    selection() { return { start: this.ta.selectionStart, end: this.ta.selectionEnd, text: this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd) }; }

    focus() { this.ta.focus({ preventScroll: true }); }

    setLanguage(langId) {
      this.langId = langId;
      this.render();
    }

    /* ---------- Rendering ---------- */
    render() {
      const v = this.ta.value;
      // A trailing newline needs an extra character so the last empty line has height
      this.pre.innerHTML = SC.highlighter.highlight(v, this.langId) + (v.endsWith('\n') || v === '' ? ' ' : '');
      this._renderGutter();
      this._renderMarks();
      this._updateCursorUI();
    }

    _renderGutter() {
      const count = this.lineCount();
      if (count === this._renderedLines) return;
      let html = '';
      for (let i = 1; i <= count; i++) html += '<div class="ln" data-n="' + i + '">' + i + '</div>';
      this.gutter.innerHTML = html;
      this.gutter.style.minWidth = (String(count).length + 4) + 'ch';
      this._renderedLines = count;
      this._activeLine = -1;
    }

    _updateCursorUI() {
      const ta = this.ta;
      const head = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
      const line = this.posAt(head).line;
      const lh = SC.settings.lineHeight();
      this.lineHL.style.top = line * lh + 'px';
      if (line !== this._activeLine) {
        const prev = this.gutter.children[this._activeLine];
        if (prev) prev.classList.remove('active');
        const cur = this.gutter.children[line];
        if (cur) cur.classList.add('active');
        this._activeLine = line;
      }
      if (this.onCursor) this.onCursor(this);
    }

    charWidth() {
      const w = this.measureEl.getBoundingClientRect().width / 100;
      if (w > 0) this._cw = w;
      return this._cw || 8;
    }

    /** Scroll so the caret is visible. */
    revealCaret(center = false) {
      const ta = this.ta;
      const head = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
      this.revealOffset(head, center);
    }

    revealOffset(offset, center = false) {
      const sc = this.scroller;
      if (!sc.clientHeight) return;
      const p = this.posAt(offset);
      const lh = SC.settings.lineHeight();
      const top = p.line * lh;
      const bottom = top + lh;
      if (center) sc.scrollTop = Math.max(0, top - sc.clientHeight / 2 + lh);
      else if (top < sc.scrollTop) sc.scrollTop = top;
      else if (bottom > sc.scrollTop + sc.clientHeight - 4) sc.scrollTop = bottom - sc.clientHeight + 4;

      const gutterW = this.gutter.offsetWidth;
      const x = this.visualCol(p.line, p.col) * this.charWidth();
      const viewW = sc.clientWidth - gutterW;
      if (x < sc.scrollLeft + 8) sc.scrollLeft = Math.max(0, x - 40);
      else if (x > sc.scrollLeft + viewW - 24) sc.scrollLeft = x - viewW + 60;
    }

    /* ---------- Find marks ---------- */
    setMarks(marks, current = -1) {
      this.marks = marks || [];
      this.currentMark = current;
      this._renderMarks();
    }

    _renderMarks() {
      this.marksEl.textContent = '';
      if (!this.marks.length) return;
      const lh = SC.settings.lineHeight();
      const cw = this.charWidth();
      const frag = document.createDocumentFragment();
      const limit = Math.min(this.marks.length, 2000);
      for (let i = 0; i < limit; i++) {
        const m = this.marks[i];
        const a = this.posAt(m.start);
        const b = this.posAt(m.end);
        const x1 = this.visualCol(a.line, a.col);
        const x2 = b.line === a.line ? this.visualCol(b.line, b.col) : x1 + 1;
        const box = el('div', { class: 'find-mark' + (i === this.currentMark ? ' current' : '') });
        box.style.top = a.line * lh + 'px';
        box.style.left = x1 * cw + 'px';
        box.style.width = Math.max(2, (x2 - x1) * cw) + 'px';
        frag.append(box);
      }
      this.marksEl.append(frag);
    }

    /* ---------- Editing primitives ---------- */
    /** Replace [start, end) with text, keeping the browser undo stack when possible. */
    replaceRange(start, end, text, selStart, selEnd) {
      const ta = this.ta;
      const before = ta.value;
      const expected = before.slice(0, start) + text + before.slice(end);
      this.focus();
      ta.setSelectionRange(start, end);
      let ok = false;
      try {
        ok = text === '' ? document.execCommand('delete', false) : document.execCommand('insertText', false, text);
      } catch (err) { ok = false; }
      if (!ok || ta.value !== expected) {
        ta.value = expected;
        this._onInput();
      }
      const s = selStart != null ? selStart : start + text.length;
      ta.setSelectionRange(s, selEnd != null ? selEnd : s);
      this._updateCursorUI();
      this.revealCaret();
    }

    insertText(text) {
      const { start, end } = this.selection();
      this.replaceRange(start, end, text);
    }

    setSelection(start, end = start, reveal = true, center = false) {
      this.focus();
      this.ta.setSelectionRange(start, end);
      this._updateCursorUI();
      if (reveal) this.revealOffset(end, center);
    }

    goToLine(line, col = 1) {
      const starts = this.lineStarts();
      const l = SC.util.clamp(line, 1, starts.length) - 1;
      const lineEnd = l + 1 < starts.length ? starts[l + 1] - 1 : this.ta.value.length;
      const offset = Math.min(starts[l] + Math.max(0, col - 1), lineEnd);
      this.setSelection(offset, offset, true, true);
    }

    _onInput(silent) {
      this._lineStarts = null;
      if (this.marks.length && !silent) this.marks = [];
      this.render();
      if (this.onChange) this.onChange(this);
    }

    /** [start, end) covering every full line touched by the selection (end excludes the final \n). */
    _lineBlock() {
      const v = this.ta.value;
      let { selectionStart: s, selectionEnd: e } = this.ta;
      if (e > s && v[e - 1] === '\n') e--; // selection ending at column 0 doesn't include that line
      const a = v.lastIndexOf('\n', s - 1) + 1;
      let b = v.indexOf('\n', e);
      if (b < 0) b = v.length;
      return { a, b, text: v.slice(a, b) };
    }

    /* ---------- Keyboard ---------- */
    _onKeyDown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      const ta = this.ta;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const v = ta.value;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Tab' && !mod && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) this.outdent();
        else if (s !== en && v.slice(s, en).includes('\n')) this.indent();
        else {
          const unit = SC.settings.indentUnit();
          if (unit === '\t') this.replaceRange(s, en, '\t');
          else {
            const p = this.posAt(s);
            const vc = this.visualCol(p.line, p.col);
            const tab = SC.settings.get('tabSize');
            this.replaceRange(s, en, ' '.repeat(tab - (vc % tab)));
          }
        }
        return;
      }
      if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        this._newline();
        return;
      }
      if (e.key === 'Backspace' && !mod && !e.altKey && s === en && s > 0) {
        if (this._smartBackspace()) e.preventDefault();
        return;
      }
      if (e.key === 'Home' && !mod && !e.altKey) {
        e.preventDefault();
        this._smartHome(e.shiftKey);
        return;
      }
      if (e.key === 'Escape' && SC.find && SC.find.isOpen()) {
        SC.find.close();
        return;
      }
      if (!mod && !e.altKey && e.key.length === 1) {
        if (this._typeChar(e.key)) e.preventDefault();
      }
    }

    _newline() {
      const ta = this.ta;
      const v = ta.value;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const before = v.slice(lineStart, s);
      const indent = /^[ \t]*/.exec(before)[0];
      const trimmed = before.trimEnd();
      const last = trimmed.slice(-1);
      const next = v[en] || '';
      const unit = SC.settings.indentUnit();
      const lang = SC.languages.byId[this.langId] || {};
      let extra = '';
      let between = false;

      if ('{[('.includes(last) && last) {
        extra = unit;
        between = PAIRS[last] === next;
      } else if (this.langId === 'python' && last === ':') {
        extra = unit;
      } else if (lang.custom === 'html' && last === '>' && /<([A-Za-z][\w-]*)[^<>]*>$/.test(trimmed) && !trimmed.endsWith('/>')) {
        const tag = /<([A-Za-z][\w-]*)[^<>]*>$/.exec(trimmed)[1].toLowerCase();
        if (!VOID_TAGS.has(tag)) {
          extra = unit;
          between = v.startsWith('</', en);
        }
      } else if (lang.custom === 'markdown') {
        // Continue bullet lists: "- item" -> "- "
        const bullet = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(before);
        if (bullet && before.trim() !== bullet[0].trim()) {
          let marker = bullet[2];
          if (/^\d+/.test(marker)) marker = (parseInt(marker, 10) + 1) + marker.slice(-1);
          const text = '\n' + bullet[1] + marker + ' ' + (bullet[3] ? '[ ] ' : '');
          this.replaceRange(s, en, text);
          return;
        }
      }

      if (between) {
        const text = '\n' + indent + extra + '\n' + indent;
        this.replaceRange(s, en, text, s + 1 + indent.length + extra.length);
      } else {
        this.replaceRange(s, en, '\n' + indent + extra);
      }
    }

    _smartBackspace() {
      const ta = this.ta;
      const v = ta.value;
      const s = ta.selectionStart;
      const prev = v[s - 1];
      const next = v[s];
      if (SC.settings.get('autoCloseBrackets') && PAIRS[prev] && PAIRS[prev] === next) {
        this.replaceRange(s - 1, s + 1, '');
        return true;
      }
      if (!SC.settings.get('insertSpaces')) return false;
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const before = v.slice(lineStart, s);
      if (before.length && /^ +$/.test(before)) {
        const tab = SC.settings.get('tabSize');
        const remove = ((before.length - 1) % tab) + 1;
        this.replaceRange(s - remove, s, '');
        return true;
      }
      return false;
    }

    _smartHome(extend) {
      const ta = this.ta;
      const v = ta.value;
      const backward = ta.selectionDirection === 'backward';
      const headPos = backward ? ta.selectionStart : ta.selectionEnd;
      const anchor = backward ? ta.selectionEnd : ta.selectionStart;
      const lineStart = v.lastIndexOf('\n', headPos - 1) + 1;
      const firstChar = lineStart + /^[ \t]*/.exec(v.slice(lineStart))[0].length;
      const target = headPos === firstChar ? lineStart : firstChar;
      if (extend) {
        ta.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target), target < anchor ? 'backward' : 'forward');
      } else {
        ta.setSelectionRange(target, target);
      }
      this._updateCursorUI();
      this.revealCaret();
    }

    /** Auto-closing brackets/quotes/tags. Returns true when it handled the key. */
    _typeChar(ch) {
      if (!SC.settings.get('autoCloseBrackets')) return false;
      const ta = this.ta;
      const v = ta.value;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const lang = SC.languages.byId[this.langId] || {};

      // Type over a closer that is already there
      if (CLOSERS.includes(ch) && s === en && v[s] === ch) {
        ta.setSelectionRange(s + 1, s + 1);
        this._updateCursorUI();
        return true;
      }

      // HTML: typing ">" after "<div" inserts "</div>"
      if (ch === '>' && lang.custom === 'html' && s === en) {
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const m = /<([A-Za-z][\w:-]*)(\s[^<>]*)?$/.exec(v.slice(lineStart, s));
        if (m && !m[0].endsWith('/') && !VOID_TAGS.has(m[1].toLowerCase()) && !/^(\s*["'])/.test(m[2] || '')) {
          this.replaceRange(s, en, '></' + m[1] + '>', s + 1);
          return true;
        }
      }

      // Typing "}" on an empty line moves it back one indent level
      if (ch === '}' && s === en) {
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const before = v.slice(lineStart, s);
        const unit = SC.settings.indentUnit();
        if (before.length >= unit.length && /^[ \t]+$/.test(before) && before.endsWith(unit)) {
          this.replaceRange(s - unit.length, s, '}');
          return true;
        }
      }

      if (!PAIRS[ch]) return false;
      const close = PAIRS[ch];

      // Wrap a selection: select text, type ( -> (text)
      if (s !== en) {
        const sel = v.slice(s, en);
        this.replaceRange(s, en, ch + sel + close, s + 1, en + 1);
        return true;
      }

      const prev = v[s - 1] || '';
      const next = v[s] || '';
      if (QUOTES.includes(ch)) {
        if (/[\w$]/.test(prev) || /[\w$]/.test(next)) return false; // don't, it's
        if (ch === "'" && (lang.id === 'markdown' || lang.id === 'plaintext')) return false;
        if (ch === '`' && !['javascript', 'typescript', 'markdown', 'go', 'shell'].includes(lang.id)) return false;
      } else if (next && !/[\s)\]}>,;:.]/.test(next)) {
        return false;
      }
      this.replaceRange(s, en, ch + close, s + 1);
      return true;
    }

    /* ---------- Line commands (used by Edit / Selection menus) ---------- */
    indent() {
      const { a, b, text } = this._lineBlock();
      const unit = SC.settings.indentUnit();
      const lines = text.split('\n');
      const out = lines.map((l) => (l.length ? unit + l : l)).join('\n');
      const s = this.ta.selectionStart;
      const firstShift = lines[0].length ? unit.length : 0;
      this.replaceRange(a, b, out, s + firstShift, a + out.length);
      if (this.ta.selectionStart !== this.ta.selectionEnd) return;
    }

    outdent() {
      const { a, b, text } = this._lineBlock();
      const tab = SC.settings.get('tabSize');
      const re = new RegExp('^(\\t| {1,' + tab + '})');
      const lines = text.split('\n');
      const removed = lines.map((l) => (re.exec(l) || [''])[0].length);
      const out = lines.map((l) => l.replace(re, '')).join('\n');
      const { selectionStart: s, selectionEnd: e } = this.ta;
      if (out === text) return;
      if (s === e) {
        const ns = Math.max(a, s - removed[0]);
        this.replaceRange(a, b, out, ns, ns);
      } else {
        this.replaceRange(a, b, out, Math.max(a, s - removed[0]), a + out.length);
      }
    }

    toggleComment() {
      const lang = SC.languages.byId[this.langId] || {};
      let line = lang.lineComment;
      let block = lang.blockComment;
      if (lang.custom === 'html' || lang.custom === 'markdown') { line = null; block = ['<!--', '-->']; }
      if (lang.custom === 'css') { line = null; block = ['/*', '*/']; }
      if (!line && !block) { SC.notify('This language has no comment syntax.', 'info'); return; }

      const { a, b, text } = this._lineBlock();
      const { selectionStart: s, selectionEnd: e } = this.ta;
      let out;
      if (line) {
        const lines = text.split('\n');
        const filled = lines.filter((l) => l.trim());
        const re = new RegExp('^(\\s*)' + escapeRe(line) + ' ?');
        const allCommented = filled.length > 0 && filled.every((l) => l.trimStart().startsWith(line));
        if (allCommented) {
          out = lines.map((l) => l.replace(re, '$1')).join('\n');
        } else {
          const minIndent = Math.min(...(filled.length ? filled : ['']).map((l) => /^\s*/.exec(l)[0].length));
          out = lines.map((l) => (l.trim() ? l.slice(0, minIndent) + line + ' ' + l.slice(minIndent) : l)).join('\n');
        }
      } else {
        const lead = /^\s*/.exec(text)[0];
        const body = text.slice(lead.length);
        const trimmed = body.trimEnd();
        if (trimmed.startsWith(block[0]) && trimmed.endsWith(block[1])) {
          out = lead + trimmed.slice(block[0].length, trimmed.length - block[1].length).replace(/^ /, '').replace(/ $/, '');
        } else {
          out = lead + block[0] + ' ' + body + ' ' + block[1];
        }
      }
      const firstOld = text.split('\n')[0];
      const firstNew = out.split('\n')[0];
      const delta = firstNew.length - firstOld.length;
      if (s === e) {
        const ns = Math.max(a, s + delta);
        this.replaceRange(a, b, out, ns, ns);
      } else {
        this.replaceRange(a, b, out, a, a + out.length);
      }
    }

    moveLines(dir) {
      const v = this.ta.value;
      const { a, b, text } = this._lineBlock();
      const { selectionStart: s, selectionEnd: e } = this.ta;
      if (dir < 0) {
        if (a === 0) return;
        const prevStart = v.lastIndexOf('\n', a - 2) + 1;
        const prevLine = v.slice(prevStart, a - 1);
        const shift = prevLine.length + 1;
        this.replaceRange(prevStart, b, text + '\n' + prevLine, s - shift, e - shift);
      } else {
        if (b >= v.length) return;
        let nextEnd = v.indexOf('\n', b + 1);
        if (nextEnd < 0) nextEnd = v.length;
        const nextLine = v.slice(b + 1, nextEnd);
        const shift = nextLine.length + 1;
        this.replaceRange(a, nextEnd, nextLine + '\n' + text, s + shift, e + shift);
      }
    }

    copyLines(dir) {
      const { a, b, text } = this._lineBlock();
      const { selectionStart: s, selectionEnd: e } = this.ta;
      if (dir > 0) {
        const shift = text.length + 1;
        this.replaceRange(b, b, '\n' + text, s + shift, e + shift);
      } else {
        this.replaceRange(a, a, text + '\n', s, e);
      }
    }

    deleteLines() {
      const v = this.ta.value;
      const { a, b } = this._lineBlock();
      if (b < v.length) this.replaceRange(a, b + 1, '', a, a);
      else if (a > 0) this.replaceRange(a - 1, b, '', v.lastIndexOf('\n', a - 2) + 1);
      else this.replaceRange(0, b, '', 0, 0);
    }

    selectLine() {
      const { a, b } = this._lineBlock();
      const v = this.ta.value;
      this.setSelection(a, b < v.length ? b + 1 : b);
    }

    insertLineBelow() {
      const v = this.ta.value;
      const head = this.ta.selectionEnd;
      let end = v.indexOf('\n', head);
      if (end < 0) end = v.length;
      const lineStart = v.lastIndexOf('\n', head - 1) + 1;
      const indent = /^[ \t]*/.exec(v.slice(lineStart))[0];
      this.replaceRange(end, end, '\n' + indent);
    }

    /** Apply fn to the selected text (or the current line when nothing is selected). */
    transformSelection(fn, wholeLines = false) {
      const { selectionStart: s, selectionEnd: e } = this.ta;
      if (wholeLines || s === e) {
        const { a, b, text } = this._lineBlock();
        const out = fn(text);
        this.replaceRange(a, b, out, s === e ? s : a, s === e ? s : a + out.length);
      } else {
        const out = fn(this.ta.value.slice(s, e));
        this.replaceRange(s, e, out, s, s + out.length);
      }
    }

    trimTrailingWhitespace() {
      const v = this.ta.value;
      const out = v.replace(/[ \t]+$/gm, '');
      if (out === v) return false;
      const s = this.ta.selectionStart;
      const posBefore = this.posAt(s);
      this.replaceRange(0, v.length, out);
      // put the caret back on the same line
      const starts = this.lineStarts();
      const lineEnd = posBefore.line + 1 < starts.length ? starts[posBefore.line + 1] - 1 : out.length;
      const ns = Math.min(starts[posBefore.line] + posBefore.col, lineEnd);
      this.setSelection(ns, ns, false);
      return true;
    }

    /* ---------- Showing / hiding (tabs) ---------- */
    show() {
      this.root.hidden = false;
      this.scroller.scrollTop = this._savedScroll.top;
      this.scroller.scrollLeft = this._savedScroll.left;
      this.charWidth();
      this._renderMarks();
    }

    hide() {
      this._savedScroll = { top: this.scroller.scrollTop, left: this.scroller.scrollLeft };
      this.root.hidden = true;
    }

    viewState() {
      const visible = !this.root.hidden;
      return {
        selStart: this.ta.selectionStart,
        selEnd: this.ta.selectionEnd,
        scrollTop: visible ? this.scroller.scrollTop : this._savedScroll.top,
        scrollLeft: visible ? this.scroller.scrollLeft : this._savedScroll.left,
      };
    }

    restoreViewState(state) {
      if (!state) return;
      const len = this.ta.value.length;
      this.ta.setSelectionRange(Math.min(state.selStart || 0, len), Math.min(state.selEnd || 0, len));
      this._savedScroll = { top: state.scrollTop || 0, left: state.scrollLeft || 0 };
      if (!this.root.hidden) {
        this.scroller.scrollTop = this._savedScroll.top;
        this.scroller.scrollLeft = this._savedScroll.left;
      }
      this._updateCursorUI();
    }

    refreshMetrics() {
      this._cw = 0;
      this.charWidth();
      this._updateCursorUI();
      this._renderMarks();
    }

    destroy() { this.root.remove(); }
  }

  SC.Editor = Editor;
})(window.SC);
