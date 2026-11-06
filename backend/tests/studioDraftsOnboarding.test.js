// ============================================================
// studioDraftsOnboarding.test.js — Landing Page Studio V3 D2.1: creating a
// draft from the onboarding in one request (POST /studio/drafts with
// { design, origin }), production mode (live Clerk email lookup).
//
// The real routes, requireAuth and requireVerifiedEmail on the in-memory
// database of helpers/studioPagesServer.js. Checked: the onboarding's page
// (Steps 2-5, repeated Custom Sections) becomes the draft exactly as checked by
// core.validateDesign (ids, order, content), with the allowlisted origin in
// PageDesign.origin, in the same three writes as D1; invalid designs (422) and
// origins (400) write nothing; the replay key covers design and origin; the
// draft limit, the 24-hour limit and the per-account lock hold with designs;
// the owner is the session only; no User, plan or trial change; the draft is
// not public; GET returns it, PUT saves it and leaves origin as it was;
// creating without a design is unchanged (D1, its replay key included).
//
// Run: node tests/studioDraftsOnboarding.test.js
// ============================================================
const S = require('./helpers/studioPagesServer.js'); // first: it prepares the module cache
const assert = require('assert/strict');
const crypto = require('crypto');
const V3 = require('../src/lpV3/core');
const { LIMITS } = require('../src/lpV3/draftPolicy');
const { requestHash, FIELDS, ORIGIN_FIELDS } = require('../src/lpV3/studioDraftsController');
const { countSmartPages } = require('../src/utils/tierSystem');
const { publicDraftGuard } = require('../src/middleware/publicDraftGuard');
const M = require('../../frontend/public/js/studio/onboarding-model.js');
const T = require('../../frontend/public/js/studio/onboarding-templates.js');

// the template photos live on QRAIVY's Cloudinary account (production's cloud name); the helper sets test-cloud
const CLOUD = 'dwqc6n7rn';
const useCloud = (name) => { process.env.CLOUDINARY_CLOUD_NAME = name; };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let srv;
async function call(method, p, token, body) {
  const headers = Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, body !== undefined ? { 'Content-Type': 'application/json' } : {});
  const r = await fetch(srv.origin + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, body: json, cache: r.headers.get('cache-control') };
}
const create = (token, body) => call('POST', '/studio/drafts', token, body);
const uuid = () => crypto.randomUUID();
const newPages = () => S.db.pages.filter((p) => String(p.id).startsWith('lp_new_'));
const designOf = (slug) => S.db.pageDesigns.find((d) => d.landingPageId === S.db.pages.find((p) => p.slug === slug).id);
const clone = (v) => JSON.parse(JSON.stringify(v));

// The onboarding's page as Save Draft will send it: M.pageFor(...).draft (no demo-only data), Custom Sections in a customised order
const CUSTOM_ORDER = ['hero', 'custom:aaaa1111', 'buttons', 'products', 'custom:bbbb2222', 'contact', 'socialMedia', 'custom:cccc3333'];
function onboarding(lang = 'en', template = 'restaurant', sections = CUSTOM_ORDER) {
  const tpl = T.get(template);
  const answers = { template, palette: tpl.palettes[1].id, name: lang === 'de' ? 'Café Sonne' : 'Cafe Sonne', description: lang === 'de' ? 'Frische Pasta.' : 'Fresh pasta every day.',
    links: [{ platform: 'instagram', url: 'instagram.com/cafesonne' }], social: 'auto', sections };
  const p = M.pageFor(V3, T, answers, lang);
  assert.ok(p.ok && p.draft, 'onboarding page builds');
  return { design: clone(p.draft), origin: { source: 'onboarding', template, palette: answers.palette, language: lang, exampleSectionIds: p.exampleIds.slice() }, name: answers.name, ids: p.draft.pages[0].sections.map((s) => s.id) };
}
const CUSTOM_IDS = ['s_caaaa1111', 's_cbbbb2222', 's_ccccc3333'];

test('migration: one additive, nullable JSONB column PageDesign.origin (no default, no index, no backfill); schema.prisma declares origin Json? on PageDesign only', () => {
  const fs = require('fs'), path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20261107090000_add_page_design_origin', 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(sql, '-- AlterTable\nALTER TABLE "PageDesign" ADD COLUMN     "origin" JSONB;\n');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const model = schema.slice(schema.indexOf('model PageDesign {'), schema.indexOf('\n}\n', schema.indexOf('model PageDesign {')) + 1);
  assert.match(model, /\n  origin\s+Json\?\n/);
  assert.equal((schema.match(/\borigin\s+Json\?/g) || []).length, 1, 'only on PageDesign');
});

test('fields: name, language, kind, requestId and (D2.1) design, origin; origin allowlist: source, template, palette, language, exampleSectionIds', () => {
  assert.deepEqual(FIELDS, ['name', 'language', 'kind', 'requestId', 'design', 'origin']);
  assert.deepEqual(ORIGIN_FIELDS, ['source', 'template', 'palette', 'language', 'exampleSectionIds']);
});

test('create with the onboarding design: 201, the stored draft is the checked design (ids and order of three Custom Sections, content), origin stored, revision 1; the same three writes as D1; no User, plan, trial or public page', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const usersBefore = S.copy(S.db.users), writesBefore = S.writes.slice(), pagesCount = await countSmartPages(S.CARL);
  const r = await create('tok_carl', { name: o.name, language: 'en', kind: 'business', requestId: uuid(), design: o.design, origin: o.origin });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.cache, 'private, no-store');
  assert.deepEqual(Object.keys(r.body).sort(), ['created', 'design', 'page', 'revision']);
  assert.deepEqual([r.body.created, r.body.revision, r.body.page.status, r.body.page.live, r.body.page.name], [true, 1, 'draft', false, 'Cafe Sonne']);
  const stored = designOf(r.body.page.slug);
  const checked = V3.validateDesign(o.design, { cloudName: CLOUD }).design;
  assert.deepEqual(stored.draft, checked, 'the checked design, unchanged');
  assert.deepEqual(r.body.design, checked);
  assert.deepEqual(stored.draft.pages[0].sections.map((s) => s.id), o.ids, 'ids and order');
  assert.deepEqual(stored.draft.pages[0].sections.filter((s) => s.id.startsWith('s_c')).map((s) => s.id), CUSTOM_IDS);
  assert.ok(stored.draft.pages[0].sections.filter((s) => s.id.startsWith('s_c')).every((s) => s.type === 'text' && !s.data.heading && !s.data.body), 'Custom Sections empty');
  assert.deepEqual(stored.origin, o.origin, 'origin stored as sent (allowlisted)');
  assert.deepEqual([stored.draftRevision, stored.updatedByUserId], [1, S.CARL]);
  assert.deepEqual(S.draftWrites.map((w) => w.op), ['studioDraftCreation.deleteMany', 'landingPage.create', 'pageDesign.create', 'studioDraftCreation.create']);
  const row = S.db.pages.find((p) => p.slug === r.body.page.slug);
  assert.deepEqual([row.userId, row.status, row.renderer, row.sections], [S.CARL, 'draft', 'legacy', null]);
  assert.deepEqual(S.db.users, usersBefore, 'no User row created or changed (plan, trial)');
  assert.deepEqual(S.writes, writesBefore, 'no other write');
  assert.equal(await countSmartPages(S.CARL), pagesCount, 'drafts never count as Smart Pages');
  // not public: every guarded public route answers 404
  const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } };
  let passed = false;
  await publicDraftGuard()({ params: { slug: r.body.page.slug } }, res, () => { passed = true; });
  assert.deepEqual([res.code, passed], [404, false]);
  // German too
  const de = onboarding('de', 'creator', ['hero', 'socialMedia', 'custom:dddd4444', 'buttons', 'custom:eeee5555']);
  const rd = await create('tok_carl', { name: de.name, language: 'de', kind: 'creator', design: de.design, origin: de.origin });
  assert.equal(rd.status, 201, JSON.stringify(rd.body));
  assert.deepEqual(designOf(rd.body.page.slug).draft.pages[0].sections.map((s) => s.id), de.ids);
  assert.deepEqual([rd.body.design.settings.language, rd.body.page.kind], ['de', 'creator']);
});

test('the design without origin is accepted (origin stays empty); origin is never stored without a design', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(designOf(r.body.page.slug).origin, undefined, 'no origin written');
  const bad = await create('tok_carl', { name: 'X', origin: { source: 'onboarding' } });
  assert.deepEqual([bad.status, bad.body.error, bad.body.field], [400, 'invalid_body', 'origin']);
});

test('without a design: unchanged D1 behaviour (starter Hero, no origin) and the D1 replay key (older log rows still match)', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const id = uuid();
  const r = await create('tok_carl', { name: 'Plain Page', language: 'de', requestId: id });
  assert.equal(r.status, 201);
  const stored = designOf(r.body.page.slug);
  assert.deepEqual([stored.draft.pages[0].sections.length, stored.draft.pages[0].sections[0].type, stored.draft.pages[0].sections[0].data.headline, stored.origin], [1, 'hero', 'Plain Page', undefined]);
  const log = S.db.draftLog.find((l) => l.requestId === id);
  assert.equal(log.requestHash, crypto.createHash('sha256').update(JSON.stringify(['Plain Page', 'de', 'business'])).digest('hex'), 'the D1 hash');
  assert.equal(requestHash({ name: 'Plain Page', language: 'de', kind: 'business', design: null, origin: null }), log.requestHash);
  const again = await create('tok_carl', { name: 'Plain Page', language: 'de', requestId: id });
  assert.deepEqual([again.status, again.body.created, again.body.page.slug], [200, false, r.body.page.slug]);
});

test('invalid designs: 422 design_invalid (foreign cloud, two Heroes, bad id, duplicate id, too many sections, unknown field, wrong language), 400 when not an object; nothing written', async () => {
  S.resetDrafts();
  const o = onboarding('en');
  const cases = [];
  cases.push(['foreign cloud (the image account check)', o.design, 'test-cloud']);
  const twoHeroes = clone(o.design); twoHeroes.pages[0].sections.push(Object.assign(clone(twoHeroes.pages[0].sections[0]), { id: 's_hero2x' }));
  cases.push(['two Heroes', twoHeroes, CLOUD]);
  const badId = clone(o.design); badId.pages[0].sections[1].id = 'S_BAD!';
  cases.push(['invalid id', badId, CLOUD]);
  const dupId = clone(o.design); dupId.pages[0].sections[4].id = dupId.pages[0].sections[1].id;
  cases.push(['duplicate Custom Section id', dupId, CLOUD]);
  const many = clone(o.design); for (let i = 0; i < 40; i++) many.pages[0].sections.push({ id: 's_x' + String(i).padStart(4, '0'), type: 'text', variant: 'plain', data: { heading: '', body: '' } });
  cases.push(['more than 40 sections', many, CLOUD]);
  const unknown = clone(o.design); unknown.template = 'restaurant';
  cases.push(['unknown top-level field', unknown, CLOUD]);
  const wrongLang = clone(o.design); wrongLang.settings.language = 'de';
  cases.push(['design language differs from the request', wrongLang, CLOUD]);
  for (const [what, design, cloud] of cases) {
    useCloud(cloud);
    const r = await create('tok_carl', { name: o.name, language: 'en', design });
    assert.deepEqual([r.status, r.body.error], [422, 'design_invalid'], what + ': ' + JSON.stringify(r.body).slice(0, 200));
    assert.ok(Array.isArray(r.body.errors) && r.body.errors.length > 0 && r.body.errors.length <= V3.LIMITS.errors, what);
  }
  useCloud(CLOUD);
  for (const design of ['x', 42, [], true]) {
    const r = await create('tok_carl', { name: 'X', design });
    assert.deepEqual([r.status, r.body.error, r.body.field], [400, 'invalid_body', 'design'], JSON.stringify(design));
  }
  assert.deepEqual([S.draftWrites.length, newPages().length, S.db.draftLog.length], [0, 0, 0], 'nothing written');
});

test('invalid origin: 400 invalid_body with the field (unknown key, source, template, palette, language, example ids: format, duplicates, too many, not in the design); nothing written', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const cases = [
    [{ source: 'onboarding', owner: 'x' }, 'origin.owner'],
    [{ source: 'import' }, 'origin.source'],
    [{}, 'origin.source'],
    [{ source: 'onboarding', template: 'Bad Template' }, 'origin.template'],
    [{ source: 'onboarding', template: 42 }, 'origin.template'],
    [{ source: 'onboarding', palette: '<x>' }, 'origin.palette'],
    [{ source: 'onboarding', language: 'de' }, 'origin.language'],
    [{ source: 'onboarding', exampleSectionIds: 's_obbuttons1' }, 'origin.exampleSectionIds'],
    [{ source: 'onboarding', exampleSectionIds: ['bad id'] }, 'origin.exampleSectionIds'],
    [{ source: 'onboarding', exampleSectionIds: ['s_obbuttons1', 's_obbuttons1'] }, 'origin.exampleSectionIds'],
    [{ source: 'onboarding', exampleSectionIds: Array.from({ length: 41 }, (_, i) => 's_e' + String(i).padStart(4, '0')) }, 'origin.exampleSectionIds'],
    [{ source: 'onboarding', exampleSectionIds: ['s_notthere'] }, 'origin.exampleSectionIds'],
    ['onboarding', 'origin'],
    [['onboarding'], 'origin'],
  ];
  for (const [origin, field] of cases) {
    const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design, origin });
    assert.deepEqual([r.status, r.body.error, r.body.field], [400, 'invalid_body', field], JSON.stringify(origin));
  }
  assert.deepEqual([S.draftWrites.length, newPages().length], [0, 0]);
});

test('replay key covers design and origin: same content -> 200 created false (also with the JSON keys in another order); another design or origin under the same requestId -> 409 request_id_conflict; nothing counted', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const id = uuid();
  const first = await create('tok_carl', { name: o.name, language: 'en', requestId: id, design: o.design, origin: o.origin });
  assert.equal(first.status, 201);
  const logs = S.db.draftLog.length;
  const same = await create('tok_carl', { name: o.name, language: 'en', requestId: id, design: clone(o.design), origin: clone(o.origin) });
  assert.deepEqual([same.status, same.body.created, same.body.page.slug, same.body.revision], [200, false, first.body.page.slug, 1]);
  assert.deepEqual(same.body.design, first.body.design, 'the stored design');
  // the same page with its keys in another order: the checked design is identical
  const shuffled = Object.fromEntries(Object.entries(o.design).reverse());
  assert.equal((await create('tok_carl', { name: o.name, language: 'en', requestId: id, design: shuffled, origin: o.origin })).status, 200, 'key order does not matter');
  const otherDesign = clone(o.design); otherDesign.pages[0].sections.splice(1, 1);
  assert.deepEqual([(await create('tok_carl', { name: o.name, language: 'en', requestId: id, design: otherDesign, origin: o.origin })).body.error], ['request_id_conflict']);
  const otherOrigin = Object.assign(clone(o.origin), { palette: T.get('restaurant').palettes[0].id });
  assert.deepEqual([(await create('tok_carl', { name: o.name, language: 'en', requestId: id, design: o.design, origin: otherOrigin })).body.error], ['request_id_conflict']);
  assert.equal((await create('tok_carl', { name: o.name, language: 'en', requestId: id })).body.error, 'request_id_conflict', 'without the design: a different request');
  assert.deepEqual([S.db.draftLog.length, newPages().length], [logs, 1], 'nothing counted, one draft');
  // simultaneous retries of one onboarding save create one draft
  S.resetDrafts();
  const id2 = uuid();
  const all = await Promise.all(Array.from({ length: 6 }, () => create('tok_carl', { name: o.name, language: 'en', requestId: id2, design: o.design, origin: o.origin })));
  assert.deepEqual(all.map((x) => x.status).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(all.map((x) => x.body.page.slug)).size, 1);
  assert.equal(newPages().length, 1);
});

test('limits hold with designs: the 4th unpublished draft is 409 draft_limit; 10 simultaneous creations -> exactly 3; the 6th creation in 24 hours is 429', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const body = () => ({ name: o.name, language: 'en', design: o.design, origin: o.origin });
  for (let i = 0; i < LIMITS.activeDrafts; i++) assert.equal((await create('tok_carl', body())).status, 201);
  const fourth = await create('tok_carl', body());
  assert.deepEqual([fourth.status, fourth.body.error, fourth.body.limit], [409, 'draft_limit', LIMITS.activeDrafts]);
  S.resetDrafts();
  const all = await Promise.all(Array.from({ length: 10 }, () => create('tok_carl', body())));
  assert.deepEqual([all.filter((x) => x.status === 201).length, all.filter((x) => x.status === 409).length], [3, 7]);
  assert.equal(S.db.pages.filter((p) => p.userId === S.CARL && p.status === 'draft').length, 3);
  // 24 hours: delete the drafts (the log stays) and create until the window is full
  S.resetDrafts();
  for (let i = 0; i < LIMITS.creationsPerWindow; i++) {
    const r = await create('tok_carl', body());
    assert.equal(r.status, 201, 'creation ' + (i + 1));
    const p = S.db.pages.find((x) => x.slug === r.body.page.slug);
    S.db.pages.splice(S.db.pages.indexOf(p), 1);
    S.db.pageDesigns.splice(S.db.pageDesigns.findIndex((d) => d.landingPageId === p.id), 1);
  }
  const sixth = await create('tok_carl', body());
  assert.deepEqual([sixth.status, sixth.body.error], [429, 'draft_rate_limit']);
});

test('ownership: the owner is the session only (userId, status, slug in the body: 400); unverified email 403; signed out 401; another account cannot read or save the draft; nothing written for refused requests', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  for (const field of ['userId', 'status', 'slug', 'plan', 'trialExpiresAt']) {
    const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design, [field]: 'x' });
    assert.deepEqual([r.status, r.body.field], [400, field], field);
  }
  assert.equal((await create('tok_dana', { name: o.name, language: 'en', design: o.design, origin: o.origin })).status, 403, 'unverified email');
  assert.equal((await create(null, { name: o.name, language: 'en', design: o.design })).status, 401);
  assert.deepEqual([S.draftWrites.length, newPages().length], [0, 0]);
  const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design, origin: o.origin });
  assert.equal(r.status, 201);
  const slug = r.body.page.slug;
  assert.equal(S.db.pages.find((p) => p.slug === slug).userId, S.CARL);
  assert.equal((await call('GET', '/studio/pages/' + slug + '/design', 'tok_ben')).status, 403);
  assert.equal((await call('PUT', '/studio/pages/' + slug + '/design', 'tok_ben', { design: r.body.design, baseRevision: 1 })).status, 403);
  assert.equal(designOf(slug).draftRevision, 1, 'unchanged');
});

test('round trip: GET returns the onboarding draft exactly; PUT 1 -> 2 keeps ids and order; origin stays as created', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design, origin: o.origin });
  const slug = r.body.page.slug;
  const g = await call('GET', '/studio/pages/' + slug + '/design', 'tok_carl');
  assert.deepEqual([g.status, g.body.source, g.body.revision], [200, 'draft', 1]);
  assert.deepEqual(g.body.design, r.body.design);
  const edited = clone(g.body.design);
  edited.pages[0].sections.find((s) => s.id === 's_cbbbb2222').data.heading = 'Our story';
  const put = await call('PUT', '/studio/pages/' + slug + '/design', 'tok_carl', { design: edited, baseRevision: 1 });
  assert.deepEqual([put.status, put.body.revision], [200, 2]);
  const stored = designOf(slug);
  assert.deepEqual(stored.draft.pages[0].sections.map((s) => s.id), o.ids);
  assert.equal(stored.draft.pages[0].sections.find((s) => s.id === 's_cbbbb2222').data.heading, 'Our story');
  assert.deepEqual(stored.origin, o.origin, 'a save leaves origin unchanged');
  assert.equal((await call('PUT', '/studio/pages/' + slug + '/design', 'tok_carl', { design: edited, baseRevision: 1 })).status, 409, 'stale revision');
});

test('atomic with a design: a failure after the page row leaves nothing (page, design with origin, log)', async () => {
  S.resetDrafts(); useCloud(CLOUD);
  const o = onboarding('en');
  S.opts.failDraftAfterPage = true;
  try {
    const r = await create('tok_carl', { name: o.name, language: 'en', design: o.design, origin: o.origin });
    assert.equal(r.status, 500);
  } finally { S.opts.failDraftAfterPage = false; }
  assert.deepEqual([newPages().length, S.db.pageDesigns.filter((d) => String(d.landingPageId).startsWith('lp_new_')).length, S.db.draftLog.length], [0, 0, 0]);
});

(async () => {
  srv = await S.start();
  let passed = 0, failed = 0;
  console.log('studioDraftsOnboarding');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + String(e && e.message).split('\n').slice(0, 14).join('\n       ')); }
  }
  S.resetDrafts();
  useCloud('test-cloud');
  await srv.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
