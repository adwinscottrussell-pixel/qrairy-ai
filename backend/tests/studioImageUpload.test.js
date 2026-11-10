// ============================================================
// studioImageUpload.test.js — Landing Page Studio V3, Image Phase 1:
// POST /studio/pages/:slug/images and the image ownership rule on every
// draft write (PUT /studio/pages/:slug/design, POST /studio/drafts).
//
// The real routes, requireAuth, requireVerifiedEmail and controllers on the
// read-only in-memory database (helpers/studioPagesServer.js); Cloudinary's
// upload_stream is replaced in-process (nothing leaves the machine).
// Checked: every refusal happens before Cloudinary is called and gives the
// limit slot back; structured error codes, no raw storage errors; the
// stored asset lands in <folder>/<userId>/<pageId>/; the upload writes
// nothing to the database; saves refuse another account's images, deal
// images and logos, and keep what the page already held.
//
// Run: node tests/studioImageUpload.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const http = require('http');
const crypto = require('crypto');
const { requireAuth } = require('../src/middleware/auth');
const { requireVerifiedEmail } = require('../src/lpV3/draftPolicy');
const studioRoutes = require('../src/lpV3/studioPagesRoutes');
const IC = require('../src/lpV3/studioImagesController');
const L = require('../src/services/studioImageUploadLimiter');
const { matchRoute } = require('../src/middleware/stagingGate');
const { v2: cloudinary } = require('cloudinary');

const CLOUD = 'dwqc6n7rn';
const U = (p) => 'https://res.cloudinary.com/' + CLOUD + '/image/upload/' + p;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2000)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(2000)]);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;

// Cloudinary: every call recorded; `next` decides the answer
const cloud = { calls: [], next: 'ok' };
cloudinary.uploader.upload_stream = (opts, cb) => ({
  end: (buf) => {
    cloud.calls.push({ opts, bytes: buf.length });
    setImmediate(() => {
      if (cloud.next === 'error') return cb(new Error('Cloudinary internal: api_secret mismatch for cloud ' + CLOUD));
      return cb(null, { public_id: opts.folder + '/' + opts.public_id, version: 1731000000, format: 'jpg', resource_type: 'image', width: 2400, height: 1600, bytes: buf.length,
        secure_url: U('v1731000000/' + opts.folder + '/' + opts.public_id + '.jpg') });
    });
  },
});
function storage(on) {
  if (on) Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' });
  else { delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET; process.env.CLOUDINARY_CLOUD_NAME = CLOUD; }
}

async function upload(slug, token, parts) {
  const form = new FormData();
  for (const p of parts || []) {
    if (p.text !== undefined) form.append(p.field, p.text);
    else form.append(p.field || 'image', new Blob([p.buffer], { type: p.type }), p.name || 'photo');
  }
  const r = await fetch(srv.origin + '/studio/pages/' + slug + '/images', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form });
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body, cache: r.headers.get('cache-control'), retryAfter: r.headers.get('retry-after') };
}
const image = (buffer, type) => [{ buffer, type }];
async function call(method, p, token, body) {
  const headers = Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, body !== undefined ? { 'Content-Type': 'application/json' } : {});
  const r = await fetch(srv.origin + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, body: json };
}
// a request that announces a body and never sends it: answered from the headers alone
function announce(slug, token, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(srv.origin + '/studio/pages/' + slug + '/images');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + token }, headers) }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); req.destroy(); });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' || e.code === 'EPIPE' ? null : reject(e)));
    req.flushHeaders();
  });
}
const fresh = () => { L._resetStudioUploadLimiter(); cloud.calls.length = 0; cloud.next = 'ok'; storage(true); };
const settle = () => new Promise((r) => setTimeout(r, 30));

// ── the chain ──
test('route: POST /pages/:slug/images = requireAuth -> requireVerifiedEmail -> own page -> limit -> header precheck -> multer -> controller; allowed on staging as "user"', () => {
  const layer = studioRoutes.stack.find((l) => l.route && l.route.path === '/pages/:slug/images');
  assert.ok(layer && layer.route.methods.post);
  const h = layer.route.stack.map((s) => s.handle);
  assert.equal(h.length, 7);
  assert.equal(h[0], requireAuth);
  assert.equal(h[1], requireVerifiedEmail);
  assert.equal(h[2], IC.requireOwnStudioPage);
  assert.equal(h[3].name, '', 'the limiter instance (throttleStudioUploads())');
  assert.equal(h[4], IC.precheckUpload);
  assert.equal(h[5], IC.parseImage);
  assert.equal(h[6], IC.uploadStudioPageImage);
  const m = matchRoute('POST', '/studio/pages/anna-shop/images');
  assert.ok(m && m.access === 'user');
  assert.equal(matchRoute('POST', '/studio/pages/anna-shop/images/x'), null);
});

test('signed out or forged token: 401, nothing stored', async () => {
  fresh();
  assert.equal((await upload('anna-shop', null, image(JPEG, 'image/jpeg'))).status, 401);
  assert.equal((await upload('anna-shop', 'tok_forged', image(JPEG, 'image/jpeg'))).status, 401);
  assert.equal(cloud.calls.length, 0);
});

test('unverified email: 403 email_unverified, no slot used, nothing stored', async () => {
  fresh();
  const r = await upload('anna-shop', 'tok_dana', image(JPEG, 'image/jpeg'));
  assert.deepEqual([r.status, r.body.error], [403, 'email_unverified']);
  assert.equal(cloud.calls.length, 0);
  assert.deepEqual(L.studioUploadUsage(S.DANA), { lastHour: 0, lastDay: 0 });
});

test('page: unknown or ownerless 404 not_found, another owner\'s 403 forbidden, bad slug 400; no slot used, nothing stored', async () => {
  fresh();
  const cases = [['no-such-page', 'tok_anna', 404, 'not_found'], ['ulm-city', 'tok_anna', 404, 'not_found'], ['anna-shop', 'tok_ben', 403, 'forbidden'], ['ben-bikes', 'tok_anna', 403, 'forbidden'], ['bad%20slug!', 'tok_anna', 400, 'invalid_slug']];
  for (const [slug, tok, status, error] of cases) {
    const r = await upload(slug, tok, image(JPEG, 'image/jpeg'));
    assert.deepEqual([r.status, r.body && r.body.error], [status, error], slug + ' ' + tok);
    assert.equal(r.cache, 'private, no-store');
  }
  assert.equal(cloud.calls.length, 0);
  await settle();
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 0, lastDay: 0 });
  assert.deepEqual(L.studioUploadUsage(S.BEN), { lastHour: 0, lastDay: 0 });
});

test('header precheck: not multipart 415, announced size over 5 MB 413 -- answered before the body is read; slots given back', async () => {
  fresh();
  const j = await call('POST', '/studio/pages/anna-shop/images', 'tok_anna', { image: 'x' });
  assert.deepEqual([j.status, j.body.error], [415, 'unsupported_type']);
  const big = await announce('anna-shop', 'tok_anna', { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(20 * 1024 * 1024) });
  assert.deepEqual([big.status, big.body.error], [413, 'file_too_large']);
  await settle();
  assert.equal(cloud.calls.length, 0);
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 0, lastDay: 0 });
});

test('file: wrong declared type 415, disguised content 415, over 5 MB 413, none 400, extra field or second file 400; nothing stored, slots given back', async () => {
  fresh();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  const cases = [
    [image(JPEG, 'image/gif'), 415, 'unsupported_type'],
    [image(svg, 'image/svg+xml'), 415, 'unsupported_type'],
    [image(svg, 'image/png'), 415, 'unsupported_type'],
    [image(PNG, 'image/jpeg'), 415, 'unsupported_type'],
    [image(Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), 'image/jpeg'), 413, 'file_too_large'],
    [[], 400, 'no_file'],
    [[{ field: 'photo', buffer: JPEG, type: 'image/jpeg' }], 400, 'invalid_upload'],
    [[{ field: 'image', buffer: JPEG, type: 'image/jpeg' }, { field: 'image', buffer: JPEG, type: 'image/jpeg' }], 400, 'invalid_upload'],
    [[{ field: 'note', text: 'hello' }, { field: 'image', buffer: JPEG, type: 'image/jpeg' }], 400, 'invalid_upload'],
  ];
  for (const [parts, status, error] of cases) {
    const r = await upload('anna-shop', 'tok_anna', parts);
    assert.deepEqual([r.status, r.body && r.body.error], [status, error], JSON.stringify(parts.map((p) => p.type || p.field)));
    assert.equal(typeof r.body.message, 'string');
  }
  await settle();
  assert.equal(cloud.calls.length, 0);
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 0, lastDay: 0 });
});

test('storage not configured: 503 storage_unavailable, nothing stored, slot given back', async () => {
  fresh();
  storage(false);
  const r = await upload('anna-shop', 'tok_anna', image(JPEG, 'image/jpeg'));
  assert.deepEqual([r.status, r.body.error], [503, 'storage_unavailable']);
  await settle();
  assert.equal(cloud.calls.length, 0);
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 0, lastDay: 0 });
  storage(true);
});

test('success: 201 with the display address in the owner\'s tenant folder; the draft and every table stay untouched', async () => {
  fresh();
  const writes = S.writes.length, designs = S.copy(S.db.pageDesigns), pages = S.copy(S.db.pages);
  const r = await upload('anna-shop', 'tok_anna', image(JPEG, 'image/jpeg'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.cache, 'private, no-store');
  const im = r.body.image;
  assert.match(im.publicId, /^qraivy-studio\/user_anna\/lp_anna_shop\/img-\d{13}-[0-9a-f]{8}$/);
  assert.equal(im.url, U('c_limit,h_1600,w_1600/v1731000000/' + im.publicId + '.jpg'));
  assert.deepEqual([im.width, im.height], [1600, 1067]);
  assert.deepEqual(im.master, { url: U('v1731000000/' + im.publicId + '.jpg'), width: 2400, height: 1600 });
  assert.equal(cloud.calls.length, 1);
  assert.equal(cloud.calls[0].bytes, JPEG.length);
  assert.equal(cloud.calls[0].opts.overwrite, false);
  // Image Phase 1.1: through the real endpoint, tags only and no Cloudinary context
  assert.deepEqual(cloud.calls[0].opts.tags, ['qraivy_studio_upload']);
  assert.ok(!('context' in cloud.calls[0].opts), 'no Cloudinary context');
  assert.equal(cloud.calls[0].opts.folder, 'qraivy-studio/user_anna/lp_anna_shop');
  assert.equal(S.writes.length, writes, 'no database write');
  assert.deepEqual(S.copy(S.db.pageDesigns), designs, 'the draft is unchanged (the next save carries the image)');
  assert.deepEqual(S.copy(S.db.pages), pages);
  await settle();
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 1, lastDay: 1 }, 'a stored upload counts');
  const again = await upload('anna-shop', 'tok_anna', image(PNG, 'image/png'));
  assert.notEqual(again.body.image.publicId, im.publicId, 'every upload its own id');
});

test('Cloudinary failure: 502 storage_failed with a fixed message (the raw error is only logged); the attempt still counts', async () => {
  fresh();
  cloud.next = 'error';
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  let r;
  try { r = await upload('anna-shop', 'tok_anna', image(JPEG, 'image/jpeg')); } finally { console.error = orig; }
  assert.deepEqual(r.body, { error: 'storage_failed', message: 'The image could not be stored. Please try again.' });
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes('api_secret') && !JSON.stringify(r.body).includes(CLOUD));
  assert.ok(logged.some((l) => l.includes('[StudioImages] storage error')));
  await settle();
  assert.deepEqual(L.studioUploadUsage(S.ANNA), { lastHour: 1, lastDay: 1 });
});

test('upload limit: 40 per hour per account -> 429 upload_limit with Retry-After, before the body is read; other accounts unaffected', async () => {
  fresh();
  assert.deepEqual(L.STUDIO_UPLOAD_LIMITS, { perHour: 40, perDay: 120 });
  for (let i = 0; i < 40; i++) L.reserveStudioUploadSlot(S.ANNA).slot.commit();
  const r = await upload('anna-shop', 'tok_anna', image(JPEG, 'image/jpeg'));
  assert.deepEqual([r.status, r.body.error, r.body.window, r.body.limit], [429, 'upload_limit', 'hour', 40]);
  assert.ok(Number(r.retryAfter) >= 1);
  assert.equal(cloud.calls.length, 0);
  const b = await upload('ben-bikes', 'tok_ben', image(JPEG, 'image/jpeg'));
  assert.equal(b.status, 201, 'Ben has his own limit');
  // the Deals limiter is a different counter
  assert.deepEqual(require('../src/services/dealUploadLimiter').usage(S.ANNA), { lastHour: 0, lastDay: 0 });
  fresh();
});

// ── the ownership rule on saves ──
const OWN = U('c_limit,h_1600,w_1600/v1731000000/qraivy-studio/user_anna/lp_anna_shop/img-1731000000000-aaaaaaaa.jpg');
const OWN_OTHER_PAGE = U('c_limit,h_1600,w_1600/v1731000000/qraivy-studio/user_anna/lp_anna_cafe/img-1731000000000-bbbbbbbb.jpg');
const BENS = U('c_limit,h_1600,w_1600/v1731000000/qraivy-studio/user_ben/lp_ben/img-1731000000000-cccccccc.jpg');
const DEAL = U('c_fill,g_auto,h_900,w_1200/v1/qraivy-deals/deal-d_ben-1731000000000.jpg');
const LOGO = U('v1/qraivy-logos/logo-ben-bikes.png');
const STARTER = U('c_fill,g_auto,h_900,w_1200,f_auto,q_auto/qraivy-deal-starters/bakery-bread-01.jpg');
const STUDIO_STARTER = U('c_limit,w_1200,f_auto,q_auto/qraivy-studio-starters/QRAIVY-Creator-Hero.jpg');
function shopDesign(img, field = 'hero') {
  const d = S.copy(S.SHOP_DRAFT);
  if (field === 'hero') Object.assign(d.pages[0].sections[0], { variant: 'overlay', data: Object.assign(d.pages[0].sections[0].data, { backgroundImage: img }) });
  if (field === 'gallery') d.pages[0].sections.push({ id: 's_gal01', type: 'gallery', data: { images: [{ image: img, alt: 'a' }] } });
  if (field === 'logo') d.header = { logo: img };
  return d;
}
const save = (slug, token, design, baseRevision) => call('PUT', '/studio/pages/' + slug + '/design', token, { design, baseRevision });

test('save (PUT): the owner\'s own uploads (any of their pages) and the starter photos pass', async () => {
  storage(true);
  let rev = 4;
  for (const [img, field] of [[OWN, 'hero'], [OWN_OTHER_PAGE, 'gallery'], [STARTER, 'gallery'], [STUDIO_STARTER, 'hero']]) {
    const r = await save('anna-shop', 'tok_anna', shopDesign(img, field), rev);
    assert.equal(r.status, 200, img + ' ' + JSON.stringify(r.body));
    rev = r.body.revision;
  }
  S.resetDesigns();
});

test('save (PUT): another account\'s upload, a deal image, another page\'s logo -> 422 image_not_allowed, nothing written', async () => {
  storage(true);
  const before = S.copy(S.db.pageDesigns);
  for (const [img, field] of [[BENS, 'hero'], [BENS, 'gallery'], [DEAL, 'hero'], [LOGO, 'logo'], [U('v1/qraivy-studio/user_anna.jpg'), 'hero'], [U('qraivy-studio/user_anna/v2/qraivy-studio/user_ben/lp_ben/x.jpg'), 'hero']]) {
    const r = await save('anna-shop', 'tok_anna', shopDesign(img, field), 4);
    assert.equal(r.status, 422, img);
    assert.equal(r.body.error, 'design_invalid');
    assert.ok(r.body.errors.some((e) => e.code === 'image_not_allowed'), JSON.stringify(r.body.errors));
  }
  assert.deepEqual(S.copy(S.db.pageDesigns), before);
});

test('save (PUT): an image the page already holds stays saveable (stored draft; legacy logo on the first save)', async () => {
  storage(true);
  // a stored draft that already holds an image from before the rule (here Ben's, as the worst case)
  const row = S.db.pageDesigns.find((d) => d.landingPageId === 'lp_anna_shop');
  row.draft = shopDesign(LOGO, 'logo');
  const kept = await save('anna-shop', 'tok_anna', shopDesign(LOGO, 'logo'), 4);
  assert.equal(kept.status, 200, 'unchanged content still saves: ' + JSON.stringify(kept.body));
  // ...but only that exact address, and only on that page
  const other = await save('anna-shop', 'tok_anna', shopDesign(U('v1/qraivy-logos/logo-anna-cafe.png'), 'logo'), kept.body.revision);
  assert.equal(other.status, 422);
  S.resetDesigns();
  // a legacy page's own logo, opened in the Studio for the first time (no stored draft)
  const cafe = S.db.pages.find((p) => p.slug === 'anna-cafe');
  const oldLogo = cafe.logoUrl;
  cafe.logoUrl = U('v1/qraivy-logos/logo-anna-cafe.png');
  try {
    const loaded = await call('GET', '/studio/pages/anna-cafe/design', 'tok_anna');
    assert.equal(loaded.body.design.header.logo, cafe.logoUrl, 'the import carries the logo');
    const first = await save('anna-cafe', 'tok_anna', loaded.body.design, null);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const elsewhere = await save('anna-shop', 'tok_anna', shopDesign(cafe.logoUrl, 'logo'), 4);
    assert.equal(elsewhere.status, 422, 'another page\'s logo is not "known" here');
  } finally { cafe.logoUrl = oldLogo; S.resetDesigns(); }
});

test('create draft (POST /studio/drafts): starter photos and own uploads pass; another account\'s images are refused, nothing created', async () => {
  storage(true);
  const design = (img) => ({ schemaVersion: 1, settings: { language: 'en' }, pages: [{ id: 'start', title: 'Start', sections: [{ id: 's_hero01', type: 'hero', variant: 'overlay', data: { headline: 'Hello', backgroundImage: img } }] }] });
  const pagesBefore = S.db.pages.length;
  for (const img of [BENS, DEAL, LOGO]) {
    const r = await call('POST', '/studio/drafts', 'tok_anna', { name: 'Img test', language: 'en', requestId: crypto.randomUUID(), design: design(img) });
    assert.equal(r.status, 422, img + ' ' + JSON.stringify(r.body));
    assert.ok(r.body.errors.some((e) => e.code === 'image_not_allowed'));
  }
  assert.equal(S.db.pages.length, pagesBefore, 'nothing created');
  const ok = await call('POST', '/studio/drafts', 'tok_anna', { name: 'Img ok', language: 'en', requestId: crypto.randomUUID(), design: design(STUDIO_STARTER) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const own = await call('POST', '/studio/drafts', 'tok_anna', { name: 'Img own', language: 'en', requestId: crypto.randomUUID(), design: design(OWN) });
  assert.equal(own.status, 201, 'an image Anna uploaded for another of her pages: ' + JSON.stringify(own.body));
  S.resetDrafts();
});

test('reading a stored draft is unchanged: GET still opens a draft whatever images it holds (the rule applies to writes)', async () => {
  storage(true);
  const row = S.db.pageDesigns.find((d) => d.landingPageId === 'lp_anna_shop');
  row.draft = shopDesign(BENS);
  const r = await call('GET', '/studio/pages/anna-shop/design', 'tok_anna');
  assert.equal(r.status, 200);
  assert.equal(r.body.design.pages[0].sections[0].data.backgroundImage, BENS);
  S.resetDesigns();
});

(async () => {
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioImageUpload');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + (e && e.stack)); }
  }
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
