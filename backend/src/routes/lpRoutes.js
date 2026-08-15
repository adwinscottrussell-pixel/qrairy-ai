const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { requireStaffSession } = require('../utils/staffSession');
const router  = express.Router();
const { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleLoyaltyCardPage, handleGetNFCToken, handleGenerateAppleWalletPass, handleUploadLogo, handleUploadStrip, handleChatLP, handleSendPush, handlePushClickResolve, handlePushCount, handlePushHistory, handleWebPushSubscribe, handleWebPushVapidKey, handleSubscribe, handleUnsubscribe, handleConfirmEmail,
  handleStamp, handleStampConfirm, handleScannerPreview, handleRedeemTap, handleRedeemTapConfirm, handleCustomerStamp, handleGetStampToken, handleStampSettings, handleGetStampSettings,
  handleLoyaltyWelcome,
  handleLPManifest,
  handleSetStaffPin, handleGetStaffPinStatus, handleVerifyStaffPin, handleRemoveStaffPin,
} = require('../controllers/lpController');

// Apple Wallet pass download (must be before /lp/:slug)
router.get('/lp/nfc-token/:slug', handleGetNFCToken);
router.get('/lp/card/:slug', handleLoyaltyCardPage);
router.get('/lp/wallet/apple/:slug', handleGenerateAppleWalletPass);

// Business logo upload (Brand Center) — image only, 5MB cap, memory storage
// (no temp files on disk — buffer goes straight to Cloudinary).
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
  }
});
router.post('/lp/upload-logo/:slug', requireAuth, (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadLogo);

// Wallet hero/strip photo upload — optional, shown as the banner inside the
// Apple Wallet pass in place of the generated gradient. Same constraints
// as the logo upload.
const stripUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
  }
});
router.post('/lp/upload-strip/:slug', requireAuth, (req, res, next) => {
  stripUpload.single('strip')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, handleUploadStrip);

// Google Wallet save URL
router.get('/lp/wallet/google/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const prisma = require('../utils/prismaClient');
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    const sections = Object.assign({}, page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {}, { businessName: page.businessName });
    const { createGoogleWalletSaveUrl } = require('../services/googleWalletService');
    const cid = req.query.cid || null;
    if (cid) {
      try {
        await prisma.loyaltyCustomer.upsert({
          where: { slug_customerId: { slug, customerId: cid } },
          create: { slug, customerId: cid, hasWallet: true },
          update: { hasWallet: true }
        });
      } catch (_we) { console.error('[Google Wallet] LoyaltyCustomer upsert error:', _we.message); }
    }
    const saveUrl = await createGoogleWalletSaveUrl(slug, sections, cid);
    return res.redirect(302, saveUrl);
  } catch (err) {
    console.error('[Google Wallet]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Premium hero banner for Google Wallet's heroImage (Google fetches images by
// URL, it can't accept inline bytes the way Apple's pkpass bundle can).
router.get('/lp/wallet-hero/:slug', (req, res) => {
  try {
    const { renderHeroBanner } = require('../services/walletThemes');
    const accent = (req.query.c && /^#?[0-9a-fA-F]{6}$/.test(req.query.c)) ? req.query.c : '#ff5a1f';
    const png = renderHeroBanner(accent, { width: 1032, height: 336 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    return res.send(png);
  } catch (err) {
    console.error('[Wallet Hero]', err.message);
    return res.status(500).send();
  }
});

// Loyalty stamp (public — no auth — QR and NFC target, customer-facing.
// Deliberately untouched by the staff-session requirement below: a
// customer tapping their own physical NFC tag has no staff PIN and must
// not need one.)
router.get('/stamp/:slug/:token', handleStamp);
router.post('/stamp/:slug/:token/confirm', handleStampConfirm);
// Staff-scanner read-only preview — now requires a valid staff-session
// token (X-Staff-Token header, minted by a successful /verify above).
// This route has no customer-facing use, so it's safe to gate directly
// rather than fork a separate path.
router.get('/scanner/:slug/preview', requireStaffSession, handleScannerPreview);
// Staff-only stamp/redeem — same handlers as the public customer routes
// above (handleStampConfirm/handleRedeemTapConfirm read :slug/:token/cid
// identically either way), reached via a separate path so the shared
// public customer routes never need a staff-session check. This is the
// smallest safe separation: no controller logic duplicated, no change to
// customer NFC behavior, staff scanner calls these instead of the public
// ones and must present a valid staff-session token to reach them.
router.post('/scanner/:slug/:token/stamp', requireStaffSession, handleStampConfirm);
router.post('/scanner/:slug/:token/redeem', requireStaffSession, handleRedeemTapConfirm);
// Loyalty redeem (public — no auth — second physical NFC tag, same token as stamp)
router.get('/redeem/:slug/:token', handleRedeemTap);
router.post('/redeem/:slug/:token/confirm', handleRedeemTapConfirm);
// Stamp dashboard API (auth required via frontend)
router.get('/lp/stamp/token/:slug', handleGetStampToken);
router.post('/lp/stamp/settings/:slug', handleStampSettings);
router.get('/lp/stamp/settings/:slug', handleGetStampSettings);
// Serve live landing page (public — no auth)
router.post('/stamp/:slug/customer', handleCustomerStamp); // per-customer stamp
router.get('/lp/welcome/:slug', handleLoyaltyWelcome); // First-visit enrollment
router.get('/manifest/:slug', handleLPManifest);
router.get('/lp/:slug', handleServeLP);
// AI chat endpoint
router.post('/lp/chat', handleChatLP);
// Push notification endpoint
router.post('/lp/push/:slug', requireAuth, handleSendPush);
// Same-origin redirect resolver for notification clicks — public, no auth
// (called directly by a customer's browser from push-open.html).
router.get('/push/click/:id', handlePushClickResolve);
router.get('/lp/push/:slug/count', handlePushCount);
router.get('/lp/push/:slug/history', handlePushHistory);
router.post('/lp/webpush/subscribe/:slug', handleWebPushSubscribe);
router.get('/lp/webpush/vapid-key/:slug', handleWebPushVapidKey);
router.post('/lp/subscribe/:slug', handleSubscribe);
// Email Unsubscribe Phase A (2026-08-12): public, no auth — the recipient
// of a campaign email has no QRAIVY account to log into. Safety comes
// from the signed token (see unsubscribeToken.js), verified inside the
// handler before anything is read or written.
router.get('/lp/unsubscribe/:slug/:subscriberId', handleUnsubscribe);
// Double Opt-In Phase B1 (2026-08-12): public, no auth — same reasoning as
// the unsubscribe route above. Safety comes from the signed, expiring
// token (see doubleOptInToken.js), verified before anything is read or
// written.
router.get('/lp/confirm-email/:slug/:subscriberId', handleConfirmEmail);
// P0 SECURITY FIX (2026-08-11): GET /lp/subscribers/:slug removed — see
// the comment left in lpController.js at the former handleGetSubscribers
// location for details. Confirmed dead (zero callers repo-wide) before
// removal; the authenticated, masked equivalents are
// /loyalty/subscribers/summary and /loyalty/subscribers/:slug/detail.
// Staff PIN — set/change (owner auth), remove (owner auth), status (no
// auth, existence check only), verify (no auth, validates an entered PIN
// and mints a staff-session token on success)
router.post('/lp/staff-pin/:slug', requireAuth, handleSetStaffPin);
router.delete('/lp/staff-pin/:slug', requireAuth, handleRemoveStaffPin);
router.get('/lp/staff-pin/:slug/status', handleGetStaffPinStatus);
router.post('/lp/staff-pin/:slug/verify', handleVerifyStaffPin);

// API: publish a new landing page
router.post('/lp', handlePublishLP);
router.delete('/lp/:slug', handleDeleteLP);
// API: get single landing page data (for dashboard)
router.get('/api/lp/:slug', handleGetLP);
// API: list user's landing pages
router.get('/api/lp', handleListLPs);
module.exports = router;
