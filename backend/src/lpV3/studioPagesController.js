/**
 * lpV3/studioPagesController.js — Landing Page Studio V3: the signed-in
 * owner's own landing pages, for the Studio.
 *
 *   GET /studio/pages               the owner's pages (LandingPage.userId)
 *   GET /studio/pages/:slug/design  one page as a V3 design: its saved
 *                                   PageDesign draft, or else the legacy page
 *                                   converted in memory (importLegacy.js)
 *   PUT /studio/pages/:slug/design  Phase B: save the Studio draft
 *                                   { design, baseRevision }
 *
 * All run behind requireAuth (the Clerk session, req.userId); the PUT also
 * behind requireVerifiedEmail (Phase D1, draftPolicy.js). Ownership is
 * LandingPage.userId === req.userId and nothing else; pages without an owner
 * (StadtPocket, platform pages) are never listed and answer 404. The two
 * GETs write nothing; converting a legacy page happens in memory.
 *
 * The PUT writes exactly one row: the page's PageDesign (draft,
 * draftRevision, updatedByUserId). It never touches the LandingPage
 * (sections, renderer, status: the live page stays as it is), never writes a
 * PageDesignVersion or publishedVersionId (no publishing), and calls no
 * plan, trial or billing code: saving a draft is free.
 *
 * Concurrency: draftRevision is a compare-and-swap. A save names the
 * revision it was based on (null: no draft yet); it succeeds only while that
 * is still the stored revision, otherwise 409 revision_conflict. The first
 * save creates the row (landingPageId is unique, so of two simultaneous first
 * saves one wins and the other gets 409). Nothing is overwritten silently.
 */
'use strict';
const prisma = require('../utils/prismaClient');
const V3 = require('./core');
const { importLegacyPage } = require('./importLegacy');

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const MAX_PAGES = 200;
// Which kind of page a use case is (onboarding and section defaults later);
// anything unknown counts as a business page.
const CREATOR_USE_CASES = ['creator', 'artist_music', 'event', 'music'];
const PAGE_FIELDS = { id: true, slug: true, businessName: true, userId: true, status: true, useCase: true, renderer: true, brandColor: true, logoUrl: true, websiteUrl: true, sections: true, updatedAt: true };

function kindOf(useCase) { return CREATOR_USE_CASES.includes(useCase) ? 'creator' : 'business'; }
function noStore(res) { if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store'); }
function cloudName() { return process.env.CLOUDINARY_CLOUD_NAME || undefined; }
function summary(p) {
  return { slug: p.slug, name: p.businessName, status: p.status, live: p.status !== 'draft', useCase: p.useCase || null, kind: kindOf(p.useCase), renderer: p.renderer || 'legacy' };
}
// The V3 tables come with the Studio migration; where it is not applied yet
// (any database before Phase B) a page simply has no saved draft.
function tableMissing(e) { return !!e && (e.code === 'P2021' || /does not exist/i.test(String(e.message || ''))); }
// The page, when it is the signed-in owner's; otherwise the answer is sent (null).
async function ownPage(req, res, select) {
  const { slug } = req.params;
  if (typeof slug !== 'string' || !SLUG.test(slug)) { res.status(400).json({ error: 'invalid_slug' }); return null; }
  const page = await prisma.landingPage.findUnique({ where: { slug }, select });
  // unknown and ownerless pages look the same: not found
  if (!page || !page.userId) { res.status(404).json({ error: 'not_found' }); return null; }
  if (page.userId !== req.userId) { res.status(403).json({ error: 'forbidden' }); return null; }
  return page;
}

// GET /studio/pages
async function listStudioPages(req, res) {
  noStore(res);
  try {
    // the signed-in customer as QRAIVY knows them (read only; pages are owned
    // by LandingPage.userId, so a missing User row only means "no account row yet")
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true } });
    const pages = await prisma.landingPage.findMany({
      where: { userId: req.userId },
      select: { id: true, slug: true, businessName: true, status: true, useCase: true, renderer: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PAGES,
    });
    let withDraft = new Set();
    if (pages.length) {
      try {
        const drafts = await prisma.pageDesign.findMany({ where: { landingPageId: { in: pages.map((p) => p.id) } }, select: { landingPageId: true } });
        withDraft = new Set(drafts.map((d) => d.landingPageId));
      } catch (e) { if (!tableMissing(e)) throw e; }
    }
    return res.json({
      account: { known: !!user },
      pages: pages.map((p) => Object.assign(summary(p), { hasDraft: withDraft.has(p.id), updatedAt: p.updatedAt })),
    });
  } catch (e) {
    console.error('[StudioPages] list error:', e && e.message);
    return res.status(500).json({ error: 'Failed to load your pages.' });
  }
}

// GET /studio/pages/:slug/design
async function getStudioPageDesign(req, res) {
  noStore(res);
  try {
    const page = await ownPage(req, res, PAGE_FIELDS);
    if (!page) return undefined;

    let stored = null;
    try {
      stored = await prisma.pageDesign.findUnique({ where: { landingPageId: page.id }, select: { draft: true, draftRevision: true, updatedAt: true } });
    } catch (e) { if (!tableMissing(e)) throw e; }

    if (stored) {
      const checked = V3.validateDesign(stored.draft, { cloudName: cloudName() });
      if (!checked.ok) return res.status(422).json({ error: 'stored_draft_invalid', page: summary(page) });
      return res.json({ page: summary(page), source: 'draft', revision: stored.draftRevision, savedAt: stored.updatedAt, design: checked.design, warnings: [] });
    }
    // the legacy page, converted in memory only (the row is not changed)
    const imported = importLegacyPage(page, { cloudName: cloudName() });
    if (!imported.ok) return res.status(422).json({ error: 'import_failed', reason: imported.reason, page: summary(page) });
    return res.json({ page: summary(page), source: 'legacy_import', revision: null, savedAt: null, design: imported.draft, warnings: imported.warnings });
  } catch (e) {
    console.error('[StudioPages] design error:', e && e.message);
    return res.status(500).json({ error: 'Failed to load the page.' });
  }
}

// 409 with the stored revision (never the stored content)
async function conflict(res, landingPageId) {
  const now = await prisma.pageDesign.findUnique({ where: { landingPageId }, select: { draftRevision: true, updatedAt: true } });
  return res.status(409).json({ error: 'revision_conflict', currentRevision: now ? now.draftRevision : null, savedAt: now ? now.updatedAt : null });
}
function uniqueClash(e) { return !!e && e.code === 'P2002'; }
function validBase(v) { return v === null || (Number.isInteger(v) && v >= 1 && v < 2147483647); }

// PUT /studio/pages/:slug/design  { design, baseRevision }
async function saveStudioPageDesign(req, res) {
  noStore(res);
  const body = req.body;
  if (typeof req.params.slug !== 'string' || !SLUG.test(req.params.slug)) return res.status(400).json({ error: 'invalid_slug' });
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('design' in body) || !validBase(body.baseRevision)) return res.status(400).json({ error: 'invalid_body' });
  const base = body.baseRevision;
  try {
    const page = await ownPage(req, res, { id: true, userId: true });
    if (!page) return undefined;
    // the whole design, on the server, with the shared rules and size limit
    const checked = V3.validateDesign(body.design, { cloudName: cloudName() });
    if (!checked.ok) return res.status(422).json({ error: 'design_invalid', errors: checked.errors.slice(0, V3.LIMITS.errors) });

    const savedAt = new Date();
    const data = { draft: checked.design, schemaVersion: V3.SCHEMA_VERSION, updatedByUserId: req.userId, updatedAt: savedAt };
    let revision;
    try {
      if (base === null) {
        // no draft yet: create it; a draft that exists already (another tab) is a conflict
        await prisma.pageDesign.create({ data: Object.assign({ landingPageId: page.id, draftRevision: 1 }, data) });
        revision = 1;
      } else {
        const r = await prisma.pageDesign.updateMany({ where: { landingPageId: page.id, draftRevision: base }, data: Object.assign({ draftRevision: { increment: 1 } }, data) });
        if (r.count !== 1) return conflict(res, page.id);
        revision = base + 1;
      }
    } catch (e) {
      if (uniqueClash(e)) return conflict(res, page.id);
      if (tableMissing(e)) return res.status(503).json({ error: 'drafts_unavailable' });
      throw e;
    }
    return res.json({ revision, savedAt, design: checked.design });
  } catch (e) {
    console.error('[StudioPages] save error:', e && e.message);
    return res.status(500).json({ error: 'Failed to save the draft.' });
  }
}

module.exports = { listStudioPages, getStudioPageDesign, saveStudioPageDesign, kindOf, summary, SLUG, MAX_PAGES };
