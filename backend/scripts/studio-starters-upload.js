#!/usr/bin/env node
/**
 * studio-starters-upload.js — puts the two approved Studio starter Hero
 * photos where the onboarding templates already point (Image Phase 1).
 * ─────────────────────────────────────────────────────────────
 * The Creator and Professional Services templates store
 *   https://res.cloudinary.com/dwqc6n7rn/image/upload/c_limit,w_1200,f_auto,q_auto/qraivy-studio-starters/<id>.jpg
 * in every draft made from them (js/studio/onboarding-templates.js
 * imageUrl), but the two assets were never uploaded: the address answered
 * 404 and only the Studio's local copies (studio-demo-images.js) hid it.
 * This uploads exactly the approved web copies from
 * frontend/public/images/studio/starter/ (checked against the SHA-256 the
 * templates record) as qraivy-studio-starters/<id>, never overwriting an
 * asset that is already there. No template, draft or design changes.
 *
 *   node scripts/studio-starters-upload.js            dry run: checks the files, says what it would do
 *   node scripts/studio-starters-upload.js --verify   checks the public addresses only (no credentials)
 *   node scripts/studio-starters-upload.js --apply    uploads (needs CLOUDINARY_CLOUD_NAME=dwqc6n7rn,
 *                                                     CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET), then verifies
 *
 * Run by hand only, once, with production's Cloudinary credentials; the
 * credentials are read from the environment and never printed.
 * ─────────────────────────────────────────────────────────────
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const T = require(path.join(PUB, 'js', 'studio', 'onboarding-templates.js'));
const CLOUD = 'dwqc6n7rn';
const FOLDER = 'qraivy-studio-starters';

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// The approved files, checked: { id, file, buffer, url }
function approvedFiles() {
  return T.STUDIO_IMAGES.map((i) => {
    const buffer = fs.readFileSync(path.join(PUB, i.file));
    if (sha256(buffer) !== i.sha256) throw new Error(i.id + ': the file is not the approved web copy (SHA-256 differs). Nothing uploaded.');
    const url = T.imageUrl(i.id);
    if (url !== `https://res.cloudinary.com/${CLOUD}/image/upload/c_limit,w_1200,f_auto,q_auto/${FOLDER}/${i.id}.jpg`) throw new Error(i.id + ': unexpected template address ' + url);
    return { id: i.id, file: i.file, buffer, url, origin: i.origin };
  });
}

async function verify(files) {
  let ok = true;
  for (const f of files) {
    const r = await fetch(f.url, { method: 'GET', redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    const good = r.status === 200 && /^image\//.test(type);
    if (!good) ok = false;
    console.log(`${good ? 'OK  ' : 'FAIL'} ${r.status} ${type || '-'}  ${f.url}`);
  }
  return ok;
}

async function apply(files) {
  const env = process.env;
  if (env.CLOUDINARY_CLOUD_NAME !== CLOUD) throw new Error('CLOUDINARY_CLOUD_NAME must be ' + CLOUD + ' (the account the templates point at).');
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new Error('CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required.');
  const { v2: cloudinary } = require('cloudinary');
  cloudinary.config({ cloud_name: CLOUD, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  for (const f of files) {
    const r = await new Promise((resolve, reject) => {
      const s = cloudinary.uploader.upload_stream({
        resource_type: 'image', folder: FOLDER, public_id: f.id, overwrite: false, unique_filename: false,
        tags: ['qraivy_studio_starter', 'ai_generated'],
        context: { qraivy_origin: 'ai_generated', qraivy_approved_on: f.origin.approvedOn, qraivy_sha256: sha256(f.buffer) },
      }, (e, x) => (e ? reject(e) : resolve(x)));
      s.end(f.buffer);
    });
    if (r.public_id !== FOLDER + '/' + f.id) throw new Error(f.id + ': stored as an unexpected public id: ' + r.public_id);
    console.log(`${r.existing ? 'already there' : 'uploaded'}: ${r.public_id} (${r.width}x${r.height}, ${r.format})`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const files = approvedFiles();
  console.log('approved web copies (SHA-256 checked):');
  for (const f of files) console.log(`  ${f.id}  ${f.file}  ${f.buffer.length} bytes`);
  if (args.includes('--verify')) { process.exitCode = (await verify(files)) ? 0 : 1; return; }
  if (!args.includes('--apply')) {
    console.log(`\nDRY RUN: would upload each as ${FOLDER}/<id> on cloud ${CLOUD} (overwrite: false), then check:`);
    for (const f of files) console.log('  ' + f.url);
    console.log('\nRun with --apply to upload, --verify to check the addresses.');
    return;
  }
  await apply(files);
  console.log('\nchecking the template addresses:');
  // the CDN may need a moment for a brand-new asset
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (await verify(files)) return;
    if (attempt < 5) await new Promise((r) => setTimeout(r, 5000));
  }
  process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e && e.message); process.exitCode = 1; });
