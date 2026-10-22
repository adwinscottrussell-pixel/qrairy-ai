/*
 * studio-store.js — Landing Page Studio V3: the in-memory draft.
 *
 * Pure (no DOM, no network, no storage): the Studio changes the design only
 * through these commands. Every change is validated with the shared
 * QraivyV3.validateDesign; the last VALID design is kept for the preview,
 * so an invalid edit never corrupts it. Undo / Redo keep up to 100 steps;
 * typing in one field merges into one step.
 *
 * In Node: module.exports. In the Studio: window.QraivyStudioStore.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioStore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HISTORY_LIMIT = 100;
  var MERGE_MS = 800;
  var ID = /^s_[a-z0-9]{4,16}$/;
  var ANCHOR = /^[a-z0-9][a-z0-9-]{0,39}$/;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // createStore({ design, validate, now }) — validate: QraivyV3.validateDesign
  function createStore(opts) {
    var validate = opts.validate;
    var now = opts.now || function () { return Date.now(); };
    var draft = clone(opts.design);
    var past = [], future = [];
    var lastMerge = { key: null, at: 0 };
    var selected = null;
    var check = validate(draft);
    var lastValid = check.ok ? check.design : null;
    var errors = check.errors;
    var listeners = [];

    function emit(kind, info) { listeners.forEach(function (f) { f(kind, info || {}); }); }
    function sections() { return (draft.pages && draft.pages[0] && draft.pages[0].sections) || []; }
    function indexOf(id) { var list = sections(); for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i; return -1; }
    function revalidate() {
      var r = validate(draft);
      errors = r.errors;
      if (r.ok) lastValid = r.design;
      return r.ok;
    }
    // One history step before a change; consecutive changes with the same
    // merge key within MERGE_MS stay in that step (typing in one field).
    function remember(mergeKey) {
      var t = now();
      if (mergeKey && lastMerge.key === mergeKey && t - lastMerge.at < MERGE_MS) { lastMerge.at = t; return; }
      past.push(JSON.stringify(draft));
      if (past.length > HISTORY_LIMIT) past.shift();
      future = [];
      lastMerge = { key: mergeKey || null, at: t };
    }
    function endMerge() { lastMerge = { key: null, at: 0 }; }

    function setPath(obj, path, value) {
      var n = obj;
      for (var i = 0; i < path.length - 1; i++) {
        if (n[path[i]] === undefined || n[path[i]] === null || typeof n[path[i]] !== 'object') n[path[i]] = {};
        n = n[path[i]];
      }
      if (value === undefined) delete n[path[path.length - 1]];
      else n[path[path.length - 1]] = value;
    }
    function getPath(obj, path) { var n = obj; for (var i = 0; i < path.length; i++) { if (n == null) return undefined; n = n[path[i]]; } return n; }

    // Every string that is an internal link to `from` ("/from") points to `to`.
    function relink(node, from, to) {
      var count = 0;
      if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) { if (typeof node[i] === 'string' && node[i] === '/' + from) { node[i] = '/' + to; count++; } else count += relink(node[i], from, to); } }
      else if (node && typeof node === 'object') {
        Object.keys(node).forEach(function (k) {
          if (typeof node[k] === 'string' && node[k] === '/' + from) { node[k] = '/' + to; count++; }
          else count += relink(node[k], from, to);
        });
      }
      return count;
    }

    var api = {
      // ── reading ──
      draft: function () { return clone(draft); },
      lastValid: function () { return lastValid ? clone(lastValid) : null; },
      isValid: function () { return errors.length === 0; },
      errors: function () { return errors.slice(); },
      // validation errors of one section, keyed by the path inside it
      // ("data.headline", "data.primary.target", "anchor", ...)
      sectionErrors: function (id) {
        var i = indexOf(id), out = {};
        if (i < 0) return out;
        var prefix = '$.pages[0].sections[' + i + '].';
        errors.forEach(function (e) { if (e.path.indexOf(prefix) === 0) out[e.path.slice(prefix.length)] = e; });
        return out;
      },
      section: function (id) { var i = indexOf(id); return i < 0 ? null : clone(sections()[i]); },
      sectionIds: function () { return sections().map(function (s) { return s.id; }); },
      selected: function () { return selected; },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; },
      // the page's internal link targets: the page itself and every section
      linkTargets: function () {
        var out = [{ target: '/', id: null, label: null }];
        sections().forEach(function (s) { out.push({ target: '/' + (s.anchor || s.id), id: s.id, type: s.type }); });
        return out;
      },

      // ── selection (not an undo step) ──
      select: function (id) {
        if (id !== null && indexOf(id) < 0) return false;
        selected = id;
        endMerge();
        emit('select');
        return true;
      },

      // ── editing ──
      // set(id, ['data','headline'], 'New') — a field of one section.
      // `merge` (a string) keeps consecutive typing in one undo step.
      set: function (id, path, value, merge) {
        var i = indexOf(id);
        if (i < 0 || !Array.isArray(path) || !path.length || path[0] === 'id' || path[0] === 'type') return false;
        if (path[0] === 'anchor') return api.setAnchor(id, value);
        var s = sections()[i];
        if (JSON.stringify(getPath(s, path)) === JSON.stringify(value)) return true;
        remember(merge ? id + ':' + path.join('.') + ':' + merge : null);
        setPath(s, path, value);
        revalidate();
        emit('edit', { id: id, path: path, typing: !!merge });
        return true;
      },
      // Why a link name can't be used, or null: the same rules as
      // validateDesign (format, the reserved "start" / "top", unique among
      // every section's link name and id). An empty name means "use the id".
      checkAnchor: function (id, anchor) {
        var next = String(anchor == null ? '' : anchor).trim();
        if (!next) return null;
        if (!ANCHOR.test(next)) return 'invalid_anchor';
        if (next === 'start' || next === 'top') return 'reserved';
        var clash = sections().some(function (s) { return s.id !== id && (s.id === next || s.anchor === next); });
        return clash ? 'duplicate' : null;
      },
      // Rename a section's link name. Only a usable name is applied (an
      // invalid one changes nothing), so internal links never point at a
      // dead name: every link to the old name follows, in the same undo step.
      // -> { ok, code, relinked }
      setAnchor: function (id, anchor) {
        var i = indexOf(id);
        if (i < 0) return { ok: false, code: 'unknown_section', relinked: 0 };
        var s = sections()[i];
        var next = String(anchor == null ? '' : anchor).trim();
        if ((s.anchor || '') === next) return { ok: true, code: null, relinked: 0 };
        var code = api.checkAnchor(id, next);
        if (code) return { ok: false, code: code, relinked: 0 };
        var oldName = s.anchor || s.id, newName = next || s.id;
        remember(null);
        if (next) s.anchor = next; else delete s.anchor;
        var relinked = oldName !== newName ? relink(draft, oldName, newName) : 0;
        revalidate();
        emit('edit', { id: id, path: ['anchor'], typing: false, relinked: relinked });
        return { ok: true, code: null, relinked: relinked };
      },
      setHidden: function (id, hidden) { return api.set(id, ['hidden'], !!hidden); },

      // ── lists inside a section (e.g. ['data', 'items']); each one Undo step ──
      // addItem -> the new index, or -1 when the list is full (max) or not a list.
      addItem: function (id, path, item, max) {
        var i = indexOf(id);
        if (i < 0 || !Array.isArray(path) || !path.length || path[0] !== 'data') return -1;
        var s = sections()[i];
        var list = getPath(s, path);
        if (list === undefined) list = [];
        if (!Array.isArray(list) || !(list.length < max)) return -1;
        remember(null);
        list = list.slice();
        list.push(clone(item));
        setPath(s, path, list);
        revalidate();
        emit('edit', { id: id, path: path, typing: false, structure: true });
        return list.length - 1;
      },
      removeItem: function (id, path, index) {
        var i = indexOf(id);
        if (i < 0 || !Array.isArray(path) || path[0] !== 'data') return false;
        var list = getPath(sections()[i], path);
        if (!Array.isArray(list) || index !== Math.floor(index) || index < 0 || index >= list.length) return false;
        remember(null);
        list.splice(index, 1);
        revalidate();
        emit('edit', { id: id, path: path, typing: false, structure: true });
        return true;
      },
      moveItem: function (id, path, from, to) {
        var i = indexOf(id);
        if (i < 0 || !Array.isArray(path) || path[0] !== 'data') return false;
        var list = getPath(sections()[i], path);
        var ok = function (n) { return n === Math.floor(n) && n >= 0 && n < list.length; };
        if (!Array.isArray(list) || !ok(from) || !ok(to) || from === to) return false;
        remember(null);
        list.splice(to, 0, list.splice(from, 1)[0]);
        revalidate();
        emit('edit', { id: id, path: path, typing: false, structure: true });
        return true;
      },

      // ── history ──
      undo: function () {
        if (!past.length) return false;
        future.push(JSON.stringify(draft));
        draft = JSON.parse(past.pop());
        endMerge();
        if (selected && indexOf(selected) < 0) selected = null;
        revalidate();
        emit('history');
        return true;
      },
      redo: function () {
        if (!future.length) return false;
        past.push(JSON.stringify(draft));
        draft = JSON.parse(future.pop());
        endMerge();
        if (selected && indexOf(selected) < 0) selected = null;
        revalidate();
        emit('history');
        return true;
      },
      endMerge: endMerge,
      onChange: function (f) { listeners.push(f); },
    };
    return api;
  }

  return { createStore: createStore, HISTORY_LIMIT: HISTORY_LIMIT, MERGE_MS: MERGE_MS, ID: ID, ANCHOR: ANCHOR };
});
