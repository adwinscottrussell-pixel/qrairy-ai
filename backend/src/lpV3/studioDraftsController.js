/**
 * lpV3/studioDraftsController.js — Landing Page Studio V3 (Phase D1): create
 * an unpublished Studio draft.
 *
 *   POST /studio/drafts  { name?, language?, kind?, requestId?, design?, origin? }
 *
 * Behind requireAuth and requireVerifiedEmail (draftPolicy.js). The owner is
 * the verified session's account (req.userId) and nothing else; the body may
 * carry only the six fields above, so an owner, verification flag, status or
 * address sent by the client is refused (400), never read.
 *
 * D2.1 (onboarding Save Draft): design is the page the onboarding built (core
 * design, checked here by V3.validateDesign with the server's cloud name, the
 * same rules as PUT /studio/pages/:slug/design; its settings.language must be
 * the request's language) and becomes the new draft instead of the starter
 * Hero, in the same transaction. origin is metadata about where the page came
 * from, allowlisted (source 'onboarding', template, palette, language,
 * exampleSectionIds: ids of sections in the design), stored in
 * PageDesign.origin, never rendered and never used for any decision. origin
 * needs a design. Without a design nothing changes (the starter Hero).
 *
 * One success writes, in one transaction:
 *   LandingPage          status 'draft', renderer 'legacy', owner req.userId,
 *                        no legacy sections (never served: public routes
 *                        answer 404 for drafts, POST /lp refuses them)
 *   PageDesign           the starter design (or the checked onboarding design, D2.1), revision 1,
 *                        origin (D2.1, only with a design)
 *   StudioDraftCreation  the creation log (kept when the draft is deleted)
 * It never writes the User row, a plan, a trial, billing or a published version.
 *
 * Limits (draftPolicy.LIMITS): 3 unpublished drafts per account (409
 * draft_limit), 5 creations per rolling 24 hours (429 draft_rate_limit).
 * Concurrency: the transaction first takes a PostgreSQL advisory lock for the
 * account (pg_advisory_xact_lock, released at commit or rollback), then
 * counts and inserts. Simultaneous requests of one account therefore run one
 * after another, each seeing the rows the previous one committed, and cannot
 * pass the limits together. Other accounts are not blocked.
 *
 * Idempotency: a requestId (UUID) is unique per account. Sending it again
 * with the same name, language, kind and (D2.1) the same checked design and
 * origin returns the same draft (200, created: false) and counts nothing; with
 * other values it is 409 request_id_conflict; when that draft was deleted, 409
 * request_id_used. Without a design the hash is the one D1 stored.
 */
'use strict';
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const V3 = require('./core');
const { LIMITS, draftSlug } = require('./draftPolicy');
const { retainedDataFor } = require('../services/slugReservation');
const { summary } = require('./studioPagesController');

const FIELDS = ['name', 'language', 'kind', 'requestId', 'design', 'origin'];
const ORIGIN_FIELDS = ['source', 'template', 'palette', 'language', 'exampleSectionIds'];
const CHOICE_ID = /^[a-z][a-z0-9-]{0,31}$/;
const SECTION_ID = /^s_[a-z0-9]{4,16}$/;
const MAX_EXAMPLE_IDS = 40;
const NAME_MAX = 80;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_NAME = { de: 'Meine Seite', en: 'My page' };
const SLUG_TRIES = 5;
const TX_TRIES = 3;

class Answer extends Error { constructor(status, body, headers) { super(body.error); this.status = status; this.body = body; this.headers = headers; } }

function noStore(res) { if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store'); }
const { imageScope } = require('../data/studioImages');
function cloudName() { return process.env.CLOUDINARY_CLOUD_NAME || undefined; }
function tableMissing(e) { return !!e && (e.code === 'P2021' || /does not exist/i.test(String(e.message || ''))); }
function uniqueOn(e, field) { return !!e && e.code === 'P2002' && JSON.stringify((e.meta && e.meta.target) || e.message || '').includes(field); }

// The request body, checked: { name, language, kind, requestId } or { error }
function readBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body' };
  const unknown = Object.keys(body).filter((k) => !FIELDS.includes(k));
  if (unknown.length) return { error: 'invalid_body', field: unknown[0] };
  const language = body.language === undefined ? 'de' : body.language;
  if (language !== 'de' && language !== 'en') return { error: 'invalid_body', field: 'language' };
  const kind = body.kind === undefined ? 'business' : body.kind;
  if (kind !== 'business' && kind !== 'creator') return { error: 'invalid_body', field: 'kind' };
  let name = DEFAULT_NAME[language];
  if (body.name !== undefined && body.name !== null) {
    if (typeof body.name !== 'string') return { error: 'invalid_body', field: 'name' };
    name = body.name.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
    if (!name || [...name].length > NAME_MAX) return { error: 'invalid_body', field: 'name' };
  }
  let requestId = null;
  if (body.requestId !== undefined && body.requestId !== null) {
    if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId.toLowerCase())) return { error: 'invalid_body', field: 'requestId' };
    requestId = body.requestId.toLowerCase();
  }
  // D2.1: the design is checked later (validateDesign); here only its shape
  let design = null;
  if (body.design !== undefined && body.design !== null) {
    if (!isPlainObject(body.design)) return { error: 'invalid_body', field: 'design' };
    design = body.design;
  }
  let origin = null;
  if (body.origin !== undefined && body.origin !== null) {
    if (!design) return { error: 'invalid_body', field: 'origin' };
    const o = readOrigin(body.origin, language);
    if (o.error) return o;
    origin = o.origin;
  }
  return { name, language, kind, requestId, design, origin };
}
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
// origin, allowlisted: { source: 'onboarding', template, palette, language, exampleSectionIds } (each optional except source)
function readOrigin(v, language) {
  const bad = (k) => ({ error: 'invalid_body', field: 'origin' + (k ? '.' + k : '') });
  if (!isPlainObject(v)) return bad();
  const unknown = Object.keys(v).filter((k) => !ORIGIN_FIELDS.includes(k));
  if (unknown.length) return bad(unknown[0]);
  if (v.source !== 'onboarding') return bad('source');
  const o = { source: 'onboarding' };
  for (const k of ['template', 'palette']) {
    if (v[k] === undefined || v[k] === null) continue;
    if (typeof v[k] !== 'string' || !CHOICE_ID.test(v[k])) return bad(k);
    o[k] = v[k];
  }
  if (v.language !== undefined && v.language !== null) {
    if (v.language !== language) return bad('language');
    o.language = v.language;
  }
  if (v.exampleSectionIds !== undefined && v.exampleSectionIds !== null) {
    const ids = v.exampleSectionIds;
    if (!Array.isArray(ids) || ids.length > MAX_EXAMPLE_IDS || ids.some((x) => typeof x !== 'string' || !SECTION_ID.test(x)) || new Set(ids).size !== ids.length) return bad('exampleSectionIds');
    o.exampleSectionIds = ids.slice();
  }
  return { origin: o };
}
// the checked design: { design } or { error, errors } (validateDesign, the language, origin's section ids in the design).
// Image Phase 1: a new draft holds no images yet, so only the owner's own uploads and the approved
// starter images may be in it (data/studioImages.js imageScope; nothing is "known" for a new page).
function checkDesign(r, userId) {
  const checked = V3.validateDesign(r.design, { cloudName: cloudName(), images: imageScope(userId) });
  if (!checked.ok) return { error: 'design_invalid', errors: checked.errors.slice(0, V3.LIMITS.errors) };
  const lang = checked.design.settings && checked.design.settings.language;
  if (lang !== r.language) return { error: 'design_invalid', errors: [{ path: 'settings.language', code: 'language_mismatch' }] };
  if (r.origin && r.origin.exampleSectionIds) {
    const ids = new Set(checked.design.pages[0].sections.map((s) => s.id));
    const missing = r.origin.exampleSectionIds.filter((x) => !ids.has(x));
    if (missing.length) return { error: 'invalid_body', field: 'origin.exampleSectionIds' };
  }
  return { design: checked.design };
}
// the replay key: D1's (name, language, kind) without a design, so older log rows still match; with one, also the
// checked design and origin (any other content under the same requestId is a conflict)
function requestHash(r, design) {
  const parts = r.design ? [r.name, r.language, r.kind, design, r.origin] : [r.name, r.language, r.kind];
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

// The new draft's design: one Hero with the page name, in its language
function starterDesign(name, language) {
  const hero = V3.starter('hero', language);
  hero.data.headline = name;
  return { schemaVersion: V3.SCHEMA_VERSION, settings: { language }, pages: [{ id: 'start', title: language === 'en' ? 'Home' : 'Start', sections: [Object.assign({ id: 's_' + crypto.randomBytes(5).toString('hex') }, hero)] }] };
}

// An address that is free and not reserved by a deleted page's data. Taken
// for good by the insert itself (slug is unique); a clash retries.
async function freeSlug(name, language) {
  for (let i = 0; i < SLUG_TRIES; i++) {
    const slug = draftSlug(name, language);
    if (await prisma.landingPage.findUnique({ where: { slug }, select: { id: true } })) continue;
    if ((await retainedDataFor(slug)).length) continue;
    return slug;
  }
  throw new Error('no free draft address');
}

async function replay(tx, userId, log, hash) {
  if (log.requestHash !== hash) throw new Answer(409, { error: 'request_id_conflict' });
  const page = log.landingPageId ? await tx.landingPage.findUnique({ where: { id: log.landingPageId } }) : null;
  if (!page || page.userId !== userId) throw new Answer(409, { error: 'request_id_used' });
  const design = await tx.pageDesign.findUnique({ where: { landingPageId: page.id }, select: { draft: true, draftRevision: true } });
  return { status: 200, body: { created: false, page: summary(page), revision: design ? design.draftRevision : null, design: design ? design.draft : null } };
}

async function createInTransaction(userId, r, slug, design) {
  const hash = requestHash(r, design);
  return prisma.$transaction(async (tx) => {
    // one creation per account at a time, until this transaction ends
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'studio-draft:' + userId}, 0))`;
    if (r.requestId) {
      const log = await tx.studioDraftCreation.findUnique({ where: { userId_requestId: { userId, requestId: r.requestId } } });
      if (log) return replay(tx, userId, log, hash);
    }
    const now = new Date();
    const active = await tx.landingPage.count({ where: { userId, status: 'draft' } });
    if (active >= LIMITS.activeDrafts) throw new Answer(409, { error: 'draft_limit', limit: LIMITS.activeDrafts, active });
    const since = new Date(now.getTime() - LIMITS.windowMs);
    const recent = await tx.studioDraftCreation.findMany({ where: { userId, createdAt: { gt: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } });
    if (recent.length >= LIMITS.creationsPerWindow) {
      const free = new Date(recent[recent.length - LIMITS.creationsPerWindow].createdAt).getTime() + LIMITS.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((free - now.getTime()) / 1000));
      throw new Answer(429, { error: 'draft_rate_limit', limit: LIMITS.creationsPerWindow, retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
    }
    await tx.studioDraftCreation.deleteMany({ where: { userId, createdAt: { lt: new Date(now.getTime() - LIMITS.keepLogMs) } } });
    const page = await tx.landingPage.create({
      data: { slug, businessName: r.name, userId, status: 'draft', renderer: 'legacy', useCase: r.kind === 'creator' ? 'creator' : null, sections: null },
    });
    const stored = await tx.pageDesign.create({
      data: Object.assign({ landingPageId: page.id, draft: design, schemaVersion: V3.SCHEMA_VERSION, draftRevision: 1, updatedByUserId: userId }, r.origin ? { origin: r.origin } : {}),
      select: { draftRevision: true },
    });
    await tx.studioDraftCreation.create({ data: { userId, landingPageId: page.id, requestId: r.requestId, requestHash: hash, createdAt: now } });
    return { status: 201, body: { created: true, page: summary(page), revision: stored.draftRevision, design } };
  }, { maxWait: 10000, timeout: 20000 });
}

// POST /studio/drafts
async function createStudioDraft(req, res) {
  noStore(res);
  const r = readBody(req.body);
  if (r.error) return res.status(400).json(r);
  let design;
  if (r.design) {
    // D2.1: the onboarding's page, checked before anything is read or written
    const c = checkDesign(r, req.userId);
    if (c.error === 'invalid_body') return res.status(400).json({ error: c.error, field: c.field });
    if (c.error) return res.status(422).json({ error: c.error, errors: c.errors });
    design = c.design;
  }
  try {
    if (!design) {
      const checked = V3.validateDesign(starterDesign(r.name, r.language), { cloudName: cloudName() });
      if (!checked.ok) throw new Error('starter design invalid');
      design = checked.design;
    }
    for (let attempt = 1; ; attempt++) {
      const slug = await freeSlug(r.name, r.language);
      try {
        const out = await createInTransaction(req.userId, r, slug, design);
        return res.status(out.status).json(out.body);
      } catch (e) {
        // the address was taken meanwhile, or the same requestId committed meanwhile: once more
        if (attempt < TX_TRIES && (uniqueOn(e, 'slug') || uniqueOn(e, 'requestId'))) continue;
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Answer) {
      if (e.headers && typeof res.set === 'function') res.set(e.headers);
      return res.status(e.status).json(e.body);
    }
    if (tableMissing(e)) return res.status(503).json({ error: 'drafts_unavailable' });
    console.error('[StudioDrafts] create error:', e && e.message);
    return res.status(500).json({ error: 'Failed to create the draft.' });
  }
}

module.exports = { createStudioDraft, readBody, readOrigin, starterDesign, requestHash, FIELDS, ORIGIN_FIELDS, NAME_MAX, MAX_EXAMPLE_IDS };
