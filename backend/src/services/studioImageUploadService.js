/**
 * studioImageUploadService.js — Landing Page Studio V3 image uploads
 * (Image Phase 1). The Deals pattern (dealImageUploadService.js), in the
 * Studio's own tenant-bound folder:
 *
 *   <folder>/<userId>/<pageId>/img-<ms>-<hex>   (data/studioImages.js)
 *
 * - the buffer is streamed from memory straight to Cloudinary, resource
 *   type image only; nothing is written to disk
 * - every upload gets its own public id, overwrite: false, so an older draft
 *   keeps pointing at the picture it was saved with (never the legacy
 *   logo/strip pattern of one fixed id per page)
 * - stored as a MASTER: the whole picture, never cropped, only limited to
 *   STUDIO_MASTER_MAX_EDGE px on its longest side
 * - plus one display-ready derivative made during the upload (eager, so it
 *   exists before anyone views it, also with strict transformations):
 *   at most STUDIO_DISPLAY_MAX_EDGE px on the longest side, proportions kept;
 *   the sections crop it with CSS as they already do
 * - the file's content must really be JPEG, PNG or WebP (signature check),
 *   not only the type the browser declares
 *
 * Errors are StudioImageError with a code for the browser; Cloudinary's own
 * messages are only logged by the caller, never returned.
 */
'use strict';
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { ACTIVE_STUDIO_IMAGE_FOLDER, pageImageFolder } = require('../data/studioImages');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const STUDIO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const STUDIO_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const STUDIO_MASTER_MAX_EDGE = 3000;
const STUDIO_DISPLAY_MAX_EDGE = 1600;
// The display derivative, once as upload option and once as it appears in the
// URL (the SDK writes the eager option exactly as this string; tests check it).
const STUDIO_DISPLAY_EAGER = Object.freeze({ width: STUDIO_DISPLAY_MAX_EDGE, height: STUDIO_DISPLAY_MAX_EDGE, crop: 'limit' });
const STUDIO_DISPLAY_TRANSFORMATION = 'c_limit,h_' + STUDIO_DISPLAY_MAX_EDGE + ',w_' + STUDIO_DISPLAY_MAX_EDGE;
const FORMATS = Object.freeze(['jpg', 'png', 'webp']);

class StudioImageError extends Error {
  constructor(code, status, message) { super(message || code); this.code = code; this.status = status; }
}

// image/jpg is what some browsers send for JPEG
function normalType(mimetype) {
  const t = String(mimetype || '').toLowerCase();
  return t === 'image/jpg' ? 'image/jpeg' : t;
}
// The type the file's first bytes say it is, or null.
function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
// Throws unless the declared type is allowed AND the content is that type.
function checkImageFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new StudioImageError('no_file', 400, 'No image file was sent.');
  if (file.buffer.length > STUDIO_IMAGE_MAX_BYTES) throw new StudioImageError('file_too_large', 413, 'The image is larger than 5 MB.');
  const declared = normalType(file.mimetype);
  const actual = sniffImageType(file.buffer);
  if (!STUDIO_IMAGE_TYPES.includes(declared) || !actual || actual !== declared) {
    throw new StudioImageError('unsupported_type', 415, 'Only JPEG, PNG and WebP images are allowed.');
  }
  return actual;
}

function isStudioImageStorageConfigured() {
  return !!(ACTIVE_STUDIO_IMAGE_FOLDER && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function buildStudioDisplayUrl(cloudName, publicId, version, format) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${STUDIO_DISPLAY_TRANSFORMATION}/${version ? 'v' + version + '/' : ''}${publicId}.${format}`;
}

function newImageName() { return 'img-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'); }

// -> { publicId, url (display), width, height, master: { url, width, height }, bytes, format }
async function uploadStudioImage(buffer, { userId, pageId }) {
  const folder = pageImageFolder(userId, pageId);
  if (!folder) throw new StudioImageError('storage_unavailable', 503, 'Image storage is not available right now.');
  const name = newImageName();
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        public_id: name,
        overwrite: false,
        unique_filename: false,
        allowed_formats: FORMATS.slice(),
        transformation: [{ width: STUDIO_MASTER_MAX_EDGE, height: STUDIO_MASTER_MAX_EDGE, crop: 'limit', quality: 'auto:best' }],
        eager: [{ ...STUDIO_DISPLAY_EAGER }],
        eager_async: false,
        // Tags only: Cloudinary's folder Contributor role allows tags during upload, but contextual
        // metadata needs the broader Editor role (Image Phase 1.1). Owner and page are already the
        // public id's path (<folder>/<userId>/<pageId>/…), so no context is sent.
        tags: ['qraivy_studio_upload'],
      },
      (error, r) => { if (error) reject(error); else resolve(r); }
    );
    stream.end(buffer);
  });
  // The stored asset must be exactly the one asked for (fixed-folder public ids)
  // and an image in an allowed format; anything else is treated as a failure.
  const expected = folder + '/' + name;
  if (!result || result.public_id !== expected || !FORMATS.includes(result.format) || result.resource_type !== 'image') {
    throw new StudioImageError('storage_failed', 502, 'The image could not be stored. Please try again.');
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const scale = Math.min(1, STUDIO_DISPLAY_MAX_EDGE / Math.max(result.width || 1, result.height || 1));
  return {
    publicId: result.public_id,
    url: buildStudioDisplayUrl(cloud, result.public_id, result.version, result.format),
    width: Math.round((result.width || 0) * scale),
    height: Math.round((result.height || 0) * scale),
    master: { url: result.secure_url, width: result.width, height: result.height },
    bytes: result.bytes,
    format: result.format,
  };
}

module.exports = {
  StudioImageError,
  uploadStudioImage,
  isStudioImageStorageConfigured,
  buildStudioDisplayUrl,
  checkImageFile,
  sniffImageType,
  STUDIO_IMAGE_MAX_BYTES,
  STUDIO_IMAGE_TYPES,
  STUDIO_MASTER_MAX_EDGE,
  STUDIO_DISPLAY_MAX_EDGE,
  STUDIO_DISPLAY_EAGER,
  STUDIO_DISPLAY_TRANSFORMATION,
};
