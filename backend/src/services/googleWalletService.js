const { GoogleAuth } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');
const { getTheme } = require('./walletThemes');
const { resolveStadtPocketContext } = require('./stadtPocketContext');

// Guards free-text (AI-generated hero.badge) before it goes into a Wallet
// field — mirrors passService.js's safeTagline; Apple/Google both have
// practical field-length limits.
function safeTagline(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 40 ? trimmed.slice(0, 40).trim() : trimmed;
}

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || '3388000000023161108';
const CLASS_SUFFIX = 'qraivy_loyalty_v1';
// Phase 3C.5C — icon-192.png has never actually existed as a static asset
// anywhere in this repo (frontend/public/ only has apple-touch-icon.png,
// favicon.png, favicon-16x16.png, favicon-32x32.png, favicon.ico) despite
// being referenced as a fallback in several places; every other consumer
// (PWA manifest, apple-touch-icon link, web-push icon) degrades silently on
// a missing icon, but Google Wallet's class creation validates the image
// URL and hard-rejects it with a 400. favicon.png is the closest-to-Google's
// recommended (~660x660) program-logo size of the icons that actually exist
// and resolve — confirmed live (curl) 200 image/png, 1254x1254.
const DEFAULT_LOGO_URL = 'https://www.qraivy.com/favicon.png';

function getCredentials() {
  const raw = process.env.GOOGLE_WALLET_KEY;
  if (!raw) throw new Error('GOOGLE_WALLET_KEY is missing');
  if (raw.trim().startsWith('{')) return JSON.parse(raw);
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

function getClassId() {
  return `${ISSUER_ID}.${CLASS_SUFFIX}`;
}

function getObjectId(slug, cid) {
  const base = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Per-customer object when cid is known, so each customer's Google Wallet
  // card tracks their own progress instead of one shared card for the business.
  const suffix = cid ? '_' + cid.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  return `${ISSUER_ID}.qraivy_${base}${suffix}`;
}

// Phase 3C.5A — Business Wallet Card: a dedicated Google Wallet class per
// business, isolated from the shared multi-tenant loyalty class above.
// programName/programLogo are CLASS-level fields — on the shared loyalty
// class they race every other business's request and Google withholds
// unapproved branding changes from end users anyway, which is why the
// production QA saw generic "Qraivy Loyalty" branding instead of the real
// business name. A dedicated class per business removes the collision;
// getting it Google-approved is a separate, later, manual step.
function getBusinessClassId(businessId) {
  const normalized = String(businessId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ISSUER_ID}.stadtpocket_business_${normalized}`;
}

// Separate object-ID namespace ("stadtpocket_biz_" vs. the existing
// "qraivy_" loyalty namespace above) so a Business Wallet Card object can
// never collide with a loyalty-shaped object that may already exist under
// the same slug (e.g. from before this business went StadtPocket, or from
// before loyalty was disabled) — the Google "save" JWT flow only creates a
// NEW object when the ID doesn't already exist; reusing an existing ID
// would have Google silently ignore this request's content entirely.
function getBusinessObjectId(slug, cid) {
  const base = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = cid ? '_' + cid.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  return `${ISSUER_ID}.stadtpocket_biz_${base}${suffix}`;
}

function smartPageUrl(slug) {
  return `https://www.qraivy.com/lp/${slug}`;
}

function smartPageBarcode(slug) {
  return { type: 'QR_CODE', value: smartPageUrl(slug), alternateText: slug };
}

// Phase 3C.6C — Business Wallet Card, take two. The 3C.5A class/object
// functions above (getBusinessClassId/getBusinessObjectId) put the
// Business Wallet Card on Google's LoyaltyClass/LoyaltyObject, which is
// what forces Google's own member-name/member-ID/"use this loyalty card
// across Google" UI onto a card that was never a membership — it's just
// "save this business." Old cards already saved under that namespace are
// left exactly as they are (see Step 9 in the phase plan: no destructive
// migration); every NEW Business Wallet Card save now goes through
// GenericClass/GenericObject instead, via the functions below.
//
// GenericClass carries no branding fields at all (no programName,
// programLogo, reviewStatus — confirmed against the installed googleapis
// walletobjects v1 type definitions), so unlike the old per-business
// LoyaltyClass there is no collision risk in every StadtPocket business
// sharing ONE class; every business-specific value lives on the
// GenericObject instead.
function getBusinessGenericClassId() {
  return `${ISSUER_ID}.stadtpocket_business`;
}

// Distinct from both the shared loyalty object namespace ("qraivy_") and
// the old per-business namespace above ("stadtpocket_biz_") so Google
// always issues a genuinely new object here instead of reopening an old
// LoyaltyObject a test user may have already saved. Keyed by businessId,
// not slug: a Business Wallet Card belongs to the Business, and the
// StadtPocket one-included-page entitlement (Phase 3C.4) already
// guarantees at most one LandingPage per Business.
function getBusinessGenericObjectId(businessId, cid) {
  const bizPart = String(businessId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = cid ? '_' + cid.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  return `${ISSUER_ID}.stadtpocket_business_${bizPart}${suffix}`;
}

// Phase 3C.5B — fail-closed class ensure. Production QA (Phase 3C.5A) found
// Google's Save-to-Wallet flow rejecting a Business Wallet Card with
// "Could not find necessary class" — root-caused to this function returning
// classId unconditionally, even when the GET/CREATE/PATCH calls above never
// actually confirmed the class exists. A classId must now never be returned
// to createGoogleWalletSaveUrl() unless the class was confirmed to already
// exist (GET 200) or was just successfully created (CREATE 2xx) — any other
// outcome throws, which createGoogleWalletSaveUrl does not catch, so the
// caller's own try/catch (lpRoutes.js's '/lp/wallet/google/:slug' handler)
// surfaces the real error and no JWT referencing a nonexistent class is ever
// issued.
//
// No post-create read-back GET: Google's loyaltyClass insert is a standard
// synchronous REST create — a successful response already IS Google's
// confirmation that the resource exists, the same guarantee any other
// Google Cloud REST API gives on a 2xx insert. A second GET immediately
// after, with no retry/backoff, wouldn't add a real guarantee against
// eventual-consistency lag (it would just race the same window once more)
// — it would only add latency and a way to falsely fail-close a request
// that actually succeeded. If Google's Save-to-Wallet flow specifically
// needs a moment to catch up after a genuine create, that's a distinct,
// separately-diagnosable condition (see the Phase 3C.5A trace) that a
// bare re-GET here cannot reliably rule out anyway.
async function ensureClass(credentials, classId, businessName, logoUrl) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  // Business branding — never the generic QRaivy logo unless the business
  // hasn't uploaded their own.
  const classBody = {
    id: classId,
    issuerName: 'QRaivy',
    programName: businessName || 'Smart Pass',
    programLogo: {
      sourceUri: { uri: logoUrl || DEFAULT_LOGO_URL },
      contentDescription: { defaultValue: { language: 'en-US', value: businessName ? businessName + ' Logo' : 'QRaivy Logo' } },
    },
    hexBackgroundColor: '#0a0a0a',
    reviewStatus: 'UNDER_REVIEW',
  };

  console.log(`[GoogleWalletClass] lookup started classId=${classId}`);
  const getRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`,
    { headers: { Authorization: `Bearer ${token.token}` } }
  );

  if (getRes.status === 200) {
    console.log(`[GoogleWalletClass] class found classId=${classId}`);
    // Keep an existing class's branding in sync (e.g. business uploads a
    // logo later). Best-effort only, matching pre-3C.5B behavior — the
    // class is already confirmed to exist, so a failed branding sync here
    // degrades cosmetics, not correctness, and must not block a customer
    // from saving a card they can already save.
    await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(classBody),
    }).catch(() => {});
    return classId;
  }

  if (getRes.status !== 404) {
    const errText = await getRes.text().catch(() => '');
    console.error(`[GoogleWalletClass] lookup failed classId=${classId} status=${getRes.status} body=${errText}`);
    throw new Error(`Google Wallet class lookup failed: ${getRes.status} ${errText}`);
  }

  console.log(`[GoogleWalletClass] class missing, creating classId=${classId}`);
  const createRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(classBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    console.error(`[GoogleWalletClass] creation failed classId=${classId} status=${createRes.status} body=${errText}`);
    throw new Error(`Google Wallet class creation failed: ${createRes.status} ${errText}`);
  }

  console.log(`[GoogleWalletClass] creation confirmed classId=${classId}`);
  return classId;
}

// Phase 3C.6C — fail-closed Generic-class ensure, the same GET→404→CREATE
// pattern as ensureClass()/Phase 3C.5B above: a classId is never handed
// back unless it was confirmed to exist (GET 200) or was just
// successfully created (CREATE 2xx) — any other outcome throws, so
// createGoogleWalletSaveUrl's caller (lpRoutes.js) surfaces the real
// error instead of issuing a JWT referencing a class Google doesn't
// actually have. Unlike ensureClass(), there is no branding body to send
// and no PATCH-to-sync-branding step on the already-exists path —
// GenericClass has no branding fields at all, so there is nothing to
// keep in sync at the class level.
async function ensureGenericClass(credentials, classId) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  console.log(`[GoogleWalletGenericClass] lookup started classId=${classId}`);
  const getRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/genericClass/${classId}`,
    { headers: { Authorization: `Bearer ${token.token}` } }
  );

  if (getRes.status === 200) {
    console.log(`[GoogleWalletGenericClass] class found classId=${classId}`);
    return classId;
  }

  if (getRes.status !== 404) {
    const errText = await getRes.text().catch(() => '');
    console.error(`[GoogleWalletGenericClass] lookup failed classId=${classId} status=${getRes.status} body=${errText}`);
    throw new Error(`Google Wallet generic class lookup failed: ${getRes.status} ${errText}`);
  }

  console.log(`[GoogleWalletGenericClass] class missing, creating classId=${classId}`);
  const createRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/genericClass', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: classId }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    console.error(`[GoogleWalletGenericClass] creation failed classId=${classId} status=${createRes.status} body=${errText}`);
    throw new Error(`Google Wallet generic class creation failed: ${createRes.status} ${errText}`);
  }

  console.log(`[GoogleWalletGenericClass] creation confirmed classId=${classId}`);
  return classId;
}

function buildLoyaltyObject({ objectId, classId, slug, cid, businessName, accent, logoUrl, theme, stampCount, stampGoal, rewardName, rewardReady, walletHeroUrl }) {
  const L = theme.labels;
  // Real uploaded photo if the business set one (Google fetches it directly
  // from Cloudinary), otherwise the generated gradient banner.
  const heroUrl = walletHeroUrl || `https://api.qraivy.com/lp/wallet-hero/${slug}?c=${encodeURIComponent(accent)}`;
  const heroImage = {
    sourceUri: { uri: heroUrl },
    contentDescription: { defaultValue: { language: 'en-US', value: businessName + ' banner' } },
  };

  // Loyalty path — EXACTLY unchanged (same fields, same values, same
  // nonexistent-on-the-real-API cardTitle/header quirk untouched; fixing
  // that for loyalty cards is a separate, later phase). As of Phase
  // 3C.6C this function is only ever called for the loyalty path — the
  // Business Wallet Card path now builds a GenericObject instead, see
  // buildGenericBusinessObject() below.
  const headerValue = rewardReady ? '🎁 ' + L.rewardReadyHeader : L.cardKicker;
  return {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountName: businessName,
    accountId: cid ? `${slug}-${cid}` : slug,
    loyaltyPoints: {
      label: rewardReady ? L.rewardReadyLabel : L.stampsLabel,
      balance: { int: stampCount },
    },
    hexBackgroundColor: accent,
    cardTitle: { defaultValue: { language: 'en-US', value: businessName } },
    header: { defaultValue: { language: 'en-US', value: headerValue } },
    heroImage,
    textModulesData: [
      {
        id: 'reward_info',
        header: rewardReady ? L.rewardReadyLabel : L.rewardLabel,
        body: rewardReady ? 'Show this card to staff for your ' + rewardName : stampCount + ' of ' + stampGoal + ' stamps collected',
      },
    ],
    barcode: smartPageBarcode(slug),
  };
}

// Phase 3C.6C — Business Wallet Card content on Google's GENERIC pass
// model. Mirrors the Wallet Studio Business Wallet preview as closely as
// GenericObject's fields allow, one field per concern: cardTitle is the
// business name (Google's own doc: "usually the Business name"), header
// carries the category/tagline, subheader carries the StadtPocket city
// label. No loyaltyPoints/accountName/accountId anywhere — GenericObject
// doesn't even define those fields — so Google has nothing to render as
// a member name, member ID, or "use across Google" loyalty affordance.
function buildGenericBusinessObject({ objectId, classId, slug, businessName, accent, logoUrl, walletHeroUrl, city, tagline }) {
  const heroUrl = walletHeroUrl || `https://api.qraivy.com/lp/wallet-hero/${slug}?c=${encodeURIComponent(accent)}`;
  const cityLabel = city ? `StadtPocket · ${city}` : 'StadtPocket';
  return {
    id: objectId,
    classId,
    state: 'ACTIVE',
    cardTitle: { defaultValue: { language: 'en-US', value: businessName } },
    header: { defaultValue: { language: 'en-US', value: tagline || 'Saved Business' } },
    subheader: { defaultValue: { language: 'en-US', value: cityLabel } },
    hexBackgroundColor: accent,
    logo: {
      sourceUri: { uri: logoUrl || DEFAULT_LOGO_URL },
      contentDescription: { defaultValue: { language: 'en-US', value: businessName + ' logo' } },
    },
    heroImage: {
      sourceUri: { uri: heroUrl },
      contentDescription: { defaultValue: { language: 'en-US', value: businessName + ' banner' } },
    },
    textModulesData: [
      { id: 'context', header: 'Business Card', body: 'This is your saved business card, not a loyalty membership.' },
    ],
    linksModuleData: { uris: [{ id: 'smart_page', uri: smartPageUrl(slug), description: 'Open Smart Page' }] },
    barcode: smartPageBarcode(slug),
  };
}

async function createGoogleWalletSaveUrl(slug, sections, cid, businessId) {
  const credentials = getCredentials();
  const businessName = sections.businessName || slug;
  const accent = (sections.theme && sections.theme.accentColor) || '#ff5a1f';
  const logoUrl = sections.logo && sections.logo.url;
  const walletHeroUrl = sections.walletHero && sections.walletHero.url;
  const theme = getTheme(sections.theme && sections.theme.walletTheme);

  // If this customer already has stamps (e.g. collected via NFC/QR before
  // ever adding a wallet), the card must open already showing that real
  // progress — never reset to 0 just because this is their first "save".
  const serial = cid ? `sqr-${slug}-${cid}` : 'sqr-' + slug;
  const [pass, stampSettings] = await Promise.all([
    prisma.pass.findUnique({ where: { serialNumber: serial } }),
    prisma.stampSettings.findUnique({ where: { slug } }),
  ]);
  const stampGoal = stampSettings ? stampSettings.goal : 10;
  const rewardName = stampSettings ? stampSettings.rewardName : 'Free item';
  const stampCount = pass ? (pass.stampCount || 0) : 0;
  const rewardReady = pass ? !!pass.rewardReady : false;

  // Phase 3C.5 — Business Wallet Card: only for a genuinely StadtPocket-linked
  // page (businessId, resolved server-side, never client-supplied) whose
  // loyalty program is off. Non-StadtPocket pages keep today's loyalty object
  // exactly as-is, loyalty enabled or not.
  const stadtPocket = await resolveStadtPocketContext(businessId || null);
  const isBusinessWalletCard = stadtPocket.isStadtPocketLinked && !(stampSettings && stampSettings.enabled);
  const tagline = safeTagline(sections.hero && sections.hero.badge);

  // Phase 3C.6C — Business Wallet Card mode now issues a Google GENERIC
  // pass (own shared class, own object namespace, keyed by businessId);
  // every other page (loyalty-enabled StadtPocket pages, and all
  // non-StadtPocket pages) keeps the exact pre-existing shared
  // LoyaltyClass + "qraivy_" LoyaltyObject namespace, unchanged.
  let passObject, payloadKey;
  if (isBusinessWalletCard) {
    const classId = getBusinessGenericClassId();
    const objectId = getBusinessGenericObjectId(stadtPocket.businessId, cid);
    await ensureGenericClass(credentials, classId);
    passObject = buildGenericBusinessObject({ objectId, classId, slug, businessName, accent, logoUrl, walletHeroUrl, city: stadtPocket.city, tagline });
    payloadKey = 'genericObjects';
  } else {
    const classId = getClassId();
    const objectId = getObjectId(slug, cid);
    await ensureClass(credentials, classId, businessName, logoUrl);
    passObject = buildLoyaltyObject({ objectId, classId, slug, cid, businessName, accent, logoUrl, theme, stampCount, stampGoal, rewardName, rewardReady, walletHeroUrl });
    payloadKey = 'loyaltyObjects';
  }

  const claims = {
    iss: credentials.client_email,
    aud: 'google',
    origins: ['https://www.qraivy.com'],
    typ: 'savetowallet',
    payload: { [payloadKey]: [passObject] },
  };

  const token = jwt.sign(claims, credentials.private_key, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

async function updateGoogleWalletStamps(slug, stampCount, cid) {
  const credentials = getCredentials();
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const objectId = getObjectId(slug, cid);

  const [stampSettings] = await Promise.all([
    prisma.stampSettings.findUnique({ where: { slug } }),
  ]);
  const stampGoal = stampSettings ? stampSettings.goal : 10;
  const rewardName = stampSettings ? stampSettings.rewardName : 'Free item';
  const rewardReady = stampCount >= stampGoal;
  const theme = getTheme();
  const L = theme.labels;

  const res = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loyaltyPoints: { label: rewardReady ? L.rewardReadyLabel : L.stampsLabel, balance: { int: stampCount } },
        header: { defaultValue: { language: 'en-US', value: rewardReady ? '🎁 ' + L.rewardReadyHeader : L.cardKicker } },
        textModulesData: [
          {
            id: 'reward_info',
            header: rewardReady ? L.rewardReadyLabel : L.rewardLabel,
            body: rewardReady ? 'Show this card to staff for your ' + rewardName : stampCount + ' of ' + stampGoal + ' stamps collected',
          },
        ],
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // 404 just means no customer has saved this wallet object yet — not an error
    if (res.status !== 404) throw new Error(`Google Wallet update failed: ${res.status} ${errText}`);
  }
  return res.ok;
}

module.exports = { createGoogleWalletSaveUrl, updateGoogleWalletStamps, getObjectId, getClassId, getBusinessClassId, getBusinessObjectId, getBusinessGenericClassId, getBusinessGenericObjectId };
