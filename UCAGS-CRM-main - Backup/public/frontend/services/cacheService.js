// Simple localStorage cache with TTL
// Stores JSON payloads under keys with a timestamp.

(function () {
  const PREFIX = 'ucags_cache:';

  function nowMs() {
    return Date.now();
  }

  function makeKey(key) {
    return key.startsWith(PREFIX) ? key : (PREFIX + key);
  }

  function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function get(key) {
    const k = makeKey(key);
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  }

  function set(key, value) {
    const k = makeKey(key);
    localStorage.setItem(k, JSON.stringify(value));
  }

  function getFresh(key, ttlMs) {
    const item = get(key);
    if (!item) return null;
    if (!item.ts || typeof item.ts !== 'number') return null;
    if (nowMs() - item.ts > ttlMs) return null;
    return item.data;
  }

  function setWithTs(key, data) {
    set(key, { ts: nowMs(), data });
  }

  function invalidate(key) {
    localStorage.removeItem(makeKey(key));
  }

  function invalidatePrefix(prefix) {
    const p = makeKey(prefix);
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith(p)) localStorage.removeItem(k);
    }
  }

  // Expose
  window.Cache = {
    getFresh,
    setWithTs,
    invalidate,
    invalidatePrefix
  };
})();
