const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Wallet hero/strip photo upload — same Cloudinary pattern as logoUploadService.
// One stable public_id per slug + overwrite:true means re-uploading a new
// photo replaces the old one at the same URL.
async function uploadStrip(buffer, slug) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'qraivy-wallet-strips', public_id: `strip-${slug}`, overwrite: true },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    uploadStream.end(buffer);
  });
}

module.exports = { uploadStrip };
