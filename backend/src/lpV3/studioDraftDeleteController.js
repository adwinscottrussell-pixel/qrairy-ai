/**
 * lpV3/studioDraftDeleteController.js — Landing Page Studio V3, Delete draft:
 *
 *   DELETE /studio/pages/:slug[?revision=N]   the signed-in owner's own
 *                                             UNPUBLISHED Studio draft
 *
 * Behind requireAuth and requireVerifiedEmail (studioPagesRoutes.js), as
 * creating and saving a draft. Kept apart from studioPagesController.js (read
 * and save only, which never deletes or names publishing) like the draft
 * creation (studioDraftsController.js). The deletion itself is the shared
 * page deletion (lpV3/draftDeletion.js: the same three operations as
 * the legacy DELETE /lp/:slug, which stays as it is and closed on staging).
 */
'use strict';
const prisma = require('../utils/prismaClient');
const { deletionSteps } = require('./draftDeletion');
const { pageCache } = require('../utils/pageCache');

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
function noStore(res) { if (typeof res.set === 'function') res.set('Cache-Control', 'private, no-store'); }
function tableMissing(e) { return !!e && (e.code === 'P2021' || /does not exist/i.test(String(e.message || ''))); }
function validBase(v) { return Number.isInteger(v) && v >= 1 && v < 2147483647; }

// DELETE /studio/pages/:slug[?revision=N]  "Delete draft": the owner's own UNPUBLISHED Studio draft, nothing else.
// The rules (all checked again inside the transaction, under the same per-account lock POST /studio/drafts takes, so a
// deletion and a draft creation of one account never interleave and the 3-draft limit always counts what is there):
//   - signed in (requireAuth) with a verified email (requireVerifiedEmail), as for creating and saving a draft
//   - the page's owner only: unknown and ownerless pages 404, another account's page 403 (as GET / PUT)
//   - an unpublished draft only: LandingPage.status 'draft' (only a Studio draft creation writes it; the legacy editor never
//     does, and refuses to change such a page) and no published V3 version; anything live or published: 409 not_a_draft
//   - ?revision=N (optional, the revision the Studio shows): when the draft has been saved since (another tab), 409
//     revision_conflict and nothing is deleted
// The deletion itself is the shared one (lpV3/draftDeletion.js, the same as the legacy DELETE /lp/:slug): stamp
// tokens, the page (its PageDesign goes with it), and the record that keeps the address reserved. No plan, trial or billing
// code; the draft limit and the 24-hour creation limit are unchanged (StudioDraftCreation rows stay).
class Refusal { constructor(status, body) { this.status = status; this.body = body; } }
function draftLockKey(userId) { return 'studio-draft:' + userId; }   // the key POST /studio/drafts locks (studioDraftsController.js)
async function deleteStudioDraft(req, res) {
  noStore(res);
  const { slug } = req.params;
  if (typeof slug !== 'string' || !SLUG.test(slug)) return res.status(400).json({ error: 'invalid_slug' });
  let revision = null;
  if (req.query && req.query.revision !== undefined) {
    revision = /^[1-9][0-9]{0,9}$/.test(String(req.query.revision)) ? Number(req.query.revision) : NaN;
    if (!validBase(revision)) return res.status(400).json({ error: 'invalid_revision' });
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${draftLockKey(req.userId)}, 0))`;
      const page = await tx.landingPage.findUnique({ where: { slug }, select: { id: true, userId: true, status: true } });
      if (!page || !page.userId) throw new Refusal(404, { error: 'not_found' });
      if (page.userId !== req.userId) throw new Refusal(403, { error: 'forbidden' });
      if (page.status !== 'draft') throw new Refusal(409, { error: 'not_a_draft' });
      const design = await tx.pageDesign.findUnique({ where: { landingPageId: page.id }, select: { draftRevision: true, publishedVersionId: true } });
      if (design && design.publishedVersionId) throw new Refusal(409, { error: 'not_a_draft' });
      if (revision !== null && design && design.draftRevision !== revision) throw new Refusal(409, { error: 'revision_conflict', currentRevision: design.draftRevision });
      for (const step of deletionSteps(tx, { slug, actorId: req.userId, metadata: { pageId: page.id, ownerless: false, source: 'studio_draft' } })) await step();
    }, { maxWait: 10000, timeout: 20000 });
    pageCache.delByPrefix('lp:' + slug);
    pageCache.delByPrefix('stamp:' + slug);
    return res.json({ ok: true, deleted: slug });
  } catch (e) {
    if (e instanceof Refusal) return res.status(e.status).json(e.body);
    if (tableMissing(e)) return res.status(503).json({ error: 'drafts_unavailable' });
    console.error('[StudioPages] delete error:', e && e.message);
    return res.status(500).json({ error: 'Failed to delete the draft.' });
  }
}

module.exports = { deleteStudioDraft, draftLockKey };
