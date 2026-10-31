const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { publicDraftGuard } = require('../middleware/publicDraftGuard');
const router  = express.Router();
// Studio V3 drafts are private (Phase D1): every signed-out route below that
// works with a page's slug answers 404 for a draft (middleware/publicDraftGuard.js).
// Not guarded, on purpose: GET /lp/:slug (handleServeLP answers 404 for a
// draft itself and never caches one), GET /lp/wallet-hero/:slug (reads no
// page), POST /lp (refuses drafts itself), and the signed-in owner routes.
const draft = publicDraftGuard();
const { handleVoicePreview } = require('../controllers/lpVoiceController');
const { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleLoyaltyCardPage, handleGetNFCToken, handleGenerateAppleWalletPass, handleUploadLogo, handleUploadStrip, handleChatLP, handleSendPush, handlePushCount, handlePushHistory, handleWebPushSubscribe, handleWebPushUnsubscribe, handleWebPushVapidKey, handleSubscribe, handleGetSubscribers,
  handleStamp, handleStampConfirm, handleRedeemTap, handleRedeemTapConfirm, handleCustomerStamp, handleGetStampToken, handleStampSettings, handleGetStampSettings,
  handleLoyaltyWelcome,
  handleLPManifest,
  handleSetStaffPin, handleGetStaffPinStatus, handleVerifyStaffPin,
} = require('../controllers/lpController');

// Apple Wallet pass download (must be before /lp/:slug)
router.get('/lp/nfc-token/:slug', draft, handleGetNFCToken);
router.get('/lp/card/:slug', draft, handleLoyaltyCardPage);
router.get('/lp/wallet/apple/:slug', draft, handleGenerateAppleWalletPass);

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
router.get('/lp/wallet/google/:slug', draft, async (req, res) => {
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
    const saveUrl = await createGoogleWalletSaveUrl(slug, sections, cid, page.businessId || null);
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

// Loyalty stamp (public — no auth — QR and NFC target)
router.get('/stamp/:slug/:token', draft, handleStamp);
router.post('/stamp/:slug/:token/confirm', draft, handleStampConfirm);
// Loyalty redeem (public — no auth — second physical NFC tag, same token as stamp)
router.get('/redeem/:slug/:token', draft, handleRedeemTap);
router.post('/redeem/:slug/:token/confirm', draft, handleRedeemTapConfirm);
// Stamp dashboard API (auth required via frontend)
router.get('/lp/stamp/token/:slug', draft, handleGetStampToken);
// Security hotfix: writing a program's loyalty settings requires the
// landing page's authenticated owner (requireAuth here + owner check in
// handleStampSettings) -- previously this accepted anonymous writes.
router.post('/lp/stamp/settings/:slug', requireAuth, handleStampSettings);
router.get('/lp/stamp/settings/:slug', draft, handleGetStampSettings);
// Serve live landing page (public — no auth)
router.post('/stamp/:slug/customer', draft, handleCustomerStamp); // per-customer stamp
router.get('/lp/welcome/:slug', draft, handleLoyaltyWelcome); // First-visit enrollment
router.get('/manifest/:slug', draft, handleLPManifest);
router.get('/lp/:slug', handleServeLP);
// AI chat endpoint
router.post('/lp/chat', publicDraftGuard((req) => req.body && req.body.slug), handleChatLP);
// Push notification endpoint
// Voice tab of the editor: listen to the greeting before publishing.
router.post('/lp/voice/preview/:slug', requireAuth, handleVoicePreview);
router.post('/lp/push/:slug', requireAuth, handleSendPush);
// The page's own account only (handlers check ownership): device counts and
// campaign texts are that business's data.
router.get('/lp/push/:slug/count', requireAuth, handlePushCount);
router.get('/lp/push/:slug/history', requireAuth, handlePushHistory);
router.post('/lp/webpush/subscribe/:slug', draft, handleWebPushSubscribe);
router.post('/lp/webpush/unsubscribe/:slug', draft, handleWebPushUnsubscribe);
router.get('/lp/webpush/vapid-key/:slug', draft, handleWebPushVapidKey);
router.post('/lp/subscribe/:slug', draft, handleSubscribe);
// The page's own account only (the handler checks ownership): subscriber emails.
router.get('/lp/subscribers/:slug', requireAuth, handleGetSubscribers);
// Staff PIN — set (owner auth), status (no auth, existence check only),
// verify (no auth, validates an entered PIN)
router.post('/lp/staff-pin/:slug', requireAuth, handleSetStaffPin);
router.get('/lp/staff-pin/:slug/status', draft, handleGetStaffPinStatus);
router.post('/lp/staff-pin/:slug/verify', draft, handleVerifyStaffPin);

// API: publish a new landing page
router.post('/lp', handlePublishLP);
router.delete('/lp/:slug', handleDeleteLP);
// API: get single landing page data (for dashboard)
router.get('/api/lp/:slug', handleGetLP);
// API: list user's landing pages
router.get('/api/lp', handleListLPs);
module.exports = router;
