/*
 * onboarding-templates.js — Landing Page Studio V3 onboarding (Phase T0): the
 * starter template catalog for "Choose Your Design" and "Customize Your
 * Page" (the UI follows in later phases; nothing loads this file yet).
 *
 * Six mobile-first starter designs, EN and DE: Restaurant, Bakery & Café,
 * Beauty & Salon, Retail & Boutique, Creator & Influencer, Professional
 * Services. Each one has a font pair and corner radius, three or four
 * palettes (every text colour pair at 4.5:1 or better), suggested sections
 * in order, suggested buttons, and example content for every onboarding
 * section type it has content for. Pages are ordinary V3 designs: built
 * here, checked by core.validateDesign and rendered by core.renderDesign
 * (no renderer or editor of its own). Section ids are the onboarding's
 * fixed ids (onboarding-model.js SECTION_IDS), so a section keeps its id
 * when the template changes.
 *
 * Example content comes in two kinds:
 *   demo-only  fictional facts and every link: buttons and their targets,
 *              hero buttons, products with prices, opening hours, the
 *              address and email, social profiles. Shown in the preview
 *              only (sample()); starter() removes them, so they are never
 *              saved as the customer's business information. Example
 *              targets lead nowhere outside the page: the page top ("/")
 *              or one of its own sections; social examples are the
 *              platforms' home pages, never an account.
 *   sample     neutral starter text without facts (eyebrow, headings,
 *              descriptions) and the approved starter photos. starter()
 *              keeps them, as core.starter's texts are kept today; they
 *              are listed (samplePaths) so a later phase can mark them.
 * The customer's own name and description (Step 2) replace the example
 * headline and sub-headline.
 *
 * Photos: only approved, AI-generated images, by id, never unrelated
 * pictures: the Deals starter catalog (js/deal-starter-images.js,
 * images/deals/starter/, 1200 x 900) for the four business templates, and
 * the two Studio starter heroes (STUDIO_IMAGES, images/studio/starter/,
 * 1122 x 1402 portrait) for Creator & Influencer and Professional Services.
 * The address is passed in (imageUrl) or comes from imageUrl() here: the
 * Deals starters at their Cloudinary address (as studio-demo-images.js
 * cloudinaryUrl builds it), the Studio starters at their intended one
 * (folder qraivy-studio-starters, not uploaded yet; aspect ratio kept). With
 * a single photo each, Creator and Services offer no Gallery example.
 *
 * No request, no storage, no DOM. In Node: module.exports (for the tests).
 * In the browser: window.QraivyOnboardingTemplates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QraivyOnboardingTemplates = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SECTION_TYPES = ['hero', 'buttons', 'socialMedia', 'contact', 'openingHours', 'products', 'gallery', 'text'];
  // the same ids as onboarding-model.js SECTION_IDS (checked by the tests)
  var SECTION_IDS = { hero: 's_obhero01', buttons: 's_obbuttons1', socialMedia: 's_obsocial1', contact: 's_obcontact1',
    openingHours: 's_obhours01', products: 's_obproducts1', gallery: 's_obgallery1', text: 's_obtext01' };

  // The button choices of "Customize Your Page". kind: the link check the customer's own link gets
  // (core.js LINK_KINDS); Book, Shop, Menu, Offers, Events and Custom are web links with their own icon.
  var BUTTON_PRESETS = [
    { id: 'website', kind: 'website', icon: 'globe', label: { en: 'Website', de: 'Website' } },
    { id: 'whatsapp', kind: 'whatsapp', icon: 'chat', label: { en: 'WhatsApp', de: 'WhatsApp' } },
    { id: 'call', kind: 'call', icon: 'phone', label: { en: 'Call', de: 'Anrufen' } },
    { id: 'directions', kind: 'directions', icon: 'pin', label: { en: 'Directions', de: 'Route' } },
    { id: 'book', kind: 'link', icon: 'calendar', label: { en: 'Book', de: 'Buchen' } },
    { id: 'shop', kind: 'link', icon: 'cart', label: { en: 'Shop', de: 'Shop' } },
    { id: 'menu', kind: 'link', icon: 'info', label: { en: 'Menu', de: 'Speisekarte' } },
    { id: 'offers', kind: 'link', icon: 'tag', label: { en: 'Offers', de: 'Angebote' } },
    { id: 'events', kind: 'link', icon: 'star', label: { en: 'Events', de: 'Events' } },
    { id: 'email', kind: 'email', icon: 'mail', label: { en: 'Email', de: 'E-Mail' } },
    { id: 'custom', kind: 'link', icon: 'arrow', label: { en: 'Custom link', de: 'Eigener Link' } },
  ];
  var PRESET = {};
  BUTTON_PRESETS.forEach(function (p) { PRESET[p.id] = p; });

  // ── photos ──
  // The two Studio starter heroes (approved 2026-11-04), AI-generated. file: the web copy
  // (JPEG, quality 0.82, the original's size), the only file in the repository; the supplied
  // PNG originals are kept outside it, recorded here by name and checksum (masterSha256).
  // Neither is uploaded yet: the address below is the intended one and needs approval before
  // the upload.
  var CLOUD = 'dwqc6n7rn';
  var DEAL_FOLDER = 'qraivy-deal-starters', DEAL_TRANSFORM = 'c_fill,g_auto,h_900,w_1200,f_auto,q_auto';
  var STUDIO_FOLDER = 'qraivy-studio-starters', STUDIO_TRANSFORM = 'c_limit,w_1200,f_auto,q_auto';   // portrait kept, never cropped to 4:3
  var STUDIO_IMAGES = [
    { id: 'QRAIVY-Creator-Hero', template: 'creator', file: 'images/studio/starter/QRAIVY-Creator-Hero.jpg', master: 'QRAIVY-Creator-Hero.png',
      width: 1122, height: 1402, sha256: '90ee22714838427844fd48161d4a8ffe4ba2c3835526ac418f0a3cad96992aff',
      origin: { type: 'ai_generated', suppliedAs: 'Confident Creator in Neon Studio.png', approvedOn: '2026-11-04',
        masterSha256: '89117ccab9f62e12b357459e1e81a0491be73d75e37846ec6ae3eca8bf5f0e5f', generator: null } },
    { id: 'QRAIVY-Professional-Services-Hero', template: 'services', file: 'images/studio/starter/QRAIVY-Professional-Services-Hero.jpg', master: 'QRAIVY-Professional-Services-Hero.png',
      width: 1122, height: 1402, sha256: '7a178163efb6120372d28fcdbcd318c22074c683cab3d3708ff98ae6459d8839',
      origin: { type: 'ai_generated', suppliedAs: 'Warm Professional Office Portrait.png', approvedOn: '2026-11-04',
        masterSha256: '02e34fc85cfd5b1370f7e4b19e0619a980274ece17d318486390ae8719f6e3f4', generator: null } },
  ];
  var STUDIO_IMAGE = {};
  STUDIO_IMAGES.forEach(function (i) { STUDIO_IMAGE[i.id] = i; });
  var AI_LABEL = 'AI · KI-generiert';
  // imageUrl(id) -> the Cloudinary address of a starter photo: a Studio starter in its own folder
  // (aspect ratio kept), any other id as a Deals starter (studio-demo-images.js cloudinaryUrl's address)
  function imageUrl(id) {
    var studio = Object.prototype.hasOwnProperty.call(STUDIO_IMAGE, id);
    return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + (studio ? STUDIO_TRANSFORM + '/' + STUDIO_FOLDER : DEAL_TRANSFORM + '/' + DEAL_FOLDER) + '/' + id + '.jpg';
  }

  // palette(brand, surface, text, muted, dark): background, onBrand and heroText are white in every palette
  function pal(id, en, de, c) {
    return { id: id, label: { en: en, de: de }, colors: { brand: c[0], onBrand: '#ffffff', background: '#ffffff', surface: c[1], text: c[2], muted: c[3], heroText: '#ffffff', dark: c[4] } };
  }

  function hours(rows) { return rows.map(function (r) { return r.length > 1 ? { day: r[0], ranges: r.slice(1).map(function (x) { return { open: x[0], close: x[1] }; }) } : { day: r[0], closed: true }; }); }

  // ── the six templates ──
  // content(L, IMG, price) -> { type: { variant, style?, anchor?, data } | null }: the example
  // content of every section type (null: no good example, e.g. no matching photo).
  // buttons: [preset id, label en, label de, subtitle en, subtitle de, target] (labels may be the
  // preset's own; target "/" = page top or "/<anchor>" = a section of the page).
  var TEMPLATES = [
    {
      id: 'restaurant', kind: 'business', demoName: 'Trattoria Sole',
      label: { en: 'Restaurant', de: 'Restaurant' },
      blurb: { en: 'Menu, reservations and opening hours at a glance.', de: 'Speisekarte, Reservierung und Öffnungszeiten auf einen Blick.' },
      fontPair: 'serif-display', radius: 'sm',
      palettes: [
        pal('bordeaux', 'Bordeaux', 'Bordeaux', ['#8c1c2b', '#f7f1ec', '#1f1714', '#5c514b', '#1f1714']),
        pal('olive', 'Olive grove', 'Olivenhain', ['#4b6a2e', '#f3f5ee', '#1a1f16', '#535b4c', '#1d2418']),
        pal('terracotta', 'Terracotta', 'Terrakotta', ['#a8401c', '#faf3ee', '#24170f', '#62544a', '#2a1a12']),
        pal('midnight', 'Midnight & gold', 'Nachtblau & Gold', ['#7a5a10', '#f6f3ec', '#121417', '#4f535b', '#121417']),
      ],
      images: ['restaurant-table-01', 'restaurant-fresh-01', 'restaurant-meal-01'],
      sections: ['hero', 'buttons', 'products', 'gallery', 'text', 'openingHours', 'contact', 'socialMedia'],
      buttons: [
        ['book', 'Reserve a table', 'Tisch reservieren', 'Online in a minute', 'In einer Minute online', '/'],
        ['menu', 'Menu', 'Speisekarte', 'Starters, mains, desserts', 'Vorspeisen, Hauptgerichte, Desserts', '/menu'],
        ['call', 'Call us', 'Anrufen', 'For groups and celebrations', 'Für Gruppen und Feiern', '/'],
        ['directions', 'Directions', 'Route', 'Find us easily', 'So finden Sie uns', '/kontakt'],
      ],
      content: function (L, IMG, price) {
        return {
          hero: { variant: 'overlay', data: { eyebrow: L('Fresh · Seasonal · Homemade', 'Frisch · Saisonal · Hausgemacht'),
            subheadline: L('Seasonal dishes, fresh ingredients and a warm welcome. We look forward to your visit.', 'Saisonale Gerichte, frische Zutaten und ein herzlicher Empfang. Wir freuen uns auf Ihren Besuch.'),
            backgroundImage: IMG('restaurant-table-01'), imageAlt: L('Shared dishes on a laid table', 'Gerichte zum Teilen auf einem gedeckten Tisch'), overlay: 50,
            primary: { text: L('Reserve a table', 'Tisch reservieren'), target: '/', icon: 'calendar' }, secondary: { text: L('View menu', 'Zur Speisekarte'), target: '/menu' } } },
          products: { variant: 'list', anchor: 'menu', style: { background: 'alt' }, data: { title: L('Our menu', 'Unsere Speisekarte'), items: [
            { name: L('Burrata & heirloom tomatoes', 'Burrata mit Ochsenherztomaten'), description: L('Basil, olive oil, toasted bread', 'Basilikum, Olivenöl, geröstetes Brot'), price: price(12.5) },
            { name: L('Homemade tagliatelle', 'Hausgemachte Tagliatelle'), description: L('Slow-cooked beef ragù, parmesan', 'Geschmortes Rinderragout, Parmesan'), price: price(16.9) },
            { name: L('Grilled salmon fillet', 'Gegrilltes Lachsfilet'), description: L('Seasonal vegetables, lemon butter', 'Saisongemüse, Zitronenbutter'), price: price(22.5) },
            { name: 'Tiramisu della casa', description: L('Our classic, made fresh every day', 'Unser Klassiker, täglich frisch'), price: price(7.5) }] } },
          gallery: { variant: 'carousel', data: { title: L('Impressions', 'Eindrücke'), images: [
            { image: IMG('restaurant-fresh-01'), alt: L('A chef garnishing a fresh salad', 'Ein Koch garniert einen frischen Salat') },
            { image: IMG('restaurant-meal-01'), alt: L('Grilled salmon with vegetables', 'Gegrillter Lachs mit Gemüse') },
            { image: IMG('restaurant-table-01'), alt: L('Shared dishes on a laid table', 'Gerichte zum Teilen auf einem gedeckten Tisch') }] } },
          text: { variant: 'plain', style: { background: 'dark', align: 'center', spacing: 'roomy' }, data: { heading: L('Welcome', 'Willkommen'),
            body: L('Good food brings people together. Our kitchen cooks with fresh, seasonal ingredients – from a quick lunch to a long evening with friends.',
              'Gutes Essen verbindet. Unsere Küche kocht mit frischen, saisonalen Zutaten – vom schnellen Mittagessen bis zum langen Abend mit Freunden.') } },
          openingHours: { variant: 'compact', style: { background: 'alt' }, data: { title: L('Opening hours', 'Öffnungszeiten'),
            days: hours([['mon'], ['tue', ['12:00', '14:30'], ['18:00', '22:30']], ['wed', ['12:00', '14:30'], ['18:00', '22:30']], ['thu', ['12:00', '14:30'], ['18:00', '22:30']],
              ['fri', ['12:00', '14:30'], ['18:00', '23:00']], ['sat', ['18:00', '23:00']], ['sun', ['12:00', '21:00']]]) } },
          contact: contact(L, 'kontakt', L('Visit us', 'Besuchen Sie uns')),
          socialMedia: social(L, ['instagram', 'facebook'], L('Follow us', 'Folgen Sie uns')),
        };
      },
    },
    {
      id: 'bakery', kind: 'business', demoName: 'Backstube Morgenrot',
      label: { en: 'Bakery & Café', de: 'Bäckerei & Café' },
      blurb: { en: 'Fresh products, offers and pre-orders.', de: 'Frische Produkte, Angebote und Vorbestellungen.' },
      fontPair: 'classic', radius: 'md',
      palettes: [
        pal('honey', 'Honey crust', 'Honigkruste', ['#94500f', '#fbf5ec', '#2b1d12', '#65554a', '#2b1d12']),
        pal('sage', 'Sage café', 'Salbei-Café', ['#3d6a55', '#f1f6f3', '#17221d', '#4e5c55', '#17221d']),
        pal('berry', 'Berry tart', 'Beerentarte', ['#992c58', '#fbf1f5', '#23131a', '#5e4a54', '#23131a']),
      ],
      images: ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'],
      sections: ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia'],
      buttons: [
        ['offers', "This week's offers", 'Angebote der Woche', 'Save on favourites', 'Lieblinge günstiger', '/'],
        ['whatsapp', 'Pre-order via WhatsApp', 'Per WhatsApp vorbestellen', 'Pick up without waiting', 'Ohne Wartezeit abholen', '/'],
        ['call', 'Call us', 'Anrufen', 'Cakes for celebrations', 'Torten für Feste', '/'],
        ['directions', 'Directions', 'Route', 'Find us easily', 'So finden Sie uns', '/kontakt'],
      ],
      content: function (L, IMG, price) {
        return {
          hero: { variant: 'overlay', data: { eyebrow: L('Baked fresh every morning', 'Jeden Morgen frisch gebacken'),
            subheadline: L('Crusty bread, buttery croissants and good coffee – made by hand with time and care.', 'Knuspriges Brot, buttrige Croissants und guter Kaffee – von Hand gemacht, mit Zeit und Sorgfalt.'),
            backgroundImage: IMG('bakery-croissants-01'), imageAlt: L('Croissants and pastries on a wooden board', 'Croissants und Plundergebäck auf einem Holzbrett'), overlay: 45,
            primary: { text: L('Our selection', 'Unser Sortiment'), target: '/sortiment', icon: 'arrow' }, secondary: { text: L('Directions', 'Anfahrt'), target: '/kontakt' } } },
          products: { variant: 'list', anchor: 'sortiment', style: { background: 'alt' }, data: { title: L('Fresh from the oven', 'Frisch aus dem Ofen'), items: [
            { name: L('Sourdough farmhouse loaf', 'Bauernbrot mit Sauerteig'), description: L('1 kg, long fermentation', '1 kg, lange Teigführung'), price: price(4.8), image: IMG('bakery-bread-01') },
            { name: L('Butter croissant', 'Buttercroissant'), description: L('Flaky and golden', 'Blättrig und goldbraun'), price: price(1.6), image: IMG('bakery-croissants-01') },
            { name: L('Cappuccino & berry cake', 'Cappuccino & Beerenkuchen'), description: L('Our afternoon favourite', 'Unser Nachmittagsliebling'), price: price(6.9), image: IMG('bakery-coffee-01') }] } },
          gallery: { variant: 'grid', data: { title: L('From our bakehouse', 'Aus unserer Backstube'), images: [
            { image: IMG('bakery-bread-01'), alt: L('Freshly baked loaves on a wooden table', 'Frisch gebackene Brote auf einem Holztisch') },
            { image: IMG('bakery-croissants-01'), alt: L('Croissants and pastries on a wooden board', 'Croissants und Plundergebäck auf einem Holzbrett') },
            { image: IMG('bakery-coffee-01'), alt: L('Cappuccino and a slice of berry cake', 'Cappuccino und ein Stück Beerenkuchen') }] } },
          text: { variant: 'plain', style: { align: 'center', spacing: 'roomy' }, data: { heading: L('Our craft', 'Unser Handwerk'),
            body: L('Our dough gets the time it needs. We bake with good flour, natural sourdough and simple ingredients – and you can taste it.',
              'Unser Teig bekommt die Zeit, die er braucht. Wir backen mit gutem Mehl, natürlichem Sauerteig und einfachen Zutaten – und das schmeckt man.') } },
          openingHours: { variant: 'compact', style: { background: 'alt' }, data: { title: L('Opening hours', 'Öffnungszeiten'),
            days: hours([['mon', ['06:30', '18:00']], ['tue', ['06:30', '18:00']], ['wed', ['06:30', '18:00']], ['thu', ['06:30', '18:00']], ['fri', ['06:30', '18:00']],
              ['sat', ['07:00', '13:00']], ['sun', ['08:00', '11:00']]]) } },
          contact: contact(L, 'kontakt', L('Visit us', 'Besuchen Sie uns')),
          socialMedia: social(L, ['instagram', 'facebook'], L('Follow us', 'Folgen Sie uns')),
        };
      },
    },
    {
      id: 'beauty', kind: 'business', demoName: 'Studio Belle',
      label: { en: 'Beauty & Salon', de: 'Beauty & Salon' },
      blurb: { en: 'Treatments, prices and online booking.', de: 'Behandlungen, Preise und Online-Buchung.' },
      fontPair: 'serif-display', radius: 'lg',
      palettes: [
        pal('blush', 'Blush', 'Rosé', ['#a33a5c', '#fbf2f4', '#241a1d', '#63565a', '#2a1f23']),
        pal('sage', 'Sage & stone', 'Salbei & Stein', ['#4b6b5b', '#f2f5f2', '#1b2420', '#555f5a', '#1e2622']),
        pal('champagne', 'Champagne', 'Champagner', ['#80602f', '#f8f4ee', '#221d17', '#5e564d', '#2a241d']),
        pal('plum', 'Plum', 'Pflaume', ['#6b3a7a', '#f6f1f8', '#1f1724', '#5a5060', '#241a2a']),
      ],
      images: ['beauty-salon-01', 'beauty-skincare-01', 'beauty-spa-01'],
      sections: ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia'],
      buttons: [
        ['book', 'Book online', 'Online buchen', 'Choose your time', 'Wunschtermin wählen', '/'],
        ['whatsapp', 'WhatsApp', 'WhatsApp', 'Quick questions', 'Kurze Fragen', '/'],
        ['call', 'Call us', 'Anrufen', 'We are happy to advise', 'Wir beraten Sie gern', '/'],
        ['directions', 'Directions', 'Route', 'Find the salon', 'So finden Sie uns', '/kontakt'],
      ],
      content: function (L, IMG, price) {
        return {
          hero: { variant: 'split', data: { eyebrow: L('Hair · Skin · Wellbeing', 'Haare · Haut · Wohlbefinden'),
            subheadline: L('Time for yourself: expert cuts, gentle facials and relaxing treatments in a calm atmosphere.', 'Zeit für sich: typgerechte Schnitte, sanfte Gesichtsbehandlungen und entspannende Anwendungen in ruhiger Atmosphäre.'),
            backgroundImage: IMG('beauty-salon-01'), imageAlt: L('A stylist blow-drying a client’s hair', 'Eine Friseurin föhnt einer Kundin die Haare'),
            primary: { text: L('Book an appointment', 'Termin buchen'), target: '/', icon: 'calendar' }, secondary: { text: L('Treatments', 'Behandlungen'), target: '/behandlungen' } } },
          products: { variant: 'list', anchor: 'behandlungen', style: { background: 'alt' }, data: { title: L('Our treatments', 'Unsere Behandlungen'), items: [
            { name: L('Cut & blow-dry', 'Schneiden & Föhnen'), description: L('Including consultation and care', 'Inklusive Beratung und Pflege'), price: L('from ', 'ab ') + price(45), image: IMG('beauty-salon-01') },
            { name: L('Facial', 'Gesichtsbehandlung'), description: L('Cleansing, mask and massage, 60 min', 'Reinigung, Maske und Massage, 60 Min.'), price: price(69), image: IMG('beauty-skincare-01') },
            { name: L('Relaxing massage', 'Entspannungsmassage'), description: L('Warm oils, 60 min', 'Warme Öle, 60 Min.'), price: price(75), image: IMG('beauty-spa-01') }] } },
          gallery: { variant: 'grid', data: { title: L('Our salon', 'Unser Salon'), images: [
            { image: IMG('beauty-salon-01'), alt: L('A stylist blow-drying a client’s hair', 'Eine Friseurin föhnt einer Kundin die Haare') },
            { image: IMG('beauty-skincare-01'), alt: L('A facial treatment', 'Eine Gesichtsbehandlung') },
            { image: IMG('beauty-spa-01'), alt: L('A relaxing back massage', 'Eine entspannende Rückenmassage') }] } },
          text: { variant: 'plain', style: { background: 'brand', align: 'center', spacing: 'roomy' }, data: { heading: L('Our philosophy', 'Unsere Philosophie'),
            body: L('We take time to listen and work with high-quality products that suit your hair and skin – so you leave relaxed and looking your best.',
              'Wir nehmen uns Zeit, hören zu und arbeiten mit hochwertigen Produkten, die zu Ihren Haaren und Ihrer Haut passen – damit Sie entspannt und strahlend nach Hause gehen.') } },
          openingHours: { variant: 'compact', data: { title: L('Opening hours', 'Öffnungszeiten'),
            days: hours([['mon'], ['tue', ['09:00', '19:00']], ['wed', ['09:00', '19:00']], ['thu', ['09:00', '20:00']], ['fri', ['09:00', '19:00']], ['sat', ['09:00', '15:00']], ['sun']]) } },
          contact: contact(L, 'kontakt', L('Visit us', 'Besuchen Sie uns'), 'alt'),
          socialMedia: social(L, ['instagram', 'tiktok', 'facebook'], L('Follow us', 'Folgen Sie uns')),
        };
      },
    },
    {
      id: 'retail', kind: 'business', demoName: 'Atelier Nord',
      label: { en: 'Retail & Boutique', de: 'Einzelhandel & Boutique' },
      blurb: { en: 'New arrivals, offers and your online shop.', de: 'Neuheiten, Angebote und Ihr Onlineshop.' },
      fontPair: 'modern', radius: 'sm',
      palettes: [
        pal('mono', 'Monochrome', 'Schwarz-Weiß', ['#111111', '#f4f4f4', '#111111', '#555555', '#111111']),
        pal('camel', 'Camel', 'Camel', ['#85582f', '#f7f1ea', '#1f1a16', '#5d544c', '#1f1a16']),
        pal('ocean', 'Ocean', 'Ozean', ['#1f5d88', '#eef4f8', '#13202a', '#4c5963', '#13202a']),
        pal('rose', 'Rose', 'Rosenholz', ['#a8385a', '#fbf1f4', '#22161a', '#5f5156', '#22161a']),
      ],
      images: ['fashion-boutique-01', 'fashion-rack-01', 'fashion-lifestyle-01'],
      sections: ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia'],
      buttons: [
        ['shop', 'Online shop', 'Onlineshop', 'Order from home', 'Bequem von zu Hause bestellen', '/'],
        ['offers', 'Current offers', 'Aktuelle Angebote', 'Sale and specials', 'Sale und Aktionen', '/'],
        ['whatsapp', 'Ask via WhatsApp', 'Per WhatsApp fragen', 'Sizes and availability', 'Größen und Verfügbarkeit', '/'],
        ['directions', 'Visit the store', 'Zum Laden', 'Directions', 'Route planen', '/kontakt'],
      ],
      content: function (L, IMG, price) {
        return {
          hero: { variant: 'overlay', data: { eyebrow: L('New season · New arrivals', 'Neue Saison · Neu eingetroffen'),
            subheadline: L('Carefully chosen fashion, accessories and gifts – discover our favourites in store or online.', 'Sorgfältig ausgewählte Mode, Accessoires und Geschenke – entdecken Sie unsere Lieblingsstücke im Laden oder online.'),
            backgroundImage: IMG('fashion-boutique-01'), imageAlt: L('A bright boutique with clothes and accessories', 'Eine helle Boutique mit Kleidung und Accessoires'), overlay: 45,
            primary: { text: L('Shop now', 'Jetzt shoppen'), target: '/', icon: 'cart' }, secondary: { text: L('New arrivals', 'Neuheiten'), target: '/neuheiten' } } },
          products: { variant: 'list', anchor: 'neuheiten', style: { background: 'alt' }, data: { title: L('New arrivals', 'Neu eingetroffen'), items: [
            { name: L('Linen summer collection', 'Leinen-Sommerkollektion'), description: L('Light pieces in natural tones', 'Leichte Teile in Naturtönen'), price: L('from ', 'ab ') + price(49), image: IMG('fashion-rack-01') },
            { name: L('Personal styling', 'Persönliche Stilberatung'), description: L('30 minutes with our team', '30 Minuten mit unserem Team'), price: price(25), image: IMG('fashion-lifestyle-01') },
            { name: L('Accessories & bags', 'Accessoires & Taschen'), description: L('The finishing touch', 'Der letzte Schliff'), price: L('from ', 'ab ') + price(19), image: IMG('fashion-boutique-01') }] } },
          gallery: { variant: 'grid', data: { title: L('Our store', 'Unser Laden'), images: [
            { image: IMG('fashion-boutique-01'), alt: L('A bright boutique with clothes and accessories', 'Eine helle Boutique mit Kleidung und Accessoires') },
            { image: IMG('fashion-rack-01'), alt: L('A clothes rail in natural tones', 'Eine Kleiderstange in Naturtönen') },
            { image: IMG('fashion-lifestyle-01'), alt: L('A shop assistant advising a customer', 'Eine Verkäuferin berät eine Kundin') }] } },
          text: { variant: 'plain', style: { align: 'center', spacing: 'roomy' }, data: { heading: L('Our store', 'Unser Laden'),
            body: L('We love beautiful things that last. Our team is happy to advise you – take your time to browse, try on and discover.',
              'Wir lieben schöne Dinge, die bleiben. Unser Team berät Sie gern – nehmen Sie sich Zeit zum Stöbern, Anprobieren und Entdecken.') } },
          openingHours: { variant: 'compact', data: { title: L('Opening hours', 'Öffnungszeiten'),
            days: hours([['mon', ['10:00', '19:00']], ['tue', ['10:00', '19:00']], ['wed', ['10:00', '19:00']], ['thu', ['10:00', '19:00']], ['fri', ['10:00', '19:00']], ['sat', ['10:00', '18:00']], ['sun']]) } },
          contact: contact(L, 'kontakt', L('Visit us', 'Besuchen Sie uns'), 'alt'),
          socialMedia: social(L, ['instagram', 'pinterest', 'facebook'], L('Follow us', 'Folgen Sie uns')),
        };
      },
    },
    {
      id: 'creator', kind: 'creator', demoName: 'Mila Sommer',
      label: { en: 'Creator & Influencer', de: 'Creator & Influencer' },
      blurb: { en: 'All your links, your shop and collaborations.', de: 'Alle Ihre Links, Ihr Shop und Kooperationen.' },
      fontPair: 'rounded', radius: 'lg',
      palettes: [
        pal('coral', 'Coral pop', 'Koralle', ['#c0245b', '#fdf0f4', '#1f1418', '#5e4c53', '#2a1a20']),
        pal('violet', 'Electric violet', 'Violett', ['#6d28d9', '#f4f0fd', '#1a1426', '#544d63', '#1e1730']),
        pal('teal', 'Teal wave', 'Petrol', ['#0f766e', '#effaf8', '#10211f', '#4a5c59', '#10211f']),
        pal('sunset', 'Sunset', 'Sonnenuntergang', ['#c0400c', '#fff4ec', '#24160d', '#634f42', '#2a170c']),
      ],
      images: ['QRAIVY-Creator-Hero'],
      sections: ['hero', 'socialMedia', 'buttons', 'products', 'text', 'contact'],
      buttons: [
        ['custom', 'Latest video', 'Neuestes Video', 'New every Friday', 'Jeden Freitag neu', '/'],
        ['shop', 'My shop', 'Mein Shop', 'Guides and presets', 'Guides und Presets', '/shop'],
        ['events', 'Live events', 'Live-Events', 'Workshops and meetups', 'Workshops und Treffen', '/'],
        ['email', 'Collaborations', 'Kooperationen', 'Brand and media enquiries', 'Anfragen von Marken und Medien', '/kooperationen'],
      ],
      content: function (L, IMG, price) {
        return {
          // split: the text on the page colour, the portrait whole below it (on a photo background the headline would cover her face);
          // compact: about half the space above the text (owner-approved T0 refinement)
          hero: { variant: 'split', style: { spacing: 'compact' }, data: { eyebrow: L('Food · Travel · Everyday life', 'Food · Reisen · Alltag'),
            subheadline: L('Easy recipes, travel tips and honest product reviews. New videos every week.', 'Einfache Rezepte, Reisetipps und ehrliche Produkttests. Jede Woche neue Videos.'),
            backgroundImage: IMG('QRAIVY-Creator-Hero'), imageAlt: L('A smiling content creator at her laptop in a studio with a ring light', 'Eine lächelnde Content-Creatorin am Laptop in ihrem Studio mit Ringlicht'),
            primary: { text: L('Latest video', 'Neuestes Video'), target: '/', icon: 'star' }, secondary: { text: L('Work with me', 'Zusammenarbeit'), target: '/kooperationen' } } },
          socialMedia: Object.assign(social(L, ['instagram', 'tiktok', 'youtube', 'pinterest'], ''), { style: { align: 'center', spacing: 'compact' } }),
          buttons: { variant: 'list', style: { spacing: 'compact' } },
          products: { variant: 'list', anchor: 'shop', style: { background: 'alt' }, data: { title: L('My shop', 'Mein Shop'), items: [
            { name: L('Recipe e-book', 'Rezept-E-Book'), description: L('40 quick weeknight recipes', '40 schnelle Feierabendrezepte'), price: price(14.9) },
            { name: L('Travel planner (PDF)', 'Reiseplaner (PDF)'), description: L('My checklists for relaxed trips', 'Meine Checklisten für entspanntes Reisen'), price: price(9.9) },
            { name: L('Online cooking class', 'Online-Kochkurs'), description: L('Live, 90 minutes, small group', 'Live, 90 Minuten, kleine Gruppe'), price: price(39) }] } },
          gallery: null,
          text: { variant: 'plain', style: { align: 'center', spacing: 'roomy' }, data: { heading: L('About me', 'Über mich'),
            body: L('Hi and welcome! I share the recipes, places and products I really love – simple, honest and made for everyday life.',
              'Hallo und willkommen! Ich teile Rezepte, Orte und Produkte, die ich wirklich liebe – einfach, ehrlich und alltagstauglich.') } },
          openingHours: null,
          contact: { variant: 'card', anchor: 'kooperationen', style: { background: 'alt' }, data: { title: L('Collaborations', 'Kooperationen'),
            email: L('hello@example.com', 'hallo@example.com'), showMapLink: false } },
        };
      },
    },
    {
      id: 'services', kind: 'business', demoName: 'Berger & Partner',
      label: { en: 'Professional Services', de: 'Dienstleistungen' },
      blurb: { en: 'Services, appointments and how to reach you.', de: 'Leistungen, Termine und Kontakt.' },
      fontPair: 'modern', radius: 'md',
      palettes: [
        pal('navy', 'Navy trust', 'Marineblau', ['#1e3a8a', '#f3f5fa', '#0f172a', '#475569', '#0f172a']),
        pal('forest', 'Forest', 'Waldgrün', ['#166534', '#f1f6f2', '#13221a', '#4b5a50', '#13221a']),
        pal('amber', 'Slate & amber', 'Schiefer & Bernstein', ['#8f3f0c', '#f7f5f1', '#1c1917', '#57534e', '#1c1917']),
        pal('graphite', 'Graphite', 'Graphit', ['#334155', '#f4f5f7', '#111827', '#4b5563', '#111827']),
      ],
      images: ['QRAIVY-Professional-Services-Hero'],
      sections: ['hero', 'buttons', 'products', 'text', 'openingHours', 'contact', 'socialMedia'],
      buttons: [
        ['book', 'Book an appointment', 'Termin vereinbaren', 'Online or by phone', 'Online oder telefonisch', '/'],
        ['call', 'Call us', 'Anrufen', 'During office hours', 'Zu unseren Bürozeiten', '/'],
        ['email', 'Send an email', 'E-Mail schreiben', 'For documents and questions', 'Für Unterlagen und Fragen', '/'],
        ['directions', 'Directions', 'Anfahrt', 'Find our office', 'So finden Sie uns', '/kontakt'],
      ],
      content: function (L, IMG, price) {
        return {
          // split and compact, as for Creator: the headline stays off his face, the portrait is shown whole
          hero: { variant: 'split', style: { spacing: 'compact' }, data: { eyebrow: L('Tax · Accounting · Consulting', 'Steuern · Buchhaltung · Beratung'),
            subheadline: L('Clear, personal advice for self-employed people, families and small businesses – reliable and on time.', 'Klare, persönliche Beratung für Selbstständige, Familien und kleine Unternehmen – zuverlässig und termingerecht.'),
            backgroundImage: IMG('QRAIVY-Professional-Services-Hero'), imageAlt: L('A smiling advisor in a navy suit at his desk in a modern office', 'Ein lächelnder Berater im dunkelblauen Anzug an seinem Schreibtisch in einem modernen Büro'),
            primary: { text: L('Book a consultation', 'Beratungstermin buchen'), target: '/', icon: 'calendar' }, secondary: { text: L('Our services', 'Unsere Leistungen'), target: '/leistungen' } } },
          products: { variant: 'list', anchor: 'leistungen', data: { title: L('Our services', 'Unsere Leistungen'), items: [
            { name: L('Tax returns', 'Steuererklärungen'), description: L('For employees, self-employed people and families', 'Für Angestellte, Selbstständige und Familien') },
            { name: L('Bookkeeping & payroll', 'Buchhaltung & Lohn'), description: L('Monthly, digital and on time', 'Monatlich, digital und pünktlich') },
            { name: L('Business start-up advice', 'Gründungsberatung'), description: L('From the business plan to the first tax return', 'Vom Businessplan bis zur ersten Steuererklärung') }] } },
          gallery: null,
          text: { variant: 'plain', style: { background: 'dark', spacing: 'roomy' }, data: { heading: L('Why clients choose us', 'Warum Mandanten uns wählen'),
            body: L('We explain things clearly, answer quickly and think ahead – so you can focus on your work. Personal contact matters to us.',
              'Wir erklären verständlich, antworten schnell und denken mit – damit Sie sich auf Ihre Arbeit konzentrieren können. Persönlicher Kontakt ist uns wichtig.') } },
          openingHours: { variant: 'compact', style: { background: 'alt' }, data: { title: L('Office hours', 'Bürozeiten'),
            days: hours([['mon', ['08:30', '17:00']], ['tue', ['08:30', '17:00']], ['wed', ['08:30', '17:00']], ['thu', ['08:30', '17:00']], ['fri', ['08:30', '14:00']], ['sat'], ['sun']]),
            note: L('Appointments outside these hours on request.', 'Termine außerhalb dieser Zeiten nach Vereinbarung.') } },
          contact: contact(L, 'kontakt', L('Contact', 'Kontakt')),
          socialMedia: social(L, ['linkedin', 'instagram'], L('Follow us', 'Folgen Sie uns')),
        };
      },
    },
  ];
  var BY_ID = {};
  TEMPLATES.forEach(function (t) { BY_ID[t.id] = t; });

  // The example address: a German placeholder ("Musterstraße") and a reserved example.com address; no phone number
  function contact(L, anchor, title, background) {
    var c = { variant: 'card', anchor: anchor, data: { title: title, address: { line1: L('Sample Street 1', 'Musterstraße 1'), postalCode: '12345', city: L('Sample Town', 'Musterstadt') },
      email: L('hello@example.com', 'hallo@example.com'), showMapLink: false } };
    if (background) c.style = { background: background };
    return c;
  }
  // Example profiles are the platforms' home pages, never an account
  var PLATFORM_HOME = { instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/', tiktok: 'https://www.tiktok.com/', youtube: 'https://www.youtube.com/',
    linkedin: 'https://www.linkedin.com/', pinterest: 'https://www.pinterest.com/', x: 'https://x.com/' };
  function social(L, platforms, title) {
    return { variant: 'icons', data: { title: title, links: platforms.map(function (p) { return { platform: p, url: PLATFORM_HOME[p] }; }) } };
  }

  // ── what is example-only ──
  // The parts starter() removes: fictional facts and every example link.
  var DEMO_ONLY = {
    hero: ['primary', 'secondary'],
    buttons: ['items'],
    products: ['items'],
    openingHours: ['days', 'note'],
    contact: ['address', 'phone', 'email', 'mapsUrl'],
    socialMedia: ['links'],
    gallery: [],
    text: [],
  };
  // The neutral texts and photos starter() keeps (listed for a later "sample" mark)
  var SAMPLE = {
    hero: ['eyebrow', 'headline', 'subheadline', 'backgroundImage', 'imageAlt'],
    gallery: ['title', 'images'],
    text: ['heading', 'body'],
    buttons: ['title', 'subtitle'], products: ['title'], openingHours: ['title'], contact: ['title'], socialMedia: ['title'],
  };

  function lang(l) { return l === 'de' ? 'de' : 'en'; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function price(l) {
    return function (n) { var s = n.toFixed(2); return l === 'de' ? s.replace('.', ',') + ' €' : '€' + s; };
  }

  function get(id) { return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null; }
  function paletteOf(t, id) { return t.palettes.filter(function (p) { return p.id === id; })[0] || t.palettes[0]; }

  // list(lang) -> the cards of "Choose Your Design": [{ id, kind, label, blurb, palettes: [{ id, label, colors }], sections, buttons, images }]
  function list(language) {
    var l = lang(language);
    return TEMPLATES.map(function (t) {
      return { id: t.id, kind: t.kind, label: t.label[l], blurb: t.blurb[l], fontPair: t.fontPair, radius: t.radius,
        palettes: t.palettes.map(function (p) { return { id: p.id, label: p.label[l], colors: clone(p.colors) }; }),
        sections: t.sections.slice(), buttons: t.buttons.map(function (b) { return b[0]; }), images: t.images.slice() };
    });
  }

  // The example content of one section type, as a section ({ id, type, variant, data, ... }), or null
  function exampleSection(t, type, l, IMG) {
    var L = function (en, de) { return l === 'de' ? de : en; };
    var all = t.content(L, IMG, price(l));
    var c = all[type];
    if (type === 'buttons') {
      c = c || {};
      var items = t.buttons.map(function (b) {
        var p = PRESET[b[0]];
        return { label: L(b[1], b[2]), subtitle: L(b[3], b[4]), kind: 'link', target: b[5], icon: p.icon };
      });
      c = { variant: c.variant || 'list', style: c.style, data: { items: items } };
    }
    if (!c) return null;
    var s = { id: SECTION_IDS[type], type: type, variant: c.variant };
    if (c.anchor) s.anchor = c.anchor;
    if (c.style) s.style = clone(c.style);
    s.data = clone(c.data);
    return s;
  }

  // The section types this template has example content for
  function available(id) {
    var t = get(id);
    if (!t) return [];
    var probe = t.content(function (en) { return en; }, function () { return ''; }, price('en'));
    return SECTION_TYPES.filter(function (type) { return type === 'buttons' || !!probe[type]; });
  }

  // compose(V3, id, opts) -> the design (not yet checked) and the paths of its example parts.
  // opts: { lang, palette, imageUrl(starterId) -> address (default: imageUrl() here), name, description, sections: [types] }
  // name / description: the customer's own (Step 2); they replace the example headline / sub-headline.
  function compose(V3, id, opts) {
    var o = opts || {};
    var t = get(id);
    if (!t) return null;
    var l = lang(o.lang);
    var IMG = function (sid) { return typeof o.imageUrl === 'function' ? o.imageUrl(sid) : imageUrl(sid); };
    var types = (Array.isArray(o.sections) ? o.sections : t.sections).filter(function (type, i, a) { return SECTION_TYPES.indexOf(type) !== -1 && a.indexOf(type) === i; });
    types = ['hero'].concat(types.filter(function (x) { return x !== 'hero'; }));
    var name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : t.demoName;
    var demoOnly = [], sample = [];
    var sections = [];
    types.forEach(function (type) {
      var s = exampleSection(t, type, l, IMG);
      if (!s) return;
      var i = sections.length;
      if (type === 'hero') {
        s.data.headline = name;
        if (typeof o.description === 'string' && o.description.trim()) s.data.subheadline = o.description.trim();
      }
      (DEMO_ONLY[type] || []).forEach(function (k) { if (s.data[k] !== undefined) demoOnly.push('pages[0].sections[' + i + '].data.' + k); });
      (SAMPLE[type] || []).forEach(function (k) {
        if (s.data[k] === undefined || s.data[k] === '') return;
        if (type === 'hero' && ((k === 'headline' && name !== t.demoName) || (k === 'subheadline' && o.description && String(o.description).trim()))) return;   // the customer's own
        sample.push('pages[0].sections[' + i + '].data.' + k);
      });
      sections.push(s);
    });
    // an example link to a section that is not on the page leads to the page top instead
    var anchors = sections.map(function (s) { return s.anchor; }).filter(Boolean);
    function inPage(target) { return target === '/' || anchors.indexOf(String(target).slice(1)) !== -1 ? target : '/'; }
    sections.forEach(function (s) {
      if (s.type === 'hero') ['primary', 'secondary'].forEach(function (k) { if (s.data[k] && s.data[k].target) s.data[k].target = inPage(s.data[k].target); });
      if (s.type === 'buttons') s.data.items.forEach(function (it) { it.target = inPage(it.target); });
    });
    var palette = paletteOf(t, o.palette);
    var design = { schemaVersion: V3.SCHEMA_VERSION, theme: { palette: clone(palette.colors), fontPair: t.fontPair, radius: t.radius },
      settings: { language: l }, header: { showBusinessName: true }, pages: [{ id: 'start', title: l === 'de' ? 'Start' : 'Home', sections: sections }] };
    return { design: design, demoOnly: demoOnly, samplePaths: sample, palette: palette.id };
  }

  // sample(V3, id, opts) -> { ok, design, errors, demoOnly, samplePaths, palette }: the full example page
  // for the preview (core.validateDesign's normalized copy when valid)
  function sample(V3, id, opts) {
    var c = compose(V3, id, opts);
    if (!c) return { ok: false, design: null, errors: [{ path: '$', code: 'unknown_template' }], demoOnly: [], samplePaths: [], palette: null };
    var v = V3.validateDesign(c.design, opts && opts.cloudName ? { cloudName: opts.cloudName } : undefined);
    return { ok: v.ok, design: v.design, errors: v.errors, demoOnly: c.demoOnly, samplePaths: c.samplePaths, palette: c.palette };
  }

  // stripDemo(design) -> a copy without the example-only parts (DEMO_ONLY): no example link,
  // price, product, opening hours, address, email or social profile. Contact keeps no map link.
  function stripDemo(design) {
    var d = clone(design);
    ((d.pages && d.pages[0] && d.pages[0].sections) || []).forEach(function (s) {
      (DEMO_ONLY[s.type] || []).forEach(function (k) {
        if (!s.data || s.data[k] === undefined) return;
        if (Array.isArray(s.data[k])) s.data[k] = [];
        else delete s.data[k];
      });
      if (s.type === 'contact' && s.data) s.data.showMapLink = false;
    });
    return d;
  }

  // starter(V3, id, opts) -> { ok, design, errors, samplePaths }: the page a save may store: the
  // template's layout, theme, neutral texts and photos, the customer's name and description, and no
  // example-only part (sections left empty stay hidden on the public page until filled in)
  function starter(V3, id, opts) {
    var c = compose(V3, id, opts);
    if (!c) return { ok: false, design: null, errors: [{ path: '$', code: 'unknown_template' }], samplePaths: [] };
    var v = V3.validateDesign(stripDemo(c.design), opts && opts.cloudName ? { cloudName: opts.cloudName } : undefined);
    return { ok: v.ok, design: v.design, errors: v.errors, samplePaths: c.samplePaths };
  }

  return { SECTION_TYPES: SECTION_TYPES.slice(), SECTION_IDS: SECTION_IDS, BUTTON_PRESETS: BUTTON_PRESETS, DEMO_ONLY: DEMO_ONLY, SAMPLE: SAMPLE,
    PLATFORM_HOME: PLATFORM_HOME, TEMPLATE_IDS: TEMPLATES.map(function (t) { return t.id; }), STUDIO_IMAGES: STUDIO_IMAGES, AI_LABEL: AI_LABEL, imageUrl: imageUrl,
    get: get, list: list, available: available, compose: compose, sample: sample, starter: starter, stripDemo: stripDemo };
});
