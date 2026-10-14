// dealController.js — QRAIVY Deals, Phase C1.
//
// Thin HTTP layer only. Validation, ownership and the draft/publish/
// archive lifecycle all live in services/dealService.js -- never
// duplicated here.
//
// Tenant scope: every handler reads req.userId (set by requireAuth from
// the verified Clerk JWT) and passes it as ownerUserId into the service.
// No handler ever trusts a deal id supplied by the caller as proof of
// ownership; a deal that belongs to someone else answers 404, exactly
// like one that does not exist.

const dealService = require('../services/dealService');
const { uploadDealImage, isDealImageStorageConfigured } = require('../services/dealImageUploadService');

// A DealError carries a message written for the caller and its own
// status. Anything else is unexpected: logged, and answered without
// detail.
function fail(res, err, action) {
  if (err instanceof dealService.DealError) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  console.error(`[DealAPI] ${action} error:`, err && err.message);
  return res.status(500).json({ error: `Failed to ${action}.` });
}

async function listDeals(req, res) {
  try {
    const deals = await dealService.listDeals(req.userId, { status: req.query.status || undefined });
    return res.json({ deals });
  } catch (e) { return fail(res, e, 'load deals'); }
}

async function createDeal(req, res) {
  try {
    const deal = await dealService.createDealDraft(req.userId, req.body);
    return res.status(201).json({ deal });
  } catch (e) { return fail(res, e, 'create the deal'); }
}

async function getDeal(req, res) {
  try {
    const deal = await dealService.getDealState(req.userId, req.params.id);
    return res.json({ deal });
  } catch (e) { return fail(res, e, 'load the deal'); }
}

async function saveDealDraft(req, res) {
  try {
    const deal = await dealService.saveDealDraft(req.userId, req.params.id, req.body);
    return res.json({ deal });
  } catch (e) { return fail(res, e, 'save the deal'); }
}

async function publishDeal(req, res) {
  try {
    const deal = await dealService.publishDeal(req.userId, req.params.id);
    return res.json({ deal });
  } catch (e) { return fail(res, e, 'publish the deal'); }
}

async function archiveDeal(req, res) {
  try {
    const deal = await dealService.archiveDeal(req.userId, req.params.id);
    return res.json({ deal });
  } catch (e) { return fail(res, e, 'archive the deal'); }
}

async function deleteDeal(req, res) {
  try {
    const result = await dealService.deleteDeal(req.userId, req.params.id);
    return res.json(result);
  } catch (e) { return fail(res, e, 'delete the deal'); }
}

// Ownership is proven BEFORE anything is sent to storage, and the stored
// picture is attached through saveDealDraft -- so it passes the same
// image validation as any other draft edit and lands in the draft, never
// straight on a published deal.
async function uploadDealImageHandler(req, res) {
  try {
    await dealService.getDealState(req.userId, req.params.id);
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image file was sent.' });
    }
    if (!isDealImageStorageConfigured()) {
      return res.status(503).json({ error: 'Image storage is not available right now.' });
    }
    let stored;
    try {
      stored = await uploadDealImage(req.file.buffer, req.params.id);
    } catch (e) {
      console.error('[DealAPI] image storage error:', e && e.message);
      return res.status(502).json({ error: 'The image could not be stored. Please try again.' });
    }
    const deal = await dealService.saveDealDraft(req.userId, req.params.id, {
      image: { source: 'uploaded', url: stored.secure_url, publicId: stored.public_id, width: stored.width, height: stored.height },
    });
    return res.json({ deal });
  } catch (e) { return fail(res, e, 'upload the image'); }
}

module.exports = {
  listDeals,
  createDeal,
  getDeal,
  saveDealDraft,
  publishDeal,
  archiveDeal,
  deleteDeal,
  uploadDealImage: uploadDealImageHandler,
};
