# Daily Engineer Report

## Last Updated

2026-09-15 — compiled by Claude Code session inspecting live `git`/filesystem
state. No aggregate timestamp beyond today's date is available.

## Repository

QRAIVY (`qrairy.ai`) — `C:\Users\adwin\OneDrive\Desktop\qrairy.ai`
Remote: `https://github.com/adwinscottrussell-pixel/qrairy-ai.git`

## Git State

- Branch: `preview/remove-wallet-studio-theme-tabs`, up to date with
  `origin/preview/remove-wallet-studio-theme-tabs`.
- HEAD: `91ec925` — `chore(wallet-studio): remove unfinished Wallet Theme
  section`.
- Working tree: clean, nothing uncommitted.
- vs `origin/main` (`a6ee88b`): this branch is 1 commit ahead / 3 behind.
  Its one commit is already present on `main` under a different hash
  (`03a6235`, same change promoted as a production candidate) — this
  branch's work is effectively already shipped, just not fast-forwarded
  onto `main` itself.
- 60+ local/remote branches exist across `preview/*`, `production-candidate/*`,
  `promote/*`, `backup/*` prefixes — see Blockers/Risks.
- 4 stashes present, oldest dated 2026-08-16 — uninspected, unreconciled.
- ~20 git worktrees registered outside this checkout, mostly under
  `AppData\Local\Temp\claude\...\scratchpad` (several already flagged
  `prunable` by Git) — see Blockers/Risks.

## Current Development Phase

**Cannot be stated with confidence from a single authoritative source.**
`CURRENT_SPRINT.md` and `PROJECT_STATE.md` are stale (last updated
2026-07-15, describe the "Mission Control MC-1" sprint on a now-abandoned
branch, `preview/sprint-2d-smart-qr-renderer`) and do not reflect the
repository's actual current state.

From git evidence: the most recently active branch by commit date is
`preview/stadtpocket-phase6d-admin` (last commit 2026-09-14), 38 commits /
~10,600 lines ahead of `main`, containing the StadtPocket City
Manager/Operations Admin portal, an Angebote/offers backend service, and a
business header-image service. This — not the currently checked-out
branch — appears to be the actual frontier of active development.

`main` itself (`a6ee88b`, 2026-09-04) carries Phase 6C: the Draft →
Preview → Publish write API for `StadtPocketListing`.

## Completed

- Phase 6C — StadtPocketListing Draft/Preview/Publish write path
  (backend), on `main` (`a6ee88b`).
- StadtPocket listing foundation, on `main` (`6814dd3`).
- Wallet Pass Studio: removed unfinished "Wallet Theme" chip row,
  promoted to `main` (`03a6235`) and mirrored on the current preview
  branch (`91ec925`).
- (On unmerged `preview/stadtpocket-phase6d-admin` only — **not yet on
  `main`**, so not "done" at production level): StadtPocket
  Operations/City Manager admin restoration, manager invite flow, Clerk
  email sync, an offers service, a header-image service, admin/manager
  guard scripts.

## In Progress

- `preview/stadtpocket-phase6d-admin` — 38 unmerged commits, last activity
  2026-09-14 (`050ac9e`, "add loyalty landing page bridge"). No
  corresponding `production-candidate/*` branch exists for it yet.
- `local/phase6d-seed-script-prep` (2026-09-06) — seed-script prep,
  unmerged; purpose not independently verified beyond the branch name.
- 4 unresolved stashes: two near-duplicate diffs to
  `docs/QRAIVY_DESIGN_SYSTEM.md` (2026-09-06 / 2026-09-08), and two
  near-duplicate large diffs touching `CLAUDE.md`, `schema.prisma`, and
  several controllers (2026-08-16 / 2026-08-21) — not reconciled into any
  branch.

## Tests / Build

- Backend has no aggregate `npm test` script; each of the 18 files in
  `backend/tests/` is a self-contained Node script (`assert` + inline
  runner, no Jest/Mocha dependency).
- Ran all 18 directly this session: **17 files pass in full.**
  `scansVsVisits.test.js` has **3 passed / 5 failed** — this matches a
  failure explicitly called "pre-existing, unrelated" in commit
  `a6ee88b`'s message, so it predates and is unrelated to recent work,
  but remains unfixed.
- No frontend build step (static HTML/CSS/JS, no bundler) — nothing to
  build there.
- No CI configuration found (`.github/` does not exist in this repo).

## Deployment Status

- Backend: Railway, `nixpacks` builder (`backend/railway.toml`;
  pre-deploy runs `prisma migrate deploy`, healthcheck `/health`).
  Railway CLI is authenticated in this environment
  (`adwinscottrussell@gmail.com`) and sees a project `sparkling-love`,
  but this checkout is **not linked** to it — `railway link` was
  deliberately not run (state-changing/interactive), so **live
  production state was not confirmed this session.**
- Frontend: Vercel, root `vercel.json` proxies `/lp`, `/stamp`, `/wallet`,
  `/manifest`, `/sw.js` to `api.qraivy.com`. No Vercel CLI installed in
  this environment — **not verified.**
- A separate Railway staging service, `pacific-youth`
  (`pacific-youth-staging.up.railway.app`), is documented — in the
  `stadtpocket-web` repo, not here — as the API the StadtPocket consumer
  frontend calls. Distinct from QRAIVY's own production backend.
- **Everything above is inferred from committed config files, not
  confirmed against a live endpoint or authenticated deploy dashboard in
  this session.**

## Cross-Repo Dependencies

- `stadtpocket-web`'s consumer frontend (Screens 1–2: Start, Angebote)
  calls this backend directly: `GET
  /public/stadtpocket/cities/:city/businesses/:slug` and an offers
  endpoint, hardcoded to the Railway staging host
  `pacific-youth-staging.up.railway.app` (per
  `stadtpocket-web/docs/STADTPOCKET_PAGE_REGISTRY.md`, verified
  2026-09-14).
- The service code behind that real-API connection
  (`stadtpocketOfferService.js`, and changes to
  `stadtpocketPublicService.js`) lives on this repo's **unmerged**
  `preview/stadtpocket-phase6d-admin` branch, not on `main` — meaning the
  consumer app's "real, end-to-end" data path in the other repo currently
  depends on code that is not yet in this repo's production branch. Flag
  this to the founder before altering or rebasing that branch.
- This repo's own admin surfaces (`admin.html`, `stadtpocket-admin.html`)
  are explicitly documented as never edited from `stadtpocket-web`.

## Blockers / Risks

- `CURRENT_SPRINT.md` and `PROJECT_STATE.md` are ~2 months stale and
  describe an abandoned sprint/branch — do not trust them for current
  state.
- Branch sprawl: 60+ local/remote branches with no single index of what's
  live vs. abandoned.
- ~20 registered git worktrees sit under
  `AppData\Local\Temp\claude\...\scratchpad`, several already flagged
  `prunable` — ephemeral Claude session checkouts of `promote/*` and
  other branches; if temp is cleared, the convenience checkouts go stale
  (the underlying branches/commits survive in `.git`, the worktree
  registrations don't).
- 4 stashes, oldest ~1 month old, uninspected.
- `preview/stadtpocket-phase6d-admin` (38 commits, ~10.6k lines) has no
  promotion path started — large amount of work at risk of drifting
  further from `main` the longer it sits.
- Pre-existing failing test (`scansVsVisits.test.js`, 5/8 failing) is
  unresolved (documented as unrelated to recent changes, but still red).
- Live deployment state (Railway/Vercel) not independently verified this
  session.

## Founder-Approved Product Direction

**This section records explicit founder decisions. It is not inferred
from branch activity, commit timestamps, or line counts, and a future
session must not silently override it just because another branch looks
newer or larger.**

- StadtPocket backend/admin work (currently concentrated on
  `preview/stadtpocket-phase6d-admin` and related branches) is being
  developed in coordination with the separate `stadtpocket-web` consumer
  repository — the two are intentionally linked, not independent tracks.
  `stadtpocket-web`'s Start and Angebote screens already depend on this
  backend's public StadtPocket API.
- Because of that coupling, **promotion or merging of any StadtPocket
  branch (preview → production-candidate → main) must never be inferred
  merely from branch age, commit recency, or line count.** It requires
  explicit founder approval, and should be checked against the
  corresponding state in `stadtpocket-web` first — a change here can
  break "real, proven" claims made in that repo's own docs.
- No other founder-approved product-direction decision beyond this
  coordination rule was found recorded anywhere in the repository as of
  this session. If one exists only in prior chat history, add it here
  explicitly the next time it's confirmed — do not reconstruct it from
  inference.

## Recovery Audit — Preserved Work

Founder-reviewed 2026-09-15. Every item below is **preserved only** —
none may be merged, cherry-picked, deployed, or promoted without a
separate, explicit founder approval for that specific item. This section
records status, not permission.

- **A — StadtPocket Angebote public API offers.**
  STATUS: **CONSOLIDATED ONTO `preview/stadtpocket-phase6d-admin` (staging), PROVEN END-TO-END — still NOT on `main`/production.**
  Originally preserved on `recovery/stadtpocket-angebote-public-api-fix-20260915`
  (`ce0d99b`), 37/37 tests passing. 2026-09-16: fast-forward-merged onto
  `preview/stadtpocket-phase6d-admin` (now `0e8e8cb`, includes `ce0d99b`
  plus a one-line `preview.stadtpocket.de` CORS allowlist addition),
  pushed, staging redeployed, founder browser-accepted live. See the new
  checkpoint section below for full detail. Promotion to `main` is a
  separate, not-yet-made decision.
- **B — StadtPocket City Manager Operations Center**
  (`preview/stadt-pocket-phase1b-operations-center`).
  STATUS: **PRESERVE / NEEDS VISUAL REVIEW.**
  Contains distinct frontend functionality **not** present in
  `preview/stadtpocket-phase6d-admin` — specifically the Unassigned
  Landing Pages queue and Move-to-Business UI. **Do not treat this
  branch as superseded by phase6d-admin.** Not promoted.
- **C — Dashboard campaign push-report parsing fix**
  (`founder-preview` / `preview/pwa-reliability`, commit `d502463`).
  STATUS: **READY FOR PRODUCTION REVIEW.**
  Small, independent, single-file fix. Not promoted.
- **D — Post-claim activation card / AI business-setup launch**
  (`preview/stadtpocket-phase3c-4-page-linking` chain).
  STATUS: **PRESERVE / NEEDS VISUAL REVIEW.**
  Not promoted yet — underlying files (`dashboard.html`,
  `claim-business.html`, `onboarding.js`, `auth-guard.js`) have moved
  significantly since this branch was last active.
- **E — 76-commit Loyalty/Compliance/Staff-PIN rebuild**
  (`preview/sprint-2d-smart-qr-renderer` and related branches).
  STATUS: **PRESERVE / SHELVED.**
  Not abandoned, must not be deleted — but outside the current
  StadtPocket production path. Do not spend further development time on
  it until explicitly resumed.

**Verified already on production (`origin/main`) — no action needed:**
QRAIVY homepage/marketing + SEO + bilingual redesign · Smart QR canonical
renderer · Wallet Studio "Edit Brand Settings" navigation fix · Wallet
Studio Business Wallet Card / 3C.6A work.

Full audit evidence (file-level checks, commit lists, classification
table) lives in this session's transcript — intentionally not duplicated
here; ask for it if a future session needs to re-derive the reasoning.

## StadtPocket Angebote — End-to-End Staging Proven

- **2026-09-16** — Founder/browser acceptance test passed at
  `https://preview.stadtpocket.de/business/baeckerei-staib/offers`.
- Full path confirmed live, in a real browser: StadtPocket Admin →
  QRAIVY staging database → QRAIVY public StadtPocket API →
  `preview.stadtpocket.de` → consumer Angebote screen. The visible
  result matched the Admin record exactly: title "testing", offer
  "2 für 1", description "this is a test", dates 12.09.2026–18.09.2026,
  image, and the "Im Café einlösen" redemption button.
- The Angebote public API fix (`toOfferItem`/`offersByLocationId`/
  `locations[].offers[]` in `stadtpocketPublicService.js`) is no longer
  only on a recovery branch — it's now a normal, permanent commit on
  `preview/stadtpocket-phase6d-admin` (fast-forward merge, no rebase or
  squash; `ce0d99b` preserved intact as a real commit in that branch's
  history).
- The `preview.stadtpocket.de` CORS allowlist addition
  (`backend/src/utils/corsOriginPolicy.js`) is preserved the same way,
  on the same branch, one commit later (`0e8e8cb`).
- Railway staging (project `sparkling-love`, service `pacific-youth`,
  environment `staging`) is healthy and — confirmed directly via the
  Railway dashboard/API, not just inferred — its tracked deploy source
  is `preview/stadtpocket-phase6d-admin` at `0e8e8cb`. A later ordinary
  push to this branch will keep deploying correctly; this state is no
  longer dependent on any one-off manual deploy.
- `origin/main` and production were **not** touched, merged into, or
  promoted at any point in this work.
- The Bäckerei Staib "testing / 2 für 1" Angebot remains the
  acceptance-test record — never modified, recreated, or deleted by any
  session action.

## StadtPocket Stempelkarte — Phase 2 Staging Verification

- **2026-09-16** — Deployed and staging-verified (not yet visually
  reviewed by founder). `preview/stadtpocket-phase6d-admin` fast-forwarded
  to `cc757a7` (Phase 1 `2964028` + Phase 2 `cc757a7`), pushed; Railway's
  normal GitHub auto-deploy picked it up on its own — confirmed via the
  Railway dashboard/API, no manual `railway up` needed this time.
- **Backend business-level loyalty bridge** (Phase 1): live on staging.
  `stadtpocketPublicService.js` resolves `loyaltyLandingPageId` to the
  linked `LandingPage`'s `StampSettings` and attaches
  `locations[].loyalty = {enabled, requiredStamps, rewardTitle}` when a
  program is connected and enabled — honestly omitted otherwise.
- **Admin loyalty connection UI/API** (Phase 2): live on staging.
  `stadtpocket-admin.html`'s business editor has a new "Stempelkarte"
  section (confirmed present in the deployed page's own HTML/JS,
  2026-09-16); backed by
  `GET/PUT/DELETE /manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty`
  and `GET .../loyalty/eligible`.
- **Authorization/ownership protection**: verified by the 15 dedicated
  tests in `stadtpocketLoyaltyBridge.test.js` (all passing on staging's
  deployed commit) — a scoped City Manager can only connect a
  `LandingPage` whose `businessId` matches the same claimed `Business`
  as the target listing; Global Admin may search any enabled program;
  every other path (unrelated business, nonexistent/disabled program,
  out-of-scope location) is rejected server-side, never trusting a
  frontend-displayed "eligible" list.
- **Bäckerei Staib eligible-program discovery: UNKNOWN.** The
  authenticated `.../loyalty/eligible` endpoint is the correct, safe way
  to determine this (business-level only, no customer data) — but this
  session has no Clerk Admin session token to call it with. Needs a
  human with real Admin access (see Resume Instructions) or a future
  session with credentials.
- **Public API confirmed still honest**: live-checked after this
  deploy — Bäckerei Staib's `locations[]` has no `loyalty` key at all
  (no bridge connected yet), and its existing Angebote offer
  ("testing" / "2 für 1", 12.09–18.09.2026) is unchanged.
- **Consumer Stempelkarte (`stadtpocket-web`) is NOT connected yet** —
  `StempelkarteScreen.jsx` still reads mock data only; that work hasn't
  started.
- **Customer-specific stamp progress is NOT implemented** — by design,
  this milestone. Deliberately deferred; see this session's Phase 2
  design notes (Customer Identity / Security Considerations) before
  starting it.
- **No loyalty program was connected to Bäckerei Staib** — the bridge
  remains unset; nothing in this pass wrote real StadtPocket loyalty
  data.
- `origin/main` and production were **not** touched, merged into, or
  promoted at any point in this work.

## Next Task

**Two separate tracks exist — do not conflate them.**

1. **Recovery-item review queue** (promoting preserved work — see above):
   C, then A, then B, then D, in that order. E is shelved; spend no
   further time on it unless the founder explicitly resumes it.
2. **Active development** — cannot be stated as a single confirmed
   ticket; no current, non-stale sprint doc exists. Based purely on
   branch activity (most recent commit timestamp across the whole
   repo), the most likely resumption point is
   **`preview/stadtpocket-phase6d-admin`** (HEAD `050ac9e`, "add
   loyalty landing page bridge", 2026-09-14) — the StadtPocket City
   Manager/Operations Admin + Offers backend work. Confirm with the
   founder whether this branch is (a) still active WIP, (b) ready to
   cut a `production-candidate/*` branch for promotion, or (c)
   superseded. **Do not assume either answer** — this is inferred from
   timestamps, not an explicit directive.

## Resume Instructions

1. Read this file in full.
2. Run `git status`, `git branch --show-current`, `git log -1` to confirm
   nothing has changed since this report was written.
3. Read `CLAUDE.md` — note its listed "read `CURRENT_SPRINT.md` /
   `PROJECT_STATE.md`" step currently points at stale files; prefer this
   report until those are refreshed or retired.
4. If resuming `preview/stadtpocket-phase6d-admin`, check out the branch
   fresh (don't reuse an old scratchpad worktree without confirming it's
   still current) and read its recent commit messages before writing
   code.
5. Confirm with the founder which branch is authoritative before
   promoting or merging anything — do not infer promotion intent from
   branch activity alone.

## Recent History

- 2026-09-17 — Stempelkarte Phase 3B: platform-managed loyalty setup.
  `stadtpocketLoyaltyBridgeService.js`'s `createAndConnectProgram`
  creates a LandingPage with `userId: null` (no fake owner, no fake
  Business, no fake BusinessLocation) for an unclaimed StadtPocket
  business, upserts StampSettings, and sets
  `StadtPocketListingLocation.loyaltyLandingPageId` -- all inside one
  `prisma.$transaction`. No schema migration (`LandingPage.userId` was
  already nullable; see Phase 3B architecture report, same date).
  New route: `POST /manager/stadtpocket/listings/:locationId/:listingLocationId/loyalty/setup`.
  Frontend: integrated 3-step wizard inside the existing
  `page-stempelkarte` workspace in `stadtpocket-admin.html`
  (`openStempelkarteWizard` / `renderWizardStep1-3` / `activateStempelkarte`).
  **Future claim requirement (not yet implemented):** when a StadtPocket
  business created this way is later claimed via `businessClaimService.js`,
  the SAME LandingPage/StampSettings row must be adopted by the real
  owner (via `networkAdminService.js`'s existing `assignLandingPageOwner`
  then `mapLandingPageToBusiness` -- built for exactly this transition,
  never wired to claim yet) and `StadtPocketListingLocation.businessLocationId`
  set — claim must never create a second, duplicate loyalty LandingPage
  for a business that already has a platform-managed one connected via
  `loyaltyLandingPageId`.
- 2026-09-15 — QRAIVY Recovery Audit performed (read-only): surveyed all
  60+ branches, stashes, and worktrees against `origin/main` for
  completed/approved work not yet in production. Findings A–E recorded
  above under Recovery Audit — Preserved Work, founder-reviewed same day.
- 2026-09-15 — Recovered a uniquely-existing, previously uncommitted
  Angebote public-API fix (found only in a temp scratchpad worktree, no
  other copy anywhere) onto
  `recovery/stadtpocket-angebote-public-api-fix-20260915` (`ce0d99b`),
  pushed to origin. Diagnosed and fixed a stale test-fixture date during
  preservation (application code itself needed no change); 37/37 tests
  passing.
- 2026-09-14 — `preview/stadtpocket-phase6d-admin`: loyalty landing page
  bridge (latest commit on the repo's most active branch).
- 2026-09-04 — `main` promoted to Phase 6C: StadtPocketListing
  Draft→Preview→Publish write API.
- 2026-09-04 — StadtPocket listing foundation promoted to `main`.
- 2026-08-30 — Wallet Pass Studio "Wallet Theme" unfinished section
  removed (preview + production-candidate).
- 2026-07-15 (stale reference point, kept for continuity) — Mission
  Control MC-1 completed on the now-superseded
  `preview/sprint-2d-smart-qr-renderer` branch.
