/**
 * lpV3/studioPagesController.js — Landing Page Studio V3, Phase A: the
 * signed-in owner's own landing pages, for the Studio. READ ONLY.
 *
 *   GET /studio/pages               the owner's pages (LandingPage.userId)
 *   GET /studio/pages/:slug/design  one page as a V3 design: its saved
 *                                   PageDesign draft, or else the legacy page
 *                                   converted in memory (importLegacy.js)
 *
 * Both run behind requireAuth (the Clerk session, req.userId). Ownership is
 * LandingPage.userId === req.userId and nothing else; pages without an owner
 * (StadtPocket, platform pages) are never listed and answer 404. Nothing here
 * writes: no LandingPage change (sections, renderer, status untouched), no
 * PageDesign row, no User row. Converting a legacy page happens in memory
 * and is never stored.
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
  const { slug } = req.params;
  if (typeof slug !== 'string' || !SLUG.test(slug)) return res.status(400).json({ error: 'invalid_slug' });
  try {
    const page = await prisma.landingPage.findUnique({ where: { slug }, select: PAGE_FIELDS });
    // unknown and ownerless pages look the same: not found
    if (!page || !page.userId) return res.status(404).json({ error: 'not_found' });
    if (page.userId !== req.userId) return res.status(403).json({ error: 'forbidden' });

    let stored = null;
    try {
      stored = await prisma.pageDesign.findUnique({ where: { landingPageId: page.id }, select: { draft: true, draftRevision: true } });
    } catch (e) { if (!tableMissing(e)) throw e; }

    if (stored) {
      const checked = V3.validateDesign(stored.draft, { cloudName: cloudName() });
      if (!checked.ok) return res.status(422).json({ error: 'stored_draft_invalid', page: summary(page) });
      return res.json({ page: summary(page), source: 'draft', revision: stored.draftRevision, design: checked.design, warnings: [] });
    }
    // the legacy page, converted in memory only (the row is not changed)
    const imported = importLegacyPage(page, { cloudName: cloudName() });
    if (!imported.ok) return res.status(422).json({ error: 'import_failed', reason: imported.reason, page: summary(page) });
    return res.json({ page: summary(page), source: 'legacy_import', revision: null, design: imported.draft, warnings: imported.warnings });
  } catch (e) {
    console.error('[StudioPages] design error:', e && e.message);
    return res.status(500).json({ error: 'Failed to load the page.' });
  }
}

module.exports = { listStudioPages, getStudioPageDesign, kindOf, SLUG, MAX_PAGES };
