# Current Sprint

SP2.3 — Universal Operations Search UI

# Repository

C:\Users\adwin\OneDrive\Desktop\qrairy.ai

# Branch

preview/sprint-2d-smart-qr-renderer (up to date with origin)

# Latest Pushed Commit

d150799 — feat: add Universal Operations Search backend

# Current Working State

- `frontend/public/admin.html` contains uncommitted SP2.3 work (265 lines
  added: Universal Search CSS, sidebar nav entry, `#page-search` markup,
  and the search JS: debounce, Enter/Escape handling, clear button,
  loading/empty/error/partial-failure states, result-card renderers).
- Universal Search UI implementation is complete and awaiting founder
  review.
- No commit or push has been approved yet.
- Founder has approved the implementation in principle; a follow-up
  architectural question (dedicated Search page vs. embedding in
  Operations Overview) has been answered and is also awaiting approval.

# Approved Scope

- Universal Search UI
- Dedicated Operations Center Search page (sidebar entry, not embedded
  in Operations Overview)
- Renders: Businesses, Users, Subscribers, Wallet Passes, QR Codes
- Duplicate Landing Pages group hidden (backend returns the same
  LandingPage-backed data for both `businesses` and `landingPages`)
- Existing `/ops/search` endpoint reused (no backend changes)
- `frontend/public/admin.html` only

# Out of Scope

- Backend changes
- Prisma changes
- Migrations
- Business Explorer
- Customer Journey
- API Inspector
- AI Investigation
- System Integrity

# Next Action

Review the current `admin.html` diff, validate the SP2.3 UI, then
request founder approval before committing.

# Important Safety Notes

- Do not discard the current `admin.html` changes.
- Do not apply the search-index migration (`20260712000000_add_search_indexes`).
- Do not modify `main`.
- Do not stage unrelated files (`PROJECT_STATE.md`,
  `docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md` are pre-existing
  untracked files, not part of this sprint).
