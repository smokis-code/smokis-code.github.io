/* ==========================================================================
   extensions/terminal.js — a terminal in the bottom panel with two
   profiles: PowerShell and MSYS2 (bash, MINGW64). It works on your
   workspace files and runs programs with the same runtimes as F5.

   This is an emulation that runs in the browser: the commands below are
   implemented here, there is no real Windows or MSYS2 underneath.
   Compilers (gcc, g++, rustc, go, javac, csc) build on godbolt.org and
   leave a small "program" file (for example hello.exe) that you can run
   with ./hello.exe.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const PROFILES = {
    powershell: { label: 'PowerShell' },
    msys: { label: 'MSYS2 MINGW64' },
  };
  const LANG_BY_EXT = { py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', lua: 'lua', rb: 'ruby', sql: 'sql', c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', rs: 'rust', go: 'go', java: 'java', cs: 'csharp' };

  let pane;
  let screen;     // scrolling area
  let outEl;      // printed lines
  let inputLine;  // prompt + input
  let promptEl;
  let input;
  let profileSelect;
  let profile = SC.storage.get('terminal.profile', 'powershell');
  let cwd = '';
  let busy = false;
  let mode = 'shell'; // or 'python' (the Python prompt)
  let pyMore = false;
  let openLine = null;
  let history = SC.storage.get('terminal.history', []);
  let histIndex = -1;
  let draft = '';

  const isPS = () => profile === 'powershell';

  /* ---------- Screen output ---------- */
  function write(text, kind = '') {
    const parts = String(text).split('\n');
    parts.forEach((part, i) => {
      if (part) {
        if (!openLine) { openLine = el('div'); outEl.append(openLine); }
        openLine.append(kind ? el('span', { class: 't-' + kind, text: part }) : document.createTextNode(part));
      }
      if (i < parts.length - 1) {
        if (!openLine) outEl.append(el('div'));
        openLine = null;
      }
    });
    while (outEl.childNodes.length > 5000) outEl.firstChild.remove();
    scrollDown();
  }
  const writeln = (text = '', kind = '') => write(text + '\n', kind);
  function scrollDown() { screen.scrollTop = screen.scrollHeight; }
  function clearScreen() { outEl.textContent = ''; openLine = null; }

  /** Output sink for SC.runner: programs print straight into the terminal. */
  const sink = {
    write,
    log: (text, kind) => { if (openLine) write('\n'); writeln(text, kind); },
    isLineOpen: () => !!openLine,
    finish(message, kind) {
      // Show only what a real terminal would: stops, exit codes and build errors.
      if (!message || /^\[(Done\]|Failed\])/.test(message)) return;
      writeln(message.replace(/^\[[^\]]+\] /, ''), kind === 'system' ? 'info' : kind);
    },
  };

  /* ---------- Prompt ---------- */
  function displayPath(p) {
    if (isPS()) return 'C:\\workspace' + (p ? '\\' + p.split('/').join('\\') : '');
    return '/c/workspace' + (p ? '/' + p : '');
  }

  function renderPrompt() {
    promptEl.textContent = '';
    if (mode === 'python') { promptEl.append(el('span', { text: pyMore ? '... ' : '>>> ' })); return; }
    if (isPS()) { promptEl.append(el('span', { text: 'PS ' + displayPath(cwd) + '> ' })); return; }
    promptEl.append(
      el('span', { class: 't-user', text: 'smoki@SMOKI-PC' }), ' ',
      el('span', { class: 't-host', text: 'MINGW64' }), ' ',
      el('span', { class: 't-path', text: '~' + (cwd ? '/' + cwd : '') }),
      el('br'), el('span', { text: '$ ' }));
  }

  function showPrompt() {
    busy = false;
    if (openLine) write('\n');
    renderPrompt();
    inputLine.hidden = false;
    input.value = '';
    scrollDown();
    if (pane && !pane.hidden) input.focus();
  }

  function echoCommand(line) {
    const copy = el('div', { class: 't-echo' });
    copy.append(...Array.from(promptEl.childNodes).map((n) => n.cloneNode(true)), document.createTextNode(line));
    outEl.append(copy);
    openLine = null;
  }

  function banner() {
    clearScreen();
    if (isPS()) {
      writeln('PowerShell profile (Smoki\'s Code terminal, runs in your browser)', 'info');
      writeln('Your workspace is C:\\workspace. Type help to see the commands.', 'info');
    } else {
      writeln('MSYS2 MINGW64 profile (Smoki\'s Code terminal, runs in your browser)', 'info');
      writeln('Your workspace is ~ (/c/workspace). gcc, g++, rustc and go build on godbolt.org. Type help for commands.', 'info');
    }
    writeln('');
  }

  /* ---------- Paths ---------- */
  /** Turn what the user typed into a workspace path ('' is the workspace root). */
  function resolve(arg) {
    let a = String(arg == null ? '' : arg).replace(/\\/g, '/');
    let base = cwd;
    const lower = a.toLowerCase();
    for (const prefix of ['c:/workspace', '/c/workspace', 'c:', '~']) {
      if (lower === prefix || lower.startsWith(prefix + '/')) { a = a.slice(prefix.length); base = ''; break; }
    }
    if (a.startsWith('/')) base = '';
    const parts = base ? base.split('/') : [];
    for (const seg of a.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop(); else parts.push(seg);
    }
    return parts.join('/');
  }

  const nameOf = (p) => p.split('/').pop();
  const extOf = (p) => (/\.([^./]+)$/.exec(p) || [])[1] || '';
  const stem = (p) => nameOf(p).replace(/\.[^.]+$/, '');

  /** Expand * and ? in the last part of a path. */
  function glob(arg) {
    if (!/[*?]/.test(arg)) return [arg];
    const full = resolve(arg);
    const dir = full.split('/').slice(0, -1).join('/');
    const pattern = new RegExp('^' + nameOf(full).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    const prefix = arg.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const matches = SC.fs.list(dir).filter((n) => pattern.test(n.name)).map((n) => (prefix ? prefix + '/' : '') + n.name);
    return matches.length ? matches : [arg];
  }

  /* ---------- Parsing ---------- */
  /** Split a line into words and operators (; && | > >> <), keeping quoted text together. */
  function tokenize(line) {
    const out = [];
    let cur = null;
    let quote = null;
    let quoted = false; // quoted words are not expanded (*.c stays *.c)
    const push = () => { if (cur !== null) out.push({ word: cur, quoted }); cur = null; quoted = false; };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null; else cur += c;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur = cur || ''; quoted = true; continue; }
      if (/\s/.test(c)) { push(); continue; }
      const two = line.slice(i, i + 2);
      if (two === '&&' || two === '>>' || two === '||') { push(); out.push({ op: two }); i++; continue; }
      if (c === ';' || c === '|' || c === '>' || c === '<') { push(); out.push({ op: c }); continue; }
      cur = (cur || '') + c;
    }
    if (quote) return { error: 'The quote ' + quote + ' is never closed.' };
    push();
    return { tokens: out };
  }

  /** Commands joined with ; and && */
  function parse(line) {
    const t = tokenize(line);
    if (t.error) return t;
    const steps = [];
    let cmd = { args: [], join: ';' };
    for (const tok of t.tokens) {
      if (tok.op === ';' || tok.op === '&&' || tok.op === '||') { steps.push(cmd); cmd = { args: [], join: tok.op }; continue; }
      if (tok.op === '|') return { error: 'Pipes (|) are not supported in this terminal yet.' };
      if (tok.op) { cmd.pending = tok.op; continue; }
      if (cmd.pending === '>' || cmd.pending === '>>') { cmd.outFile = tok.word; cmd.append = cmd.pending === '>>'; cmd.pending = null; continue; }
      if (cmd.pending === '<') { cmd.inFile = tok.word; cmd.pending = null; continue; }
      cmd.args.push(tok.word);
      (cmd.quoted = cmd.quoted || []).push(tok.quoted);
    }
    steps.push(cmd);
    return { steps: steps.filter((s) => s.args.length) };
  }

  /* ---------- Running a line ---------- */
  async function submit(line) {
    echoCommand(line);
    if (mode === 'python') { await pythonLine(line); return; }
    if (line.trim()) {
      history = history.filter((h) => h !== line).concat(line).slice(-200);
      SC.storage.set('terminal.history', history);
    }
    histIndex = -1;
    const parsed = parse(line);
    if (parsed.error) { writeln(parsed.error, 'error'); showPrompt(); return; }
    busy = true;
    inputLine.hidden = true;
    let ok = true;
    for (const step of parsed.steps) {
      if (step.join === '&&' && !ok) break;
      if (step.join === '||' && ok) break;
      try {
        ok = await runCommand(step);
      } catch (err) {
        writeln(String(err.message || err), 'error');
        ok = false;
      }
      if (mode === 'python') return; // python started its prompt
    }
    showPrompt();
  }

  /** Errors look like the real shells: PowerShell names the command, bash prefixes "bash:". */
  function fail(cmd, message) {
    writeln(isPS() ? cmd + ': ' + message : cmd + ': ' + message, 'error');
    return false;
  }

  async function runCommand(step) {
    const name = step.args[0];
    const lower = name.toLowerCase();
    const args = [];
    step.args.slice(1).forEach((a, i) => args.push(...(a.startsWith('-') || (step.quoted || [])[i + 1] ? [a] : glob(a))));
    // Output can be redirected to a file with > or >>
    let captured = null;
    const io = {
      out: (text) => { if (captured !== null) captured += text; else write(text); },
      write: (text, kind) => { if (captured !== null) captured += text; else write(text, kind); },
      stdin: step.inFile ? readText(step.inFile) : null,
    };
    if (step.outFile) captured = '';
    let ok;
    const fn = COMMANDS[lower];
    if (fn) ok = await fn(args, io, name);
    else if (/^(\.{1,2}[\\/]|\/|~)/.test(name) || /\.(exe|class)$/i.test(name)) ok = await runProgram(name, args);
    else {
      ok = false;
      if (isPS()) writeln(name + ' : The term \'' + name + '\' is not recognized as a name of a cmdlet, function, script file, or program. Type help to see the commands.', 'error');
      else writeln('bash: ' + name + ': command not found', 'error');
    }
    if (step.outFile && captured !== null) {
      const path = resolve(step.outFile);
      try {
        const before = step.append && SC.fs.isFile(path) ? SC.fs.readFile(path) : '';
        SC.fs.createFile(path, before + captured, { overwrite: true });
      } catch (err) { return fail(name, err.message); }
    }
    return ok !== false;
  }

  function readText(arg) {
    const p = resolve(arg);
    return SC.fs.isFile(p) ? SC.fs.readFile(p) : null;
  }

  /* ---------- Running programs ---------- */
  /** Run code with SC.runner, printing into the terminal. Resolves to true when it succeeded. */
  async function runCode(lang, code, name, opts = {}) {
    let stdin = opts.stdin;
    if (stdin == null) {
      stdin = await SC.runner.askInput(lang, code, name);
      if (stdin == null) { writeln('Cancelled.', 'info'); return false; }
    }
    const res = await SC.runner.runSource(Object.assign({ lang, code, name, stdin, sink }, opts));
    return res.ok;
  }

  async function runFile(arg, langOverride, cmd) {
    if (!arg) return fail(cmd, 'Give the name of a file to run.');
    const path = resolve(arg);
    if (!SC.fs.isFile(path)) return fail(cmd, isPS() ? 'Cannot find path \'' + displayPath(path) + '\' because it does not exist.' : arg + ': No such file or directory');
    const lang = langOverride || LANG_BY_EXT[extOf(path).toLowerCase()];
    if (!lang) return fail(cmd, 'This file type can\'t be run.');
    return runCode(lang, openText(path), path);
  }

  /** The editor's text if the file is open (unsaved changes included), else the saved file. */
  function openText(path) {
    const doc = SC.tabs.docs().find((d) => d.path === path);
    return doc ? doc.editor.value : SC.fs.readFile(path);
  }

  /** Build with a compiler on godbolt.org and leave a program file next to the source. */
  async function build(cmd, lang, args, defaultOut) {
    const src = args.find((a) => !a.startsWith('-') && LANG_BY_EXT[extOf(a).toLowerCase()]);
    if (!src) return fail(cmd, isPS() ? 'no input files' : 'fatal error: no input files');
    const path = resolve(src);
    if (!SC.fs.isFile(path)) return fail(cmd, src + ': No such file or directory');
    const oi = args.indexOf('-o');
    let outName = oi !== -1 && args[oi + 1] ? args[oi + 1] : defaultOut(path);
    if (lang !== 'java' && !/\.exe$/i.test(outName)) outName += '.exe';
    const code = openText(path);
    const ok = await runCode(lang, code, path, { stdin: '', compileOnly: true });
    if (!ok) return false;
    const outPath = resolve(outName);
    const program = { smokiProgram: 1, lang, source: path, code, note: 'Made by Smoki\'s Code. Run it in the terminal with ./' + nameOf(outPath) };
    SC.fs.createFile(outPath, JSON.stringify(program, null, 2) + '\n', { overwrite: true });
    if (cmd === 'javac') return true;
    writeln('Built ' + nameOf(outPath) + '. Run it with ' + (isPS() ? '.\\' : './') + nameOf(outPath), 'info');
    return true;
  }

  async function runProgram(name, args) {
    let path = resolve(name.replace(/^\.[\\/]/, ''));
    if (!SC.fs.isFile(path) && SC.fs.isFile(path + '.exe')) path += '.exe';
    if (!SC.fs.isFile(path)) {
      if (isPS()) writeln(name + ' : The term \'' + name + '\' is not recognized as a name of a cmdlet, function, script file, or program.', 'error');
      else writeln('bash: ' + name + ': No such file or directory', 'error');
      return false;
    }
    const lang = LANG_BY_EXT[extOf(path).toLowerCase()];
    if (lang && !/\.(exe|class)$/i.test(path)) return runCode(lang, openText(path), path);
    let program;
    try { program = JSON.parse(SC.fs.readFile(path)); } catch (err) { program = null; }
    if (!program || !program.smokiProgram) {
      writeln(isPS() ? 'Program \'' + nameOf(path) + '\' failed to run: it is not a program built in this terminal.' : 'bash: ' + name + ': cannot execute binary file', 'error');
      return false;
    }
    return runCode(program.lang, program.code, program.source);
  }

  /* ---------- Python prompt ---------- */
  async function startPython() {
    mode = 'python';
    pyMore = false;
    writeln('Python 3.12 (Pyodide, in your browser). Type exit() to leave.', 'info');
    const res = await SC.runner.runSource({ lang: 'python', code: 'pass', name: '<stdin>', sink, extra: { repl: true } });
    if (!res.ok) { mode = 'shell'; }
    showPrompt();
  }

  async function pythonLine(line) {
    busy = true;
    inputLine.hidden = true;
    const res = await SC.runner.runSource({ lang: 'python', code: line, name: '<stdin>', sink, extra: { repl: true } });
    if (res.status === 'exit' || !res.ok) { mode = 'shell'; pyMore = false; }
    else pyMore = res.status === 'more';
    showPrompt();
  }

  /* ---------- Commands ---------- */
  function ls(args, io) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const targets = args.filter((a) => !a.startsWith('-'));
    const showAll = /a|force/i.test(flags);
    const long = isPS() || /l/.test(flags.replace(/-all/i, ''));
    const path = resolve(targets[0] || '.');
    const node = SC.fs.get(path);
    if (!node) return fail(isPS() ? 'Get-ChildItem' : 'ls', isPS() ? 'Cannot find path \'' + displayPath(path) + '\' because it does not exist.' : 'cannot access \'' + targets[0] + '\': No such file or directory');
    const items = node.type === 'file' ? [node] : SC.fs.list(path).filter((n) => showAll || !n.name.startsWith('.'));
    const date = (n) => {
      const d = new Date(n.mtime || Date.now());
      return isPS() ? d.toLocaleDateString('en-GB') + '  ' + d.toTimeString().slice(0, 5) : d.toDateString().slice(4, 10) + ' ' + d.toTimeString().slice(0, 5);
    };
    const size = (n) => (n.type === 'file' ? n.content.length : 0);
    if (isPS()) {
      if (!items.length) return true;
      io.out('\n    Directory: ' + displayPath(node.type === 'file' ? path.split('/').slice(0, -1).join('/') : path) + '\n\n');
      io.out('Mode                 LastWriteTime         Length Name\n');
      io.out('----                 -------------         ------ ----\n');
      for (const n of items) {
        io.out((n.type === 'folder' ? 'd----' : '-a---') + '          ' + date(n).padEnd(18) + String(n.type === 'file' ? size(n) : '').padStart(11) + ' ');
        io.write(n.name + '\n', n.type === 'folder' ? 'dir' : '');
      }
      io.out('\n');
      return true;
    }
    if (long) {
      io.out('total ' + items.length + '\n');
      for (const n of items) {
        io.out((n.type === 'folder' ? 'drwxr-xr-x' : '-rw-r--r--') + ' 1 smoki 197609 ' + String(size(n)).padStart(6) + ' ' + date(n) + ' ');
        io.write(n.name + '\n', n.type === 'folder' ? 'dir' : /\.exe$/i.test(n.name) ? 'exe' : '');
      }
      return true;
    }
    items.forEach((n, i) => io.write(n.name + (i < items.length - 1 ? '  ' : '\n'), n.type === 'folder' ? 'dir' : /\.exe$/i.test(n.name) ? 'exe' : ''));
    return true;
  }

  function cd(args) {
    const target = args.find((a) => !a.startsWith('-'));
    if (!target || target === '~') { cwd = ''; return true; }
    const path = resolve(target);
    if (!SC.fs.isFolder(path) && path !== '') {
      return fail(isPS() ? 'Set-Location' : 'bash: cd', isPS() ? 'Cannot find path \'' + displayPath(path) + '\' because it does not exist.' : target + ': No such file or directory');
    }
    cwd = path;
    return true;
  }

  function cat(args, io, cmd) {
    const files = args.filter((a) => !a.startsWith('-'));
    if (!files.length && io.stdin != null) { io.out(io.stdin); return true; }
    if (!files.length) return fail(cmd, 'Give the name of a file to show.');
    let ok = true;
    const number = args.includes('-n');
    for (const f of files) {
      const p = resolve(f);
      if (SC.fs.isFolder(p)) { ok = fail(cmd, isPS() ? 'Cannot read \'' + displayPath(p) + '\' because it is a folder.' : f + ': Is a directory'); continue; }
      if (!SC.fs.isFile(p)) { ok = fail(cmd, isPS() ? 'Cannot find path \'' + displayPath(p) + '\' because it does not exist.' : f + ': No such file or directory'); continue; }
      let text = SC.fs.readFile(p);
      if (number) text = text.split('\n').map((l, i) => String(i + 1).padStart(6) + '  ' + l).join('\n');
      io.out(text.endsWith('\n') || !text ? text : text + '\n');
    }
    return ok;
  }

  function echo(args, io) {
    let noNewline = false;
    const words = [];
    for (const a of args) {
      if (!isPS() && a === '-n') noNewline = true;
      else if (/^-(ForegroundColor|BackgroundColor|NoNewline)$/i.test(a)) { if (/nonewline/i.test(a)) noNewline = true; }
      else words.push(a);
    }
    io.out(words.join(' ') + (noNewline ? '' : '\n'));
    return true;
  }

  function newItem(args, io) {
    const opts = {};
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const m = /^-(\w+)$/.exec(args[i]);
      if (m && !/^force$/i.test(m[1])) opts[m[1].toLowerCase()] = args[++i];
      else if (!m) pos.push(args[i]);
    }
    const type = (opts.itemtype || opts.type || 'file').toLowerCase();
    let p = opts.path || pos[0] || '';
    if (opts.name) p = (p ? p + '/' : '') + opts.name;
    if (!p) return fail('New-Item', 'Give a -Path or -Name.');
    const path = resolve(p);
    if (SC.fs.exists(path)) return fail('New-Item', 'An item with the specified name ' + displayPath(path) + ' already exists.');
    if (type.startsWith('dir')) SC.fs.createFolder(path); else SC.fs.createFile(path, opts.value || '');
    return ls([path], io);
  }

  function mkdir(args, io, cmd) {
    const parents = isPS() || args.includes('-p');
    const dirs = args.filter((a) => !a.startsWith('-'));
    if (!dirs.length) return fail(cmd, 'missing operand');
    let ok = true;
    for (const d of dirs) {
      const p = resolve(d);
      if (SC.fs.exists(p)) { if (!parents || !SC.fs.isFolder(p)) ok = fail(cmd, isPS() ? 'An item with the specified name ' + displayPath(p) + ' already exists.' : 'cannot create directory \'' + d + '\': File exists'); continue; }
      if (!parents && p.includes('/') && !SC.fs.isFolder(p.split('/').slice(0, -1).join('/'))) { ok = fail(cmd, 'cannot create directory \'' + d + '\': No such file or directory'); continue; }
      SC.fs.createFolder(p);
      if (isPS()) ls([p], io);
    }
    return ok;
  }

  function rm(args, io, cmd) {
    const flags = args.filter((a) => a.startsWith('-')).join(' ');
    const recurse = /-r\b|-rf\b|-fr\b|-recurse|-R\b/i.test(flags) || cmd === 'rmdir' || cmd === 'rd';
    const force = /f|force/i.test(flags);
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return fail(cmd, 'missing operand');
    let ok = true;
    for (const t of targets) {
      const p = resolve(t);
      if (!p) { ok = fail(cmd, 'Refusing to delete the whole workspace. Use File > Reset Workspace instead.'); continue; }
      if (!SC.fs.exists(p)) { if (!force) ok = fail(cmd, isPS() ? 'Cannot find path \'' + displayPath(p) + '\' because it does not exist.' : 'cannot remove \'' + t + '\': No such file or directory'); continue; }
      if (SC.fs.isFolder(p) && SC.fs.list(p).length && !recurse) {
        ok = fail(cmd, isPS() ? 'The item at ' + displayPath(p) + ' has children. Add -Recurse to delete it with everything inside.' : 'cannot remove \'' + t + '\': Is a directory');
        continue;
      }
      SC.fs.remove(p);
    }
    return ok;
  }

  function cpmv(args, io, cmd, move) {
    const targets = args.filter((a) => !a.startsWith('-'));
    const recurse = move || /-r|-recurse/i.test(args.filter((a) => a.startsWith('-')).join(' '));
    if (targets.length < 2) return fail(cmd, 'missing destination file operand');
    const dest = resolve(targets.pop());
    const intoFolder = SC.fs.isFolder(dest);
    let ok = true;
    for (const t of targets) {
      const src = resolve(t);
      if (!SC.fs.exists(src)) { ok = fail(cmd, isPS() ? 'Cannot find path \'' + displayPath(src) + '\' because it does not exist.' : 'cannot stat \'' + t + '\': No such file or directory'); continue; }
      if (SC.fs.isFolder(src) && !recurse) { ok = fail(cmd, isPS() ? 'Add -Recurse to copy a folder.' : '-r not specified; omitting directory \'' + t + '\''); continue; }
      const to = intoFolder ? (dest ? dest + '/' : '') + nameOf(src) : dest;
      try {
        if (SC.fs.exists(to) && SC.fs.isFile(to)) SC.fs.remove(to);
        if (move) SC.fs.rename(src, to); else SC.fs.copy(src, to);
      } catch (err) { ok = fail(cmd, err.message); }
    }
    return ok;
  }

  /** ren old new: the new name stays in the same folder. */
  function rename(args, io, cmd) {
    const [from, to] = args.filter((a) => !a.startsWith('-'));
    if (!from || !to) return fail(cmd, 'Give the current name and the new name.');
    const src = resolve(from);
    if (!SC.fs.exists(src)) return fail(cmd, isPS() ? 'Cannot rename because item at \'' + displayPath(src) + '\' does not exist.' : from + ': No such file or directory');
    const dest = src.split('/').slice(0, -1).concat(nameOf(to.replace(/\\/g, '/'))).join('/');
    try { SC.fs.rename(src, dest); } catch (err) { return fail(cmd, err.message); }
    return true;
  }

  function headTail(args, io, cmd, tail) {
    let n = 10;
    const files = [];
    for (let i = 0; i < args.length; i++) {
      if (/^-(n|TotalCount|Tail|First|Last)$/i.test(args[i])) n = Number(args[++i]) || n;
      else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1));
      else files.push(args[i]);
    }
    const text = files.length ? readText(files[0]) : io.stdin;
    if (text == null) return fail(cmd, (files[0] || 'input') + ': No such file or directory');
    const lines = text.replace(/\n$/, '').split('\n');
    io.out((tail ? lines.slice(-n) : lines.slice(0, n)).join('\n') + '\n');
    return true;
  }

  function wc(args, io) {
    const files = args.filter((a) => !a.startsWith('-'));
    const flags = args.filter((a) => a.startsWith('-')).join('');
    for (const f of files) {
      const text = readText(f);
      if (text == null) return fail('wc', f + ': No such file or directory');
      const counts = { l: (text.match(/\n/g) || []).length, w: (text.match(/\S+/g) || []).length, c: text.length };
      const cols = flags ? ['l', 'w', 'c'].filter((k) => flags.includes(k)) : ['l', 'w', 'c'];
      io.out(cols.map((k) => String(counts[k]).padStart(7)).join(' ') + ' ' + f + '\n');
    }
    return true;
  }

  function grep(args, io, cmd) {
    const flags = args.filter((a) => /^-[a-zA-Z]+$/.test(a) && !/^-(Pattern|Path)$/i.test(a)).join('');
    const rest = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));
    const pattern = rest.shift();
    if (pattern == null) return fail(cmd, 'Give a pattern to search for.');
    let re;
    try { re = new RegExp(pattern, /i/.test(flags) || isPS() ? 'i' : ''); } catch (err) { return fail(cmd, 'Invalid pattern: ' + err.message); }
    const showNum = /n/.test(flags) || isPS();
    let files = rest.length ? rest : [];
    if (/r/i.test(flags) || (!files.length && io.stdin == null)) {
      const base = resolve(files[0] || '.');
      files = SC.fs.allFiles(base).map((f) => f.path);
    } else files = files.map(resolve);
    let found = false;
    for (const p of files) {
      if (!SC.fs.isFile(p)) continue;
      SC.fs.readFile(p).split('\n').forEach((line, i) => {
        if (!re.test(line)) return;
        found = true;
        io.write(p, 'path');
        io.out(':' + (showNum ? (i + 1) + ':' : '') + line + '\n');
      });
    }
    return found;
  }

  function find(args, io) {
    let start = '.';
    let name = null;
    let type = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-name' || args[i] === '-iname') name = args[++i];
      else if (args[i] === '-type') type = args[++i];
      else if (!args[i].startsWith('-')) start = args[i];
    }
    const base = resolve(start);
    const re = name ? new RegExp('^' + name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
    const shown = (p) => (start === '.' ? './' : start.replace(/\/$/, '') + '/') + p.slice(base ? base.length + 1 : 0);
    const items = [];
    (function walk(dir) {
      for (const n of SC.fs.list(dir)) {
        const p = (dir ? dir + '/' : '') + n.name;
        items.push({ p, n });
        if (n.type === 'folder') walk(p);
      }
    })(base);
    for (const { p, n } of items) {
      if (type === 'f' && n.type !== 'file') continue;
      if (type === 'd' && n.type !== 'folder') continue;
      if (re && !re.test(n.name)) continue;
      io.out(shown(p) + '\n');
    }
    return true;
  }

  function help(args, io) {
    const shared = [
      ['cd, pwd, ls / dir', 'move around and list files'],
      ['cat / type, head, tail, wc, grep, find', 'read and search files'],
      ['echo text > file, touch, mkdir, rm, cp, mv', 'create, change and delete files'],
      ['code <file>', 'open a file in the editor'],
      ['python [file | -c code]', 'run Python (no file: the Python prompt)'],
      ['pip install / list / uninstall', 'Python packages (pip extension)'],
      ['node, lua, ruby, sqlite3, ts-node <file>', 'run other languages'],
      ['gcc / g++ <file> -o app, ./app.exe', 'build C/C++ on godbolt.org and run it'],
      ['rustc, go run / go build, javac + java, csc, dotnet run', 'other compilers on godbolt.org'],
      ['clear / cls, history, exit', 'terminal'],
    ];
    const ps = [['Get-ChildItem, Set-Location, Get-Content, Set-Content', 'PowerShell names work too'], ['New-Item, Remove-Item, Copy-Item, Move-Item, Rename-Item', ''], ['Write-Output, Select-String, Test-Path, Get-Date', '']];
    io.out('Commands (an emulation running in your browser):\n\n');
    for (const [c, d] of shared.concat(isPS() ? ps : [])) io.write('  ' + c.padEnd(56), 'cmd'), io.out((d || '') + '\n');
    io.out('\nUse ; or && to run several commands, > and >> to save output to a file.\nUp and Down go through history, Tab completes file names, Ctrl+C stops a program.\n');
    return true;
  }

  async function python(args, io, cmd) {
    if (!args.length) { await startPython(); return true; }
    if (args[0] === '--version' || args[0] === '-V') { io.out('Python 3.12.1\n'); return true; }
    if (args[0] === '-c') return runCode('python', args[1] || '', '<string>');
    if (args[0] === '-m' && /^pip3?$/.test(args[1])) return pip(args.slice(2), io, 'pip');
    if (args[0] === '-m') return fail(cmd, 'Running modules with -m is not supported here (only -m pip).');
    return runFile(args[0], 'python', cmd);
  }

  async function pip(args, io, cmd) {
    if (!SC.pip) return fail(cmd, isPS() ? 'pip comes from the "pip" extension, which is turned off. Turn it on in the Extensions view.' : 'command not found (turn on the "pip" extension in the Extensions view)');
    return SC.pip.command(args, sink);
  }

  function setContent(args, io, cmd, append) {
    const opts = {};
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const m = /^-(\w+)$/.exec(args[i]);
      if (m) opts[m[1].toLowerCase()] = args[++i]; else pos.push(args[i]);
    }
    const p = resolve(opts.path || pos[0] || '');
    if (!p) return fail(cmd, 'Give a -Path.');
    const value = (opts.value != null ? opts.value : pos.slice(1).join(' ')) + '\n';
    const before = append && SC.fs.isFile(p) ? SC.fs.readFile(p) : '';
    SC.fs.createFile(p, before + value, { overwrite: true });
    return true;
  }

  function code(args, io, cmd) {
    const target = args.find((a) => !a.startsWith('-'));
    if (!target || target === '.') { SC.app.showView('explorer'); return true; }
    const p = resolve(target);
    if (SC.fs.isFolder(p)) { SC.explorer.reveal(p, { expand: true }); return true; }
    if (!SC.fs.exists(p)) SC.fs.createFile(p, '');
    SC.tabs.open(p);
    return true;
  }

  const COMMANDS = {
    // Moving around and listing
    ls, dir: ls, 'get-childitem': ls, gci: ls,
    cd, chdir: cd, 'set-location': cd, sl: cd,
    pwd: (a, io) => { io.out(isPS() ? '\nPath\n----\n' + displayPath(cwd) + '\n\n' : displayPath(cwd) + '\n'); return true; },
    'get-location': (a, io) => COMMANDS.pwd(a, io),
    // Reading files
    cat, type: cat, 'get-content': cat, gc: cat,
    head: (a, io, c) => headTail(a, io, c, false), tail: (a, io, c) => headTail(a, io, c, true),
    wc, grep, 'select-string': grep, sls: grep, findstr: grep, find,
    // Changing files
    echo, 'write-output': echo, 'write-host': echo, write: echo, printf: (a, io) => { io.out((a[0] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t')); return true; },
    touch: (a) => { for (const f of a.filter((x) => !x.startsWith('-'))) { const p = resolve(f); if (!SC.fs.exists(p)) SC.fs.createFile(p, ''); } return true; },
    'new-item': newItem, ni: newItem,
    mkdir, md: mkdir,
    rm, del: rm, erase: rm, rmdir: rm, rd: rm, 'remove-item': rm, ri: rm,
    cp: (a, io, c) => cpmv(a, io, c, false), copy: (a, io, c) => cpmv(a, io, c, false), 'copy-item': (a, io, c) => cpmv(a, io, c, false), cpi: (a, io, c) => cpmv(a, io, c, false),
    mv: (a, io, c) => cpmv(a, io, c, true), move: (a, io, c) => cpmv(a, io, c, true), 'move-item': (a, io, c) => cpmv(a, io, c, true), mi: (a, io, c) => cpmv(a, io, c, true),
    ren: rename, 'rename-item': rename, rni: rename,
    'set-content': (a, io, c) => setContent(a, io, c, false), 'add-content': (a, io, c) => setContent(a, io, c, true),
    'test-path': (a, io) => { io.out(SC.fs.exists(resolve(a.find((x) => !x.startsWith('-')) || '')) ? 'True\n' : 'False\n'); return true; },
    code, open: code, start: code, 'invoke-item': code, notepad: code,
    // Terminal
    clear: () => { clearScreen(); return true; }, cls: () => { clearScreen(); return true; }, 'clear-host': () => { clearScreen(); return true; },
    history: (a, io) => { history.forEach((h, i) => io.out(String(i + 1).padStart(4) + '  ' + h + '\n')); return true; },
    'get-history': (a, io) => COMMANDS.history(a, io), h: (a, io) => COMMANDS.history(a, io),
    help, 'get-help': help, 'get-command': help, man: help,
    exit: () => { newTerminal(); return true; },
    whoami: (a, io) => { io.out(isPS() ? 'smoki-pc\\smoki\n' : 'smoki\n'); return true; },
    hostname: (a, io) => { io.out('SMOKI-PC\n'); return true; },
    date: (a, io) => { io.out(new Date().toString() + '\n'); return true; },
    'get-date': (a, io) => { io.out('\n' + new Date().toLocaleString() + '\n\n'); return true; },
    uname: (a, io) => { io.out(a.includes('-a') ? 'MINGW64_NT-10.0 SMOKI-PC 3.5.4 x86_64 Msys (Smoki\'s Code emulation)\n' : 'MINGW64_NT-10.0\n'); return true; },
    which: (a, io) => { let ok = true; for (const c of a) { if (COMMANDS[c.toLowerCase()]) io.out('/usr/bin/' + c + '\n'); else { ok = fail('which', 'no ' + c + ' in (/mingw64/bin:/usr/bin)'); } } return ok; },
    '$psversiontable': (a, io) => { io.out('\nName                           Value\n----                           -----\nPSVersion                      5.1 (Smoki\'s Code emulation)\nPSEdition                      Desktop\n\n'); return true; },
    pacman: (a, io) => { io.out('pacman can\'t install packages here. gcc, g++, rustc, go, python, node, lua, ruby and sqlite3 are already available. For Python packages use pip.\n'); return true; },
    'winget': (a, io) => COMMANDS.pacman(a, io), 'apt': (a, io) => COMMANDS.pacman(a, io),
    // Languages
    python, python3: python, py: python,
    pip, pip3: pip,
    node: (a, io, c) => { if (a[0] === '-v' || a[0] === '--version') { io.out('JavaScript runs in your browser (no Node.js modules such as fs).\n'); return true; } if (a[0] === '-e') return runCode('javascript', a[1] || '', '<eval>'); return runFile(a[0], 'javascript', c); },
    'ts-node': (a, io, c) => runFile(a[0], 'typescript', c), tsx: (a, io, c) => runFile(a[0], 'typescript', c),
    npx: (a, io, c) => (/^(ts-node|tsx)$/.test(a[0]) ? runFile(a[1], 'typescript', c) : fail(c, 'Only "npx ts-node <file>" and "npx tsx <file>" work here.')),
    lua: (a, io, c) => (a[0] === '-e' ? runCode('lua', a[1] || '', '<eval>') : runFile(a[0], 'lua', c)),
    ruby: (a, io, c) => (a[0] === '-e' ? runCode('ruby', a[1] || '', '-e') : runFile(a[0], 'ruby', c)),
    sqlite3: (a, io, c) => {
      if (io.stdin != null) return runCode('sql', io.stdin, 'stdin.sql', { stdin: '' });
      const file = a.find((x) => /\.sql$/i.test(x));
      if (file) return runFile(file, 'sql', c);
      const sql = a.filter((x) => !x.startsWith('-')).pop();
      if (sql && /\s/.test(sql)) return runCode('sql', sql, '<sql>', { stdin: '' });
      return fail(c, 'Use "sqlite3 < file.sql", "sqlite3 file.sql" or sqlite3 "SELECT 1;".');
    },
    // Compilers on godbolt.org
    gcc: (a, io, c) => build(c, 'c', a, () => 'a'), cc: (a, io, c) => build(c, 'c', a, () => 'a'), clang: (a, io, c) => build(c, 'c', a, () => 'a'),
    'g++': (a, io, c) => build(c, 'cpp', a, () => 'a'), 'c++': (a, io, c) => build(c, 'cpp', a, () => 'a'), 'clang++': (a, io, c) => build(c, 'cpp', a, () => 'a'),
    rustc: (a, io, c) => build(c, 'rust', a, stem),
    csc: (a, io, c) => build(c, 'csharp', a, stem),
    javac: (a, io, c) => build(c, 'java', a, (p) => stem(p) + '.class'),
    java: (a, io, c) => {
      const target = a.find((x) => !x.startsWith('-'));
      if (!target) return fail(c, 'Give a class name, for example: java Main');
      if (/\.java$/i.test(target)) return runFile(target, 'java', c);
      return runProgram(target.replace(/\.class$/i, '') + '.class', []);
    },
    go: (a, io, c) => {
      if (a[0] === 'version') { io.out('go version (godbolt.org, newest stable) windows/amd64\n'); return true; }
      if (a[0] === 'run') return runFile(a.slice(1).find((x) => /\.go$/.test(x)), 'go', 'go run');
      if (a[0] === 'build') return build('go build', 'go', a.slice(1), stem);
      return fail('go', 'Use "go run file.go" or "go build file.go".');
    },
    dotnet: (a, io, c) => {
      if (a[0] === '--version') { io.out('.NET (godbolt.org, newest stable)\n'); return true; }
      if (a[0] !== 'run') return fail(c, 'Only "dotnet run" works here. It runs the first .cs file in this folder.');
      const cs = SC.fs.list(cwd).find((n) => n.type === 'file' && /\.cs$/i.test(n.name));
      if (!cs) return fail(c, 'No .cs file in this folder.');
      return runFile(cs.name, 'csharp', c);
    },
  };

  /* ---------- Keyboard ---------- */
  function complete() {
    const value = input.value;
    const start = value.lastIndexOf(' ', input.selectionStart - 1) + 1;
    const word = value.slice(start, input.selectionStart);
    const first = !value.slice(0, start).trim();
    let options;
    if (first && !/[\\/]/.test(word)) {
      options = Object.keys(COMMANDS).filter((c) => c.startsWith(word.toLowerCase()) && !c.startsWith('$'));
    } else {
      const slash = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
      const dirPart = slash === -1 ? '' : word.slice(0, slash + 1);
      const dir = resolve(dirPart || '.');
      const prefix = word.slice(slash + 1).toLowerCase();
      options = SC.fs.list(dir).filter((n) => n.name.toLowerCase().startsWith(prefix)).map((n) => dirPart + n.name + (n.type === 'folder' ? (isPS() ? '\\' : '/') : ''));
    }
    if (!options.length) return;
    let common = options[0];
    for (const o of options) while (!o.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    if (options.length === 1) common = options[0] + (/[\\/]$/.test(options[0]) ? '' : ' ');
    if (common.length > word.length) {
      input.value = value.slice(0, start) + common + value.slice(input.selectionStart);
      input.selectionStart = input.selectionEnd = start + common.length;
    } else if (options.length > 1) {
      echoCommand(value);
      writeln(options.join('  '));
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); if (!busy) submit(input.value); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (mode === 'shell') complete(); else insertText('    '); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (mode !== 'shell' || !history.length) return;
      e.preventDefault();
      if (histIndex === -1) { draft = input.value; histIndex = history.length; }
      histIndex = SC.util.clamp(histIndex + (e.key === 'ArrowUp' ? -1 : 1), 0, history.length);
      input.value = histIndex === history.length ? draft : history[histIndex];
      if (histIndex === history.length) histIndex = -1;
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) { e.preventDefault(); interrupt(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); clearScreen(); }
  }

  function insertText(text) {
    const s = input.selectionStart;
    input.value = input.value.slice(0, s) + text + input.value.slice(input.selectionEnd);
    input.selectionStart = input.selectionEnd = s + text.length;
  }

  function interrupt() {
    if (busy && SC.runner.isRunning()) { SC.runner.stop(); return; }
    if (busy) return;
    echoCommand(input.value + '^C');
    if (mode === 'python' && pyMore) { pyMore = false; SC.runner.runSource({ lang: 'python', code: '', name: '<stdin>', sink, extra: { repl: true } }); }
    showPrompt();
  }

  /* ---------- Building the pane ---------- */
  function buildPane() {
    profileSelect = el('select', { class: 'term-profile', id: 'terminal-profile', 'aria-label': 'Terminal profile' },
      Object.entries(PROFILES).map(([id, p]) => el('option', { value: id, text: p.label })));
    profileSelect.value = profile;
    profileSelect.addEventListener('change', () => setProfile(profileSelect.value));
    outEl = el('div', { class: 'term-out' });
    promptEl = el('span', { class: 'term-prompt' });
    input = el('input', { class: 'term-input', id: 'terminal-input', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Terminal input' });
    input.addEventListener('keydown', onKeyDown);
    inputLine = el('div', { class: 'term-line' }, promptEl, input);
    screen = el('div', { class: 'term-screen' }, outEl, inputLine);
    screen.addEventListener('mouseup', () => { if (!window.getSelection().toString() && !inputLine.hidden) input.focus(); });
    pane = el('div', { class: 'terminal-pane' },
      el('div', { class: 'term-bar' },
        el('span', { class: 'term-label', text: 'Profile' }),
        profileSelect,
        el('button', { class: 'icon-btn', type: 'button', title: 'New Terminal', 'data-icon': 'new-file', onClick: () => newTerminal() }),
        el('button', { class: 'icon-btn', type: 'button', title: 'Stop running program (Ctrl+C)', 'data-icon': 'stop', onClick: () => SC.runner.stop() })),
      screen);
    SC.icons.hydrate(pane);
    return pane;
  }

  function setProfile(id) {
    profile = PROFILES[id] ? id : 'powershell';
    SC.storage.set('terminal.profile', profile);
    if (profileSelect) profileSelect.value = profile;
    newTerminal();
  }

  function newTerminal() {
    if (busy && SC.runner.isRunning()) SC.runner.stop();
    mode = 'shell';
    pyMore = false;
    cwd = '';
    banner();
    showPrompt();
  }

  function focusTerminal() {
    SC.panel.show('terminal');
    input.focus();
  }

  SC.extensions.register({
    id: 'smoki.terminal',
    name: 'Terminal',
    version: '1.0.0',
    icon: { text: '>_', color: '#2f6fb5' },
    description: 'PowerShell and MSYS2 (bash) terminals in the panel, working on your workspace files.',
    features: [
      'Two profiles: PowerShell (dir, Get-ChildItem, Set-Location...) and MSYS2 MINGW64 (ls, cat, grep, find...).',
      'Runs python, node, lua, ruby, sqlite3 and ts-node with the in-browser runtimes. Plain "python" opens the Python prompt.',
      'gcc, g++, rustc, go build, javac and csc build on godbolt.org and make a program you run with ./name.exe.',
      'pip commands when the pip extension is on.',
      'History (Up/Down), Tab completion, ; and && between commands, > and >> to save output.',
    ],
    commands: ['terminal.focus', 'terminal.new', 'terminal.selectProfile'],
    activate(ctx) {
      ctx.addPanelTab('terminal', 'Terminal', pane || buildPane(), { onShow: () => { if (!inputLine.hidden) input.focus(); scrollDown(); }, onClear: clearScreen });
      if (!outEl.childNodes.length) newTerminal();
      ctx.registerCommand({ id: 'terminal.focus', title: 'Focus Terminal', keybinding: 'Ctrl+Shift+`', run: focusTerminal });
      ctx.registerCommand({ id: 'terminal.new', title: 'Create New Terminal', run: () => { newTerminal(); focusTerminal(); } });
      ctx.registerCommand({
        id: 'terminal.selectProfile', title: 'Select Default Profile',
        run: async () => {
          const pick = await SC.palette.pick(Object.entries(PROFILES).map(([id, p]) => ({ label: p.label, id, description: id === profile ? '(current)' : '' })), { placeholder: 'Select the terminal profile' });
          if (pick) { setProfile(pick.id); focusTerminal(); }
        },
      });
    },
  });

  SC.terminal = { run: (line) => submit(line), sink, isBusy: () => busy, resolve, setProfile };
})(window.SC);
