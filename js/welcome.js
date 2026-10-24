/* ==========================================================================
   welcome.js — the page shown when no files are open.
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el, basename, dirname } = SC.util;

  function link(icon, label, command) {
    return el('li', {}, el('button', { class: 'welcome-link', type: 'button', onClick: () => SC.commands.run(command) },
      SC.icons.make(icon), el('span', { text: label })));
  }

  function render() {
    const host = document.getElementById('welcome');
    host.textContent = '';
    const recent = SC.storage.get('recentFiles', []).filter((p) => SC.fs.isFile(p)).slice(0, 8);
    const recentList = el('ul', { class: 'welcome-list' });
    if (recent.length) {
      for (const p of recent) {
        recentList.append(el('li', { class: 'recent-row' },
          el('button', { class: 'welcome-link', type: 'button', text: basename(p), onClick: () => SC.tabs.open(p) }),
          el('span', { class: 'recent-path', text: dirname(p) || 'workspace' })));
      }
    } else {
      recentList.append(el('li', { class: 'welcome-empty', text: 'Files you open will show up here.' }));
    }

    const shortcuts = [
      ['workbench.commandPalette', 'Show all commands'],
      ['workbench.quickOpen', 'Go to file'],
      ['file.newFile', 'New file'],
      ['file.save', 'Save'],
      ['edit.find', 'Find in file'],
      ['search.focus', 'Search all files'],
      ['view.toggleSidebar', 'Toggle sidebar'],
      ['run.file', 'Run or preview the file'],
      ['run.stop', 'Stop the running program'],
    ];

    host.append(el('div', { class: 'welcome-inner' },
      el('div', { class: 'welcome-hero' },
        el('h1', { html: 'Smoki<span class="apos">\'</span>s Code' }),
        el('p', { text: 'Write, color-code and run your code right in the browser.' })),
      el('section', {},
        el('h2', { text: 'Start' }),
        el('ul', { class: 'welcome-list' },
          link('new-file', 'New File...', 'file.newFile'),
          link('upload', 'Open File...', 'file.openFile'),
          link('folder-open', 'Open Folder...', 'file.openFolder'),
          link('command', 'Command Palette...', 'workbench.commandPalette'),
          link('palette', 'Choose a Color Theme...', 'theme.select'))),
      el('section', {},
        el('h2', { text: 'Recent' }),
        recentList),
      el('section', { style: { gridColumn: '1 / -1' } },
        el('h2', { text: 'Run your code' }),
        el('p', { class: 'welcome-note', text: 'Press F5 to run the open file. JavaScript, TypeScript, Python, Lua, SQL and Ruby run right in your browser. The first Python or Ruby run downloads the runtime (about 10 MB and 35 MB), so give it a moment. C, C++, Rust, Go, Java and C# are compiled and run on godbolt.org, so they need an internet connection.' }),
        el('ul', { class: 'welcome-list' },
          link('play', 'Add Example Programs', 'examples.add'))),
      el('section', { style: { gridColumn: '1 / -1' } },
        el('h2', { text: 'Keyboard shortcuts' }),
        el('div', { class: 'shortcut-grid' },
          shortcuts.flatMap(([id, label]) => [el('kbd', { text: SC.commands.keyFor(id) || '—' }), el('span', { text: label })])))));
  }

  SC.welcome = { render };
})(window.SC);
