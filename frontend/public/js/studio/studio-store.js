/*
 * studio-store.js — Landing Page Studio V3: the in-memory draft.
 *
 * Pure (no DOM, no network, no storage): the Studio changes the design only
 * through these commands. Every change is validated with the shared
 * QraivyV3.validateDesign; the last VALID design is kept for the preview,
 * so an invalid edit never corrupts it. Undo / Redo keep up to 100 steps;
 * typing in one field merges into one step.
 *
 * Sections (Phase C): add (neutral starter content from QraivyV3.starter),
 * duplicate, move and remove whole sections, each one Undo step. A
 * structural change is applied only when the design stays valid (while a
 * field is already invalid: when it adds no error). New sections get a new
 * unique id and no link name; links to a removed section point to the page
 * top ("/") in the same step.
 *
 * Unsaved changes (Phase B): the store remembers the design as it was last
 * opened or saved; dirty() is true while the draft differs from it (Undo
 * back to that state is clean again). Saving does not touch the history.
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

  var ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // createStore({ design, validate, now, starter, maxPerPage, maxSections, random })
  // validate: QraivyV3.validateDesign; starter: QraivyV3.starter;
  // maxPerPage: QraivyV3.MAX_PER_PAGE; maxSections: QraivyV3.LIMITS.sections
  function createStore(opts) {
    var validate = opts.validate;
    var now = opts.now || function () { return Date.now(); };
    var starter = typeof opts.starter === 'function' ? opts.starter : null;
    var maxPerPage = opts.maxPerPage || {};
    var maxSections = opts.maxSections || 40;
    var random = opts.random || Math.random;
    var draft = clone(opts.design);
    var past = [], future = [];
    var lastMerge = { key: null, at: 0 };
    var selected = null;
    var check = validate(draft);
    var lastValid = check.ok ? check.design : null;
    // the design as last opened or saved (JSON), for dirty()
    var saved = JSON.stringify(draft);
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

    // ── sections (Phase C) ──
    function listOf(d) { d.pages = d.pages || [{ id: 'start', sections: [] }]; d.pages[0].sections = d.pages[0].sections || []; return d.pages[0].sections; }
    function indexIn(list, id) { for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i; return -1; }
    // a new section id: unique among the ids and link names of the page
    function newId() {
      var taken = {};
      sections().forEach(function (s) { taken[s.id] = true; if (s.anchor) taken[s.anchor] = true; });
      for (;;) {
        var id = 's_';
        for (var i = 0; i < 8; i++) id += ID_CHARS.charAt(Math.floor(random() * ID_CHARS.length) % ID_CHARS.length);
        if (!taken[id]) return id;
      }
    }
    function countIn(node, name) {
      var n = 0;
      if (typeof node === 'string') return node === '/' + name ? 1 : 0;
      if (Array.isArray(node)) node.forEach(function (x) { n += countIn(x, name); });
      else if (node && typeof node === 'object') Object.keys(node).forEach(function (k) { n += countIn(node[k], name); });
      return n;
    }
    // One structural change as one Undo step, applied only when the design
    // stays valid (or, while a field is already invalid, gets no new error).
    // mutate(copy) changes the copy; false cancels. sel: the selection after.
    function structural(mutate, info, sel) {
      var next = clone(draft);
      if (mutate(next) === false) return false;
      var r = validate(next);
      if (!r.ok && (errors.length === 0 || r.errors.length > errors.length)) return false;
      remember(null);
      draft = next;
      endMerge();
      if (sel !== undefined) selected = sel;
      if (selected && indexOf(selected) < 0) selected = null;
      revalidate();
      emit('edit', Object.assign({ typing: false, structure: true }, info));
      return true;
    }

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
      // ── unsaved changes ──
      // snapshot(): the draft exactly as it is now (JSON), for a save;
      // markSaved(snapshot): that version is now the saved one.
      snapshot: function () { return JSON.stringify(draft); },
      dirty: function () { return JSON.stringify(draft) !== saved; },
      markSaved: function (snap) { if (typeof snap === 'string') saved = snap; },
      // ── sections (Phase C) ──
      count: function (type) { return sections().filter(function (s) { return s && s.type === type; }).length; },
      // why a section of this type can't be added, or null
      canAdd: function (type) {
        if (!starter || !starter(type, 'de')) return 'unknown_type';
        if (sections().length >= maxSections) return 'max_sections';
        if (maxPerPage[type] && api.count(type) >= maxPerPage[type]) return 'only_one';
        return null;
      },
      // addSection(type, afterId, language) -> the new id (selected), or null.
      // Below afterId, or at the end.
      addSection: function (type, afterId, language) {
        if (api.canAdd(type)) return null;
        var st = starter(type, language), id = newId();
        var ok = structural(function (next) {
          var list = listOf(next), i = afterId ? indexIn(list, afterId) : -1;
          list.splice(i < 0 ? list.length : i + 1, 0, { id: id, type: type, variant: st.variant, data: st.data });
        }, { id: id, added: true }, id);
        return ok ? id : null;
      },
      // why a section can't be duplicated, or null (one-per-page types never)
      canDuplicate: function (id) {
        var i = indexOf(id);
        if (i < 0) return 'unknown_section';
        if (maxPerPage[sections()[i].type]) return 'not_duplicable';
        if (sections().length >= maxSections) return 'max_sections';
        return null;
      },
      // a copy right below, with a new id and without the link name -> the new id (selected), or null
      duplicateSection: function (id) {
        if (api.canDuplicate(id)) return null;
        var copyId = newId();
        var ok = structural(function (next) {
          var list = listOf(next), i = indexIn(list, id);
          var c = clone(list[i]);
          c.id = copyId;
          delete c.anchor;
          list.splice(i + 1, 0, c);
        }, { id: copyId, duplicated: id }, copyId);
        return ok ? copyId : null;
      },
      // moveSection(id, -1 | 1): one place up or down; false at either end
      moveSection: function (id, delta) {
        var i = indexOf(id), j = i + delta;
        if (i < 0 || (delta !== 1 && delta !== -1) || j < 0 || j >= sections().length) return false;
        return structural(function (next) {
          var list = listOf(next);
          list.splice(j, 0, list.splice(i, 1)[0]);
        }, { id: id, moved: delta });
      },
      // position(id) -> { index (1-based), total }
      position: function (id) { return { index: indexOf(id) + 1, total: sections().length }; },
      // how many internal links of the rest of the page point to this section
      linksTo: function (id) {
        var i = indexOf(id);
        if (i < 0) return 0;
        var s = sections()[i], rest = clone(draft);
        listOf(rest).splice(i, 1);
        return countIn(rest, s.id) + (s.anchor ? countIn(rest, s.anchor) : 0);
      },
      // removeSection(id) -> { ok, relinked }: links to it point to the page
      // top in the same Undo step; the selection moves to a neighbour
      removeSection: function (id) {
        var i = indexOf(id);
        if (i < 0) return { ok: false, relinked: 0 };
        var s = sections()[i], relinked = 0;
        var list0 = sections(), neighbour = list0[i + 1] || list0[i - 1] || null;
        var sel = selected === id ? (neighbour ? neighbour.id : null) : selected;
        var ok = structural(function (next) {
          listOf(next).splice(i, 1);
          relinked = relink(next, s.id, '') + (s.anchor ? relink(next, s.anchor, '') : 0);
        }, { id: id, removed: true }, sel);
        return { ok: ok, relinked: ok ? relinked : 0 };
      },
      // true while a section is exactly its starter content (in either
      // language): removing it loses nothing of the owner's
      isUntouched: function (id) {
        var i = indexOf(id);
        if (i < 0 || !starter) return false;
        var s = sections()[i];
        if (s.anchor || s.hidden) return false;
        var norm = function (sec) {
          var r = validate({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_cmp00000', type: sec.type, variant: sec.variant, data: sec.data, style: sec.style }] }] });
          return r.ok ? JSON.stringify(r.design.pages[0].sections[0]) : null;
        };
        var mine = norm(s);
        return !!mine && ['de', 'en'].some(function (l) { var st = starter(s.type, l); return !!st && norm(st) === mine; });
      },

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
      // ── another page: a fresh start (no undo back into the previous page) ──
      load: function (design) {
        var r = validate(design);
        if (!r.ok) return false;
        draft = clone(design);
        saved = JSON.stringify(draft);
        past = []; future = [];
        endMerge();
        selected = null;
        revalidate();
        emit('history', { loaded: true });
        return true;
      },
      endMerge: endMerge,
      onChange: function (f) { listeners.push(f); },
    };
    return api;
  }

  return { createStore: createStore, HISTORY_LIMIT: HISTORY_LIMIT, MERGE_MS: MERGE_MS, ID: ID, ANCHOR: ANCHOR };
});
