// dealRoutes.js — QRAIVY Deals, Phase C1. Mounted at /deals.
// All endpoints owner-scoped via requireAuth (Clerk JWT), same convention
// as customerRoutes.js. There is deliberately no public (unauthenticated)
// route here: nothing in this file makes a deal visible to a customer.

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireDealAccess } = require('../services/dealAccess');
const { throttleDealUploads } = require('../services/dealUploadLimiter');
const {
  listDeals,
  createDeal,
  getDeal,
  saveDealDraft,
  publishDeal,
  archiveDeal,
  deleteDeal,
  uploadDealImage,
  listPlacements,
  addPlacement,
  publishPlacement,
  archivePlacement,
  listPages,
} = require('../controllers/dealController');

// Deal image upload — image only, 5MB cap, memory storage (no temp files
// on disk -- the buffer goes straight to Cloudinary). Same constraints as
// the logo upload in lpRoutes.js.
const dealImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed.'));
  }
});

// Access (services/dealAccess.js: rollout + plan) is required to create,
// upload, publish and place. Viewing, saving drafts, archiving, deleting
// and removing a placement only need sign-in + ownership, so an owner who
// lost access can still look after existing deals.
const dealAccess = requireDealAccess();
const uploadThrottle = throttleDealUploads();

router.get('/', requireAuth, listDeals);
// before '/:id', so "pages" is never read as a deal id
router.get('/pages', requireAuth, listPages);
router.post('/', requireAuth, dealAccess, createDeal);
router.get('/:id', requireAuth, getDeal);
router.put('/:id/draft', requireAuth, saveDealDraft);
router.post('/:id/publish', requireAuth, dealAccess, publishDeal);
router.post('/:id/archive', requireAuth, archiveDeal);
router.delete('/:id', requireAuth, deleteDeal);
// Placements: where a deal appears. Every target page must belong to the owner.
router.get('/:id/placements', requireAuth, listPlacements);
router.post('/:id/placements', requireAuth, dealAccess, addPlacement);
router.post('/:id/placements/:placementId/publish', requireAuth, dealAccess, publishPlacement);
router.post('/:id/placements/:placementId/archive', requireAuth, archivePlacement);
// requireAuth, the access check and the upload limit (20/hour, 60/day per
// account; services/dealUploadLimiter.js) all run BEFORE multer parses the
// upload, so a refused request is rejected without its body ever being read
// into memory or sent to storage.
router.post('/:id/image', requireAuth, dealAccess, uploadThrottle, (req, res, next) => {
  dealImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The image is larger than 5 MB.' : (err.message || 'Upload failed') });
    next();
  });
}, uploadDealImage);

module.exports = router;
