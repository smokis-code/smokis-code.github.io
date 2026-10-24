# Smoki's Code

A code editor that runs in your browser, inspired by VS Code and JetBrains.
No install and no build step: open `index.html` and start coding.

## Features

- **Syntax highlighting** for JavaScript, TypeScript, Python, HTML, CSS/SCSS, JSON,
  Markdown, C, C++, C#, Java, Rust, Go, Shell, SQL, Lua, Ruby and YAML.
  Keywords, control flow, strings, numbers, functions, types, variables,
  properties, comments and more each get their own color.
- **11 color themes** (Smoki Dark/Light, Classic Dark, Monokai, Dracula, One Dark,
  Nord, Solarized Dark/Light, GitHub Light, High Contrast) with live preview.
  Build your own in the theme customizer and import/export themes as JSON.
- **File explorer**: create, rename (F2), delete, duplicate and drag files and
  folders around. Right-click for more.
- **Open files and folders** from your computer, or drag them onto the explorer.
- **Export**: download one file or the whole workspace as a `.zip`.
- **Command palette** (`Ctrl+Shift+P` / `F1`), go to file (`Ctrl+P`) and
  go to line (`Ctrl+G`).
- **Tabs** with unsaved-change dots, drag to reorder, breadcrumbs.
- **Find & replace** in a file (`Ctrl+F`, `Ctrl+H`) and **search across all files**
  (`Ctrl+Shift+F`), with match case, whole word and regex.
- **Editing helpers**: auto-closing brackets, quotes and HTML tags, smart indent,
  toggle comment (`Ctrl+/`), move/copy lines (`Alt+↑/↓`, `Shift+Alt+↑/↓`) and more.
- **Run code in 12 languages** with `F5` (stop with `Shift+F5`). See
  [Running code](#running-code) below.
- **Preview**: `F5` on an HTML file previews it with its linked CSS and JS;
  on a Markdown file it shows the rendered page; on a JSON file it checks
  for mistakes and points at the line and column.
- **Extensions** (`Ctrl+Shift+X`): a Terminal with PowerShell and MSYS2
  profiles, pip for Python packages, and Tkinter apps that open in the App
  tab. See [Extensions](#extensions) below.
- Everything (files, open tabs, theme, settings) is saved in your browser's
  local storage, so it is still there when you come back.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Command palette | `Ctrl+Shift+P` or `F1` |
| Go to file | `Ctrl+P` |
| Go to line | `Ctrl+G` |
| New file | `Alt+N` |
| Save / Save all | `Ctrl+S` / `Ctrl+Alt+S` |
| Close tab | `Alt+W` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Search all files | `Ctrl+Shift+F` |
| Toggle sidebar / panel | `Ctrl+B` / `Ctrl+J` |
| Color theme | `Ctrl+K` then `Ctrl+T` |
| Run file | `F5` |
| Stop running program | `Shift+F5` |
| Extensions | `Ctrl+Shift+X` |
| Focus terminal | ``Ctrl+Shift+` `` |

Browsers keep `Ctrl+N`, `Ctrl+W` and `Ctrl+T` for themselves, which is why
new file and close tab use `Alt` instead. On a Mac, `Ctrl` means `Cmd`.

## Running code

Open a file and press `F5`. Output appears in the panel at the bottom;
`Shift+F5` (or the red stop button) stops the program.

| Language | Where it runs | Runtime | First-run download |
| --- | --- | --- | --- |
| JavaScript | your browser | the browser itself | none |
| TypeScript | your browser | TypeScript 5.6 compiler | about 9 MB |
| Python | your browser | Pyodide 0.26 (Python 3.12) | about 10 MB |
| Lua | your browser | Fengari (Lua 5.3) | about 0.2 MB |
| SQL | your browser | sql.js (SQLite) | about 0.7 MB |
| Ruby | your browser | ruby.wasm (Ruby 3.3) | about 35 MB |
| C, C++, Rust, Go, Java, C# | [godbolt.org](https://godbolt.org) | newest stable compiler | none, but needs internet |

- **In-browser runtimes** are downloaded from the jsDelivr CDN the first time
  you run that language, then come from the browser cache. The first Python
  or Ruby run takes a while; later runs start quickly. They need internet
  only for that first download.
- **Compiled languages** (C, C++, Rust, Go, Java, C#) are sent to the
  Compiler Explorer API at godbolt.org, which compiles and runs them and
  sends back the output. They always need an internet connection, and your
  code is sent to godbolt.org. The compiler used is the newest stable x86
  one that can run programs; the choice is remembered for 7 days.
- **Input**: if a program reads input (`input()`, `gets`, `io.read`,
  `prompt()`, `scanf`, `cin`, `Scanner`, `Console.ReadLine`...), F5 first asks
  you to type everything it should read, one answer per line. The answers
  are shown in green in the output where the program reads them.
- **Safety**: in-browser code runs in a sandboxed frame, so it can't touch
  the editor or your files. Python, Ruby, Lua and SQL also run in a
  background worker, so an endless loop can't freeze the editor and Stop
  always works. JavaScript runs in the sandboxed page itself (so code that
  uses `document` still works); an endless JavaScript loop can make the tab
  unresponsive.
- Each run starts fresh: variables, Ruby classes and SQL tables from an
  earlier run are gone.

## Extensions

Open the Extensions view from the activity bar (or `Ctrl+Shift+X`). Each
extension can be turned off and on; click one to see what it adds and its
commands. New features are added here as extensions.

### Terminal

A terminal tab in the bottom panel with two profiles (pick one in the tab, or
run *Terminal: Select Default Profile*):

- **PowerShell**: `dir`, `Get-ChildItem`, `Set-Location`, `Get-Content`,
  `New-Item`, `Remove-Item`, `Copy-Item`, `Test-Path`... Your workspace is
  `C:\workspace`.
- **MSYS2 MINGW64** (bash): `ls -la`, `cat`, `grep`, `find`, `head`, `tail`,
  `wc`, `touch`, `rm -r`... Your workspace is `~` (`/c/workspace`).

Both profiles can run programs: `python file.py`, `python -c "..."`, plain
`python` for the Python prompt, `node`, `lua`, `ruby`, `sqlite3 < file.sql`
and `ts-node`. Compilers build on godbolt.org and leave a small program file:
`gcc hello.c -o hello` then `./hello.exe`, `g++`, `rustc`, `go build` /
`go run`, `javac Main.java` then `java Main`, `csc` and `dotnet run`.

`;` and `&&` run several commands, `>` and `>>` save output to a file, Up and
Down go through history, Tab completes names and Ctrl+C stops a program.

This is an emulation written in JavaScript: there is no real Windows or MSYS2
underneath, so only the commands listed by `help` exist, and pipes (`|`) are
not supported yet.

### pip

`pip install <package>` (also `python -m pip`), `pip uninstall`, `pip list`,
`pip freeze`, `pip show` and `pip install -r requirements.txt` in the
terminal, or from the pip extension's page in the Extensions view. It uses
Pyodide's micropip, so it installs pure-Python packages from PyPI and
Pyodide's own builds of packages such as numpy, pandas and matplotlib.
Installed packages are remembered and loaded before every Python run.

### Tkinter apps

Python programs that use `tkinter` open their windows in the **App** tab,
drawn like Windows apps: title bar, menus, buttons, entries and so on. Run
*New Tkinter App* from the command palette for a starting point.

- Supported: `Tk`, `Toplevel`, `Frame`, `LabelFrame`, `Label`, `Button`,
  `Entry`, `Text`, `Checkbutton`, `Radiobutton`, `Scale`, `Spinbox`,
  `Listbox`, `Canvas` (lines, rectangles, ovals, polygons, arcs, text, tags,
  `move`, `coords`, `tag_bind`), `Menu`, `OptionMenu`, and in `ttk` also
  `Combobox`, `Notebook`, `Progressbar`, `Treeview` and `Separator`.
- `pack`, `grid` (with weights and `sticky`) and `place` follow Tk's own
  rules; `StringVar`/`IntVar`/`DoubleVar`/`BooleanVar`, `bind()` for mouse
  and keyboard events, `after()` timers and `messagebox.showinfo/warning/error`
  work.
- Differences: `mainloop()` returns right away and the program keeps running
  until you close the window or press `Shift+F5`. Pictures (`PhotoImage`)
  and file dialogs are not available. A dialog can't wait for your click, so
  `messagebox.askyesno` and similar answer Yes right away, and
  `simpledialog.askstring` reads from the input you type when the program
  starts.

### Writing a new extension

Add a file in `js/extensions/`, load it in `index.html` after
`js/extensions.js`, and call `SC.extensions.register({ id, name, version,
description, icon, features, commands, activate(ctx), deactivate() })`.
Inside `activate`, use `ctx.registerCommand(...)` and
`ctx.addPanelTab(...)`; both are undone automatically when the extension is
turned off, and anything else goes in `ctx.onDispose(fn)`. Extensions can
also run code with `SC.runner.runSource(...)`, send Python modules or pip
packages to every Python run with `SC.runner.addPythonProvider(...)`, and
listen to running programs with `SC.runner.on(type, fn)`.

## Project layout

```
index.html              page structure; loads the CSS and JS below
css/
  base.css              colors (CSS variables), buttons, inputs, toasts
  layout.css            title bar, activity bar, sidebar, tabs, panel, status bar
  editor.css            code editor, syntax token colors, find widget, welcome page
  explorer.css          explorer tree, search view, settings view
  palette.css           command palette, menus, dialogs, theme customizer
  extensions.css        Extensions view, Terminal and App tab
js/
  util.js               shared helpers (DOM, paths, fuzzy matching, toasts)
  icons.js              SVG icons and colored file-type badges
  storage.js            safe localStorage wrapper
  settings.js           user preferences
  fs.js                 the in-browser file system
  zip.js                builds .zip files with no library
  languages.js          keyword lists for each language
  highlighter.js        turns code into colored HTML
  themes.js             built-in and custom color themes
  commands.js           command registry and keyboard shortcuts
  menu.js               context menus and the menu bar
  dialogs.js            confirm dialogs and the theme customizer
  palette.js            command palette and quick pick lists
  editor.js             the code editor (one per open file)
  find.js               find / replace widget
  tabs.js               open files, tab bar, saving
  explorer.js           file explorer
  search.js             search across files
  settings-view.js      settings sidebar
  panel.js              output and preview panel
  runner.js             runs code with F5: in-browser runtimes and godbolt.org
  extensions.js         the extension system and the Extensions view
  extensions/
    terminal.js         Terminal: PowerShell and MSYS2 profiles
    pip.js              pip for the in-browser Python
    tkinter-py.js       the browser version of Python's tkinter package
    tkinter.js          draws tkinter windows in the App tab
  fileio.js             import, download and ZIP export
  statusbar.js          status bar
  welcome.js            welcome page
  cleanup.js            removes the sample files older versions created
  actions.js            every command and its shortcut
  app.js                starts the app
```

The scripts are plain files that load in order (no modules or bundler), so the
app works when opened straight from disk (`file://`) as well as from a web server.

## How running code works

`runner.js` creates a hidden `<iframe sandbox="allow-scripts">` for each
runtime. Its page is built from the `sandboxMain()` function, turned into
text with `Function.toString()` and injected into the frame, so the frame
needs no extra files. For Python, Ruby, Lua and SQL the frame starts a Web
Worker with the same code and passes messages between it and the editor.
Output, input echoes and "done" are sent back with `postMessage`. Stopping a
program removes its frame, which also ends the worker; the next run loads
the runtime again from the browser cache.

All CDN URLs are pinned to exact versions in `RUNTIMES` at the top of
`runner.js`. The godbolt.org requests use `/api/compilers/{language}` to pick a
compiler and `/api/compiler/{id}/compile` with `executorRequest: true` to
compile and run.

## How the editor works

Each open file gets a transparent `<textarea>` stacked exactly on top of a
`<pre>` that holds a syntax-colored copy of the same text. You type in the
textarea; the colored copy underneath is redrawn on every change. Edits made by
features such as auto-indent go through the browser's `insertText` command, so
the normal `Ctrl+Z` / `Ctrl+Y` undo and redo keep working.
