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

  /* ---------- Variables and aliases ---------- */
  const DEFAULT_VARS = {
    HOME: '/c/workspace', USER: 'smoki', USERNAME: 'smoki', LOGNAME: 'smoki', HOSTNAME: 'SMOKI-PC', COMPUTERNAME: 'SMOKI-PC',
    SHELL: '/usr/bin/bash', MSYSTEM: 'MINGW64', TERM: 'xterm-256color', LANG: 'en_US.UTF-8', OS: 'Windows_NT',
    PATH: '/mingw64/bin:/ucrt64/bin:/usr/local/bin:/usr/bin:/bin', USERPROFILE: 'C:\\Users\\smoki', TEMP: 'C:\\Users\\smoki\\AppData\\Local\\Temp',
  };
  const vars = Object.assign({}, DEFAULT_VARS, SC.storage.get('terminal.vars', {}));
  const aliases = Object.assign({ ll: 'ls -l', la: 'ls -A', l: 'ls -CF' }, SC.storage.get('terminal.aliases', {}));
  let lastStatus = 0;

  function varValue(name) {
    if (name === '?') return String(lastStatus);
    if (name === '$') return '1337';
    if (name === '#') return '0';
    if (name === 'PWD') return displayPath(cwd);
    if (name === 'RANDOM') return String(Math.floor(Math.random() * 32768));
    if (name in vars) return vars[name];
    const key = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
    return isPS() && key ? vars[key] : '';
  }
  function setVar(name, value, persist) {
    vars[name] = value;
    if (persist) { const saved = SC.storage.get('terminal.vars', {}); saved[name] = value; SC.storage.set('terminal.vars', saved); }
  }
  function matchVar(line, i) {
    const rest = line.slice(i + 1);
    let m;
    if (isPS() && (m = /^env:([A-Za-z_]\w*)/i.exec(rest))) return { value: varValue(m[1]), length: m[0].length + 1 };
    if ((m = /^\{([^}]+)\}/.exec(rest))) return { value: varValue(m[1]), length: m[0].length + 1 };
    if ((m = /^([A-Za-z_]\w*|[?$#@*]|\d)/.exec(rest))) return { value: varValue(m[1]), length: m[0].length + 1 };
    return null;
  }

  /* ---------- Parsing ---------- */
  /** Split a line at ; && || (outside quotes) and drop # comments. */
  function splitTop(line) {
    const steps = [];
    let cur = '';
    let quote = null;
    let join = ';';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { if (c === quote) quote = null; cur += c; continue; }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
      const two = line.slice(i, i + 2);
      if (two === '&&' || two === '||') { steps.push({ text: cur, join }); join = two; cur = ''; i++; continue; }
      if (c === ';') { steps.push({ text: cur, join }); join = ';'; cur = ''; continue; }
      cur += c;
    }
    steps.push({ text: cur, join });
    return steps.filter((s) => s.text.trim());
  }

  /** Split one command into words and operators (| > >> < 2>), expanding $VARIABLES outside single quotes. */
  function tokenize(line) {
    const out = [];
    let cur = null;
    let quote = null;
    let quoted = false;
    const push = () => { if (cur !== null) out.push({ word: cur, quoted }); cur = null; quoted = false; };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote === "'") { if (c === "'") quote = null; else cur += c; continue; }
      if (c === '$') {
        if (line[i + 1] === '(') return { error: isPS() ? 'Subexpressions $( ) are not supported in this terminal yet.' : 'Command substitution $( ) is not supported in this terminal yet.' };
        const m = matchVar(line, i);
        if (m) { cur = (cur || '') + m.value; quoted = quoted || !!quote; i += m.length - 1; continue; }
      }
      if (quote === '"') {
        if (c === '"') quote = null;
        else if (!isPS() && c === '\\' && /["$\\`]/.test(line[i + 1] || '')) cur += line[++i];
        else if (isPS() && c === '`' && i + 1 < line.length) { const n = line[++i]; cur += n === 'n' ? '\n' : n === 't' ? '\t' : n; }
        else cur += c;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur = cur || ''; quoted = true; continue; }
      if (!isPS() && c === '\\' && i + 1 < line.length) { cur = (cur || '') + line[++i]; quoted = true; continue; }
      if (/\s/.test(c)) { push(); continue; }
      if (line.slice(i, i + 2) === '2>') { push(); out.push({ op: '2>' }); i++; continue; }
      if (line.slice(i, i + 2) === '>>') { push(); out.push({ op: '>>' }); i++; continue; }
      if (c === '|' || c === '>' || c === '<') { push(); out.push({ op: c }); continue; }
      cur = (cur || '') + c;
    }
    if (quote) return { error: 'The quote ' + quote + ' is never closed.' };
    push();
    return { tokens: out };
  }

  /** One step -> a pipeline: [{ args, quoted, outFile, append, inFile }] */
  function parsePipeline(text) {
    const t = tokenize(text);
    if (t.error) return t;
    const cmds = [];
    let cmd = { args: [], quoted: [] };
    let pending = null;
    for (const tok of t.tokens) {
      if (tok.op === '|') { cmds.push(cmd); cmd = { args: [], quoted: [] }; continue; }
      if (tok.op) { pending = tok.op; continue; }
      if (pending === '>' || pending === '>>') { cmd.outFile = tok.word; cmd.append = pending === '>>'; pending = null; continue; }
      if (pending === '2>') { cmd.errFile = tok.word; pending = null; continue; }
      if (pending === '<') { cmd.inFile = tok.word; pending = null; continue; }
      cmd.args.push(tok.word);
      cmd.quoted.push(tok.quoted);
    }
    cmds.push(cmd);
    if (cmds.some((c) => !c.args.length) && cmds.length > 1) return { error: isPS() ? 'An empty pipe element is not allowed.' : 'bash: syntax error near unexpected token `|\'' };
    return { pipeline: cmds.filter((c) => c.args.length) };
  }

  /* ---------- Running a line ---------- */
  async function submit(line) {
    echoCommand(line);
    if (asking) { const resolve = asking; asking = null; resolve(line); return; }
    if (mode === 'python') { await pythonLine(line); return; }
    if (line.trim()) {
      history = history.filter((h) => h !== line).concat(line).slice(-200);
      SC.storage.set('terminal.history', history);
    }
    histIndex = -1;
    busy = true;
    inputLine.hidden = true;
    try {
      await runLine(line);
    } catch (err) {
      writeln(String(err.message || err), 'error');
      lastStatus = 1;
    }
    if (mode === 'python') return; // python started its prompt
    showPrompt();
  }

  /** Run one line: commands joined by ; && ||, pipes, simple for/if. Resolves to the exit status. */
  async function runLine(line, depth = 0) {
    if (depth > 20) { writeln('Too many nested scripts.', 'error'); return (lastStatus = 1); }
    let m = /^\s*for\s+(\w+)\s+in\s+(.*?);\s*do\s+(.*?);?\s*done\s*$/.exec(line);
    if (m && !isPS()) {
      const t = tokenize(m[2]);
      if (t.error) { writeln(t.error, 'error'); return (lastStatus = 1); }
      const items = [];
      t.tokens.filter((x) => x.word != null).forEach((x) => items.push(...(x.quoted ? [x.word] : glob(x.word))));
      for (const item of items) { setVar(m[1], item); await runLine(m[3], depth + 1); }
      return lastStatus;
    }
    m = /^\s*if\s+(.*?);\s*then\s+(.*?)(?:;\s*else\s+(.*?))?;?\s*fi\s*$/.exec(line);
    if (m && !isPS()) {
      const ok = (await runLine(m[1], depth + 1)) === 0;
      if (ok) return runLine(m[2], depth + 1);
      if (m[3]) return runLine(m[3], depth + 1);
      return (lastStatus = 0);
    }
    for (const step of splitTop(line)) {
      if (step.join === '&&' && lastStatus !== 0) continue;
      if (step.join === '||' && lastStatus === 0) continue;
      lastStatus = await runStep(step.text, depth);
      if (exitRequested) break;
    }
    return lastStatus;
  }

  async function runStep(text, depth) {
    // Assignments: NAME=value (bash), $name = value / $env:NAME = value (PowerShell)
    let m = !isPS() && /^\s*(export\s+)?([A-Za-z_]\w*)=(.*)$/.exec(text);
    if (m) {
      const t = tokenize(m[3]);
      if (t.error) { writeln(t.error, 'error'); return 1; }
      setVar(m[2], t.tokens.filter((x) => x.word != null).map((x) => x.word).join(' '), !!m[1]);
      return 0;
    }
    m = isPS() && /^\s*\$(env:)?([A-Za-z_]\w*)\s*=\s*(.*)$/i.exec(text);
    if (m) {
      const t = tokenize(m[3]);
      if (t.error) { writeln(t.error, 'error'); return 1; }
      setVar(m[2], t.tokens.filter((x) => x.word != null).map((x) => x.word).join(' '), !!m[1]);
      return 0;
    }
    m = isPS() && /^\s*\$(env:)?([A-Za-z_]\w*)\s*$/i.exec(text);
    if (m) { writeln(varValue(m[2])); return 0; }
    // Aliases replace the first word
    const first = text.trim().split(/\s+/)[0];
    if (aliases[first] && depth < 10) text = text.replace(first, aliases[first]);
    const parsed = parsePipeline(text);
    if (parsed.error) { writeln(parsed.error, 'error'); return 2; }
    let input = null;
    let status = 0;
    for (let i = 0; i < parsed.pipeline.length; i++) {
      const cmd = parsed.pipeline[i];
      const last = i === parsed.pipeline.length - 1;
      const res = await runCommand(cmd, { stdin: input, capture: !last, depth });
      input = res.output;
      status = res.status;
    }
    return status;
  }

  /** Errors look like the real shells. */
  function fail(cmd, message) {
    writeln(cmd + ': ' + message, 'error');
    return false;
  }

  let asking = null;
  let exitRequested = false;
  /** Ask the user a question inside the terminal (for example pacman's [Y/n]). */
  function ask(question) {
    return new Promise((resolve) => {
      if (openLine) write('\n');
      promptEl.textContent = question;
      inputLine.hidden = false;
      input.value = '';
      scrollDown();
      input.focus();
      asking = (answer) => { inputLine.hidden = true; resolve(answer); };
    });
  }

  async function runCommand(step, { stdin = null, capture = false, depth = 0 } = {}) {
    const name = step.args[0];
    const lower = name.toLowerCase();
    const args = [];
    step.args.slice(1).forEach((a, i) => args.push(...(a.startsWith('-') || step.quoted[i + 1] ? [a] : glob(a))));
    let captured = capture || step.outFile ? '' : null;
    const io = {
      out: (text) => { if (captured !== null) captured += text; else write(text); },
      write: (text, kind) => { if (captured !== null) captured += text; else write(text, kind); },
      stdin: step.inFile ? readText(step.inFile) : stdin,
      piped: capture,
      ask,
      depth,
    };
    if (step.inFile && io.stdin == null) { writeln((isPS() ? 'Get-Content' : 'bash') + ': ' + step.inFile + ': No such file or directory', 'error'); return { status: 1, output: '' }; }
    let ok;
    const fn = COMMANDS[lower];
    if (fn) ok = await fn(args, io, name);
    else if (/^(\.{1,2}[\\/]|\/|~)/.test(name) || /\.(exe|class|sh|ps1)$/i.test(name)) ok = await runProgram(name, args, io);
    else {
      ok = false;
      if (isPS()) writeln(name + ' : The term \'' + name + '\' is not recognized as a name of a cmdlet, function, script file, or operable program.' + (/^(pacman|makepkg|pkg-config)$/.test(lower) ? ' (It is an MSYS2 command: switch the terminal profile to MSYS2.)' : ''), 'error');
      else writeln('bash: ' + name + ': command not found', 'error');
    }
    const status = typeof ok === 'number' ? ok : ok === false ? 1 : 0;
    if (step.outFile) {
      const path = resolve(step.outFile);
      try {
        const before = step.append && SC.fs.isFile(path) ? SC.fs.readFile(path) : '';
        SC.fs.createFile(path, before + captured, { overwrite: true });
      } catch (err) { fail(name, err.message); return { status: 1, output: '' }; }
      return { status, output: '' };
    }
    return { status, output: captured };
  }

  function readText(arg) {
    const p = resolve(arg);
    return SC.fs.isFile(p) ? SC.fs.readFile(p) : null;
  }

  /** Text a command works on: its file arguments, or what was piped in. */
  function inputText(files, io, cmd) {
    if (!files.length) {
      if (io.stdin == null) { fail(cmd, 'Give a file name or pipe text in (for example: cat file.txt | ' + cmd + ').'); return null; }
      return io.stdin;
    }
    let text = '';
    for (const f of files) {
      const t = readText(f);
      if (t == null) { fail(cmd, f + ': No such file or directory'); return null; }
      text += t.endsWith('\n') || !t ? t : t + '\n';
    }
    return text;
  }
  const linesOf = (text) => text.replace(/\n$/, '').split('\n');

  /** Run a shell script (bash) or PowerShell script line by line. */
  async function runScript(path, depth, args = []) {
    // $0 $1 $2 ... $# $@ for the script
    const saved = {};
    const params = { 0: nameOf(path), '#': String(args.length), '@': args.join(' '), '*': args.join(' ') };
    for (let i = 1; i <= 9; i++) params[i] = args[i - 1] || '';
    for (const k of Object.keys(params)) { saved[k] = vars[k]; vars[k] = params[k]; }
    try { return await runScriptLines(path, depth); } finally {
      for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete vars[k]; else vars[k] = saved[k]; }
    }
  }

  async function runScriptLines(path, depth) {
    const text = SC.fs.readFile(path);
    const lines = [];
    let block = '';
    let open = 0;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (!block && /^\s*#!/.test(line)) continue;
      if (/^\s*(for|while|if)\b/.test(line)) open++;
      if (open) {
        block += (block ? '; ' : '') + line.trim();
        if (/\b(done|fi)\s*$/.test(line.trim())) open--;
        if (!open) { lines.push(block.replace(/;\s*(do|then|else)\s*;/g, '; $1 ')); block = ''; }
        continue;
      }
      lines.push(line);
    }
    exitRequested = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      await runLine(line, depth + 1);
      if (exitRequested) { exitRequested = false; break; }
    }
    return lastStatus;
  }

  /** A progress bar line, updated as it fills: returns update(fraction). */
  function progress(label, width = 46) {
    if (openLine) write('\n');
    const bar = el('span');
    const line = el('div', {}, document.createTextNode(label.padEnd(width) + ' '), bar);
    outEl.append(line);
    openLine = null;
    return (f) => {
      const n = Math.round(Math.max(0, Math.min(1, f)) * 22);
      bar.textContent = '[' + '#'.repeat(n) + '-'.repeat(22 - n) + '] ' + String(Math.round(f * 100)).padStart(3) + '%';
      scrollDown();
    };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fill(update, ms) {
    const steps = 6;
    for (let i = 1; i <= steps; i++) { update(i / steps); await sleep(ms / steps); }
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

  /** gcc-style error for a missing header, with the line it is on. */
  function headerError(file, code, header) {
    const lines = code.split('\n');
    const n = lines.findIndex((l) => l.includes(header));
    const line = lines[n] || '';
    const col = line.indexOf(header) - 1;
    writeln(nameOf(file) + ':' + (n + 1) + ':' + (col + 1) + ': fatal error: ' + header + ': No such file or directory', 'error');
    writeln(String(n + 1).padStart(5) + ' | ' + line);
    writeln('      | ' + ' '.repeat(Math.max(0, col)) + '^' + '~'.repeat(header.length + 1));
    writeln('compilation terminated.');
  }

  const SYSTEM_LIBS = ['m', 'c', 'gdi32', 'user32', 'kernel32', 'winmm', 'shell32', 'ole32', 'oleaut32', 'comdlg32', 'opengl32', 'glu32', 'pthread', 'stdc++', 'ws2_32', 'uuid', 'dwmapi', 'advapi32', 'mingw32', 'gcc', 'gcc_s'];

  /** Build with a compiler and leave a program file next to the source. Graphics code compiles in the browser, the rest on godbolt.org. */
  async function build(cmd, lang, args, defaultOut) {
    const src = args.find((a) => !a.startsWith('-') && LANG_BY_EXT[extOf(a).toLowerCase()]);
    if (!src) return fail(cmd, 'fatal error: no input files\ncompilation terminated.');
    const path = resolve(src);
    if (!SC.fs.isFile(path)) return fail(cmd, 'error: ' + src + ': No such file or directory\n' + cmd + ': fatal error: no input files\ncompilation terminated.');
    const oi = args.indexOf('-o');
    let outName = oi !== -1 && args[oi + 1] ? args[oi + 1] : defaultOut(path);
    if (lang !== 'java' && !/\.exe$/i.test(outName)) outName += '.exe';
    const code = openText(path);
    let runLang = lang;
    let extra;
    const pk = SC.msysPackages;
    if ((lang === 'c' || lang === 'cpp') && pk) {
      const s = pk.scan(code);
      if (s.missing.length) { headerError(path, code, s.missing[0].header); return false; }
      // -lname must be a system library or come from an installed package
      const libs = [];
      args.forEach((a, i) => { if (a === '-l' && args[i + 1]) libs.push(args[i + 1]); else if (/^-l./.test(a)) libs.push(a.slice(2)); });
      for (const lib of libs) {
        const owner = Object.keys(pk.PACKAGES).find((id) => pk.PACKAGES[id].libs.includes(lib));
        if (SYSTEM_LIBS.includes(lib) || (owner && pk.isInstalled(owner))) continue;
        writeln('C:/msys64/mingw64/bin/../lib/gcc/x86_64-w64-mingw32/15.2.0/../../../../x86_64-w64-mingw32/bin/ld.exe: cannot find -l' + lib + ': No such file or directory', 'error');
        writeln('collect2.exe: error: ld returned 1 exit status', 'error');
        return false;
      }
      if (s.graphics) {
        if (lang === 'cpp') return fail(cmd, 'C++ graphics programs are not supported yet. Write the program in C (.c) and build it with gcc.');
        runLang = 'cgfx';
        extra = { packages: s.packages };
      }
    }
    const ok = await runCode(runLang, code, path, { stdin: '', compileOnly: true, extra });
    if (!ok) return false;
    const outPath = resolve(outName);
    const program = { smokiProgram: 1, lang: runLang, source: path, code, packages: extra ? extra.packages : undefined, note: 'Made by Smoki\'s Code. Run it in the terminal with ./' + nameOf(outPath) };
    SC.fs.createFile(outPath, JSON.stringify(program, null, 2) + '\n', { overwrite: true });
    return true;
  }

  async function runProgram(name, args, io) {
    let path = resolve(name.replace(/^\.[\/]/, ''));
    if (!SC.fs.isFile(path) && SC.fs.isFile(path + '.exe')) path += '.exe';
    if (!SC.fs.isFile(path)) {
      if (isPS()) writeln(name + ' : The term \'' + name + '\' is not recognized as a name of a cmdlet, function, script file, or operable program.', 'error');
      else writeln('bash: ' + name + ': No such file or directory', 'error');
      return false;
    }
    if (/\.(sh|bash)$/i.test(path) || (/\.ps1$/i.test(path) && isPS())) return (await runScript(path, io ? io.depth : 0, args)) === 0;
    const lang = LANG_BY_EXT[extOf(path).toLowerCase()];
    if (lang && !/\.(exe|class)$/i.test(path)) return runCode(lang, openText(path), path);
    let program;
    try { program = JSON.parse(SC.fs.readFile(path)); } catch (err) { program = null; }
    if (!program || !program.smokiProgram) {
      if (!isPS() && /^#!/.test(SC.fs.readFile(path))) return (await runScript(path, io ? io.depth : 0, args)) === 0;
      writeln(isPS() ? 'Program \'' + nameOf(path) + '\' failed to run: it is not a program built in this terminal.' : 'bash: ' + name + ': cannot execute binary file: Exec format error', 'error');
      return false;
    }
    if (program.lang === 'cgfx' && !SC.runner.RUNTIMES.cgfx) return fail(name, 'this program needs the C Graphics extension. Turn it on in the Extensions view.');
    return runCode(program.lang, program.code, program.source, program.packages ? { extra: { packages: program.packages } } : {});
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
    // Several file names (ls a.c b.c, or a pattern like main*) are listed together
    if (targets.length > 1 && targets.every((t) => SC.fs.isFile(resolve(t)))) {
      return lsItems(targets.map((t) => SC.fs.get(resolve(t))), resolve(targets[0]).split('/').slice(0, -1).join('/'), long, io);
    }
    const path = resolve(targets[0] || '.');
    const node = SC.fs.get(path);
    if (!node) return fail(isPS() ? 'Get-ChildItem' : 'ls', isPS() ? 'Cannot find path \'' + displayPath(path) + '\' because it does not exist.' : 'cannot access \'' + targets[0] + '\': No such file or directory');
    const items = node.type === 'file' ? [node] : SC.fs.list(path).filter((n) => showAll || !n.name.startsWith('.'));
    return lsItems(items, node.type === 'file' ? path.split('/').slice(0, -1).join('/') : path, long, io);
  }

  function lsItems(items, dirPath, long, io) {
    const date = (n) => {
      const d = new Date(n.mtime || Date.now());
      return isPS() ? d.toLocaleDateString('en-GB') + '  ' + d.toTimeString().slice(0, 5) : d.toDateString().slice(4, 10) + ' ' + d.toTimeString().slice(0, 5);
    };
    const size = (n) => (n.type === 'file' ? n.content.length : 0);
    if (io.piped && (isPS() || !long)) { items.forEach((n) => io.out(n.name + '\n')); return true; } // names go through pipes
    if (isPS()) {
      if (!items.length) return true;
      io.out('\n    Directory: ' + displayPath(dirPath) + '\n\n');
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
    if (io.piped) { items.forEach((n) => io.out(n.name + '\n')); return true; }
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
    let escapes = false;
    const words = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (!isPS() && /^-[neE]+$/.test(a) && !words.length) { if (a.includes('n')) noNewline = true; if (a.includes('e')) escapes = true; }
      else if (/^-(ForegroundColor|BackgroundColor)$/i.test(a)) i++;
      else if (/^-NoNewline$/i.test(a)) noNewline = true;
      else words.push(a);
    }
    let text = words.join(' ');
    if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\e\[[\d;]*m/g, '').replace(/\\\\/g, '\\');
    io.out(text + (noNewline ? '' : '\n'));
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

  /* ---------- Text tools (they also read piped input) ---------- */
  function wc(args, io) {
    const files = args.filter((a) => !a.startsWith('-'));
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const report = (text, label) => {
      const counts = { l: (text.match(/\n/g) || []).length, w: (text.match(/\S+/g) || []).length, c: text.length };
      const cols = flags ? ['l', 'w', 'c'].filter((k) => flags.includes(k) || (k === 'c' && flags.includes('m'))) : ['l', 'w', 'c'];
      io.out(cols.map((k) => String(counts[k]).padStart(cols.length > 1 ? 7 : 0)).join(' ') + (label ? ' ' + label : '') + '\n');
    };
    if (!files.length) { if (io.stdin == null) return fail('wc', 'Give a file name or pipe text in.'); report(io.stdin, ''); return true; }
    for (const f of files) {
      const text = readText(f);
      if (text == null) return fail('wc', f + ': No such file or directory');
      report(text, f);
    }
    return true;
  }

  function grep(args, io, cmd) {
    let flags = '';
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (/^-pattern$/i.test(a)) rest.unshift(args[++i]);
      else if (/^-path$/i.test(a)) rest.push(args[++i]);
      else if (/^-(e)$/.test(a)) rest.unshift(args[++i]);
      else if (/^--?[a-zA-Z]+$/.test(a)) flags += a.replace(/^-+/, '');
      else rest.push(a);
    }
    const pattern = rest.shift();
    if (pattern == null) return fail(cmd, 'Give a pattern to search for.');
    let re;
    try { re = new RegExp(/w/.test(flags) && cmd === 'grep' ? '\\b(' + pattern + ')\\b' : pattern, /i/.test(flags) || isPS() ? 'i' : ''); } catch (err) { return fail(cmd, 'Invalid pattern: ' + err.message); }
    const invert = cmd === 'grep' && /v/.test(flags);
    const showNum = /n/.test(flags) && cmd === 'grep';
    const countOnly = cmd === 'grep' && /c/.test(flags);
    const namesOnly = cmd === 'grep' && /l/.test(flags);
    const onlyMatch = cmd === 'grep' && /o/.test(flags);
    const color = (line) => {
      if (invert || io.piped) { io.out(line + '\n'); return; }
      let last = 0;
      line.replace(new RegExp(re.source, re.flags + 'g'), (m, ...rest2) => { const at = rest2[rest2.length - 2]; io.out(line.slice(last, at)); io.write(m, 'match'); last = at + m.length; return m; });
      io.out(line.slice(last) + '\n');
    };
    let found = 0;
    const search = (lines, label) => {
      let n = 0;
      lines.forEach((line, i) => {
        if (re.test(line) === invert) return;
        n++;
        if (countOnly || namesOnly) return;
        if (label) { io.write(label, 'path'); io.out(':'); }
        if (showNum || (isPS() && label)) { io.write(String(i + 1), 'num'); io.out(':'); }
        if (onlyMatch) (line.match(new RegExp(re.source, re.flags + 'g')) || []).forEach((m) => io.out(m + '\n'));
        else color(line);
      });
      if (countOnly) io.out((label ? label + ':' : '') + n + '\n');
      if (namesOnly && n) io.out(label + '\n');
      found += n;
    };
    if (!rest.length && io.stdin != null && !/r/i.test(flags)) search(linesOf(io.stdin), '');
    else {
      let files = rest.map(resolve);
      if (/r/i.test(flags) || !rest.length) files = (rest.length ? rest : ['.']).flatMap((r) => (SC.fs.isFolder(resolve(r)) ? SC.fs.allFiles(resolve(r)).map((f) => f.path) : [resolve(r)]));
      for (const p of files) {
        if (!SC.fs.isFile(p)) { if (!SC.fs.isFolder(p)) fail(cmd, p + ': No such file or directory'); continue; }
        search(linesOf(SC.fs.readFile(p)), files.length > 1 || /r/i.test(flags) || isPS() ? p : '');
      }
    }
    return found > 0;
  }

  function sort(args, io, cmd) {
    const flags = args.filter((a) => /^-[a-z]+$/i.test(a)).join('');
    const ps = cmd !== 'sort';
    const text = inputText(args.filter((a) => !a.startsWith('-')), io, cmd);
    if (text == null) return false;
    let lines = linesOf(text);
    const numeric = /n/.test(flags) || (ps && lines.every((l) => l.trim() !== '' && !isNaN(l)));
    lines.sort(numeric ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => (/f/.test(flags) || ps ? a.toLowerCase().localeCompare(b.toLowerCase()) : a < b ? -1 : a > b ? 1 : 0));
    if (/r/.test(flags) || /descending/i.test(args.join(' '))) lines.reverse();
    if (/u/.test(flags) || /-unique/i.test(args.join(' '))) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    io.out(lines.join('\n') + '\n');
    return true;
  }

  function uniq(args, io) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const text = inputText(args.filter((a) => !a.startsWith('-')), io, 'uniq');
    if (text == null) return false;
    const groups = [];
    for (const l of linesOf(text)) { if (groups.length && groups[groups.length - 1][0] === l) groups[groups.length - 1][1]++; else groups.push([l, 1]); }
    for (const [l, n] of groups) {
      if (/d/.test(flags) && n < 2) continue;
      if (/u/.test(flags) && n > 1) continue;
      io.out((/c/.test(flags) ? String(n).padStart(7) + ' ' : '') + l + '\n');
    }
    return true;
  }

  function trSet(s) {
    s = s.replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:digit:\]/g, '0-9').replace(/\[:space:\]/g, ' \t\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i + 1] === '-' && i + 2 < s.length) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out += String.fromCharCode(c); i += 2; } else out += s[i];
    }
    return out;
  }
  function tr(args, io) {
    if (io.stdin == null) return fail('tr', 'tr reads piped text, for example: echo hello | tr a-z A-Z');
    const del = args[0] === '-d';
    const sets = args.filter((a) => !a.startsWith('-'));
    const a = trSet(sets[0] || '');
    if (del) { io.out(io.stdin.split('').filter((c) => !a.includes(c)).join('')); return true; }
    const b = trSet(sets[1] || '');
    io.out(io.stdin.split('').map((c) => { const k = a.indexOf(c); return k === -1 ? c : b[Math.min(k, b.length - 1)] || ''; }).join(''));
    return true;
  }

  function cut(args, io) {
    let delim = '\t';
    let fields = null;
    let chars = null;
    const files = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-d') delim = args[++i]; else if (/^-d./.test(a)) delim = a.slice(2);
      else if (a === '-f') fields = args[++i]; else if (/^-f./.test(a)) fields = a.slice(2);
      else if (a === '-c') chars = args[++i]; else if (/^-c./.test(a)) chars = a.slice(2);
      else files.push(a);
    }
    const ranges = (spec) => spec.split(',').map((r) => { const [x, y] = r.split('-'); return [x ? +x : 1, r.includes('-') ? (y ? +y : Infinity) : +x]; });
    const pick = (n, rs) => rs.some(([x, y]) => n >= x && n <= y);
    const text = inputText(files, io, 'cut');
    if (text == null) return false;
    if (!fields && !chars) return fail('cut', 'you must specify a list of bytes, characters, or fields');
    for (const line of linesOf(text)) {
      if (chars) io.out(line.split('').filter((c, i) => pick(i + 1, ranges(chars))).join('') + '\n');
      else { const parts = line.split(delim); io.out((parts.length === 1 ? parts : parts.filter((p, i) => pick(i + 1, ranges(fields)))).join(delim) + '\n'); }
    }
    return true;
  }

  function sed(args, io) {
    const scripts = [];
    const files = [];
    let quiet = false;
    let inPlace = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-e') scripts.push(args[++i]);
      else if (args[i] === '-n') quiet = true;
      else if (args[i] === '-i') inPlace = true;
      else if (!scripts.length && !args[i].startsWith('-')) scripts.push(args[i]);
      else files.push(args[i]);
    }
    const cmds = [];
    for (const s of scripts.join(';').split(/;(?![^/]*\/[gip]*$)/)) {
      const t = s.trim();
      let m;
      if ((m = /^s(.)(.*?)\1(.*?)\1([gip0-9]*)$/.exec(t))) cmds.push({ type: 's', re: new RegExp(m[2], m[4].includes('i') ? (m[4].includes('g') ? 'gi' : 'i') : m[4].includes('g') ? 'g' : ''), rep: m[3].replace(/\\(\d)/g, '$$$1').replace(/&/g, '$$&'), print: m[4].includes('p') });
      else if ((m = /^(\d+)?(?:,(\d+|\$))?([dp])$/.exec(t))) cmds.push({ type: m[3], from: m[1] ? +m[1] : null, to: m[2] === '$' ? Infinity : m[2] ? +m[2] : null });
      else if ((m = /^\/(.*)\/([dp])$/.exec(t))) cmds.push({ type: m[2], re: new RegExp(m[1]) });
      else if (t) return fail('sed', '-e expression #1, char 1: unknown command: `' + t[0] + '\'');
    }
    const apply = (text) => {
      let outText = '';
      linesOf(text).forEach((line, i) => {
        const n = i + 1;
        let del = false;
        let printed = '';
        for (const c of cmds) {
          const hit = c.re ? c.re.test(line) : c.from == null || (n >= c.from && n <= (c.to == null ? c.from : c.to));
          if (c.type === 's') { const before = line; line = line.replace(c.re, c.rep); if (c.print && line !== before) printed += line + '\n'; }
          else if (c.type === 'd' && hit) { del = true; break; }
          else if (c.type === 'p' && hit) printed += line + '\n';
        }
        if (!del && !quiet) outText += line + '\n';
        outText += printed;
      });
      return outText;
    };
    if (inPlace && files.length) {
      for (const f of files) { const p = resolve(f); if (!SC.fs.isFile(p)) return fail('sed', 'can\'t read ' + f + ': No such file or directory'); SC.fs.writeFile(p, apply(SC.fs.readFile(p))); }
      return true;
    }
    const text = inputText(files, io, 'sed');
    if (text == null) return false;
    io.out(apply(text));
    return true;
  }

  function tee(args, io) {
    const append = args.includes('-a');
    const text = io.stdin || '';
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const p = resolve(f);
      const before = append && SC.fs.isFile(p) ? SC.fs.readFile(p) : '';
      SC.fs.createFile(p, before + text, { overwrite: true });
    }
    io.out(text);
    return true;
  }

  function testExpr(args) {
    const a = args[args.length - 1] === ']' ? args.slice(0, -1) : args.slice();
    if (a[0] === '!') return !testExpr(a.slice(1));
    if (a.length === 0) return false;
    if (a.length === 1) return a[0] !== '';
    if (a.length === 2) {
      const p = resolve(a[1]);
      switch (a[0]) {
        case '-e': return SC.fs.exists(p);
        case '-f': return SC.fs.isFile(p);
        case '-d': return SC.fs.isFolder(p);
        case '-s': return SC.fs.isFile(p) && SC.fs.readFile(p).length > 0;
        case '-z': return a[1] === '';
        case '-n': return a[1] !== '';
        case '-r': case '-w': case '-x': return SC.fs.exists(p);
        default: return false;
      }
    }
    const [x, op, y] = a;
    switch (op) {
      case '=': case '==': return x === y;
      case '!=': return x !== y;
      case '-eq': return +x === +y;
      case '-ne': return +x !== +y;
      case '-lt': return +x < +y;
      case '-le': return +x <= +y;
      case '-gt': return +x > +y;
      case '-ge': return +x >= +y;
      default: return false;
    }
  }

  function tree(args, io) {
    const dirArg = args.find((a) => !a.startsWith('-') && !a.startsWith('/')) || '.';
    const base = resolve(dirArg);
    const foldersOnly = isPS() && !args.some((a) => /^\/f$/i.test(a));
    io.out(isPS() ? 'Folder PATH listing\n' + displayPath(base) + '\n' : dirArg + '\n');
    let dirs = 0;
    let files = 0;
    (function walk(dir, prefix) {
      const items = SC.fs.list(dir).filter((n) => !foldersOnly || n.type === 'folder');
      items.forEach((n, i) => {
        const lastOne = i === items.length - 1;
        io.out(prefix + (lastOne ? '└── ' : '├── '));
        io.write(n.name + '\n', n.type === 'folder' ? 'dir' : '');
        if (n.type === 'folder') { dirs++; walk((dir ? dir + '/' : '') + n.name, prefix + (lastOne ? '    ' : '│   ')); } else files++;
      });
    })(base, '');
    if (!isPS()) io.out('\n' + dirs + ' director' + (dirs === 1 ? 'y' : 'ies') + ', ' + files + ' file' + (files === 1 ? '' : 's') + '\n');
    return true;
  }

  function sizeOf(path) {
    if (SC.fs.isFile(path)) return SC.fs.readFile(path).length;
    return SC.fs.allFiles(path).reduce((n, f) => n + f.node.content.length, 0);
  }
  const human = (n) => (n < 1024 ? n + '' : n < 1048576 ? (n / 1024).toFixed(1) + 'K' : (n / 1048576).toFixed(1) + 'M');
  function du(args, io) {
    const h = args.some((a) => /h/.test(a) && a.startsWith('-'));
    const s = args.some((a) => /s/.test(a) && a.startsWith('-'));
    const targets = args.filter((a) => !a.startsWith('-'));
    const show = (p, label) => io.out((h ? human(sizeOf(p)) : String(Math.ceil(sizeOf(p) / 1024))).padEnd(8) + label + '\n');
    for (const t of targets.length ? targets : ['.']) {
      const p = resolve(t);
      if (!s && SC.fs.isFolder(p)) SC.fs.allFolders ? SC.fs.allFolders(p).forEach((f) => show(f.path, './' + f.path.slice(p ? p.length + 1 : 0))) : null;
      show(p, t);
    }
    return true;
  }

  function stat(args, io) {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const p = resolve(f);
      const n = SC.fs.get(p);
      if (!n) return fail('stat', 'cannot statx \'' + f + '\': No such file or directory');
      const d = new Date(n.mtime || Date.now()).toISOString().replace('T', ' ').replace('Z', ' +0000');
      if (isPS()) io.out('\n    Directory: ' + displayPath(p.split('/').slice(0, -1).join('/')) + '\n\nMode                 LastWriteTime         Length Name\n----                 -------------         ------ ----\n' + (n.type === 'folder' ? 'd----' : '-a---') + '          ' + new Date(n.mtime || Date.now()).toLocaleString('en-GB').padEnd(20) + String(n.type === 'file' ? n.content.length : '').padStart(11) + ' ' + n.name + '\n\n');
      else io.out('  File: ' + f + '\n  Size: ' + (n.type === 'file' ? n.content.length : 0) + '\t\tBlocks: 1\tIO Block: 65536  ' + (n.type === 'file' ? 'regular file' : 'directory') + '\nDevice: 0,0\tInode: 1\tLinks: 1\nAccess: (0644/-rw-r--r--)  Uid: (197609/   smoki)   Gid: (197121/    None)\nModify: ' + d + '\n');
    }
    return true;
  }

  function fileType(args, io) {
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const p = resolve(f);
      if (SC.fs.isFolder(p)) { io.out(f + ': directory\n'); continue; }
      if (!SC.fs.isFile(p)) { io.out(f + ': cannot open `' + f + '\' (No such file or directory)\n'); continue; }
      const text = SC.fs.readFile(p);
      let kind = 'ASCII text';
      if (/"smokiProgram"/.test(text)) kind = 'PE32+ executable (console) x86-64, for MS Windows (built by Smoki\'s Code)';
      else if (/^#!.*sh/.test(text)) kind = 'Bourne-Again shell script, ASCII text executable';
      else if (/\.c$/.test(p)) kind = 'C source, ASCII text';
      else if (/\.(cpp|cc|h|hpp)$/.test(p)) kind = 'C++ source, ASCII text';
      else if (/\.py$/.test(p)) kind = 'Python script, ASCII text executable';
      else if (!text) kind = 'empty';
      io.out(f + ': ' + kind + '\n');
    }
    return true;
  }

  function diff(args, io) {
    const [a, b] = args.filter((x) => !x.startsWith('-'));
    const ta = readText(a || '');
    const tb = readText(b || '');
    if (ta == null || tb == null) return fail('diff', (ta == null ? a : b) + ': No such file or directory');
    const x = linesOf(ta);
    const y = linesOf(tb);
    const L = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    let same = true;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; continue; }
      same = false;
      if (j < y.length && (i >= x.length || L[i][j + 1] >= L[i + 1][j])) { io.write('> ' + y[j] + '\n', 'match'); j++; }
      else { io.write('< ' + x[i] + '\n', 'error'); i++; }
    }
    return same;
  }

  function printf(args, io) {
    const fmt = (args[0] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    let k = 1;
    io.out(fmt.replace(/%(-?\d*)(\.\d+)?([sdifx%])/g, (m, w, p, t) => {
      if (t === '%') return '%';
      let v = args[k++];
      if (v == null) v = t === 's' ? '' : '0';
      let s = t === 'd' || t === 'i' ? String(parseInt(v, 10) || 0) : t === 'f' ? (parseFloat(v) || 0).toFixed(p ? +p.slice(1) : 6) : t === 'x' ? (parseInt(v, 10) || 0).toString(16) : String(v);
      const width = Math.abs(parseInt(w || '0', 10));
      return w && w.startsWith('-') ? s.padEnd(width) : s.padStart(width);
    }));
    return true;
  }

  function listVars(io, ps) {
    const keys = Object.keys(vars).sort();
    if (ps) { io.out('\nName                           Value\n----                           -----\n'); keys.forEach((k) => io.out(k.padEnd(31) + vars[k] + '\n')); io.out('\n'); }
    else keys.forEach((k) => io.out(k + '=' + vars[k] + '\n'));
    return true;
  }

  function alias(args, io) {
    if (!args.length) { Object.keys(aliases).sort().forEach((k) => io.out((isPS() ? '' : 'alias ') + k + '=\'' + aliases[k] + '\'\n')); return true; }
    for (const a of args) {
      const m = /^([^=]+)=(.*)$/.exec(a);
      if (m) { aliases[m[1]] = m[2]; const saved = SC.storage.get('terminal.aliases', {}); saved[m[1]] = m[2]; SC.storage.set('terminal.aliases', saved); }
      else if (aliases[a]) io.out('alias ' + a + '=\'' + aliases[a] + '\'\n');
      else return fail('bash: alias', a + ': not found');
    }
    return true;
  }

  /* ---------- make ---------- */
  async function make(args, io) {
    const fi = args.indexOf('-f');
    const fileArg = fi !== -1 ? args[fi + 1] : ['Makefile', 'makefile', 'GNUmakefile'].find((f) => SC.fs.isFile(resolve(f)));
    if (!fileArg || !SC.fs.isFile(resolve(fileArg))) { writeln('make: *** No targets specified and no makefile found.  Stop.', 'error'); return 2; }
    const mvars = {};
    const rules = [];
    let rule = null;
    const text = SC.fs.readFile(resolve(fileArg)).replace(/\\\n/g, ' ');
    text.split('\n').forEach((line, n) => {
      if (/^\t/.test(line)) { if (rule) rule.recipes.push({ text: line.slice(1), line: n + 1 }); return; }
      const clean = line.replace(/#.*/, '');
      if (!clean.trim()) return;
      let m = /^\s*([A-Za-z_][\w.]*)\s*([:?+]?=)\s*(.*)$/.exec(clean);
      if (m) { if (m[2] === '+=') mvars[m[1]] = ((mvars[m[1]] || '') + ' ' + m[3]).trim(); else if (m[2] !== '?=' || !(m[1] in mvars)) mvars[m[1]] = m[3].trim(); rule = null; return; }
      m = /^([^:=]+):(?!=)(.*)$/.exec(clean);
      if (m) { rule = { targets: m[1].trim().split(/\s+/), deps: m[2].trim().split(/\s+/).filter(Boolean), recipes: [] }; rules.push(rule); }
    });
    const expand = (s, auto) => s.replace(/\$[({]([^)}]+)[)}]|\$([@<^])/g, (mm, name, a) => {
      if (a) return auto[a] || '';
      const sub = /^(\w+):(\.\w+)=(\.\w+)$/.exec(name);
      if (sub) return expand(mvars[sub[1]] || '', auto).split(/\s+/).map((w) => w.replace(new RegExp(sub[2].replace('.', '\\.') + '$'), sub[3])).join(' ');
      return expand(mvars[name] != null ? mvars[name] : varValue(name), auto);
    });
    const ruleFor = (t) => rules.find((r) => r.targets.includes(t) && !t.startsWith('.'));
    const phony = new Set(rules.filter((r) => r.targets.includes('.PHONY')).flatMap((r) => r.deps));
    const goals = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-f');
    const goal = goals.length ? goals : [(rules.find((r) => !r.targets[0].startsWith('.')) || { targets: [] }).targets[0]];
    if (!goal[0]) { writeln('make: *** No targets.  Stop.', 'error'); return 2; }
    const done = new Set();
    let ran = false;
    async function buildTarget(t, top) {
      if (done.has(t)) return 0;
      done.add(t);
      const r = ruleFor(t);
      if (!r) {
        if (SC.fs.exists(resolve(t))) return 0;
        writeln('make: *** No rule to make target \'' + t + '\'' + (top ? '' : ', needed by something') + '.  Stop.', 'error');
        return 2;
      }
      const deps = expand(r.deps.join(' '), {}).split(/\s+/).filter(Boolean);
      for (const d of deps) { const s = await buildTarget(d, false); if (s) return s; }
      const target = SC.fs.get(resolve(t));
      const fresh = target && !phony.has(t) && deps.every((d) => { const n = SC.fs.get(resolve(d)); return n && (n.mtime || 0) <= (target.mtime || 0); });
      if (fresh || !r.recipes.length) { if (top && fresh) io.out('make: \'' + t + '\' is up to date.\n'); return 0; }
      for (const rec of r.recipes) {
        let cmdText = expand(rec.text, { '@': t, '<': deps[0] || '', '^': deps.join(' ') }).trim();
        const silent = cmdText.startsWith('@');
        const ignore = cmdText.startsWith('-');
        cmdText = cmdText.replace(/^[@-]+/, '');
        if (!silent) io.out(cmdText + '\n');
        ran = true;
        const status = await runLine(cmdText, (io.depth || 0) + 1);
        if (status && !ignore) { writeln('make: *** [' + fileArg + ':' + rec.line + ': ' + t + '] Error ' + status, 'error'); return 2; }
      }
      return 0;
    }
    for (const g of goal) { const s = await buildTarget(g, true); if (s) return s; }
    if (!ran && goal.every((g) => phony.has(g) || !ruleFor(g) || !ruleFor(g).recipes.length)) io.out('make: Nothing to be done for \'' + goal[0] + '\'.\n');
    return 0;
  }

  /* ---------- curl, wget ---------- */
  async function fetchCmd(args, io, cmd) {
    const lower = cmd.toLowerCase();
    const url = args.find((a) => /^https?:\/\//i.test(a)) || (args.find((a) => !a.startsWith('-')) || '');
    if (!url) return fail(cmd, 'Give a URL, for example: ' + cmd + ' https://example.com');
    let outFile = null;
    const oi = args.findIndex((a) => a === '-o' || a === '-O' || /^-outfile$/i.test(a));
    if (oi !== -1 && args[oi + 1] && !/^https?:/.test(args[oi + 1])) outFile = args[oi + 1];
    if (lower === 'wget' && !outFile) outFile = url.split('?')[0].split('/').filter(Boolean).pop() || 'index.html';
    if (lower === 'curl' && args.includes('-O')) outFile = url.split('?')[0].split('/').filter(Boolean).pop() || 'index.html';
    if (lower === 'wget') io.out('--' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '--  ' + url + '\nResolving ' + url.split('/')[2] + '... connected.\nHTTP request sent, awaiting response... ');
    let res;
    let body;
    try {
      res = await fetch(/^https?:/i.test(url) ? url : 'https://' + url);
      body = await res.text();
    } catch (err) {
      if (lower === 'wget') io.out('failed.\n');
      writeln(lower === 'curl' ? 'curl: (7) Failed to connect to ' + url.split('/')[2] + ': the site does not allow requests from a browser page (CORS), or you are offline.' : cmd + ': unable to reach ' + url + ' from the browser (the site may block cross-site requests).', 'error');
      return false;
    }
    if (lower === 'wget') io.out(res.status + ' ' + (res.statusText || 'OK') + '\nLength: ' + body.length + '\nSaving to: \'' + outFile + '\'\n\n' + outFile + '  100%[===================>]  ' + human(body.length) + '\n\n');
    if (/^invoke-webrequest$|^iwr$/.test(lower) && !outFile) { io.out('\nStatusCode        : ' + res.status + '\nStatusDescription : ' + (res.statusText || 'OK') + '\nContent           : ' + body.slice(0, 300).replace(/\n/g, ' ') + '...\n\n'); return res.ok; }
    if (outFile) SC.fs.createFile(resolve(outFile), body, { overwrite: true });
    else io.out(body.endsWith('\n') ? body : body + '\n');
    return res.ok;
  }

  /* ---------- pacman ---------- */
  const BASE_PKGS = {
    gcc: { names: ['mingw-w64-ucrt-x86_64-gcc', 'mingw-w64-x86_64-gcc', 'gcc'], version: '15.2.0-8', size: 182.4, desc: 'GNU Compiler Collection (C,C++,OpenMP) for MinGW-w64 (compiles on godbolt.org; graphics code in the browser)' },
    make: { names: ['make', 'mingw-w64-ucrt-x86_64-make', 'mingw-w64-x86_64-make'], version: '4.4.1-2', size: 1.6, desc: 'GNU make utility to maintain groups of programs' },
    python: { names: ['mingw-w64-ucrt-x86_64-python', 'mingw-w64-x86_64-python', 'python'], version: '3.12.1-1', size: 98.3, desc: 'A high-level scripting language (runs with Pyodide in Smoki\'s Code)' },
    pip: { names: ['mingw-w64-ucrt-x86_64-python-pip', 'mingw-w64-x86_64-python-pip', 'python-pip'], version: '24.0-1', size: 11.9, desc: 'The PyPA recommended tool for installing Python packages' },
    lua: { names: ['mingw-w64-ucrt-x86_64-lua', 'mingw-w64-x86_64-lua', 'lua'], version: '5.4.7-1', size: 0.9, desc: 'A powerful light-weight programming language (runs with Fengari)' },
    ruby: { names: ['mingw-w64-ucrt-x86_64-ruby', 'mingw-w64-x86_64-ruby', 'ruby'], version: '3.3.3-1', size: 44.1, desc: 'An object-oriented language for quick and easy programming (runs with ruby.wasm)' },
    sqlite: { names: ['mingw-w64-ucrt-x86_64-sqlite3', 'mingw-w64-x86_64-sqlite3', 'sqlite'], version: '3.46.1-1', size: 9.1, desc: 'A C library that implements an SQL database engine (runs with sql.js)' },
    rust: { names: ['mingw-w64-ucrt-x86_64-rust', 'mingw-w64-x86_64-rust', 'rust'], version: '1.90.0-1', size: 512.0, desc: 'Systems programming language (compiles on godbolt.org)' },
    go: { names: ['mingw-w64-ucrt-x86_64-go', 'mingw-w64-x86_64-go', 'go'], version: '1.26.0-1', size: 230.2, desc: 'Go programming language compiler (compiles on godbolt.org)' },
    nodejs: { names: ['mingw-w64-ucrt-x86_64-nodejs', 'mingw-w64-x86_64-nodejs', 'nodejs'], version: '22.11.0-1', size: 72.8, desc: 'Evented I/O for V8 javascript (JavaScript runs in the browser)' },
    curl: { names: ['curl', 'mingw-w64-ucrt-x86_64-curl'], version: '8.11.0-1', size: 1.8, desc: 'Command line tool and library for transferring data with URLs' },
    wget: { names: ['wget'], version: '1.25.0-1', size: 3.4, desc: 'Network utility to retrieve files from the web' },
    diffutils: { names: ['diffutils'], version: '3.10-1', size: 1.3, desc: 'Utility programs used for creating patch files' },
  };
  const GROUPS = { toolchain: ['gcc', 'make'], 'base-devel': ['make', 'diffutils'] };
  const UNAVAILABLE = /^(git|vim|nano|gdb|cmake|ninja|clang|qt|gtk|sdl|boost|openssh|tmux|zsh|htop|neovim)/;

  const prefixOf = (name) => (/^(mingw-w64-(?:ucrt-|clang-)?x86_64-)/.exec(name) || [, 'mingw-w64-ucrt-x86_64-'])[1];
  const repoOf = (name) => (/^mingw-w64-ucrt/.test(name) ? 'ucrt64' : /^mingw-w64-clang/.test(name) ? 'clang64' : /^mingw-w64-x86_64/.test(name) ? 'mingw64' : 'msys');
  function allPkgs() {
    const out = [];
    for (const [id, p] of Object.entries(BASE_PKGS)) out.push({ id, base: true, p });
    if (SC.msysPackages) for (const [id, p] of Object.entries(SC.msysPackages.PACKAGES)) out.push({ id, base: false, p });
    return out;
  }
  const isInst = (e) => e.base || (SC.msysPackages && SC.msysPackages.isInstalled(e.id));
  function lookup(name) {
    const n = name.toLowerCase();
    const e = allPkgs().find((x) => x.p.names.includes(n));
    if (!e) return null;
    const shown = /^mingw-w64-/.test(n) ? n : e.p.names[0];
    return Object.assign({}, e, { shown });
  }
  const nameIn = (e, prefix) => { const n = e.p.names[0]; return /^mingw-w64-/.test(n) ? prefix + n.replace(/^mingw-w64-(?:ucrt-|clang-)?x86_64-/, '') : n; };

  async function pacman(args, io) {
    if (isPS()) {
      writeln('pacman : The term \'pacman\' is not recognized as a name of a cmdlet, function, script file, or operable program. (It is an MSYS2 command: switch the terminal profile to MSYS2.)', 'error');
      return 1;
    }
    const op = args.find((a) => /^-[A-Za-z]+$/.test(a)) || (args.find((a) => /^--(sync|query|remove|help|version)$/.test(a)) || '');
    const noconfirm = args.includes('--noconfirm');
    const needed = args.includes('--needed');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!op || /h|help/.test(op)) {
      io.out('usage:  pacman <operation> [...]\noperations:\n    pacman {-h --help}\n    pacman {-V --version}\n    pacman {-Q --query}    [options] [package(s)]\n    pacman {-R --remove}   [options] <package(s)>\n    pacman {-S --sync}     [options] [package(s)]\n\nuse \'pacman {-h --help}\' with an operation for available options\n');
      return 0;
    }
    if (/V|version/.test(op)) { io.out('\n .--.                  Pacman v6.1.0 - libalpm v14.0.0\n/ _.-\' .-.  .-.  .-.   Copyright (C) 2006-2024 Pacman Development Team\n\\  \'-. \'-\'  \'-\'  \'-\'   (browser version in Smoki\'s Code)\n \'--\'\n\n'); return 0; }
    if (/^-S|--sync/.test(op)) {
      if (/y/.test(op)) {
        io.out(':: Synchronizing package databases...\n');
        for (const db of ['clangarm64', 'mingw32', 'mingw64', 'ucrt64', 'clang64', 'msys']) { io.out(' ' + db.padEnd(14) + ' is up to date\n'); await sleep(60); }
      }
      if (/s/.test(op)) return pacSearch(targets, io, false);
      if (/i/.test(op)) return pacInfo(targets, io, false);
      if (/u/.test(op) && !targets.length) { io.out(':: Starting core system upgrade...\n there is nothing to do\n:: Starting full system upgrade...\n there is nothing to do\n'); return 0; }
      if (!targets.length) { if (!/y|u/.test(op)) writeln('error: no targets specified (use -h for help)', 'error'); return /y|u/.test(op) ? 0 : 1; }
      return pacInstall(targets, io, { noconfirm, needed });
    }
    if (/^-Q|--query/.test(op)) {
      if (/s/.test(op)) return pacSearch(targets, io, true);
      if (/i/.test(op)) return pacInfo(targets, io, true);
      const list = allPkgs().filter(isInst);
      if (targets.length) {
        let ok = 0;
        for (const t of targets) { const e = lookup(t); if (e && isInst(e)) io.out(e.shown + ' ' + e.p.version + '\n'); else { writeln('error: package \'' + t + '\' was not found', 'error'); ok = 1; } }
        return ok;
      }
      list.forEach((e) => io.out(e.p.names[0] + ' ' + e.p.version + '\n'));
      return 0;
    }
    if (/^-R|--remove/.test(op)) return pacRemove(targets, io, { noconfirm });
    if (/^-U/.test(op)) { writeln('error: installing package files from disk is not supported in the browser version', 'error'); return 1; }
    writeln('error: invalid option \'' + op + '\'', 'error');
    return 1;
  }

  function pacSearch(terms, io, installedOnly) {
    const re = terms.length ? new RegExp(terms.join('|'), 'i') : /./;
    let n = 0;
    for (const e of allPkgs()) {
      for (const name of e.p.names.filter((x) => /^mingw-w64-(ucrt|x86_64)|^[a-z]/.test(x)).slice(0, installedOnly ? 1 : 2)) {
        if (!re.test(name + ' ' + e.p.desc)) continue;
        if (installedOnly && !isInst(e)) continue;
        n++;
        io.write((installedOnly ? 'local' : repoOf(name)) + '/', 'host');
        io.write(name, 'cmd');
        io.out(' ' + e.p.version);
        if (!installedOnly && isInst(e)) io.write(' [installed]', 'exe');
        io.out('\n    ' + e.p.desc + '\n');
      }
    }
    return n ? 0 : 1;
  }

  function pacInfo(targets, io, local) {
    let status = 0;
    for (const t of targets) {
      const e = lookup(t);
      if (!e || (local && !isInst(e))) { writeln('error: package \'' + t + '\' was not found', 'error'); status = 1; continue; }
      const deps = e.base ? [] : e.p.deps.map((d) => nameIn({ p: SC.msysPackages.PACKAGES[d] }, prefixOf(e.shown)));
      const rows = [['Repository', local ? null : repoOf(e.shown)], ['Name', e.shown], ['Version', e.p.version], ['Description', e.p.desc], ['Architecture', 'any'],
        ['URL', 'https://packages.msys2.org/base/' + e.shown.replace(/^mingw-w64-(?:ucrt-|clang-)?x86_64-/, 'mingw-w64-')], ['Licenses', 'spdx:MIT'], ['Depends On', deps.length ? deps.join('  ') : 'None'],
        ['Installed Size', e.p.size.toFixed(2) + ' MiB'], ['Packager', 'CI (msys2/msys2-autobuild)'], ['Validated By', 'SHA-256 Sum  Signature']];
      rows.filter((r) => r[1] != null).forEach(([k, v]) => io.out(k.padEnd(16) + ': ' + v + '\n'));
      io.out('\n');
    }
    return status;
  }

  async function pacInstall(targets, io, { noconfirm, needed }) {
    const chosen = [];
    for (const t of targets) {
      const group = /^(?:mingw-w64-(?:ucrt-|clang-)?x86_64-)?(toolchain|base-devel)$/.exec(t);
      if (group) { GROUPS[group[1]].forEach((id) => chosen.push(Object.assign({ id, base: true, p: BASE_PKGS[id] }, { shown: nameIn({ p: BASE_PKGS[id] }, prefixOf(t)) }))); continue; }
      const e = lookup(t);
      if (!e) {
        const bare = t.replace(/^mingw-w64-(?:ucrt-|clang-)?x86_64-/, '');
        writeln('error: target not found: ' + t + (UNAVAILABLE.test(bare) ? ' (this package can\'t run in the browser version of MSYS2)' : ''), 'error');
        return 1;
      }
      chosen.push(e);
    }
    // Dependencies of graphics packages
    const list = [];
    const add = (e) => { if (!list.some((x) => x.id === e.id)) list.push(e); };
    for (const e of chosen) {
      if (!e.base && SC.msysPackages) {
        for (const d of SC.msysPackages.withDeps([e.id])) {
          if (d === e.id) continue;
          const dep = { id: d, base: false, p: SC.msysPackages.PACKAGES[d] };
          if (!isInst(dep)) add(Object.assign(dep, { shown: nameIn(dep, prefixOf(e.shown)) }));
        }
      }
      add(e);
    }
    const todo = [];
    for (const e of list) {
      if (isInst(e) && chosen.includes(e)) {
        writeln('warning: ' + e.shown + '-' + e.p.version + ' is up to date -- ' + (needed ? 'skipping' : 'reinstalling'), 'warn');
        if (needed) continue;
      }
      todo.push(e);
    }
    if (!todo.length) { io.out(' there is nothing to do\n'); return 0; }
    io.out('resolving dependencies...\n');
    await sleep(250);
    io.out('looking for conflicting packages...\n\n');
    await sleep(150);
    io.out('Packages (' + todo.length + ') ' + todo.map((e) => e.shown + '-' + e.p.version).join('  ') + '\n\n');
    const total = todo.reduce((n, e) => n + e.p.size, 0);
    io.out('Total Download Size:   ' + (total * 0.28).toFixed(2).padStart(8) + ' MiB\nTotal Installed Size:  ' + total.toFixed(2).padStart(8) + ' MiB\n\n');
    if (!noconfirm) {
      const answer = await io.ask(':: Proceed with installation? [Y/n] ');
      if (answer.trim() && !/^y/i.test(answer.trim())) { io.out('\n'); return 1; }
    }
    io.out(':: Retrieving packages...\n');
    for (const e of todo) {
      const label = ' ' + e.shown + '-' + e.p.version + '-any';
      await fill(progress(label.slice(0, 44) + '  ' + human(Math.round(e.p.size * 0.28 * 1048576)).padStart(6) + '  ' + (2 + Math.random() * 8).toFixed(1) + ' MiB/s 00:00', 66), 260);
    }
    const n = todo.length;
    for (const step of ['checking keys in keyring', 'checking package integrity', 'loading package files', 'checking for file conflicts', 'checking available disk space']) {
      await fill(progress('(' + n + '/' + n + ') ' + step), 140);
    }
    io.out(':: Processing package changes...\n');
    for (let i = 0; i < n; i++) await fill(progress('(' + (i + 1) + '/' + n + ') ' + (isInst(todo[i]) ? 'reinstalling ' : 'installing ') + todo[i].shown), 180);
    const gfx = todo.filter((e) => !e.base).map((e) => e.id);
    if (gfx.length) SC.msysPackages.install(gfx);
    const hint = gfx.includes('raylib') ? 'gcc main.c -o main -lraylib -lopengl32 -lgdi32 -lwinmm'
      : gfx.includes('freeglut') ? 'gcc main.c -o main -lfreeglut -lopengl32 -lglu32'
        : gfx.includes('glfw') ? 'gcc main.c -o main -lglfw3 -lglew32 -lopengl32' : '';
    if (hint) writeln('Build with: ' + hint + '   (or press F5 in the editor)', 'info');
    return 0;
  }

  async function pacRemove(targets, io, { noconfirm }) {
    if (!targets.length) { writeln('error: no targets specified (use -h for help)', 'error'); return 1; }
    const list = [];
    for (const t of targets) {
      const e = lookup(t);
      if (!e || !isInst(e)) { writeln('error: target not found: ' + t, 'error'); return 1; }
      if (e.base) { writeln('error: ' + e.shown + ' is part of the browser toolchain and can\'t be removed', 'error'); return 1; }
      list.push(e);
    }
    io.out('checking dependencies...\n\nPackages (' + list.length + ') ' + list.map((e) => e.shown + '-' + e.p.version).join('  ') + '\n\nTotal Removed Size:  ' + list.reduce((n, e) => n + e.p.size, 0).toFixed(2) + ' MiB\n\n');
    if (!noconfirm) {
      const answer = await io.ask(':: Do you want to remove these packages? [Y/n] ');
      if (answer.trim() && !/^y/i.test(answer.trim())) { io.out('\n'); return 1; }
    }
    io.out(':: Processing package changes...\n');
    for (let i = 0; i < list.length; i++) await fill(progress('(' + (i + 1) + '/' + list.length + ') removing ' + list[i].shown), 150);
    SC.msysPackages.remove(list.map((e) => e.id));
    return 0;
  }

  /** Simple process list for ps / Get-Process. */
  function ps(args, io) {
    const running = SC.runner.isRunning() ? [(SC.runner.current() || {}).name || 'program'] : [];
    if (isPS()) {
      io.out('\nHandles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName\n-------  ------    -----      -----     ------     --  -- -----------\n');
      [['powershell', 1337]].concat(running.map((r) => [nameOf(r).replace(/\.\w+$/, ''), 2001])).forEach(([n, id]) => io.out('    512      34    61236      72540       0.42   ' + String(id).padStart(4) + '   1 ' + n + '\n'));
      io.out('\n');
      return true;
    }
    io.out('      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND\n');
    io.out('     1337       1    1337      13372  pty0     197609 ' + new Date().toTimeString().slice(0, 8) + ' /usr/bin/bash\n');
    running.forEach((r) => io.out('     2001    1337    2001      20012  pty0     197609 ' + new Date().toTimeString().slice(0, 8) + ' ' + r + '\n'));
    io.out('     2002    1337    2002      20022  pty0     197609 ' + new Date().toTimeString().slice(0, 8) + ' /usr/bin/ps\n');
    return true;
  }

  function measure(args, io) {
    const text = io.stdin != null ? io.stdin : inputText(args.filter((a) => !a.startsWith('-')), io, 'Measure-Object');
    if (text == null) return false;
    const lines = linesOf(text).filter((l) => l !== '' || text.trim() !== '');
    io.out('\nLines Words Characters Property\n----- ----- ---------- --------\n' + String(lines.length).padStart(5) + ' ' + String((text.match(/\S+/g) || []).length).padStart(5) + ' ' + String(text.replace(/\n/g, '').length).padStart(10) + '\n\n');
    return true;
  }

  function selectObject(args, io) {
    if (io.stdin == null) return fail('Select-Object', 'Pipe something in, for example: Get-ChildItem | Select-Object -First 3');
    const lines = linesOf(io.stdin);
    const first = args.findIndex((a) => /^-first$/i.test(a));
    const lastI = args.findIndex((a) => /^-last$/i.test(a));
    if (first !== -1) io.out(lines.slice(0, +args[first + 1] || 1).join('\n') + '\n');
    else if (lastI !== -1) io.out(lines.slice(-(+args[lastI + 1] || 1)).join('\n') + '\n');
    else io.out(io.stdin);
    return true;
  }

  async function sleepCmd(args) {
    let secs = parseFloat(args.find((a) => !a.startsWith('-')) || '1');
    if (args.some((a) => /^-m(illiseconds)?$/i.test(a))) secs /= 1000;
    await sleep(Math.max(0, secs) * 1000);
    return true;
  }

  async function xargs(args, io) {
    const items = (io.stdin || '').split(/\s+/).filter(Boolean);
    const cmdText = (args.length ? args.join(' ') : 'echo') + (items.length ? ' ' + items.map((w) => (/[\s"']/.test(w) ? '"' + w + '"' : w)).join(' ') : '');
    return (await runLine(cmdText, (io.depth || 0) + 1)) === 0;
  }

  async function bashCmd(args, io, cmd) {
    if (args[0] === '-c') return (await runLine(args[1] || '', (io.depth || 0) + 1)) === 0;
    const file = args.find((a) => !a.startsWith('-'));
    if (!file) { io.out(isPS() ? 'Already in PowerShell. Switch profiles with the menu in the terminal tab.\n' : 'Already in bash.\n'); return true; }
    const p = resolve(file);
    if (!SC.fs.isFile(p)) return fail(cmd, file + ': No such file or directory');
    return (await runScript(p, io.depth || 0, args.slice(args.indexOf(file) + 1))) === 0;
  }

  function exitCmd(args, io) {
    const code = parseInt(args[0] || '0', 10) || 0;
    if (io.depth > 0) { exitRequested = true; return code; }
    newTerminal();
    return code;
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
      ['cd, pwd, ls / dir, tree, find, du, df, stat, file', 'move around and look at files'],
      ['cat, head, tail, less, wc, grep, sort, uniq, cut, tr, sed, diff', 'read, search and change text (they work with pipes |)'],
      ['echo, printf, touch, mkdir, rm, cp, mv, ln, tee, chmod', 'create, change and delete files'],
      ['code / nano / vim <file>', 'open a file in the editor'],
      ['python [file | -c code], pip install/list', 'Python (no file: the Python prompt)'],
      ['node, lua, ruby, sqlite3, ts-node <file>', 'run other languages'],
      ['gcc / g++ <file> -o app, then ./app.exe', 'build C/C++ (raylib/OpenGL code builds in the browser)'],
      ['rustc, go run/build, javac + java, csc, dotnet run', 'other compilers (on godbolt.org)'],
      ['make, bash script.sh, ./script.sh, source', 'Makefiles and shell scripts'],
      ['curl, wget', 'download (only from sites that allow it)'],
      ['NAME=value, export, env, alias, $VAR, $?', 'variables and aliases'],
      ['for x in a b; do ...; done, if [ ... ]; then ...; fi', 'simple loops and conditions'],
      ['ps, id, uname, whoami, date, uptime, history, clear, exit', 'system and terminal'],
    ];
    const msys = [['pacman -S <package>, -Ss, -Q, -R, -Syu', 'install libraries such as raylib, freeglut, glfw, glew']];
    const ps = [['Get-ChildItem, Set-Location, Get-Content, Set-Content', 'PowerShell names work too'], ['New-Item, Remove-Item, Copy-Item, Move-Item, Rename-Item', ''], ['Select-String, Sort-Object, Select-Object, Measure-Object', ''], ['$name = value, $env:NAME, Get-Process, Start-Sleep', '']];
    io.out('Commands (an emulation running in your browser):\n\n');
    for (const [c, d] of shared.concat(isPS() ? ps : msys)) { io.write('  ' + c.padEnd(60), 'cmd'); io.out((d || '') + '\n'); }
    io.out('\nUse ; && || between commands, | to pipe, > and >> to save output, < to read a file.\nUp and Down go through history, Tab completes names, Ctrl+C stops a program.\n');
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
    cat, 'get-content': cat, gc: cat,
    type: (a, io, c) => { if (isPS()) return cat(a, io, c); let ok = true; for (const n of a) { if (aliases[n]) io.out(n + ' is aliased to ' + "'" + aliases[n] + "'\n"); else if (COMMANDS[n]) io.out(n + ' is /usr/bin/' + n + '\n'); else ok = fail('bash: type', n + ': not found'); } return ok; },
    head: (a, io, c) => headTail(a, io, c, false), tail: (a, io, c) => headTail(a, io, c, true),
    wc, grep, egrep: grep, fgrep: grep, 'select-string': grep, sls: grep, findstr: grep, find,
    sort, 'sort-object': sort, uniq, tr, cut, sed, tee, 'tee-object': tee,
    rev: (a, io) => { const t = inputText(a, io, 'rev'); if (t == null) return false; io.out(linesOf(t).map((l) => l.split('').reverse().join('')).join('\n') + '\n'); return true; },
    seq: (a, io) => { const n = a.map(Number); const [from, step, to] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n; for (let x = from; step > 0 ? x <= to : x >= to; x += step) io.out(x + '\n'); return true; },
    less: cat, more: cat, nl: (a, io) => { const t = inputText(a, io, 'nl'); if (t == null) return false; io.out(linesOf(t).map((l, i) => String(i + 1).padStart(6) + '\t' + l).join('\n') + '\n'); return true; },
    diff, cmp: diff, 'compare-object': diff, tree, du, stat, 'get-item': stat, gi: stat, file: fileType,
    basename: (a, io) => { const p = (a.find((x) => !x.startsWith('-')) || '').replace(/[\\/]+$/, ''); let bn = p.split(/[\\/]/).pop(); if (a[1] && bn.endsWith(a[1])) bn = bn.slice(0, -a[1].length); io.out(bn + '\n'); return true; },
    dirname: (a, io) => { const p = (a[0] || '').replace(/[\\/]+$/, ''); const parts = p.split(/[\\/]/); io.out((parts.length > 1 ? parts.slice(0, -1).join('/') || '/' : '.') + '\n'); return true; },
    realpath: (a, io) => { io.out(displayPath(resolve(a.find((x) => !x.startsWith('-')) || '.')) + '\n'); return true; }, readlink: (a, io) => COMMANDS.realpath(a, io), 'resolve-path': (a, io) => COMMANDS.realpath(a, io),
    // Changing files
    echo, 'write-output': echo, 'write-host': echo, write: echo, printf,
    'out-file': (a, io) => { const f = a.find((x) => !x.startsWith('-')); if (!f) return fail('Out-File', 'Give a file name.'); const p = resolve(f); const before = a.some((x) => /^-append$/i.test(x)) && SC.fs.isFile(p) ? SC.fs.readFile(p) : ''; SC.fs.createFile(p, before + (io.stdin || ''), { overwrite: true }); return true; },
    chmod: (a) => { for (const f of a.filter((x) => !/^[-+]|^\d+$|^[ugoa]*[+=-][rwx]+$/.test(x))) if (!SC.fs.exists(resolve(f))) return fail('chmod', 'cannot access \'' + f + '\': No such file or directory'); return true; },
    ln: (a, io, c) => cpmv(a.filter((x) => !x.startsWith('-')), io, c, false),
    nano: code, vim: code, vi: code, edit: code,
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
    exit: exitCmd, logout: exitCmd,
    true: () => 0, false: () => 1, ':': () => 0,
    test: (a) => (testExpr(a) ? 0 : 1), '[': (a) => (testExpr(a) ? 0 : 1), '[[': (a) => (testExpr(a.filter((x) => x !== ']]')) ? 0 : 1),
    sleep: sleepCmd, 'start-sleep': sleepCmd,
    env: (a, io) => listVars(io, false), printenv: (a, io) => { if (a[0]) { io.out(varValue(a[0]) + '\n'); return a[0] in vars; } return listVars(io, false); },
    set: (a, io) => (a.length ? true : listVars(io, false)), 'get-variable': (a, io) => listVars(io, true), gv: (a, io) => listVars(io, true),
    export: (a, io) => { if (!a.length) Object.keys(vars).sort().forEach((k) => io.out('declare -x ' + k + '="' + vars[k] + '"\n')); return true; },
    unset: (a) => { a.forEach((k) => { delete vars[k]; const saved = SC.storage.get('terminal.vars', {}); delete saved[k]; SC.storage.set('terminal.vars', saved); }); return true; }, 'remove-variable': (a) => COMMANDS.unset(a),
    alias, 'get-alias': alias, gal: alias, unalias: (a) => { a.forEach((k) => { delete aliases[k]; const saved = SC.storage.get('terminal.aliases', {}); delete saved[k]; SC.storage.set('terminal.aliases', saved); }); return true; },
    source: (a, io) => bashCmd(a, io, 'source'), '.': (a, io) => bashCmd(a, io, '.'), bash: bashCmd, sh: bashCmd, powershell: bashCmd, pwsh: bashCmd,
    make, 'mingw32-make': make, xargs, 'foreach-object': xargs,
    curl: fetchCmd, wget: fetchCmd, 'invoke-webrequest': fetchCmd, iwr: fetchCmd,
    ps, 'get-process': ps, gps: ps, kill: (a) => fail('kill', '(' + (a[a.length - 1] || '') + ') - No such process'), 'stop-process': (a) => COMMANDS.kill(a),
    id: (a, io) => { io.out('uid=197609(smoki) gid=197121(None) groups=197121(None),545(Users)\n'); return true; },
    uptime: (a, io) => { const m = Math.round(performance.now() / 60000); io.out(' ' + new Date().toTimeString().slice(0, 8) + ' up ' + m + ' min,  1 user,  load average: 0.00, 0.00, 0.00\n'); return true; },
    free: (a, io) => { io.out('               total        used        free      shared  buff/cache   available\nMem:        16653532     6123456    10530076           0           0    10530076\nSwap:        2490368       12345     2478023\n'); return true; },
    nproc: (a, io) => { io.out((navigator.hardwareConcurrency || 4) + '\n'); return true; }, arch: (a, io) => { io.out('x86_64\n'); return true; },
    df: (a, io) => { const h = a.includes('-h'); io.out('Filesystem     ' + (h ? 'Size  Used Avail' : '1K-blocks    Used Available') + ' Use% Mounted on\nC:/workspace   ' + (h ? ' 5.0M  ' + human(sizeOf('')).padStart(4) + '  4.9M' : '     5120 ' + String(Math.ceil(sizeOf('') / 1024)).padStart(7) + '      5000') + '   1% /c/workspace\n'); return true; },
    'measure-object': measure, measure, 'select-object': selectObject, select: selectObject,
    'write-error': (a) => { writeln('Write-Error: ' + a.join(' '), 'error'); return 1; },
    whoami: (a, io) => { io.out(isPS() ? 'smoki-pc\\smoki\n' : 'smoki\n'); return true; },
    hostname: (a, io) => { io.out('SMOKI-PC\n'); return true; },
    date: (a, io) => { io.out(new Date().toString() + '\n'); return true; },
    'get-date': (a, io) => { io.out('\n' + new Date().toLocaleString() + '\n\n'); return true; },
    uname: (a, io) => { io.out(a.includes('-a') ? 'MINGW64_NT-10.0 SMOKI-PC 3.5.4 x86_64 Msys (Smoki\'s Code emulation)\n' : 'MINGW64_NT-10.0\n'); return true; },
    which: (a, io) => { let ok = true; for (const c of a) { if (COMMANDS[c.toLowerCase()]) io.out('/usr/bin/' + c + '\n'); else { ok = fail('which', 'no ' + c + ' in (/mingw64/bin:/usr/bin)'); } } return ok; },
    '$psversiontable': (a, io) => { io.out('\nName                           Value\n----                           -----\nPSVersion                      5.1 (Smoki\'s Code emulation)\nPSEdition                      Desktop\n\n'); return true; },
    pacman,
    winget: (a, io) => { if (!isPS()) { writeln('bash: winget: command not found', 'error'); return 127; } io.out('winget can\'t install programs in the browser version. Use the MSYS2 profile and pacman for libraries such as raylib and freeglut, and pip for Python packages.\n'); return 1; },
    apt: () => { writeln('bash: apt: command not found (MSYS2 uses pacman, for example: pacman -S mingw-w64-ucrt-x86_64-raylib)', 'error'); return 127; }, 'apt-get': () => COMMANDS.apt(),
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
    if (e.key === 'Enter') { e.preventDefault(); if (!busy || asking) submit(input.value); return; }
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
    if (asking) { echoCommand(input.value + '^C'); const resolve = asking; asking = null; resolve('n'); return; }
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
