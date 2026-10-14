const { v2: cloudinary } = require('cloudinary');
const { ACTIVE_DEAL_IMAGE_FOLDER } = require('../data/dealImages');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Deal image upload — same Cloudinary pattern as logoUploadService.js,
// into its own folder (ACTIVE_DEAL_IMAGE_FOLDER: production's qraivy-deals,
// or a staging server's DEAL_IMAGE_FOLDER), which is also what
// dealService.isTrustedDealImage() requires of any uploaded deal image.
// A staging server without its own folder has no storage: uploads answer 503.
//
// The upload is stored as a MASTER: the whole picture, uncropped, only
// limited to DEAL_MASTER_MAX_EDGE px on its longest side. Every deal screen
// keeps showing the same 1200x900 (4:3) picture as before; it is now a
// delivery URL of the master (Cloudinary crops it on request, focusing on
// the main subject) instead of the only copy. Later formats (4:5, 9:16,
// 1:1) can be derived from the same master without another upload.
// Uploads made before this change were stored as the 4:3 crop only; they
// have no master and stay exactly as they are.
// Each upload gets its own public_id (never overwrite: true): a published
// deal keeps pointing at the picture it was published with while a newer
// one sits in the draft.
const DEAL_DISPLAY_SIZE = Object.freeze({ width: 1200, height: 900 });
// The 4:3 picture, once as upload options and once as it appears in the URL.
// Cloudinary writes DEAL_DISPLAY_EAGER exactly as DEAL_DISPLAY_TRANSFORMATION
// (tests/dealImageMaster.test.js checks this with the real SDK), so the eager
// copy made during the upload is the very file the deal screens request --
// it exists before anyone views it, also on an account that only serves
// transformations created in advance ("strict transformations").
const DEAL_DISPLAY_EAGER = Object.freeze({ width: 1200, height: 900, crop: 'fill', gravity: 'auto' });
const DEAL_DISPLAY_TRANSFORMATION = 'c_fill,g_auto,h_900,w_1200';
const DEAL_MASTER_MAX_EDGE = 3000;

// The 4:3 picture every deal screen shows, as a delivery URL of the master.
function buildDealDisplayUrl(cloudName, publicId, version, format) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${DEAL_DISPLAY_TRANSFORMATION}/${version ? 'v' + version + '/' : ''}${publicId}.${format}`;
}

function isDealImageStorageConfigured() {
  return !!(ACTIVE_DEAL_IMAGE_FOLDER && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

async function uploadDealImage(buffer, dealId) {
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: ACTIVE_DEAL_IMAGE_FOLDER,
        public_id: `deal-${dealId}-${Date.now()}`,
        overwrite: false,
        // Never cropped: only very large pictures are scaled down to fit.
        transformation: [{ width: DEAL_MASTER_MAX_EDGE, height: DEAL_MASTER_MAX_EDGE, crop: 'limit', quality: 'auto:best' }],
        // ...and the 4:3 picture is made from it right away, before the response.
        eager: [{ ...DEAL_DISPLAY_EAGER }],
        eager_async: false,
      },
      (error, r) => { if (error) reject(error); else resolve(r); }
    );
    uploadStream.end(buffer);
  });
  return {
    publicId: result.public_id,
    displayUrl: buildDealDisplayUrl(process.env.CLOUDINARY_CLOUD_NAME, result.public_id, result.version, result.format),
    displayWidth: DEAL_DISPLAY_SIZE.width,
    displayHeight: DEAL_DISPLAY_SIZE.height,
    masterUrl: result.secure_url,
    masterWidth: result.width,
    masterHeight: result.height,
  };
}

module.exports = { uploadDealImage, isDealImageStorageConfigured, buildDealDisplayUrl, DEAL_DISPLAY_SIZE, DEAL_DISPLAY_EAGER, DEAL_DISPLAY_TRANSFORMATION, DEAL_MASTER_MAX_EDGE };
