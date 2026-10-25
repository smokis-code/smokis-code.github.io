/* ==========================================================================
   extensions/graphics.js — C graphics: raylib, OpenGL, freeglut, GLFW and
   GLEW programs, with their window in the App window.

   How it works: the xcc compiler (graphics/xcc.js) compiles your C code to
   WebAssembly inside a background worker, together with the browser
   versions of the libraries (graphics/clib.js). The program then runs in
   that worker: raylib draws on a canvas, OpenGL calls go to WebGL 2, and
   each finished frame is sent to the App window. Between frames the program
   pauses (WebAssembly JSPI), so keyboard and mouse input can reach it.

   The libraries are "installed" with pacman in the MSYS2 terminal, like on
   Windows: pacman -S mingw-w64-ucrt-x86_64-raylib
   ========================================================================== */
(function (SC) {
  'use strict';

  const { el } = SC.util;
  const LIB = SC.graphicsLib;
  const STORE = 'msys.packages';

  /* ======================================================================
     Worker: compiles with xcc and runs the program. Turned into text with
     Function.toString(), so it must not use anything from outside.
     ====================================================================== */
  function gfxWorker(cfg) {
    let runId = null;
    let input = [];
    let inputBytes = null;
    let inputPos = 0;
    let gfx = null;
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    function post(type, extra, transfer) {
      self.postMessage(Object.assign({ smokiSandbox: cfg.frame, type: type, run: runId }, extra || {}), transfer || []);
    }
    function out(text, kind) { if (text) post('out', { text: String(text), kind: kind || '' }); }
    function fail(text) { post('out', { text: String(text).replace(/\n?$/, '\n'), kind: 'error', fresh: true }); }
    function done(extra) { post('done', extra); }

    /* ---------- the compiler's files ---------- */
    async function unzip(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dv = new DataView(bytes.buffer);
      let eocd = bytes.length - 22;
      while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
      const count = dv.getUint16(eocd + 10, true);
      let p = dv.getUint32(eocd + 16, true);
      const files = new Map();
      for (let i = 0; i < count; i++) {
        const method = dv.getUint16(p + 10, true);
        const size = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true);
        const extraLen = dv.getUint16(p + 30, true);
        const commentLen = dv.getUint16(p + 32, true);
        const off = dv.getUint32(p + 42, true);
        const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = bytes.subarray(start, start + size);
        files.set('/' + name, method === 0 ? data.slice()
          : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
      }
      return files;
    }

    let baseFiles = null;
    let ccModule = null;
    async function boot() {
      baseFiles = await unzip(cfg.data.xcc);
      const math = dec.decode(baseFiles.get('/usr/include/math.h'));
      baseFiles.set('/usr/include/math.h', enc.encode(math + cfg.data.mathf));
      for (const [path, text] of Object.entries(cfg.data.base)) baseFiles.set(path, enc.encode(text));
      ccModule = await WebAssembly.compile(baseFiles.get('/usr/bin/cc'));
    }

    /* ---------- a small WASI (files in memory) ---------- */
    class Exit { constructor(code) { this.code = code; } }
    function wasi(opts) {
      let mem = null;
      const files = opts.files;
      const fds = new Map();
      let nextFd = 4;
      const view = () => new DataView(mem.buffer);
      const u8 = () => new Uint8Array(mem.buffer);
      const str = (ptr, len) => dec.decode(u8().subarray(ptr, ptr + len));
      const norm = (p) => {
        const parts = [];
        for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
        return '/' + parts.join('/');
      };
      const isDir = (p) => { const pre = p === '/' ? '/' : p + '/'; for (const k of files.keys()) if (k.startsWith(pre)) return true; return p === '/'; };
      const filestat = (ptr, type, size) => {
        const v = view();
        for (let i = 0; i < 64; i += 8) v.setBigUint64(ptr + i, 0n, true);
        v.setUint8(ptr + 16, type);
        v.setBigUint64(ptr + 24, 1n, true);
        v.setBigUint64(ptr + 32, BigInt(size), true);
      };
      const iov = (iovs, n) => {
        const v = view();
        const list = [];
        for (let i = 0; i < n; i++) list.push([v.getUint32(iovs + i * 8, true), v.getUint32(iovs + i * 8 + 4, true)]);
        return list;
      };
      const imports = {
        args_sizes_get(argc, size) {
          view().setUint32(argc, opts.args.length, true);
          view().setUint32(size, opts.args.reduce((n, a) => n + enc.encode(a).length + 1, 0), true);
          return 0;
        },
        args_get(argv, buf) {
          let p = buf;
          opts.args.forEach((a, i) => { view().setUint32(argv + i * 4, p, true); const b = enc.encode(a); u8().set(b, p); u8()[p + b.length] = 0; p += b.length + 1; });
          return 0;
        },
        environ_sizes_get(c, s) { view().setUint32(c, 0, true); view().setUint32(s, 0, true); return 0; },
        environ_get() { return 0; },
        fd_prestat_get(fd, ptr) { if (fd !== 3) return 8; view().setUint8(ptr, 0); view().setUint32(ptr + 4, 1, true); return 0; },
        fd_prestat_dir_name(fd, ptr) { if (fd !== 3) return 8; u8()[ptr] = 47; return 0; },
        path_open(dirfd, dirflags, pathPtr, pathLen, oflags, rb, ri, fdflags, fdOut) {
          const path = norm(str(pathPtr, pathLen));
          if (!files.has(path)) {
            if (isDir(path)) { const fd = nextFd++; fds.set(fd, { path, dir: true, pos: 0 }); view().setUint32(fdOut, fd, true); return 0; }
            if (!(oflags & 1)) return 44;
          }
          if (!files.has(path) || (oflags & 8)) files.set(path, new Uint8Array(0));
          const fd = nextFd++;
          fds.set(fd, { path, data: files.get(path), pos: (fdflags & 1) ? files.get(path).length : 0 });
          view().setUint32(fdOut, fd, true);
          return 0;
        },
        fd_read(fd, iovs, n, nread) {
          let total = 0;
          if (fd === 0) {
            for (const [ptr, len] of iov(iovs, n)) {
              const chunk = inputBytes.subarray(inputPos, inputPos + len);
              u8().set(chunk, ptr);
              inputPos += chunk.length;
              total += chunk.length;
              if (chunk.length) out(dec.decode(chunk), 'input');
              if (chunk.length < len) break;
            }
          } else {
            const f = fds.get(fd);
            if (!f || f.dir) return 8;
            const data = f.data;
            for (const [ptr, len] of iov(iovs, n)) {
              const chunk = data.subarray(f.pos, f.pos + len);
              u8().set(chunk, ptr);
              f.pos += chunk.length;
              total += chunk.length;
              if (chunk.length < len) break;
            }
          }
          view().setUint32(nread, total, true);
          return 0;
        },
        fd_write(fd, iovs, n, nwritten) {
          let total = 0;
          const parts = [];
          for (const [ptr, len] of iov(iovs, n)) { parts.push(u8().slice(ptr, ptr + len)); total += len; }
          if (fd === 1 || fd === 2) {
            const text = parts.map((b) => dec.decode(b)).join('');
            (fd === 1 ? opts.stdout : opts.stderr)(text);
          } else {
            const f = fds.get(fd);
            if (!f) return 8;
            let data = f.data;
            for (const b of parts) {
              if (f.pos + b.length > data.length) { const grown = new Uint8Array(f.pos + b.length); grown.set(data); data = grown; }
              data.set(b, f.pos);
              f.pos += b.length;
            }
            f.data = data;
            if (!f.orphan) files.set(f.path, data);
          }
          view().setUint32(nwritten, total, true);
          return 0;
        },
        fd_seek(fd, offset, whence, newOffset) {
          const f = fds.get(fd);
          if (!f) return 8;
          const size = f.dir ? 0 : f.data.length;
          const o = Number(offset);
          f.pos = whence === 0 ? o : whence === 1 ? f.pos + o : size + o;
          view().setBigUint64(newOffset, BigInt(f.pos), true);
          return 0;
        },
        fd_tell(fd, ptr) { const f = fds.get(fd); if (!f) return 8; view().setBigUint64(ptr, BigInt(f.pos), true); return 0; },
        fd_close(fd) { fds.delete(fd); return 0; },
        fd_filestat_get(fd, ptr) {
          if (fd <= 2) { filestat(ptr, 2, 0); return 0; }
          const f = fds.get(fd);
          if (!f) return 8;
          if (f.dir) filestat(ptr, 3, 0); else filestat(ptr, 4, f.data.length);
          return 0;
        },
        fd_fdstat_get(fd, ptr) {
          const v = view();
          v.setUint8(ptr, fd <= 2 ? 2 : (fds.get(fd) || {}).dir ? 3 : 4);
          v.setUint16(ptr + 2, 0, true);
          v.setBigUint64(ptr + 8, 0xffffffffffffffffn, true);
          v.setBigUint64(ptr + 16, 0xffffffffffffffffn, true);
          return 0;
        },
        path_filestat_get(dirfd, flags, pathPtr, pathLen, ptr) {
          const path = norm(str(pathPtr, pathLen));
          if (files.has(path)) { filestat(ptr, 4, files.get(path).length); return 0; }
          if (isDir(path)) { filestat(ptr, 3, 0); return 0; }
          return 44;
        },
        path_unlink_file(dirfd, pathPtr, pathLen) {
          const path = norm(str(pathPtr, pathLen));
          files.delete(path);
          for (const f of fds.values()) if (f.path === path) f.orphan = true; // open files keep their data
          return 0;
        },
        path_create_directory() { return 0; },
        proc_exit(code) { throw new Exit(code); },
        random_get(ptr, len) { crypto.getRandomValues(u8().subarray(ptr, ptr + len)); return 0; },
        clock_time_get(id, precision, ptr) {
          const ns = id === 0 ? BigInt(Date.now()) * 1000000n : BigInt(Math.round(performance.now() * 1e6));
          view().setBigUint64(ptr, ns, true);
          return 0;
        },
        clock_res_get(id, ptr) { view().setBigUint64(ptr, 1000n, true); return 0; },
        sched_yield() { return 0; },
      };
      return {
        imports: new Proxy(imports, { get: (t, k) => t[k] || (() => 52) }),
        setMemory(m) { mem = m; },
      };
    }

    /* ---------- compiling ---------- */
    async function compile(msg) {
      const files = new Map(baseFiles);
      for (const id of msg.packages || []) {
        const pkg = cfg.data.packages[id];
        if (pkg) for (const [path, text] of Object.entries(pkg.files)) files.set(path, enc.encode(text));
      }
      const name = '/home/user/' + (msg.name.split('/').pop() || 'main.c');
      files.set(name, enc.encode(msg.code));
      const sources = [];
      for (const id of msg.packages || []) { const pkg = cfg.data.packages[id]; if (pkg) sources.push(...pkg.sources); }
      let errors = '';
      const w = wasi({ files, args: ['gcc', '-Wl,--allow-undefined', '-o', '/tmp/a.wasm', name].concat(sources), stdout: (t) => { errors += t; }, stderr: (t) => { errors += t; } });
      const inst = await WebAssembly.instantiate(ccModule, { wasi_snapshot_preview1: w.imports });
      w.setMemory(inst.exports.memory);
      let code = 0;
      try { inst.exports._start(); } catch (e) { if (e instanceof Exit) code = e.code; else throw e; }
      const shown = gccStyle(errors.replace(/\/home\/user\//g, '').replace(/\/usr\/lib\/smoki\//g, ''));
      if (code !== 0 || !files.has('/tmp/a.wasm')) return { ok: false, errors: shown || 'The compiler stopped with code ' + code + '.' };
      return { ok: true, wasm: files.get('/tmp/a.wasm'), warnings: shown };
    }

    /* xcc prints "main.c(5): msg" plus the line and a ^ mark, and repeats
       errors after one mistake. Show them like gcc, once each. */
    function gccStyle(text) {
      const lines = text.replace(/\r/g, '').split('\n');
      const items = [];
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(.+?)\((\d+)\): (.*)$/);
        if (!m) { if (lines[i].trim()) items.push({ raw: lines[i] }); continue; }
        // the next lines are the code line as written and a line with the ^ mark
        const isHeader = (l) => /^(.+?)\((\d+)\): /.test(l);
        const src = lines[i + 1] != null && lines[i + 1].trim() && !isHeader(lines[i + 1]) ? lines[++i] : null;
        const mark = src != null && lines[i + 1] != null && /^\s*\^/.test(lines[i + 1]) ? lines[++i] : '';
        let msg = m[3].replace(/`([^`']*)['`]/g, "'$1'");
        const warning = /^warning: /i.test(msg);
        msg = msg.replace(/^(warning|error): /i, '');
        let fn;
        if ((fn = msg.match(/^function '(\w+)' expect (\d+) arguments?, but (\d+)$/))) {
          msg = (+fn[3] < +fn[2] ? 'too few' : 'too many') + " arguments to function '" + fn[1] + "' (it takes " + fn[2] + ', you gave ' + fn[3] + ')';
        } else if ((fn = msg.match(/^(.*) expected$/))) msg = 'expected ' + fn[1];
        items.push({ file: m[1], line: +m[2], col: mark.indexOf('^') + 1 || 1, msg, warning, src, mark });
      }
      // One mistake makes xcc report the same spot over and over: keep the
      // first two different messages on each line, and at most 10 in all.
      const seen = new Set(), perLine = {}, out = [];
      let hidden = 0, shownCount = 0;
      for (const it of items) {
        if (it.raw) { out.push(it.raw); continue; }
        const key = it.line + ':' + it.col + ':' + it.msg;
        if (seen.has(key)) continue;
        seen.add(key);
        perLine[it.line] = (perLine[it.line] || 0) + 1;
        if (perLine[it.line] > 2 || shownCount >= 10) { hidden++; continue; }
        shownCount++;
        let s = it.file + ':' + it.line + ':' + it.col + ': ' + (it.warning ? 'warning' : 'error') + ': ' + it.msg;
        if (/^expected ','/.test(it.msg)) s += "\n      note: is a comma missing between two arguments?";
        if (it.src != null) {
          const pad = String(it.line).length;
          s += '\n ' + String(it.line).padStart(pad) + ' | ' + it.src + (it.mark ? '\n ' + ' '.repeat(pad) + ' | ' + it.mark : '');
        }
        out.push(s);
      }
      if (hidden) out.push('(' + hidden + ' more error' + (hidden > 1 ? 's' : '') + ' hidden: they usually come from the first one, so fix that and build again)');
      return out.join('\n') + (out.length ? '\n' : '');
    }

    /* ---------- graphics for the program ---------- */
    function makeGfx() {
      let mem = null;
      let canvas = null;
      let ctx = null;
      let gl = null;
      let W = 800;
      let H = 450;
      let fps = 60;
      const start = performance.now();
      let last = start;
      let frameTime = 1 / 60;
      let measured = 0;
      let counted = 0;
      let countStart = start;
      const warned = new Set();
      const u8 = () => new Uint8Array(mem.buffer);
      const dv = () => new DataView(mem.buffer);
      const cstr = (p) => { if (!p) return ''; const b = u8(); let e = p; while (b[e]) e++; return dec.decode(b.subarray(p, e)); };
      const warn = (text) => { if (!warned.has(text)) { warned.add(text); out('Note: ' + text + '\n', 'warn'); } };

      // input
      const down = new Set();
      let pressed = new Set();
      let released = new Set();
      let repeated = new Set();
      let nextPressed = new Set();
      let nextReleased = new Set();
      let nextRepeated = new Set();
      let keyQueue = [];
      let charQueue = [];
      let nextKeys = [];
      let nextChars = [];
      const buttons = new Set();
      let bPressed = new Set();
      let bReleased = new Set();
      let nextBPressed = new Set();
      let nextBReleased = new Set();
      let wheel = 0;
      let nextWheel = 0;
      let mx = 0;
      let my = 0;
      let mods = 0;
      let closing = false;
      const events = [];

      function input(ev) {
        if (ev.type === 'key') {
          mods = ev.mods || 0;
          if (ev.down) {
            if (ev.repeat) nextRepeated.add(ev.key);
            else { down.add(ev.key); nextPressed.add(ev.key); nextKeys.push(ev.key); }
            if (ev.ch) { nextChars.push(ev.ch); events.push({ type: 3, key: ev.key, ch: ev.ch }); }
            events.push({ type: 1, key: ev.key, ch: ev.ch || 0 });
          } else {
            down.delete(ev.key);
            nextReleased.add(ev.key);
            events.push({ type: 2, key: ev.key, ch: ev.ch || 0 });
          }
        } else if (ev.type === 'mouse') {
          mx = ev.x;
          my = ev.y;
          mods = ev.mods || 0;
          if (ev.kind === 'down') { buttons.add(ev.button); nextBPressed.add(ev.button); events.push({ type: 4, button: ev.button }); }
          else if (ev.kind === 'up') { buttons.delete(ev.button); nextBReleased.add(ev.button); events.push({ type: 5, button: ev.button }); }
          else events.push({ type: 6, button: buttons.size ? 1 : 0, coalesce: true });
        } else if (ev.type === 'wheel') {
          nextWheel += ev.delta;
          events.push({ type: 7, wheel: ev.delta });
        } else if (ev.type === 'close') {
          closing = true;
          events.push({ type: 8 });
        } else if (ev.type === 'blur') {
          for (const k of down) nextReleased.add(k);
          down.clear();
        }
        if (events.length > 500) events.splice(0, events.length - 500);
      }

      function rollInput() {
        pressed = nextPressed; nextPressed = new Set();
        released = nextReleased; nextReleased = new Set();
        repeated = nextRepeated; nextRepeated = new Set();
        keyQueue = nextKeys; nextKeys = [];
        charQueue = nextChars; nextChars = [];
        bPressed = nextBPressed; nextBPressed = new Set();
        bReleased = nextBReleased; nextBReleased = new Set();
        wheel = nextWheel; nextWheel = 0;
      }

      function ensureCanvas() {
        if (!canvas) { canvas = new OffscreenCanvas(W, H); post('gfx', { action: 'open', w: W, h: H, title: 'Window' }); }
        return canvas;
      }
      function c2() {
        if (!ctx) {
          if (gl) { warn('This program mixes raylib drawing and OpenGL; only OpenGL is shown.'); }
          ctx = ensureCanvas().getContext('2d');
          ctx.textBaseline = 'top';
        }
        return ctx;
      }
      const rgba = (c) => 'rgba(' + (c >>> 24) + ',' + ((c >>> 16) & 255) + ',' + ((c >>> 8) & 255) + ',' + ((c & 255) / 255) + ')';
      const DEG = Math.PI / 180;
      const fillOrStroke = (c, color, thick) => {
        if (thick > 0) { c.lineWidth = thick; c.strokeStyle = rgba(color); c.stroke(); }
        else { c.fillStyle = rgba(color); c.fill(); }
      };
      const textLines = (p) => cstr(p).split('\n');
      const font = (size) => Math.max(1, size) + 'px "Segoe UI", Arial, sans-serif';
      const overlay = []; // text drawn over OpenGL frames (glutBitmapCharacter)

      async function present() {
        const cv = ensureCanvas();
        let bmp;
        if (gl && overlay.length) {
          const comp = new OffscreenCanvas(cv.width, cv.height);
          const c = comp.getContext('2d');
          c.drawImage(cv, 0, 0);
          c.textBaseline = 'alphabetic';
          for (const t of overlay) { c.font = font(t.size); c.fillStyle = t.color; c.fillText(t.text, t.x, t.y); }
          bmp = comp.transferToImageBitmap();
        } else bmp = await createImageBitmap(cv);
        overlay.length = 0;
        post('frame', { bitmap: bmp }, [bmp]);
      }

      const env = {
        sg_window(w, h, title) {
          W = w; H = h;
          if (!canvas) canvas = new OffscreenCanvas(w, h);
          else { canvas.width = w; canvas.height = h; if (ctx) ctx.textBaseline = 'top'; }
          post('gfx', { action: 'open', w, h, title: title ? cstr(title) : null });
        },
        sg_title(p) { post('gfx', { action: 'title', title: cstr(p) }); },
        sg_close() { post('gfx', { action: 'close' }); },
        sg_fps(n) { fps = n; },
        sg_time() { return (performance.now() - start) / 1000; },
        sg_frame_time() { return frameTime; },
        sg_get_fps() { return measured; },
        sg_should_close() { return closing ? 1 : 0; },
        sg_key(k) { return (down.has(k) ? 1 : 0) | (pressed.has(k) ? 2 : 0) | (released.has(k) ? 4 : 0) | (repeated.has(k) ? 8 : 0); },
        sg_next_key() { return keyQueue.length ? keyQueue.shift() : 0; },
        sg_next_char() { return charQueue.length ? charQueue.shift() : 0; },
        sg_mouse_x() { return mx; },
        sg_mouse_y() { return my; },
        sg_mouse_button(b) { return (buttons.has(b) ? 1 : 0) | (bPressed.has(b) ? 2 : 0) | (bReleased.has(b) ? 4 : 0); },
        sg_wheel() { return wheel; },
        sg_width() { return W; },
        sg_height() { return H; },
        sg_warn(p) { warn(cstr(p)); },
        sg_poll(ptr) {
          let e = events.shift();
          while (e && e.coalesce && events.length && events[0].coalesce) e = events.shift();
          if (!e) return 0;
          const v = dv();
          v.setInt32(ptr, e.type, true);
          v.setInt32(ptr + 4, e.key || 0, true);
          v.setInt32(ptr + 8, e.ch || 0, true);
          v.setInt32(ptr + 12, mods, true);
          v.setInt32(ptr + 16, mx, true);
          v.setInt32(ptr + 20, my, true);
          v.setInt32(ptr + 24, e.button || 0, true);
          v.setFloat32(ptr + 28, e.wheel || 0, true);
          return 1;
        },
        sg_frame: new WebAssembly.Suspending(async () => {
          await present();
          const target = fps > 0 ? 1000 / fps : 0;
          const wait = Math.max(0, last + target - performance.now());
          await new Promise((r) => setTimeout(r, wait));
          const now = performance.now();
          frameTime = (now - last) / 1000;
          last = now;
          counted++;
          if (now - countStart >= 1000) { measured = Math.round(counted * 1000 / (now - countStart)); counted = 0; countStart = now; }
          rollInput();
        }),

        /* raylib canvas drawing */
        c2_clear(color) { const c = c2(); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.fillStyle = rgba(color); c.fillRect(0, 0, W, H); c.restore(); },
        c2_rect(x, y, w, h, rot, ox, oy, color) {
          const c = c2();
          c.fillStyle = rgba(color);
          if (rot || ox || oy) { c.save(); c.translate(x, y); c.rotate(rot * DEG); c.fillRect(-ox, -oy, w, h); c.restore(); }
          else c.fillRect(x, y, w, h);
        },
        c2_rect_lines(x, y, w, h, t, color) { const c = c2(); c.lineWidth = t; c.strokeStyle = rgba(color); c.strokeRect(x + t / 2, y + t / 2, w - t, h - t); },
        c2_round_rect(x, y, w, h, r, t, color) { const c = c2(); c.beginPath(); c.roundRect(x, y, w, h, Math.max(0, r)); fillOrStroke(c, color, t); },
        c2_gradient(x, y, w, h, a, b, mode) {
          const c = c2();
          const g = mode === 1 ? c.createLinearGradient(x, y, x, y + h) : mode === 0 ? c.createLinearGradient(x, y, x + w, y) : c.createLinearGradient(x, y, x + w, y + h);
          g.addColorStop(0, rgba(a)); g.addColorStop(1, rgba(b));
          c.fillStyle = g; c.fillRect(x, y, w, h);
        },
        c2_circle(x, y, r, t, color) { const c = c2(); c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); fillOrStroke(c, color, t); },
        c2_circle_gradient(x, y, r, a, b) { const c = c2(); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(a)); g.addColorStop(1, rgba(b)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); },
        c2_ellipse(x, y, rx, ry, t, color) { const c = c2(); c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); fillOrStroke(c, color, t); },
        c2_sector(x, y, r1, r2, a0, a1, t, color) {
          const c = c2();
          c.beginPath();
          if (r1 > 0) { c.arc(x, y, r2, a0 * DEG, a1 * DEG, a1 < a0); c.arc(x, y, r1, a1 * DEG, a0 * DEG, a1 >= a0); c.closePath(); }
          else { c.moveTo(x, y); c.arc(x, y, r2, a0 * DEG, a1 * DEG, a1 < a0); c.closePath(); }
          fillOrStroke(c, color, t);
        },
        c2_line(x1, y1, x2, y2, t, color) { const c = c2(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = Math.max(1, t); c.strokeStyle = rgba(color); c.stroke(); },
        c2_tri(x1, y1, x2, y2, x3, y3, t, color) { const c = c2(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); fillOrStroke(c, color, t); },
        c2_poly(x, y, sides, r, rot, t, color) {
          const c = c2();
          c.beginPath();
          for (let i = 0; i <= sides; i++) { const a = (rot + i * 360 / Math.max(3, sides)) * DEG; if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
          c.closePath();
          fillOrStroke(c, color, t);
        },
        c2_text(p, x, y, size, spacing, rot, color) {
          const c = c2();
          c.save();
          c.font = font(size);
          c.letterSpacing = spacing + 'px';
          c.fillStyle = rgba(color);
          c.textBaseline = 'top';
          if (rot) { c.translate(x, y); c.rotate(rot * DEG); x = 0; y = 0; }
          textLines(p).forEach((line, i) => c.fillText(line, x, y + i * size * 1.15));
          c.restore();
        },
        c2_measure(p, size, spacing) {
          const c = c2();
          c.save();
          c.font = font(size);
          c.letterSpacing = spacing + 'px';
          const w = Math.max(0, ...textLines(p).map((l) => c.measureText(l).width));
          c.restore();
          return Math.round(w);
        },
        c2_camera(ox, oy, tx, ty, rot, zoom) { const c = c2(); c.setTransform(1, 0, 0, 1, 0, 0); c.translate(ox, oy); c.rotate(rot * DEG); c.scale(zoom, zoom); c.translate(-tx, -ty); },
        c2_reset() { if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0); },
        c2_clip(x, y, w, h) { const c = c2(); c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); },
        c2_unclip() { if (ctx) ctx.restore(); },
        c2_blend(mode) { c2().globalCompositeOperation = ['source-over', 'lighter', 'multiply', 'lighter', 'difference'][mode] || 'source-over'; },
        c2_texture(id, sx, sy, sw, sh, dx, dy, dw, dh, ox, oy, rot, tint) {
          const c = c2();
          c.save();
          c.translate(dx, dy);
          if (rot) c.rotate(rot * DEG);
          c.fillStyle = 'rgba(255,0,255,0.85)';
          c.fillRect(-ox, -oy, Math.abs(dw), Math.abs(dh));
          c.restore();
        },
      };

      /* ---------- OpenGL on WebGL 2 ---------- */
      const tables = { buffer: [null], texture: [null], vao: [null], shader: [null], program: [null], uniform: [null], fbo: [null], rbo: [null] };
      const add = (t, obj) => { tables[t].push(obj); return tables[t].length - 1; };
      const get = (t, id) => tables[t][id] || null;
      const genN = (t, make) => (n, ptr) => { for (let i = 0; i < n; i++) dv().setUint32(ptr + i * 4, add(t, make()), true); };
      const delN = (t, del) => (n, ptr) => { for (let i = 0; i < n; i++) { const id = dv().getUint32(ptr + i * 4, true); const o = get(t, id); if (o) { del(o); tables[t][id] = null; } } };
      const f32 = (ptr, n) => new Float32Array(mem.buffer.slice(ptr, ptr + n * 4));
      const i32 = (ptr, n) => new Int32Array(mem.buffer.slice(ptr, ptr + n * 4));

      // Fixed-function (OpenGL 1.x) state, drawn with a small shader
      const legacy = { mode: 0, verts: [], color: [1, 1, 1, 1], normal: [0, 0, 1], matrixMode: 0x1700, stacks: null, lighting: false, light0: true, lightPos: [0, 0, 1, 0], colorMaterial: false, material: [0.8, 0.8, 0.8, 1], pointSize: 1, raster: [0, 0], rasterColor: '#fff', polygonLine: false };
      let lp = null;
      let program = null;
      const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const mul = (a, b) => {
        const r = new Array(16);
        for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + rw] * b[c * 4 + k];
          r[c * 4 + rw] = s;
        }
        return r;
      };
      const stack = () => {
        if (!legacy.stacks) legacy.stacks = { 5888: [ident()], 5889: [ident()], 5890: [ident()] };
        return legacy.stacks[legacy.matrixMode] || legacy.stacks[5888];
      };
      const top = () => { const s = stack(); return s[s.length - 1]; };
      const setTop = (m) => { const s = stack(); s[s.length - 1] = m; };
      const multTop = (m) => setTop(mul(top(), m));
      const mvMat = () => { stack(); return legacy.stacks[5888][legacy.stacks[5888].length - 1]; };
      const projMat = () => { stack(); return legacy.stacks[5889][legacy.stacks[5889].length - 1]; };
      const ortho = (l, r, b, t, n, f) => [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
      const frustum = (l, r, b, t, n, f) => [2 * n / (r - l), 0, 0, 0, 0, 2 * n / (t - b), 0, 0, (r + l) / (r - l), (t + b) / (t - b), -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0];
      const rotate = (a, x, y, z) => {
        const l = Math.hypot(x, y, z) || 1;
        x /= l; y /= l; z /= l;
        const c = Math.cos(a * DEG);
        const s = Math.sin(a * DEG);
        const t = 1 - c;
        return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
      };

      function G() {
        if (!gl) {
          if (ctx) warn('This program mixes raylib drawing and OpenGL; only raylib is shown.');
          gl = ensureCanvas().getContext('webgl2', { preserveDrawingBuffer: true, antialias: true, depth: true, stencil: true });
          if (!gl) throw new Error('WebGL 2 is not available in this browser.');
          gl.viewport(0, 0, W, H);
        }
        return gl;
      }

      function legacyProgram() {
        if (lp) return lp;
        const g = G();
        const vs = '#version 300 es\nin vec3 aPos; in vec4 aColor; in vec3 aNormal;\nuniform mat4 uMV; uniform mat4 uP; uniform bool uLight; uniform vec3 uLightDir; uniform float uPoint;\nout vec4 vColor;\nvoid main() {\n  gl_Position = uP * uMV * vec4(aPos, 1.0);\n  gl_PointSize = uPoint;\n  vColor = aColor;\n  if (uLight) {\n    vec3 n = normalize(mat3(uMV) * aNormal);\n    float d = max(dot(n, normalize(uLightDir)), 0.0);\n    vColor = vec4(aColor.rgb * (0.25 + 0.75 * d), aColor.a);\n  }\n}';
        const fs = '#version 300 es\nprecision mediump float;\nin vec4 vColor; out vec4 o;\nvoid main() { o = vColor; }';
        const prog = g.createProgram();
        for (const [type, src] of [[g.VERTEX_SHADER, vs], [g.FRAGMENT_SHADER, fs]]) { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); g.attachShader(prog, s); }
        g.linkProgram(prog);
        const vao = g.createVertexArray();
        const buf = g.createBuffer();
        g.bindVertexArray(vao);
        g.bindBuffer(g.ARRAY_BUFFER, buf);
        const stride = 10 * 4;
        const loc = (n) => g.getAttribLocation(prog, n);
        g.enableVertexAttribArray(loc('aPos')); g.vertexAttribPointer(loc('aPos'), 3, g.FLOAT, false, stride, 0);
        g.enableVertexAttribArray(loc('aColor')); g.vertexAttribPointer(loc('aColor'), 4, g.FLOAT, false, stride, 12);
        g.enableVertexAttribArray(loc('aNormal')); g.vertexAttribPointer(loc('aNormal'), 3, g.FLOAT, false, stride, 28);
        g.bindVertexArray(null);
        lp = { prog, vao, buf, u: (n) => g.getUniformLocation(prog, n) };
        return lp;
      }

      function legacyDraw(mode, verts) {
        if (!verts.length) return;
        const g = G();
        const L = legacyProgram();
        let data = verts;
        let glMode = mode;
        if (mode === 7) { // GL_QUADS -> triangles
          data = [];
          for (let i = 0; i + 3 < verts.length; i += 4) data.push(verts[i], verts[i + 1], verts[i + 2], verts[i], verts[i + 2], verts[i + 3]);
          glMode = g.TRIANGLES;
        } else if (mode === 8) glMode = g.TRIANGLE_STRIP;
        else if (mode === 9) glMode = g.TRIANGLE_FAN;
        if (legacy.polygonLine && (glMode === g.TRIANGLES || glMode === g.TRIANGLE_FAN || glMode === g.TRIANGLE_STRIP)) glMode = g.LINE_LOOP;
        const arr = new Float32Array(data.length * 10);
        data.forEach((v, i) => arr.set(v, i * 10));
        const prevProgram = g.getParameter(g.CURRENT_PROGRAM);
        const prevVao = g.getParameter(g.VERTEX_ARRAY_BINDING);
        const prevBuf = g.getParameter(g.ARRAY_BUFFER_BINDING);
        g.useProgram(L.prog);
        g.bindVertexArray(L.vao);
        g.bindBuffer(g.ARRAY_BUFFER, L.buf);
        g.bufferData(g.ARRAY_BUFFER, arr, g.STREAM_DRAW);
        g.uniformMatrix4fv(L.u('uMV'), false, mvMat());
        g.uniformMatrix4fv(L.u('uP'), false, projMat());
        g.uniform1i(L.u('uLight'), legacy.lighting && legacy.light0 ? 1 : 0);
        g.uniform3fv(L.u('uLightDir'), legacy.lightPos.slice(0, 3));
        g.uniform1f(L.u('uPoint'), legacy.pointSize);
        g.drawArrays(glMode, 0, data.length);
        g.useProgram(prevProgram);
        g.bindVertexArray(prevVao);
        g.bindBuffer(g.ARRAY_BUFFER, prevBuf);
      }

      const vertex = (x, y, z) => {
        const col = legacy.lighting && !legacy.colorMaterial ? legacy.material : legacy.color;
        const v = [x, y, z, col[0], col[1], col[2], col[3], legacy.normal[0], legacy.normal[1], legacy.normal[2]];
        if (legacy.mode) legacy.verts.push(v);
      };
      const setColor = (r, g, b, a) => { legacy.color = [r, g, b, a]; };
      const LEGACY_CAPS = { 2896: 'lighting', 16384: 'light0', 2903: 'colorMaterial' };
      const IGNORED_CAPS = new Set([2977, 3553, 2848, 2832, 2881, 32925, 34370, 3042 + 100000, 16385, 16386, 16387]);
      const glsl = (src, type) => {
        let s = src.replace(/^\s*#version\s+(\d+)[^\n]*/m, (m, v) => (+v >= 300 ? '#version 300 es' : ''));
        const prec = 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
        if (/^\s*#version 300 es/m.test(s)) s = s.replace(/^\s*#version 300 es[^\n]*\n?/m, '#version 300 es\n' + prec);
        else s = prec + s;
        return s;
      };
      const writeLog = (text, max, lenPtr, buf) => {
        const b = enc.encode(text || '');
        const n = Math.max(0, Math.min(b.length, max - 1));
        if (buf && max > 0) { u8().set(b.subarray(0, n), buf); u8()[buf + n] = 0; }
        if (lenPtr) dv().setInt32(lenPtr, n, true);
      };

      Object.assign(env, {
        glClearColor(r, g, b, a) { G().clearColor(r, g, b, a); },
        glClear(mask) { G().clear(mask); },
        glClearDepth(d) { G().clearDepth(d); },
        glClearDepthf(d) { G().clearDepth(d); },
        glViewport(x, y, w, h) { G().viewport(x, y, w, h); },
        glScissor(x, y, w, h) { G().scissor(x, y, w, h); },
        glEnable(cap) { if (LEGACY_CAPS[cap]) legacy[LEGACY_CAPS[cap]] = true; else if (!IGNORED_CAPS.has(cap)) G().enable(cap); },
        glDisable(cap) { if (LEGACY_CAPS[cap]) legacy[LEGACY_CAPS[cap]] = false; else if (!IGNORED_CAPS.has(cap)) G().disable(cap); },
        glIsEnabled(cap) { return LEGACY_CAPS[cap] ? (legacy[LEGACY_CAPS[cap]] ? 1 : 0) : G().isEnabled(cap) ? 1 : 0; },
        glBlendFunc(s, d) { G().blendFunc(s, d); },
        glDepthFunc(f) { G().depthFunc(f); },
        glDepthMask(f) { G().depthMask(!!f); },
        glCullFace(m) { G().cullFace(m); },
        glFrontFace(m) { G().frontFace(m); },
        glPolygonMode(face, mode) { legacy.polygonLine = mode === 0x1B01; if (mode === 0x1B01) warn('glPolygonMode(GL_LINE) only works for glBegin/glEnd drawing in the browser version.'); },
        glShadeModel() {},
        glLineWidth(w) { G().lineWidth(Math.max(1, Math.min(w, 1))); },
        glPointSize(s) { legacy.pointSize = s; },
        glHint() {},
        glFlush() {},
        glFinish() {},
        glGetError() { return gl ? gl.getError() : 0; },
        glPixelStorei(p, v) { G().pixelStorei(p, v); },
        glGetIntegerv(pname, ptr) {
          const v = G().getParameter(pname);
          if (v && v.length !== undefined) Array.from(v).forEach((x, i) => dv().setInt32(ptr + i * 4, x, true));
          else dv().setInt32(ptr, typeof v === 'number' ? v : v ? 1 : 0, true);
        },
        glGetFloatv(pname, ptr) {
          const v = G().getParameter(pname);
          if (v && v.length !== undefined) Array.from(v).forEach((x, i) => dv().setFloat32(ptr + i * 4, x, true));
          else dv().setFloat32(ptr, typeof v === 'number' ? v : 0, true);
        },

        // immediate mode
        glBegin(mode) { legacy.mode = mode || 0.5; legacy.verts = []; legacy.glMode = mode; },
        glEnd() { const m = legacy.glMode; legacy.mode = 0; legacyDraw(m, legacy.verts); legacy.verts = []; },
        glVertex2f(x, y) { vertex(x, y, 0); }, glVertex2i(x, y) { vertex(x, y, 0); }, glVertex2d(x, y) { vertex(x, y, 0); },
        glVertex3f(x, y, z) { vertex(x, y, z); }, glVertex3i(x, y, z) { vertex(x, y, z); }, glVertex3d(x, y, z) { vertex(x, y, z); },
        glVertex2fv(p) { const v = f32(p, 2); vertex(v[0], v[1], 0); }, glVertex3fv(p) { const v = f32(p, 3); vertex(v[0], v[1], v[2]); },
        glColor3f(r, g, b) { setColor(r, g, b, 1); }, glColor4f(r, g, b, a) { setColor(r, g, b, a); },
        glColor3d(r, g, b) { setColor(r, g, b, 1); }, glColor4d(r, g, b, a) { setColor(r, g, b, a); },
        glColor3ub(r, g, b) { setColor(r / 255, g / 255, b / 255, 1); }, glColor4ub(r, g, b, a) { setColor(r / 255, g / 255, b / 255, a / 255); },
        glColor3i(r, g, b) { setColor(r / 2147483647, g / 2147483647, b / 2147483647, 1); },
        glColor3fv(p) { const v = f32(p, 3); setColor(v[0], v[1], v[2], 1); }, glColor4fv(p) { const v = f32(p, 4); setColor(v[0], v[1], v[2], v[3]); },
        glNormal3f(x, y, z) { legacy.normal = [x, y, z]; }, glNormal3d(x, y, z) { legacy.normal = [x, y, z]; },
        glNormal3fv(p) { legacy.normal = Array.from(f32(p, 3)); },
        glTexCoord2f() {},
        glRectf(x1, y1, x2, y2) { env.glBegin(7); vertex(x1, y1, 0); vertex(x2, y1, 0); vertex(x2, y2, 0); vertex(x1, y2, 0); env.glEnd(); },
        glRecti(x1, y1, x2, y2) { env.glRectf(x1, y1, x2, y2); },
        glMatrixMode(m) { legacy.matrixMode = m; stack(); },
        glLoadIdentity() { setTop(ident()); },
        glPushMatrix() { const s = stack(); s.push(s[s.length - 1].slice()); },
        glPopMatrix() { const s = stack(); if (s.length > 1) s.pop(); },
        glTranslatef(x, y, z) { multTop([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }, glTranslated(x, y, z) { env.glTranslatef(x, y, z); },
        glRotatef(a, x, y, z) { multTop(rotate(a, x, y, z)); }, glRotated(a, x, y, z) { multTop(rotate(a, x, y, z)); },
        glScalef(x, y, z) { multTop([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); }, glScaled(x, y, z) { env.glScalef(x, y, z); },
        glOrtho(l, r, b, t, n, f) { multTop(ortho(l, r, b, t, n, f)); },
        glFrustum(l, r, b, t, n, f) { multTop(frustum(l, r, b, t, n, f)); },
        glLoadMatrixf(p) { setTop(Array.from(f32(p, 16))); },
        glMultMatrixf(p) { multTop(Array.from(f32(p, 16))); },
        gluPerspective(fovy, aspect, n, f) { const t = n * Math.tan(fovy * DEG / 2); multTop(frustum(-t * aspect, t * aspect, -t, t, n, f)); },
        gluOrtho2D(l, r, b, t) { multTop(ortho(l, r, b, t, -1, 1)); },
        gluLookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
          let f = [cx - ex, cy - ey, cz - ez];
          const fl = Math.hypot(...f) || 1;
          f = f.map((v) => v / fl);
          let s = [f[1] * uz - f[2] * uy, f[2] * ux - f[0] * uz, f[0] * uy - f[1] * ux];
          const sl = Math.hypot(...s) || 1;
          s = s.map((v) => v / sl);
          const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
          multTop([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, 0, 0, 0, 1]);
          multTop([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -ex, -ey, -ez, 1]);
        },
        glLightfv(light, pname, p) {
          if (light === 16384 && pname === 0x1203) {
            const v = f32(p, 4);
            const m = mvMat();
            legacy.lightPos = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3], 0];
          }
        },
        glLightf() {},
        glMaterialfv(face, pname, p) { if (pname === 0x1201 || pname === 0x1602) legacy.material = Array.from(f32(p, 4)); },
        glMaterialf() {},
        glColorMaterial() {},
        glRasterPos2f(x, y) {
          const m = mul(projMat(), mvMat());
          const cx = m[0] * x + m[4] * y + m[12];
          const cy = m[1] * x + m[5] * y + m[13];
          const cw = m[3] * x + m[7] * y + m[15] || 1;
          legacy.raster = [(cx / cw + 1) / 2 * W, (1 - (cy / cw + 1) / 2) * H];
          const c = legacy.color;
          legacy.rasterColor = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + c[3] + ')';
        },
        glRasterPos2i(x, y) { env.glRasterPos2f(x, y); },
        gl_bitmap_text(p, size) {
          const text = cstr(p);
          overlay.push({ text, x: legacy.raster[0], y: legacy.raster[1], size, color: legacy.rasterColor });
          const probe = new OffscreenCanvas(1, 1).getContext('2d');
          probe.font = font(size);
          legacy.raster[0] += probe.measureText(text).width;
        },

        // textures
        glGenTextures: genN('texture', () => G().createTexture()),
        glDeleteTextures: delN('texture', (t) => G().deleteTexture(t)),
        glBindTexture(target, id) { G().bindTexture(target, get('texture', id)); },
        glTexImage2D(target, level, internal, w, h, border, format, type, ptr) {
          const bpp = (format === 0x1907 ? 3 : format === 0x1908 ? 4 : 1) * (type === 0x1406 ? 4 : 1);
          const data = ptr ? (type === 0x1406 ? new Float32Array(mem.buffer.slice(ptr, ptr + w * h * bpp)) : new Uint8Array(mem.buffer.slice(ptr, ptr + w * h * bpp))) : null;
          G().texImage2D(target, level, internal, w, h, 0, format, type, data);
        },
        glTexParameteri(t, p, v) { G().texParameteri(t, p, v === 0x2900 ? 0x812F : v); },
        glTexParameterf(t, p, v) { G().texParameterf(t, p, v); },
        glActiveTexture(t) { G().activeTexture(t); },
        glGenerateMipmap(t) { G().generateMipmap(t); },

        // buffers and vertex arrays
        glGenBuffers: genN('buffer', () => G().createBuffer()),
        glDeleteBuffers: delN('buffer', (b) => G().deleteBuffer(b)),
        glBindBuffer(target, id) { G().bindBuffer(target, get('buffer', id)); },
        glBufferData(target, size, ptr, usage) { if (ptr) G().bufferData(target, new Uint8Array(mem.buffer.slice(ptr, ptr + size)), usage); else G().bufferData(target, size, usage); },
        glBufferSubData(target, offset, size, ptr) { G().bufferSubData(target, offset, new Uint8Array(mem.buffer.slice(ptr, ptr + size))); },
        glGenVertexArrays: genN('vao', () => G().createVertexArray()),
        glDeleteVertexArrays: delN('vao', (v) => G().deleteVertexArray(v)),
        glBindVertexArray(id) { G().bindVertexArray(get('vao', id)); },
        glVertexAttribPointer(i, size, type, norm, stride, offset) {
          if (type === 0x1404 || type === 0x1405 || (type >= 0x1400 && type <= 0x1403 && !norm)) G().vertexAttribIPointer(i, size, type, stride, offset);
          else G().vertexAttribPointer(i, size, type, !!norm, stride, offset);
        },
        glEnableVertexAttribArray(i) { G().enableVertexAttribArray(i); },
        glDisableVertexAttribArray(i) { G().disableVertexAttribArray(i); },
        glVertexAttrib3f(i, x, y, z) { G().vertexAttrib3f(i, x, y, z); },
        glVertexAttrib4f(i, x, y, z, w) { G().vertexAttrib4f(i, x, y, z, w); },
        glVertexAttribDivisor(i, d) { G().vertexAttribDivisor(i, d); },
        glDrawArrays(mode, first, count) { G().drawArrays(mode === 7 ? 4 : mode, first, count); },
        glDrawArraysInstanced(mode, first, count, n) { G().drawArraysInstanced(mode, first, count, n); },
        glDrawElements(mode, count, type, offset) {
          const g = G();
          if (!g.getParameter(g.ELEMENT_ARRAY_BUFFER_BINDING)) { // indices from memory
            const size = type === 0x1405 ? 4 : type === 0x1403 ? 2 : 1;
            const tmp = g.createBuffer();
            g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, tmp);
            g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint8Array(mem.buffer.slice(offset, offset + count * size)), g.STREAM_DRAW);
            g.drawElements(mode, count, type, 0);
            g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, null);
            g.deleteBuffer(tmp);
          } else g.drawElements(mode, count, type, offset);
        },

        // shaders and programs
        glCreateShader(type) { return add('shader', G().createShader(type)); },
        glShaderSource(id, count, strings, lengths) {
          let src = '';
          for (let i = 0; i < count; i++) {
            const p = dv().getUint32(strings + i * 4, true);
            const len = lengths ? dv().getInt32(lengths + i * 4, true) : -1;
            src += len >= 0 ? dec.decode(u8().subarray(p, p + len)) : cstr(p);
          }
          const sh = get('shader', id);
          G().shaderSource(sh, glsl(src, G().getShaderParameter(sh, 0x8B4F)));
        },
        glCompileShader(id) {
          const g = G();
          const sh = get('shader', id);
          g.compileShader(sh);
          if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) out('Shader did not compile (WebGL 2 uses GLSL ES 3.00):\n' + g.getShaderInfoLog(sh) + '\n', 'warn');
        },
        glGetShaderiv(id, pname, ptr) {
          const g = G();
          const sh = get('shader', id);
          const v = pname === 0x8B84 ? (g.getShaderInfoLog(sh) || '').length + 1 : g.getShaderParameter(sh, pname);
          dv().setInt32(ptr, typeof v === 'number' ? v : v ? 1 : 0, true);
        },
        glGetShaderInfoLog(id, max, len, buf) { writeLog(G().getShaderInfoLog(get('shader', id)), max, len, buf); },
        glDeleteShader(id) { const s = get('shader', id); if (s) G().deleteShader(s); },
        glCreateProgram() { return add('program', G().createProgram()); },
        glAttachShader(p, s) { G().attachShader(get('program', p), get('shader', s)); },
        glDetachShader(p, s) { G().detachShader(get('program', p), get('shader', s)); },
        glLinkProgram(p) {
          const g = G();
          g.linkProgram(get('program', p));
          if (!g.getProgramParameter(get('program', p), g.LINK_STATUS)) out('Shader program did not link:\n' + g.getProgramInfoLog(get('program', p)) + '\n', 'warn');
        },
        glValidateProgram(p) { G().validateProgram(get('program', p)); },
        glGetProgramiv(p, pname, ptr) {
          const g = G();
          const v = pname === 0x8B84 ? (g.getProgramInfoLog(get('program', p)) || '').length + 1 : g.getProgramParameter(get('program', p), pname);
          dv().setInt32(ptr, typeof v === 'number' ? v : v ? 1 : 0, true);
        },
        glGetProgramInfoLog(p, max, len, buf) { writeLog(G().getProgramInfoLog(get('program', p)), max, len, buf); },
        glUseProgram(p) { program = get('program', p); G().useProgram(program); },
        glDeleteProgram(p) { const o = get('program', p); if (o) G().deleteProgram(o); },
        glBindAttribLocation(p, i, name) { G().bindAttribLocation(get('program', p), i, cstr(name)); },
        glGetAttribLocation(p, name) { return G().getAttribLocation(get('program', p), cstr(name)); },
        glGetUniformLocation(p, name) { const loc = G().getUniformLocation(get('program', p), cstr(name)); return loc ? add('uniform', loc) : -1; },
        glUniform1i(l, a) { G().uniform1i(get('uniform', l), a); },
        glUniform2i(l, a, b) { G().uniform2i(get('uniform', l), a, b); },
        glUniform1f(l, a) { G().uniform1f(get('uniform', l), a); },
        glUniform2f(l, a, b) { G().uniform2f(get('uniform', l), a, b); },
        glUniform3f(l, a, b, c) { G().uniform3f(get('uniform', l), a, b, c); },
        glUniform4f(l, a, b, c, d) { G().uniform4f(get('uniform', l), a, b, c, d); },
        glUniform1fv(l, n, p) { G().uniform1fv(get('uniform', l), f32(p, n)); },
        glUniform2fv(l, n, p) { G().uniform2fv(get('uniform', l), f32(p, n * 2)); },
        glUniform3fv(l, n, p) { G().uniform3fv(get('uniform', l), f32(p, n * 3)); },
        glUniform4fv(l, n, p) { G().uniform4fv(get('uniform', l), f32(p, n * 4)); },
        glUniform1iv(l, n, p) { G().uniform1iv(get('uniform', l), i32(p, n)); },
        glUniformMatrix3fv(l, n, t, p) { G().uniformMatrix3fv(get('uniform', l), !!t, f32(p, n * 9)); },
        glUniformMatrix4fv(l, n, t, p) { G().uniformMatrix4fv(get('uniform', l), !!t, f32(p, n * 16)); },

        // framebuffers
        glGenFramebuffers: genN('fbo', () => G().createFramebuffer()),
        glDeleteFramebuffers: delN('fbo', (f) => G().deleteFramebuffer(f)),
        glBindFramebuffer(t, id) { G().bindFramebuffer(t, get('fbo', id)); },
        glFramebufferTexture2D(t, a, tt, tex, level) { G().framebufferTexture2D(t, a, tt, get('texture', tex), level); },
        glCheckFramebufferStatus(t) { return G().checkFramebufferStatus(t); },
        glGenRenderbuffers: genN('rbo', () => G().createRenderbuffer()),
        glBindRenderbuffer(t, id) { G().bindRenderbuffer(t, get('rbo', id)); },
        glRenderbufferStorage(t, f, w, h) { G().renderbufferStorage(t, f, w, h); },
        glFramebufferRenderbuffer(t, a, rt, id) { G().framebufferRenderbuffer(t, a, rt, get('rbo', id)); },
      });

      return {
        env: new Proxy(env, { get: (t, k) => t[k] || ((...a) => { warn(String(k) + '() is not available in the browser version yet.'); return 0; }) }),
        setMemory(m) { mem = m; },
        input,
      };
    }

    /* ---------- running ---------- */
    async function run(msg) {
      inputBytes = enc.encode(input.length ? input.join('\n') + '\n' : '');
      inputPos = 0;
      const built = await compile(msg);
      if (!built.ok) {
        fail(built.errors.trim());
        done({ failed: true, buildFailed: true });
        return;
      }
      if (built.warnings.trim()) out(built.warnings.trim() + '\n', 'warn');
      if (msg.compileOnly) { done({ built: true }); return; }
      if (typeof WebAssembly.Suspending !== 'function') {
        fail('Graphics programs need WebAssembly JSPI, which this browser does not have. Use a recent Chrome or Edge.');
        done({ failed: true });
        return;
      }
      gfx = makeGfx();
      let stdoutBuf = '';
      const w = wasi({ files: new Map(), args: [msg.name.split('/').pop().replace(/\.c$/, '.exe')], stdout: (t) => out(t), stderr: (t) => out(t, 'error') });
      const mod = await WebAssembly.compile(built.wasm);
      const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: w.imports, env: gfx.env });
      w.setMemory(inst.exports.memory);
      gfx.setMemory(inst.exports.memory);
      let code = 0;
      try {
        await WebAssembly.promising(inst.exports._start)();
      } catch (e) {
        if (e instanceof Exit) code = e.code;
        else { fail('The program crashed: ' + (e && e.message || e)); code = 1; }
      }
      void stdoutBuf;
      post('gfx', { action: 'close' });
      gfx = null;
      done({ failed: code !== 0, exitCode: code });
    }

    self.addEventListener('message', function (e) {
      const msg = e.data;
      if (!msg || msg.smokiRun == null) return;
      if (msg.appEvent) { if (gfx) gfx.input(msg.appEvent); return; }
      runId = msg.smokiRun;
      input = msg.stdin ? msg.stdin.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
      run(msg).catch(function (err) { fail(String(err && (err.stack || err.message) || err)); done({ failed: true }); });
    });
    boot().then(function () { post('ready'); }).catch(function (err) { post('fail', { message: String(err && err.message || err) }); });
  }

  /* ======================================================================
     Packages (pacman) and which headers need them
     ====================================================================== */
  // OpenGL's gl.h and glu.h come with the MinGW toolchain, so they are always there.
  const installed = () => Array.from(new Set(['opengl'].concat(SC.storage.get(STORE, []))));
  const isInstalled = (id) => installed().includes(id);
  function withDeps(ids) {
    const outIds = [];
    const visit = (id) => { if (outIds.includes(id) || !LIB.PACKAGES[id]) return; LIB.PACKAGES[id].deps.forEach(visit); outIds.push(id); };
    ids.forEach(visit);
    return outIds;
  }
  function findPackage(name) {
    const n = String(name).toLowerCase();
    return Object.keys(LIB.PACKAGES).find((id) => LIB.PACKAGES[id].names.includes(n)) || null;
  }
  function install(ids) { SC.storage.set(STORE, Array.from(new Set(installed().concat(withDeps(ids))))); SC.extensions.render(); }
  function remove(ids) { SC.storage.set(STORE, installed().filter((id) => !ids.includes(id))); SC.extensions.render(); }

  /** Which graphics headers a C file includes, and the packages they come from. */
  function scan(code) {
    const includes = [];
    const re = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm;
    let m;
    while ((m = re.exec(code))) includes.push(m[1]);
    const needed = [];
    const missing = [];
    for (const inc of includes) {
      const id = Object.keys(LIB.PACKAGES).find((k) => LIB.PACKAGES[k].headers.includes(inc));
      if (!id) continue;
      if (!needed.includes(id)) needed.push(id);
      if (!isInstalled(id) && !missing.some((x) => x.id === id)) missing.push({ id, header: inc });
    }
    return { graphics: needed.length > 0, packages: withDeps(needed), missing };
  }

  /* ======================================================================
     The window in the App window
     ====================================================================== */
  let win = null;
  let winRun = null;
  const KEYS = {
    Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47, Semicolon: 59, Equal: 61, BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
    Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261, ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
    PageUp: 266, PageDown: 267, Home: 268, End: 269, CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,
    ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343, ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347, ContextMenu: 348,
    NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332, NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336,
  };
  function keyCode(e) {
    if (KEYS[e.code]) return KEYS[e.code];
    let m = /^Key([A-Z])$/.exec(e.code);
    if (m) return m[1].charCodeAt(0);
    m = /^Digit(\d)$/.exec(e.code);
    if (m) return 48 + +m[1];
    m = /^Numpad(\d)$/.exec(e.code);
    if (m) return 320 + +m[1];
    m = /^F(\d+)$/.exec(e.code);
    if (m) return 289 + +m[1];
    return 0;
  }
  const mods = (e) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0);
  const sendInput = (ev) => { if (winRun) SC.runner.send(winRun, { appEvent: ev }); };

  function openWindow(run, w, h, title) {
    if (win && winRun === run) {
      win.canvas.width = w;
      win.canvas.height = h;
      if (title) win.title.textContent = title;
      win.fit();
      return;
    }
    closeWindow();
    winRun = run;
    const desk = SC.appTab.desk();
    const canvas = el('canvas', { class: 'gfx-canvas', width: String(w), height: String(h) });
    const titleEl = el('span', { class: 'tkw-title', text: title || 'Window' });
    const bar = el('div', { class: 'tkw-bar' },
      el('span', { class: 'tkw-icon gfx-icon', 'aria-hidden': 'true' }), titleEl,
      el('div', { class: 'tkw-btns' },
        el('button', { class: 'tkw-btn min', type: 'button', 'aria-label': 'Minimize', onClick: () => node.classList.toggle('minimized') }),
        el('button', { class: 'tkw-btn max', type: 'button', 'aria-label': 'Maximize', onClick: () => { node.classList.toggle('gfx-max'); fit(); } }),
        el('button', { class: 'tkw-btn close', type: 'button', 'aria-label': 'Close', onClick: () => sendInput({ type: 'close' }) })));
    const client = el('div', { class: 'tkw-client gfx-client' }, canvas);
    const node = el('div', { class: 'tkw gfx-window', tabindex: '0', role: 'application', 'aria-label': title || 'Program window', style: { left: '24px', top: '16px' } }, bar, client);
    desk.append(node);
    // Shrink the picture to fit the App window (the mouse still maps to
    // the program's own pixels, see pos below)
    const fit = () => {
      if (node.classList.contains('gfx-max')) { canvas.style.width = canvas.style.height = ''; return; }
      const cw = canvas.width, ch = canvas.height;
      const s = Math.max(0.1, Math.min(1, (desk.clientWidth - 24) / (cw + 2), (desk.clientHeight - 24 - bar.offsetHeight) / (ch + 2)));
      canvas.style.width = Math.floor(cw * s) + 'px';
      canvas.style.height = Math.floor(ch * s) + 'px';
      if (node.offsetLeft + node.offsetWidth > desk.clientWidth - 12) node.style.left = Math.max(12, desk.clientWidth - node.offsetWidth - 12) + 'px';
      if (node.offsetTop + node.offsetHeight > desk.clientHeight - 12) node.style.top = Math.max(12, desk.clientHeight - node.offsetHeight - 12) + 'px';
    };
    const resizer = new ResizeObserver(fit);
    resizer.observe(desk);
    win = { node, canvas, title: titleEl, ctx: canvas.getContext('2d'), fit, resizer };
    // Drag the window by its title bar
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tkw-btns') || e.button !== 0) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      const sx = e.clientX - node.offsetLeft;
      const sy = e.clientY - node.offsetTop;
      const move = (ev) => { node.style.left = Math.max(-200, ev.clientX - sx) + 'px'; node.style.top = Math.max(0, ev.clientY - sy) + 'px'; };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
    // Keyboard and mouse go to the program
    node.addEventListener('keydown', (e) => {
      if (e.ctrlKey && /^(KeyC|KeyV)$/.test(e.code) === false && e.key === 'F5') return;
      const k = keyCode(e);
      if (!k && e.key.length !== 1) return;
      if (e.key !== 'F5' && !(e.shiftKey && e.key === 'F5')) e.preventDefault();
      sendInput({ type: 'key', down: true, repeat: e.repeat, key: k, ch: e.key.length === 1 ? e.key.codePointAt(0) : 0, mods: mods(e) });
    });
    node.addEventListener('keyup', (e) => sendInput({ type: 'key', down: false, key: keyCode(e), ch: e.key.length === 1 ? e.key.codePointAt(0) : 0, mods: mods(e) }));
    node.addEventListener('blur', () => sendInput({ type: 'blur' }));
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: Math.round((e.clientX - r.left) * canvas.width / r.width), y: Math.round((e.clientY - r.top) * canvas.height / r.height) };
    };
    const button = (e) => (e.button === 2 ? 1 : e.button === 1 ? 2 : 0);
    canvas.addEventListener('pointerdown', (e) => { node.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); sendInput(Object.assign({ type: 'mouse', kind: 'down', button: button(e), mods: mods(e) }, pos(e))); });
    canvas.addEventListener('pointerup', (e) => sendInput(Object.assign({ type: 'mouse', kind: 'up', button: button(e), mods: mods(e) }, pos(e))));
    canvas.addEventListener('pointermove', (e) => sendInput(Object.assign({ type: 'mouse', kind: 'move', mods: mods(e) }, pos(e))));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); sendInput({ type: 'wheel', delta: e.deltaY < 0 ? 1 : -1 }); }, { passive: false });
    SC.appTab.show();
    SC.appTab.setStatus('graphics', 'Running: ' + (title || 'C program'));
    SC.appTab.refresh();
    node.focus({ preventScroll: true });
  }

  function closeWindow() {
    if (win) { win.resizer.disconnect(); win.node.remove(); }
    win = null;
    winRun = null;
    if (SC.appTab) { SC.appTab.setStatus('graphics', ''); SC.appTab.refresh(); }
  }

  function onGfx(d, run) {
    if (d.action === 'open') openWindow(run, d.w, d.h, d.title);
    else if (d.action === 'title' && win) { win.title.textContent = d.title; SC.appTab.setStatus('graphics', 'Running: ' + d.title); }
    else if (d.action === 'close' && winRun === run) closeWindow();
  }
  function onFrame(d, run) {
    if (!win || winRun !== run || !d.bitmap) return;
    if (win.canvas.width !== d.bitmap.width || win.canvas.height !== d.bitmap.height) { win.canvas.width = d.bitmap.width; win.canvas.height = d.bitmap.height; win.fit(); }
    win.ctx.drawImage(d.bitmap, 0, 0);
    d.bitmap.close();
  }
  function onFinish(run) { if (run === winRun) closeWindow(); }

  /* ======================================================================
     F5 on a C file that includes raylib.h, GL/glut.h...
     ====================================================================== */
  function route({ lang, code }) {
    if (lang !== 'c' && lang !== 'cpp') return null;
    const s = scan(code);
    if (!s.graphics) return null;
    if (lang === 'cpp') return { error: 'C++ graphics programs are not supported yet. Write the program in C (a .c file); raylib, GLUT and GLFW all work from C.' };
    if (s.missing.length) {
      const m = s.missing[0];
      return { error: 'fatal error: ' + m.header + ': No such file or directory\nInstall it in the MSYS2 terminal:  pacman -S ' + LIB.PACKAGES[m.id].names[0] };
    }
    return { lang: 'cgfx', extra: { packages: s.packages } };
  }

  /* ======================================================================
     The extension
     ====================================================================== */
  function packageData() {
    const pk = {};
    for (const [id, p] of Object.entries(LIB.PACKAGES)) pk[id] = { files: p.files, sources: p.sources };
    return { xcc: SC.xcc.zip, mathf: LIB.MATHF, base: LIB.BASE, packages: pk };
  }

  function renderDetails(box) {
    const list = installed();
    box.append(el('h3', { text: 'Installed with pacman' }),
      list.length
        ? el('ul', { class: 'pip-list' }, list.map((id) => el('li', {}, el('span', { text: LIB.PACKAGES[id].names[0] + ' ' + LIB.PACKAGES[id].version }))))
        : el('p', { class: 'ext-note', text: 'Nothing yet. In the MSYS2 terminal, run for example: pacman -S mingw-w64-ucrt-x86_64-raylib' }));
  }

  SC.extensions.register({
    id: 'smoki.graphics',
    name: 'C Graphics',
    version: '1.0.0',
    icon: { text: 'GL', color: '#5c8a1f' },
    description: 'raylib, OpenGL, freeglut, GLFW and GLEW for C programs. Install them with pacman; windows open in the App window.',
    features: [
      'pacman -S mingw-w64-ucrt-x86_64-raylib (or -freeglut, -glfw, -glew, -mesa) in the MSYS2 terminal installs the library.',
      'C programs that include raylib.h, GL/glut.h, GLFW/glfw3.h or GL/glew.h compile in your browser (xcc compiler) and draw in the App window.',
      'raylib: 2D shapes, text, colors, keyboard and mouse input, collisions, raymath. 3D drawing, pictures and sound are not available yet.',
      'OpenGL: glBegin/glEnd, matrices (glRotate, gluPerspective, gluLookAt), simple lighting, and modern OpenGL 3.3 with shaders, buffers and VAOs (drawn with WebGL 2).',
      'Needs a browser with WebAssembly JSPI (recent Chrome or Edge). Only C, not C++.',
    ],
    commands: [],
    activate(ctx) {
      SC.appTab.acquire('graphics');
      ctx.onDispose(() => SC.appTab.release('graphics'));
      ctx.onDispose(SC.runner.addRuntime('cgfx', { label: 'the C compiler', worker: true, keep: true, main: gfxWorker, data: packageData() }));
      ctx.onDispose(SC.runner.addRouter(route));
      SC.runner.on('gfx', onGfx);
      SC.runner.on('frame', onFrame);
      SC.runner.on('finish', onFinish);
      ctx.onDispose(() => { SC.runner.off('gfx', onGfx); SC.runner.off('frame', onFrame); SC.runner.off('finish', onFinish); closeWindow(); });
      SC.msysPackages = { PACKAGES: LIB.PACKAGES, installed, isInstalled, install, remove, findPackage, scan, withDeps };
      ctx.onDispose(() => { delete SC.msysPackages; });
    },
    renderDetails,
  });
})(window.SC);
