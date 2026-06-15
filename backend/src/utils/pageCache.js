// In-memory TTL cache for landing page data and stamp settings.
// No external dependencies. Cache is invalidated on publish and delete.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class TTLCache {
  constructor() { this._store = new Map(); }

  get(key) {
    const e = this._store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this._store.delete(key); return null; }
    return e.value;
  }

  set(key, value, ttlMs = CACHE_TTL_MS) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key) { this._store.delete(key); }

  delByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }
}

const pageCache = new TTLCache();
module.exports = { pageCache };
