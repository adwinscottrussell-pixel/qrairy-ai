/**
 * lpV3/importLegacy.js — a V3 DRAFT from an existing (legacy) landing page.
 *
 * Pure and read-only: takes the LandingPage row as loaded, returns
 * { ok, draft, warnings } and writes nothing. The legacy page keeps being
 * served by renderPremiumLP until its owner publishes a V3 version.
 * Anything V3 cannot carry over safely is left out with a warning (for
 * example a logo stored as a data: image, which has to be uploaded again).
 * Pages without an owner (StadtPocket / platform pages) are not eligible.
 */
'use strict';
const V3 = require('./core');

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseSections(page) {
  try { return page && page.sections ? (typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections) || {} : {}; }
  catch (_) { return null; }
}
// Shortens owner text to a field's limit (whole characters), noting it.
function fit(value, max, field, warnings) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  warnings.push({ code: 'shortened', field, max });
  return chars.slice(0, max).join('').trim();
}
// The legacy renderer prefixes "https://" to links without a scheme.
function legacyUrl(u) {
  const s = typeof u === 'string' ? u.trim() : '';
  if (!s) return '';
  return /^https?:/i.test(s) ? s : 'https://' + s;
}
function validLink(target) {
  const probe = V3.validateDesign({ schemaVersion: 1, pages: [{ id: 'start', sections: [] }], footer: { links: [{ label: 'x', target }] } });
  return probe.ok;
}
function validImage(url) {
  return V3.validateDesign({ schemaVersion: 1, header: { logo: url }, pages: [{ id: 'start', sections: [] }] }).ok;
}

function importLegacyPage(page, opts = {}) {
  if (!page || typeof page !== 'object') return { ok: false, reason: 'no_page', warnings: [] };
  if (!page.userId) return { ok: false, reason: 'not_eligible_ownerless', warnings: [] };
  const warnings = [];
  const s = parseSections(page);
  if (s === null) warnings.push({ code: 'sections_unreadable' });
  const sec = s || {};
  const language = sec.language === 'de' ? 'de' : 'en';
  const businessName = typeof page.businessName === 'string' ? page.businessName : '';

  const palette = {};
  if (HEX.test(String(page.brandColor || '').trim())) palette.brand = page.brandColor.trim().toLowerCase();
  else if (page.brandColor) warnings.push({ code: 'brand_color_not_hex' });

  let logo = (sec.logo && sec.logo.url) || page.logoUrl || '';
  if (logo && !validImage(logo)) { warnings.push({ code: /^data:/i.test(logo) ? 'logo_data_uri_reupload' : 'logo_not_cloudinary_reupload' }); logo = ''; }

  const hero = sec.hero || {};
  const sections = [];
  const legacyButtons = (Array.isArray(sec.buttons) ? sec.buttons : []).filter((b) => b && b.active !== false);
  const primary = legacyButtons.find((b) => b.style !== 'secondary');
  const heroData = {
    eyebrow: fit(hero.badge, 60, 'hero.badge', warnings),
    headline: fit(hero.title, 120, 'hero.title', warnings) || fit(businessName, 120, 'businessName', warnings) || 'Welcome',
    subheadline: fit(hero.subtitle, 300, 'hero.subtitle', warnings),
  };
  if (primary && validLink(legacyUrl(primary.url))) heroData.primary = { text: fit(primary.label, 40, 'buttons.label', warnings) || 'Open', target: legacyUrl(primary.url) };
  else if (primary) warnings.push({ code: 'button_link_dropped' });
  sections.push({ id: 's_hero', type: 'hero', variant: 'simple', data: heroData });

  const items = [];
  for (const b of legacyButtons) {
    if (b === primary) continue;
    const target = legacyUrl(b.url);
    if (!validLink(target)) { warnings.push({ code: 'button_link_dropped' }); continue; }
    items.push({ label: fit(b.label, 40, 'buttons.label', warnings) || 'Link', kind: 'link', target });
  }
  if (items.length) sections.push({ id: 's_buttons', type: 'buttons', variant: 'buttons', data: { items: items.slice(0, 12) } });

  const cards = [];
  let droppedIcons = false;
  for (const l of (Array.isArray(sec.actionLinks) ? sec.actionLinks : [])) {
    if (!l || typeof l !== 'object') continue;
    const target = legacyUrl(l.url);
    if (!validLink(target)) { warnings.push({ code: 'action_link_dropped' }); continue; }
    if (l.icon) droppedIcons = true;
    cards.push({ label: fit(l.label, 40, 'actionLinks.label', warnings) || 'Link', subtitle: fit(l.description, 80, 'actionLinks.description', warnings), kind: 'link', target });
  }
  if (droppedIcons) warnings.push({ code: 'emoji_icons_replaced' });
  if (cards.length) sections.push({ id: 's_cards', type: 'buttons', variant: 'cards', data: { items: cards.slice(0, 12) } });

  const website = legacyUrl(page.websiteUrl);
  if (website && validLink(website) && /^https:/i.test(website)) {
    sections.push({ id: 's_website', type: 'buttons', variant: 'list', data: { items: [{ label: language === 'de' ? 'Website' : 'Website', kind: 'website', target: website }] } });
  }

  const voice = sec.voice || {};
  if (voice.audioUrl || voice.enabled) warnings.push({ code: 'voice_welcome_later_phase' });
  if (sec.ai && sec.ai.active !== false) warnings.push({ code: 'ai_assistant_not_in_v3' });

  const draft = {
    schemaVersion: V3.SCHEMA_VERSION,
    theme: { palette, fontPair: 'modern', radius: 'md' },
    settings: { language, seo: { title: fit(businessName, 70, 'businessName', warnings), description: '' } },
    header: { logo, logoAlt: fit(businessName, 80, 'businessName', warnings), showBusinessName: true, nav: [] },
    footer: { text: '', links: [] },
    pages: [{ id: 'start', title: 'Start', sections }],
  };
  const checked = V3.validateDesign(draft, opts);
  if (!checked.ok) return { ok: false, reason: 'draft_invalid', errors: checked.errors, warnings };
  return { ok: true, draft: checked.design, warnings };
}

module.exports = { importLegacyPage };
