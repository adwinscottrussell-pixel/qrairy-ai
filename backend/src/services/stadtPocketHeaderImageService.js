// ============================================================
// stadtPocketHeaderImageService.js — Phase 6D.2.
//
// Uploads a StadtPocket business's header/hero image to Cloudinary.
// Reuses the same Cloudinary account/config already used by
// logoUploadService.js / stripUploadService.js -- no second media
// provider introduced.
//
// Deliberately DOES NOT reuse those two files' overwrite:true,
// one-fixed-public_id-per-slug pattern. That pattern replaces the SAME
// Cloudinary object in place, which is exactly wrong here: uploading a
// new DRAFT header image must never destroy or alter the currently
// PUBLISHED image (see the schema comment on StadtPocketListing.
// headerImage, and the Phase 6D.2 task's Draft/Publish rule). Instead,
// every upload gets its own genuinely unique public_id
// (listingId + timestamp + random suffix) with overwrite:false, so a
// draft upload and the still-live published image are simply two
// independent Cloudinary assets -- Cloudinary itself never needs to
// know which one is "published"; only the database (StadtPocketListing.
// draftData.headerImage vs .headerImage) decides that, exactly like
// every other field.
//
// Orphan cleanup (deleting the OLD published asset once a new one is
// actually published and nothing else references the old one) is
// deliberately NOT implemented here. Data safety first: it is safer to
// temporarily accumulate an unused Cloudinary asset than to risk
// destroying one still referenced by a draft, a not-yet-refreshed cache,
// or a race with a concurrent edit. This is a known, accepted deferral,
// not an oversight -- see the Phase 6D.2 report.
// ============================================================

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FOLDER = 'stadtpocket-headers';

function buildUniquePublicId(listingId) {
  return `${listingId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// buffer: raw image bytes (already validated for mimetype/size by the
// route's multer config before this is ever called). listingId: the
// StadtPocketListing this header image belongs to -- used only to make
// the public_id traceable/organized, never trusted as an authorization
// check by itself (the route re-derives real authorization separately,
// server-side, before calling this).
async function uploadStadtPocketHeaderImage(buffer, listingId) {
  const publicId = buildUniquePublicId(listingId);
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: FOLDER, public_id: publicId, overwrite: false },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    uploadStream.end(buffer);
  });
}

// Non-destructive Cloudinary delivery-time transformation -- the
// ORIGINAL uploaded asset is never modified or re-uploaded; this only
// builds a derived URL that requests a landscape (~16:9), content-aware-
// cropped ("cover" behavior, no distortion), auto-format/auto-quality
// version of the SAME asset at render time. Used consistently by both
// the admin preview (draft and published) and documented as the future
// public-consumption contract (see the Phase 6D.2 report's Part 14) --
// one shared rule, not two competing crop behaviors.
function buildHeaderImageDisplayUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace('/upload/', '/upload/c_fill,g_auto,ar_16:9,q_auto,f_auto/');
}

// Defense-in-depth check used by stadtpocketManagerService.validateDraftPayload
// -- confirms a client-supplied headerImage.url/publicId pair genuinely
// points at OUR Cloudinary cloud + our own upload folder + is internally
// consistent (the publicId actually appears in the url), so an arbitrary
// externally-hosted image can never be injected through the generic
// saveDraft field path and presented as if it were a real StadtPocket
// upload. Not a live Cloudinary API existence check (that would add a
// network round-trip to every draft save for marginal benefit) -- a
// shape/origin check, same cost class as this file's other validators.
function isTrustedStadtPocketHeaderImage(url, publicId) {
  if (typeof url !== 'string' || typeof publicId !== 'string' || !publicId) return false;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  const expectedHost = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(expectedHost)) return false;
  if (!publicId.startsWith(`${FOLDER}/`) && !url.includes(`/${FOLDER}/`)) return false;
  return url.includes(publicId);
}

module.exports = { uploadStadtPocketHeaderImage, buildHeaderImageDisplayUrl, isTrustedStadtPocketHeaderImage, FOLDER };
