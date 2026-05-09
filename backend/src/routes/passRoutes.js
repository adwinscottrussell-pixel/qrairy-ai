// ============================================================
// passRoutes.js
// ============================================================
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/planGate');
const {
  handleCreatePass,
  handleUpdatePass,
  handleDownloadPass,
  handleListPasses,
  handleGetPass,
  handleDeletePass,
  handleUploadAsset,
} = require('../controllers/passController');

router.get('/list',           requireAuth,                         handleListPasses);
router.get('/:id',            requireAuth,                         handleGetPass);
router.post('/create',        requireAuth, requirePlan('walletPasses'), handleCreatePass);
router.put('/:id',            requireAuth,                         handleUpdatePass);
router.delete('/:id',         requireAuth,                         handleDeletePass);
router.get('/download/:id',                                        handleDownloadPass);
router.post('/:id/asset',     requireAuth,                         handleUploadAsset);

module.exports = router;
