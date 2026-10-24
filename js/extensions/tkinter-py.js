/* ==========================================================================
   extensions/tkinter-py.js — the Python side of the Tkinter extension: a
   browser version of the tkinter package for Pyodide. Widgets keep their
   state in Python and send the whole window tree as JSON to the App tab
   (tkinter.js), which draws it and sends clicks and typing back.

   The files are kept as text (String.raw) so the app needs no build step
   and still works from file://. They are written to /smoki_lib/tkinter/
   inside Pyodide before each Python run.
   ========================================================================== */
(function (SC) {
  'use strict';

  const CONSTANTS = String.raw`"""tkinter.constants (Smoki's Code)"""
NO = FALSE = OFF = 0
YES = TRUE = ON = 1
N, S, W, E = "n", "s", "w", "e"
NW, SW, NE, SE = "nw", "sw", "ne", "se"
NS, EW, NSEW = "ns", "ew", "nsew"
CENTER = "center"
NONE, X, Y, BOTH = "none", "x", "y", "both"
LEFT, TOP, RIGHT, BOTTOM = "left", "top", "right", "bottom"
RAISED, SUNKEN, FLAT, RIDGE, GROOVE, SOLID = "raised", "sunken", "flat", "ridge", "groove", "solid"
HORIZONTAL, VERTICAL = "horizontal", "vertical"
NUMERIC = "numeric"
CHAR, WORD = "char", "word"
BASELINE = "baseline"
INSIDE, OUTSIDE = "inside", "outside"
SEL, SEL_FIRST, SEL_LAST = "sel", "sel.first", "sel.last"
END, INSERT, CURRENT, ANCHOR, ALL = "end", "insert", "current", "anchor", "all"
NORMAL, DISABLED, ACTIVE, HIDDEN = "normal", "disabled", "active", "hidden"
CASCADE, CHECKBUTTON, COMMAND, RADIOBUTTON, SEPARATOR = "cascade", "checkbutton", "command", "radiobutton", "separator"
SINGLE, BROWSE, MULTIPLE, EXTENDED = "single", "browse", "multiple", "extended"
DOTBOX, UNDERLINE = "dotbox", "underline"
PIESLICE, CHORD, ARC = "pieslice", "chord", "arc"
FIRST, LAST, BUTT, PROJECTING, ROUND, BEVEL, MITER = "first", "last", "butt", "projecting", "round", "bevel", "miter"
MOVETO, SCROLL, UNITS, PAGES = "moveto", "scroll", "units", "pages"
`;

  const INIT = String.raw`"""tkinter for Smoki's Code.

A browser version of tkinter: windows are drawn in the App tab of the
editor. It supports the common widgets, pack/grid/place, variables,
bind() events, after() timers, menus and message boxes.

Differences from desktop Python:
- mainloop() returns right away. The program keeps running (and reacting
  to clicks) until you close the window or press Shift+F5.
- Pictures (PhotoImage) are not shown, and dialogs can't wait for an
  answer (messagebox.askyesno answers Yes).
"""
import json as _json
import re as _re
import sys as _sys
import traceback as _traceback

import js as _js
from pyodide.ffi import create_proxy as _create_proxy, create_once_callable as _once

from tkinter.constants import *

TkVersion = 8.6
TclVersion = 8.6
READABLE = WRITABLE = EXCEPTION = None
wantobjects = 1
_default_root = None


class TclError(Exception):
    pass


# ---------------------------------------------------------------- state
class _State:
    def __init__(self):
        self.widgets = {}
        self.order = []
        self.count = 0
        self.vars = {}
        self.dirty = False
        self.alive = True
        self.dialogs = []
        self.afters = {}
        self.binds_all = {}
        self.focus = None
        self.sizes = {}
        self.warned = set()
        self.root = None
        self.pack_seq = 0
        self.popup = None
        _js.smokiAppHandler = _create_proxy(_dispatch)


_state = None


def _st():
    global _state
    if _state is None:
        _state = _State()
    return _state


def _uid(prefix):
    s = _st()
    s.count += 1
    return prefix + str(s.count)


def _mark():
    _st().dirty = True


def _warn(key, text):
    s = _st()
    if key not in s.warned:
        s.warned.add(key)
        print("tkinter (Smoki's Code): " + text, file=_sys.stderr)


def _call(func, *args):
    """Run a callback like Tk does: errors are printed, the app keeps going."""
    try:
        return func(*args)
    except SystemExit:
        raise
    except Exception:
        print("Exception in Tkinter callback", file=_sys.stderr)
        _traceback.print_exc()


_ALIASES = {"bg": "background", "fg": "foreground", "bd": "borderwidth", "from_": "from", "in_": "in", "class_": "class"}


def _opts(cnf, kw):
    out = {}
    for k, v in dict(cnf or {}, **kw).items():
        out[_ALIASES.get(k, k)] = v
    return out


def _jv(v):
    if isinstance(v, Variable):
        return v._name
    if isinstance(v, Misc):
        return v._w
    if hasattr(v, "_smoki_font"):
        return v._smoki_font()
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (list, tuple)):
        return [_jv(x) for x in v]
    if callable(v):
        return True
    return str(v)


def _eq(a, b):
    if isinstance(a, bool):
        a = int(a)
    if isinstance(b, bool):
        b = int(b)
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return str(a) == str(b)


def _flush(force=False):
    s = _state
    if s is None or not (s.dirty or force):
        return
    s.dirty = False
    if not s.alive:
        _js.smokiAppSend(_json.dumps({"alive": False}))
        return
    kinds = set()
    for w in s.order:
        for seq in w._binds:
            kinds.add(_parse_seq(seq)[0])
        for binds in getattr(w, "_tag_binds", {}).values():
            for seq in binds:
                kinds.add(_parse_seq(seq)[0])
    for seq in s.binds_all:
        kinds.add(_parse_seq(seq)[0])
    if "ButtonPress" in kinds:
        kinds.add("DoubleClick")
    data = {
        "alive": True,
        "widgets": [w._json() for w in s.order if not w._destroyed],
        "dialogs": s.dialogs,
        "focus": s.focus,
        "bound": sorted(kinds),
        "popup": s.popup,
    }
    s.popup = None
    _js.smokiAppSend(_json.dumps(data, default=str))


def _mainloop(n=0):
    s = _st()
    if not s.alive or s.root is None:
        return
    _js.smokiAppOpen = True
    s.dirty = True
    _flush()


def mainloop(n=0):
    _mainloop(n)


def _get_default_root(what=None):
    s = _st()
    if s.root is None or not s.alive:
        Tk()
    return _st().root


def NoDefaultRoot():
    pass


# ---------------------------------------------------------------- events
class Event:
    def __init__(self, **kw):
        self.widget = None
        self.x = self.y = self.x_root = self.y_root = 0
        self.char = ""
        self.keysym = "??"
        self.keycode = 0
        self.keysym_num = 0
        self.num = "??"
        self.delta = 0
        self.width = self.height = 0
        self.state = 0
        self.type = ""
        self.serial = 0
        self.time = 0
        self.__dict__.update(kw)

    def __repr__(self):
        return "<%s event x=%s y=%s keysym=%s>" % (self.type, self.x, self.y, self.keysym)


_KIND_WORDS = {
    "key": "KeyPress", "keypress": "KeyPress", "keyrelease": "KeyRelease",
    "button": "ButtonPress", "buttonpress": "ButtonPress", "buttonrelease": "ButtonRelease",
    "motion": "Motion", "enter": "Enter", "leave": "Leave", "focusin": "FocusIn", "focusout": "FocusOut",
    "mousewheel": "MouseWheel", "configure": "Configure", "destroy": "Destroy", "map": "Map", "unmap": "Unmap",
    "visibility": "Visibility", "expose": "Expose", "activate": "Activate", "deactivate": "Deactivate",
}
_MOD_WORDS = {"control": "control", "shift": "shift", "alt": "alt", "double": "double", "triple": "triple",
              "b1": "b1", "b2": "b2", "b3": "b3", "button1": "b1", "button2": "b2", "button3": "b3",
              "lock": "lock", "meta": "alt", "command": "control", "option": "alt", "any": "any", "mod1": "alt"}
_seq_cache = {}


def _parse_seq(seq):
    """'<Control-Button-1>' -> ('ButtonPress', '1', {'control'})"""
    if seq in _seq_cache:
        return _seq_cache[seq]
    if seq.startswith("<<") and seq.endswith(">>"):
        res = ("Virtual", seq, frozenset())
    elif not seq.startswith("<"):
        res = ("KeyPress", seq, frozenset())
    else:
        parts = seq[1:-1].split("-")
        mods, kind, detail = set(), None, None
        for i, p in enumerate(parts):
            pl = p.lower()
            if i < len(parts) - 1 and pl in _MOD_WORDS and kind is None:
                mods.add(_MOD_WORDS[pl])
            elif pl in _KIND_WORDS and kind is None:
                kind = _KIND_WORDS[pl]
            else:
                detail = p
        if kind is None:
            kind = "ButtonPress" if detail and detail.isdigit() else "KeyPress"
        res = (kind, detail, frozenset(mods))
    _seq_cache[seq] = res
    return res


def _matches(kind, ev, seq):
    skind, detail, mods = _parse_seq(seq)
    if skind == "Virtual":
        return kind == "Virtual" and ev.name == detail
    if "double" in mods:
        return kind == "DoubleClick" and skind == "ButtonPress" and detail in (None, str(ev.num))
    if kind == "DoubleClick":
        return False
    if skind != kind:
        return False
    if kind in ("KeyPress", "KeyRelease"):
        if detail is not None and detail != ev.keysym and detail != ev.char:
            return False
        if "control" in mods and not ev.state & 4:
            return False
        if "alt" in mods and not ev.state & 8:
            return False
        if "shift" in mods and not ev.state & 1:
            return False
        if "control" not in mods and ev.state & 4 and detail is not None and len(detail) == 1:
            return False
    if kind in ("ButtonPress", "ButtonRelease") and detail is not None and detail != str(ev.num):
        return False
    if kind == "Motion":
        if "b1" in mods and not ev.state & 256:
            return False
        if "b3" in mods and not ev.state & 1024:
            return False
    if kind in ("ButtonPress", "ButtonRelease", "Motion") and "control" in mods and not ev.state & 4:
        return False
    return True


def _specificity(seq):
    kind, detail, mods = _parse_seq(seq)
    return (detail is not None) + len(mods)


def _run_binds(binds, kind, ev):
    """Call the most specific matching binding in one bind table. Returns 'break' to stop."""
    best = None
    for seq, funcs in binds.items():
        if _matches(kind, ev, seq) and (best is None or _specificity(seq) > _specificity(best)):
            best = seq
    if best is None:
        return None
    result = None
    for func in list(binds[best]):
        if _call(func, ev) == "break":
            result = "break"
    return result


def _fire(widget, kind, ev):
    """Deliver an event to a widget, its window, then bind_all, like Tk's bindtags."""
    s = _st()
    ev.widget = widget
    tags = [widget._binds]
    top = widget.winfo_toplevel()
    if top is not widget:
        tags.append(top._binds)
    tags.append(s.binds_all)
    for binds in tags:
        if _run_binds(binds, kind, ev) == "break":
            break


def _fire_virtual(widget, name):
    _fire(widget, "Virtual", Event(name=name, type="VirtualEvent"))


def _dispatch(text):
    s = _state
    if s is None or not s.alive:
        return
    try:
        msg = _json.loads(text)
        t = msg.get("type")
        w = s.widgets.get(msg.get("id"))
        if t == "close":
            if w is not None:
                handler = getattr(w, "_protocols", {}).get("WM_DELETE_WINDOW")
                if handler and msg.get("force") is not True:
                    _call(handler)
                else:
                    w.destroy()
        elif t == "invoke" and w is not None:
            w.invoke()
        elif t == "value" and w is not None:
            w._ui_value(msg.get("value"), msg)
        elif t == "menu" and w is not None:
            w.invoke(msg.get("index"))
        elif t == "tab" and w is not None:
            w._ui_tab(msg.get("index"))
        elif t == "dialog":
            s.dialogs = [d for d in s.dialogs if d["id"] != msg.get("dialog")]
            s.dirty = True
        elif t == "sizes":
            s.sizes.update(msg.get("sizes") or {})
        elif t == "event" and w is not None:
            d = msg.get("event") or {}
            kind = msg.get("kind")
            ev = Event(type=kind, **d)
            if kind in ("FocusIn",) :
                s.focus = w._w
            if isinstance(w, Canvas) and kind in ("ButtonPress", "ButtonRelease", "Motion", "DoubleClick", "Enter", "Leave"):
                w._item_event(kind, ev)
            _fire(w, kind, ev)
    except SystemExit:
        if s.root is not None:
            s.root.destroy()
    except Exception:
        print("Exception in Tkinter callback", file=_sys.stderr)
        _traceback.print_exc()
    _flush()
    _sys.stdout.flush()
    _sys.stderr.flush()


# ---------------------------------------------------------------- variables
class Variable:
    _default = ""

    def __init__(self, master=None, value=None, name=None):
        s = _st()
        self._name = name or _uid("PY_VAR")
        self._value = self._default if value is None else value
        self._traces = []
        s.vars[self._name] = self

    def __str__(self):
        return self._name

    def get(self):
        return self._value

    def set(self, value):
        self._value = value
        _mark()
        for mode, cb in list(self._traces):
            if "w" in mode or "write" in mode:
                _call(cb, self._name, "", "write")

    initialize = set

    def trace_add(self, mode, callback):
        modes = mode if isinstance(mode, (list, tuple)) else [mode]
        self._traces.append((" ".join(modes), callback))
        return str(len(self._traces))

    def trace(self, mode, callback):
        return self.trace_add(mode, callback)

    trace_variable = trace

    def trace_remove(self, mode, cbname):
        try:
            self._traces[int(cbname) - 1] = ("", lambda *a: None)
        except (ValueError, IndexError):
            pass

    trace_vdelete = trace_remove

    def trace_info(self):
        return [(m, "cb") for m, c in self._traces if m]


class StringVar(Variable):
    def get(self):
        return str(self._value)


class IntVar(Variable):
    _default = 0

    def get(self):
        try:
            return int(self._value)
        except (TypeError, ValueError):
            try:
                return int(float(self._value))
            except (TypeError, ValueError):
                raise TclError('expected integer but got "%s"' % self._value)


class DoubleVar(Variable):
    _default = 0.0

    def get(self):
        try:
            return float(self._value)
        except (TypeError, ValueError):
            raise TclError('expected floating-point number but got "%s"' % self._value)


class BooleanVar(Variable):
    _default = False

    def get(self):
        v = self._value
        if isinstance(v, str):
            if v.lower() in ("1", "true", "yes", "on"):
                return True
            if v.lower() in ("0", "false", "no", "off", ""):
                return False
            raise TclError('expected boolean value but got "%s"' % v)
        return bool(v)


def getint(v):
    return int(v)


def getdouble(v):
    return float(v)


def getboolean(v):
    return BooleanVar(value=v).get()


# ---------------------------------------------------------------- base classes
_DEFAULTS = {
    "*": {"background": "SystemButtonFace", "foreground": "SystemButtonText", "borderwidth": 0, "relief": "flat",
          "state": "normal", "font": "TkDefaultFont", "text": "", "width": 0, "height": 0, "padx": 0, "pady": 0,
          "anchor": "center", "justify": "center", "cursor": "", "highlightthickness": 0},
    "Entry": {"background": "SystemWindow", "width": 20, "show": "", "justify": "left"},
    "Text": {"background": "SystemWindow", "width": 80, "height": 24, "wrap": "char"},
    "Listbox": {"background": "SystemWindow", "width": 20, "height": 10, "selectmode": "browse"},
    "Canvas": {"width": 378, "height": 265},
    "Scale": {"from": 0, "to": 100, "orient": "vertical", "resolution": 1, "length": 100, "showvalue": 1},
    "Button": {"borderwidth": 2, "relief": "raised"},
}


class _TkApp:
    def call(self, *args):
        return ""

    def eval(self, script):
        return ""

    def getvar(self, name):
        v = _st().vars.get(name)
        return v.get() if v else ""

    def setvar(self, name, value):
        v = _st().vars.get(name)
        if v:
            v.set(value)

    def splitlist(self, v):
        return tuple(v) if isinstance(v, (list, tuple)) else tuple(str(v).split())

    def getint(self, v):
        return int(v)

    def getdouble(self, v):
        return float(v)

    def getboolean(self, v):
        return getboolean(v)

    def createcommand(self, name, func):
        pass

    def wantobjects(self):
        return 1


class Misc:
    _type = "Widget"
    _container = False
    _ttk = False

    def _init(self, master, cnf, kw):
        s = _st()
        self._w = _uid(self._type.lower())
        self.master = master
        self.children = {}
        self._opts = {}
        self._command = None
        self._binds = {}
        self._manager = None
        self._layout = {}
        self._cols = {}
        self._rows = {}
        self._propagate = True
        self._destroyed = False
        self.tk = _TkApp()
        self.widgetName = self._type.lower()
        s.widgets[self._w] = self
        s.order.append(self)
        if master is not None:
            name = kw.pop("name", None) if kw else None
            master.children[name or self._w] = self
        self.configure(cnf, **kw)
        _mark()

    def __str__(self):
        return "." + self._w

    def __repr__(self):
        return "<tkinter.%s object .%s>" % (self.__class__.__name__, self._w)

    # options
    def configure(self, cnf=None, **kw):
        if cnf is None and not kw:
            return {k: (k, k, k, None, v) for k, v in self._opts.items()}
        if isinstance(cnf, str):
            return (cnf, cnf, cnf, None, self.cget(cnf))
        for k, v in _opts(cnf, kw).items():
            self._set_opt(k, v)
        _mark()

    config = configure

    def _set_opt(self, k, v):
        if k == "command":
            self._command = v
            self._opts["command"] = bool(v)
            return
        if k in ("textvariable", "variable", "listvariable") and isinstance(v, str):
            v = _st().vars.get(v) or StringVar(name=v)
        if k == "image" and v:
            _warn("image", "pictures (PhotoImage) are not shown in the browser version.")
        if k == "font":
            v = _jv(v)
        self._opts[k] = v

    def cget(self, key):
        key = _ALIASES.get(key, key)
        if key == "command":
            return self._command
        if key in self._opts:
            return self._opts[key]
        return _DEFAULTS.get(self._type, {}).get(key, _DEFAULTS["*"].get(key, ""))

    __getitem__ = cget

    def __setitem__(self, key, value):
        self.configure(**{key: value})

    def keys(self):
        return list(self._opts)

    def _var(self, key):
        v = self._opts.get(key)
        return v if isinstance(v, Variable) else None

    # json for the App tab
    def _json(self):
        d = {"id": self._w, "type": self._type, "parent": self.master._w if self.master is not None else None,
             "opts": {k: _jv(v) for k, v in self._opts.items()}, "manager": self._manager,
             "layout": {k: _jv(v) for k, v in self._layout.items()}}
        if self._ttk:
            d["ttk"] = True
        if self._binds:
            d["binds"] = sorted({_parse_seq(q)[0] for q in self._binds})
        if self._cols:
            d["cols"] = self._cols
        if self._rows:
            d["rows"] = self._rows
        if not self._propagate:
            d["propagate"] = False
        tv = self._var("textvariable")
        if tv is not None:
            d["text"] = str(tv.get())
        d.update(self._extra())
        return d

    def _extra(self):
        return {}

    def invoke(self):
        if self._command and self.cget("state") != "disabled":
            return _call(self._command)

    def _ui_value(self, value, msg):
        pass

    # geometry managers
    def pack(self, cnf=None, **kw):
        s = _st()
        s.pack_seq += 1
        self._manager = "pack"
        self._layout = _opts(cnf, kw)
        self._layout["seq"] = s.pack_seq
        _mark()

    pack_configure = pack

    def pack_forget(self):
        self._manager = None
        _mark()

    def pack_info(self):
        return dict(self._layout)

    def pack_propagate(self, flag=None):
        if flag is None:
            return self._propagate
        self._propagate = bool(flag)
        _mark()

    propagate = pack_propagate

    def grid(self, cnf=None, **kw):
        lay = _opts(cnf, kw)
        if "row" not in lay and self.master is not None:
            rows = [w._layout.get("row", 0) + int(w._layout.get("rowspan", 1)) for w in self.master.winfo_children()
                    if w._manager == "grid" and w is not self]
            lay["row"] = max(rows) if rows else 0
        lay.setdefault("column", 0)
        self._manager = "grid"
        self._layout = lay
        _mark()

    grid_configure = grid

    def grid_forget(self):
        self._manager = None
        _mark()

    grid_remove = grid_forget

    def grid_info(self):
        return dict(self._layout)

    def grid_propagate(self, flag=None):
        return self.pack_propagate(flag)

    def grid_columnconfigure(self, index, cnf=None, **kw):
        for i in (index if isinstance(index, (list, tuple)) else [index]):
            self._cols.setdefault(str(i), {}).update(_opts(cnf, kw))
        _mark()

    columnconfigure = grid_columnconfigure

    def grid_rowconfigure(self, index, cnf=None, **kw):
        for i in (index if isinstance(index, (list, tuple)) else [index]):
            self._rows.setdefault(str(i), {}).update(_opts(cnf, kw))
        _mark()

    rowconfigure = grid_rowconfigure

    def grid_size(self):
        kids = [w for w in self.winfo_children() if w._manager == "grid"]
        cols = max([int(w._layout.get("column", 0)) + 1 for w in kids] or [0])
        rows = max([int(w._layout.get("row", 0)) + 1 for w in kids] or [0])
        return (cols, rows)

    def grid_slaves(self, row=None, column=None):
        return [w for w in self.winfo_children() if w._manager == "grid"
                and (row is None or w._layout.get("row") == row) and (column is None or w._layout.get("column") == column)]

    def pack_slaves(self):
        return [w for w in self.winfo_children() if w._manager == "pack"]

    def place_slaves(self):
        return [w for w in self.winfo_children() if w._manager == "place"]

    slaves = pack_slaves

    def place(self, cnf=None, **kw):
        self._manager = "place"
        self._layout = _opts(cnf, kw)
        _mark()

    place_configure = place

    def place_forget(self):
        self._manager = None
        _mark()

    def place_info(self):
        return dict(self._layout)

    # events
    def bind(self, sequence=None, func=None, add=None):
        if sequence is None:
            return tuple(self._binds)
        if func is None:
            return self._binds.get(sequence)
        funcs = self._binds.setdefault(sequence, [])
        if not add:
            funcs.clear()
        funcs.append(func)
        _mark()
        return "f" + str(id(func))

    def unbind(self, sequence, funcid=None):
        self._binds.pop(sequence, None)
        _mark()

    def bind_all(self, sequence=None, func=None, add=None):
        s = _st()
        if func is None:
            return s.binds_all.get(sequence)
        funcs = s.binds_all.setdefault(sequence, [])
        if not add:
            funcs.clear()
        funcs.append(func)
        _mark()
        return "f" + str(id(func))

    def unbind_all(self, sequence):
        _st().binds_all.pop(sequence, None)
        _mark()

    def bind_class(self, className, sequence=None, func=None, add=None):
        return self.bind_all(sequence, func, add)

    def event_generate(self, sequence, **kw):
        kind, detail, mods = _parse_seq(sequence)
        if kind == "Virtual":
            _fire_virtual(self, sequence)
        else:
            ev = Event(type=kind, keysym=detail or "??", char=detail if detail and len(detail) == 1 else "",
                       num=int(detail) if detail and detail.isdigit() else "??", **kw)
            _fire(self, kind, ev)
        _flush()

    def event_add(self, virtual, *sequences):
        pass

    def bindtags(self, tagList=None):
        return (self._w, self._type, ".", "all")

    # timers
    def after(self, ms, func=None, *args):
        s = _st()
        if func is None:
            return None
        aid = _uid("after#")

        def run():
            s.afters.pop(aid, None)
            if s.alive:
                try:
                    _call(func, *args)
                except SystemExit:
                    if s.root is not None:
                        s.root.destroy()
                _flush()
                _sys.stdout.flush()
                _sys.stderr.flush()

        s.afters[aid] = _js.setTimeout(_once(run), max(0, int(ms if ms != "idle" else 0)))
        return aid

    def after_idle(self, func, *args):
        return self.after(0, func, *args)

    def after_cancel(self, id):
        handle = _st().afters.pop(id, None)
        if handle is not None:
            _js.clearTimeout(handle)

    def update(self):
        _flush()

    def update_idletasks(self):
        _flush()

    def mainloop(self, n=0):
        _mainloop(n)

    def quit(self):
        root = _st().root
        if root is not None:
            root.destroy()

    def wait_window(self, window=None):
        pass

    def wait_variable(self, name="PY_VAR"):
        _warn("wait", "wait_variable() can't wait in the browser version and returns right away.")

    waitvar = wait_variable

    def wait_visibility(self, window=None):
        pass

    # focus and misc
    def focus_set(self):
        _st().focus = self._w
        _mark()

    focus = focus_force = focus_set

    def focus_get(self):
        s = _st()
        return s.widgets.get(s.focus)

    focus_displayof = focus_lastfor = focus_get

    def grab_set(self):
        pass

    grab_release = grab_set_global = grab_set

    def lift(self, aboveThis=None):
        pass

    tkraise = lower = lift

    def option_add(self, *args, **kw):
        pass

    def option_get(self, *args):
        return ""

    def clipboard_clear(self):
        self._clip = ""

    def clipboard_append(self, string, **kw):
        _warn("clip", "the clipboard is not connected in the browser version.")

    def clipboard_get(self, **kw):
        return ""

    def selection_get(self, **kw):
        return ""

    def bell(self, displayof=0):
        pass

    def register(self, func, subst=None, needcleanup=1):
        return func

    _register = register

    def nametowidget(self, name):
        return _st().widgets.get(str(name).split(".")[-1])

    def winfo_children(self):
        return [w for w in self.children.values() if not w._destroyed]

    def winfo_toplevel(self):
        w = self
        while w.master is not None and not isinstance(w, (Tk, Toplevel)):
            w = w.master
        return w

    def winfo_exists(self):
        return 0 if self._destroyed else 1

    def winfo_ismapped(self):
        return 1 if self._manager or isinstance(self, (Tk, Toplevel)) else 0

    winfo_viewable = winfo_ismapped

    def winfo_width(self):
        size = _st().sizes.get(self._w)
        return int(size[0]) if size else 1

    def winfo_height(self):
        size = _st().sizes.get(self._w)
        return int(size[1]) if size else 1

    def winfo_reqwidth(self):
        size = _st().sizes.get(self._w)
        return int(size[0]) if size else int(self.cget("width") or 1)

    def winfo_reqheight(self):
        size = _st().sizes.get(self._w)
        return int(size[1]) if size else int(self.cget("height") or 1)

    def winfo_x(self):
        size = _st().sizes.get(self._w)
        return int(size[2]) if size and len(size) > 2 else 0

    def winfo_y(self):
        size = _st().sizes.get(self._w)
        return int(size[3]) if size and len(size) > 3 else 0

    winfo_rootx = winfo_x
    winfo_rooty = winfo_y

    def winfo_screenwidth(self):
        return 1366

    def winfo_screenheight(self):
        return 768

    def winfo_pointerxy(self):
        return (0, 0)

    def winfo_pointerx(self):
        return 0

    def winfo_pointery(self):
        return 0

    def winfo_name(self):
        return self._w

    def winfo_class(self):
        return self._type

    def winfo_id(self):
        return id(self)

    def winfo_fpixels(self, n):
        return float(n)

    def winfo_pixels(self, n):
        return int(float(n))

    def winfo_rgb(self, color):
        return (0, 0, 0)

    def winfo_parent(self):
        return str(self.master) if self.master else ""

    def destroy(self):
        if self._destroyed:
            return
        for c in list(self.children.values()):
            c.destroy()
        self._destroyed = True
        s = _st()
        s.widgets.pop(self._w, None)
        if self in s.order:
            s.order.remove(self)
        if self.master is not None:
            for k, v in list(self.master.children.items()):
                if v is self:
                    del self.master.children[k]
        _mark()


class Wm:
    def _wm_init(self):
        self._protocols = {}
        self._opts.setdefault("title", "tk")

    def title(self, string=None):
        if string is None:
            return self._opts.get("title", "")
        self._opts["title"] = str(string)
        _mark()

    wm_title = title

    def geometry(self, newGeometry=None):
        if newGeometry is None:
            size = _st().sizes.get(self._w) or [200, 200, 0, 0]
            return "%dx%d+%d+%d" % (size[0], size[1], size[2] if len(size) > 2 else 0, size[3] if len(size) > 3 else 0)
        self._opts["geometry"] = str(newGeometry)
        _mark()

    wm_geometry = geometry

    def resizable(self, width=None, height=None):
        if width is None:
            return self._opts.get("resizable", (1, 1))
        self._opts["resizable"] = [bool(width), bool(height if height is not None else width)]
        _mark()

    wm_resizable = resizable

    def minsize(self, width=None, height=None):
        if width is None:
            return tuple(self._opts.get("minsize", (1, 1)))
        self._opts["minsize"] = [int(width), int(height or 0)]
        _mark()

    wm_minsize = minsize

    def maxsize(self, width=None, height=None):
        if width is None:
            return tuple(self._opts.get("maxsize", (1366, 768)))
        self._opts["maxsize"] = [int(width), int(height or 0)]
        _mark()

    wm_maxsize = maxsize

    def protocol(self, name=None, func=None):
        if func is None:
            return self._protocols.get(name)
        self._protocols[name] = func

    wm_protocol = protocol

    def state(self, newstate=None):
        if newstate is None:
            return "withdrawn" if self._opts.get("withdrawn") else "zoomed" if self._opts.get("zoomed") else "normal"
        self._opts["withdrawn"] = newstate == "withdrawn"
        self._opts["zoomed"] = newstate == "zoomed"
        _mark()

    wm_state = state

    def withdraw(self):
        self.state("withdrawn")

    wm_withdraw = withdraw

    def deiconify(self):
        self.state("normal")

    wm_deiconify = deiconify

    def iconify(self):
        pass

    def iconbitmap(self, *args, **kw):
        pass

    def iconphoto(self, *args, **kw):
        pass

    wm_iconbitmap = iconbitmap
    wm_iconphoto = iconphoto

    def attributes(self, *args, **kw):
        if len(args) == 2 and args[0] in ("-topmost", "-alpha", "-fullscreen"):
            self._opts["attr" + args[0]] = args[1]
            _mark()
        return ""

    wm_attributes = attributes

    def overrideredirect(self, flag=None):
        return False

    wm_overrideredirect = overrideredirect

    def transient(self, master=None):
        pass

    wm_transient = transient

    def frame(self):
        return "0x0"

    def positionfrom(self, who=None):
        pass

    def sizefrom(self, who=None):
        pass

    def aspect(self, *args):
        pass


class Tk(Misc, Wm):
    _type = "Tk"
    _container = True

    def __init__(self, screenName=None, baseName=None, className="Tk", useTk=True, sync=False, use=None):
        global _state, _default_root
        if _state is not None and not _state.alive:
            _state = None
        s = _st()
        self._init(None, None, {})
        self._wm_init()
        if s.root is None:
            s.root = self
            _default_root = self

    def destroy(self):
        global _default_root
        s = _st()
        Misc.destroy(self)
        if s.root is self:
            s.alive = False
            for handle in list(s.afters.values()):
                _js.clearTimeout(handle)
            s.afters.clear()
            _default_root = None
            _flush(force=True)
            _js.smokiAppClosed()

    def report_callback_exception(self, exc, val, tb):
        print("Exception in Tkinter callback", file=_sys.stderr)
        _traceback.print_exception(exc, val, tb)

    def loadtk(self):
        pass

    def readprofile(self, baseName, className):
        pass


def Tcl(screenName=None, baseName=None, className="Tk", useTk=False):
    return Tk()


class Widget(Misc):
    def __init__(self, master=None, cnf=None, **kw):
        if master is None:
            master = _get_default_root()
        self._init(master, cnf, kw)


BaseWidget = Widget


class Toplevel(Widget, Wm):
    _type = "Toplevel"
    _container = True

    def __init__(self, master=None, cnf=None, **kw):
        Widget.__init__(self, master, cnf, **kw)
        self._wm_init()


class Frame(Widget):
    _type = "Frame"
    _container = True


class LabelFrame(Widget):
    _type = "LabelFrame"
    _container = True


class Label(Widget):
    _type = "Label"


class Message(Widget):
    _type = "Message"


class Button(Widget):
    _type = "Button"

    def flash(self):
        pass


class Entry(Widget):
    _type = "Entry"

    def _init(self, master, cnf, kw):
        self._value = ""
        Misc._init(self, master, cnf, kw)

    def _text(self):
        v = self._var("textvariable")
        return str(v.get()) if v is not None else self._value

    def _set_text(self, text):
        v = self._var("textvariable")
        if v is not None:
            v.set(text)
        else:
            self._value = text
        _mark()

    def _index(self, index, text):
        if index in ("end", END):
            return len(text)
        if index in ("insert", "anchor", "sel.first", "sel.last"):
            return len(text)
        try:
            return max(0, min(len(text), int(index)))
        except (TypeError, ValueError):
            return len(text)

    def get(self):
        return self._text()

    def insert(self, index, string):
        if self.cget("state") == "disabled":
            return
        t = self._text()
        i = self._index(index, t)
        self._set_text(t[:i] + str(string) + t[i:])

    def delete(self, first, last=None):
        if self.cget("state") == "disabled":
            return
        t = self._text()
        i = self._index(first, t)
        j = self._index(last, t) if last is not None else i + 1
        self._set_text(t[:i] + t[j:])

    def icursor(self, index):
        pass

    def index(self, index):
        return self._index(index, self._text())

    def select_range(self, start, end):
        pass

    selection_range = select_range

    def select_clear(self):
        pass

    selection_clear = select_clear

    def select_present(self):
        return False

    selection_present = select_present

    def xview(self, *args):
        pass

    xview_moveto = xview_scroll = xview

    def _ui_value(self, value, msg):
        self._set_text(str(value))

    def _extra(self):
        return {"value": self._text()}


class Spinbox(Entry):
    _type = "Spinbox"

    def _ui_value(self, value, msg):
        self._set_text(str(value))
        if msg.get("step") and self._command:
            _call(self._command)

    def _init(self, master, cnf, kw):
        Entry._init(self, master, cnf, kw)
        if self._var("textvariable") is None and not self._value:
            values = self._opts.get("values")
            if values:
                self._value = str(list(values)[0] if not isinstance(values, str) else values.split()[0])
            else:
                self._value = str(self._opts.get("from", 0))


class Text(Widget):
    _type = "Text"

    def _init(self, master, cnf, kw):
        self._value = ""
        Misc._init(self, master, cnf, kw)

    def _offset(self, index):
        t = self._value + "\n"
        idx = str(index).strip()
        m = _re.match(r"^([^\s+\-]+)(.*)$", idx)
        base, rest = (m.group(1), m.group(2)) if m else (idx, "")
        if base in ("end", "insert", "current") or base.startswith("sel"):
            pos = len(t) if base == "end" else len(self._value)
        elif "." in base:
            line, col = base.split(".", 1)
            lines = t.split("\n")
            line = max(1, min(int(line), len(lines)))
            start = sum(len(x) + 1 for x in lines[:line - 1])
            pos = start + (len(lines[line - 1]) if col == "end" else min(int(col), len(lines[line - 1])))
        else:
            try:
                pos = int(base)
            except ValueError:
                pos = len(self._value)
        for mm in _re.finditer(r"([+-])\s*(\d+)\s*(chars|char|c|lines|line|l)\b|(linestart|lineend|wordstart|wordend)", rest):
            if mm.group(4) == "linestart":
                pos = t.rfind("\n", 0, pos) + 1
            elif mm.group(4) == "lineend":
                e = t.find("\n", pos)
                pos = len(t) - 1 if e < 0 else e
            elif mm.group(4):
                pass
            else:
                n = int(mm.group(2)) * (1 if mm.group(1) == "+" else -1)
                if mm.group(3).startswith("c"):
                    pos += n
                else:
                    ls = t.rfind("\n", 0, pos) + 1
                    col = pos - ls
                    lines = t.split("\n")
                    cur = t.count("\n", 0, pos)
                    target = max(0, min(len(lines) - 1, cur + n))
                    start = sum(len(x) + 1 for x in lines[:target])
                    pos = start + min(col, len(lines[target]))
        return max(0, min(len(t), pos))

    def get(self, index1, index2=None):
        t = self._value + "\n"
        i = self._offset(index1)
        j = self._offset(index2) if index2 is not None else i + 1
        return t[i:j]

    def insert(self, index, chars, *args):
        if self.cget("state") == "disabled":
            return
        i = min(self._offset(index), len(self._value))
        self._value = self._value[:i] + str(chars) + self._value[i:]
        _mark()

    def delete(self, index1, index2=None):
        if self.cget("state") == "disabled":
            return
        i = min(self._offset(index1), len(self._value))
        j = min(self._offset(index2) if index2 is not None else i + 1, len(self._value))
        if j > i:
            self._value = self._value[:i] + self._value[j:]
            _mark()

    def replace(self, index1, index2, chars, *args):
        self.delete(index1, index2)
        self.insert(index1, chars)

    def index(self, index):
        pos = self._offset(index)
        t = self._value + "\n"
        line = t.count("\n", 0, pos) + 1
        col = pos - (t.rfind("\n", 0, pos) + 1)
        return "%d.%d" % (line, col)

    def see(self, index):
        self._opts["_see"] = str(index)

    def mark_set(self, name, index):
        pass

    def mark_unset(self, *names):
        pass

    def tag_add(self, *args):
        pass

    tag_remove = tag_delete = tag_raise = tag_lower = tag_add

    def tag_configure(self, *args, **kw):
        pass

    tag_config = tag_configure

    def tag_bind(self, *args, **kw):
        pass

    def tag_ranges(self, tag):
        return ()

    def search(self, pattern, index, stopindex=None, **kw):
        t = self._value
        i = t.find(pattern, self._offset(index))
        return self.index(i) if i >= 0 else ""

    def edit_undo(self):
        pass

    edit_redo = edit_reset = edit_separator = edit_undo

    def edit_modified(self, arg=None):
        return False

    def yview(self, *args):
        pass

    xview = yview_moveto = yview_scroll = yview

    def _ui_value(self, value, msg):
        self._value = str(value)
        _mark()

    def _extra(self):
        return {"value": self._value}


class Checkbutton(Widget):
    _type = "Checkbutton"

    def _init(self, master, cnf, kw):
        Misc._init(self, master, cnf, kw)
        if self._var("variable") is None:
            self._opts["variable"] = IntVar(value=0)

    def _on(self):
        return self._opts.get("onvalue", 1)

    def _off(self):
        return self._opts.get("offvalue", 0)

    def select(self):
        self._var("variable").set(self._on())

    def deselect(self):
        self._var("variable").set(self._off())

    def toggle(self):
        v = self._var("variable")
        v.set(self._off() if _eq(v.get(), self._on()) else self._on())

    def invoke(self):
        if self.cget("state") == "disabled":
            return
        self.toggle()
        if self._command:
            return _call(self._command)

    def _extra(self):
        v = self._var("variable")
        try:
            return {"checked": _eq(v.get(), self._on())}
        except TclError:
            return {"checked": False}


class Radiobutton(Widget):
    _type = "Radiobutton"

    def _init(self, master, cnf, kw):
        Misc._init(self, master, cnf, kw)
        if self._var("variable") is None:
            s = _st()
            shared = s.vars.get("selectedButton") or StringVar(name="selectedButton")
            self._opts["variable"] = shared

    def select(self):
        self._var("variable").set(self._opts.get("value", ""))

    def deselect(self):
        self._var("variable").set("")

    def invoke(self):
        if self.cget("state") == "disabled":
            return
        self.select()
        if self._command:
            return _call(self._command)

    def _extra(self):
        v = self._var("variable")
        try:
            return {"checked": _eq(v.get(), self._opts.get("value", ""))}
        except TclError:
            return {"checked": False}


class Scale(Widget):
    _type = "Scale"

    def _init(self, master, cnf, kw):
        self._value = 0
        Misc._init(self, master, cnf, kw)
        self._value = self._clamp(self.cget("from"))

    def _clamp(self, v):
        lo, hi = float(self.cget("from")), float(self.cget("to"))
        if lo > hi:
            lo, hi = hi, lo
        v = max(lo, min(hi, float(v)))
        res = float(self.cget("resolution") or 0)
        if res > 0:
            v = round(v / res) * res
        return int(v) if res >= 1 or res == 0 and v == int(v) else v

    def get(self):
        v = self._var("variable")
        if v is not None:
            try:
                return self._clamp(v.get())
            except (TclError, ValueError):
                return self._value
        return self._value

    def set(self, value):
        value = self._clamp(value)
        v = self._var("variable")
        if v is not None:
            v.set(value)
        self._value = value
        _mark()

    def _ui_value(self, value, msg):
        self.set(value)
        if self._command:
            _call(self._command, str(self.get()))

    def coords(self, value=None):
        return (0, 0)

    def _extra(self):
        return {"value": self.get()}


class Listbox(Widget):
    _type = "Listbox"

    def _init(self, master, cnf, kw):
        self._items = []
        self._sel = set()
        Misc._init(self, master, cnf, kw)
        lv = self._var("listvariable")
        if lv is not None and lv.get():
            v = lv.get()
            self._items = [str(x) for x in (v if isinstance(v, (list, tuple)) else str(v).split())]

    def _i(self, index, insert=False):
        if index in ("end", END):
            return len(self._items) if insert else len(self._items) - 1
        if index in ("active", "anchor"):
            return min(self._sel) if self._sel else 0
        return int(index)

    def insert(self, index, *elements):
        i = self._i(index, insert=True)
        for k, e in enumerate(elements):
            self._items.insert(i + k, str(e))
        self._sel = {x + len(elements) if x >= i else x for x in self._sel}
        _mark()

    def delete(self, first, last=None):
        if not self._items:
            return
        i = self._i(first)
        j = self._i(last) if last is not None else i
        del self._items[i:j + 1]
        n = j - i + 1
        self._sel = {x - n if x > j else x for x in self._sel if not i <= x <= j}
        _mark()

    def get(self, first, last=None):
        if last is None:
            i = self._i(first)
            return self._items[i] if 0 <= i < len(self._items) else ""
        return tuple(self._items[self._i(first):self._i(last) + 1])

    def size(self):
        return len(self._items)

    def curselection(self):
        return tuple(sorted(self._sel))

    def selection_set(self, first, last=None):
        i = self._i(first)
        j = self._i(last) if last is not None else i
        self._sel.update(range(i, j + 1))
        _mark()

    select_set = selection_set

    def selection_clear(self, first, last=None):
        i = self._i(first)
        j = self._i(last) if last is not None else i
        self._sel.difference_update(range(i, j + 1))
        _mark()

    select_clear = selection_clear

    def selection_includes(self, index):
        return self._i(index) in self._sel

    select_includes = selection_includes

    def selection_anchor(self, index):
        pass

    select_anchor = selection_anchor

    def activate(self, index):
        pass

    def see(self, index):
        pass

    def index(self, index):
        return self._i(index)

    def nearest(self, y):
        return max(0, min(len(self._items) - 1, int(y) // 18))

    def itemconfigure(self, index, cnf=None, **kw):
        pass

    itemconfig = itemconfigure

    def yview(self, *args):
        pass

    xview = yview_moveto = yview_scroll = yview

    def _ui_value(self, value, msg):
        self._sel = {int(x) for x in (value or []) if 0 <= int(x) < len(self._items)}
        _mark()
        _fire_virtual(self, "<<ListboxSelect>>")

    def _extra(self):
        return {"items": self._items, "selection": sorted(self._sel)}


class Scrollbar(Widget):
    _type = "Scrollbar"

    def set(self, first, last):
        pass

    def get(self):
        return (0.0, 1.0)


class Canvas(Widget):
    _type = "Canvas"

    def _init(self, master, cnf, kw):
        self._items = {}
        self._item_order = []
        self._next = 1
        self._tag_binds = {}
        Misc._init(self, master, cnf, kw)

    # items
    def _create(self, kind, args, kw):
        coords = []
        for a in args:
            if isinstance(a, (list, tuple)):
                for b in a:
                    if isinstance(b, (list, tuple)):
                        coords.extend(float(c) for c in b)
                    else:
                        coords.append(float(b))
            else:
                coords.append(float(a))
        iid = self._next
        self._next += 1
        opts = _opts(None, kw)
        tags = opts.pop("tags", opts.pop("tag", ()))
        if isinstance(tags, str):
            tags = tags.split()
        if kind in ("image", "bitmap"):
            _warn("image", "pictures (PhotoImage) are not shown in the browser version.")
        if kind == "window":
            _warn("canvaswindow", "create_window() is not supported yet; place widgets with pack/grid/place instead.")
        if "font" in opts:
            opts["font"] = _jv(opts["font"])
        self._items[iid] = {"type": kind, "coords": coords, "opts": opts, "tags": list(tags)}
        self._item_order.append(iid)
        _mark()
        return iid

    def create_line(self, *args, **kw):
        return self._create("line", args, kw)

    def create_rectangle(self, *args, **kw):
        return self._create("rectangle", args, kw)

    def create_oval(self, *args, **kw):
        return self._create("oval", args, kw)

    def create_polygon(self, *args, **kw):
        return self._create("polygon", args, kw)

    def create_text(self, *args, **kw):
        return self._create("text", args, kw)

    def create_arc(self, *args, **kw):
        return self._create("arc", args, kw)

    def create_image(self, *args, **kw):
        return self._create("image", args, kw)

    def create_bitmap(self, *args, **kw):
        return self._create("bitmap", args, kw)

    def create_window(self, *args, **kw):
        return self._create("window", args, kw)

    def _find(self, tag):
        if tag is None:
            return []
        if isinstance(tag, int) or (isinstance(tag, str) and tag.isdigit()):
            return [int(tag)] if int(tag) in self._items else []
        if tag in ("all", ALL):
            return list(self._item_order)
        return [i for i in self._item_order if tag in self._items[i]["tags"]]

    def coords(self, tagOrId, *args):
        ids = self._find(tagOrId)
        if not ids:
            return []
        if not args:
            return list(self._items[ids[0]]["coords"])
        coords = []
        for a in args:
            if isinstance(a, (list, tuple)):
                coords.extend(float(c) for c in a)
            else:
                coords.append(float(a))
        self._items[ids[0]]["coords"] = coords
        _mark()

    def move(self, tagOrId, xAmount, yAmount):
        for i in self._find(tagOrId):
            c = self._items[i]["coords"]
            self._items[i]["coords"] = [v + (float(xAmount) if k % 2 == 0 else float(yAmount)) for k, v in enumerate(c)]
        _mark()

    def moveto(self, tagOrId, x="", y=""):
        box = self.bbox(tagOrId)
        if not box:
            return
        dx = float(x) - box[0] if x != "" else 0
        dy = float(y) - box[1] if y != "" else 0
        self.move(tagOrId, dx, dy)

    def delete(self, *tags):
        for tag in tags:
            for i in self._find(tag):
                self._items.pop(i, None)
                if i in self._item_order:
                    self._item_order.remove(i)
        _mark()

    def itemconfigure(self, tagOrId, cnf=None, **kw):
        ids = self._find(tagOrId)
        if cnf is None and not kw:
            return dict(self._items[ids[0]]["opts"]) if ids else {}
        opts = _opts(cnf, kw)
        if "font" in opts:
            opts["font"] = _jv(opts["font"])
        for i in ids:
            tags = opts.pop("tags", None)
            if tags is not None:
                self._items[i]["tags"] = tags.split() if isinstance(tags, str) else list(tags)
            self._items[i]["opts"].update(opts)
        _mark()

    itemconfig = itemconfigure

    def itemcget(self, tagOrId, option):
        ids = self._find(tagOrId)
        return self._items[ids[0]]["opts"].get(_ALIASES.get(option, option), "") if ids else ""

    def type(self, tagOrId):
        ids = self._find(tagOrId)
        return self._items[ids[0]]["type"] if ids else None

    def gettags(self, tagOrId):
        ids = self._find(tagOrId)
        return tuple(self._items[ids[0]]["tags"]) if ids else ()

    def addtag_withtag(self, newtag, tagOrId):
        for i in self._find(tagOrId):
            if newtag not in self._items[i]["tags"]:
                self._items[i]["tags"].append(newtag)

    def addtag_all(self, newtag):
        self.addtag_withtag(newtag, "all")

    def dtag(self, tagOrId, tagToDelete=None):
        for i in self._find(tagOrId):
            t = tagToDelete or tagOrId
            if t in self._items[i]["tags"]:
                self._items[i]["tags"].remove(t)

    def find_all(self):
        return tuple(self._item_order)

    def find_withtag(self, tagOrId):
        return tuple(self._find(tagOrId))

    def _box(self, i):
        it = self._items[i]
        c = it["coords"]
        if not c:
            return None
        if it["type"] == "text":
            text = str(it["opts"].get("text", ""))
            lines = text.split("\n")
            w = max(len(l) for l in lines) * 7
            h = len(lines) * 15
            anchor = str(it["opts"].get("anchor", "center"))
            x = c[0] - (0 if "w" in anchor else w if "e" in anchor else w / 2)
            y = c[1] - (0 if "n" in anchor else h if "s" in anchor else h / 2)
            return (x, y, x + w, y + h)
        xs, ys = c[0::2], c[1::2]
        pad = float(it["opts"].get("width", 1) or 1) / 2
        return (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)

    def bbox(self, *tags):
        boxes = [self._box(i) for t in (tags or ("all",)) for i in self._find(t)]
        boxes = [b for b in boxes if b]
        if not boxes:
            return None
        return (int(min(b[0] for b in boxes)), int(min(b[1] for b in boxes)),
                int(max(b[2] for b in boxes)) + 1, int(max(b[3] for b in boxes)) + 1)

    def find_overlapping(self, x1, y1, x2, y2):
        out = []
        for i in self._item_order:
            b = self._box(i)
            if b and b[0] <= float(x2) and b[2] >= float(x1) and b[1] <= float(y2) and b[3] >= float(y1):
                out.append(i)
        return tuple(out)

    def find_enclosed(self, x1, y1, x2, y2):
        out = []
        for i in self._item_order:
            b = self._box(i)
            if b and b[0] >= float(x1) and b[2] <= float(x2) and b[1] >= float(y1) and b[3] <= float(y2):
                out.append(i)
        return tuple(out)

    def find_closest(self, x, y, halo=None, start=None):
        best, dist = None, None
        for i in self._item_order:
            b = self._box(i)
            if not b:
                continue
            dx = max(b[0] - float(x), 0, float(x) - b[2])
            dy = max(b[1] - float(y), 0, float(y) - b[3])
            d = dx * dx + dy * dy
            if dist is None or d <= dist:
                best, dist = i, d
        return (best,) if best is not None else ()

    def find_above(self, tagOrId):
        ids = self._find(tagOrId)
        if not ids:
            return ()
        k = self._item_order.index(ids[-1])
        return (self._item_order[k + 1],) if k + 1 < len(self._item_order) else ()

    def find_below(self, tagOrId):
        ids = self._find(tagOrId)
        if not ids:
            return ()
        k = self._item_order.index(ids[0])
        return (self._item_order[k - 1],) if k > 0 else ()

    def tag_raise(self, tagOrId, aboveThis=None):
        ids = self._find(tagOrId)
        self._item_order = [i for i in self._item_order if i not in ids] + ids
        _mark()

    lift = tag_raise

    def tag_lower(self, tagOrId, belowThis=None):
        ids = self._find(tagOrId)
        self._item_order = ids + [i for i in self._item_order if i not in ids]
        _mark()

    def tag_bind(self, tagOrId, sequence=None, func=None, add=None):
        binds = self._tag_binds.setdefault(str(tagOrId), {})
        if func is None:
            return binds.get(sequence)
        funcs = binds.setdefault(sequence, [])
        if not add:
            funcs.clear()
        funcs.append(func)
        _mark()
        return "f" + str(id(func))

    def tag_unbind(self, tagOrId, sequence, funcid=None):
        self._tag_binds.get(str(tagOrId), {}).pop(sequence, None)

    def _hit(self, x, y):
        for i in reversed(self._item_order):
            b = self._box(i)
            if not b or not (b[0] <= x <= b[2] and b[1] <= y <= b[3]):
                continue
            it = self._items[i]
            if it["type"] == "oval":
                cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                rx, ry = max((b[2] - b[0]) / 2, 1), max((b[3] - b[1]) / 2, 1)
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1:
                    continue
            return i
        return None

    def _item_event(self, kind, ev):
        i = self._hit(float(ev.x), float(ev.y))
        if i is None:
            return
        for key in [str(i)] + list(self._items[i]["tags"]) + ["all"]:
            binds = self._tag_binds.get(key)
            if binds and _run_binds(binds, kind, ev) == "break":
                return

    def canvasx(self, x, gridspacing=None):
        return float(x)

    def canvasy(self, y, gridspacing=None):
        return float(y)

    def xview(self, *args):
        pass

    yview = xview_moveto = yview_moveto = xview_scroll = yview_scroll = xview

    def postscript(self, *args, **kw):
        _warn("ps", "postscript() is not available in the browser version.")
        return ""

    def _extra(self):
        items = []
        for i in self._item_order:
            it = self._items[i]
            items.append({"id": i, "type": it["type"], "coords": it["coords"],
                          "opts": {k: _jv(v) for k, v in it["opts"].items()}})
        return {"items": items}


class Menu(Widget):
    _type = "Menu"

    def _init(self, master, cnf, kw):
        self._entries = []
        Misc._init(self, master, cnf, kw)

    def add(self, itemType, cnf=None, **kw):
        e = _opts(cnf, kw)
        e["type"] = itemType
        if itemType == "checkbutton" and not isinstance(e.get("variable"), Variable):
            e["variable"] = IntVar(value=0)
        self._entries.append(e)
        _mark()

    def add_command(self, cnf=None, **kw):
        self.add("command", cnf, **kw)

    def add_separator(self, cnf=None, **kw):
        self.add("separator", cnf, **kw)

    def add_cascade(self, cnf=None, **kw):
        self.add("cascade", cnf, **kw)

    def add_checkbutton(self, cnf=None, **kw):
        self.add("checkbutton", cnf, **kw)

    def add_radiobutton(self, cnf=None, **kw):
        self.add("radiobutton", cnf, **kw)

    def insert(self, index, itemType, cnf=None, **kw):
        e = _opts(cnf, kw)
        e["type"] = itemType
        self._entries.insert(self.index(index) if index != "end" else len(self._entries), e)
        _mark()

    def insert_command(self, index, cnf=None, **kw):
        self.insert(index, "command", cnf, **kw)

    def insert_separator(self, index, cnf=None, **kw):
        self.insert(index, "separator", cnf, **kw)

    def index(self, index):
        if index in ("end", "last", END):
            return len(self._entries) - 1
        if isinstance(index, str) and not index.isdigit():
            for k, e in enumerate(self._entries):
                if e.get("label") == index:
                    return k
            return None
        return int(index)

    def delete(self, index1, index2=None):
        i = self.index(index1)
        j = self.index(index2) if index2 is not None else i
        if i is not None:
            del self._entries[i:j + 1]
        _mark()

    def entryconfigure(self, index, cnf=None, **kw):
        i = self.index(index)
        if i is not None:
            self._entries[i].update(_opts(cnf, kw))
        _mark()

    entryconfig = entryconfigure

    def entrycget(self, index, option):
        i = self.index(index)
        return self._entries[i].get(option) if i is not None else ""

    def type(self, index):
        i = self.index(index)
        return self._entries[i]["type"] if i is not None else None

    def invoke(self, index):
        i = self.index(index)
        if i is None or i >= len(self._entries):
            return
        e = self._entries[i]
        if e.get("state") == "disabled":
            return
        v = e.get("variable")
        if e["type"] == "checkbutton" and isinstance(v, Variable):
            on, off = e.get("onvalue", 1), e.get("offvalue", 0)
            v.set(off if _eq(v.get(), on) else on)
        if e["type"] == "radiobutton" and isinstance(v, Variable):
            v.set(e.get("value", e.get("label", "")))
        if callable(e.get("command")):
            return _call(e["command"])

    def post(self, x, y):
        _st().popup = {"id": self._w, "x": int(x), "y": int(y)}
        _mark()
        _flush()

    def tk_popup(self, x, y, entry=""):
        self.post(x, y)

    def unpost(self):
        pass

    def _extra(self):
        out = []
        for e in self._entries:
            item = {"type": e["type"], "label": str(e.get("label", "")), "accelerator": str(e.get("accelerator", "")),
                    "state": e.get("state", "normal")}
            if isinstance(e.get("menu"), Menu):
                item["menu"] = e["menu"]._w
            v = e.get("variable")
            if e["type"] == "checkbutton" and isinstance(v, Variable):
                item["checked"] = _eq(v.get(), e.get("onvalue", 1))
            if e["type"] == "radiobutton" and isinstance(v, Variable):
                item["checked"] = _eq(v.get(), e.get("value", e.get("label", "")))
            out.append(item)
        return {"entries": out}


class Menubutton(Button):
    _type = "Menubutton"

    def invoke(self):
        menu = self._opts.get("menu")
        if isinstance(menu, Menu):
            menu.post(0, 0)


class OptionMenu(Widget):
    _type = "OptionMenu"

    def __init__(self, master, variable, value=None, *values, **kwargs):
        cmd = kwargs.pop("command", None)
        Widget.__init__(self, master, None, **kwargs)
        self._opts["variable"] = variable
        self._values = [v for v in ((value,) + values) if v is not None]
        self._cmd = cmd
        self["menu"] = None

    def _ui_value(self, value, msg):
        self._opts["variable"].set(value)
        if self._cmd:
            _call(self._cmd, value)

    def _extra(self):
        v = self._var("variable")
        return {"values": [str(x) for x in self._values], "value": str(v.get()) if v is not None else ""}


class PanedWindow(Frame):
    _type = "Frame"

    def add(self, child, **kw):
        side = "left" if str(self.cget("orient")) == "horizontal" else "top"
        child.pack(side=side, fill="both", expand=True)

    paneconfigure = paneconfig = lambda self, *a, **k: None


class PhotoImage:
    def __init__(self, name=None, cnf={}, master=None, **kw):
        _warn("image", "pictures (PhotoImage) are not shown in the browser version.")
        self._w = int(kw.get("width", 0) or 0)
        self._h = int(kw.get("height", 0) or 0)

    def width(self):
        return self._w

    def height(self):
        return self._h

    def subsample(self, *a, **k):
        return self

    zoom = copy = subsample

    def put(self, *a, **k):
        pass

    def configure(self, *a, **k):
        pass

    config = blank = configure

    def __str__(self):
        return "image"


BitmapImage = PhotoImage


def image_names():
    return ()


def image_types():
    return ("photo", "bitmap")


class _setit:
    def __init__(self, var, value, callback=None):
        self._var, self._value, self._callback = var, value, callback

    def __call__(self, *args):
        self._var.set(self._value)
        if self._callback:
            self._callback(self._value, *args)


# Keep "from tkinter import *" close to the real module
Grid = Pack = Place = object
`;

  const TTK = String.raw`"""tkinter.ttk for Smoki's Code: the themed widgets, drawn like Windows."""
import tkinter as _tk
from tkinter import _st, _mark, _call, _fire_virtual, _opts, Misc, Variable, IntVar, DoubleVar, StringVar, TclError

__all__ = ["Button", "Checkbutton", "Combobox", "Entry", "Frame", "Label", "Labelframe", "LabelFrame",
           "Menubutton", "Notebook", "Panedwindow", "PanedWindow", "Progressbar", "Radiobutton", "Scale",
           "Scrollbar", "Separator", "Sizegrip", "Spinbox", "Style", "Treeview", "OptionMenu", "LabeledScale"]


class Style:
    def __init__(self, master=None):
        self._theme = "vista"

    def configure(self, style, query_opt=None, **kw):
        return {} if query_opt is None else ""

    def map(self, style, query_opt=None, **kw):
        return {}

    def lookup(self, style, option, state=None, default=None):
        return default or ""

    def layout(self, style, layoutspec=None):
        return []

    def element_create(self, *args, **kw):
        pass

    def element_names(self):
        return ()

    def theme_create(self, *args, **kw):
        pass

    def theme_settings(self, *args, **kw):
        pass

    def theme_names(self):
        return ("winnative", "clam", "alt", "default", "classic", "vista", "xpnative")

    def theme_use(self, themename=None):
        if themename is None:
            return self._theme
        self._theme = themename


class _Ttk:
    _ttk = True

    def state(self, statespec=None):
        if statespec is None:
            st = self.cget("state")
            return (st,) if st and st != "normal" else ()
        for s in statespec:
            if s in ("disabled", "readonly"):
                self._opts["state"] = s
            elif s in ("!disabled", "!readonly"):
                self._opts["state"] = "normal"
        _mark()

    def instate(self, statespec, callback=None, *args, **kw):
        cur = self.state()
        ok = all((s[1:] not in cur) if s.startswith("!") else (s in cur) for s in statespec)
        if ok and callback:
            return callback(*args, **kw)
        return ok


class Button(_Ttk, _tk.Button):
    pass


class Label(_Ttk, _tk.Label):
    pass


class Entry(_Ttk, _tk.Entry):
    pass


class Frame(_Ttk, _tk.Frame):
    pass


class LabelFrame(_Ttk, _tk.LabelFrame):
    pass


Labelframe = LabelFrame


class Checkbutton(_Ttk, _tk.Checkbutton):
    pass


class Radiobutton(_Ttk, _tk.Radiobutton):
    pass


class Scale(_Ttk, _tk.Scale):
    def _init(self, master, cnf, kw):
        kw.setdefault("orient", "horizontal")
        _tk.Scale._init(self, master, cnf, kw)
        self._opts.setdefault("showvalue", 0)
        self._opts.setdefault("resolution", 0)

    def _clamp(self, v):
        lo, hi = float(self.cget("from")), float(self.cget("to"))
        if lo > hi:
            lo, hi = hi, lo
        return max(lo, min(hi, float(v)))


class Spinbox(_Ttk, _tk.Spinbox):
    pass


class Scrollbar(_Ttk, _tk.Scrollbar):
    pass


class Menubutton(_Ttk, _tk.Menubutton):
    pass


class Separator(_Ttk, Misc):
    _type = "Separator"

    def __init__(self, master=None, **kw):
        _tk.Widget.__init__(self, master, None, **kw)


class Sizegrip(_Ttk, _tk.Frame):
    pass


class Panedwindow(_Ttk, _tk.PanedWindow):
    def insert(self, pos, child, **kw):
        self.add(child, **kw)


PanedWindow = Panedwindow


class Combobox(_Ttk, _tk.Entry):
    _type = "Combobox"

    def _values(self):
        v = self._opts.get("values") or ()
        return [str(x) for x in (v.split() if isinstance(v, str) else v)]

    def current(self, newindex=None):
        values = self._values()
        if newindex is None:
            t = self._text()
            return values.index(t) if t in values else -1
        self._set_text(values[int(newindex)])

    def set(self, value):
        self._set_text(str(value))

    def _ui_value(self, value, msg):
        self._set_text(str(value))
        if msg.get("select"):
            _fire_virtual(self, "<<ComboboxSelected>>")

    def _extra(self):
        return {"value": self._text(), "values": self._values()}


class Progressbar(_Ttk, Misc):
    _type = "Progressbar"

    def __init__(self, master=None, **kw):
        _tk.Widget.__init__(self, master, None, **kw)
        self._timer = None

    def _get(self):
        v = self._var("variable")
        if v is not None:
            try:
                return float(v.get())
            except (TclError, ValueError):
                return 0.0
        return float(self._opts.get("value", 0) or 0)

    def _put(self, value):
        v = self._var("variable")
        if v is not None:
            v.set(value)
        self._opts["value"] = value
        _mark()

    def cget(self, key):
        if key == "value":
            return self._get()
        return Misc.cget(self, key)

    __getitem__ = cget

    def step(self, amount=1.0):
        maximum = float(self._opts.get("maximum", 100) or 100)
        v = self._get() + float(amount)
        if v >= maximum:
            v -= maximum
        self._put(v)

    def start(self, interval=50):
        self.stop()
        self._opts["running"] = True
        _mark()

        def tick():
            if self._opts.get("running") and not self._destroyed:
                self.step(1)
                self._timer = self.after(int(interval), tick)

        self._timer = self.after(int(interval), tick)

    def stop(self):
        self._opts["running"] = False
        if self._timer:
            self.after_cancel(self._timer)
            self._timer = None
        _mark()

    def _extra(self):
        return {"value": self._get()}


class Notebook(_Ttk, Misc):
    _type = "Notebook"
    _container = True

    def __init__(self, master=None, **kw):
        _tk.Widget.__init__(self, master, None, **kw)
        self._tabs = []
        self._current = None

    def add(self, child, **kw):
        for t in self._tabs:
            if t["child"] is child:
                t.update(kw)
                _mark()
                return
        tab = dict(kw)
        tab["child"] = child
        self._tabs.append(tab)
        child._manager = "notebook"
        if self._current is None:
            self._current = child
        _mark()

    def insert(self, pos, child, **kw):
        self.add(child, **kw)

    def _tab_index(self, tab_id):
        if isinstance(tab_id, int):
            return tab_id
        if tab_id in ("current",):
            return self.index("current")
        for k, t in enumerate(self._tabs):
            if t["child"] is tab_id or str(t["child"]) == str(tab_id):
                return k
        return None

    def select(self, tab_id=None):
        if tab_id is None:
            return str(self._current) if self._current is not None else ""
        k = self._tab_index(tab_id)
        if k is not None and k < len(self._tabs):
            self._current = self._tabs[k]["child"]
            _mark()
            _fire_virtual(self, "<<NotebookTabChanged>>")

    def index(self, tab_id):
        if tab_id == "end":
            return len(self._tabs)
        if tab_id == "current":
            for k, t in enumerate(self._tabs):
                if t["child"] is self._current:
                    return k
            return -1
        return self._tab_index(tab_id)

    def tab(self, tab_id, option=None, **kw):
        k = self._tab_index(tab_id)
        if k is None:
            return None
        if kw:
            self._tabs[k].update(kw)
            _mark()
            return None
        info = {x: y for x, y in self._tabs[k].items() if x != "child"}
        return info.get(option) if option else info

    def tabs(self):
        return tuple(str(t["child"]) for t in self._tabs)

    def forget(self, tab_id):
        k = self._tab_index(tab_id)
        if k is None:
            return
        child = self._tabs.pop(k)["child"]
        child._manager = None
        if self._current is child:
            self._current = self._tabs[0]["child"] if self._tabs else None
        _mark()

    hide = forget

    def enable_traversal(self):
        pass

    def _ui_tab(self, index):
        self.select(int(index))

    def _extra(self):
        return {"tabs": [{"id": t["child"]._w, "text": str(t.get("text", "")), "state": t.get("state", "normal")} for t in self._tabs
                         if not t["child"]._destroyed],
                "selected": self._current._w if self._current is not None else None}


class Treeview(_Ttk, Misc):
    _type = "Treeview"

    def __init__(self, master=None, **kw):
        _tk.Widget.__init__(self, master, None, **kw)
        self._nodes = {"": {"text": "", "values": [], "children": [], "parent": None, "open": True, "tags": []}}
        self._headings = {}
        self._columns_cfg = {}
        self._sel = []
        self._focus = ""
        self._n = 0

    def _colnames(self):
        c = self._opts.get("columns") or ()
        return list(c.split() if isinstance(c, str) else c)

    def insert(self, parent, index, iid=None, **kw):
        if iid is None:
            self._n += 1
            iid = "I%03X" % self._n
        iid = str(iid)
        if iid in self._nodes:
            raise TclError('Item %s already exists' % iid)
        vals = kw.get("values", ())
        node = {"text": str(kw.get("text", "")), "values": list(vals if isinstance(vals, (list, tuple)) else [vals]),
                "children": [], "parent": parent, "open": bool(kw.get("open", False)), "tags": kw.get("tags", ())}
        self._nodes[iid] = node
        kids = self._nodes[parent]["children"]
        kids.insert(len(kids) if index in ("end", "END") else int(index), iid)
        _mark()
        return iid

    def delete(self, *items):
        for iid in items:
            iid = str(iid)
            node = self._nodes.get(iid)
            if node is None:
                continue
            for c in list(node["children"]):
                self.delete(c)
            parent = self._nodes.get(node["parent"])
            if parent and iid in parent["children"]:
                parent["children"].remove(iid)
            self._nodes.pop(iid, None)
            if iid in self._sel:
                self._sel.remove(iid)
        _mark()

    def get_children(self, item=None):
        return tuple(self._nodes.get(str(item or ""), {"children": []})["children"])

    def set_children(self, item, *newchildren):
        self._nodes[str(item)]["children"] = [str(c) for c in newchildren]
        _mark()

    def exists(self, item):
        return str(item) in self._nodes

    def parent(self, item):
        return self._nodes[str(item)]["parent"] or ""

    def index(self, item):
        node = self._nodes[str(item)]
        return self._nodes[node["parent"]]["children"].index(str(item))

    def item(self, item, option=None, **kw):
        node = self._nodes[str(item)]
        if kw:
            if "values" in kw:
                kw["values"] = list(kw["values"]) if isinstance(kw["values"], (list, tuple)) else [kw["values"]]
            node.update(kw)
            _mark()
            return None
        info = {"text": node["text"], "values": node["values"], "open": node["open"], "tags": node["tags"], "image": ""}
        return info.get(option) if option else info

    def set(self, item, column=None, value=None):
        node = self._nodes[str(item)]
        cols = self._colnames()
        if column is None:
            return {c: (node["values"][k] if k < len(node["values"]) else "") for k, c in enumerate(cols)}
        k = cols.index(column) if column in cols else int(str(column).lstrip("#")) - 1
        if value is None:
            return node["values"][k] if k < len(node["values"]) else ""
        while len(node["values"]) <= k:
            node["values"].append("")
        node["values"][k] = value
        _mark()

    def heading(self, column, option=None, **kw):
        h = self._headings.setdefault(str(column), {})
        if kw:
            h.update(kw)
            _mark()
            return None
        return h.get(option) if option else dict(h)

    def column(self, column, option=None, **kw):
        c = self._columns_cfg.setdefault(str(column), {})
        if kw:
            c.update(kw)
            _mark()
            return None
        return c.get(option) if option else dict(c)

    def selection(self, *args):
        return tuple(self._sel)

    def selection_set(self, *items):
        flat = []
        for i in items:
            flat.extend(i if isinstance(i, (list, tuple)) else [i])
        self._sel = [str(i) for i in flat]
        _mark()

    def selection_add(self, *items):
        for i in items:
            if str(i) not in self._sel:
                self._sel.append(str(i))
        _mark()

    def selection_remove(self, *items):
        self._sel = [i for i in self._sel if i not in [str(x) for x in items]]
        _mark()

    def focus(self, item=None):
        if item is None:
            return self._focus
        self._focus = str(item)

    def see(self, item):
        pass

    def move(self, item, parent, index):
        node = self._nodes[str(item)]
        self._nodes[node["parent"]]["children"].remove(str(item))
        node["parent"] = parent
        kids = self._nodes[parent]["children"]
        kids.insert(len(kids) if index == "end" else int(index), str(item))
        _mark()

    def tag_configure(self, *args, **kw):
        pass

    def tag_bind(self, *args, **kw):
        pass

    def identify_row(self, y):
        return ""

    def yview(self, *args):
        pass

    xview = yview

    def _ui_value(self, value, msg):
        self._sel = [str(v) for v in (value or []) if str(v) in self._nodes]
        self._focus = self._sel[0] if self._sel else ""
        _mark()
        _fire_virtual(self, "<<TreeviewSelect>>")

    def _extra(self):
        rows = []

        def walk(iid, depth):
            for c in self._nodes[iid]["children"]:
                n = self._nodes[c]
                rows.append({"id": c, "text": n["text"], "values": [str(v) for v in n["values"]], "depth": depth})
                walk(c, depth + 1)

        walk("", 0)
        cols = self._colnames()
        return {"columns": cols, "rows": rows, "selection": self._sel,
                "headings": {k: {"text": str(v.get("text", ""))} for k, v in self._headings.items()},
                "colcfg": {k: {"width": v.get("width"), "anchor": v.get("anchor")} for k, v in self._columns_cfg.items()}}


class OptionMenu(_tk.OptionMenu):
    _ttk = True

    def __init__(self, master, variable, default=None, *values, **kwargs):
        _tk.OptionMenu.__init__(self, master, variable, *values, **kwargs)
        if default is not None:
            variable.set(default)


class LabeledScale(Frame):
    def __init__(self, master=None, variable=None, from_=0, to=10, **kw):
        Frame.__init__(self, master, **kw)
        self.variable = variable or IntVar(value=from_)
        self.scale = Scale(self, variable=self.variable, from_=from_, to=to)
        self.scale.pack(fill="x")
        self.label = Label(self, textvariable=self.variable)
        self.label.pack()
`;

  const MESSAGEBOX = String.raw`"""tkinter.messagebox for Smoki's Code. Questions can't wait for a click
in the browser, so ask...() functions show the dialog and answer Yes/OK."""
import tkinter as _tk

INFO, WARNING, ERROR, QUESTION = "info", "warning", "error", "question"
ABORTRETRYIGNORE, OK, OKCANCEL, RETRYCANCEL, YESNO, YESNOCANCEL = "abortretryignore", "ok", "okcancel", "retrycancel", "yesno", "yesnocancel"
ABORT, RETRY, IGNORE, CANCEL, YES, NO = "abort", "retry", "ignore", "cancel", "yes", "no"


def _show(icon, title, message, buttons, result, ask=False):
    s = _tk._st()
    if ask:
        _tk._warn("ask", "message box questions can't wait for your click in the browser, so they answer " + buttons[0] + " right away.")
    s.dialogs.append({"id": _tk._uid("dlg"), "icon": icon, "title": str(title or ""), "message": str(message or ""), "buttons": buttons})
    _tk._mark()
    if s.root is not None and s.alive:
        _tk._flush()
    return result


def showinfo(title=None, message=None, **options):
    return _show("info", title, message, ["OK"], "ok")


def showwarning(title=None, message=None, **options):
    return _show("warning", title, message, ["OK"], "ok")


def showerror(title=None, message=None, **options):
    return _show("error", title, message, ["OK"], "ok")


def askquestion(title=None, message=None, **options):
    return _show("question", title, message, ["Yes", "No"], "yes", True)


def askokcancel(title=None, message=None, **options):
    return _show("question", title, message, ["OK", "Cancel"], True, True)


def askyesno(title=None, message=None, **options):
    return _show("question", title, message, ["Yes", "No"], True, True)


def askyesnocancel(title=None, message=None, **options):
    return _show("question", title, message, ["Yes", "No", "Cancel"], True, True)


def askretrycancel(title=None, message=None, **options):
    return _show("warning", title, message, ["Retry", "Cancel"], True, True)


class Message:
    def __init__(self, master=None, **options):
        self.options = options

    def show(self, **options):
        o = dict(self.options, **options)
        return showinfo(o.get("title"), o.get("message"))
`;

  const SIMPLEDIALOG = String.raw`"""tkinter.simpledialog for Smoki's Code. The answers come from the input
you type when the program starts (F5 asks for it), like input()."""
import tkinter as _tk


def _ask(prompt, convert):
    try:
        text = input(str(prompt) + " ")
    except EOFError:
        return None
    try:
        return convert(text)
    except ValueError:
        return None


def askstring(title, prompt, **kw):
    return _ask(prompt, str)


def askinteger(title, prompt, **kw):
    return _ask(prompt, int)


def askfloat(title, prompt, **kw):
    return _ask(prompt, float)


class Dialog(_tk.Toplevel):
    def __init__(self, parent, title=None):
        _tk.Toplevel.__init__(self, parent)
        if title:
            self.title(title)
        body = _tk.Frame(self)
        self.initial_focus = self.body(body)
        body.pack(padx=5, pady=5)
        self.buttonbox()

    def body(self, master):
        return None

    def buttonbox(self):
        box = _tk.Frame(self)
        _tk.Button(box, text="OK", width=10, command=self.ok).pack(side="left", padx=5, pady=5)
        _tk.Button(box, text="Cancel", width=10, command=self.cancel).pack(side="left", padx=5, pady=5)
        box.pack()

    def ok(self, event=None):
        if not self.validate():
            return
        self.apply()
        self.destroy()

    def cancel(self, event=None):
        self.destroy()

    def validate(self):
        return 1

    def apply(self):
        pass
`;

  const FILEDIALOG = String.raw`"""tkinter.filedialog for Smoki's Code: there is no file picker for
Python in the browser, so these return an empty answer."""
import tkinter as _tk


def _none(*args, **kw):
    _tk._warn("filedialog", "file dialogs are not available in the browser version; they return an empty answer.")
    return ""


askopenfilename = asksaveasfilename = askdirectory = _none


def askopenfilenames(*args, **kw):
    _none()
    return ()


def askopenfile(*args, **kw):
    _none()
    return None


asksaveasfile = askopenfile
askopenfiles = askopenfilenames
`;

  const FONT = String.raw`"""tkinter.font for Smoki's Code"""
import tkinter as _tk

NORMAL, ROMAN, BOLD, ITALIC = "normal", "roman", "bold", "italic"


class Font:
    def __init__(self, root=None, font=None, name=None, exists=False, **options):
        self.name = name or _tk._uid("font")
        self._o = {"family": "Segoe UI", "size": 9, "weight": "normal", "slant": "roman", "underline": 0, "overstrike": 0}
        if isinstance(font, (list, tuple)) and font:
            self._o["family"] = font[0]
            if len(font) > 1:
                self._o["size"] = int(font[1])
            for style in font[2:]:
                for word in str(style).split():
                    if word in ("bold", "normal"):
                        self._o["weight"] = word
                    elif word in ("italic", "roman"):
                        self._o["slant"] = word
        self._o.update(options)

    def _smoki_font(self):
        styles = [self._o["weight"], self._o["slant"]]
        if self._o.get("underline"):
            styles.append("underline")
        if self._o.get("overstrike"):
            styles.append("overstrike")
        return [self._o["family"], self._o["size"]] + styles

    def actual(self, option=None, displayof=None):
        return self._o.get(option) if option else dict(self._o)

    def cget(self, option):
        return self._o.get(option)

    def configure(self, **options):
        if not options:
            return dict(self._o)
        self._o.update(options)
        _tk._mark()

    config = configure

    def copy(self):
        return Font(**self._o)

    def measure(self, text, displayof=None):
        size = abs(int(self._o["size"]))
        return int(len(str(text)) * size * 0.62 * (4 / 3 if int(self._o["size"]) > 0 else 1))

    def metrics(self, *options, **kw):
        size = abs(int(self._o["size"])) * (4 / 3 if int(self._o["size"]) > 0 else 1)
        m = {"ascent": int(size * 0.9), "descent": int(size * 0.25), "linespace": int(size * 1.25), "fixed": 0}
        return m.get(options[0]) if options else m

    def __str__(self):
        return self.name


def families(root=None, displayof=None):
    return ("Arial", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New", "Georgia", "Helvetica",
            "Impact", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana")


def names(root=None):
    return ("TkDefaultFont", "TkTextFont", "TkFixedFont", "TkMenuFont", "TkHeadingFont", "TkCaptionFont",
            "TkSmallCaptionFont", "TkIconFont", "TkTooltipFont")


def nametofont(name, root=None):
    f = Font(name=name)
    if name == "TkFixedFont":
        f._o.update(family="Consolas", size=10)
    return f
`;

  const SCROLLEDTEXT = String.raw`"""tkinter.scrolledtext for Smoki's Code"""
import tkinter as _tk


class ScrolledText(_tk.Text):
    _type = "Text"

    def __init__(self, master=None, **kw):
        _tk.Text.__init__(self, master, **kw)
        self.frame = self
        self.vbar = None
`;

  const COLORCHOOSER = String.raw`"""tkinter.colorchooser for Smoki's Code"""
import tkinter as _tk


def askcolor(color=None, **options):
    _tk._warn("color", "the color picker is not available in the browser version.")
    return (None, None)
`;

  /** The files written to /smoki_lib for each Python run. */
  SC.tkinterPython = {
    'tkinter/__init__.py': INIT,
    'tkinter/constants.py': CONSTANTS,
    'tkinter/ttk.py': TTK,
    'tkinter/messagebox.py': MESSAGEBOX,
    'tkinter/simpledialog.py': SIMPLEDIALOG,
    'tkinter/filedialog.py': FILEDIALOG,
    'tkinter/font.py': FONT,
    'tkinter/scrolledtext.py': SCROLLEDTEXT,
    'tkinter/colorchooser.py': COLORCHOOSER,
  };
})(window.SC);
