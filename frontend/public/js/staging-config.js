/*
 * QRAIVY staging routing — configuration.
 *
 * EMPTY = no staging. With `hosts` empty, the production websites talk to
 * the production API exactly as before, and every other hostname (any
 * preview deployment) is blocked from the API by js/lp-routing.js.
 *
 * To connect a preview deployment to an isolated staging backend, set:
 *   hosts  the hostname(s) the staging frontend is served from
 *          (e.g. the preview domain assigned to the branch) — never a
 *          production hostname
 *   api    the origin of the staging API (https://…, no path) — never a
 *          production API
 *
 * On a listed host, every request the Smart Landing Page editor would
 * send to the production API goes to `api` instead. If `api` is missing
 * or invalid there, those requests are refused; they never fall back to
 * production. See js/lp-routing.js.
 *
 * STAGING TEST SCOPE
 *   In scope:   the Smart Landing Page editor, its phone preview, and the
 *               customer page (welcome audio, AI assistant).
 *   NOT in scope, do not test on staging:
 *     - QR codes: the codes and addresses shown in the editor still
 *       encode qraivy.com/lp/<slug>; a scan opens production.
 *     - Stamp, loyalty card and reward pages.
 *     - Apple and Google Wallet passes.
 *     - Push notifications and email.
 *   Those pages are rendered with production addresses inside them and
 *   their outside services are not configured on staging.
 *
 * No credentials belong in this file. It is public.
 */
window.QRAIVY_STAGING_CONFIG = {
  hosts: [],
  api: ''
};
