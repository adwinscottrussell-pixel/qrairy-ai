# QRAIVY — Coding Rules

> **Provenance**: reused from `docs/QRAIVY_CODING_RULES.md` (that file
> still exists, unmodified). Written before source code was verified in
> detail — largely accurate, but see `architecture/DATABASE_SCHEMA.md` and
> `architecture/API_REFERENCE.md` for verified specifics that go further
> than this document (e.g., the actual scope of the Prisma-client
> duplication, and the specific schema/code mismatches found).

These reflect patterns already observed in the existing codebase, plus a few
additions for consistency going forward. Nothing here requires changing
existing code — this documents the convention already mostly in place.

## Backend (`backend/`)

- Layering: `routes/` → `controllers/` → `services/` (already followed
  consistently — keep it that way for new code)
- All DB access through the Prisma client — **once the `prismaClient.js` /
  `utils/prismaClient.js` duplication is resolved**, new code should import
  from whichever single location is designated canonical
- Auth/authorization concerns live in `middleware/` (`auth.js`,
  `adminMiddleware.js`, `apiKeyAuth.js`, `planGate.js`) — new protected routes
  should reuse these rather than re-implementing checks inline
- Schema changes always go through a Prisma migration in
  `backend/prisma/migrations/`, never a hand-edited `schema.prisma` alone
- Environment variables: never commit `.env` or `.env.*` (backend `.gitignore`
  already enforces this) — commit an `.env.example` if one doesn't exist yet,
  so onboarding doesn't require guessing variable names

## Frontend (`frontend/public/`)

- Existing partial grouping (`css/`, `js/`, `img/`, `qr/`) should be followed
  for **new** files going forward, even though older files aren't yet
  consistently grouped — don't add new flat files at the `public/` root if a
  `css/`/`js/` equivalent folder already exists
- New third-party API calls (Stripe, Cloudinary, wallet, AI) should go through
  a backend route, not directly from frontend JS — consistent with the
  existing pattern implied by the route list in `docs/API_REFERENCE.md`

## Naming

- Match existing conventions already in the repo: `camelCase.js` for backend
  files, descriptive `kebab-case.html`/`snake-ish` mix for frontend pages
  (observed, not prescriptive — don't rename existing files to "fix" this)

## Git

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`)
  recommended going forward — not currently enforced, no existing commits
  need to change
- Small, scoped commits — especially important once duplicate-file cleanup
  (Phase 3 of the migration plan) begins, so each resolution is independently
  revertable

## Testing

No test setup is visible in the current file tree. If/when tests are added,
they should live alongside the existing `backend/src/` structure (e.g.
`backend/tests/` or co-located `*.test.js`) — not prescribed further here
since no testing convention exists yet to build on.
