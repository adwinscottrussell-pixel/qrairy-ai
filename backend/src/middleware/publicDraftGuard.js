/**
 * publicDraftGuard.js — Studio V3 drafts are private (Phase D1).
 * ─────────────────────────────────────────────────────────────
 * Every signed-out route that works with a landing page's slug (manifest,
 * welcome, loyalty card, wallet, stamp / redeem, push, subscribe, staff PIN,
 * chat) runs this first. A page whose status is 'draft' answers 404 exactly
 * as if no page existed, before the route reads or writes anything.
 *
 * The status is read from the database on every request (no cache), so it is
 * always the current one. A failed lookup refuses the request (503) rather
 * than letting it through. Pages that are not drafts, and unknown slugs,
 * continue to the route unchanged.
 * ─────────────────────────────────────────────────────────────
 */
const prisma = require('../utils/prismaClient');

function publicDraftGuard(slugOf = (req) => req.params.slug) {
  const guard = async function publicDraftGuard(req, res, next) {
    const slug = slugOf(req);
    if (typeof slug !== 'string' || !slug) return next();
    try {
      const page = await prisma.landingPage.findUnique({ where: { slug }, select: { status: true } });
      if (page && page.status === 'draft') return res.status(404).json({ error: 'Page not found' });
    } catch (err) {
      console.error('[publicDraftGuard]', err && err.message);
      return res.status(503).json({ error: 'Temporarily unavailable.' });
    }
    return next();
  };
  guard.isPublicDraftGuard = true;
  return guard;
}

module.exports = { publicDraftGuard };
