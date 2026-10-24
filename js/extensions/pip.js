/* ==========================================================================
   extensions/pip.js — pip for the in-browser Python (Pyodide).

   pip install uses Pyodide's micropip: it installs pure-Python packages
   from PyPI and Pyodide's own builds (numpy, pandas, matplotlib...).
   Installed packages are remembered and loaded before every Python run,
   from F5 or the terminal.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const KEY = 'pip.packages';

  const installed = () => SC.storage.get(KEY, []);
  const save = (list) => { SC.storage.set(KEY, Array.from(new Set(list)).sort()); SC.extensions.render(); };
  /** "requests==2.31" -> "requests" */
  const baseName = (req) => req.split(/[<>=!~[;\s]/)[0].trim().toLowerCase().replace(/_/g, '-');
  const lines = (...l) => l.join('\n');

  function python(code, sink) {
    return SC.runner.runSource({ lang: 'python', code, name: 'pip', stdin: '', sink });
  }

  function say(sink, text, kind) {
    if (sink) sink.write(text + '\n', kind); else { SC.panel.show('output'); SC.panel.log(text, kind); }
  }

  /** Run a pip command. args are the words after "pip". Resolves to true on success. */
  async function command(args, sink) {
    const sub = (args[0] || '').toLowerCase();
    const flags = args.filter((a) => a.startsWith('-'));
    let names = args.slice(1).filter((a) => !a.startsWith('-'));
    if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
      say(sink, lines(
        'Usage:',
        '  pip install <package> [<package> ...]   install from PyPI (pure-Python wheels) or Pyodide',
        '  pip install -r requirements.txt',
        '  pip uninstall <package>',
        '  pip list | pip freeze | pip show <package>',
        '',
        'Packages with C code only install if Pyodide has a build of them (numpy, pandas, matplotlib, scipy...).'));
      return true;
    }
    if (sub === '--version' || sub === '-v' || sub === 'version') {
      say(sink, 'pip (micropip in Pyodide 0.26.4, Python 3.12) - Smoki\'s Code');
      return true;
    }
    if (sub === 'install') {
      const r = flags.findIndex((f) => f === '-r' || f === '--requirement');
      if (r !== -1) {
        const file = args[args.indexOf(flags[r]) + 1];
        const path = SC.terminal ? SC.terminal.resolve(file || '') : file;
        if (!path || !SC.fs.isFile(path)) { say(sink, 'ERROR: Could not open requirements file: ' + (file || '(none)'), 'error'); return false; }
        names = names.filter((n) => n !== file).concat(SC.fs.readFile(path).split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean));
      }
      if (!names.length) { say(sink, 'ERROR: You must give at least one requirement to install (see "pip help").', 'error'); return false; }
      const ok = (await python(lines(
        'import micropip',
        '_reqs = ' + JSON.stringify(names),
        'for _r in _reqs:',
        '    print("Collecting " + _r)',
        'try:',
        '    await micropip.install(_reqs)',
        'except Exception as _e:',
        '    print("ERROR: " + str(_e).strip().splitlines()[-1])',
        '    raise SystemExit(1)',
        '_have = {k.lower().replace("_", "-"): v for k, v in micropip.list().items()}',
        '_done = []',
        'for _r in _reqs:',
        '    _n = ' + JSON.stringify(names.map(baseName)) + '[_reqs.index(_r)]',
        '    _p = _have.get(_n)',
        '    _done.append(_n + ("-" + _p.version if _p else ""))',
        'print("Successfully installed " + " ".join(_done))'), sink)).ok;
      if (ok) save(installed().concat(names.map(baseName)));
      return ok;
    }
    if (sub === 'uninstall' || sub === 'remove') {
      if (!names.length) { say(sink, 'ERROR: You must give at least one package to uninstall.', 'error'); return false; }
      const known = installed();
      const drop = names.map(baseName);
      const missing = drop.filter((n) => !known.includes(n));
      save(known.filter((n) => !drop.includes(n)));
      for (const n of drop) {
        if (missing.includes(n)) say(sink, 'WARNING: Skipping ' + n + ' as it is not installed.', 'warn');
        else say(sink, 'Found existing installation: ' + n + '\nSuccessfully uninstalled ' + n);
      }
      // Also unload it from the running Python, if it was loaded
      await python(lines('import micropip', 'try:', '    micropip.uninstall(' + JSON.stringify(drop) + ')', 'except Exception:', '    pass'), { write() {}, log() {}, isLineOpen: () => false, finish() {} });
      return !missing.length;
    }
    if (sub === 'list' || sub === 'freeze') {
      return (await python(lines(
        'import micropip',
        '_rows = sorted((p.name, p.version) for p in micropip.list().values())',
        _extraRows(),
        sub === 'freeze'
          ? 'print("\\n".join(n + "==" + v for n, v in _rows))'
          : lines(
            '_w = max([7] + [len(n) for n, v in _rows])',
            'print("Package".ljust(_w) + " Version")',
            'print("-" * _w + " -------")',
            'for _n, _v in _rows:',
            '    print(_n.ljust(_w) + " " + _v)')), sink)).ok;
    }
    if (sub === 'show') {
      if (!names.length) { say(sink, 'ERROR: Please provide a package name.', 'error'); return false; }
      return (await python(lines(
        'import importlib.metadata as _md',
        'for _name in ' + JSON.stringify(names) + ':',
        '    try:',
        '        _m = _md.metadata(_name)',
        '    except _md.PackageNotFoundError:',
        '        print("WARNING: Package(s) not found: " + _name)',
        '        continue',
        '    for _k in ("Name", "Version", "Summary", "Home-page", "Author", "License"):',
        '        print(_k + ": " + str(_m.get(_k) or ""))',
        '    print("Requires: " + ", ".join(sorted({r.split(";")[0].split(" ")[0] for r in (_md.requires(_name) or [])})))'), sink)).ok;
    }
    say(sink, 'ERROR: unknown command "' + sub + '". Try "pip help".', 'error');
    return false;
  }

  // pip list also shows packages that are remembered but not loaded yet
  function _extraRows() {
    return '_rows += [(n, "(loads on next run)") for n in ' + JSON.stringify(installed()) + ' if n not in {r[0].lower().replace("_", "-") for r in _rows}]';
  }

  /** Run a pip command where the user can see it: the terminal if it's on, else the Output tab. */
  function runVisible(args) {
    if (SC.terminal && SC.extensions.isActive('smoki.terminal')) {
      SC.panel.show('terminal');
      return SC.terminal.run('pip ' + args.map((a) => (/\s/.test(a) ? '"' + a + '"' : a)).join(' '));
    }
    return command(args);
  }

  async function promptInstall() {
    const name = await SC.palette.prompt({ placeholder: 'Package name, e.g. requests or numpy', prompt: 'Type the package to install with pip and press Enter' });
    if (name && name.trim()) return runVisible(['install'].concat(name.trim().split(/\s+/)));
  }

  function renderDetails(box) {
    const list = installed();
    const field = el('input', { class: 'text-input', id: 'pip-install-name', placeholder: 'Package, e.g. requests', 'aria-label': 'Package to install', spellcheck: 'false' });
    const install = () => { const v = field.value.trim(); if (v) { runVisible(['install'].concat(v.split(/\s+/))); field.value = ''; } };
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') install(); });
    box.append(
      el('h3', { text: 'Installed packages' }),
      list.length
        ? el('ul', { class: 'pip-list' }, list.map((n) => el('li', {},
          el('span', { text: n }),
          el('button', { class: 'btn', type: 'button', text: 'Uninstall', onClick: () => runVisible(['uninstall', n]) }))))
        : el('p', { class: 'ext-note', text: 'No packages yet. Packages that come with Pyodide (numpy, pandas...) also load by themselves when you import them.' }),
      el('div', { class: 'pip-install' }, field, el('button', { class: 'btn primary', type: 'button', text: 'Install', onClick: install })));
  }

  SC.extensions.register({
    id: 'smoki.pip',
    name: 'pip',
    version: '1.0.0',
    icon: { text: 'pip', color: '#3775a9' },
    description: 'Install Python packages with pip. They load automatically when your Python code runs.',
    features: [
      'pip install, uninstall, list, freeze, show and install -r requirements.txt in the terminal (also python -m pip).',
      'Uses micropip: pure-Python packages from PyPI and Pyodide\'s builds of numpy, pandas, matplotlib and more.',
      'Installed packages are remembered and loaded before every Python run, from F5 or the terminal.',
    ],
    commands: ['pip.install', 'pip.list'],
    activate(ctx) {
      SC.pip = { command, installed };
      ctx.onDispose(() => { delete SC.pip; });
      ctx.onDispose(SC.runner.addPythonProvider(() => ({ pip: installed() })));
      ctx.registerCommand({ id: 'pip.install', title: 'Install Python Package...', run: promptInstall });
      ctx.registerCommand({ id: 'pip.list', title: 'List Installed Python Packages', run: () => runVisible(['list']) });
    },
    renderDetails,
  });
})(window.SC);
