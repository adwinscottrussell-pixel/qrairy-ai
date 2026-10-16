// ============================================================
// dealCards.js — QRAIVY Deals on Smart Landing Pages (customer side).
//
// injectActiveDeals(html, page) adds a small "current offers" section to
// a rendered landing page, just before its footer, when the page has
// active deals (dealService.activeDealsForPage). Otherwise -- and always
// when DEALS_ON_LANDING_PAGES is not "1" -- the page is returned exactly
// as it was, without any database query. Errors never break the page.
//
// Caching: the active-deal list of a page is kept for DEAL_CARDS_CACHE_MS
// (30 s) and dropped at once when its deals or placements are published,
// archived or deleted (dealService). Deals that end are hidden on every
// request even from the cache. A deal that STARTS can appear up to 30 s
// late; browsers may additionally keep the whole page for up to 60 s
// (the page's own Cache-Control). Each server process has its own cache.
//
// Everything shown is escaped; only images on our own Cloudinary account
// or the starter catalog are used. AI-generated starter images carry the
// "AI · KI-generiert" label.
// ============================================================
const { pageCache } = require('../utils/pageCache');
const { findDealStarterImage, DEAL_BACKGROUNDS } = require('../data/dealImages');

const DEAL_CARDS_CACHE_MS = 30 * 1000;
const MAX_CARDS = 3;
const CACHE_PREFIX = 'deals:';

// Same colours as BACKGROUNDS in frontend/public/deals.html (tests/dealCards.test.js checks it).
const BACKGROUND_CSS = {
  ember: 'linear-gradient(135deg, #ff5a1f 0%, #e6490f 100%)',
  sunrise: 'linear-gradient(135deg, #f59e0b 0%, #ff5a1f 100%)',
  night: 'linear-gradient(135deg, #232323 0%, #0a0a0a 100%)',
  slate: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
  forest: 'linear-gradient(135deg, #22c55e 0%, #166534 100%)',
  ocean: 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)',
  plum: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)',
  sand: 'linear-gradient(135deg, #f0ece0 0%, #c8c8c0 100%)',
};

const TEXT = {
  en: { heading: 'Current offers', validUntil: 'Valid until {date}', ai: 'AI-generated image', locale: 'en-GB', date: { day: 'numeric', month: 'short', year: 'numeric' } },
  de: { heading: 'Aktuelle Angebote', validUntil: 'Gültig bis {date}', ai: 'KI-generiertes Bild', locale: 'de-DE', date: { day: '2-digit', month: '2-digit', year: 'numeric' } },
};

const UPLOADED_IMAGE = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_,:.\/-]+\.(?:jpe?g|png|webp)$/;

// Starter images come from our own Cloudinary account (CLOUDINARY_CLOUD_NAME),
// where the catalog is uploaded once per account as qraivy-deal-starters/<catalog id>:
// 1200x900 like uploads, format and quality chosen by Cloudinary. Never from the
// page's own site -- on deals-preview that site is behind Vercel's login.
// Saved deals keep only the catalog id, so they follow this without any change.
const STARTER_FOLDER = 'qraivy-deal-starters';
const STARTER_TRANSFORM = 'c_fill,g_auto,h_900,w_1200,f_auto,q_auto';
const CLOUD_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
let warnedNoCloud = false;
function starterImageUrl(starterId, env = process.env) {
  const cloud = String(env.CLOUDINARY_CLOUD_NAME || '').trim();
  if (!CLOUD_NAME.test(cloud)) {
    if (!warnedNoCloud) { warnedNoCloud = true; console.warn('[deals] CLOUDINARY_CLOUD_NAME missing or invalid: starter images are shown as a colour'); }
    return '';
  }
  if (typeof starterId !== 'string' || !/^[a-z0-9-]+$/.test(starterId)) return '';
  return 'https://res.cloudinary.com/' + cloud + '/image/upload/' + STARTER_TRANSFORM + '/' + STARTER_FOLDER + '/' + starterId + '.jpg';
}
// Behind every picture: one that fails to load leaves a soft colour instead of a
// white hole. The <img> stays in the page, so the failed request is still visible.
const MEDIA_UNDERLAY = BACKGROUND_CSS.sand;

function isEnabled(env = process.env) { return String(env.DEALS_ON_LANDING_PAGES || '').trim() === '1'; }
function cacheKey(slug) { return CACHE_PREFIX + slug; }
// Called by dealService whenever something a customer could see changes.
function forgetPageDeals(slugs) {
  for (const s of slugs || []) if (typeof s === 'string' && s) pageCache.del(cacheKey(s));
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pageLang(page) {
  try {
    const s = typeof page.sections === 'string' ? JSON.parse(page.sections) : (page.sections || {});
    return s && s.language === 'de' ? 'de' : 'en';
  } catch (_) { return 'en'; }
}
function formatDate(value, lang) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const t = TEXT[lang];
  return new Intl.DateTimeFormat(t.locale, { ...t.date, timeZone: 'Europe/Berlin' }).format(d);
}
function stillRunning(deal, now) {
  const s = deal.startsAt ? new Date(deal.startsAt).getTime() : null;
  const e = deal.endsAt ? new Date(deal.endsAt).getTime() : null;
  return !(s != null && s > now) && !(e != null && e < now);
}

// The picture of one card: an <img> for an uploaded or starter image, else a colour.
// (pageOrigin is no longer used here: starter images come from Cloudinary.)
function media(image, pageOrigin, t) {
  const fallback = '<div class="qd-media" style="background:' + BACKGROUND_CSS.ember + '"></div>';
  if (!image || typeof image !== 'object') return fallback;
  if (image.source === 'background') {
    const css = BACKGROUND_CSS[image.backgroundId];
    return css ? '<div class="qd-media" style="background:' + css + '"></div>' : fallback;
  }
  let src = '', ai = false;
  if (image.source === 'uploaded' && typeof image.url === 'string' && UPLOADED_IMAGE.test(image.url)) src = image.url;
  if (image.source === 'starter') {
    const starter = findDealStarterImage(image.starterId);
    if (starter) {
      src = starterImageUrl(starter.id);
      ai = !!src && starter.origin === 'ai_generated';
    }
  }
  if (!src) return fallback;
  return '<div class="qd-media" style="background:' + MEDIA_UNDERLAY + '"><img src="' + esc(src) + '" alt="" width="1200" height="900" loading="lazy" decoding="async">' +
    (ai ? '<span class="qd-ai"><span aria-hidden="true">AI · KI-generiert</span><span class="qd-sr">' + esc(t.ai) + '</span></span>' : '') + '</div>';
}

// The cards are always white, in the page's light and dark theme. The
// landing page's dark theme recolours text page-wide (.dark-mode h1,h2,h3
// {color:#fff !important}; .dark-mode p,span,div {color:#ccc}), which made
// the card text white or pale grey on white. The card's own text colours
// are therefore scoped (.qd-deals .qd-x, specificity 0,2,0) and !important,
// so they win over those rules. All text on the card reaches at least 7:1.
// The heading sits on the page background, so it follows the page theme:
// dark orange on light (4.5:1+), the theme's white in dark mode.
const DEALS_ANCHOR = 'qraivy-deals';
// One card's anchor: #qraivy-deal-<deal id>. Only well-formed ids get one.
const DEAL_ANCHOR_PREFIX = 'qraivy-deal-';
const DEAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
function cardAnchor(d) { return d && typeof d.id === 'string' && DEAL_ID.test(d.id) ? ' id="' + DEAL_ANCHOR_PREFIX + d.id + '"' : ''; }
// Our own links (#qraivy-deals, #qraivy-deal-<id>) land on their target even
// when content above it grows after the first jump (images, fonts -- seen on
// phones): aligned again once the page has loaded, and shortly after. A link
// to a deal that is not shown (ended, not started, beyond the three newest)
// lands on the offers instead of the top of the page. Other anchors are left
// alone. Fixed text, no data from the request.
const ANCHOR_FALLBACK = '<script>(function(){function target(){var h=location.hash||"";' +
  'if(h==="#' + DEALS_ANCHOR + '")return document.getElementById("' + DEALS_ANCHOR + '");if(h.indexOf("#' + DEAL_ANCHOR_PREFIX + '")!==0)return null;' +
  'return document.getElementById(h.slice(1))||document.getElementById("' + DEALS_ANCHOR + '");}' +
  'function go(){var t=target();if(t)t.scrollIntoView();}' +
  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();' +
  'window.addEventListener("load",function(){go();setTimeout(go,400);});window.addEventListener("hashchange",go);})();</script>';
const STYLE = '<style>' +
  '.qd-deals{max-width:560px;margin:0 auto 32px;padding:0 20px;font-family:inherit;scroll-margin-top:80px}' +
  '.qd-heading{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;margin:0 0 12px}' +
  '.qd-list{display:grid;gap:14px}' +
  '.qd-card{background:#fff;border:1px solid #ececec;border-radius:16px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.06);scroll-margin-top:80px}' +
  '.qd-media{position:relative;aspect-ratio:4/3;background:#f2f2f2;background-size:cover}' +
  '.qd-media img{display:block;width:100%;height:100%;object-fit:cover}' +
  '.qd-ai{position:absolute;left:8px;bottom:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;line-height:1.4}' +
  '.qd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
  '.qd-body{padding:14px 16px 16px}' +
  '.qd-offer{margin:0 0 4px;font-size:18px;font-weight:800;line-height:1.25;color:#0a0a0a;overflow-wrap:anywhere}' +
  '.qd-name{margin:0 0 6px;font-size:14px;font-weight:600;color:#2b2b2b;overflow-wrap:anywhere}' +
  '.qd-desc{margin:0 0 8px;font-size:14px;line-height:1.45;color:#333;overflow-wrap:anywhere}' +
  '.qd-valid{margin:0;font-size:12px;color:#555}' +
  '.qd-deals .qd-card{background:#fff !important}' +
  '.qd-deals .qd-offer{color:#0a0a0a !important}.qd-deals .qd-name{color:#2b2b2b !important}' +
  '.qd-deals .qd-desc{color:#333 !important}.qd-deals .qd-valid{color:#555 !important}.qd-deals .qd-ai{color:#fff !important}' +
  '@media(min-width:600px){.qd-list{grid-template-columns:1fr}}' +
  '</style>';

// deals: the customer-safe objects from activeDealsForPage().
function renderDealCards(deals, { lang = 'en', pageOrigin = '', now = Date.now() } = {}) {
  const t = TEXT[lang] || TEXT.en;
  const list = (Array.isArray(deals) ? deals : []).filter((d) => d && d.title && d.offerText && stillRunning(d, now)).slice(0, MAX_CARDS);
  if (!list.length) return '';
  const cards = list.map((d) => '<article class="qd-card"' + cardAnchor(d) + '>' + media(d.image, pageOrigin, t) +
    '<div class="qd-body"><p class="qd-offer">' + esc(d.offerText) + '</p><h3 class="qd-name">' + esc(d.title) + '</h3>' +
    (d.description ? '<p class="qd-desc">' + esc(d.description) + '</p>' : '') +
    (d.endsAt && formatDate(d.endsAt, lang) ? '<p class="qd-valid">' + esc(t.validUntil.replace('{date}', formatDate(d.endsAt, lang))) + '</p>' : '') +
    '</div></article>').join('');
  // ids: stable anchors, so the Deals admin can link straight to the offers
  // (…/lp/<slug>#qraivy-deals) or to one deal (…#qraivy-deal-<id>)
  return '<section class="qd-deals" id="' + DEALS_ANCHOR + '" aria-label="' + esc(t.heading) + '">' + STYLE + '<h2 class="qd-heading">' + esc(t.heading) + '</h2><div class="qd-list">' + cards + '</div>' + ANCHOR_FALLBACK + '</section>';
}

// Places the section before the page's footer (or before </body>); unchanged if neither exists.
function insertSection(html, section) {
  let at = html.indexOf('<footer');
  if (at === -1) at = html.lastIndexOf('</body>');
  if (at === -1) return html;
  return html.slice(0, at) + '<!-- QRAIVY Deals -->\n' + section + '\n' + html.slice(at);
}

async function injectActiveDeals(html, page, opts = {}) {
  const env = opts.env || process.env;
  if (!isEnabled(env)) return html;
  if (typeof html !== 'string' || !page || typeof page.slug !== 'string' || !page.slug) return html;
  try {
    const service = opts.service || require('./dealService');
    const now = opts.now != null ? Number(opts.now) : Date.now();
    let deals = pageCache.get(cacheKey(page.slug));
    if (deals === null) {
      deals = await service.activeDealsForPage(page.slug, new Date(now));
      pageCache.set(cacheKey(page.slug), deals, DEAL_CARDS_CACHE_MS);
    }
    let pageOrigin = opts.pageOrigin;
    if (pageOrigin === undefined) pageOrigin = require('../config/publicOrigins').pageOrigin;
    const section = renderDealCards(deals, { lang: pageLang(page), pageOrigin, now });
    return section ? insertSection(html, section) : html;
  } catch (e) {
    console.error('[deals] landing page deal cards skipped:', e && e.message);
    return html;
  }
}

module.exports = { injectActiveDeals, renderDealCards, insertSection, forgetPageDeals, isEnabled, BACKGROUND_CSS, DEAL_CARDS_CACHE_MS, MAX_CARDS, CACHE_PREFIX, DEALS_ANCHOR, DEAL_ANCHOR_PREFIX };
