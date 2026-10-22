/*
 * studio-inspector.js — Landing Page Studio V3: the Content / Style /
 * Settings inspector.
 *
 * Phase 2A-3A: only the Hero is editable (EDITABLE). Its controls follow
 * HERO_PLAN, with every rule (limits, choices, required fields) read from
 * QraivyV3.describe(), so the inspector cannot drift from what the server
 * enforces. Edits go through the store (studio-store.js); errors come from
 * the shared validation and are shown under the field. The other section
 * types keep the read-only view of Phase 2A-2.
 *
 * In Node: module.exports (pure parts, for the tests). In the Studio:
 * window.QraivyStudioInspector.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyStudioInspector = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EDITABLE = ['hero'];

  // Where each Hero field is edited. The Hero renderer ignores
  // style.background and style.spacing, so they are not offered.
  var HERO_PLAN = [
    { tab: 'content', path: ['data', 'eyebrow'], control: 'text' },
    { tab: 'content', path: ['data', 'headline'], control: 'text' },
    { tab: 'content', path: ['data', 'subheadline'], control: 'text' },
    { tab: 'content', path: ['data', 'backgroundImage'], control: 'image' },
    { tab: 'content', path: ['data', 'imageAlt'], control: 'text' },
    { tab: 'content', group: 'primary' },
    { tab: 'content', path: ['data', 'primary', 'text'], control: 'text', color: ['data', 'primary', 'color'] },
    { tab: 'content', path: ['data', 'primary', 'color'], control: 'color' },
    { tab: 'content', path: ['data', 'primary', 'target'], control: 'link' },
    { tab: 'content', path: ['data', 'primary', 'icon'], control: 'select' },
    { tab: 'content', hint: 'primary' },
    { tab: 'content', group: 'secondary' },
    { tab: 'content', path: ['data', 'secondary', 'text'], control: 'text' },
    { tab: 'content', path: ['data', 'secondary', 'target'], control: 'link' },
    { tab: 'content', path: ['data', 'secondary', 'icon'], control: 'select' },
    { tab: 'content', hint: 'secondary' },
    { tab: 'style', path: ['variant'], control: 'select' },
    { tab: 'style', path: ['style', 'align'], control: 'select' },
    { tab: 'style', path: ['data', 'overlay'], control: 'number' },
    { tab: 'settings', path: ['anchor'], control: 'anchor' },
    { tab: 'settings', path: ['hidden'], control: 'show' },
    { tab: 'settings', path: ['id'], control: 'readonly' },
  ];

  // The spec of one Hero path, from describe().
  function heroSpec(D, path) {
    if (path[0] === 'variant') return { t: 'enum', values: D.sections.hero.variants.slice(), def: D.sections.hero.variants[0] };
    if (path[0] === 'style') return D.section.style.fields[path[1]];
    if (path[0] === 'anchor') return D.section.anchor;
    if (path[0] === 'hidden') return D.section.hidden;
    if (path[0] === 'id') return D.section.id;
    var s = D.sections.hero.data;
    for (var i = 1; i < path.length; i++) s = s && s.fields && s.fields[path[i]];
    return s;
  }

  // The length validateDesign measures (core.js cleanStr + len): line breaks
  // normalised, control and direction characters removed, single-line text
  // on one line, trimmed; characters, not UTF-16 units.
  var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
  function textLength(v, multiline) {
    var s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(CONTROL, '');
    if (!multiline) s = s.replace(/[\n\t]+/g, ' ');
    s = s.trim();
    var n = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) n++; }
    return n;
  }

  var TX = {
    en: {
      variant: 'Layout', align: 'Alignment', overlay: 'Image darkening (%)',
      v_overlay: 'Overlay: image behind the text', v_split: 'Split: image beside the text', v_simple: 'Simple: text only',
      a_left: 'Left', a_center: 'Centered',
      no_link: 'No link', top_of_page: 'Top of the page', custom_link: 'Web address, email or phone…', hidden_suffix: ' (hidden)', link_placeholder: 'https://…, mailto:… or tel:…',
      color_default: 'Default', color_label: 'Button colour', change_soon: 'Image upload arrives in a later step.',
      hint_button: 'This button appears on the page once it has both a text and a link.',
      hint_overlay: 'Only for the Overlay layout with a background image.', hint_simple_image: 'The Simple layout shows no image.',
      hint_anchor: 'Used for links to this section. Empty: the section ID.',
      note_edit: 'Changes stay in this browser tab only. They are not saved.', note_later: 'Editing this section type arrives in a later step.',
      i_none: 'None', i_arrow: 'Arrow', i_tag: 'Tag', i_gift: 'Gift', i_cart: 'Cart', i_clock: 'Clock', i_pin: 'Location', i_phone: 'Phone', i_mail: 'Mail',
      i_globe: 'Globe', i_calendar: 'Calendar', i_star: 'Star', i_info: 'Info', i_chat: 'Chat', i_heart: 'Heart',
      e_required: 'Required.', e_too_long: 'Too long: at most {max} characters.',
      e_invalid_link: 'Choose a section of this page or enter a link starting with https://, mailto: or tel:.',
      e_unknown_internal_target: 'There is no such section on this page.', e_invalid_color: 'Use a colour like #ff5a1f.',
      e_out_of_range: 'Enter a whole number from {min} to {max}.',
      e_invalid_anchor: 'Use lowercase letters, numbers and hyphens (up to 40), starting with a letter or number.',
      e_reserved: '"start" and "top" are reserved.', e_duplicate: 'Another section already uses this name.', e_other: 'Not valid.',
    },
    de: {
      variant: 'Layout', align: 'Ausrichtung', overlay: 'Bild abdunkeln (%)',
      v_overlay: 'Overlay: Bild hinter dem Text', v_split: 'Geteilt: Bild neben dem Text', v_simple: 'Schlicht: nur Text',
      a_left: 'Links', a_center: 'Zentriert',
      no_link: 'Kein Link', top_of_page: 'Seitenanfang', custom_link: 'Webadresse, E-Mail oder Telefon…', hidden_suffix: ' (ausgeblendet)', link_placeholder: 'https://…, mailto:… oder tel:…',
      color_default: 'Standard', color_label: 'Button-Farbe', change_soon: 'Bilder hochladen folgt in einem späteren Schritt.',
      hint_button: 'Dieser Button erscheint auf der Seite, sobald er einen Text und einen Link hat.',
      hint_overlay: 'Nur beim Layout Overlay mit Hintergrundbild.', hint_simple_image: 'Das Layout Schlicht zeigt kein Bild.',
      hint_anchor: 'Für Links zu diesem Abschnitt. Leer: die Abschnitts-ID.',
      note_edit: 'Änderungen bleiben nur in diesem Browser-Tab. Sie werden nicht gespeichert.', note_later: 'Das Bearbeiten dieses Abschnittstyps folgt in einem späteren Schritt.',
      i_none: 'Keins', i_arrow: 'Pfeil', i_tag: 'Etikett', i_gift: 'Geschenk', i_cart: 'Warenkorb', i_clock: 'Uhr', i_pin: 'Standort', i_phone: 'Telefon', i_mail: 'E-Mail',
      i_globe: 'Globus', i_calendar: 'Kalender', i_star: 'Stern', i_info: 'Info', i_chat: 'Chat', i_heart: 'Herz',
      e_required: 'Pflichtfeld.', e_too_long: 'Zu lang: höchstens {max} Zeichen.',
      e_invalid_link: 'Wähle einen Abschnitt dieser Seite oder gib einen Link mit https://, mailto: oder tel: ein.',
      e_unknown_internal_target: 'Diesen Abschnitt gibt es auf der Seite nicht.', e_invalid_color: 'Nutze eine Farbe wie #ff5a1f.',
      e_out_of_range: 'Gib eine ganze Zahl von {min} bis {max} ein.',
      e_invalid_anchor: 'Kleinbuchstaben, Zahlen und Bindestriche (bis 40), am Anfang ein Buchstabe oder eine Zahl.',
      e_reserved: '„start“ und „top“ sind reserviert.', e_duplicate: 'Diesen Namen nutzt schon ein anderer Abschnitt.', e_other: 'Ungültig.',
    },
  };
  function errorText(lang, e) {
    var d = TX[lang] || TX.en;
    var s = d['e_' + e.code] || d.e_other;
    return s.replace('{max}', e.max).replace('{min}', e.min);
  }

  function getPath(o, path) { var n = o; for (var i = 0; i < path.length; i++) { if (n == null) return undefined; n = n[path[i]]; } return n; }

  // createInspector({ box, note, kind, store, V3, lang(), tab(), t(k), fieldLabel(k), el, icon, sectionLabel(type), brand })
  function createInspector(o) {
    var store = o.store, el = o.el;
    var refreshers = [];
    var uid = 0;
    function tx(k) { var d = TX[o.lang()] || TX.en; return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : TX.en[k]; }
    function nextId(p) { uid += 1; return 'st-f-' + p + '-' + uid; }

    // ── read-only view (Phase 2A-2), for the section types not yet editable ──
    function roInput(value, multiline) {
      return multiline ? el('textarea', { disabled: true, rows: '3', text: value }) : el('input', { type: 'text', disabled: true, value: value == null ? '' : String(value) });
    }
    function roField(key, spec, value) {
      var label = el('span', { text: o.fieldLabel(key) });
      if (spec.t === 'image') {
        return el('label', { class: 'st-field' }, [label, el('div', { class: 'st-field__img' }, [
          el('div', { class: 'st-field__thumb', title: o.t('no_image') }, [o.icon('st-t-hero')]),
          el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: o.t('change_image') }),
          el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, text: o.t('remove') })])]);
      }
      if (spec.t === 'bool') return el('label', { class: 'st-field' }, [label, roInput(value ? o.t('yes') : o.t('no'))]);
      if (spec.t === 'enum') {
        var sel = el('select', { disabled: true });
        spec.values.forEach(function (v) { var op = el('option', { value: v, text: v }); if (v === value) op.selected = true; sel.appendChild(op); });
        return el('label', { class: 'st-field' }, [label, sel]);
      }
      if (spec.t === 'arr') return el('label', { class: 'st-field' }, [label, roInput(o.t('items').replace('{n}', (value || []).length))]);
      return el('label', { class: 'st-field' }, [label, roInput(value, spec.multiline)]);
    }
    function renderReadOnly(box, s, D) {
      if (o.tab() === 'content') {
        var spec = D.sections[s.type].data;
        Object.keys(spec.fields).forEach(function (k) {
          var f = spec.fields[k], v = s.data[k];
          if (f.t === 'obj') {
            box.appendChild(el('div', { class: 'st-group', text: o.fieldLabel(k) }));
            Object.keys(f.fields).forEach(function (kk) { box.appendChild(roField(kk, f.fields[kk], v[kk])); });
          } else box.appendChild(roField(k, f, v));
        });
      } else if (o.tab() === 'style') {
        box.appendChild(roField('variant', { t: 'enum', values: D.sections[s.type].variants }, s.variant));
        var st = D.section.style.fields;
        Object.keys(st).forEach(function (k) { box.appendChild(roField(k, st[k], s.style[k])); });
      } else {
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('section_id') }), roInput(s.id)]));
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('anchor') }), roInput(s.anchor || s.id)]));
        box.appendChild(el('label', { class: 'st-field' }, [el('span', { text: o.t('visibility') }), roInput(s.hidden ? o.t('no') : o.t('yes'))]));
      }
    }

    // ── Hero editor ──
    function labelFor(path) {
      var k = path[path.length - 1];
      if (k === 'variant' || k === 'align' || k === 'overlay') return tx(k);
      if (k === 'anchor') return o.t('anchor');
      if (k === 'hidden') return o.t('visibility');
      if (k === 'id') return o.t('section_id');
      return o.fieldLabel(k);
    }
    // the field's error line; every control registers how it refreshes
    function errorLine(id) { return el('p', { class: 'st-err', id: id, role: 'status', hidden: true }); }
    function showError(input, line, err) {
      line.hidden = !err;
      line.textContent = err ? errorText(o.lang(), err) : '';
      if (err) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    function focused(n) { return n.ownerDocument.activeElement === n; }
    function heroValue(sec, path, spec) { var v = getPath(sec, path); return v === undefined && spec && spec.def !== undefined ? spec.def : v; }

    function textControl(sec, c, spec) {
      var multiline = !!spec.multiline, key = c.path.join('.');
      var id = nextId('text'), errId = id + '-err';
      var inp = multiline ? el('textarea', { id: id, rows: '3', 'aria-describedby': errId }) : el('input', { type: 'text', id: id, 'aria-describedby': errId, autocomplete: 'off' });
      inp.value = heroValue(sec, c.path) || '';
      if (spec.required) inp.setAttribute('aria-required', 'true');
      var count = el('small', { class: 'st-count', 'aria-hidden': 'true' });
      var line = errorLine(errId);
      inp.addEventListener('input', function () { store.set(sec.id, c.path, inp.value, 'typing'); });
      inp.addEventListener('blur', function () { store.endMerge(); });
      var control = inp;
      if (c.color) control = el('div', { class: 'st-field__row' }, [inp, colorControl(sec, c.color)]);
      var node = el('div', { class: 'st-field', 'data-path': key }, [
        el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) }), count]), control, line]);
      refreshers.push(function (cur, errs) {
        var v = getPath(cur, c.path) || '';
        if (!focused(inp) && inp.value !== v) inp.value = v;
        var n = textLength(inp.value, multiline);
        count.textContent = n + ' / ' + spec.max;
        count.classList.toggle('is-over', n > spec.max);
        showError(inp, line, errs[key]);
      });
      return node;
    }

    function colorControl(sec, path) {
      var key = path.join('.');
      var wrap = el('span', { class: 'st-color', 'data-path': key });
      var inp = el('input', { type: 'color', class: 'st-swatch st-swatch--input', 'aria-label': tx('color_label'), title: tx('color_label') });
      var reset = el('button', { type: 'button', class: 'st-linkbtn', text: tx('color_default') });
      inp.addEventListener('input', function () { store.set(sec.id, path, inp.value.toLowerCase(), 'color'); });
      inp.addEventListener('change', function () { store.endMerge(); });
      reset.addEventListener('click', function () { store.set(sec.id, path, undefined); inp.focus(); });
      wrap.appendChild(inp); wrap.appendChild(reset);
      refreshers.push(function (cur) {
        var v = getPath(cur, path);
        var shown = v || o.brand;
        if (!focused(inp) && inp.value.toLowerCase() !== shown) inp.value = shown;
        reset.hidden = !v;
      });
      return wrap;
    }

    function imageControl(sec, c) {
      var key = c.path.join('.');
      var thumb = el('div', { class: 'st-field__thumb' });
      var change = el('button', { type: 'button', class: 'st-btn st-btn--ghost', disabled: true, title: tx('change_soon'), text: o.t('change_image') });
      var remove = el('button', { type: 'button', class: 'st-btn st-btn--ghost', 'data-action': 'remove-image', text: o.t('remove') });
      var hint = el('p', { class: 'st-hint', hidden: true, text: tx('hint_simple_image') });
      remove.addEventListener('click', function () { store.set(sec.id, c.path, undefined); });
      refreshers.push(function (cur) {
        var v = getPath(cur, c.path) || '';
        var img = thumb.querySelector('img');
        if (v && (!img || img.getAttribute('src') !== v)) {
          thumb.textContent = '';
          thumb.appendChild(el('img', { src: v, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }));
          thumb.classList.add('has-img');
        } else if (!v && (img || !thumb.firstChild)) {
          thumb.textContent = '';
          thumb.appendChild(o.icon('st-t-hero'));
          thumb.classList.remove('has-img');
          thumb.title = o.t('no_image');
        }
        remove.disabled = !v;
        hint.hidden = !(v && heroValue(cur, ['variant'], heroSpec(o.V3.describe(), ['variant'])) === 'simple');
      });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { text: labelFor(c.path) }), el('div', { class: 'st-field__img' }, [thumb, change, remove]), hint]);
    }

    function linkControl(sec, c) {
      var key = c.path.join('.');
      var id = nextId('link'), errId = id + '-err', customId = id + '-custom';
      var sel = el('select', { id: id, 'aria-describedby': errId });
      var custom = el('input', { type: 'text', id: customId, class: 'st-field__sub', placeholder: tx('link_placeholder'), 'aria-label': o.fieldLabel('target'), 'aria-describedby': errId, autocomplete: 'off', inputmode: 'url', hidden: true });
      var line = errorLine(errId);
      var signature = '';
      var mode = ''; // 'custom' once the person chose to type an address
      function targets() {
        return store.linkTargets().map(function (x) {
          if (x.target === '/') return { value: '/', label: tx('top_of_page') };
          var s = store.section(x.id);
          return { value: x.target, label: '#' + x.target.slice(1) + ' · ' + o.sectionLabel(x.type) + (s && s.hidden ? tx('hidden_suffix') : '') };
        });
      }
      function build() {
        var list = targets();
        var sig = JSON.stringify(list) + o.lang();
        if (sig === signature) return list;
        signature = sig;
        sel.textContent = '';
        sel.appendChild(el('option', { value: '', text: tx('no_link') }));
        list.forEach(function (x) { sel.appendChild(el('option', { value: x.value, text: x.label })); });
        sel.appendChild(el('option', { value: '__custom', text: tx('custom_link') }));
        return list;
      }
      function sync(v) {
        var list = build();
        var known = mode !== 'custom' && (v === '' || list.some(function (x) { return x.value === v; }));
        if (!focused(sel) && !focused(custom)) {
          sel.value = known ? v : '__custom';
          custom.hidden = known;
          if (!known && custom.value !== v) custom.value = v;
        }
      }
      sel.addEventListener('change', function () {
        if (sel.value === '__custom') {
          mode = 'custom';
          custom.hidden = false;
          var cur = getPath(store.section(sec.id), c.path) || '';
          custom.value = /^\//.test(cur) ? '' : cur;
          custom.focus();
          store.set(sec.id, c.path, custom.value || undefined);
        } else {
          mode = '';
          custom.hidden = true;
          store.set(sec.id, c.path, sel.value || undefined);
        }
      });
      custom.addEventListener('input', function () { store.set(sec.id, c.path, custom.value || undefined, 'typing'); });
      custom.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) { sync(getPath(cur, c.path) || ''); showError(custom.hidden ? sel : custom, line, errs[key]); });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), sel, custom, line]);
    }

    function selectControl(sec, c, spec) {
      var key = c.path.join('.');
      var id = nextId('sel');
      var sel = el('select', { id: id });
      var k = c.path[c.path.length - 1];
      spec.values.forEach(function (v) {
        var label = k === 'variant' ? tx('v_' + v) : k === 'align' ? tx('a_' + v) : k === 'icon' ? tx('i_' + v) : v;
        sel.appendChild(el('option', { value: v, text: label }));
      });
      sel.addEventListener('change', function () { store.set(sec.id, c.path, sel.value); });
      refreshers.push(function (cur) { var v = heroValue(cur, c.path, spec); if (!focused(sel) && sel.value !== v) sel.value = v; });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), sel]);
    }

    function numberControl(sec, c, spec) {
      var key = c.path.join('.');
      var id = nextId('num'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: 'number', id: id, min: String(spec.min), max: String(spec.max), step: '1', inputmode: 'numeric', 'aria-describedby': errId + ' ' + hintId });
      var line = errorLine(errId);
      var hint = el('p', { class: 'st-hint', id: hintId, text: tx('hint_overlay') });
      inp.addEventListener('input', function () {
        var raw = inp.value.trim();
        store.set(sec.id, c.path, raw === '' ? '' : Number(raw), 'typing');
      });
      inp.addEventListener('blur', function () { store.endMerge(); });
      refreshers.push(function (cur, errs) {
        var v = heroValue(cur, c.path, spec);
        if (!focused(inp) && String(inp.value) !== String(v)) inp.value = v;
        var D = o.V3.describe();
        inp.disabled = !(heroValue(cur, ['variant'], heroSpec(D, ['variant'])) === 'overlay' && getPath(cur, ['data', 'backgroundImage']));
        hint.hidden = !inp.disabled;
        showError(inp, line, errs[key]);
      });
      return el('div', { class: 'st-field', 'data-path': key }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(c.path) })]), inp, line, hint]);
    }

    function anchorControl(sec) {
      var id = nextId('anchor'), errId = id + '-err', hintId = id + '-hint';
      var inp = el('input', { type: 'text', id: id, 'aria-describedby': errId + ' ' + hintId, autocomplete: 'off', spellcheck: 'false', placeholder: sec.id });
      inp.value = sec.anchor || '';
      var line = errorLine(errId);
      // Checked while typing; applied (with the links that follow it) when
      // the field is left or Enter is pressed, and only if the name is usable.
      var check = function () { var code = store.checkAnchor(sec.id, inp.value); showError(inp, line, code ? { code: code } : null); return !code; };
      inp.addEventListener('input', check);
      inp.addEventListener('change', function () { if (check()) store.setAnchor(sec.id, inp.value); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (check()) store.setAnchor(sec.id, inp.value); } });
      refreshers.push(function (cur) {
        if (!focused(inp) && inp.value !== (cur.anchor || '')) { inp.value = cur.anchor || ''; check(); }
      });
      return el('div', { class: 'st-field', 'data-path': 'anchor' }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(['anchor']) })]), inp, line,
        el('p', { class: 'st-hint', id: hintId, text: tx('hint_anchor') })]);
    }

    function showControl(sec) {
      var id = nextId('show');
      var box = el('input', { type: 'checkbox', id: id, role: 'switch', class: 'st-switch' });
      box.addEventListener('change', function () { store.setHidden(sec.id, !box.checked); });
      refreshers.push(function (cur) { box.checked = !cur.hidden; box.setAttribute('aria-checked', String(!cur.hidden)); });
      return el('div', { class: 'st-field st-field--inline', 'data-path': 'hidden' }, [el('label', { for: id, text: labelFor(['hidden']) }), box]);
    }

    function readonlyControl(sec) {
      var id = nextId('id');
      return el('div', { class: 'st-field', 'data-path': 'id' }, [el('span', { class: 'st-field__label' }, [el('label', { for: id, text: labelFor(['id']) })]),
        el('input', { type: 'text', id: id, readonly: true, value: sec.id, class: 'st-readonly' })]);
    }

    function buttonHint(sec, which) {
      var hint = el('p', { class: 'st-hint', 'data-hint': which, text: tx('hint_button') });
      refreshers.push(function (cur) {
        var b = getPath(cur, ['data', which]) || {};
        hint.hidden = !!(textLength(b.text, false) && typeof b.target === 'string' && b.target.trim());
      });
      return hint;
    }

    function renderHero(box, sec, D) {
      HERO_PLAN.filter(function (c) { return c.tab === o.tab(); }).forEach(function (c) {
        if (c.group) return box.appendChild(el('div', { class: 'st-group', text: o.fieldLabel(c.group) }));
        if (c.hint) return box.appendChild(buttonHint(sec, c.hint));
        if (c.control === 'color') return; // shown beside the button text
        var spec = heroSpec(D, c.path);
        if (c.control === 'text') box.appendChild(textControl(sec, c, spec));
        else if (c.control === 'image') box.appendChild(imageControl(sec, c));
        else if (c.control === 'link') box.appendChild(linkControl(sec, c));
        else if (c.control === 'select') box.appendChild(selectControl(sec, c, spec));
        else if (c.control === 'number') box.appendChild(numberControl(sec, c, spec));
        else if (c.control === 'anchor') box.appendChild(anchorControl(sec));
        else if (c.control === 'show') box.appendChild(showControl(sec));
        else if (c.control === 'readonly') box.appendChild(readonlyControl(sec));
      });
    }

    // Full build: on selection, tab, language or Undo / Redo.
    function render() {
      var box = o.box;
      box.textContent = '';
      refreshers = [];
      var id = store.selected();
      var sec = id ? store.section(id) : null;
      o.kind.textContent = sec ? o.sectionLabel(sec.type) : '';
      if (!sec) { box.appendChild(el('p', { class: 'st-empty', text: o.t('select_section') })); o.note.textContent = ''; return; }
      var D = o.V3.describe();
      var editable = EDITABLE.indexOf(sec.type) !== -1;
      box.setAttribute('data-editable', String(editable));
      if (editable) {
        renderHero(box, sec, D);
        o.note.textContent = tx('note_edit');
      } else {
        var valid = store.lastValid();
        var normalized = valid && valid.pages[0].sections.filter(function (x) { return x.id === id; })[0];
        if (normalized) renderReadOnly(box, normalized, D);
        o.note.textContent = tx('note_later');
      }
      refresh();
    }
    // In place, after an edit: values of the fields not being typed in,
    // counters, errors and dependent states. Keeps focus and the caret.
    function refresh() {
      var id = store.selected();
      var sec = id ? store.section(id) : null;
      if (!sec) return;
      var errs = store.sectionErrors(id);
      refreshers.forEach(function (f) { f(sec, errs); });
    }
    return { render: render, refresh: refresh };
  }

  return { EDITABLE: EDITABLE, HERO_PLAN: HERO_PLAN, heroSpec: heroSpec, textLength: textLength, errorText: errorText, TX: TX, createInspector: createInspector };
});
