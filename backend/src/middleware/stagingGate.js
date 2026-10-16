/**
 * stagingGate.js — the only requests a staging server answers.
 * ─────────────────────────────────────────────────────────────
 * Mounted ONLY when APP_ENV=staging (see index.js). Production never
 * loads a gate: its routes and their behaviour are exactly as before.
 *
 * Default deny. A request is answered only if it matches ALLOWED_ROUTES;
 * everything else — admin, wallet, stamp, loyalty, push, subscribers,
 * payments, uploads, QR codes, the AI assistant — gets 404 before any
 * route code runs.
 *
 * The gate never replaces a route's own checks, it adds to them:
 *   public  no sign-in. Only what a visitor needs to load a page, play
 *           its welcome audio and see its welcome screen (GET only).
 *   user    a valid Clerk sign-in (the same requireAuth production uses)
 *           AND the account is on the staging allowlist.
 *   owner   as user, and the page must belong to that account. Used for
 *           GET /api/lp/:slug, which production serves without sign-in.
 * The route behind the gate then applies its normal checks as well
 * (POST /lp: ownership of an existing page; the preview endpoint:
 * requireAuth + ownership; /deals: requireAuth, and every deal is looked
 * up by its owner, so another account's deal answers 404).
 *
 * QRAIVY Deals: the owner Deals API (routes/dealRoutes.js) is allowed as
 * "user" -- signed in AND on the allowlist. Exactly its routes (deals,
 * image, placements, own pages); anything else under /deals is refused
 * like every other path.
 * ─────────────────────────────────────────────────────────────
 */

const { requireAuth } = require('./auth');

const SLUG = '[A-Za-z0-9][A-Za-z0-9_-]{0,119}';
const DEAL_ID = '[A-Za-z0-9_-]{1,64}';
const ALLOWED_ROUTES = [
  { method: 'GET',  path: /^\/health$/,                                   access: 'public', what: 'health check' },
  { method: 'GET',  path: /^\/sw\.js$/,                                   access: 'public', what: 'the customer page\'s own worker script' },
  { method: 'GET',  path: new RegExp('^/lp/' + SLUG + '$'),               access: 'public', what: 'customer page (welcome audio playback, phone preview)' },
  // Phase 5.5B: the welcome screen a first visit is sent to. Read-only HTML;
  // its wallet and push buttons lead to routes that stay refused here.
  { method: 'GET',  path: new RegExp('^/lp/welcome/' + SLUG + '$'),       access: 'public', what: 'customer welcome screen (read-only)' },
  { method: 'GET',  path: new RegExp('^/api/lp/' + SLUG + '$'),           access: 'owner',  what: 'editor: load the page' },
  { method: 'POST', path: /^\/lp$/,                                       access: 'user',   what: 'editor: publish / save the page' },
  { method: 'POST', path: new RegExp('^/lp/voice/preview/' + SLUG + '$'), access: 'user',   what: 'editor: voice audio preview' },
  { method: 'GET',    path: /^\/deals$/,                                      access: 'user', what: 'Deals: list own deals' },
  { method: 'POST',   path: /^\/deals$/,                                      access: 'user', what: 'Deals: create a deal' },
  { method: 'GET',    path: /^\/deals\/pages$/,                                access: 'user', what: 'Deals: list own landing pages' },
  { method: 'GET',    path: new RegExp('^/deals/' + DEAL_ID + '$'),            access: 'user', what: 'Deals: load a deal' },
  { method: 'PUT',    path: new RegExp('^/deals/' + DEAL_ID + '/draft$'),      access: 'user', what: 'Deals: save a draft' },
  { method: 'POST',   path: new RegExp('^/deals/' + DEAL_ID + '/publish$'),    access: 'user', what: 'Deals: publish' },
  { method: 'POST',   path: new RegExp('^/deals/' + DEAL_ID + '/archive$'),    access: 'user', what: 'Deals: archive' },
  { method: 'DELETE', path: new RegExp('^/deals/' + DEAL_ID + '$'),            access: 'user', what: 'Deals: delete' },
  { method: 'POST',   path: new RegExp('^/deals/' + DEAL_ID + '/image$'),      access: 'user', what: 'Deals: upload an image (staging folder only)' },
  { method: 'GET',    path: new RegExp('^/deals/' + DEAL_ID + '/placements$'), access: 'user', what: 'Deals: list placements' },
  { method: 'POST',   path: new RegExp('^/deals/' + DEAL_ID + '/placements$'), access: 'user', what: 'Deals: add a placement (own pages only)' },
  { method: 'POST',   path: new RegExp('^/deals/' + DEAL_ID + '/placements/' + DEAL_ID + '/(?:publish|archive)$'), access: 'user', what: 'Deals: publish or archive a placement' },
];

function matchRoute(method, path) {
  const m = String(method || '').toUpperCase() === 'HEAD' ? 'GET' : String(method || '').toUpperCase();
  return ALLOWED_ROUTES.find((r) => r.method === m && r.path.test(path)) || null;
}

function createStagingGate({ allowedUserIds, authenticate = requireAuth, findPageOwner }) {
  const allowed = new Set(allowedUserIds || []);
  if (!allowed.size) throw new Error('The staging gate needs at least one allowed user id.');
  if (typeof findPageOwner !== 'function') throw new Error('The staging gate needs findPageOwner.');

  return function stagingGate(req, res, next) {
    const route = matchRoute(req.method, req.path);
    if (!route) return res.status(404).json({ error: 'Not available on staging.', code: 'staging_scope' });
    if (route.access === 'public') return next();

    // Same token verification as production. It answers 401 itself.
    return authenticate(req, res, async () => {
      try {
        if (!req.userId || !allowed.has(req.userId)) {
          return res.status(403).json({ error: 'This account is not authorized for staging.', code: 'staging_account' });
        }
        if (route.access === 'owner') {
          const slug = req.path.split('/').pop();
          const page = await findPageOwner(slug);
          if (page && page.userId !== req.userId) {
            return res.status(403).json({ error: 'You do not have access to this page.', code: 'staging_owner' });
          }
        }
        return next();
      } catch (err) {
        console.error('[staging gate]', err && err.message);
        return res.status(503).json({ error: 'Staging could not verify this request.', code: 'staging_unverified' });
      }
    });
  };
}

module.exports = { ALLOWED_ROUTES, matchRoute, createStagingGate };
