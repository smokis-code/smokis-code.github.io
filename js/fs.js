/* ==========================================================================
   fs.js — the in-browser "virtual file system" that holds your workspace.
   Files and folders live in a tree of plain objects that is saved to
   localStorage. Paths use forward slashes: "src/app.js".

   Events (SC.fs.on('change', fn)):
     { type: 'create' | 'write' | 'delete' | 'rename' | 'reset', path, from, to }
   ========================================================================== */
(function (SC) {
  'use strict';

  const { normPath, basename, dirname, debounce } = SC.util;
  const events = SC.util.emitter();
  let root = null;
  let warnedQuota = false;

  function newFolder(name) { return { type: 'folder', name, children: {} }; }

  function persist() {
    const ok = SC.storage.set('fs', root);
    if (!ok && !warnedQuota) {
      warnedQuota = true;
      SC.notify('Browser storage is full, so recent changes only live in this tab. Export the workspace as a ZIP to keep them.', 'warn', 9000);
    }
  }
  const persistSoon = debounce(persist, 250);

  function emit(evt) {
    persistSoon();
    events.emit('change', evt);
  }

  function get(path) {
    path = normPath(path);
    if (!path) return root;
    let node = root;
    for (const part of path.split('/')) {
      if (!node || node.type !== 'folder') return null;
      node = node.children[part];
    }
    return node || null;
  }

  function validateName(name) {
    if (!name || !name.trim()) return 'A file or folder name must be provided.';
    if (/[\\/:*?"<>|]/.test(name)) return 'The name "' + name + '" contains characters that are not allowed ( \\ / : * ? " < > | ).';
    if (name === '.' || name === '..') return 'The name "' + name + '" is not valid.';
    if (name.trim() !== name) return 'Leading or trailing spaces are not allowed in file names.';
    return null;
  }

  /** Validate a full relative path ("src/app.js"). Returns an error string or null. */
  function validatePath(path) {
    const clean = normPath(path);
    if (!clean) return 'A file or folder name must be provided.';
    for (const part of clean.split('/')) {
      const err = validateName(part);
      if (err) return err;
    }
    return null;
  }

  function mkdirp(path) {
    path = normPath(path);
    let node = root;
    if (!path) return node;
    for (const part of path.split('/')) {
      let next = node.children[part];
      if (!next) {
        next = newFolder(part);
        node.children[part] = next;
      } else if (next.type !== 'folder') {
        throw new Error('"' + part + '" is a file, not a folder.');
      }
      node = next;
    }
    return node;
  }

  function createFile(path, content = '', { overwrite = false } = {}) {
    path = normPath(path);
    const err = validatePath(path);
    if (err) throw new Error(err);
    const existing = get(path);
    if (existing && !(overwrite && existing.type === 'file')) {
      throw new Error('A file or folder "' + basename(path) + '" already exists at this location.');
    }
    const dir = mkdirp(dirname(path));
    dir.children[basename(path)] = { type: 'file', name: basename(path), content: String(content), mtime: Date.now() };
    emit({ type: existing ? 'write' : 'create', path });
    return path;
  }

  function createFolder(path) {
    path = normPath(path);
    const err = validatePath(path);
    if (err) throw new Error(err);
    if (get(path)) throw new Error('A file or folder "' + basename(path) + '" already exists at this location.');
    mkdirp(path);
    emit({ type: 'create', path });
    return path;
  }

  function readFile(path) {
    const node = get(path);
    if (!node || node.type !== 'file') throw new Error('File not found: ' + path);
    return node.content;
  }

  function writeFile(path, content) {
    const node = get(path);
    if (!node) return createFile(path, content);
    if (node.type !== 'file') throw new Error('"' + path + '" is a folder.');
    node.content = String(content);
    node.mtime = Date.now();
    emit({ type: 'write', path: normPath(path) });
    return normPath(path);
  }

  function rename(from, to) {
    from = normPath(from);
    to = normPath(to);
    if (from === to) return to;
    const err = validatePath(to);
    if (err) throw new Error(err);
    const node = get(from);
    if (!node) throw new Error('Not found: ' + from);
    if (node.type === 'folder' && SC.util.isInside(to, from)) throw new Error('Cannot move a folder into itself.');
    const target = get(to);
    // Allow case-only renames of the same node
    if (target && target !== node) throw new Error('A file or folder "' + basename(to) + '" already exists at the destination.');
    const fromParent = get(dirname(from));
    delete fromParent.children[basename(from)];
    const toParent = mkdirp(dirname(to));
    node.name = basename(to);
    toParent.children[node.name] = node;
    emit({ type: 'rename', from, to, path: to });
    return to;
  }

  function remove(path) {
    path = normPath(path);
    if (!path) throw new Error('Cannot delete the workspace root.');
    const parent = get(dirname(path));
    if (!parent || !parent.children[basename(path)]) throw new Error('Not found: ' + path);
    delete parent.children[basename(path)];
    emit({ type: 'delete', path });
  }

  function copy(from, to) {
    const node = get(from);
    if (!node) throw new Error('Not found: ' + from);
    if (get(to)) throw new Error('"' + basename(to) + '" already exists.');
    const clone = JSON.parse(JSON.stringify(node));
    clone.name = basename(to);
    mkdirp(dirname(to)).children[clone.name] = clone;
    emit({ type: 'create', path: normPath(to) });
    return normPath(to);
  }

  /** Children of a folder, folders first, then natural alphabetical order. */
  function list(path = '') {
    const node = get(path);
    if (!node || node.type !== 'folder') return [];
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  /** Every file in the workspace (or under `base`): [{path, node}] */
  function allFiles(base = '') {
    const out = [];
    (function walk(node, prefix) {
      for (const child of list(prefix)) {
        const p = prefix ? prefix + '/' + child.name : child.name;
        if (child.type === 'file') out.push({ path: p, node: child });
        else walk(child, p);
      }
    })(get(base), normPath(base));
    return out;
  }

  /** Every folder path (used when exporting empty folders to ZIP). */
  function allFolders(base = '') {
    const out = [];
    (function walk(prefix) {
      for (const child of list(prefix)) {
        if (child.type !== 'folder') continue;
        const p = prefix ? prefix + '/' + child.name : child.name;
        out.push(p);
        walk(p);
      }
    })(normPath(base));
    return out;
  }

  /** "untitled.txt" -> "untitled-1.txt" when the name is taken. */
  function uniquePath(dir, name) {
    dir = normPath(dir);
    let candidate = SC.util.joinPath(dir, name);
    if (!get(candidate)) return candidate;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; i < 1000; i++) {
      candidate = SC.util.joinPath(dir, stem + '-' + i + ext);
      if (!get(candidate)) return candidate;
    }
    return SC.util.joinPath(dir, stem + '-' + Date.now() + ext);
  }

  function reset(newRoot) {
    root = newRoot || newFolder('');
    root.name = '';
    persist();
    events.emit('change', { type: 'reset', path: '' });
  }

  function load() {
    const saved = SC.storage.get('fs', null);
    if (saved && saved.type === 'folder' && saved.children) {
      root = saved;
    } else {
      root = newFolder('');
      persist();
    }
  }

  function stats() {
    const files = allFiles();
    const bytes = files.reduce((sum, f) => sum + f.node.content.length, 0);
    return { files: files.length, bytes };
  }

  SC.fs = {
    load, reset, get, exists: (p) => !!get(p), isFile: (p) => (get(p) || {}).type === 'file', isFolder: (p) => (get(p) || {}).type === 'folder',
    createFile, createFolder, readFile, writeFile, rename, remove, copy, list, allFiles, allFolders,
    uniquePath, validateName, validatePath, stats, flush: () => persistSoon.flush(),
    on: events.on,
  };
})(window.SC);
