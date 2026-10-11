/**
 * QRAIVY standard welcome greetings — editor copy.
 * =====================================================
 * The same eight industries, two languages and wording rules as
 * backend/src/data/voiceGreetings.js, which is what is actually spoken.
 * The editor needs them to show an owner the greeting their page will
 * use before they change it. The frontend is deployed separately from
 * the backend and cannot read that file; backend/tests/
 * lpVoiceGreetings.test.js fails if the two ever differ.
 *
 * Do not edit one without the other.
 */
(function () {
  'use strict';

  var GREETINGS = {
    restaurant: {
      en: 'Welcome to {name}! We\'re glad you\'re here. Take a look around and get to know us. We look forward to your visit.',
      de: 'Willkommen bei {name}! Schön, dass Sie da sind. Sehen Sie sich in Ruhe um und lernen Sie uns kennen. Wir freuen uns auf Ihren Besuch.'
    },
    creator: {
      en: 'Hi, this is {name}! Thanks for stopping by. I\'ve put together a few things I\'d love to share with you. Enjoy exploring!',
      de: 'Hallo, hier ist {name}! Schön, dass Sie vorbeischauen. Hier habe ich einiges zusammengestellt, das ich gern mit Ihnen teilen möchte. Viel Spaß beim Entdecken!'
    },
    artist: {
      en: 'Welcome to {name}! Thanks for stopping by. Discover what\'s new and explore more right here.',
      de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Entdecken Sie hier Neues und erfahren Sie mehr.'
    },
    event: {
      en: 'Welcome to {name}! We\'re glad you\'re here. Explore this page for information about the event.',
      de: 'Willkommen bei {name}! Schön, dass Sie da sind. Hier finden Sie Informationen rund um die Veranstaltung.'
    },
    ecommerce: {
      en: 'Welcome to {name}! Thanks for visiting. Take a look around and discover what we have to offer.',
      de: 'Willkommen bei {name}! Vielen Dank für Ihren Besuch. Stöbern Sie in Ruhe und entdecken Sie unser Angebot.'
    },
    local_business: {
      en: 'Welcome to {name}! Thanks for stopping by. Discover more about us and what we do.',
      de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Erfahren Sie mehr über uns und unsere Arbeit.'
    },
    fitness: {
      en: 'Welcome to {name}! Great to have you here. Discover what we offer. We look forward to seeing you!',
      de: 'Willkommen bei {name}! Schön, dass Sie da sind. Entdecken Sie unser Angebot. Wir freuen uns auf Sie!'
    },
    other: {
      en: 'Welcome to {name}! Thanks for stopping by. Take a look around and discover more.',
      de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Sehen Sie sich in Ruhe um und entdecken Sie mehr.'
    }
  };

  var INDUSTRIES = ['restaurant', 'creator', 'artist', 'event', 'ecommerce', 'local_business', 'fitness', 'other'];
  var ALIASES = { restaurant: 'restaurant', creator: 'creator', influencer: 'creator', artist: 'artist', artist_music: 'artist', music: 'artist', event: 'event', events: 'event', ecommerce: 'ecommerce', shop: 'ecommerce', local_business: 'local_business', local: 'local_business', leadgen: 'local_business', fitness: 'fitness', gym: 'fitness', other: 'other', portfolio: 'other', 'ai-support': 'other', realestate: 'other' };
  var MAX_LENGTH = 400;

  function voiceLanguage(lang) { return lang === 'de' ? 'de' : 'en'; }

  function industryKey(useCase) {
    var key = String(useCase == null ? '' : useCase).trim().toLowerCase().replace(/\s+/g, '_');
    return ALIASES[key] || 'other';
  }

  function spokenBusinessName(name) {
    return String(name == null ? '' : name)
      .replace(/^Welcome to /i, '').replace(/^Welcome /i, '')
      .replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
      .replace(/^www\./i, '').replace(/\.(de|com|net|org|io)$/i, '')
      .replace(/\s+/g, ' ').trim();
  }

  function defaultGreeting(useCase, lang, businessName) {
    var template = GREETINGS[industryKey(useCase)][voiceLanguage(lang)];
    var name = spokenBusinessName(businessName);
    if (!name) {
      return template
        .replace(/^(Welcome to|Willkommen bei) \{name\}!/, function (m, lead) { return lead === 'Welcome to' ? 'Welcome!' : 'Willkommen!'; })
        .replace(/^Hi, this is \{name\}!/, 'Hi!')
        .replace(/^Hallo, hier ist \{name\}!/, 'Hallo!');
    }
    return template.split('{name}').join(name);
  }

  // A greeting as it will be spoken: single spaces, trimmed, never longer
  // than the limit (same rule as cleanGreeting in lpVoiceService.js).
  function cleanGreeting(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH).trim();
  }

  window.QRAIVY_VOICE_GREETINGS = {
    GREETINGS: GREETINGS,
    INDUSTRIES: INDUSTRIES,
    ALIASES: ALIASES,
    MAX_LENGTH: MAX_LENGTH,
    voiceLanguage: voiceLanguage,
    industryKey: industryKey,
    spokenBusinessName: spokenBusinessName,
    defaultGreeting: defaultGreeting,
    cleanGreeting: cleanGreeting
  };
})();
