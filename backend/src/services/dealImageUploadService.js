const { v2: cloudinary } = require('cloudinary');
const { DEAL_IMAGE_FOLDER } = require('../data/dealImages');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Deal image upload — same Cloudinary pattern as logoUploadService.js,
// into its own folder (DEAL_IMAGE_FOLDER), which is also what
// dealService.isTrustedDealImage() requires of any uploaded deal image.
//
// Stored as 1200x900 (4:3), the format every deal image is shown in:
// larger pictures are cropped to fill, smaller ones are never upscaled.
// Each upload gets its own public_id (never overwrite: true): a published
// deal keeps pointing at the picture it was published with while a newer
// one sits in the draft.
function isDealImageStorageConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

async function uploadDealImage(buffer, dealId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: DEAL_IMAGE_FOLDER,
        public_id: `deal-${dealId}-${Date.now()}`,
        overwrite: false,
        transformation: [{ width: 1200, height: 900, crop: 'fill', gravity: 'auto' }],
      },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    uploadStream.end(buffer);
  });
}

module.exports = { uploadDealImage, isDealImageStorageConfigured };
