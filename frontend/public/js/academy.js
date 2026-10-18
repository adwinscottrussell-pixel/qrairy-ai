// QRAIVY Academy page (academy.html): renders js/academy-catalog.js in EN/DE.
//
// A tutorial only gets a player when it is 'published' AND has a video URL
// (https) for the viewer's language; everything else is shown as a clearly
// marked "Video coming soon" placeholder that cannot be clicked or played.
// Language state: js/qraivy-lang.js; sidebar labels: js/admin-shell.js.
(function () {
  var T = {
    en: {
      ac_title: 'QRAIVY Academy', ac_sub: 'Video help & tutorials',
      ac_welcome_title: 'Get to know QRAIVY.',
      ac_welcome_text: 'Short videos show you step by step how to use QRAIVY for your business – from your first Smart Landing Page to your Wallet stamp card.',
      ac_welcome_note: 'The first videos are in production. You can already see which topics are coming.',
      ac_featured_label: 'Recommended to start', ac_soon: 'Video coming soon',
      ac_filters_label: 'Categories', ac_filter_all: 'All', ac_library_title: 'All tutorials',
      ac_count_one: '1 tutorial', ac_count_many: '{n} tutorials',
      ac_empty: 'No tutorials in this category yet.',
      ac_help_title: 'Help & support', ac_help_text: 'Can’t find what you’re looking for? Our team is happy to help.',
      ac_help_center: 'Open the support center', ac_help_email: 'Email support@qraivy.com',
      ac_help_tip: 'Tip: tell us which page you are on – that helps us answer faster.',
      ac_video_unsupported: 'Your browser cannot play this video.'
    },
    de: {
      ac_title: 'QRAIVY Academy', ac_sub: 'Video Hilfe & Anleitungen',
      ac_welcome_title: 'Lerne QRAIVY kennen.',
      ac_welcome_text: 'Kurze Videos zeigen dir Schritt für Schritt, wie du QRAIVY für deinen Betrieb einsetzt – von der ersten Smart Landing Page bis zur Wallet-Stempelkarte.',
      ac_welcome_note: 'Die ersten Videos sind in Arbeit. Hier siehst du schon, welche Themen kommen.',
      ac_featured_label: 'Empfohlen zum Start', ac_soon: 'Video kommt bald',
      ac_filters_label: 'Kategorien', ac_filter_all: 'Alle', ac_library_title: 'Alle Anleitungen',
      ac_count_one: '1 Anleitung', ac_count_many: '{n} Anleitungen',
      ac_empty: 'In dieser Kategorie gibt es noch keine Anleitungen.',
      ac_help_title: 'Hilfe & Support', ac_help_text: 'Du findest nicht, was du suchst? Unser Team hilft dir gern weiter.',
      ac_help_center: 'Zum Support-Center', ac_help_email: 'E-Mail an support@qraivy.com',
      ac_help_tip: 'Tipp: Schreib uns kurz, auf welcher Seite du gerade bist – dann können wir schneller helfen.',
      ac_video_unsupported: 'Dein Browser kann dieses Video nicht abspielen.'
    }
  };

  // Simple line icons per category (decorative).
  var ICONS = {
    'getting-started': '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    'smart-landing-pages': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    'deals': '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    'notifications': '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'wallet': '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    'customers': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'
  };
  var CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';

  function norm(l) { return l === 'de' ? 'de' : 'en'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function text(lang, key, vars) {
    var d = T[norm(lang)];
    var s = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : T.en[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function pick(map, lang) { return map ? (map[norm(lang)] || map.en || '') : ''; }
  function icon(paths, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths + '</svg>'; }

  // The video URL a tutorial may play in `lang`, or null.
  function playableUrl(t, lang) {
    if (!t || t.status !== 'published' || !t.video) return null;
    var url = t.video[norm(lang)];
    return typeof url === 'string' && /^https:\/\/\S+$/.test(url) ? url : null;
  }
  function duration(sec) {
    if (typeof sec !== 'number' || !(sec > 0)) return '';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function categoryTitle(catalog, id, lang) {
    for (var i = 0; i < catalog.categories.length; i++) if (catalog.categories[i].id === id) return pick(catalog.categories[i].title, lang);
    return '';
  }

  // 16:9 media area: a player for a playable tutorial, otherwise the placeholder.
  function media(t, lang, big) {
    var url = playableUrl(t, lang);
    if (url) {
      var poster = t.thumbnail && /^https:\/\//.test(pick(t.thumbnail, lang)) ? ' poster="' + esc(pick(t.thumbnail, lang)) + '"' : '';
      return '<div class="ac-media"><video class="ac-video" controls preload="metadata" playsinline' + poster + ' src="' + esc(url) + '">' + esc(text(lang, 'ac_video_unsupported')) + '</video></div>';
    }
    return '<div class="ac-media ac-media--soon ac-media--' + esc(t.category) + (big ? ' ac-media--big' : '') + '">'
      + icon(ICONS[t.category] || CLOCK, 'ac-media__icon')
      + '<span class="ac-soon">' + icon(CLOCK, 'ac-soon__icon') + esc(text(lang, 'ac_soon')) + '</span>'
      + '</div>';
  }

  function featuredHtml(catalog, lang) {
    var t = catalog.tutorials.filter(function (x) { return x.featured; })[0] || catalog.tutorials[0];
    if (!t) return '';
    return '<div class="ac-featured__media">' + media(t, lang, true) + '</div>'
      + '<div class="ac-featured__body">'
      + '<span class="ac-eyebrow">' + esc(text(lang, 'ac_featured_label')) + '</span>'
      + '<h2 class="ac-featured__title" id="' + esc(t.id) + '">' + esc(pick(t.title, lang)) + '</h2>'
      + '<p class="ac-featured__desc">' + esc(pick(t.description, lang)) + '</p>'
      + '<span class="ac-chip">' + esc(categoryTitle(catalog, t.category, lang)) + '</span>'
      + '</div>';
  }

  function filtersHtml(catalog, lang, active) {
    var items = [{ id: 'all', label: text(lang, 'ac_filter_all') }].concat(catalog.categories.map(function (c) { return { id: c.id, label: pick(c.title, lang) }; }));
    return items.map(function (c) {
      var on = c.id === active;
      return '<button type="button" class="ac-filter' + (on ? ' is-active' : '') + '" data-filter="' + esc(c.id) + '" aria-pressed="' + on + '">' + esc(c.label) + '</button>';
    }).join('');
  }

  function cardsHtml(catalog, lang, active) {
    var list = catalog.tutorials.filter(function (t) { return active === 'all' || t.category === active; });
    if (!list.length) return { html: '<p class="ac-empty">' + esc(text(lang, 'ac_empty')) + '</p>', count: 0 };
    return {
      count: list.length,
      html: list.map(function (t) {
        var d = duration(t.duration);
        return '<article class="ac-card" id="tutorial-' + esc(t.id) + '" data-tutorial="' + esc(t.id) + '" data-category="' + esc(t.category) + '">'
          + media(t, lang, false)
          + '<div class="ac-card__body">'
          + '<span class="ac-chip">' + esc(categoryTitle(catalog, t.category, lang)) + '</span>'
          + '<h3 class="ac-card__title">' + esc(pick(t.title, lang)) + '</h3>'
          + '<p class="ac-card__desc">' + esc(pick(t.description, lang)) + '</p>'
          + (d ? '<span class="ac-card__duration">' + esc(d) + '</span>' : '')
          + '</div></article>';
      }).join('')
    };
  }

  var state = { lang: 'en', filter: 'all' };

  function render() {
    var catalog = window.QRAIVY_ACADEMY;
    if (!catalog) return;
    var lang = state.lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-ac]').forEach(function (el) { el.textContent = text(lang, el.getAttribute('data-ac')); });
    var nav = document.getElementById('ac-filters');
    if (nav) nav.setAttribute('aria-label', text(lang, 'ac_filters_label'));
    var f = document.getElementById('ac-featured');
    if (f) f.innerHTML = featuredHtml(catalog, lang);
    if (nav) nav.innerHTML = filtersHtml(catalog, lang, state.filter);
    var cards = cardsHtml(catalog, lang, state.filter);
    var grid = document.getElementById('ac-grid');
    if (grid) grid.innerHTML = cards.html;
    var count = document.getElementById('ac-count');
    if (count) count.textContent = cards.count === 1 ? text(lang, 'ac_count_one') : text(lang, 'ac_count_many', { n: cards.count });
  }

  function applyLang(lang) {
    state.lang = norm(lang);
    try { localStorage.setItem('qraivy_lang', state.lang); } catch (e) {}
    window._qraivyLang = state.lang;
    render();
    if (window.QraivyShell) window.QraivyShell.apply(state.lang);
  }

  function bind() {
    var nav = document.getElementById('ac-filters');
    if (nav) nav.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-filter]') : null;
      if (!btn) return;
      state.filter = btn.getAttribute('data-filter');
      render();
    });
  }

  window.toggleLang = function () { applyLang(state.lang === 'en' ? 'de' : 'en'); };
  window.QraivyAcademy = { T: T, text: text, playableUrl: playableUrl, featuredHtml: featuredHtml, filtersHtml: filtersHtml, cardsHtml: cardsHtml, applyLang: applyLang };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      bind();
      applyLang(window.QRAIVY_LANGUAGE);
    });
  }
})();
