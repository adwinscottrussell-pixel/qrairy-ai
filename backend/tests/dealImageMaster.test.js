// ============================================================
// dealImageMaster.test.js — Deals image Phase 1: every NEW upload is kept
// as an uncropped master, while every deal screen keeps showing the same
// 1200x900 (4:3) picture.
//
//   A. upload service: what is sent to Cloudinary (no crop, size limit,
//      same folder / naming / no overwrite) and what it returns
//   B. Deal Builder: the master travels through load and save unchanged
//   C. unchanged: starter images, their catalog, the 4:3 screens
//
// Cloudinary is replaced by a stand-in: nothing is uploaded.
// Run: node tests/dealImageMaster.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }

// ── stand-in Cloudinary ───────────────────────────────────────
const calls = [];
let nextResult = null;
const cloudinaryPath = require.resolve('cloudinary');
require.cache[cloudinaryPath] = {
  id: cloudinaryPath, filename: cloudinaryPath, loaded: true,
  exports: { v2: {
    config() {},
    uploader: { upload_stream(options, cb) { calls.push(options); return { end(buffer) { cb(null, { ...nextResult(options), bytes: buffer.length }); } }; } },
  } },
};
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'k';
process.env.CLOUDINARY_API_SECRET = 's';
const upload = require('../src/services/dealImageUploadService');
const service = require('../src/services/dealService');

// ── A. upload service ─────────────────────────────────────────
test('A. the upload is stored uncropped: only limited to 3000 px, never cropped to 4:3', async () => {
  calls.length = 0;
  nextResult = (o) => ({ public_id: o.folder + '/' + o.public_id, secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1700000000/' + o.folder + '/' + o.public_id + '.jpg', width: 4032, height: 3024, version: 1700000000, format: 'jpg' });
  await upload.uploadDealImage(Buffer.alloc(10), 'deal123');
  assert.equal(calls.length, 1);
  const o = calls[0];
  assert.deepEqual(o.transformation, [{ width: 3000, height: 3000, crop: 'limit', quality: 'auto:best' }]);
  assert.ok(!JSON.stringify(o.transformation).includes('fill'), 'no fill crop on the stored picture');
  assert.equal(o.resource_type, 'image');
  assert.equal(o.folder, 'qraivy-deals', 'same folder as before (production; a staging server uses its own)');
  assert.match(o.public_id, /^deal-deal123-\d+$/);
  assert.equal(o.overwrite, false);
});

test('A. it returns the 4:3 picture (as before: 1200x900) plus the master reference and size', async () => {
  nextResult = (o) => ({ public_id: o.folder + '/' + o.public_id, secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1700000000/' + o.folder + '/' + o.public_id + '.png', width: 2400, height: 3000, version: 1700000000, format: 'png' });
  const r = await upload.uploadDealImage(Buffer.alloc(10), 'deal9');
  assert.match(r.publicId, /^qraivy-deals\/deal-deal9-\d+$/);
  assert.equal(r.displayUrl, 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1700000000/' + r.publicId + '.png');
  assert.equal(r.displayWidth, 1200);
  assert.equal(r.displayHeight, 900);
  assert.equal(r.masterUrl, 'https://res.cloudinary.com/test-cloud/image/upload/v1700000000/' + r.publicId + '.png');
  assert.equal(r.masterWidth, 2400);
  assert.equal(r.masterHeight, 3000);
  // what the controller stores from it passes the server's own trust checks
  const image = service.checkDealImage({ source: 'uploaded', url: r.displayUrl, publicId: r.publicId, width: r.displayWidth, height: r.displayHeight, master: { url: r.masterUrl, width: r.masterWidth, height: r.masterHeight } });
  assert.equal(image.url, r.displayUrl);
  assert.deepEqual(image.master, { url: r.masterUrl, width: 2400, height: 3000 });
});

test('A. the 4:3 transformation is the same crop the stored picture used to get', () => {
  assert.equal(upload.DEAL_DISPLAY_TRANSFORMATION, 'c_fill,g_auto,h_900,w_1200');   // = { width 1200, height 900, crop fill, gravity auto }
  assert.deepEqual(upload.DEAL_DISPLAY_SIZE, { width: 1200, height: 900 });
  assert.equal(upload.buildDealDisplayUrl('c', 'qraivy-deals/x', null, 'jpg'), 'https://res.cloudinary.com/c/image/upload/c_fill,g_auto,h_900,w_1200/qraivy-deals/x.jpg');
});

test('A. the controller stores exactly that: 4:3 url/size plus master; access rules unchanged', () => {
  const ctl = read('backend/src/controllers/dealController.js');
  assert.ok(ctl.includes("source: 'uploaded', url: stored.displayUrl, publicId: stored.publicId, width: stored.displayWidth, height: stored.displayHeight,"));
  assert.ok(ctl.includes('master: { url: stored.masterUrl, width: stored.masterWidth, height: stored.masterHeight },'));
  const handler = ctl.slice(ctl.indexOf('async function uploadDealImageHandler'), ctl.indexOf('async function uploadDealImageHandler') + 900);
  assert.ok(handler.indexOf('getDealState(req.userId, req.params.id)') < handler.indexOf('uploadDealImage(req.file.buffer'), 'ownership is checked before anything is uploaded');
  const routes = read('backend/src/routes/dealRoutes.js');
  assert.ok(routes.includes("router.post('/:id/image', requireAuth,"), 'sign-in before the upload is read');
  assert.ok(routes.includes('limits: { fileSize: 5 * 1024 * 1024 }'));
  assert.ok(routes.includes("const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];"));
});

test('A. the 4:3 picture is created during the upload (eager, synchronous) with the display settings', async () => {
  calls.length = 0;
  nextResult = (o) => ({ public_id: o.folder + '/' + o.public_id, secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1700000000/' + o.folder + '/' + o.public_id + '.jpg', width: 4032, height: 3024, version: 1700000000, format: 'jpg' });
  await upload.uploadDealImage(Buffer.alloc(10), 'deal5');
  assert.deepEqual(calls[0].eager, [{ width: 1200, height: 900, crop: 'fill', gravity: 'auto' }]);
  assert.equal(calls[0].eager_async, false, 'ready before the response');
  assert.deepEqual(calls[0].eager[0], { ...upload.DEAL_DISPLAY_EAGER });
});

test('A. the eager copy and the URL the deal screens use are the same file', async () => {
  // what Cloudinary reports for the eager copy, in its documented response shape
  nextResult = (o) => {
    const pid = o.folder + '/' + o.public_id;
    return { public_id: pid, version: 1700000001, format: 'webp', width: 1600, height: 2000,
      secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1700000001/' + pid + '.webp',
      eager: [{ transformation: 'c_fill,g_auto,h_900,w_1200', width: 1200, height: 900, format: 'webp',
        secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1700000001/' + pid + '.webp' }] };
  };
  calls.length = 0;
  const r = await upload.uploadDealImage(Buffer.alloc(10), 'deal6');
  assert.equal(r.displayUrl, 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,g_auto,h_900,w_1200/v1700000001/' + r.publicId + '.webp', 'identical to the eager copy\'s URL');
  assert.equal(r.masterUrl, 'https://res.cloudinary.com/test-cloud/image/upload/v1700000001/' + r.publicId + '.webp', 'the master stays the uncropped original');
  assert.deepEqual([r.masterWidth, r.masterHeight, r.displayWidth, r.displayHeight], [1600, 2000, 1200, 900]);
  // the response keeps the fields the controller already used
  assert.deepEqual(Object.keys(r).sort(), ['displayHeight', 'displayUrl', 'displayWidth', 'masterHeight', 'masterUrl', 'masterWidth', 'publicId']);
});

test('A. the real Cloudinary SDK writes the eager settings as exactly the display transformation', () => {
  // a separate process, so the stand-in above does not apply (the SDK's own usage-analytics
  // query parameter is switched off: it is not part of the image)
  const script = "const c=require('cloudinary').v2;c.config({cloud_name:'test-cloud',analytics:false});" +
    "process.stdout.write(c.url('qraivy-deals/x',{secure:true,version:1700000001,format:'webp',transformation:[" + JSON.stringify(upload.DEAL_DISPLAY_EAGER) + "]}));";
  const sdkUrl = execFileSync(process.execPath, ['-e', script], { cwd: path.join(ROOT, 'backend'), encoding: 'utf8' }).trim();
  assert.equal(sdkUrl, upload.buildDealDisplayUrl('test-cloud', 'qraivy-deals/x', 1700000001, 'webp'));
  assert.ok(sdkUrl.includes('/image/upload/' + upload.DEAL_DISPLAY_TRANSFORMATION + '/'));
});

// ── B. Deal Builder ───────────────────────────────────────────
function builderFns() {
  const page = read('frontend/public/deals.html');
  const start = page.indexOf('  function imageFromServer(img) {');
  const end = page.indexOf('  function fromServer(sd) {');
  return vm.runInNewContext('(function(){' + page.slice(start, end) + '\nreturn { imageFromServer: imageFromServer, imageToServer: imageToServer };})()');
}

test('B. the Deal Builder keeps the master when it loads and saves an image', () => {
  const { imageFromServer, imageToServer } = builderFns();
  const server = { source: 'uploaded', url: 'https://res.cloudinary.com/c/image/upload/c_fill,g_auto,h_900,w_1200/v1/qraivy-deals/a.jpg', publicId: 'qraivy-deals/a', width: 1200, height: 900,
    master: { url: 'https://res.cloudinary.com/c/image/upload/v1/qraivy-deals/a.jpg', width: 4032, height: 3024 } };
  assert.deepEqual(JSON.parse(JSON.stringify(imageToServer(imageFromServer(server)))), server);
});

test('B. older images (no master) and starter/background images go back exactly as before', () => {
  const { imageFromServer, imageToServer } = builderFns();
  const old = { source: 'uploaded', url: 'https://res.cloudinary.com/c/image/upload/v1/qraivy-deals/a.jpg', publicId: 'qraivy-deals/a', width: 1200, height: 900 };
  const back = JSON.parse(JSON.stringify(imageToServer(imageFromServer(old))));
  assert.deepEqual(back, old);
  assert.ok(!('master' in back));
  assert.deepEqual(JSON.parse(JSON.stringify(imageToServer(imageFromServer({ source: 'starter', starterId: 'bakery-croissants-01', aiGenerated: true })))), { source: 'starter', starterId: 'bakery-croissants-01' });
  assert.deepEqual(JSON.parse(JSON.stringify(imageToServer(imageFromServer({ source: 'background', backgroundId: 'ocean' })))), { source: 'background', backgroundId: 'ocean' });
});

test('B. every deal screen still shows the 4:3 url; only the Step 2 format tiles use the master', () => {
  const page = read('frontend/public/deals.html');
  const code = page.split('\n').filter((l) => /\bmaster\b/.test(l) && !/^\s*\/\//.test(l)).map((l) => l.trim().split('//')[0].trim());
  assert.deepEqual(code, ['if (img.master) up.master = img.master;', 'if (img.master) up.master = img.master;'], 'the page only passes the master through');
  // the master is shown only by the format tiles (js/deal-image-formats.js, and its browser-padded fallback)
  const fnOf = (name) => page.slice(page.indexOf('  function ' + name + '('), page.indexOf('\n  }\n', page.indexOf('  function ' + name + '(')));
  for (const name of ['imageCss', 'renderPreview']) assert.ok(!/master|fallback/.test(fnOf(name)), name + ' (thumbnail, phone preview) uses the 4:3 url only');
  const css = read('frontend/public/deals-page.css');
  assert.equal((css.match(/aspect-ratio: 4 \/ 3;/g) || []).length, 5, 'the 4:3 image boxes are unchanged');
});

// ── C. unchanged ──────────────────────────────────────────────
test('C. the 22 starter images and their catalog are unchanged', () => {
  const changed = execFileSync('git', ['diff', '5e1dcf3', '--name-only', '--', 'frontend/public/images/deals', 'frontend/public/js/deal-starter-images.js', 'backend/src/data/dealImages.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(changed, '');
  assert.equal(fs.readdirSync(path.join(ROOT, 'frontend/public/images/deals/starter')).length, 22);
});

test('C. no database change: images stay in the existing Deal.image JSON column', () => {
  // (Phase 5.5C.3: schema.prisma and its one migration are pinned exactly in pushPageSubscriptions.test.js)
  const changed = execFileSync('git', ['diff', '5e1dcf3', '--name-only', '--', 'backend/prisma', ...require('./helpers/push55c3Revert').PRISMA_EXCLUDES], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(changed, '');
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
  process.exit(failed ? 1 : 0);
})();
