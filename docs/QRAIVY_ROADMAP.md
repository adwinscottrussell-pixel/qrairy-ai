# QRAIVY — Roadmap

> This file is a template. Unlike the other docs, a roadmap can't be inferred
> from a file tree — it reflects product decisions only you have. Use
> `CHANGELOG.md` as the historical record and fill in what's next below.

## Recently Shipped (pull from CHANGELOG.md)

- [ ] (copy relevant recent entries from `CHANGELOG.md` here, or just link to it)

## In Progress

- [ ]

## Next Up

- [ ]

## Known Cleanup Items (from Phase 1 architecture review)

- [ ] Resolve duplicate Prisma client (`backend/src/prismaClient.js` vs `backend/src/utils/prismaClient.js`)
- [ ] Resolve duplicate service worker (`backend/public/sw.js` vs `frontend/public/sw.js`)
- [ ] Resolve duplicate onboarding script (`frontend/public/onboarding.js` vs `frontend/public/js/onboarding.js`)
- [ ] Clarify `backend/prisma/lp_migration.sql` and `schema.prisma.bak` — live or dead?
- [ ] Confirm authoritative deploy target (Railway vs Vercel) per app half
- [ ] Frontend `public/` reorganization into feature folders (planned Phase 4, not started)

Update this file as priorities shift — it's meant to be the single source of
truth for what's next, not a static document.
