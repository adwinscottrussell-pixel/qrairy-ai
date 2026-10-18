// QRAIVY Academy — tutorial catalog (frontend only; no database, no video service).
//
// One entry per tutorial. The `id` is stable: it is the anchor of the
// tutorial (academy.html#<id>) and will be the key the produced videos are
// filed under, so never rename an id; retire it and add a new one instead.
//
//   id          stable slug
//   category    one of CATEGORIES[].id
//   title       { de, en }
//   description { de, en }
//   languages   languages the video is (or will be) produced in
//   video       { de, en }: the video file URL per language, null until produced
//   thumbnail   { de, en }: the poster image URL per language, null until produced
//   duration    length in seconds, null until produced
//   status      'coming_soon' | 'published'. A tutorial is only played when it is
//               'published' AND has a video URL for the viewer's language.
//   featured    shown in the large player at the top (the first featured entry)
//
// Videos will be produced later (presenter: AI-generated, female, about 30–40).
// Nothing here links to a video service yet.
(function () {
  var CATEGORIES = [
    { id: 'getting-started', title: { de: 'Erste Schritte', en: 'Getting started' } },
    { id: 'smart-landing-pages', title: { de: 'Smart Landing Pages', en: 'Smart Landing Pages' } },
    { id: 'deals', title: { de: 'Angebote', en: 'Deals' } },
    { id: 'notifications', title: { de: 'Benachrichtigungen', en: 'Notifications' } },
    { id: 'wallet', title: { de: 'Apple & Google Wallet', en: 'Apple & Google Wallet' } },
    { id: 'customers', title: { de: 'Kunden', en: 'Customers' } }
  ];

  function tutorial(id, category, title, description, featured) {
    return {
      id: id, category: category, title: title, description: description,
      languages: ['de', 'en'],
      video: { de: null, en: null },
      thumbnail: { de: null, en: null },
      duration: null,
      status: 'coming_soon',
      featured: !!featured
    };
  }

  var TUTORIALS = [
    tutorial('welcome-to-qraivy', 'getting-started',
      { de: 'Willkommen bei QRAIVY', en: 'Welcome to QRAIVY' },
      { de: 'Ein kurzer Rundgang: Was QRAIVY für deinen Betrieb tut und wo du alles findest.',
        en: 'A short tour: what QRAIVY does for your business and where to find everything.' }, true),
    tutorial('create-smart-landing-page', 'smart-landing-pages',
      { de: 'Deine Smart Landing Page erstellen', en: 'Create your Smart Landing Page' },
      { de: 'Von der ersten Idee bis zur veröffentlichten Seite mit QR-Code.',
        en: 'From the first idea to a published page with its QR code.' }),
    tutorial('create-and-publish-deals', 'deals',
      { de: 'Angebote erstellen und veröffentlichen', en: 'Create and publish deals' },
      { de: 'Ein Angebot anlegen, mit Bild versehen und auf deinen Seiten zeigen.',
        en: 'Set up an offer, add a picture and show it on your pages.' }),
    tutorial('send-push-notifications', 'notifications',
      { de: 'Push-Nachrichten versenden', en: 'Send push notifications' },
      { de: 'So erreichst du Kunden, die Benachrichtigungen für deinen Betrieb eingeschaltet haben.',
        en: 'How to reach customers who turned on notifications for your business.' }),
    tutorial('set-up-apple-google-wallet', 'wallet',
      { de: 'Apple & Google Wallet einrichten', en: 'Set up Apple & Google Wallet' },
      { de: 'Deine Stempelkarte als Wallet-Pass: einrichten, gestalten und testen.',
        en: 'Your stamp card as a Wallet pass: set it up, design it and test it.' }),
    tutorial('understand-your-customers', 'customers',
      { de: 'Deine Kunden verstehen', en: 'Understand your customers' },
      { de: 'Was die Kundenübersicht zeigt und wie du sie für deinen Betrieb nutzt.',
        en: 'What the customer overview shows and how to use it for your business.' })
  ];

  window.QRAIVY_ACADEMY = { categories: CATEGORIES, tutorials: TUTORIALS };
})();
