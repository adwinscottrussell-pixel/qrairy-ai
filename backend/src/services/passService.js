const JSZip = require('jszip');
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { WALLET_CONFIG } = require('../config/constants');
const { PKPass } = require('passkit-generator');

// Cache WWDR cert so we only fetch once per process
let _wwdrCache = null;
async function getWWDRCert() {
  if (_wwdrCache) return _wwdrCache;
  // Apple WWDR G4 — publicly available
  const resp = await fetch('https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer');
  if (!resp.ok) throw new Error('Could not fetch Apple WWDR certificate');
  const buf = Buffer.from(await resp.arrayBuffer());
  const b64 = buf.toString('base64').match(/.{1,64}/g).join('\n');
  _wwdrCache = Buffer.from(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`);
  return _wwdrCache;
}

// ── Generate .pkpass for a Smart QR landing page ──────────────
async function generateSmartQRPass(slug, sections) {
  const hero    = sections.hero    || {};
  const loop    = sections.loop    || {};
  const theme   = sections.theme   || {};

  const accent       = theme.accentColor || '#ff5a1f';
  const brandName    = hero.title || hero.aiTitle || sections.businessName || 'Smart Pass';
  const walletTitle  = loop.walletTitle  || brandName;
  const walletSub    = loop.walletSubtitle || 'Scan to visit';
  const lpUrl        = `https://api.qraivy.com/lp/${slug}`;
  const serial       = `sqr-${slug}`;
  const authTok      = crypto.createHash('sha256').update(slug + 'qraivy').digest('hex').slice(0,32);
  const bgRgb        = hexToRgb(accent) || 'rgb(255,90,31)';

  const passTypeId = process.env.APPLE_PASS_TYPE_ID || WALLET_CONFIG.passTypeId;
  const teamId     = process.env.APPLE_TEAM_ID      || WALLET_CONFIG.teamId;
  const wsUrl      = `${WALLET_CONFIG.webServiceUrl}/wallet`;

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: serial,
    teamIdentifier: teamId,
    organizationName: brandName,
    description: walletSub,
    logoText: brandName,
    backgroundColor: bgRgb,
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    webServiceURL: wsUrl,
    authenticationToken: authTok,
    barcode:  { message: lpUrl, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
    barcodes: [{ message: lpUrl, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
    storeCard: {
      primaryFields:   [{ key:'title',    label:'',        value: walletTitle }],
      secondaryFields: [{ key:'sub',      label:'',        value: walletSub   }],
      auxiliaryFields: sections._lastMsg ? [{ key:'push', label: sections._lastMsgTitle || 'LATEST UPDATE', value: sections._lastMsg, changeMessage: '%@' }] : [],
      backFields:      (function(){
        var bf = [{ key:'url', label:'VISIT PAGE', value: lpUrl, attributedValue: '<a href="'+lpUrl+'">Open Smart QR Page</a>' }];
        if (sections._lastMsg) {
          bf.unshift({ key:'msg', label: sections._lastMsgTitle || 'LATEST UPDATE', value: sections._lastMsg });
          if (sections._lastMsgLink) bf.push({ key:'msglink', label:'TAP TO OPEN', value: sections._lastMsgLink, attributedValue: '<a href="'+sections._lastMsgLink+'">Tap to see the collection →</a>' });
        }
        return bf;
      })()
    }
  };

  const certPem = Buffer.from(process.env.APPLE_PASS_CERT_PEM || '', 'base64');
  const keyPem  = Buffer.from(process.env.APPLE_PASS_KEY_PEM  || '', 'base64');
  const wwdr    = await getWWDRCert();

  const pass = new PKPass(
    {
      'pass.json':  Buffer.from(JSON.stringify(passJson)),
      'icon.png':   getDefaultIcon(),
      'icon@2x.png':getDefaultIcon(),
    },
    {
      wwdr,
      signerCert: certPem,
      signerKey:  keyPem,
    }
  );

  return pass.getAsBuffer();
}

// ── Original full pass generation (for registered passes) ─────
async function generatePkpass(pass) {
  const passJson = buildPassJson(pass);
  const manifest = {};
  const zip = new JSZip();

  const passJsonStr = JSON.stringify(passJson, null, 2);
  zip.file('pass.json', passJsonStr);
  manifest['pass.json'] = sha1(passJsonStr);

  const iconBuffer = await getAssetBuffer(pass.iconUrl, 'icon') || getDefaultIcon();
  zip.file('icon.png',    iconBuffer); manifest['icon.png']    = sha1(iconBuffer);
  zip.file('icon@2x.png', iconBuffer); manifest['icon@2x.png'] = sha1(iconBuffer);

  const logoBuffer = await getAssetBuffer(pass.logoUrl, 'logo');
  if (logoBuffer) {
    zip.file('logo.png',    logoBuffer); manifest['logo.png']    = sha1(logoBuffer);
    zip.file('logo@2x.png', logoBuffer); manifest['logo@2x.png'] = sha1(logoBuffer);
  }

  if (pass.stripUrl) {
    const stripBuffer = await getAssetBuffer(pass.stripUrl, 'strip');
    if (stripBuffer) {
      zip.file('strip.png',    stripBuffer); manifest['strip.png']    = sha1(stripBuffer);
      zip.file('strip@2x.png', stripBuffer); manifest['strip@2x.png'] = sha1(stripBuffer);
    }
  }

  const manifestStr = JSON.stringify(manifest, null, 2);
  zip.file('manifest.json', manifestStr);

  const certPem = Buffer.from(process.env.APPLE_PASS_CERT_PEM || '', 'base64');
  const keyPem  = Buffer.from(process.env.APPLE_PASS_KEY_PEM  || '', 'base64');
  const wwdr    = await getWWDRCert();

  // Re-sign via PKPass just for the signature
  const sigPass = await PKPass.from({
    model: { 'pass.json': Buffer.from(passJsonStr), 'icon.png': getDefaultIcon(), 'icon@2x.png': getDefaultIcon() },
    certificates: { wwdr, signerCert: certPem, signerKey: keyPem }
  });
  const sigBuffer = await sigPass.getAsBuffer();

  // Extract signature from the signed bundle
  const JSZip2 = require('jszip');
  const sigZip = await JSZip2.loadAsync(sigBuffer);
  const sigFile = sigZip.file('signature');
  if (sigFile) {
    zip.file('signature', await sigFile.async('nodebuffer'));
  } else {
    zip.file('signature', Buffer.from(''));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Build pass.json for registered passes ─────────────────────
function buildPassJson(pass) {
  const qrUrl = pass.qrDestination
    ? `${WALLET_CONFIG.webServiceUrl}/ps/${pass.id}`
    : 'https://qraivy.com';

  const base = {
    formatVersion: 1,
    passTypeIdentifier: pass.passTypeId || WALLET_CONFIG.passTypeId,
    serialNumber: pass.serialNumber,
    teamIdentifier: pass.teamId || WALLET_CONFIG.teamId,
    organizationName: pass.company || WALLET_CONFIG.logoText,
    description: pass.title || `${pass.name || 'QRaivy'} Pass`,
    logoText: pass.company || WALLET_CONFIG.logoText,
    backgroundColor: pass.backgroundColor || 'rgb(0,0,0)',
    foregroundColor: pass.foregroundColor || 'rgb(255,255,255)',
    labelColor: pass.labelColor || 'rgb(255,255,255)',
    webServiceURL: `${WALLET_CONFIG.webServiceUrl}/wallet/v1`,
    authenticationToken: pass.authToken,
    barcode:  { message: qrUrl, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: pass.website || qrUrl },
    barcodes: [{ message: qrUrl, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: pass.website || qrUrl }],
  };

  const primaryFields = [];
  const secondaryFields = [];
  const auxiliaryFields = [];
  const backFields = [];
  const headerFields = [];

  if (pass.name)        primaryFields.push({   key:'name',    label:'NAME',    value: pass.name });
  if (pass.company)     headerFields.push({    key:'company', label:'',        value: pass.company });
  if (pass.title)       secondaryFields.push({ key:'title',   label:'TITLE',   value: pass.title });
  if (pass.phoneNumber) secondaryFields.push({ key:'phone',   label:'PHONE',   value: pass.phoneNumber });
  if (pass.email)       auxiliaryFields.push({ key:'email',   label:'EMAIL',   value: pass.email });
  if (pass.website)     auxiliaryFields.push({ key:'website', label:'WEBSITE', value: pass.website });
  if (pass.biography)   backFields.push({ key:'bio',  label:'ABOUT',   value: pass.biography });
  if (pass.email)       backFields.push({ key:'emailBack', label:'EMAIL', value: pass.email, attributedValue:`<a href='mailto:${pass.email}'>${pass.email}</a>` });
  if (pass.phoneNumber) backFields.push({ key:'phoneBack', label:'PHONE', value: pass.phoneNumber, attributedValue:`<a href='tel:${pass.phoneNumber}'>${pass.phoneNumber}</a>` });
  if (pass.website)     backFields.push({ key:'websiteBack', label:'WEBSITE', value: pass.website, attributedValue:`<a href='${pass.website}'>${pass.website}</a>` });

  const styleMap = { business_card:'generic', membership:'storeCard', event:'eventTicket', loyalty:'storeCard', ai_assistant:'generic', smart_identity:'generic', generic:'generic' };
  const style = styleMap[pass.type] || 'generic';

  return { ...base, [style]: { headerFields, primaryFields, secondaryFields, auxiliaryFields, backFields } };
}

// ── Trigger push to all devices ───────────────────────────────
async function triggerPassUpdate(passId) {
  const devices = await prisma.passDevice.findMany({ where: { passId } });
  if (!devices.length) return;
  const apnsService = require('./apnsService');
  return apnsService.pushUpdateToDevices(devices);
}

// ── Helpers ───────────────────────────────────────────────────
function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

async function getAssetBuffer(url, type) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `rgb(${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)})` : null;
}

// Minimal valid 29x29 white PNG
function getDefaultIcon() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWk2cPAAAAIUlEQVRIS2NkYGD4z0A5YBw1lOaGEgCjqZSmhgyFoQQAKJYAAfHEITQAAAAASUVORK5CYII=','base64');
}

module.exports = { generatePkpass, generateSmartQRPass, triggerPassUpdate, buildPassJson };
