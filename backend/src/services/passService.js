const JSZip = require('jszip');
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { WALLET_CONFIG } = require('../config/constants');

// ============================================================
// PKPASS GENERATION ENGINE
// Generates valid .pkpass files for Apple Wallet
// Signing requires Apple certificates (Phase 2)
// ============================================================

// ─── Main entry point ────────────────────────────────────────
async function generatePkpass(pass) {
  const passJson = buildPassJson(pass);
  const manifest = {};
  const zip = new JSZip();

  // Add pass.json
  const passJsonStr = JSON.stringify(passJson, null, 2);
  zip.file('pass.json', passJsonStr);
  manifest['pass.json'] = sha1(passJsonStr);

  // Add placeholder icon (replace with real assets from S3 in production)
  const iconBuffer = await getAssetBuffer(pass.iconUrl, 'icon');
  if (iconBuffer) {
    zip.file('icon.png', iconBuffer);
    manifest['icon.png'] = sha1(iconBuffer);
    zip.file('icon@2x.png', iconBuffer);
    manifest['icon@2x.png'] = sha1(iconBuffer);
  }

  // Add logo
  const logoBuffer = await getAssetBuffer(pass.logoUrl, 'logo');
  if (logoBuffer) {
    zip.file('logo.png', logoBuffer);
    manifest['logo.png'] = sha1(logoBuffer);
    zip.file('logo@2x.png', logoBuffer);
    manifest['logo@2x.png'] = sha1(logoBuffer);
  }

  // Add strip image (for event/membership passes)
  if (pass.stripUrl) {
    const stripBuffer = await getAssetBuffer(pass.stripUrl, 'strip');
    if (stripBuffer) {
      zip.file('strip.png', stripBuffer);
      manifest['strip.png'] = sha1(stripBuffer);
      zip.file('strip@2x.png', stripBuffer);
      manifest['strip@2x.png'] = sha1(stripBuffer);
    }
  }

  // Add thumbnail
  if (pass.thumbnailUrl) {
    const thumbBuffer = await getAssetBuffer(pass.thumbnailUrl, 'thumbnail');
    if (thumbBuffer) {
      zip.file('thumbnail.png', thumbBuffer);
      manifest['thumbnail.png'] = sha1(thumbBuffer);
    }
  }

  // Add manifest.json
  const manifestStr = JSON.stringify(manifest, null, 2);
  zip.file('manifest.json', manifestStr);

  // Add signature (requires real Apple cert — placeholder for Phase 2)
  const signature = await signManifest(manifestStr, pass);
  zip.file('signature', signature);

  const pkpassBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return pkpassBuffer;
}

// ─── Build pass.json ─────────────────────────────────────────
function buildPassJson(pass) {
  const qrUrl = pass.qrDestination
    ? `${WALLET_CONFIG.webServiceUrl}/ps/${pass.id}`
    : `https://qraivy.com`;

  const base = {
    formatVersion: 1,
    passTypeIdentifier: pass.passTypeId || WALLET_CONFIG.passTypeId,
    serialNumber: pass.serialNumber,
    teamIdentifier: pass.teamId || WALLET_CONFIG.teamId,
    organizationName: pass.company || WALLET_CONFIG.logoText,
    description: pass.title || `${pass.name || 'QRaivy'} Pass`,
    logoText: pass.company || WALLET_CONFIG.logoText,

    // Colors
    backgroundColor: pass.backgroundColor || 'rgb(0,0,0)',
    foregroundColor: pass.foregroundColor || 'rgb(255,255,255)',
    labelColor: pass.labelColor || 'rgb(255,255,255)',

    // Web service for push updates
    webServiceURL: `${WALLET_CONFIG.webServiceUrl}/wallet/v1`,
    authenticationToken: pass.authToken,

    // QR code
    barcode: {
      message: qrUrl,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: pass.website || qrUrl,
    },
    barcodes: [{
      message: qrUrl,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: pass.website || qrUrl,
    }],
  };

  // Add pass structure based on type
  const passStructure = buildPassStructure(pass);
  Object.assign(base, passStructure);

  return base;
}

// ─── Pass structure by type ───────────────────────────────────
function buildPassStructure(pass) {
  const primaryFields = [];
  const secondaryFields = [];
  const auxiliaryFields = [];
  const backFields = [];
  const headerFields = [];

  // Primary
  if (pass.name) primaryFields.push({ key: 'name', label: 'NAME', value: pass.name });
  if (pass.company) headerFields.push({ key: 'company', label: '', value: pass.company });

  // Secondary
  if (pass.title) secondaryFields.push({ key: 'title', label: 'TITLE', value: pass.title });
  if (pass.phoneNumber) secondaryFields.push({ key: 'phone', label: 'PHONE', value: pass.phoneNumber });

  // Auxiliary
  if (pass.email) auxiliaryFields.push({ key: 'email', label: 'EMAIL', value: pass.email });
  if (pass.website) auxiliaryFields.push({ key: 'website', label: 'WEBSITE', value: pass.website });

  // Back fields — full profile
  if (pass.biography) backFields.push({ key: 'bio', label: 'ABOUT', value: pass.biography });
  if (pass.aiUrl) backFields.push({ key: 'ai', label: 'AI ASSISTANT', value: pass.aiUrl, attributedValue: `<a href='${pass.aiUrl}'>Chat with AI →</a>` });
  if (pass.email) backFields.push({ key: 'emailBack', label: 'EMAIL', value: pass.email, attributedValue: `<a href='mailto:${pass.email}'>${pass.email}</a>` });
  if (pass.phoneNumber) backFields.push({ key: 'phoneBack', label: 'PHONE', value: pass.phoneNumber, attributedValue: `<a href='tel:${pass.phoneNumber}'>${pass.phoneNumber}</a>` });
  if (pass.website) backFields.push({ key: 'websiteBack', label: 'WEBSITE', value: pass.website, attributedValue: `<a href='${pass.website}'>${pass.website}</a>` });

  // Dynamic links on back
  if (pass.dynamicLinks && Array.isArray(pass.dynamicLinks)) {
    pass.dynamicLinks.forEach((link, i) => {
      backFields.push({
        key: `link_${i}`,
        label: link.label || `LINK ${i + 1}`,
        value: link.url,
        attributedValue: `<a href='${link.url}'>${link.label || link.url}</a>`,
      });
    });
  }

  // Map pass type to Apple Wallet style
  const styleMap = {
    business_card: 'generic',
    membership: 'storeCard',
    event: 'eventTicket',
    loyalty: 'storeCard',
    ai_assistant: 'generic',
    smart_identity: 'generic',
    generic: 'generic',
  };

  const style = styleMap[pass.type] || 'generic';

  return {
    [style]: {
      headerFields,
      primaryFields,
      secondaryFields,
      auxiliaryFields,
      backFields,
    },
  };
}

// ─── Sign manifest (placeholder — real signing in Phase 2) ───
async function signManifest(manifestStr, pass) {
  // Phase 2: Load .p12 cert from database, sign with OpenSSL
  // For now return empty signature buffer
  // This will be replaced with real PKCS#7 signing
  console.warn('⚠️  Pass signing not yet configured. Certificate required.');
  return Buffer.from('');
}

// ─── Trigger push update to all devices ──────────────────────
async function triggerPassUpdate(passId) {
  const devices = await prisma.passDevice.findMany({ where: { passId } });
  if (devices.length === 0) return;

  const apnsService = require('./apnsService');
  return apnsService.pushUpdateToDevices(devices);
}

// ─── Helpers ─────────────────────────────────────────────────
function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

async function getAssetBuffer(url, type) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn(`Could not fetch ${type} asset:`, url);
    return null;
  }
}

module.exports = { generatePkpass, triggerPassUpdate, buildPassJson };
