/* ==========================================================================
   highlighter.js — turns source code into colored HTML.

   tokenize(code, lang) -> [[kind, text], ...]   (kind null = plain text)
   highlight(code, langId) -> '<span class="t-keyword">const</span> ...'

   One generic tokenizer handles C-like languages, Python, shell, SQL...
   using the word lists in languages.js. HTML, CSS and Markdown have their
   own small tokenizers below.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { escapeHtml } = SC.util;
  const L = () => SC.languages.byId;
  const MAX_HIGHLIGHT = 400000; // characters; bigger files are shown uncolored

  const OPERATOR_CHARS = '+-*/%=<>!&|^~?:';
  const isOp = (ch) => OPERATOR_CHARS.includes(ch);
  const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
  const isDigit = (ch) => ch >= '0' && ch <= '9';
  const DEFAULT_IDENT = /^[A-Za-z_À-￿][\wÀ-￿]*/;
  const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?[a-zA-Z]*/;
  const REGEX_LITERAL = /^\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuyv]*/;

  function nextNonSpace(code, i) {
    while (i < code.length && (code[i] === ' ' || code[i] === '\t')) i++;
    return code[i] || '';
  }

  /** Scan a quoted string starting at i. Returns the index after it. */
  function scanString(code, i, quote, multiline) {
    let j = i + 1;
    while (j < code.length) {
      const ch = code[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === quote) return j + 1;
      if (ch === '\n' && !multiline) return j;
      j++;
    }
    return code.length;
  }

  /** Decide what an identifier is (keyword, function, type, variable...). */
  function classify(word, lang, prev, code, end) {
    const w = lang.caseInsensitive ? word.toLowerCase() : word;
    const prevText = prev ? prev.text : '';
    const next = nextNonSpace(code, end);

    if (prevText === '.' || prevText === '?.' || (prevText === '->' && lang.preprocessor)) {
      return next === '(' ? 'function' : 'property';
    }
    if (lang.yamlKeys && next === ':') return 'property';
    if (lang.control && lang.control.has(w)) return 'control';
    if (lang.keywords && lang.keywords.has(w)) return 'keyword';
    if (lang.constants && lang.constants.has(w)) return 'constant';
    if (prev && lang.defKeywords && lang.defKeywords.has(prevText)) return 'function';
    if (prev && lang.typeKeywords && lang.typeKeywords.has(prevText)) return 'type';
    if (lang.types && lang.types.has(w)) return 'type';
    if (lang.builtins && lang.builtins.has(w)) return next === '(' ? 'function' : 'builtin';
    if (next === '(') return 'function';
    if (lang.capsAsTypes !== false) {
      if (word.length > 1 && /^[A-Z][A-Z0-9_]+$/.test(word)) return 'constant';
      if (/^[A-Z]/.test(word)) return 'type';
    }
    return lang.plainIdent || 'variable';
  }

  function tokenizeGeneric(code, lang) {
    const out = [];
    const n = code.length;
    const ident = lang.ident || DEFAULT_IDENT;
    let i = 0;
    let prev = null; // last token that is not whitespace or a comment
    let lineStart = true;

    const push = (kind, text) => {
      out.push([kind, text]);
      if (kind !== 'comment') prev = { kind, text };
    };

    while (i < n) {
      const ch = code[i];

      // Whitespace
      if (isSpace(ch)) {
        let j = i + 1;
        while (j < n && isSpace(code[j])) j++;
        const ws = code.slice(i, j);
        out.push([null, ws]);
        if (ws.includes('\n')) lineStart = true;
        i = j;
        continue;
      }
      const atLineStart = lineStart;
      lineStart = false;

      // C preprocessor: #include <stdio.h>
      if (lang.preprocessor && ch === '#' && atLineStart) {
        const m = /^#\s*[A-Za-z_]+/.exec(code.slice(i, i + 40));
        if (m) {
          push('control', m[0]);
          i += m[0].length;
          const inc = /^([ \t]*)(<[^>\n]*>)/.exec(code.slice(i, i + 300));
          if (inc) {
            if (inc[1]) out.push([null, inc[1]]);
            push('string', inc[2]);
            i += inc[0].length;
          }
          continue;
        }
      }

      // Comments
      if (lang.lineComment && code.startsWith(lang.lineComment, i)) {
        let j = code.indexOf('\n', i);
        if (j < 0) j = n;
        out.push(['comment', code.slice(i, j)]);
        i = j;
        continue;
      }
      if (lang.blockComment && code.startsWith(lang.blockComment[0], i)) {
        let j = code.indexOf(lang.blockComment[1], i + lang.blockComment[0].length);
        j = j < 0 ? n : j + lang.blockComment[1].length;
        out.push(['comment', code.slice(i, j)]);
        i = j;
        continue;
      }

      // Python triple-quoted strings
      if (lang.triple && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
        const q = code.substr(i, 3);
        let j = code.indexOf(q, i + 3);
        j = j < 0 ? n : j + 3;
        push('string', code.slice(i, j));
        i = j;
        continue;
      }

      // Rust lifetimes: 'a (but not char literals like 'a')
      if (lang.lifetimes && ch === "'") {
        const m = /^'[A-Za-z_]\w*/.exec(code.slice(i, i + 60));
        if (m && code[i + m[0].length] !== "'") {
          push('type', m[0]);
          i += m[0].length;
          continue;
        }
      }

      // Template strings with ${ ... } parts
      if (lang.template && ch === lang.template) {
        i = scanTemplate(code, i, lang, out);
        prev = { kind: 'string', text: '`' };
        continue;
      }

      // Strings
      if (lang.strings && lang.strings.includes(ch)) {
        const j = scanString(code, i, ch, ch === '`');
        let kind = 'string';
        if (lang.keyColon && nextNonSpace(code, j) === ':') kind = 'property';
        push(kind, code.slice(i, j));
        i = j;
        continue;
      }

      // Numbers
      if (isDigit(ch) || (ch === '.' && isDigit(code[i + 1] || ''))) {
        const m = NUMBER.exec(code.slice(i, i + 80));
        if (m) {
          push('number', m[0]);
          i += m[0].length;
          continue;
        }
      }

      // Decorators / annotations: @property, @Override
      if (lang.decorators && ch === '@') {
        const m = /^@[A-Za-z_][\w.]*/.exec(code.slice(i, i + 80));
        if (m) {
          push('decorator', m[0]);
          i += m[0].length;
          continue;
        }
      }

      // Shell variables: $HOME, ${name}, $1
      if (lang.dollarVars && ch === '$') {
        const m = /^\$(\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?$!*-])/.exec(code.slice(i, i + 80));
        if (m) {
          push('variable', m[0]);
          i += m[0].length;
          continue;
        }
      }

      // Identifiers and keywords
      const idm = ident.exec(code.slice(i, i + 200));
      if (idm) {
        const word = idm[0];
        const end = i + word.length;
        // Python string prefixes: f"...", r'...', b"""..."""
        if (lang.stringPrefix && lang.stringPrefix.test(word) && (code[end] === '"' || code[end] === "'")) {
          const q = code[end];
          let j;
          if (lang.triple && code.startsWith(q + q + q, end)) {
            j = code.indexOf(q + q + q, end + 3);
            j = j < 0 ? n : j + 3;
          } else {
            j = scanString(code, end, q, false);
          }
          push('string', code.slice(i, j));
          i = j;
          continue;
        }
        // Rust macros: println!
        if (lang.macros && code[end] === '!' && code[end + 1] !== '=') {
          push('function', word + '!');
          i = end + 1;
          continue;
        }
        push(classify(word, lang, prev, code, end), word);
        i = end;
        continue;
      }

      // JavaScript regular expression literals
      if (lang.regex && ch === '/') {
        const canStartRegex = !prev || prev.kind === 'operator' || prev.kind === 'control' || prev.kind === 'keyword' ||
          (prev.kind === 'punct' && !/[)\]}]/.test(prev.text));
        if (canStartRegex) {
          const m = REGEX_LITERAL.exec(code.slice(i, i + 400));
          if (m) {
            push('regex', m[0]);
            i += m[0].length;
            continue;
          }
        }
      }

      // Operators
      if (isOp(ch)) {
        let j = i + 1;
        while (j < n && j - i < 3 && isOp(code[j]) &&
          !(lang.lineComment && code.startsWith(lang.lineComment, j)) &&
          !(lang.blockComment && code.startsWith(lang.blockComment[0], j))) j++;
        push('operator', code.slice(i, j));
        i = j;
        continue;
      }

      // Everything else: brackets, commas, dots...
      if (ch === '?' && code[i + 1] === '.') {
        push('punct', '?.');
        i += 2;
        continue;
      }
      push('punct', ch);
      i++;
    }
    return out;
  }

  function scanTemplate(code, i, lang, out) {
    const n = code.length;
    let j = i + 1;
    let start = i;
    while (j < n) {
      const ch = code[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') { j++; break; }
      if (ch === '$' && code[j + 1] === '{') {
        out.push(['string', code.slice(start, j)]);
        out.push(['punct', '${']);
        let depth = 1;
        let k = j + 2;
        while (k < n) {
          if (code[k] === '{') depth++;
          else if (code[k] === '}' && --depth === 0) break;
          k++;
        }
        out.push(...tokenizeGeneric(code.slice(j + 2, k), lang));
        if (k < n) { out.push(['punct', '}']); k++; }
        j = k;
        start = j;
        continue;
      }
      j++;
    }
    j = Math.min(j, n);
    if (j > start) out.push(['string', code.slice(start, j)]);
    return j;
  }

  /* ---------------- HTML / XML ---------------- */
  function tokenizeHTML(code) {
    const out = [];
    const n = code.length;
    let i = 0;
    while (i < n) {
      if (code.startsWith('<!--', i)) {
        let j = code.indexOf('-->', i + 4);
        j = j < 0 ? n : j + 3;
        out.push(['comment', code.slice(i, j)]);
        i = j;
        continue;
      }
      if (code.startsWith('<!', i) || code.startsWith('<?', i)) {
        let j = code.indexOf('>', i);
        j = j < 0 ? n : j + 1;
        out.push(['keyword', code.slice(i, j)]);
        i = j;
        continue;
      }
      if (code[i] === '<' && /[A-Za-z/]/.test(code[i + 1] || '')) {
        const m = /^<\/?[A-Za-z][\w:.-]*/.exec(code.slice(i, i + 120));
        if (m) {
          const closing = m[0][1] === '/';
          const tagName = m[0].slice(closing ? 2 : 1);
          out.push(['punct', closing ? '</' : '<']);
          out.push(['tag', tagName]);
          i += m[0].length;
          let ended = false;
          while (i < n) {
            const c = code[i];
            if (isSpace(c)) {
              let j = i + 1;
              while (j < n && isSpace(code[j])) j++;
              out.push([null, code.slice(i, j)]);
              i = j;
              continue;
            }
            if (c === '>') { out.push(['punct', '>']); i++; ended = true; break; }
            if (c === '/' && code[i + 1] === '>') { out.push(['punct', '/>']); i += 2; break; }
            if (c === '"' || c === "'") {
              let j = code.indexOf(c, i + 1);
              j = j < 0 ? n : j + 1;
              out.push(['string', code.slice(i, j)]);
              i = j;
              continue;
            }
            if (c === '=') { out.push(['operator', '=']); i++; continue; }
            if (c === '<') break;
            const a = /^[^\s=>"'/<]+/.exec(code.slice(i, i + 200));
            if (a) { out.push(['attr', a[0]]); i += a[0].length; continue; }
            out.push(['punct', c]);
            i++;
          }
          // Embedded <script> and <style>
          const lower = tagName.toLowerCase();
          if (!closing && ended && (lower === 'script' || lower === 'style')) {
            const close = code.toLowerCase().indexOf('</' + lower, i);
            const end = close < 0 ? n : close;
            const inner = code.slice(i, end);
            out.push(...(lower === 'script' ? tokenizeGeneric(inner, L().javascript) : tokenizeCSS(inner)));
            i = end;
          }
          continue;
        }
      }
      if (code[i] === '&') {
        const m = /^&[#\w]+;/.exec(code.slice(i, i + 12));
        if (m) { out.push(['constant', m[0]]); i += m[0].length; continue; }
      }
      let j = i + 1;
      while (j < n && code[j] !== '<' && code[j] !== '&') j++;
      out.push([null, code.slice(i, j)]);
      i = j;
    }
    return out;
  }

  /* ---------------- CSS / SCSS / Less ---------------- */
  function tokenizeCSS(code) {
    const out = [];
    const n = code.length;
    let i = 0;
    let depth = 0;
    let inValue = false;
    let prevText = '';
    const push = (kind, text) => { out.push([kind, text]); if (kind !== null) prevText = text; };

    while (i < n) {
      const c = code[i];
      if (isSpace(c)) {
        let j = i + 1;
        while (j < n && isSpace(code[j])) j++;
        out.push([null, code.slice(i, j)]);
        i = j;
        continue;
      }
      if (code.startsWith('/*', i)) {
        let j = code.indexOf('*/', i + 2);
        j = j < 0 ? n : j + 2;
        out.push(['comment', code.slice(i, j)]);
        i = j;
        continue;
      }
      if (code.startsWith('//', i) && !inValue) { // SCSS / Less line comments
        let j = code.indexOf('\n', i);
        if (j < 0) j = n;
        out.push(['comment', code.slice(i, j)]);
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        const j = scanString(code, i, c, false);
        push('string', code.slice(i, j));
        i = j;
        continue;
      }
      if (c === '{') { depth++; inValue = false; push('punct', c); i++; continue; }
      if (c === '}') { depth = Math.max(0, depth - 1); inValue = false; push('punct', c); i++; continue; }
      if (c === ';') { inValue = false; push('punct', c); i++; continue; }
      if (c === '@') {
        const m = /^@[\w-]+/.exec(code.slice(i, i + 60));
        if (m) { push('control', m[0]); i += m[0].length; continue; }
      }
      if (c === '$' && /[\w-]/.test(code[i + 1] || '')) { // SCSS variables
        const m = /^\$[\w-]+/.exec(code.slice(i, i + 60));
        push('variable', m[0]);
        i += m[0].length;
        continue;
      }
      if (c === '!' && /^!important/i.test(code.slice(i, i + 10))) {
        push('keyword', code.slice(i, i + 10));
        i += 10;
        continue;
      }
      if (c === ':' && depth > 0 && !inValue) {
        // "color:" starts a value; "&:hover" inside nesting does not
        const before = prevText;
        push('punct', c);
        i++;
        if (before !== '&') inValue = true;
        continue;
      }
      if (c === '#') {
        if (inValue) {
          const m = /^#[0-9a-fA-F]{3,8}\b/.exec(code.slice(i, i + 12));
          if (m) { push('number', m[0]); i += m[0].length; continue; }
        } else {
          const m = /^#[\w-]+/.exec(code.slice(i, i + 80));
          if (m) { push('function', m[0]); i += m[0].length; continue; }
        }
      }
      if (c === '.' && !inValue && /[A-Za-z_-]/.test(code[i + 1] || '')) {
        const m = /^\.[\w-]+/.exec(code.slice(i, i + 80));
        push('type', m[0]);
        i += m[0].length;
        continue;
      }
      if (isDigit(c) || ((c === '.' || c === '-') && isDigit(code[i + 1] || ''))) {
        const m = /^-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/.exec(code.slice(i, i + 30));
        if (m) { push('number', m[0]); i += m[0].length; continue; }
      }
      const id = /^-{0,2}[A-Za-z_][\w-]*/.exec(code.slice(i, i + 120));
      if (id) {
        const word = id[0];
        const next = nextNonSpace(code, i + word.length);
        let kind;
        if (inValue) kind = next === '(' ? 'function' : 'constant';
        else if (prevText === ':' || prevText === '::') kind = 'keyword'; // pseudo-classes
        else if (depth > 0 && next === ':' && !/^:[\w-]+\s*[{,]/.test(code.slice(i + word.length, i + word.length + 40))) kind = 'property';
        else kind = 'tag';
        push(kind, word);
        i += word.length;
        continue;
      }
      push(isOp(c) ? 'operator' : 'punct', c);
      i++;
    }
    return out;
  }

  /* ---------------- Markdown ---------------- */
  const INLINE_MD = /(`+)([\s\S]*?)\1|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|(?<![\w])_[^_\s][^_\n]*_(?![\w])|!?\[[^\]\n]*\]\([^)\n]*\)|<https?:[^>\s]+>|https?:\/\/[^\s)]+/g;

  function tokenizeInlineMd(text, out) {
    let last = 0;
    INLINE_MD.lastIndex = 0;
    let m;
    while ((m = INLINE_MD.exec(text))) {
      if (m.index > last) out.push([null, text.slice(last, m.index)]);
      const s = m[0];
      let kind = 'link';
      if (s[0] === '`') kind = 'string';
      else if (s.startsWith('**') || s.startsWith('__')) kind = 'bold';
      else if (s[0] === '*' || s[0] === '_') kind = 'italic';
      out.push([kind, s]);
      last = m.index + s.length;
    }
    if (last < text.length) out.push([null, text.slice(last)]);
  }

  function tokenizeMarkdown(code) {
    const out = [];
    const lines = code.split('\n');
    let fence = null; // { marker, lang, buffer }
    lines.forEach((line, idx) => {
      const nl = idx < lines.length - 1 ? '\n' : '';
      const fenceMatch = /^\s*(```+|~~~+)\s*([\w#+-]*)/.exec(line);
      if (fence) {
        if (fenceMatch && line.trim().startsWith(fence.marker)) {
          const inner = fence.buffer.join('');
          out.push(...(fence.lang ? tokenize(inner, fence.lang) : [[null, inner]]));
          out.push(['punct', line + nl]);
          fence = null;
        } else {
          fence.buffer.push(line + nl);
        }
        return;
      }
      if (fenceMatch) {
        const lang = SC.languages.find(fenceMatch[2]);
        fence = { marker: fenceMatch[1], lang: lang && lang.id !== 'markdown' ? lang : null, buffer: [] };
        out.push(['punct', line + nl]);
        return;
      }
      if (/^#{1,6}\s/.test(line)) { out.push(['heading', line], [null, nl]); return; }
      if (/^\s*>/.test(line)) { out.push(['comment', line], [null, nl]); return; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(['punct', line], [null, nl]); return; }
      const list = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s)?/.exec(line);
      if (list) {
        if (list[1]) out.push([null, list[1]]);
        out.push(['control', list[2]], [null, list[3]]);
        if (list[4]) out.push(['keyword', list[4]]);
        tokenizeInlineMd(line.slice(list[0].length), out);
      } else {
        tokenizeInlineMd(line, out);
      }
      out.push([null, nl]);
    });
    if (fence) {
      const inner = fence.buffer.join('');
      out.push(...(fence.lang ? tokenize(inner, fence.lang) : [[null, inner]]));
    }
    return out;
  }

  /* ---------------- Public API ---------------- */
  function tokenize(code, lang) {
    if (!lang) return [[null, code]];
    switch (lang.custom) {
      case 'html': return tokenizeHTML(code);
      case 'css': return tokenizeCSS(code);
      case 'markdown': return tokenizeMarkdown(code);
      case 'plain': return [[null, code]];
      default: return tokenizeGeneric(code, lang);
    }
  }

  function tokensToHtml(tokens) {
    let html = '';
    for (const [kind, text] of tokens) {
      if (!text) continue;
      html += kind ? '<span class="t-' + kind + '">' + escapeHtml(text) + '</span>' : escapeHtml(text);
    }
    return html;
  }

  function highlight(code, langId) {
    const lang = SC.languages.byId[langId] || SC.languages.byId.plaintext;
    if (code.length > MAX_HIGHLIGHT) return escapeHtml(code);
    try {
      return tokensToHtml(tokenize(code, lang));
    } catch (err) {
      console.error('Highlighter error', err);
      return escapeHtml(code);
    }
  }

  SC.highlighter = { tokenize, highlight, tokensToHtml };
})(window.SC);
