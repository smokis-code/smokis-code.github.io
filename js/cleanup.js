/* ==========================================================================
   cleanup.js — older versions filled a new workspace with a sample project
   ("my-project") and example programs ("examples"). The app now starts
   empty, and this removes those sample files once from workspaces that
   still have them. Only files that are exactly as they were shipped are
   removed (checked with a fingerprint), so your own edits are kept.
   ========================================================================== */
(function (SC) {
  'use strict';

  /* [path, fingerprint of the shipped content] */
  const TEMPLATES = [
    ['my-project/README.md', '2700e5b6'],
    ['my-project/README.md', '8c3f0d72'],
    ['my-project/index.html', 'bb082e11'],
    ['my-project/style.css', 'b15f51ac'],
    ['my-project/script.js', '7e11c0bb'],
    ['my-project/main.py', '4a1b4fd5'],
    ['my-project/src/utils.ts', '897920fe'],
    ['my-project/src/Main.java', 'e8a03130'],
    ['my-project/src/hello.c', '2761d52e'],
    ['my-project/data.json', '79319835'],
    ['my-project/notes.txt', '16e22123'],
    ['examples/README.md', 'd9139e95'],
    ['examples/hello.js', '8e070437'],
    ['examples/hello.ts', 'e9c463f4'],
    ['examples/hello.py', '86316b6a'],
    ['examples/hello.lua', '8c13bea9'],
    ['examples/shop.sql', 'c0924465'],
    ['examples/hello.rb', 'f13cf57b'],
    ['examples/hello.c', 'cdc77750'],
    ['examples/hello.cpp', 'd6501daf'],
    ['examples/main.rs', '96ca949d'],
    ['examples/main.go', '881972c8'],
    ['examples/Main.java', '0daed928'],
    ['examples/Program.cs', '39e29521'],
    ['examples/data.json', '499b6dca'],
  ];
  const FOLDERS = ['my-project/src', 'my-project', 'examples'];

  /** FNV-1a hash of a string, as 8 hex digits. */
  function fingerprint(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  /** Remove unchanged sample files, then any sample folders left empty. Runs once per browser. */
  function removeOldTemplates() {
    if (SC.storage.get('templatesRemoved', false)) return;
    const session = SC.storage.get('session', null);
    const unsaved = new Set(((session && session.open) || []).filter((e) => e.path && e.value != null).map((e) => e.path));
    for (const [path, hash] of TEMPLATES) {
      if (!SC.fs.isFile(path) || unsaved.has(path)) continue;
      if (fingerprint(SC.fs.readFile(path)) === hash) SC.fs.remove(path);
    }
    for (const folder of FOLDERS) {
      if (SC.fs.isFolder(folder) && SC.fs.list(folder).length === 0) SC.fs.remove(folder);
    }
    SC.storage.set('templatesRemoved', true);
  }

  SC.cleanup = { removeOldTemplates, fingerprint };
})(window.SC);
