// ============================================================
// studioImages.test.js — Landing Page Studio V3, Image Phase 1: the shared
// image foundation (no editor UI yet).
//
//   A. core.js image ownership: imagePublicId / imageAllowed / opts.images,
//      unchanged without opts.images, both core copies identical
//   B. the approved starter photos: every template image lies in a starter
//      folder, maps to an approved file in the repository, passes the
//      ownership rule for any account; the two Studio starter Heroes are what
//      scripts/studio-starters-upload.js uploads (opt-in CDN check:
//      STUDIO_CHECK_CDN=1)
//   C. tenant folders (data/studioImages.js) and the staging policy
//      (STUDIO_IMAGE_FOLDER)
//   D. the upload service: file checks (declared type AND content), the
//      display derivative, the Cloudinary call (own folder, unique id, never
//      overwrite), refusing an unexpected stored asset
//
// Run: node tests/studioImages.test.js
// ============================================================
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const PUB = path.join(__dirname, '..', '..', 'frontend', 'public');
const V3 = require('../src/lpV3/core');
const V3F = require('../../frontend/public/js/lpV3/core.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');
const SI = require('../src/data/studioImages');
const { loadStagingPolicy, PRODUCTION_STORAGE_FOLDERS } = require('../src/config/stagingPolicy');
const CLOUD = 'dwqc6n7rn';
const U = (p) => 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + p;
const hero = (img) => ({ schemaVersion: 1, pages: [{ id: 'start', sections: [{ id: 's_hero01', type: 'hero', variant: 'overlay', data: { headline: 'x', backgroundImage: img } }] }] });
const codes = (r) => r.errors.map((e) => e.code);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── A. core.js ──
test('A. imagePublicId reads the public id as Cloudinary does: transformations and version skipped', () => {
  const cases = [
    ['c_fill,g_auto,h_900,w_1200,f_auto,q_auto/qraivy-deal-starters/bakery-bread-01.jpg', 'qraivy-deal-starters/bakery-bread-01'],
    ['c_limit,w_1200,f_auto,q_auto/qraivy-studio-starters/QRAIVY-Creator-Hero.jpg', 'qraivy-studio-starters/QRAIVY-Creator-Hero'],
    ['c_limit,h_1600,w_1600/v1731000000/qraivy-studio/user_anna/lp_anna_shop/img-1-ab.webp', 'qraivy-studio/user_anna/lp_anna_shop/img-1-ab'],
    ['c_fill,w_10/e_blur:300/v2/qraivy-studio/user_a/p/i.png', 'qraivy-studio/user_a/p/i'],
    ['v1/qraivy-logos/logo-anna.png', 'qraivy-logos/logo-anna'],
    ['qraivy-studio/user_a/p/i.jpg', 'qraivy-studio/user_a/p/i'],
  ];
  for (const [p, id] of cases) assert.equal(V3.imagePublicId(U(p)), id, p);
  for (const p of ['qraivy-studio/user_a/v2/qraivy-studio/user_b/p/i.jpg', 'qraivy-studio/user_a/../user_b/p/i.jpg', 'qraivy-studio/user_a/./p/i.jpg', 'qraivy-studio//user_b/i.jpg', 'v1/.jpg']) {
    assert.equal(V3.imagePublicId(U(p)), null, 'never guessed: ' + p);
  }
  for (const bad of ['', null, 'data:image/png;base64,AA', 'https://example.com/a.jpg', 'https://res.cloudinary.com/x/video/upload/a.mp4']) assert.equal(V3.imagePublicId(bad), null, String(bad));
});

test('A. imageAllowed: inside an allowed folder (a whole segment, not a name prefix) or exactly a known address', () => {
  const scope = { folders: ['qraivy-studio/user_anna', 'qraivy-deal-starters'], known: [U('v1/qraivy-logos/logo-anna-cafe.png')] };
  assert.equal(V3.imageAllowed(U('v9/qraivy-studio/user_anna/lp1/img.jpg'), scope), true);
  assert.equal(V3.imageAllowed(U('c_fill,w_800/qraivy-deal-starters/bakery-bread-01.jpg'), scope), true);
  assert.equal(V3.imageAllowed(U('v1/qraivy-logos/logo-anna-cafe.png'), scope), true, 'known exactly');
  for (const p of ['v9/qraivy-studio/user_annabel/lp1/img.jpg', 'v9/qraivy-studio/user_ben/lp1/img.jpg', 'qraivy-studio/user_anna.jpg', 'v1/qraivy-deals/deal-x-1731000000000.jpg',
    'v1/qraivy-logos/logo-ben.png', 'c_fill,w_9/v1/qraivy-logos/logo-anna-cafe.png', 'qraivy-studio/user_anna/v2/qraivy-studio/user_ben/p/i.jpg', 'a/qraivy-studio/user_anna/p/i.jpg']) {
    assert.equal(V3.imageAllowed(U(p), scope), false, p);
  }
});

test('A. validateDesign: opts.images refuses out-of-scope images with image_not_allowed; without it nothing changes', () => {
  const foreign = U('v1/qraivy-studio/user_ben/lp_ben/img-1-aa.jpg');
  const own = U('c_limit,h_1600,w_1600/v1/qraivy-studio/user_anna/lp_anna_shop/img-1-aa.jpg');
  const scope = SI.imageScope('user_anna');
  assert.equal(V3.validateDesign(hero(foreign), { cloudName: CLOUD }).ok, true, 'without opts.images: the address rule only (the Studio preview, reading a stored draft)');
  const r = V3.validateDesign(hero(foreign), { cloudName: CLOUD, images: scope });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, [{ path: '$.pages[0].sections[0].data.backgroundImage', code: 'image_not_allowed' }]);
  assert.equal(V3.validateDesign(hero(own), { cloudName: CLOUD, images: scope }).ok, true);
  // every image field of the schema is covered: header logo, hero, gallery, products, text
  const all = { schemaVersion: 1, header: { logo: foreign }, pages: [{ id: 'start', sections: [
    { id: 's_hero01', type: 'hero', data: { headline: 'x', backgroundImage: foreign } },
    { id: 's_gal01', type: 'gallery', data: { images: [{ image: foreign }] } },
    { id: 's_prod01', type: 'products', data: { items: [{ name: 'p', image: foreign }] } },
    { id: 's_text01', type: 'text', variant: 'image-left', data: { heading: 'h', image: foreign } },
  ] }] };
  const a = V3.validateDesign(all, { cloudName: CLOUD, images: scope });
  assert.deepEqual(a.errors.map((e) => e.path).sort(), ['$.header.logo', '$.pages[0].sections[0].data.backgroundImage', '$.pages[0].sections[1].data.images[0].image', '$.pages[0].sections[2].data.items[0].image', '$.pages[0].sections[3].data.image'].sort());
  assert.ok(a.errors.every((e) => e.code === 'image_not_allowed'));
  // the address rule still comes first: another cloud stays invalid_image
  assert.deepEqual(codes(V3.validateDesign(hero('https://res.cloudinary.com/other/image/upload/qraivy-studio/user_anna/p/i.jpg'), { cloudName: CLOUD, images: scope })), ['invalid_image']);
});

test('A. both core.js copies are byte-identical (server and Studio use the same rule)', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'lpV3', 'core.js'), 'utf8'), fs.readFileSync(path.join(PUB, 'js', 'lpV3', 'core.js'), 'utf8'));
  assert.equal(typeof V3F.imageAllowed, 'function');
});

// ── B. starter photos ──
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const CATALOG = (() => { const w = {}; vm.runInNewContext(read('js/deal-starter-images.js'), { window: w }); return w.QRAIVY_DEAL_STARTER_IMAGES; })();
function templateImages() {
  const out = new Set();
  T.TEMPLATE_IDS.forEach((id) => T.get(id).palettes.forEach((p) => ['en', 'de'].forEach((lang) => {
    const o = { lang, palette: p.id, imageUrl: T.imageUrl, cloudName: CLOUD };
    for (const r of [T.sample(V3, id, o), T.starter(V3, id, o)]) { assert.ok(r.ok, id + ' ' + lang); SI.imagesIn(r.design, out); }
  })));
  return Array.from(out);
}

test('B. every template image (sample and starter, every palette and language) is an approved starter photo with a file in the repository', () => {
  const imgs = templateImages();
  assert.ok(imgs.length >= 14, 'all 12 Deals starters and both Studio heroes are used: ' + imgs.length);
  const studio = new Map(T.STUDIO_IMAGES.map((i) => [i.id, i]));
  const deals = new Set((CATALOG.images || CATALOG).map((i) => i.id));
  for (const url of imgs) {
    const id = V3.imagePublicId(url);
    const [folder, name] = id.split('/');
    assert.ok(SI.STARTER_IMAGE_FOLDERS.includes(folder) && id.split('/').length === 2, url);
    if (folder === 'qraivy-studio-starters') {
      const i = studio.get(name);
      assert.ok(i, 'a Studio starter the templates know: ' + name);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, i.file))).digest('hex');
      assert.equal(sha, i.sha256, name + ' approved web copy unchanged');
      assert.equal(url, T.imageUrl(name));
    } else {
      assert.ok(deals.has(name), 'a Deals starter in the catalog: ' + name);
      assert.ok(fs.existsSync(path.join(PUB, 'images', 'deals', 'starter', name + '.jpg')), name + ' file');
    }
  }
});

test('B. template drafts pass the ownership rule for any account (starter folders are shared, nothing else is)', () => {
  for (const user of ['user_anna', 'user_someoneelse123']) {
    T.TEMPLATE_IDS.forEach((id) => {
      const s = T.sample(V3, id, { lang: 'de', palette: T.get(id).palettes[0].id, imageUrl: T.imageUrl, cloudName: CLOUD });
      const r = V3.validateDesign(s.design, { cloudName: CLOUD, images: SI.imageScope(user) });
      assert.ok(r.ok, id + ' for ' + user + ': ' + JSON.stringify(r.errors));
    });
  }
});

test('B. the Creator and Services heroes are exactly what scripts/studio-starters-upload.js uploads (dry run, no network)', () => {
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'studio-starters-upload.js')], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.match(out, /DRY RUN/);
  for (const i of T.STUDIO_IMAGES) {
    assert.ok(out.includes(i.id + '  ' + i.file), i.id);
    assert.ok(out.includes(T.imageUrl(i.id)), i.id + ' address');
  }
  assert.deepEqual(T.STUDIO_IMAGES.map((i) => T.get(i.template) && i.template), ['creator', 'services']);
});

if (process.env.STUDIO_CHECK_CDN === '1') {
  test('B. (network) every template image address is served by Cloudinary as an image, without the Studio local copies', async () => {
    for (const url of templateImages()) {
      const r = await fetch(url);
      assert.equal(r.status, 200, url);
      assert.match(r.headers.get('content-type') || '', /^image\//, url);
    }
  });
}

// ── C. tenant folders and staging ──
test('C. owner folders: Clerk id and page id only, safe path segments, production folder unless staging', () => {
  assert.equal(SI.ACTIVE_STUDIO_IMAGE_FOLDER, 'qraivy-studio');
  assert.equal(SI.ownerImageFolder('user_2abcDEF'), 'qraivy-studio/user_2abcDEF');
  assert.equal(SI.pageImageFolder('user_2abcDEF', 'cm3xyz'), 'qraivy-studio/user_2abcDEF/cm3xyz');
  for (const bad of ['', 'a/b', '../x', 'anna@example.com', 'x'.repeat(65), null, 7]) {
    assert.equal(SI.ownerImageFolder(bad), null, String(bad));
    assert.equal(SI.pageImageFolder('user_a', bad), null, 'page ' + String(bad));
  }
  assert.equal(SI.ownerImageFolder('user_a', null), null, 'no folder: no storage');
  assert.equal(SI.studioImageFolderFor(null), 'qraivy-studio');
  assert.equal(SI.studioImageFolderFor({ studioImageFolder: null }), null, 'staging without its folder: none, never production');
  assert.equal(SI.studioImageFolderFor({ studioImageFolder: 'qraivy-studio-staging' }), 'qraivy-studio-staging');
  const sc = SI.imageScope('user_a', [U('v1/x/y.jpg'), U('v1/x/y.jpg'), '', null]);
  assert.deepEqual(sc, { folders: ['qraivy-studio-starters', 'qraivy-deal-starters', 'qraivy-studio/user_a'], known: [U('v1/x/y.jpg')] });
  assert.deepEqual(SI.imageScope('bad/id').folders, ['qraivy-studio-starters', 'qraivy-deal-starters'], 'an unsafe id gets no owner folder');
});

const PEM = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
const STAGING = {
  APP_ENV: 'staging', STAGING_ALLOWED_USER_IDS: 'user_abcdefgh1', STAGING_VOICE_RECORDING_CEILING: '1', VOICE_AUDIO_FOLDER: 'qraivy-voices-studio-staging',
  CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's', CLERK_JWT_KEY: PEM,
  STAGING_CLERK_ISSUER: 'https://clerk.qraivy.com', STAGING_CLERK_AUTHORIZED_PARTIES: 'https://studio-preview.qraivy.com',
};
test('C. staging: STUDIO_IMAGE_FOLDER is optional, must say "staging", and is never a production or another staging folder', () => {
  assert.equal(loadStagingPolicy({ STUDIO_IMAGE_FOLDER: 'anything' }), null, 'means nothing in production');
  assert.ok(PRODUCTION_STORAGE_FOLDERS.includes('qraivy-studio') && PRODUCTION_STORAGE_FOLDERS.includes('qraivy-studio-starters'));
  assert.equal(loadStagingPolicy(STAGING).studioImageFolder, null, 'without it: no Studio uploads on staging');
  assert.equal(loadStagingPolicy({ ...STAGING, STUDIO_IMAGE_FOLDER: 'qraivy-studio-staging' }).studioImageFolder, 'qraivy-studio-staging');
  for (const bad of ['qraivy-studio', 'qraivy-studio-starters', 'qraivy-deals', 'qraivy-logos', 'qraivy-studio-test', 'Qraivy-Studio-Staging', 'qraivy-studio/staging', '../staging', 'qraivy-voices-studio-staging']) {
    assert.throws(() => loadStagingPolicy({ ...STAGING, STUDIO_IMAGE_FOLDER: bad }), /STUDIO_IMAGE_FOLDER/, bad);
  }
  assert.throws(() => loadStagingPolicy({ ...STAGING, DEAL_IMAGE_FOLDER: 'shared-staging', STUDIO_IMAGE_FOLDER: 'shared-staging' }), /STUDIO_IMAGE_FOLDER must differ/);
  assert.throws(() => loadStagingPolicy({ ...STAGING, VOICE_AUDIO_FOLDER: 'qraivy-studio-staging2', DEAL_IMAGE_FOLDER: 'qraivy-studio' }), /DEAL_IMAGE_FOLDER is a production folder/, 'staging deal images can no longer land in the Studio folder either');
});

// ── D. the upload service ──
const S = require('../src/services/studioImageUploadService');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(60)]);

test('D. file check: JPEG, PNG, WebP only, by declared type AND content; 5 MB; structured codes', () => {
  assert.equal(S.STUDIO_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.deepEqual(S.STUDIO_IMAGE_TYPES, ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(S.checkImageFile({ buffer: JPEG, mimetype: 'image/jpeg' }), 'image/jpeg');
  assert.equal(S.checkImageFile({ buffer: JPEG, mimetype: 'image/jpg' }), 'image/jpeg');
  assert.equal(S.checkImageFile({ buffer: PNG, mimetype: 'image/png' }), 'image/png');
  assert.equal(S.checkImageFile({ buffer: WEBP, mimetype: 'image/webp' }), 'image/webp');
  const code = (f) => { try { S.checkImageFile(f); return 'ok'; } catch (e) { return e.code + ':' + e.status; } };
  assert.equal(code(null), 'no_file:400');
  assert.equal(code({ buffer: Buffer.alloc(0), mimetype: 'image/png' }), 'no_file:400');
  assert.equal(code({ buffer: PNG, mimetype: 'image/jpeg' }), 'unsupported_type:415', 'content and declared type differ');
  assert.equal(code({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), mimetype: 'image/png' }), 'unsupported_type:415', 'SVG/HTML disguised as PNG');
  assert.equal(code({ buffer: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]), mimetype: 'image/gif' }), 'unsupported_type:415');
  assert.equal(code({ buffer: Buffer.concat([JPEG, Buffer.alloc(S.STUDIO_IMAGE_MAX_BYTES)]), mimetype: 'image/jpeg' }), 'file_too_large:413');
});

test('D. the display derivative string is exactly what the SDK writes for the eager option (strict transformations)', () => {
  const { v2: cloudinary } = require('cloudinary');
  const url = cloudinary.url('a/b', { cloud_name: 'x', transformation: [{ ...S.STUDIO_DISPLAY_EAGER }] });
  assert.ok(url.includes('/image/upload/' + S.STUDIO_DISPLAY_TRANSFORMATION + '/'), url);
  assert.equal(S.STUDIO_DISPLAY_TRANSFORMATION, 'c_limit,h_1600,w_1600');
  assert.equal(S.buildStudioDisplayUrl(CLOUD, 'qraivy-studio/user_a/p/img-1-ab', 17, 'jpg'), U('c_limit,h_1600,w_1600/v17/qraivy-studio/user_a/p/img-1-ab.jpg'));
});

function withCloudinary(fake, fn) {
  const { v2: cloudinary } = require('cloudinary');
  const orig = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = fake;
  return Promise.resolve().then(fn).finally(() => { cloudinary.uploader.upload_stream = orig; });
}
test('D. upload: own tenant folder, a new unique id each time, never overwrite, master + eager display; the result passes the owner\'s scope only', async () => {
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  const calls = [];
  const fake = (opts, cb) => ({ end: (buf) => { calls.push({ opts, bytes: buf.length }); setImmediate(() => cb(null, { public_id: opts.folder + '/' + opts.public_id, version: 123, format: 'jpg', resource_type: 'image', width: 3000, height: 2000, bytes: 999, secure_url: U('v123/' + opts.folder + '/' + opts.public_id + '.jpg') })); } });
  await withCloudinary(fake, async () => {
    const a = await S.uploadStudioImage(JPEG, { userId: 'user_anna', pageId: 'lp_anna_shop' });
    const b = await S.uploadStudioImage(JPEG, { userId: 'user_anna', pageId: 'lp_anna_shop' });
    assert.notEqual(a.publicId, b.publicId, 'unique per upload');
    assert.match(a.publicId, /^qraivy-studio\/user_anna\/lp_anna_shop\/img-\d{13}-[0-9a-f]{8}$/);
    const o = calls[0].opts;
    assert.equal(o.resource_type, 'image');
    assert.equal(o.folder, 'qraivy-studio/user_anna/lp_anna_shop');
    assert.equal(o.overwrite, false);
    assert.equal(o.unique_filename, false);
    assert.deepEqual(o.allowed_formats, ['jpg', 'png', 'webp']);
    assert.deepEqual(o.transformation, [{ width: 3000, height: 3000, crop: 'limit', quality: 'auto:best' }]);
    assert.deepEqual(o.eager, [{ width: 1600, height: 1600, crop: 'limit' }]);
    assert.equal(o.eager_async, false);
    assert.ok(!JSON.stringify(o).includes('@'), 'no email anywhere in the stored asset');
    // Image Phase 1.1: tags only (allowed to the Contributor folder role); no contextual metadata (Editor)
    assert.deepEqual(o.tags, ['qraivy_studio_upload']);
    assert.ok(!('context' in o), 'no Cloudinary context is sent');
    assert.deepEqual(Object.keys(o).sort(), ['allowed_formats', 'eager', 'eager_async', 'folder', 'overwrite', 'public_id', 'resource_type', 'tags', 'transformation', 'unique_filename']);
    assert.equal(a.url, U('c_limit,h_1600,w_1600/v123/' + a.publicId + '.jpg'));
    assert.deepEqual([a.width, a.height], [1600, 1067]);
    assert.deepEqual(a.master, { url: U('v123/' + a.publicId + '.jpg'), width: 3000, height: 2000 });
    assert.equal(V3.validateDesign(hero(a.url), { cloudName: CLOUD, images: SI.imageScope('user_anna') }).ok, true, 'the owner may use it');
    assert.equal(V3.validateDesign(hero(a.url), { cloudName: CLOUD, images: SI.imageScope('user_ben') }).ok, false, 'nobody else may');
  });
});

test('D. upload: an unexpected stored asset (other public id, format or type) is a storage failure; unsafe ids never reach Cloudinary', async () => {
  for (const twist of [{ public_id: 'qraivy-studio/user_ben/x/img' }, { format: 'gif' }, { resource_type: 'raw' }]) {
    const fake = (opts, cb) => ({ end: () => setImmediate(() => cb(null, Object.assign({ public_id: opts.folder + '/' + opts.public_id, version: 1, format: 'png', resource_type: 'image', width: 10, height: 10 }, twist))) });
    await withCloudinary(fake, async () => {
      await assert.rejects(S.uploadStudioImage(PNG, { userId: 'user_anna', pageId: 'p1' }), (e) => e.code === 'storage_failed' && e.status === 502, JSON.stringify(twist));
    });
  }
  let called = false;
  await withCloudinary(() => { called = true; throw new Error('must not be called'); }, async () => {
    await assert.rejects(S.uploadStudioImage(PNG, { userId: '../user_ben', pageId: 'p1' }), (e) => e.code === 'storage_unavailable');
    await assert.rejects(S.uploadStudioImage(PNG, { userId: 'user_anna', pageId: 'a/b' }), (e) => e.code === 'storage_unavailable');
  });
  assert.equal(called, false);
});

(async () => {
  let passed = 0, failed = 0;
  console.log('studioImages');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
