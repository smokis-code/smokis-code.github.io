/* ==========================================================================
   runner.js — runs the active file with F5 and stops it with Shift+F5.

   - JavaScript, TypeScript, Python, Lua, SQL and Ruby run in your browser.
     Each runtime is downloaded from jsDelivr the first time you use it and
     runs inside a sandboxed <iframe>, so your code cannot touch the editor.
   - C, C++, Rust, Go, Java and C# are compiled and run on godbolt.org
     (Compiler Explorer), so they need an internet connection.
   - Markdown renders in the Preview tab, JSON is checked for mistakes and
     HTML is previewed with its linked CSS and JS.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, basename, dirname } = SC.util;

  const NPM = 'https://cdn.jsdelivr.net/npm/';
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  const MARKED = NPM + 'marked@12.0.2/marked.min.js';
  const GODBOLT = 'https://godbolt.org/api/';
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  /* In-browser runtimes. `keep` runtimes stay loaded between runs.
     `worker` runtimes run in a Web Worker inside the sandbox, so an endless
     loop can't freeze the editor and Stop always works. JavaScript runs in
     the sandbox page itself, so code that uses `document` still works. */
  const RUNTIMES = {
    javascript: { label: 'JavaScript', scripts: [] },
    lua: { label: 'Lua', worker: true, scripts: [NPM + 'fengari-web@0.1.4/dist/fengari-web.js'] },
    typescript: { label: 'TypeScript', size: 'about 9 MB', keep: true, scripts: [NPM + 'typescript@5.6.3/lib/typescript.js'] },
    python: { label: 'Python', size: 'about 10 MB', keep: true, worker: true, scripts: [PYODIDE + 'pyodide.js'], indexURL: PYODIDE },
    sql: { label: 'SQLite', size: 'about 0.7 MB', keep: true, worker: true, scripts: [NPM + 'sql.js@1.10.3/dist/sql-wasm.js'], base: NPM + 'sql.js@1.10.3/dist/' },
    ruby: { label: 'Ruby', size: 'about 35 MB', keep: true, worker: true, scripts: [NPM + '@ruby/3.3-wasm-wasi@2.7.0/dist/browser.umd.js'], wasm: NPM + '@ruby/3.3-wasm-wasi@2.7.0/dist/ruby+stdlib.wasm' },
  };

  /* Languages compiled on godbolt.org. `pick` chooses the compiler family. */
  const COMPILED = {
    c: { lang: 'c', label: 'C', args: '-O2 -fdiagnostics-color=never -lm', pick: (c) => c.compilerType === '' && /^x86-64 gcc [\d.]+$/.test(c.name) },
    cpp: { lang: 'c++', label: 'C++', args: '-O2 -std=c++20 -fdiagnostics-color=never', pick: (c) => c.compilerType === '' && /^x86-64 gcc [\d.]+$/.test(c.name) },
    rust: { lang: 'rust', label: 'Rust', args: '--edition 2021 -C opt-level=2', pick: (c) => c.compilerType === 'rust' },
    go: { lang: 'go', label: 'Go', args: '', pick: (c) => c.compilerType === 'golang' },
    java: { lang: 'java', label: 'Java', args: '', pick: (c) => c.compilerType === 'java', prepare: prepareJava },
    csharp: { lang: 'csharp', label: 'C#', args: '', pick: (c) => c.compilerType === 'dotnetcoreclr' },
  };
  const UNSTABLE = /trunk|nightly|beta|snapshot|assert|\(tip\)|master|preview|\brc\d*\b/i;

  /* Code that reads input, per language. */
  const READS_INPUT = {
    javascript: /\bprompt\s*\(/,
    typescript: /\bprompt\s*\(/,
    python: /\binput\s*\(|sys\.stdin|\bask(string|integer|float)\s*\(/,
    lua: /io\.read|io\.lines\s*\(\s*\)/,
    ruby: /\bgets\b|\$stdin|\bSTDIN\b|\breadlines?\b/,
    c: /\b(scanf|getchar|fgets|getline|gets)\s*\(/,
    cpp: /\bcin\b|\b(scanf|getchar|fgets|getline)\s*\(/,
    java: /\bScanner\s*\(|System\.in\b|readLine\s*\(/,
    csharp: /Console\.Read/,
    rust: /\bstdin\s*\(\s*\)/,
    go: /fmt\.Scan|os\.Stdin/,
  };

  const frames = {};       // engine -> loaded sandbox frame
  const lastInput = new Map(); // file -> what was typed last time
  let frameCounter = 0;
  let runCounter = 0;
  let current = null;      // the run in progress

  /* ======================================================================
     Sandbox: this function is turned into text with Function.toString()
     and runs inside the iframe, so it must not use anything from outside.
     ====================================================================== */
  function sandboxMain(cfg) {
    let runId = null;
    let input = [];
    let tokens = [];

    function post(type, extra) {
      const msg = Object.assign({ smokiSandbox: cfg.frame, type: type, run: runId }, extra || {});
      if (cfg.worker) self.postMessage(msg); else parent.postMessage(msg, '*');
    }
    function out(text, kind) { if (text !== '') post('out', { text: String(text), kind: kind || '' }); }
    // Error messages always start on a new line.
    function fail(text) { post('out', { text: String(text).replace(/\n?$/, '\n'), kind: 'error', fresh: true }); }
    function done(extra) { post('done', extra); }
    // Hand out the next line the user typed, and echo it in green.
    function nextLine() {
      if (!input.length) return null;
      const line = input.shift();
      out(line + '\n', 'input');
      return line;
    }
    function loadScript(src) {
      if (cfg.worker) {
        return new Promise(function (resolve, reject) {
          try { importScripts(src); resolve(); } catch (e) { reject(new Error('Could not download ' + src)); }
        });
      }
      return new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Could not download ' + src)); };
        document.head.appendChild(s);
      });
    }
    function fmt(v, depth) {
      depth = depth || 0;
      try {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
        if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
        if (typeof v === 'bigint') return v + 'n';
        if (v instanceof Error) return v.name + ': ' + v.message;
        if (typeof v === 'object') {
          if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
          if (Array.isArray(v)) return '[ ' + v.map(function (x) { return fmt(x, depth + 1); }).join(', ') + ' ]';
          if (v instanceof Map) return 'Map(' + v.size + ') { ' + Array.from(v).map(function (e) { return fmt(e[0], depth + 1) + ' => ' + fmt(e[1], depth + 1); }).join(', ') + ' }';
          if (v instanceof Set) return 'Set(' + v.size + ') { ' + Array.from(v).map(function (x) { return fmt(x, depth + 1); }).join(', ') + ' }';
          return '{ ' + Object.keys(v).map(function (k) { return k + ': ' + fmt(v[k], depth + 1); }).join(', ') + ' }';
        }
        return String(v);
      } catch (e) { return String(v); }
    }

    /* ---------- JavaScript (also runs compiled TypeScript) ---------- */
    function runJs(msg) {
      const live = new Set();
      const timers = { st: setTimeout.bind(window), ct: clearTimeout.bind(window), si: setInterval.bind(window), ci: clearInterval.bind(window) };
      let sync = true;
      let finished = false;
      // The run is done once the code has finished and no timers are left.
      function check() {
        timers.st(function () {
          if (!finished && !sync && live.size === 0) { finished = true; done(); }
        }, 0);
      }
      ['log', 'info', 'warn', 'error', 'debug', 'trace'].forEach(function (k) {
        const kind = k === 'log' || k === 'debug' || k === 'trace' ? '' : k;
        console[k] = function () { out(Array.prototype.map.call(arguments, function (a) { return fmt(a); }).join(' ') + '\n', kind); };
      });
      console.table = console.dir = console.log;
      window.alert = function (m) { out(fmt(m) + '\n'); };
      window.prompt = function (m) {
        if (m != null) out(String(m) + ' ');
        const line = nextLine();
        if (line === null) out('\n');
        return line;
      };
      window.setTimeout = function (fn, ms) {
        const args = Array.prototype.slice.call(arguments, 2);
        const id = timers.st(function () {
          live.delete(id);
          try { if (typeof fn === 'function') fn.apply(null, args); } finally { check(); }
        }, ms);
        live.add(id);
        return id;
      };
      window.clearTimeout = function (id) { live.delete(id); timers.ct(id); check(); };
      window.setInterval = function (fn, ms) {
        const args = Array.prototype.slice.call(arguments, 2);
        const id = timers.si(function () { if (typeof fn === 'function') fn.apply(null, args); }, ms);
        live.add(id);
        return id;
      };
      window.clearInterval = function (id) { live.delete(id); timers.ci(id); check(); };
      window.onerror = function (message, src, line, col, err) {
        const text = err && err.name ? err.name + ': ' + err.message : String(message).replace(/^Uncaught /, '');
        fail('Uncaught ' + text + (line ? ' (' + msg.name + ':' + line + ')' : ''));
        check();
        return true;
      };
      window.addEventListener('unhandledrejection', function (e) { fail('Uncaught (in promise) ' + fmt(e.reason)); });
      if (msg.commonjs) {
        window.exports = {};
        window.module = { exports: window.exports };
        window.require = function (name) { throw new Error('Importing "' + name + '" is not supported here.'); };
      }
      const script = document.createElement('script');
      script.textContent = msg.code + '\n//# sourceURL=' + msg.name.replace(/\s/g, '_');
      document.body.appendChild(script);
      sync = false;
      check();
    }

    /* ---------- TypeScript: compile here, run as JavaScript ---------- */
    function runTs(msg) {
      const ts = window.ts;
      const res = ts.transpileModule(msg.code, {
        fileName: msg.name,
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      });
      const errors = (res.diagnostics || []).filter(function (d) { return d.category === ts.DiagnosticCategory.Error; });
      if (errors.length) {
        errors.forEach(function (d) {
          const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
          fail(msg.name + (pos ? ':' + (pos.line + 1) + ':' + (pos.character + 1) : '') + ' - error TS' + d.code + ': ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        });
        done({ failed: true });
        return;
      }
      post('js', { code: res.outputText });
    }

    /* ---------- Python (Pyodide) ---------- */
    let py = null;
    async function bootPython() {
      await loadScript(cfg.scripts[0]);
      py = await self.loadPyodide({ indexURL: cfg.indexURL });
      const decOut = new TextDecoder();
      const decErr = new TextDecoder();
      py.setStdout({ write: function (b) { out(decOut.decode(b, { stream: true })); return b.length; }, isatty: true });
      py.setStderr({ write: function (b) { out(decErr.decode(b, { stream: true }), 'error'); return b.length; }, isatty: true });
      py.setStdin({ stdin: function () { const line = nextLine(); return line === null ? null : line + '\n'; } });
    }
    // Python modules from extensions (such as tkinter) live in /smoki_lib.
    const pyModules = {};
    const pipInstalled = new Set();
    let pyLibReady = false;
    async function preparePython(msg) {
      if (!pyLibReady) {
        py.FS.mkdirTree('/smoki_lib');
        py.runPython('import sys\nsys.path.insert(0, "/smoki_lib")');
        pyLibReady = true;
      }
      const files = msg.pyModules || {};
      const tops = Object.keys(files).concat(Object.keys(pyModules)).map(function (p) { return p.split('/')[0].replace(/\.py$/, ''); });
      // Remove modules from extensions that were turned off
      for (const path of Object.keys(pyModules)) {
        if (path in files) continue;
        try { py.FS.unlink('/smoki_lib/' + path); } catch (err) { /* already gone */ }
        delete pyModules[path];
        // An empty folder would still import as a package, so remove it too
        const parts = path.split('/').slice(0, -1);
        for (let i = parts.length; i > 0; i--) {
          try { py.FS.rmdir('/smoki_lib/' + parts.slice(0, i).join('/')); } catch (err) { break; }
        }
      }
      for (const path of Object.keys(files)) {
        if (pyModules[path] === files[path]) continue;
        const dir = '/smoki_lib/' + path.split('/').slice(0, -1).join('/');
        py.FS.mkdirTree(dir);
        py.FS.writeFile('/smoki_lib/' + path, files[path]);
        pyModules[path] = files[path];
      }
      // Forget extension modules from the last run, so each run starts fresh.
      py.runPython([
        'import sys, importlib',
        'for _m in [m for m in sys.modules if m.split(".")[0] in ' + JSON.stringify(tops) + ']:',
        '    del sys.modules[_m]',
        'importlib.invalidate_caches()',
      ].join('\n'));
      // Packages installed with pip
      const missing = (msg.pip || []).filter(function (p) { return !pipInstalled.has(p); });
      if (missing.length) {
        out('Loading pip packages: ' + missing.join(', ') + '\n', 'info');
        await py.loadPackage('micropip');
        try {
          await py.pyimport('micropip').install(missing);
          missing.forEach(function (p) { pipInstalled.add(p); });
        } catch (err) {
          fail('Could not load pip packages: ' + String(err.message || err).split('\n').pop());
        }
      }
    }
    // The terminal's Python prompt. Lines are compiled like the real REPL.
    const REPL = [
      'import codeop as _codeop, sys as _sys, traceback as _tb',
      '_smoki_ns = {"__name__": "__main__"}',
      '_smoki_buf = []',
      'def _smoki_repl(line):',
      '    _smoki_buf.append(line)',
      '    try:',
      '        code = _codeop.compile_command("\\n".join(_smoki_buf), "<stdin>", "single")',
      '    except (SyntaxError, OverflowError, ValueError):',
      '        _smoki_buf.clear()',
      '        _tb.print_exc(limit=0)',
      '        return "ok"',
      '    if code is None:',
      '        return "more"',
      '    _smoki_buf.clear()',
      '    try:',
      '        exec(code, _smoki_ns)',
      '    except SystemExit:',
      '        return "exit"',
      '    except BaseException:',
      '        t, v, tb = _sys.exc_info()',
      '        _tb.print_exception(t, v, tb.tb_next)',
      '    return "ok"',
    ].join('\n');
    let replReady = false;
    async function runRepl(msg) {
      if (!replReady) { py.runPython(REPL); replReady = true; }
      await py.loadPackagesFromImports(msg.code);
      const status = py.globals.get('_smoki_repl')(msg.code);
      py.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
      done({ status: status });
    }
    async function runPython(msg) {
      await preparePython(msg);
      if (msg.repl) { await runRepl(msg); return; }
      const scope = py.globals.get('dict')();
      scope.set('__name__', '__main__');
      scope.set('__file__', msg.name);
      self.smokiAppOpen = false;
      let failed = false;
      try {
        await py.loadPackagesFromImports(msg.code, { messageCallback: function (m) { if (!/already loaded|No new packages/.test(m)) out(m + '\n', 'info'); }, errorCallback: function (m) { out(m + '\n', 'warn'); } });
        await py.runPythonAsync(msg.code, { globals: scope, filename: msg.name });
      } catch (err) {
        py.runPython('import sys\nsys.stdout.flush()');
        const text = String(err.message || err);
        const exit = /SystemExit:? ?(.*)\s*$/.exec(text.trim().split('\n').pop());
        if (exit) { // sys.exit(): no traceback, like real Python
          const code = exit[1].trim();
          failed = !/^(0|None|)$/.test(code);
          if (failed && !/^\d+$/.test(code)) fail(code);
        } else {
          failed = true;
          fail(cleanTraceback(text, msg.name));
        }
      } finally {
        py.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
      }
      // A GUI app (tkinter) keeps running after the code ends, until its window closes.
      if (self.smokiAppOpen) { post('waiting'); return; }
      scope.destroy();
      done({ failed: failed });
    }
    // Called by the tkinter module
    self.smokiAppSend = function (json) { post('app', { ui: json }); };
    self.smokiAppClosed = function () { if (self.smokiAppOpen) { self.smokiAppOpen = false; done(); } };
    // Hide Pyodide's own frames so the traceback starts at your file.
    function cleanTraceback(text, name) {
      const lines = text.replace(/File "<exec>"/g, 'File "' + name + '"').split('\n');
      const first = lines.findIndex(function (l) { return l.indexOf('File "' + name + '"') !== -1; });
      if (first === -1) return text.trim();
      return ['Traceback (most recent call last):'].concat(lines.slice(first)).join('\n').trim();
    }

    /* ---------- Lua (Fengari) ---------- */
    function runLua(msg) {
      const f = self.fengari;
      const lua = f.lua;
      const lauxlib = f.lauxlib;
      const S = f.to_luastring;
      const J = f.to_jsstring;
      const L = lauxlib.luaL_newstate();
      f.lualib.luaL_openlibs(L);
      function str(L, i) { const s = J(lauxlib.luaL_tolstring(L, i)); lua.lua_pop(L, 1); return s; }
      function fn(name, impl) { lua.lua_pushjsfunction(L, impl); lua.lua_setfield(L, -2, S(name)); }
      lua.lua_pushjsfunction(L, function (L) {
        const parts = [];
        for (let i = 1; i <= lua.lua_gettop(L); i++) parts.push(str(L, i));
        out(parts.join('\t') + '\n');
        return 0;
      });
      lua.lua_setglobal(L, S('print'));
      // fengari-web has no io library, so make an io table with write/read/lines.
      lua.lua_getglobal(L, S('io'));
      if (lua.lua_type(L, -1) !== lua.LUA_TTABLE) {
        lua.lua_pop(L, 1);
        lua.lua_newtable(L);
        lua.lua_pushvalue(L, -1);
        lua.lua_setglobal(L, S('io'));
      }
      fn('write', function (L) {
        let s = '';
        for (let i = 1; i <= lua.lua_gettop(L); i++) s += J(lauxlib.luaL_checklstring(L, i));
        out(s);
        return 0;
      });
      fn('read', function (L) {
        const format = lua.lua_type(L, 1) === lua.LUA_TSTRING ? J(lua.lua_tostring(L, 1)).replace(/^\*/, '')[0] : 'l';
        if (format === 'n') {
          if (!tokens.length) { const line = nextLine(); if (line !== null) tokens = line.trim().split(/\s+/).filter(Boolean); }
          const n = tokens.length ? Number(tokens.shift()) : NaN;
          if (isNaN(n)) lua.lua_pushnil(L);
          else if (Number.isSafeInteger(n)) lua.lua_pushinteger(L, n);
          else lua.lua_pushnumber(L, n);
          return 1;
        }
        if (tokens.length) { const rest = tokens.join(' '); tokens = []; lua.lua_pushstring(L, S(rest)); return 1; }
        if (format === 'a') {
          let all = '';
          for (let line = nextLine(); line !== null; line = nextLine()) all += line + '\n';
          lua.lua_pushstring(L, S(all));
          return 1;
        }
        const line = nextLine();
        if (line === null) lua.lua_pushnil(L);
        else lua.lua_pushstring(L, S(format === 'L' ? line + '\n' : line));
        return 1;
      });
      fn('lines', function (L) {
        lua.lua_pushjsfunction(L, function (L) {
          const line = nextLine();
          if (line === null) lua.lua_pushnil(L); else lua.lua_pushstring(L, S(line));
          return 1;
        });
        return 1;
      });
      lua.lua_pop(L, 1);
      const code = S(msg.code);
      let status = lauxlib.luaL_loadbuffer(L, code, code.length, S('@' + msg.name));
      if (status === lua.LUA_OK) status = lua.lua_pcall(L, 0, 0, 0);
      if (status !== lua.LUA_OK) { fail(str(L, -1)); done({ failed: true }); return; }
      done();
    }

    /* ---------- SQL (sql.js / SQLite) ---------- */
    let SQL = null;
    function table(cols, rows) {
      const cell = function (v) { return v === null ? 'NULL' : v instanceof Uint8Array ? '<' + v.length + ' bytes>' : String(v); };
      const cells = [cols].concat(rows.map(function (r) { return r.map(cell); }));
      const w = cols.map(function (_, i) { return Math.max.apply(null, cells.map(function (r) { return r[i].length; })); });
      const line = '+' + w.map(function (n) { return '-'.repeat(n + 2); }).join('+') + '+';
      const row = function (r) { return '| ' + r.map(function (c, i) { return c + ' '.repeat(w[i] - c.length); }).join(' | ') + ' |'; };
      return [line, row(cells[0]), line].concat(cells.slice(1).map(row), [line, rows.length + (rows.length === 1 ? ' row' : ' rows')]).join('\n') + '\n';
    }
    function runSql(msg) {
      const db = new SQL.Database();
      let failed = false;
      try {
        for (const stmt of db.iterateStatements(msg.code)) {
          const cols = stmt.getColumnNames();
          const rows = [];
          while (stmt.step()) rows.push(stmt.get());
          if (cols.length) out(table(cols, rows));
          else if (/^\s*(insert|update|delete|replace)\b/i.test(stmt.getSQL())) out(db.getRowsModified() + ' row(s) changed\n', 'info');
        }
      } catch (err) {
        fail('Error: ' + err.message);
        failed = true;
      } finally {
        db.close();
      }
      done({ failed: failed });
    }

    /* ---------- Ruby (ruby.wasm) ---------- */
    let rubyModule = null;
    // Runs inside a fresh Ruby VM for every run. stdin comes from self.smokiGets.
    const RUBY_PRELUDE = [
      'require "js"',
      '$stdout.sync = true',
      '$stderr.sync = true',
      'class SmokiStdin',
      '  def gets(*)',
      '    s = JS.global.call(:smokiGets).to_s',
      '    s.empty? ? nil : s',
      '  end',
      '  def readline(*) = gets || raise(EOFError, "end of file reached")',
      '  def read(*) = readlines.join',
      '  def readlines(*)',
      '    lines = []',
      '    while (l = gets) do lines << l end',
      '    lines',
      '  end',
      '  def each_line',
      '    while (l = gets) do yield l end',
      '    self',
      '  end',
      '  def tty? = false',
      '  def sync = true',
      '  def sync=(_value); end',
      '  def fileno = 0',
      'end',
      '$stdin = SmokiStdin.new',
      'Object.send(:remove_const, :STDIN)',
      'STDIN = $stdin',
      'smoki_name = JS.global[:smokiName].to_s',
      'begin',
      '  eval(JS.global[:smokiSrc].to_s, TOPLEVEL_BINDING, smoki_name, 1)',
      'rescue SystemExit',
      'rescue Exception => e',
      '  bt = e.backtrace.to_a.select { |l| l.start_with?(smoki_name + ":") }',
      '  head = bt.empty? ? "" : bt.first + ": "',
      '  $stderr.write(head + e.message + " (" + e.class.name + ")\\n" + bt.drop(1).map { |l| "\\tfrom " + l + "\\n" }.join)',
      'end',
      '$stdout.flush',
    ].join('\n');
    async function bootRuby() {
      // ruby.wasm keeps a reference to console.log/console.warn when a VM is
      // created and passes them raw chunks such as "text\n". Send those
      // chunks as they are, so no extra blank lines appear.
      console.log = function (s) { out(String(s)); };
      console.warn = function (s) { out(String(s), 'error'); };
      await loadScript(cfg.scripts[0]);
      const res = await fetch(cfg.wasm);
      if (!res.ok) throw new Error('Could not download ' + cfg.wasm);
      try { rubyModule = await WebAssembly.compileStreaming(res.clone()); } catch (e) { rubyModule = await WebAssembly.compile(await res.arrayBuffer()); }
    }
    async function runRuby(msg) {
      try {
        const vm = (await self['ruby-wasm-wasi'].DefaultRubyVM(rubyModule)).vm;
        self.smokiSrc = msg.code;
        self.smokiName = msg.name;
        self.smokiGets = function () { const line = nextLine(); return line === null ? '' : line + '\n'; };
        vm.eval(RUBY_PRELUDE);
      } catch (err) {
        fail(String(err.message || err));
      }
      done();
    }

    /* ---------- Startup and messages ---------- */
    const engines = {
      javascript: { run: runJs },
      typescript: { boot: function () { return loadScript(cfg.scripts[0]); }, run: runTs },
      python: { boot: bootPython, run: runPython },
      lua: {
        boot: function () { self.window = self; return loadScript(cfg.scripts[0]); }, // fengari-web expects window
        run: runLua,
      },
      sql: {
        boot: async function () {
          await loadScript(cfg.scripts[0]);
          SQL = await self.initSqlJs({ locateFile: function (file) { return cfg.base + file; } });
        },
        run: runSql,
      },
      ruby: { boot: bootRuby, run: runRuby },
    };
    const engine = engines[cfg.engine];
    self.addEventListener('message', function (e) {
      const msg = e.data;
      if ((!cfg.worker && e.source !== parent) || !msg || msg.smokiRun == null) return;
      // Clicks and typing in a running app window (tkinter)
      if (msg.appEvent) {
        if (self.smokiAppHandler) {
          try { self.smokiAppHandler(JSON.stringify(msg.appEvent)); } catch (err) { fail(String(err.message || err)); }
        }
        return;
      }
      runId = msg.smokiRun;
      input = msg.stdin ? msg.stdin.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
      tokens = [];
      Promise.resolve()
        .then(function () { return engine.run(msg); })
        .catch(function (err) { fail(String(err && err.message || err)); done({ failed: true }); });
    });
    Promise.resolve(engine.boot && engine.boot())
      .then(function () { post('ready'); })
      .catch(function (err) { post('fail', { message: String(err && err.message || err) }); });
  }

  /** Runs in the sandbox page of a worker runtime: starts the worker and passes messages both ways. */
  function frameRelay(cfg, source) {
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    worker.onmessage = function (e) { parent.postMessage(e.data, '*'); };
    worker.onerror = function (e) {
      e.preventDefault();
      parent.postMessage({ smokiSandbox: cfg.frame, type: 'fail', message: e.message || 'The runtime stopped unexpectedly.' }, '*');
    };
    window.addEventListener('message', function (e) { if (e.source === parent) worker.postMessage(e.data); });
  }

  /* ======================================================================
     Parent side
     ====================================================================== */
  function fmtTime(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'; }

  /* Where a run's output goes: the Output tab, or the terminal (see terminal.js). */
  const panelSink = {
    start(name) { SC.panel.show('output'); SC.panel.clear(); SC.panel.log('[Running] ' + name, 'system'); },
    write: (text, kind) => SC.panel.write(text, kind),
    log: (text, kind) => SC.panel.log(text, kind),
    isLineOpen: () => SC.panel.isLineOpen(),
    finish: (message, kind) => SC.panel.log(message, kind),
  };

  function startRun(name, sink = panelSink) {
    const run = { id: ++runCounter, name, started: performance.now(), done: false, frame: null, controller: null, out: sink };
    run.promise = new Promise((resolve) => { run.resolve = resolve; });
    current = run;
    if (sink.start) sink.start(name);
    SC.panel.setRunning(true);
    run.finish = (message, kind = 'system', result = {}) => {
      if (run.done) return;
      run.done = true;
      if (current === run) current = null;
      if (sink.isLineOpen()) sink.write('\n');
      sink.finish(message || '[Done] finished in ' + fmtTime(performance.now() - run.started), kind, result);
      SC.panel.setRunning(!!current);
      run.resolve(Object.assign({ ok: kind !== 'error', message }, result));
      (listeners.finish || []).forEach((fn) => fn(run));
    };
    return run;
  }

  function killFrame(engine) {
    const f = frames[engine];
    if (!f) return;
    f.iframe.remove();
    delete frames[engine];
  }

  function getFrame(engine) {
    const rt = RUNTIMES[engine];
    if (frames[engine]) return frames[engine];
    const token = 'smoki-frame-' + (++frameCounter);
    const f = { engine, token, booted: false };
    f.ready = new Promise((resolve, reject) => { f.resolve = resolve; f.reject = reject; });
    f.ready.catch(() => {});
    const cfg = { frame: token, engine, worker: !!rt.worker, scripts: rt.scripts, indexURL: rt.indexURL, base: rt.base, wasm: rt.wasm, data: rt.data };
    const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
    // Runtimes added by extensions bring their own sandbox code (rt.main)
    const main = '(' + (rt.main || sandboxMain).toString() + ')(' + json(cfg) + ');';
    // Worker runtimes get a small page that starts the worker; JavaScript runs in the page itself.
    const boot = rt.worker ? '(' + frameRelay.toString() + ')(' + json(cfg) + ', ' + json(main) + ');' : main;
    f.iframe = el('iframe', { sandbox: 'allow-scripts', title: rt.label + ' runtime', style: { display: 'none' } });
    f.iframe.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>' + boot + '<\/script></body></html>';
    frames[engine] = f;
    document.body.append(f.iframe);
    return f;
  }

  async function runLocal(run, engine, code, stdin, extra) {
    const rt = RUNTIMES[engine];
    if (!rt.keep) killFrame(engine); // JavaScript and Lua start fresh every time
    const f = getFrame(engine);
    run.frame = f;
    if (!f.booted && rt.size) run.out.log('Starting ' + rt.label + '. The first run downloads ' + rt.size + '; later runs use the browser cache.', 'info');
    if (engine === 'python') extra = Object.assign(pythonExtras(), extra || {});
    try {
      await f.ready;
    } catch (err) {
      killFrame(engine);
      if (run === current) run.finish('[Error] Could not start ' + rt.label + ': ' + err.message + '. Check your internet connection and press F5 to try again.', 'error');
      return;
    }
    if (run !== current) return;
    f.iframe.contentWindow.postMessage(Object.assign({ smokiRun: run.id, code, name: run.name, stdin }, extra || {}), '*');
  }

  function onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object' || !d.smokiSandbox) return;
    const f = Object.values(frames).find((x) => x.token === d.smokiSandbox);
    if (!f || e.source !== f.iframe.contentWindow) return;
    if (d.type === 'ready') { f.booted = true; f.resolve(); return; }
    if (d.type === 'fail') {
      f.reject(new Error(d.message));
      // The runtime crashed while a program was running
      if (current && current.frame === f && f.booted) { killFrame(f.engine); current.finish('[Error] ' + d.message, 'error'); }
      return;
    }
    const run = current;
    if (!run || d.run !== run.id) return;
    if (d.type === 'out') {
      if (d.fresh && run.out.isLineOpen()) run.out.write('\n');
      run.out.write(d.text, d.kind);
    }
    else if (d.type === 'js') runLocal(run, 'javascript', d.code, run.stdin, { commonjs: true });
    else if (d.type === 'waiting') {
      run.waiting = true;
      run.out.log('The app window is open. Close it, or press Shift+F5, to end the program.', 'info');
    }
    else if (d.type === 'done') run.finish(d.failed ? '[Failed] after ' + fmtTime(performance.now() - run.started) : '', d.failed ? 'error' : 'system', { status: d.status });
    else (listeners[d.type] || []).forEach((fn) => fn(d, run));
  }

  /* ---------- Hooks for extensions ---------- */
  const listeners = {};
  const pythonProviders = [];
  /** Listen for a custom message type from a running program (for example 'app'). */
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  function off(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); }
  /** Send a message to the program a run belongs to. */
  function send(run, msg) {
    if (run && run.frame && run.frame.iframe.contentWindow) run.frame.iframe.contentWindow.postMessage(Object.assign({ smokiRun: run.id }, msg), '*');
  }
  /** Add Python modules or pip packages to every Python run: fn() returns { pyModules, pip }. */
  function addPythonProvider(fn) { pythonProviders.push(fn); return () => pythonProviders.splice(pythonProviders.indexOf(fn) >>> 0, 1); }

  /**
   * Add a runtime from an extension: rt = { label, worker, keep, main(cfg), data }.
   * main runs in the sandbox (worker) and speaks the same messages as sandboxMain.
   */
  function addRuntime(id, rt) {
    RUNTIMES[id] = rt;
    return () => { if (RUNTIMES[id] === rt) { killFrame(id); delete RUNTIMES[id]; } };
  }

  /** Let an extension take F5 runs: fn({ lang, code }) returns null, { error } or { lang, extra }. */
  const routers = [];
  function addRouter(fn) { routers.push(fn); return () => { const i = routers.indexOf(fn); if (i !== -1) routers.splice(i, 1); }; }
  function routeRun(lang, code) {
    for (const fn of routers) { const r = fn({ lang, code }); if (r) return r; }
    return null;
  }
  function pythonExtras() {
    const extra = { pyModules: {}, pip: [] };
    for (const fn of pythonProviders) {
      const x = fn() || {};
      Object.assign(extra.pyModules, x.pyModules || {});
      extra.pip.push(...(x.pip || []));
    }
    return extra;
  }

  /* ---------- godbolt.org ---------- */
  function versionOf(c) {
    const text = c.semver && /\d/.test(c.semver) ? c.semver : c.name;
    return ((text.match(/\d+(?:\.\d+)*/) || ['0'])[0]).split('.').map(Number);
  }
  function compareVersions(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /** Newest stable x86 compiler that can run code. Cached for 7 days. */
  async function pickCompiler(spec, signal, fresh) {
    const key = 'godbolt2.' + spec.lang; // v2: older saved picks could be 32-bit
    const cached = SC.storage.get(key, null);
    if (!fresh && cached && Date.now() - cached.time < WEEK) return cached;
    const res = await fetch(GODBOLT + 'compilers/' + encodeURIComponent(spec.lang) + '?fields=id,name,semver,instructionSet,supportsExecute,compilerType', { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error('godbolt.org answered with error ' + res.status + '.');
    const list = (await res.json()).filter((c) => c.supportsExecute && !UNSTABLE.test(c.name + ' ' + (c.semver || '')));
    let pool = list.filter(spec.pick);
    if (!pool.length) pool = list.filter((c) => c.instructionSet === 'amd64');
    if (!pool.length) throw new Error('godbolt.org has no compiler that can run ' + spec.label + ' right now.');
    // Newest first; for the same version prefer 64-bit (32-bit Go builds time out)
    const is64 = (c) => (c.instructionSet === 'amd64' ? 0 : 1);
    pool.sort((a, b) => compareVersions(versionOf(b), versionOf(a)) || is64(a) - is64(b));
    const pick = { id: pool[0].id, name: pool[0].name, time: Date.now() };
    SC.storage.set(key, pick);
    return pick;
  }

  /** godbolt saves Java code as example.java, so top-level classes can't be public or in a package. */
  function prepareJava(code) {
    return code
      .replace(/^[ \t]*package\s+[\w.]+\s*;/m, (m) => '// ' + m.trim())
      .replace(/^public\s+((?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\b)/gm, '$1');
  }

  async function runRemote(run, spec, code, stdin) {
    const controller = new AbortController();
    run.controller = controller;
    const file = basename(run.name);
    const clean = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/<source>|example\.\w+/g, file);
    const lines = (arr) => (arr || []).map((x) => x.text).join('\n');
    try {
      let compiler = await pickCompiler(spec, controller.signal);
      run.out.log('Compiling on godbolt.org with ' + compiler.name + '...', 'info');
      const body = JSON.stringify({
        source: spec.prepare ? spec.prepare(code) : code,
        lang: spec.lang,
        allowStoreCodeDebug: false,
        options: run.compileOnly ? {
          // Build only (gcc, javac... in the terminal): no program run
          userArguments: spec.args,
          compilerOptions: { executorRequest: false, skipAsm: true },
          filters: { execute: false, binary: false },
          tools: [],
          libraries: [],
        } : {
          userArguments: spec.args,
          compilerOptions: { executorRequest: true, skipAsm: true },
          executeParameters: { args: [], stdin: stdin && !stdin.endsWith('\n') ? stdin + '\n' : stdin },
          filters: { execute: true },
          tools: [],
          libraries: [],
        },
      });
      const send = (c) => fetch(GODBOLT + 'compiler/' + encodeURIComponent(c.id) + '/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body, signal: controller.signal,
      });
      let res = await send(compiler);
      if (res.status === 404) { // the cached compiler was removed: pick again
        compiler = await pickCompiler(spec, controller.signal, true);
        res = await send(compiler);
      }
      if (!res.ok) throw new Error('godbolt.org answered with error ' + res.status + '.');
      const r = await res.json();
      if (run !== current) return;
      if (run.compileOnly) {
        const messages = clean(lines(r.stderr) || lines(r.stdout));
        if (r.code) {
          if (messages) run.out.write(messages + '\n', 'error');
          run.finish('[Build failed] ' + spec.label + ' code did not compile', 'error');
        } else {
          if (messages) run.out.write(messages + '\n', 'warn');
          run.finish('[Done] built with ' + compiler.name + ' in ' + fmtTime(performance.now() - run.started), 'system', { compiler: compiler.name });
        }
        return;
      }
      const build = r.buildResult || {};
      if (!r.didExecute) {
        const errors = clean(lines(build.stderr) || lines(build.stdout) || lines(r.stderr));
        if (errors) run.out.write(errors + '\n', 'error');
        run.finish('[Build failed] ' + spec.label + ' code did not compile', 'error');
        return;
      }
      const warnings = clean(lines(build.stderr));
      if (warnings) run.out.write(warnings + '\n', 'warn');
      if (stdin) run.out.write(stdin.replace(/\n?$/, '\n'), 'input');
      if (r.stdout && r.stdout.length) run.out.write(lines(r.stdout) + '\n');
      if (r.stderr && r.stderr.length) run.out.write(clean(lines(r.stderr)) + '\n', 'error');
      if (r.timedOut) run.out.log('The program took too long and was stopped by godbolt.org.', 'warn');
      if (r.truncated) run.out.log('The output was too long and was cut off.', 'warn');
      const time = fmtTime(performance.now() - run.started);
      if (r.code) run.finish('[Done] exited with code ' + r.code + ' in ' + time, 'warn');
      else run.finish('[Done] finished in ' + time + (r.execTime ? ' (program ran for ' + r.execTime + ' ms)' : ''));
    } catch (err) {
      if (err.name === 'AbortError' || run !== current) return;
      run.finish('[Error] Could not reach godbolt.org: ' + err.message + ' ' + spec.label + ' code is compiled online, so it needs an internet connection.', 'error');
    }
  }

  /* ---------- Markdown, JSON, HTML ---------- */
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return { bg: v('--c-bg', '#1c1d21'), fg: v('--c-fg', '#e6e6e6'), muted: v('--c-fg-muted', '#999'), accent: v('--c-accent', '#ff8a4c'), border: v('--c-border', '#333') };
  }

  function previewMarkdown(md, path) {
    const c = themeColors();
    const css = 'body{margin:0;padding:24px 32px;background:' + c.bg + ';color:' + c.fg + ';font:15px/1.6 system-ui,sans-serif}' +
      'main{max-width:760px;margin:0 auto}a{color:' + c.accent + '}h1,h2{border-bottom:1px solid ' + c.border + ';padding-bottom:.3em}' +
      'code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:rgba(127,127,127,.15);padding:.1em .35em;border-radius:4px}' +
      'pre{background:rgba(127,127,127,.12);padding:12px 16px;border-radius:6px;overflow:auto}pre code{background:none;padding:0}' +
      'blockquote{margin:0;padding:0 1em;color:' + c.muted + ';border-left:3px solid ' + c.border + '}' +
      'table{border-collapse:collapse}th,td{border:1px solid ' + c.border + ';padding:4px 10px}img{max-width:100%}';
    const src = JSON.stringify(md).replace(/</g, '\\u003c');
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style>' +
      '<script src="' + MARKED + '"><\/script></head><body><main id="md"></main><script>' +
      'var src=' + src + ',m=document.getElementById("md");' +
      'if(window.marked){m.innerHTML=marked.parse(src);}else{var p=document.createElement("pre");p.textContent=src;' +
      'm.innerHTML="<p><em>Could not download the Markdown renderer, so this is the plain text.</em></p>";m.appendChild(p);}' +
      '<\/script></body></html>';
    SC.panel.previewDoc(html, '[Preview] ' + (path || 'Untitled'));
  }

  function checkJson(text, name, doc) {
    SC.panel.show('output');
    SC.panel.clear();
    SC.panel.log('[Checking] ' + name, 'system');
    try {
      const v = JSON.parse(text);
      const what = Array.isArray(v) ? 'an array with ' + v.length + ' items'
        : v && typeof v === 'object' ? 'an object with ' + Object.keys(v).length + ' keys'
          : 'a single ' + (v === null ? 'null' : typeof v) + ' value';
      SC.panel.log('Valid JSON: ' + what + '.', 'success');
    } catch (err) {
      // Browsers word JSON errors differently (and some give no position), so find it ourselves.
      const found = findJsonError(text) || { pos: text.length, reason: String(err.message) };
      const before = text.slice(0, found.pos).split('\n');
      const line = before.length;
      const col = before[before.length - 1].length + 1;
      SC.panel.log(name + ':' + line + ':' + col + '  ' + found.reason, 'error');
      SC.panel.log('Invalid JSON at line ' + line + ', column ' + col + '.', 'error');
      if (doc && doc.path) SC.tabs.open(doc.path, { line, col });
    }
  }

  /** Small JSON checker that says where the first mistake is: { pos, reason } or null. */
  function findJsonError(s) {
    let i = 0;
    const stop = (reason) => { throw { pos: i, reason }; };
    const NUMBER = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
    const space = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };
    function string() {
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '"') { i++; return; }
        if (c === '\\') { i += 2; continue; }
        if (c < ' ') stop('Line breaks and tabs inside a string must be escaped (\\n, \\t).');
        i++;
      }
      stop('This string is never closed with a double quote.');
    }
    function value() {
      space();
      const c = s[i];
      if (c === '{') {
        i++; space();
        if (s[i] === '}') { i++; return; }
        for (;;) {
          space();
          if (s[i] !== '"') stop(s[i] === '}' ? 'Remove the comma before the closing }.' : 'Expected a property name in double quotes.');
          string(); space();
          if (s[i] !== ':') stop('Expected a colon after the property name.');
          i++; value(); space();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === '}') { i++; return; }
          stop('Expected a comma or a closing }.');
        }
      }
      if (c === '[') {
        i++; space();
        if (s[i] === ']') { i++; return; }
        for (;;) {
          space();
          if (s[i] === ']') stop('Remove the comma before the closing ].');
          value(); space();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ']') { i++; return; }
          stop('Expected a comma or a closing ].');
        }
      }
      if (c === '"') { string(); return; }
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(s);
      if (m) { i += m[0].length; return; }
      for (const word of ['true', 'false', 'null']) if (s.startsWith(word, i)) { i += word.length; return; }
      if (i >= s.length) stop('The file ends before the JSON is complete.');
      stop(c === "'" ? 'JSON strings need double quotes, not single quotes.' : 'Unexpected character "' + c + '".');
    }
    try {
      value();
      space();
      if (i < s.length) stop('Unexpected text after the end of the JSON.');
      return null;
    } catch (e) {
      return e;
    }
  }

  function previewCss(doc) {
    const html = SC.fs.allFiles().find((f) => /\.html?$/i.test(f.path) && dirname(f.path) === dirname(doc.path || ''));
    if (!html) { notRunnable('CSS files are shown through an HTML page. Add an HTML file in the same folder that links to this stylesheet, then press F5.'); return; }
    const open = SC.tabs.docs().find((d) => d.path === html.path);
    SC.panel.previewHtml(open ? open.editor.value : html.node.content, html.path);
  }

  function notRunnable(message) {
    SC.panel.show('output');
    SC.panel.clear();
    SC.panel.log(message, 'warn');
  }

  /* ---------- Entry points ---------- */
  async function run(doc = SC.tabs.activeDoc()) {
    if (!doc) { SC.notify('Open a file to run it.', 'info'); return; }
    const lang = doc.langId;
    const name = doc.path || doc.title;
    const code = doc.editor.value;
    if (lang === 'html') { SC.panel.previewHtml(code, doc.path); return; }
    if (lang === 'markdown') { previewMarkdown(code, name); return; }
    if (lang === 'css') { previewCss(doc); return; }
    if (lang === 'json') { checkJson(code, name, doc); return; }
    // An extension can take the run (for example C files that use raylib)
    const routed = routeRun(lang, code);
    if (routed && routed.error) {
      SC.panel.show('output');
      SC.panel.clear();
      SC.panel.log('[Error] ' + name, 'system');
      SC.panel.log(routed.error, 'error');
      return;
    }
    if (routed) {
      const input = await askInput(lang, code, name);
      if (input == null) return;
      return runSource({ lang: routed.lang, code, name, stdin: input, extra: routed.extra });
    }
    const local = RUNTIMES[lang];
    const remote = COMPILED[lang];
    if (!local && !remote) {
      notRunnable((SC.languages.byId[lang] || { name: 'These' }).name + ' files can\'t run here. F5 runs JavaScript, TypeScript, Python, Lua, SQL, Ruby, C, C++, Rust, Go, Java and C# files, previews HTML and Markdown, and checks JSON.');
      return;
    }
    const stdin = await askInput(lang, code, name);
    if (stdin == null) return;
    return runSource({ lang, code, name, stdin });
  }

  /** If the code reads input, ask for it first. Resolves to the text ('' if none needed) or null if cancelled. */
  async function askInput(lang, code, name) {
    if (!READS_INPUT[lang] || !READS_INPUT[lang].test(code)) return '';
    const stdin = await SC.dialog.promptText({
      title: 'Input for ' + basename(name),
      message: 'This program reads input. Type everything it should read, one answer per line. It is all sent to the program when it starts.',
      value: lastInput.get(name) || '',
      okLabel: 'Run',
    });
    if (stdin != null) lastInput.set(name, stdin);
    return stdin;
  }

  /**
   * Run code in any supported language. Output goes to `sink` (the Output tab by default).
   * Resolves when the program ends: { ok, message, status }.
   */
  function runSource({ lang, code, name, stdin = '', sink = panelSink, extra, compileOnly = false }) {
    const local = RUNTIMES[lang];
    const remote = COMPILED[lang];
    if (!local && !remote) return Promise.resolve({ ok: false, message: 'Unsupported language: ' + lang });
    stop({ quiet: true });
    const r = startRun(name, sink);
    r.stdin = stdin;
    r.compileOnly = compileOnly;
    if (local) runLocal(r, lang, code, stdin, compileOnly ? Object.assign({}, extra, { compileOnly: true }) : extra);
    else runRemote(r, remote, code, stdin);
    return r.promise;
  }

  /** Stop the running program. Its runtime is thrown away and reloads next time. */
  function stop({ quiet = false } = {}) {
    const r = current;
    if (!r) { if (!quiet) SC.statusbar.message('Nothing is running', 1500); return; }
    if (r.waiting) { // an app window is open: close it and keep Python loaded
      send(r, { appEvent: { type: 'close' } });
      r.finish('[Done] app closed after ' + fmtTime(performance.now() - r.started));
      return;
    }
    if (r.controller) r.controller.abort();
    if (r.frame) killFrame(r.frame.engine);
    r.finish('[Stopped] after ' + fmtTime(performance.now() - r.started), 'warn');
  }

  function init() { window.addEventListener('message', onMessage); }

  SC.runner = {
    init, run, runSource, askInput, stop, on, off, send, addPythonProvider, addRuntime, addRouter, routeRun,
    isRunning: () => !!current, current: () => current, fmtTime,
    pickCompiler, prepareJava, findJsonError, RUNTIMES, COMPILED, READS_INPUT,
  };
})(window.SC);
