/* ==========================================================================
   storage.js — safe wrapper around localStorage.
   Browsers can block storage (private mode, strict privacy settings), so
   every read and write is wrapped in try/catch and the app keeps working
   in memory when storage is not available.
   ========================================================================== */
(function (SC) {
  'use strict';

  const PREFIX = 'smokis-code:';
  const memory = new Map();
  let available = true;

  try {
    const probe = PREFIX + '__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (err) {
    available = false;
  }

  SC.storage = {
    get available() { return available; },

    get(key, fallback) {
      try {
        const raw = available ? localStorage.getItem(PREFIX + key) : memory.get(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },

    /** Returns false when the value could not be stored (quota full, blocked). */
    set(key, value) {
      const raw = JSON.stringify(value);
      memory.set(key, raw);
      if (!available) return true;
      try {
        localStorage.setItem(PREFIX + key, raw);
        return true;
      } catch (err) {
        return false;
      }
    },

    remove(key) {
      memory.delete(key);
      try { if (available) localStorage.removeItem(PREFIX + key); } catch (err) { /* ignore */ }
    },

    clearAll() {
      memory.clear();
      try {
        if (!available) return;
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      } catch (err) { /* ignore */ }
    },
  };
})(window.SC);
