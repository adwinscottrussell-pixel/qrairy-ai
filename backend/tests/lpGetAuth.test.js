// ============================================================
// lpGetAuth.test.js — Phase 0, S4: the page record (GET /api/lp/:slug).
//
// Before: anyone could read the full record of any page: the owner's account
// id, the visit count, the scanned website text and, once set, the staff PIN
// hash. Now: only the page's owner (a platform admin for a page without an
// owner); the PIN hash is never sent, not even to the owner. Because editors
// re-send the record they loaded, a save keeps the stored PIN on the server:
// an ordinary save can neither change nor remove it.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers/phase0Harness');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const PUB = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', f), 'utf8').replace(/\r\n/g, '\n');

async function get(slug, auth) {
  const r = h.res();
  await h.quiet(() => h.lp.handleGetLP(h.req({ params: { slug }, headers: auth ? { authorization: auth } : {} }), r));
  return r;
}
async function save(slug, auth, sections, extra = {}) {
  const r = h.res();
  await h.quiet(() => h.lp.handlePublishLP(h.req({ method: 'POST', headers: auth ? { authorization: auth } : {}, body: Object.assign({ slug, businessName: 'Casa Lumi', sections }, extra) }), r));
  return r;
}
const stored = (slug) => JSON.parse(h.T('landingPage').find((p) => p.slug === slug).sections);

test('without sign-in: 401 (the audit reproduction), and nothing about the page is returned', async () => {
  h.reset(); h.page('shop', { sections: { siteContent: 'scraped', staffPin: 'scrypt$aa$bb' } });
  const r = await get('shop');
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { error: 'Unauthorized' });
  assert.equal((await get('shop', 'Bearer not-a-user')).statusCode, 401);
});

test('another account: 403; unknown page: 404', async () => {
  h.reset(); h.page('shop');
  assert.equal((await get('shop', 'Bearer user_other')).statusCode, 403);
  assert.equal((await get('nope', 'Bearer user_owner')).statusCode, 404);
});

test('the owner gets the full record, visit count included, but never the PIN hash', async () => {
  h.reset(); h.page('shop', { scanCount: 119, sections: { language: 'en', siteContent: 'scraped', voice: { audioUrl: 'https://a' }, staffPin: h.staffPin.hashPin('4321') } });
  const r = await get('shop', 'Bearer user_owner');
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.scanCount, 119);
  assert.equal(r.body.userId, 'user_owner');
  const sec = JSON.parse(r.body.sections);
  assert.deepEqual(Object.keys(sec).sort(), ['language', 'siteContent', 'voice']);
  assert.ok(!JSON.stringify(r.body).includes('scrypt$'));
  h.reset(); h.page('plain', { sections: { language: 'en' } });
  const p = await get('plain', 'Bearer user_owner');
  assert.equal(p.body.sections, JSON.stringify({ language: 'en' }), 'a page without a PIN: the record exactly as stored');
});

test('a page without an owner: a platform admin only', async () => {
  h.reset(); h.page('free', { userId: null });
  assert.equal((await get('free', 'Bearer user_other')).statusCode, 403);
  assert.equal((await get('free', 'Bearer user_admin')).statusCode, 200);
});

test('saving: an editor that loaded the record without the PIN keeps the stored PIN', async () => {
  h.reset(); const pin = h.staffPin.hashPin('4321');
  h.page('shop', { sections: { language: 'en', hero: { title: 'Old' }, staffPin: pin } });
  const loaded = JSON.parse((await get('shop', 'Bearer user_owner')).body.sections);
  loaded.hero = { title: 'New' };
  assert.equal((await save('shop', 'Bearer user_owner', loaded)).statusCode, 200);
  assert.equal(stored('shop').hero.title, 'New');
  assert.equal(stored('shop').staffPin, pin, 'the PIN is still configured');
  assert.equal(h.staffPin.pinMatches('4321', stored('shop').staffPin), true);
});

test('saving: a save cannot set, replace or remove the PIN (only POST /lp/staff-pin can)', async () => {
  h.reset(); const pin = h.staffPin.hashPin('4321');
  h.page('shop', { sections: { language: 'en', staffPin: pin } });
  await save('shop', 'Bearer user_owner', { language: 'en', staffPin: 'attacker-hash' });
  assert.equal(stored('shop').staffPin, pin, 'replace refused');
  await save('shop', 'Bearer user_owner', { language: 'en', staffPin: null });
  assert.equal(stored('shop').staffPin, pin, 'remove refused');
  h.reset(); h.page('nopin', { sections: { language: 'en' } });
  await save('nopin', 'Bearer user_owner', { language: 'en', staffPin: h.staffPin.hashPin('1111') });
  assert.equal(stored('nopin').staffPin, undefined, 'set refused');
  h.reset();
  await save('brand-new-page', null, { language: 'en', staffPin: 'x' });
  assert.equal(stored('brand-new-page').staffPin, undefined, 'a new page cannot bring its own PIN');
});

test('saving another owner\'s page is still refused (unchanged)', async () => {
  h.reset(); const pin = h.staffPin.hashPin('4321');
  h.page('shop', { sections: { staffPin: pin } });
  assert.equal((await save('shop', 'Bearer user_other', { language: 'en' })).statusCode, 403);
  assert.equal((await save('shop', null, { language: 'en' })).statusCode, 401);
  assert.equal(stored('shop').staffPin, pin);
});

test('every Admin caller sends the sign-in with the page record request', () => {
  const vge = PUB('js/voice-greeting-editor.js');
  assert.ok(vge.includes("var read = Promise.resolve(authToken()).then(function (tok) { return fetch(pageUrl, tok ? { headers: { 'Authorization': 'Bearer ' + tok } } : undefined); });"));
  assert.ok(!vge.includes(': fetch(pageUrl);'), 'no unsigned branch left');
  const sqd = PUB('smart-qr-detail.html');
  assert.ok(sqd.includes(require('./helpers/phase0Revert').SQD_NEW), 'the overview fallback');
  assert.ok(sqd.includes("headers: _apiToken ? { Authorization: 'Bearer ' + _apiToken } : {}"), 'the page load (unchanged)');
  assert.ok(PUB('smart-editor.js').includes("var res=await fetch(API+'/api/lp/'+SE.slug,{headers:h});"), 'the editor (unchanged)');
  assert.ok(/fetch\(API\+'\/api\/lp\/'\+encodeURIComponent\(slug\), \{headers:h\}\)/.test(PUB('wallet-pass-studio.html')), 'Wallet Pass Studio (unchanged)');
});

h.run('lpGetAuth', tests);
