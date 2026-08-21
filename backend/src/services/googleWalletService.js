const { GoogleAuth } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');
const { getTheme } = require('./walletThemes');
const { PUBLIC_APP_ORIGIN, API_ORIGIN } = require('../config/urls');

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || '3388000000023161108';
const CLASS_SUFFIX = 'qraivy_loyalty_v1';
const DEFAULT_LOGO_URL = `${PUBLIC_APP_ORIGIN}/icon-192.png`;

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

async function ensureClass(credentials, businessName, logoUrl) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const classId = getClassId();

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

  // Try to get existing class first
  const getRes = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`,
    { headers: { Authorization: `Bearer ${token.token}` } }
  );

  if (getRes.status === 404) {
    await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(classBody),
    });
  } else {
    // Keep an existing class's branding in sync (e.g. business uploads a logo later)
    await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(classBody),
    }).catch(() => {});
  }

  return classId;
}

function buildLoyaltyObject({ slug, cid, businessName, accent, logoUrl, theme, stampCount, stampGoal, rewardName, rewardReady, walletHeroUrl }) {
  const classId = getClassId();
  const objectId = getObjectId(slug, cid);
  const L = theme.labels;
  // Real uploaded photo if the business set one (Google fetches it directly
  // from Cloudinary), otherwise the generated gradient banner.
  const heroUrl = walletHeroUrl || `${API_ORIGIN}/lp/wallet-hero/${slug}?c=${encodeURIComponent(accent)}`;

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
    header: { defaultValue: { language: 'en-US', value: rewardReady ? '🎁 ' + L.rewardReadyHeader : L.cardKicker } },
    heroImage: {
      sourceUri: { uri: heroUrl },
      contentDescription: { defaultValue: { language: 'en-US', value: businessName + ' banner' } },
    },
    textModulesData: [
      {
        id: 'reward_info',
        header: rewardReady ? L.rewardReadyLabel : L.rewardLabel,
        body: rewardReady ? 'Show this card to staff for your ' + rewardName : stampCount + ' of ' + stampGoal + ' stamps collected',
      },
    ],
    barcode: {
      type: 'QR_CODE',
      value: `${PUBLIC_APP_ORIGIN}/lp/${slug}`,
      alternateText: slug,
    },
  };
}

async function createGoogleWalletSaveUrl(slug, sections, cid) {
  const credentials = getCredentials();
  const businessName = sections.businessName || slug;
  const accent = (sections.theme && sections.theme.accentColor) || '#ff5a1f';
  const logoUrl = sections.logo && sections.logo.url;
  const walletHeroUrl = sections.walletHero && sections.walletHero.url;
  const theme = getTheme(sections.theme && sections.theme.walletTheme);
  const classId = await ensureClass(credentials, businessName, logoUrl);

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

  const loyaltyObject = Object.assign(
    { classId },
    buildLoyaltyObject({ slug, cid, businessName, accent, logoUrl, theme, stampCount, stampGoal, rewardName, rewardReady, walletHeroUrl })
  );

  const claims = {
    iss: credentials.client_email,
    aud: 'google',
    origins: [PUBLIC_APP_ORIGIN],
    typ: 'savetowallet',
    payload: { loyaltyObjects: [loyaltyObject] },
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

module.exports = { createGoogleWalletSaveUrl, updateGoogleWalletStamps, getObjectId };
