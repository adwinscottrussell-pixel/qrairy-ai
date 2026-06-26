const { GoogleAuth } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || 'BCR2DN7TTDNOFDQ4';
const CLASS_SUFFIX = 'qraivy_loyalty';

function getCredentials() {
  const raw = process.env.GOOGLE_WALLET_KEY;
  if (!raw) throw new Error('GOOGLE_WALLET_KEY is missing');
  if (raw.trim().startsWith('{')) return JSON.parse(raw);
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

function getClassId() {
  return `${ISSUER_ID}.${CLASS_SUFFIX}`;
}

function getObjectId(slug) {
  return `${ISSUER_ID}.qraivy_${slug.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

async function ensureClass(credentials, businessName) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const classId = getClassId();

  const classBody = {
    id: classId,
    issuerName: 'QRaivy',
    programName: businessName || 'Smart Pass',
    programLogo: {
      sourceUri: { uri: 'https://www.qraivy.com/icon-192.png' },
      contentDescription: { defaultValue: { language: 'en-US', value: 'QRaivy Logo' } },
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
  }

  return classId;
}

async function createGoogleWalletSaveUrl(slug, sections) {
  const credentials = getCredentials();
  const businessName = sections.businessName || slug;
  const accent = (sections.theme && sections.theme.accentColor) || '#ff5a1f';
  const classId = await ensureClass(credentials, businessName);
  const objectId = getObjectId(slug);

  const loyaltyObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountName: businessName,
    accountId: slug,
    loyaltyPoints: {
      label: 'Stamps',
      balance: { int: 0 },
    },
    hexBackgroundColor: accent,
    cardTitle: { defaultValue: { language: 'en-US', value: businessName } },
    header: { defaultValue: { language: 'en-US', value: businessName } },
    barcode: {
      type: 'QR_CODE',
      value: `https://www.qraivy.com/lp/${slug}`,
      alternateText: slug,
    },
  };

  const claims = {
    iss: credentials.client_email,
    aud: 'google',
    origins: ['https://www.qraivy.com'],
    typ: 'savetowallet',
    payload: { loyaltyObjects: [loyaltyObject] },
  };

  const token = jwt.sign(claims, credentials.private_key, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

module.exports = { createGoogleWalletSaveUrl };
