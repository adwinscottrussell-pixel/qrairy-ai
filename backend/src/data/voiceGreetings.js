/**
 * voiceGreetings.js — the standard welcome greetings.
 * ─────────────────────────────────────────────────────────────
 * One spoken welcome per industry, in English and German. These are
 * the DEFAULTS: an owner can replace the greeting for either language
 * in the editor's Voice tab (sections.voice.customGreeting), and that
 * text is then spoken instead.
 *
 * The eight industries are the eight onboarding categories
 * (frontend/public/js/smart-qr-categories.js). A page's useCase is
 * mapped onto them by industryKey() with the same aliases the live
 * renderer uses for its action cards.
 *
 * Wording rules, so no greeting promises something a page may not have:
 *   - {name} is the business name; nothing else is filled in.
 *   - No prices, promotions, opening hours or named features.
 *   - No mention of the AI assistant: it may be switched off.
 *   - Creator speaks as "I"; the others are neutral or "we".
 *   - German uses the formal "Sie"; an owner who prefers "du" writes
 *     their own greeting.
 * The wording was approved by the founder on 2026-10-11.
 *
 * Mirrored for the editor in frontend/public/js/voice-greetings.js (the
 * frontend is deployed separately and cannot read this file);
 * tests/lpVoiceGreetings.test.js fails if the two ever differ.
 * ─────────────────────────────────────────────────────────────
 */

const VOICE_LANGUAGES = ['en', 'de'];

const VOICE_INDUSTRIES = ['restaurant', 'creator', 'artist', 'event', 'ecommerce', 'local_business', 'fitness', 'other'];

// LandingPage.useCase as saved by onboarding and older pages -> industry.
const INDUSTRY_ALIASES = {
  restaurant: 'restaurant',
  creator: 'creator', influencer: 'creator',
  artist: 'artist', artist_music: 'artist', music: 'artist',
  event: 'event', events: 'event',
  ecommerce: 'ecommerce', shop: 'ecommerce',
  local_business: 'local_business', local: 'local_business', leadgen: 'local_business',
  fitness: 'fitness', gym: 'fitness',
  other: 'other', portfolio: 'other', 'ai-support': 'other', realestate: 'other',
};

const VOICE_GREETINGS = {
  restaurant: {
    en: 'Welcome to {name}! We\'re glad you\'re here. Take a look around and get to know us. We look forward to your visit.',
    de: 'Willkommen bei {name}! Schön, dass Sie da sind. Sehen Sie sich in Ruhe um und lernen Sie uns kennen. Wir freuen uns auf Ihren Besuch.',
  },
  creator: {
    en: 'Hi, this is {name}! Thanks for stopping by. I\'ve put together a few things I\'d love to share with you. Enjoy exploring!',
    de: 'Hallo, hier ist {name}! Schön, dass Sie vorbeischauen. Hier habe ich einiges zusammengestellt, das ich gern mit Ihnen teilen möchte. Viel Spaß beim Entdecken!',
  },
  artist: {
    en: 'Welcome to {name}! Thanks for stopping by. Discover what\'s new and explore more right here.',
    de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Entdecken Sie hier Neues und erfahren Sie mehr.',
  },
  event: {
    en: 'Welcome to {name}! We\'re glad you\'re here. Explore this page for information about the event.',
    de: 'Willkommen bei {name}! Schön, dass Sie da sind. Hier finden Sie Informationen rund um die Veranstaltung.',
  },
  ecommerce: {
    en: 'Welcome to {name}! Thanks for visiting. Take a look around and discover what we have to offer.',
    de: 'Willkommen bei {name}! Vielen Dank für Ihren Besuch. Stöbern Sie in Ruhe und entdecken Sie unser Angebot.',
  },
  local_business: {
    en: 'Welcome to {name}! Thanks for stopping by. Discover more about us and what we do.',
    de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Erfahren Sie mehr über uns und unsere Arbeit.',
  },
  fitness: {
    en: 'Welcome to {name}! Great to have you here. Discover what we offer. We look forward to seeing you!',
    de: 'Willkommen bei {name}! Schön, dass Sie da sind. Entdecken Sie unser Angebot. Wir freuen uns auf Sie!',
  },
  other: {
    en: 'Welcome to {name}! Thanks for stopping by. Take a look around and discover more.',
    de: 'Willkommen bei {name}! Schön, dass Sie vorbeischauen. Sehen Sie sich in Ruhe um und entdecken Sie mehr.',
  },
};

// Longest greeting that is ever spoken, standard or custom. Keeps a single
// generation small and predictable in cost.
const GREETING_MAX_LENGTH = 400;

function voiceLanguage(lang) {
  return lang === 'de' ? 'de' : 'en';
}

function industryKey(useCase) {
  const key = String(useCase == null ? '' : useCase).trim().toLowerCase().replace(/\s+/g, '_');
  return INDUSTRY_ALIASES[key] || 'other';
}

// The name as it should be spoken: without a leading "Welcome to" (the
// greeting already says it) and without web-address parts, for pages whose
// business name is still the address they were created from.
function spokenBusinessName(name) {
  const cleaned = String(name == null ? '' : name)
    .replace(/^Welcome to /i, '').replace(/^Welcome /i, '')
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    .replace(/^www\./i, '').replace(/\.(de|com|net|org|io)$/i, '')
    .replace(/\s+/g, ' ').trim();
  return cleaned;
}

function defaultGreeting(useCase, lang, businessName) {
  const template = VOICE_GREETINGS[industryKey(useCase)][voiceLanguage(lang)];
  const name = spokenBusinessName(businessName);
  // A page without a usable name still gets a natural sentence.
  if (!name) return template.replace(/^(Welcome to|Willkommen bei) \{name\}!/, (m, lead) => (lead === 'Welcome to' ? 'Welcome!' : 'Willkommen!')).replace(/^Hi, this is \{name\}!/, 'Hi!').replace(/^Hallo, hier ist \{name\}!/, 'Hallo!');
  return template.split('{name}').join(name);
}

module.exports = {
  VOICE_LANGUAGES,
  VOICE_INDUSTRIES,
  INDUSTRY_ALIASES,
  VOICE_GREETINGS,
  GREETING_MAX_LENGTH,
  voiceLanguage,
  industryKey,
  spokenBusinessName,
  defaultGreeting,
};
