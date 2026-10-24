/* ==========================================================================
   fileio.js — moving files between your computer and the workspace:
   open (import) files and folders, drag & drop, download, export as ZIP.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { basename, dirname, joinPath } = SC.util;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  /** Read a File as text. Returns null (with a reason) for binary or huge files. */
  async function readText(file) {
    if (file.size > MAX_FILE_BYTES) return { skip: file.name + ' is larger than 5 MB' };
    const text = await file.text();
    if (SC.util.looksBinary(text)) return { skip: file.name + ' is a binary file' };
    return { text };
  }

  /**
   * Import [{ path: 'relative/path.js', file: File }] into folder `target`.
   * Returns the list of created paths.
   */
  async function importEntries(entries, target = '') {
    const created = [];
    const skipped = [];
    let conflictChoice = null; // 'replace' | 'keep'
    for (const { path, file } of entries) {
      const res = await readText(file);
      if (res.skip) { skipped.push(res.skip); continue; }
      let dest = joinPath(target, path);
      const err = SC.fs.validatePath(dest);
      if (err) { skipped.push(path + ': ' + err); continue; }
      if (SC.fs.exists(dest)) {
        if (SC.fs.isFile(dest) && SC.fs.readFile(dest) === res.text) { created.push(dest); continue; }
        if (!conflictChoice) {
          conflictChoice = await SC.dialog.confirm({
            title: '"' + basename(dest) + '" already exists in the workspace.',
            message: 'Replace existing files with the ones you are importing, or keep both (the new copy gets a number added to its name)?',
            buttons: [
              { label: 'Replace', value: 'replace', primary: true },
              { label: 'Keep Both', value: 'keep' },
              { label: 'Cancel', value: 'cancel' },
            ],
          });
          if (conflictChoice === 'cancel') break;
        }
        if (conflictChoice === 'keep' || SC.fs.isFolder(dest)) dest = SC.fs.uniquePath(dirname(dest), basename(dest));
      }
      try {
        SC.fs.createFile(dest, res.text, { overwrite: true });
        created.push(dest);
      } catch (e) {
        skipped.push(path + ': ' + e.message);
      }
    }
    if (skipped.length) {
      SC.notify('Skipped ' + skipped.length + ' file' + (skipped.length === 1 ? '' : 's') + ': ' + skipped.slice(0, 3).join('; ') + (skipped.length > 3 ? '…' : ''), 'warn', 8000);
    }
    if (created.length) SC.statusbar.message('Imported ' + created.length + ' file' + (created.length === 1 ? '' : 's'), 2500);
    return created;
  }

  async function openFiles() {
    const files = await SC.util.pickFiles({ multiple: true });
    if (!files.length) return;
    const target = SC.explorer.targetFolder();
    const created = await importEntries(files.map((f) => ({ path: f.name, file: f })), target);
    if (created.length) {
      SC.explorer.reveal(created[0]);
      SC.tabs.open(created[0]);
    }
  }

  async function openFolder() {
    const files = await SC.util.pickFiles({ directory: true });
    if (!files.length) return;
    // webkitRelativePath looks like "my-project/src/app.js"
    const IGNORE = /(^|\/)(node_modules|\.git|__pycache__|\.venv|dist|build|\.next)(\/|$)/;
    let entries = files
      .map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))
      .filter((e) => !IGNORE.test(e.path));
    const ignored = files.length - entries.length;
    if (entries.length > 2000) {
      SC.notify('That folder has ' + entries.length + ' files. Only the first 2000 were imported.', 'warn', 8000);
      entries = entries.slice(0, 2000);
    }
    const top = entries.length ? entries[0].path.split('/')[0] : '';
    if (top && SC.fs.exists(top)) {
      // Import next to the existing folder instead of mixing files together
      const fresh = basename(SC.fs.uniquePath('', top));
      entries = entries.map((e) => ({ path: fresh + e.path.slice(top.length), file: e.file }));
    }
    const created = await importEntries(entries, '');
    if (ignored) SC.notify('Skipped ' + ignored + ' files inside node_modules, .git and build folders.', 'info', 6000);
    if (created.length) {
      SC.explorer.reveal(created[0].split('/')[0], { expand: true });
      const readme = created.find((p) => /readme\.md$/i.test(p)) || created.find((p) => /index\.html$/i.test(p)) || created[0];
      SC.tabs.open(readme);
    }
  }

  /** Read a dropped folder tree (Chrome/Edge/Firefox/Safari support webkitGetAsEntry). */
  function walkEntry(entry, prefix, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => { out.push({ path: prefix + file.name, file }); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        if (/^(node_modules|\.git)$/.test(entry.name)) { resolve(); return; }
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => reader.readEntries(async (batch) => {
          if (!batch.length) {
            for (const child of all) await walkEntry(child, prefix + entry.name + '/', out);
            resolve();
          } else {
            all.push(...batch);
            readBatch();
          }
        }, () => resolve());
        readBatch();
      } else resolve();
    });
  }

  async function importDataTransfer(dt, target = '') {
    const out = [];
    const items = Array.from(dt.items || []);
    const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (entries.length) {
      for (const entry of entries) await walkEntry(entry, '', out);
    } else {
      for (const f of Array.from(dt.files || [])) out.push({ path: f.name, file: f });
    }
    if (!out.length) return [];
    const created = await importEntries(out, target);
    if (created.length === 1) SC.tabs.open(created[0]);
    return created;
  }

  function downloadFile(path) {
    const doc = SC.tabs.docs().find((d) => d.path === path);
    const content = doc ? doc.editor.value : SC.fs.readFile(path);
    SC.util.download(basename(path), content);
  }

  function downloadActive() {
    const doc = SC.tabs.activeDoc();
    if (!doc) { SC.notify('Open a file to download it.', 'info'); return; }
    SC.util.download(doc.path ? basename(doc.path) : doc.untitledName + '.txt', doc.editor.value);
  }

  /** Export the workspace (or one folder) as a .zip, including unsaved changes. */
  function exportZip(base = '') {
    const files = SC.fs.allFiles(base);
    const folders = SC.fs.allFolders(base);
    if (!files.length && !folders.length) { SC.notify('There is nothing to export yet.', 'info'); return; }
    const strip = base ? dirname(base) : '';
    const rel = (p) => (strip ? p.slice(strip.length + 1) : p);
    const entries = [];
    folders.forEach((f) => entries.push({ path: rel(f) + '/', content: '' }));
    if (base) entries.unshift({ path: rel(base) + '/', content: '' });
    for (const { path, node } of files) {
      const doc = SC.tabs.docs().find((d) => d.path === path);
      entries.push({ path: rel(path), content: doc ? doc.editor.value : node.content });
    }
    const blob = SC.zip.makeZip(entries);
    const name = (base ? basename(base) : 'smokis-code-workspace') + '.zip';
    SC.util.download(name, blob);
    SC.statusbar.message('Exported ' + files.length + ' files to ' + name, 3000);
  }

  SC.fileio = { openFiles, openFolder, importDataTransfer, importEntries, downloadFile, downloadActive, exportZip };
})(window.SC);
