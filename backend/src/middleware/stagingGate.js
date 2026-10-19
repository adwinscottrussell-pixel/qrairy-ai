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
 *
 * Stamp scanner (group "scanner"): the four requests stamp-scanner.html
 * makes, as "test-page" -- no sign-in at the gate (staff use the staff
 * PIN), but the page in the path must belong to an allowlisted account,
 * so only test pages can be scanned or stamped. The route then applies its
 * own rules as in production (stamp code: owner sign-in or server-checked
 * PIN; stamp: a valid stamp code). Plus the owner's program list ("user").
 * Setting a PIN, NFC codes, stamp settings, redeeming and the old stamp
 * paths stay refused.
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
  { method: 'GET',  path: new RegExp('^/lp/staff-pin/(' + SLUG + ')/status$'),                  access: 'test-page', group: 'scanner', what: 'scanner: does the page have a staff PIN (yes/no only)' },
  { method: 'POST', path: new RegExp('^/lp/staff-pin/(' + SLUG + ')/verify$'),                  access: 'test-page', group: 'scanner', what: 'scanner: check an entered staff PIN (wrong PINs limited per page)' },
  { method: 'GET',  path: new RegExp('^/lp/stamp/token/(' + SLUG + ')$'),                       access: 'test-page', group: 'scanner', what: 'scanner: daily stamp code (owner sign-in or staff PIN, checked by the route)' },
  { method: 'POST', path: new RegExp('^/stamp/(' + SLUG + ')/[A-Za-z0-9]{1,64}/confirm$'),       access: 'test-page', group: 'scanner', what: 'scanner: one stamp (needs a valid stamp code)' },
  { method: 'GET',  path: /^\/loyalty\/programs$/,                                               access: 'user',      group: 'scanner', what: 'scanner: the owner\'s own loyalty programs' },
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
    if (route.access === 'test-page') {
      // No sign-in here: the route decides who may scan. The gate only keeps
      // it to pages of allowlisted (test) accounts. A missing page goes on to
      // the route, which answers 404 itself.
      const slug = route.path.exec(req.path)[1];
      return Promise.resolve().then(() => findPageOwner(slug)).then((page) => {
        if (page && (!page.userId || !allowed.has(page.userId))) {
          return res.status(403).json({ error: 'This page is not a staging test page.', code: 'staging_page' });
        }
        return next();
      }).catch((err) => {
        console.error('[staging gate]', err && err.message);
        return res.status(503).json({ error: 'Staging could not verify this request.', code: 'staging_unverified' });
      });
    }

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
