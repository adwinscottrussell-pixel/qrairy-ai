/*
 * onboarding-previews.js — Landing Page Studio V3 onboarding (Phase O0.1,
 * demo pages since the Step 1 card refresh): the real QRAIVY pages shown in
 * the Step 1 cards' phones, each marked "DEMO" on the card.
 *
 * Every preview is a V3 design rendered by the shared js/lpV3/core.js
 * (renderDesign, preview mode), the same renderer as the Studio and the
 * public page; this file only holds three fictional demo designs, EN and DE:
 *   instagram  "Mia backt", a creator storefront: profile header, social links,
 *              a photo feed and a small shop (nothing is imported or sold;
 *              Instagram import is Coming soon)
 *   website    "Bäckerei MorgenGold", Ulm: photo hero, products with prices,
 *              opening hours, contact (nothing is imported either)
 *   scratch    "Café Sonnenschein": a finished page (photo hero,
 *              buttons, text, opening hours), what a page built from scratch
 *              can become
 * The only photos are the three approved AI-generated bakery starter images
 * (local files, in the Studio-only upload); their addresses come from
 * js/studio/studio-demo-images.js (imageUrl, passed in), which also turns
 * them into inline images with the "AI · KI-generiert" label (localize). No
 * other image, no external image. The HTML goes into frames sandboxed with
 * no permissions (no scripts, no origin). No request, no storage.
 *
 * Step 3's live phone (Phase O2): liveHtml adds FRAME_SCRIPT, fixed text with
 * no customer data, to a core.js page. The page is shown in a frame sandboxed
 * with "allow-scripts" only (never allow-same-origin: an opaque origin, no
 * access to the wizard, its storage or cookies), as the Studio's preview is.
 * The script blocks every click, form and link (nothing navigates), takes
 * the page's controls out of the keyboard order, reports the scroll position
 * and, on the wizard's message, restores it and scrolls to a section just
 * added or moved. acceptFrameMessage accepts exactly { type: 'scroll', y }.
 *
 * T1b: markExamples adds a small "Example" tag (fixed wizard text) at the
 * top of the sections showing example content in Step 3's phone, so example
 * text, prices, hours and links are never taken for the customer's own.
 *
 * In Node: module.exports (for the tests). In the browser:
 * window.QraivyOnboardingPreviews.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyOnboardingPreviews = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CARDS = ['instagram', 'website', 'scratch'];
  // the three photos the demos use (studio-demo-images.js STARTERS, local and AI-labelled)
  var PHOTOS = { croissants: 'bakery-croissants-01', bread: 'bakery-bread-01', coffee: 'bakery-coffee-01' };

  // demos(V3, imageUrl, lang) -> { instagram, website, scratch }: { name, design } (fictional; core.js checks them)
  function demos(V3, imageUrl, lang) {
    var de = lang === 'de';
    var L = function (en, d) { return de ? d : en; };
    var IMG = function (id) { return imageUrl(PHOTOS[id]); };
    var hours = function (rows) { return rows.map(function (r) { return r[1] ? { day: r[0], ranges: [{ open: r[1], close: r[2] }] } : { day: r[0], closed: true }; }); };
    var page = function (theme, sections) {
      return { schemaVersion: V3.SCHEMA_VERSION, theme: theme, settings: { language: de ? 'de' : 'en' }, header: { showBusinessName: true },
        pages: [{ id: 'start', title: de ? 'Start' : 'Home', sections: sections }] };
    };
    return {
      instagram: { name: 'Mia backt', design: page({ palette: { brand: '#c2185b', onBrand: '#ffffff' }, fontPair: 'rounded', radius: 'lg' }, [
        // a creator storefront: a compact profile header, the photo feed right below it, social links, then the shop
        { id: 's_demoig01', type: 'hero', variant: 'simple', data: {
          eyebrow: '@miabackt', headline: 'Mia backt',
          subheadline: L('Food creator in Ulm. Sourdough, pastries and easy weekend baking, new recipes every Friday.', 'Food-Creatorin aus Ulm. Sauerteig, Gebäck und einfaches Wochenend-Backen, jeden Freitag neue Rezepte.'),
          primary: { text: L('Visit the shop', 'Zum Shop'), target: '/shop', icon: 'cart' }, secondary: { text: 'Newsletter', target: '/' } } },
        // the feed: a 2 x 2 grid on the phone (only three approved photos exist, so one appears twice)
        { id: 's_demoig03', type: 'gallery', variant: 'grid', data: { title: L('Latest posts', 'Neueste Beiträge'), images: [
          { image: IMG('croissants'), alt: L('Weekend croissants', 'Wochenend-Croissants') }, { image: IMG('coffee'), alt: L('Flat white at home', 'Flat White zu Hause') },
          { image: IMG('bread'), alt: L('Country sourdough', 'Landbrot mit Sauerteig') }, { image: IMG('croissants'), alt: L('Croissant lamination', 'Croissants falten') }] } },
        { id: 's_demoig02', type: 'socialMedia', variant: 'icons', data: { title: L('Follow me', 'Folge mir'), links: [
          { platform: 'instagram', url: 'https://www.instagram.com/miabackt' }, { platform: 'tiktok', url: 'https://www.tiktok.com/@miabackt' },
          { platform: 'youtube', url: 'https://www.youtube.com/@miabackt' }, { platform: 'pinterest', url: 'https://www.pinterest.de/miabackt' }] } },
        { id: 's_demoig04', type: 'products', variant: 'grid', anchor: 'shop', data: { title: 'Shop', items: [
          { name: L('Sourdough starter kit', 'Sauerteig-Starterset'), description: L('With my step-by-step guide', 'Mit Schritt-für-Schritt-Anleitung'), price: '19,00 €', image: IMG('bread'), target: '/', buttonText: L('View', 'Ansehen') },
          { name: L('Recipe e-book', 'Rezept-E-Book'), description: L('40 weekend recipes', '40 Wochenend-Rezepte'), price: '12,00 €', image: IMG('croissants'), target: '/', buttonText: L('View', 'Ansehen') },
          { name: L('Baking class in Ulm', 'Backkurs in Ulm'), description: L('Saturday mornings', 'Samstagvormittag'), price: '45,00 €', image: IMG('coffee'), target: '/', buttonText: L('View', 'Ansehen') }] } },
      ]) },
      website: { name: 'Bäckerei MorgenGold', design: page({ palette: { brand: '#8a4b0f', onBrand: '#ffffff', surface: '#fbf6ef' }, fontPair: 'serif-display', radius: 'md' }, [
        { id: 's_demowb01', type: 'hero', variant: 'overlay', data: {
          eyebrow: L('Since 1962 · Ulm', 'Seit 1962 · Ulm'), headline: L('Fresh from the oven every morning', 'Jeden Morgen ofenfrisch'),
          subheadline: L('Artisan bread, butter croissants and coffee in the heart of Ulm.', 'Handwerksbrot, Buttercroissants und Kaffee mitten in Ulm.'),
          backgroundImage: IMG('bread'), imageAlt: L('Freshly baked bread', 'Frisch gebackenes Brot'), overlay: 50,
          primary: { text: L('Our products', 'Unsere Produkte'), target: '/produkte' } } },
        { id: 's_demowb02', type: 'products', variant: 'grid', anchor: 'produkte', data: { title: L('From our bakehouse', 'Aus unserer Backstube'), items: [
          { name: L('Farmhouse loaf', 'Bauernbrot'), description: L('Sourdough, 1 kg', 'Sauerteig, 1 kg'), price: '4,20 €', image: IMG('bread') },
          { name: L('Butter croissant', 'Buttercroissant'), description: L('Baked every hour', 'Stündlich frisch'), price: '1,60 €', image: IMG('croissants') },
          { name: 'Flat White', description: L('Our house roast', 'Unsere Hausröstung'), price: '3,40 €', image: IMG('coffee') }] } },
        { id: 's_demowb03', type: 'openingHours', variant: 'compact', data: { title: L('Opening hours', 'Öffnungszeiten'),
          days: hours([['mon', '06:30', '18:00'], ['tue', '06:30', '18:00'], ['wed', '06:30', '18:00'], ['thu', '06:30', '18:00'], ['fri', '06:30', '18:00'], ['sat', '07:00', '13:00'], ['sun']]) } },
        { id: 's_demowb04', type: 'contact', variant: 'card', data: { title: L('Visit us', 'Besuchen Sie uns'),
          address: { line1: 'Hafengasse 7', postalCode: '89073', city: 'Ulm' }, phone: '+49 731 000000', email: 'hallo@example.com' } },
      ]) },
      scratch: { name: 'Café Sonnenschein', design: page({ palette: { brand: '#0f766e', onBrand: '#ffffff', surface: '#f2f8f7' }, fontPair: 'modern', radius: 'lg' }, [
        { id: 's_demosc01', type: 'hero', variant: 'overlay', data: {
          eyebrow: L('Café & roastery · Ulm', 'Café & Rösterei · Ulm'), headline: 'Café Sonnenschein',
          subheadline: L('Specialty coffee, homemade cakes and a sunny terrace by the Danube.', 'Spezialitätenkaffee, hausgemachte Kuchen und eine sonnige Terrasse an der Donau.'),
          backgroundImage: IMG('coffee'), imageAlt: L('A cup of coffee', 'Eine Tasse Kaffee'), overlay: 55,
          primary: { text: L('Reserve a table', 'Tisch reservieren'), target: 'tel:+49731000000' }, secondary: { text: L('Menu', 'Speisekarte'), target: '/karte' } } },
        { id: 's_demosc02', type: 'buttons', variant: 'cards', data: { items: [
          { label: 'WhatsApp', subtitle: L('Message us', 'Schreiben Sie uns'), kind: 'whatsapp', target: 'https://wa.me/49731000000', icon: 'chat' },
          { label: L('Call', 'Anrufen'), subtitle: '0731 000000', kind: 'call', target: 'tel:+49731000000', icon: 'phone' },
          { label: L('Directions', 'Route'), subtitle: L('By the Danube', 'An der Donau'), kind: 'directions', target: 'https://maps.google.com/?q=Ulm', icon: 'pin' }] } },
        { id: 's_demosc03', type: 'text', variant: 'plain', anchor: 'karte', data: { heading: L('Our menu', 'Unsere Karte'),
          body: L('Single-origin espresso, cold brew in summer, and cakes baked fresh every morning.', 'Single-Origin-Espresso, Cold Brew im Sommer und jeden Morgen frisch gebackene Kuchen.') } },
        { id: 's_demosc04', type: 'openingHours', variant: 'compact', data: { title: L('Opening hours', 'Öffnungszeiten'),
          days: hours([['mon'], ['tue', '08:00', '18:00'], ['wed', '08:00', '18:00'], ['thu', '08:00', '18:00'], ['fri', '08:00', '19:00'], ['sat', '09:00', '19:00'], ['sun', '10:00', '17:00']]) } },
      ]) },
    };
  }
  function render(V3, demo, localize) {
    var v = V3.validateDesign(demo.design);
    var r = v.ok ? V3.renderDesign(v.design, { businessName: demo.name }, { preview: true }) : null;
    if (!r || !r.ok) return '';
    return typeof localize === 'function' ? localize(r.html) : r.html;
  }
  // previews({ V3, imageUrl, lang, localize }) -> { instagram, website, scratch } (page HTML, '' if invalid)
  function previews(o) {
    var all = demos(o.V3, o.imageUrl, o.lang === 'de' ? 'de' : 'en'), out = {};
    CARDS.forEach(function (k) { out[k] = render(o.V3, all[k], o.localize); });
    return out;
  }

  // ── Step 3's live phone ──
  var SECTION_ID = /^s_[a-z0-9]{4,16}$/;
  var MAX_SCROLL = 10000000;
  var FRAME_SCRIPT =
    '<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}' +
    '[data-v3-id].ob-new{outline:3px solid #ff5a1f;outline-offset:-3px;transition:outline-color .6s ease}[data-v3-id].ob-new.ob-fade{outline-color:transparent}</style>' +
    '<script>(function(){' +
    'function stop(e){e.preventDefault();e.stopPropagation();}' +
    '["click","auxclick","dblclick","submit"].forEach(function(t){document.addEventListener(t,stop,true);});' +
    'var all=document.querySelectorAll("a,button,input,select,textarea,summary,iframe,[tabindex]");for(var i=0;i<all.length;i++)all[i].setAttribute("tabindex","-1");' +
    'var t=null;addEventListener("scroll",function(){if(t)return;t=setTimeout(function(){t=null;parent.postMessage({type:"scroll",y:Math.round(scrollY)},"*");},120);},{passive:true});' +
    'function reveal(id){var s=document.querySelectorAll("[data-v3-id]");for(var i=0;i<s.length;i++){if(s[i].getAttribute("data-v3-id")!==id)continue;var n=s[i];' +
    // reduced motion (O2.1): straight there, no smooth scroll
    'var still=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;' +
    'scrollTo({top:Math.max(0,n.getBoundingClientRect().top+scrollY-56),behavior:still?"instant":"smooth"});n.classList.add("ob-new");' +
    'setTimeout(function(){n.classList.add("ob-fade");},1400);setTimeout(function(){n.classList.remove("ob-new","ob-fade");},2100);return;}}' +
    'addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(!d||typeof d!=="object"||d.type!=="init")return;' +
    'if(typeof d.y==="number")scrollTo({top:d.y,behavior:"instant"});' +
    'if(typeof d.reveal==="string"&&/^s_[a-z0-9]{4,16}$/.test(d.reveal))reveal(d.reveal);});' +
    '})();</script>';
  // the core.js page plus FRAME_SCRIPT, just before </body> ('' for anything else)
  function liveHtml(html) {
    if (typeof html !== 'string' || !/<\/body><\/html>$/.test(html)) return '';
    return html.slice(0, html.length - '</body></html>'.length) + FRAME_SCRIPT + '</body></html>';
  }
  // T1b: the sections showing example content get a small "Example" tag at their top, so example text,
  // prices, hours and links are never mistaken for the customer's own. ids: section ids (s_ + 4-16 of
  // a-z0-9, anything else ignored); label: a fixed text of the wizard (escaped). '' for anything but a page.
  var EXAMPLE_CSS = '<style>.ob-ex{display:inline-block;margin:0 0 10px;padding:2px 9px;border:1px dashed #b45309;border-radius:999px;background:#fffbeb;' +
    'color:#7c2d12;font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase}</style>';
  function markExamples(html, ids, label) {
    if (typeof html !== 'string' || !/<\/head>/.test(html)) return '';
    var text = String(label || '').replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
    var marked = false;
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (typeof id !== 'string' || !SECTION_ID.test(id)) return;
      html = html.replace(new RegExp('(<section [^>]*data-v3-id="' + id + '"[^>]*><div class="v3-wrap">)'), function (m) { marked = true; return m + '<span class="ob-ex">' + text + '</span>'; });
    });
    return marked ? html.replace('</head>', EXAMPLE_CSS + '</head>') : html;
  }

  // a message from the live frame -> { type: 'scroll', y } or null (nothing else is accepted)
  function acceptFrameMessage(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.getPrototypeOf(d) !== Object.prototype) return null;
    if (d.type === 'scroll' && Object.keys(d).sort().join(',') === 'type,y' && typeof d.y === 'number' && isFinite(d.y) && Math.floor(d.y) === d.y && d.y >= 0 && d.y <= MAX_SCROLL) return { type: 'scroll', y: d.y };
    return null;
  }
  // the message the wizard sends after each render: the scroll position, and the section to reveal (or none)
  function initMessage(y, revealId) {
    return { type: 'init', y: typeof y === 'number' && isFinite(y) && y >= 0 ? Math.min(Math.floor(y), MAX_SCROLL) : 0, reveal: typeof revealId === 'string' && SECTION_ID.test(revealId) ? revealId : null };
  }

  return { CARDS: CARDS, PHOTOS: PHOTOS, demos: demos, previews: previews,
    FRAME_SCRIPT: FRAME_SCRIPT, liveHtml: liveHtml, markExamples: markExamples, acceptFrameMessage: acceptFrameMessage, initMessage: initMessage };
});
