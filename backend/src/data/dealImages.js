/**
 * dealImages.js — what a QRAIVY deal's image may be.
 * ─────────────────────────────────────────────────────────────
 * A deal image is one of three things, and the server decides which
 * are acceptable -- never the browser:
 *
 *   uploaded    a picture the owner uploaded; stored on Cloudinary in
 *               DEAL_IMAGE_FOLDER by dealImageUploadService.js
 *   starter     one of the catalog images shipped with the frontend
 *               (frontend/public/images/deals/starter/). Only its id is
 *               stored; the file itself is a static asset.
 *   background  one of the plain colour backgrounds, by id.
 *
 * DEAL_STARTER_IMAGES mirrors the ids and origin of
 * frontend/public/js/deal-starter-images.js. The backend is deployed
 * without the frontend folder, so it cannot read that file at runtime;
 * tests/dealRoutes.test.js fails if the two lists ever differ.
 *
 * ORIGIN: `origin` is what dealService stamps onto a stored starter
 * image as `aiGenerated`. It is taken from this list, never from the
 * request, so a client cannot remove the AI disclosure from an
 * AI-generated image. Anything that later shows a deal to a customer
 * must show the "AI · KI-generiert" label whenever aiGenerated is true
 * (EU AI Act Art. 50).
 * ─────────────────────────────────────────────────────────────
 */

// Production's folder. A staging server never uses it: there the folder is
// DEAL_IMAGE_FOLDER from config/stagingPolicy.js, or none (uploads refused).
const DEAL_IMAGE_FOLDER = 'qraivy-deals';

// The folder this server stores and trusts deal uploads in: production's
// without a staging policy, the staging policy's folder (or null) with one.
function dealImageFolderFor(policy) {
  if (!policy) return DEAL_IMAGE_FOLDER;
  return policy.dealImageFolder || null;
}
const ACTIVE_DEAL_IMAGE_FOLDER = dealImageFolderFor(require('../config/stagingPolicy').policy);

const DEAL_STARTER_IMAGES = [
  { id: 'bakery-croissants-01', origin: 'ai_generated' },
  { id: 'bakery-bread-01', origin: 'ai_generated' },
  { id: 'bakery-coffee-01', origin: 'ai_generated' },
  { id: 'restaurant-meal-01', origin: 'ai_generated' },
  { id: 'restaurant-table-01', origin: 'ai_generated' },
  { id: 'restaurant-fresh-01', origin: 'ai_generated' },
  { id: 'fashion-boutique-01', origin: 'ai_generated' },
  { id: 'fashion-rack-01', origin: 'ai_generated' },
  { id: 'fashion-lifestyle-01', origin: 'ai_generated' },
  { id: 'beauty-spa-01', origin: 'ai_generated' },
  { id: 'beauty-skincare-01', origin: 'ai_generated' },
  { id: 'beauty-salon-01', origin: 'ai_generated' },
  { id: 'fitness-gym-01', origin: 'ai_generated' },
  { id: 'fitness-training-01', origin: 'ai_generated' },
  { id: 'fitness-active-01', origin: 'ai_generated' },
  { id: 'general-optician-01', origin: 'ai_generated' },
  { id: 'general-foodtruck-01', origin: 'ai_generated' },
  { id: 'general-flower-01', origin: 'ai_generated' },
  { id: 'travel-greece-01', origin: 'ai_generated' },
  { id: 'travel-maldives-01', origin: 'ai_generated' },
  { id: 'travel-france-01', origin: 'ai_generated' },
  { id: 'travel-turkey-01', origin: 'ai_generated' },
];

// Same ids as BACKGROUNDS in frontend/public/deals.html.
const DEAL_BACKGROUNDS = ['ember', 'sunrise', 'night', 'slate', 'forest', 'ocean', 'plum', 'sand'];

function findDealStarterImage(id) {
  return DEAL_STARTER_IMAGES.find((i) => i.id === id) || null;
}

module.exports = { DEAL_IMAGE_FOLDER, ACTIVE_DEAL_IMAGE_FOLDER, dealImageFolderFor, DEAL_STARTER_IMAGES, DEAL_BACKGROUNDS, findDealStarterImage };
