// StadtPocket Angebote — Phase B.2.1 starter-image library upload.
//
// One-off script: uploads the 18 approved starter images (from the
// externally-provided ZIP stadtpocket_angebote_starter_18_FINAL.zip,
// extracted locally) to the project's EXISTING Cloudinary account,
// into stadtpocket-headers/angebote-starter, using the canonical
// starter id (from the manifest) as a deterministic public_id. Same
// `cloudinary` package + config pattern as
// backend/src/services/stadtPocketHeaderImageService.js -- no new
// storage architecture, no Prisma model, no migration.
//
// SAFETY: before uploading each asset, checks whether that exact
// public_id already exists via cloudinary.api.resource(). If it does,
// this script does NOT overwrite it -- it records the existing asset's
// details (url, bytes, created_at) under "conflicts" in the output file
// and skips that one entry, so nothing already on Cloudinary is ever
// silently destroyed.
//
// Never prints or logs CLOUDINARY_API_SECRET (or any other var's raw
// value) -- only uses it via cloudinary.config().
//
// Usage (from the repo root of this worktree):
//   node backend/scripts/uploadStadtpocketStarterImages.js <path-to-extracted-ZIP-folder>
// The <path-to-extracted-ZIP-folder> must contain:
//   stadtpocket_starter_manifest.json
//   UPLOAD_READY/<18 .jpg files>
// (i.e. point it at the "stadtpocket_angebote_starter_final" folder
// produced by extracting the ZIP.)
//
// Requires CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
// CLOUDINARY_API_SECRET to already be set in the environment this
// script runs in (e.g. via `railway run`, or a local backend/.env
// already loaded by your shell/dotenv) -- this script does not read
// any .env file itself beyond what Node's process.env already has.
//
// Output: writes upload_results.json next to this script, containing
// { uploaded: [...], conflicts: [...] } -- for each uploaded asset:
// starterId, label, category_de, publicId, secure_url, width, height,
// format, bytes. Only real values Cloudinary itself returned, never
// invented.

const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const FOLDER = 'stadtpocket-headers/angebote-starter';
const RESULTS_PATH = path.join(__dirname, 'upload_results.json');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET before running this script (e.g. via `railway run`).');
    process.exit(1);
  }
  return v;
}

const assetsDir = process.argv[2];
if (!assetsDir) {
  console.error('Usage: node uploadStadtpocketStarterImages.js <path-to-extracted-ZIP-folder>');
  process.exit(1);
}
const manifestPath = path.join(assetsDir, 'stadtpocket_starter_manifest.json');
const imagesDir = path.join(assetsDir, 'UPLOAD_READY');
if (!fs.existsSync(manifestPath) || !fs.existsSync(imagesDir)) {
  console.error(`Expected to find both:\n  ${manifestPath}\n  ${imagesDir}\nCheck the folder you passed in.`);
  process.exit(1);
}

cloudinary.config({
  cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
  api_key: requireEnv('CLOUDINARY_API_KEY'),
  api_secret: requireEnv('CLOUDINARY_API_SECRET'),
});

// Replaces any occurrence of the actual API key/secret VALUES with a
// placeholder in any string before it's ever printed -- applied to
// every diagnostic/error field below (name, message, nested message,
// stack), so a secret can never leak even if it ends up embedded in an
// error message or stack trace. Cloud name is not treated as secret
// (Cloudinary's own docs/URLs already expose it publicly).
function redactSecrets(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (key) out = out.split(key).join('[REDACTED_API_KEY]');
  if (secret) out = out.split(secret).join('[REDACTED_API_SECRET]');
  return out;
}

async function existingAsset(publicId) {
  try {
    return await cloudinary.api.resource(publicId, { resource_type: 'image' });
  } catch (err) {
    // Cloudinary's "not found" 404 can come back either as a top-level
    // err.http_code (some SDK/error paths) or nested under
    // err.error.http_code (a raw HTTP-response-body passthrough --
    // same nested shape already handled in the top-level catch below).
    // A 404 here means "no asset at this public_id" -- exactly what
    // existingAsset() should report as null so the caller proceeds to
    // upload; any other status/error must still propagate and stop the
    // script, since it could mean bad credentials, wrong cloud, a
    // network failure, etc., none of which are safe to treat as "does
    // not exist."
    const notFound = (err && err.http_code === 404) || (err && err.error && err.error.http_code === 404);
    if (notFound) return null;
    throw err;
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const results = [];
  const conflicts = [];

  // Temporary safe diagnostic -- shows only non-secret config shape
  // right before the first real Cloudinary call, so a config/path
  // problem is visible without ever printing key/secret values.
  console.log('--- diagnostic ---');
  console.log('assetsDir:', assetsDir);
  console.log('manifestPath:', manifestPath);
  console.log('manifest entries:', manifest.length);
  console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
  console.log('CLOUDINARY_API_KEY present:', !!process.env.CLOUDINARY_API_KEY);
  console.log('CLOUDINARY_API_SECRET present:', !!process.env.CLOUDINARY_API_SECRET);
  console.log('------------------');

  for (const entry of manifest) {
    const publicId = `${FOLDER}/${entry.id}`;
    const filePath = path.join(imagesDir, entry.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`MISSING FILE for ${entry.id}: ${filePath}`);
      process.exitCode = 1;
      continue;
    }

    const existing = await existingAsset(publicId);
    if (existing) {
      console.log(`CONFLICT: ${publicId} already exists -- bytes=${existing.bytes}, created_at=${existing.created_at}`);
      conflicts.push({
        starterId: entry.id, publicId,
        existing: { secure_url: existing.secure_url, bytes: existing.bytes, created_at: existing.created_at, width: existing.width, height: existing.height },
      });
      continue; // never overwrite automatically
    }

    console.log(`Uploading ${entry.id} -> ${publicId} ...`);
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: 'image',
      folder: FOLDER,
      public_id: entry.id,
      overwrite: false,
    });

    const dimsOk = uploadResult.width === 1200 && uploadResult.height === 900;
    if (!dimsOk) {
      console.error(`DIMENSION MISMATCH after upload for ${entry.id}: Cloudinary reports ${uploadResult.width}x${uploadResult.height}, expected 1200x900`);
      process.exitCode = 1;
    }

    results.push({
      starterId: entry.id,
      label: entry.label_de,
      category_de: entry.category_de,
      publicId: uploadResult.public_id,
      secure_url: uploadResult.secure_url,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
    });
    console.log(`  OK: ${uploadResult.width}x${uploadResult.height}, ${uploadResult.bytes} bytes`);
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ uploaded: results, conflicts }, null, 2));
  console.log('');
  console.log(`Uploaded: ${results.length}/${manifest.length}`);
  console.log(`Conflicts (skipped, not overwritten): ${conflicts.length}`);
  console.log(`Results written to ${RESULTS_PATH}`);
  if (conflicts.length) {
    console.log('');
    console.log('CONFLICTS DETECTED -- resolve manually before re-running for those ids:');
    conflicts.forEach((c) => console.log(`  ${c.starterId}: ${c.existing.secure_url}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // Cloudinary SDK rejections aren't always a plain Error with a
  // top-level .message -- some come back as a plain object shaped
  // like { message, http_code } directly, others nest the real text
  // under .error.message (a raw HTTP-response-body passthrough). This
  // checks every shape so the real cause is visible instead of the
  // unhelpful "undefined" a bare err.message read previously produced
  // when the top-level field didn't exist.
  console.error('Upload script failed. Diagnostic:');
  console.error('  err is null/undefined:', err == null);
  if (err != null) {
    console.error('  name:', redactSecrets(err.name));
    console.error('  message:', redactSecrets(err.message));
    console.error('  http_code:', err.http_code);
    console.error('  code:', err.code);
    if (err.error && typeof err.error === 'object') {
      console.error('  error.message (nested):', redactSecrets(err.error.message));
      console.error('  error.http_code (nested):', err.error.http_code);
    }
    if (err.stack) {
      console.error('  stack (redacted):');
      console.error(redactSecrets(err.stack));
    }
  }
  process.exit(1);
});
