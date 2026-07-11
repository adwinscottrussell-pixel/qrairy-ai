# QDS Smart QR Card Architecture v1

Status: DRAFT — awaiting founder approval. Architecture only. No CSS, HTML,
JavaScript, or backend file was created or modified to produce this
document. No production file changed.

Builds on `QDS_SMART_QR_CARD_MIGRATION_PLAN_v1.md` (component inventory,
JS dependency map, risk assessment — re-verified line-for-line against
`dashboard.html` and `dashboard-shell.css` during this sprint, no
discrepancies found) and `QDS_SURFACE_SYSTEM_v1.md` / `QDS_COMPONENT_SPECIFICATIONS_v1.md`
(Surface/Button contracts). This document does not repeat that inventory;
it defines the single rendering contract the inventory's three
implementations will converge onto.

---

## 1. Card Purpose

A Smart QR Card is the at-a-glance summary of one AI-generated Smart QR
Page inside the Dashboard's `#sqrGrid`. It answers three questions for the
merchant at a glance — *what is this page, is it live, is it working* —
and offers exactly three follow-on actions: manage it, view it publicly,
inspect its analytics. It is a summary-and-navigate unit, not a data-entry
surface and not itself a single navigation target (§4).

---

## 2. Canonical Anatomy

```
QDS Surface (root)
├── __header
│   ├── __header-main
│   │   ├── __media           QR thumbnail
│   │   └── __header-text
│   │       ├── [status row]  Live / AI / Claimed badges
│   │       ├── __title       business name
│   │       └── __description public URL
├── __body
│   └── [stats row]           Scans / Subscribers / CVR
└── __footer
    ├── Manage  (qds-btn)
    ├── View    (qds-btn)
    └── Analytics (qds-btn)
```

This is the same shape the Migration Plan §3 already proposed; this
document fixes it as canonical (not "proposed"), resolves its two open
decisions (stats region, badge fallback — §7, §6), and extends it to cover
the claimed-card and empty-state riders explicitly.

Minimum-evaluated regions, mapped:

| Evaluated region | Canonical mapping |
|---|---|
| Root Surface | `.qds-surface` |
| Header | `__header` > `__header-main` (media + text) |
| QR media | `__media` inside `__header-main` |
| Status area | New `[status row]` inside `__header-text`, above Title (§6) |
| Business title | `__title` |
| Public URL | `__description` |
| Statistics | `[stats row]` inside `__body` (§7) |
| Footer actions | `__footer`, 3× real `qds-btn` |

---

## 3. Canonical Composition (confirmed)

Matches the sprint brief's diagram exactly, with the stats region resolved
as `__body` content (not a distinct named Surface region — none exists,
§7) rather than left as an open question:

```
QDS Surface
├── Header
│   ├── Media       (QR thumbnail, __media)
│   ├── Status      (Live/AI/Claimed row, page-level classes nested in __header-text, §6)
│   ├── Title       (__title)
│   └── Description (__description — public URL, not a paragraph description)
├── Body
│   └── Statistics  (page-level stats row, composed inside __body, §7)
└── Footer
    ├── Manage    (qds-btn--secondary, sm)
    ├── View      (qds-btn--ghost, sm)
    └── Analytics (qds-btn--ghost, sm)
```

One deviation from a literal read of the brief's diagram: the brief lists
Description as a Header sub-item distinct from "public URL" in its "at
minimum evaluate" list. In this card, the public URL *is* the
description — there is no separate free-text description field in the
data model (`qr.businessName`, `qr.slug`/`qr.originalUrl`,
`qr.totalScans`, `qr.totalSubscribers` are the only fields `renderCards()`
reads, confirmed at `dashboard.html:334-341`). `__description` renders the
URL; no additional Description slot is introduced.

---

## 4. Surface Contract

| Property | Value | Rationale |
|---|---|---|
| `variant` | `default` | Not `preview` (card is text/stat-dominant, not media-dominant — using `preview` would visually starve the name/URL/stats content, an explicitly named anti-pattern in `QDS_SURFACE_SYSTEM_v1.md` §27). Not `kpi` (this card has three independent stat pairs plus non-numeric content, not one fixed value+label). |
| `padding` | `none` at root; regions carry their own padding | Current design has asymmetric internal spacing (18/18/14px header block, flush divider, 10/8px action cells) that doesn't match one uniform `--qds-space-*` preset (Migration Plan §3). Region-level padding is a page-level CSS concern layered on the QDS regions, not a Surface padding-scale value — flagged as an implementation-time task, not resolved by variant choice alone. |
| `elevation` | `raised` | Matches current `.sqr-card:hover` shadow behavior (`dashboard-shell.css:362`), which is `raised`-tier, not `flat`. |
| `interactive` | `false` (root never interactive) | **Hard constraint, confirmed unchanged from the Migration Plan.** Nothing in `.sqr-card` navigates on a root click today — only the 3 footer buttons do (`dashboard.html:342-344`). Per `QDS_SURFACE_SYSTEM_v1.md` §13, a Surface containing several independently-interactive children is correctly *not* itself interactive; making the root interactive here would add a second, redundant, undefined click target. |
| `selected` / `disabled` | Not used | No selection or disablement concept exists for this card today; these props require `interactive: true` (§14/§15 of the Surface doc) which this card never sets. |
| `loading` | Used only for the pre-render skeleton state (§14 below), not per-card | The grid shows 3 static `.skel-card` placeholders (`dashboard.html:278-280`) before the first fetch resolves — this is a grid-level loading state, not a per-Surface `loading` prop toggled on real card data. |
| Nesting | 1 level | The card is a top-level Surface inside `#sqrGrid`; it does not itself nest a Surface — satisfies the 2-level max with room to spare. |
| Responsive | Fluid width, no card-owned breakpoint | Per Surface's own non-goal (§20/§29 of the Surface doc), column-count collapse belongs to `.sqr-grid`'s `auto-fill, minmax(280px,1fr)` (`dashboard-shell.css:360`), unchanged and out of this card's scope. |

**The card root must not become interactive if only its actions navigate** — restated per the sprint brief's explicit requirement. This is not a judgment call; it is confirmed against the existing, correct precedent already documented in both the Migration Plan and the Surface System doc.

---

## 5. Button Contract

| Action | Today | Canonical | Size | Required hook |
|---|---|---|---|---|
| Manage | `.sqr-act.primary.sqr-manage` | `qds-btn qds-btn--secondary qds-btn--sm` + `.sqr-manage` retained | `sm` | `.sqr-manage` |
| View | `.sqr-act.sqr-open` | `qds-btn qds-btn--ghost qds-btn--sm` + `.sqr-open` retained | `sm` | `.sqr-open` |
| Analytics | `.sqr-act.sqr-analytics` | `qds-btn qds-btn--ghost qds-btn--sm` + `.sqr-analytics` retained | `sm` | `.sqr-analytics` |

Rationale (confirmed, not re-litigated from the Migration Plan): three
`qds-btn--primary` buttons in one footer would violate Button's own "one
primary per view" rule (`QDS_COMPONENT_SPECIFICATIONS_v1.md` §1); Manage
is the more prominent of the three today (`.primary` class, accent color)
so it steps up to `secondary`, not `primary`. View/Analytics stay `ghost`.

**Hook preservation is non-negotiable.** `renderCards()`'s existing wiring
(`dashboard.html:342-344`) does `card.querySelector('.sqr-manage').onclick=...`
by literal class string, not by structure or position. The canonical
renderer must emit `.sqr-manage`/`.sqr-open`/`.sqr-analytics` alongside
whatever `qds-btn--*` classes are added — exact same pattern already used
successfully for the migrated KPI cards, which keep `.kpi-val`/`.kpi-lbl`
alongside `qds-surface__kpi-value`/`qds-surface__kpi-label`
(`dashboard.html:268-271`, confirmed live). Dual-class, not replace-class.

Claimed-card footer buttons (§9) additionally require `sqr-claimed-btn`/
`sqr-claimed-btn-primary`/`sqr-claimed-btn-secondary` preserved for the
same reason, even though no JS currently selects by those specific classes
(only the root `.sqr-claimed-card` is selector-dependent, confirmed
§11) — kept for CSS-transition safety and because the inline `onclick` on
the Manage button lives on the button element itself and must not be
dropped during restructure.

---

## 6. Status Contract

Confirmed statuses currently rendered, by source:

| Status | Where | Markup today |
|---|---|---|
| Live | `.sqr-card` | `<span class="sqr-status live">● Live</span>` |
| AI | `.sqr-card` | `<span class="sqr-status ai">✨ AI</span>` |
| LIVE (claimed) | `.sqr-claimed-card` (both builders) | `<div class="sqr-claimed-badge"><div class="sqr-claimed-badge-dot"></div>LIVE</div>` |

No "Active"/"Disabled"/other state was found in `renderCards()` or either
claimed-card builder — `aiPages` is a flat filter on `businessName`
truthiness (`dashboard.html:320`); there is no per-QR enabled/disabled
flag rendered on the card today. **Do not invent an Active/Disabled status
presentation** — if one is needed, it is a backend/data-model gap to raise
separately, not an architecture assumption to bake in here.

**Confirmed (re-verified, not just carried forward): zero CSS rules exist
for `.sqr-status`, `.sqr-status.live`, or `.sqr-status.ai` anywhere in the
repo** (grep across `frontend/` returns matches only in the Migration Plan
document itself, none in any `.css` file). These two badges render with
pure browser-default inline-span styling in production today. `.sqr-claimed-badge`
also has no CSS rule (dot + text, unstyled beyond `dashboard-shell.css:62-68`'s
partial rule — that rule *does* exist for `.sqr-claimed-badge`/`.sqr-claimed-badge-dot`,
unlike `.sqr-status`, per `dashboard-shell.css:62-68`).

**Badge component determination: required, but blocked.** `QDS_COMPONENT_SPECIFICATIONS_v1.md`
§4 fully specifies Badge's contract (`tone` enum, `solid-tint`/`dot-only`
variants, WCAG-pending tint tokens) but **no `components/badge.css` file
exists** (confirmed — only `button.css`, `surface.css`, `input.css` exist
in `qds/components/`, same finding as the Migration Plan, re-verified this
sprint). Live/AI/Claimed status presentation is a real, in-scope migration
need with no implementable target yet.

Canonical resolution: the status row is a **named slot** inside
`__header-text` (above `__title`), populated today by retaining
`.sqr-status.live`/`.sqr-status.ai`/`.sqr-claimed-badge` as page-level
classes nested in that slot — not converted to a `qds-badge--*` class that
does not exist. This is a structural placement decision (where the status
row lives in the new DOM), not a visual migration (§18 gaps).

---

## 7. Statistics Contract

| Metric | Today | Canonical structure |
|---|---|---|
| Scans | `.sqr-stat-v` + `.sqr-stat-l` ("Scans") | Same pair, retained, nested in `__body` |
| Subscribers | `.sqr-stat-v` + `.sqr-stat-l` ("Subs") | Same pair, retained, nested in `__body` |
| Conversion rate | `.sqr-stat-v` + `.sqr-stat-l` ("CVR") | Same pair, retained, nested in `__body` |

No fourth metric exists in `renderCards()` today — `cvr` is computed
client-side (`dashboard.html:338`), not a fourth backend field.

**Determination: stays Smart-QR-card-specific for this migration, not a
future QDS Data Display component.** `surface.css` has no `__stats`
region — only KPI-specific `__kpi-label`/`__kpi-value`/`__kpi-delta`
(single value+label+trend, not a 3-across row of independent metrics).
Reusing `__kpi-value`/`__kpi-label` three times inside `__body` was
evaluated (Migration Plan §3, option 1) and **rejected here**: KPI's
typography scale and single-metric semantics don't fit a 3-across compact
row, and doing so would misuse a region named and specified for a
different anatomy. Canonical choice is **option 2** — `.sqr-stats`/
`.sqr-stat-v`/`.sqr-stat-l` remain page-level addon classes nested inside
`__body`, unconverted. A future "Data Display" / "Stat Group" QDS
component is the correct eventual home for a reusable multi-value strip
(three of these already exist independently across the codebase — this
card, KPI tiles, and admin `.stat-card`), but inventing it now would
violate the sprint brief's explicit "do not invent new primitives unless
absolutely required" instruction. Flagged as a gap (§18), not solved here.

---

## 8. Renderer Architecture

One canonical render function, `renderSmartQRCard(qr, opts)`, replacing
the inline template-literal construction currently duplicated at
`dashboard.html:341` (unclaimed) and `dashboard.html:573-586` /
`dashboard.html:610-622` (claimed, two drifted copies).

### Required input data
- `businessName` (string) — used for `__title`. Today rendered
  unescaped (`dashboard.html:341` interpolates `qr.businessName` directly
  into `innerHTML`) — **sanitization gap, flagged in §8's normalization
  rules below, not silently carried forward.**
- `totalScans` (number)
- `totalSubscribers` (number)
- At least one of `slug`/`lpSlug` or `originalUrl` — determines the public
  URL and the View action's target (`dashboard.html:335-336`).

### Optional input data
- `slug` / `lpSlug` — when absent, falls back to `originalUrl` for both
  the displayed URL and the View action, exactly as today
  (`dashboard.html:335-336`: `slug?...:qr.originalUrl`).
- `claimed` (boolean, renderer-internal, not a backend field) —
  distinguishes which of the two contracts (§9) to emit. Not part of the
  `qr` object; passed by the caller based on which code path is invoking
  the renderer (normal grid population vs. claim-flow injection).

### Normalization rules
- `businessName` falls back to `'Your Smart QR'` only in the claimed-card
  path (`pending.businessName||'Your Smart QR'`, confirmed at
  `dashboard.html:576`/`613`) — the unclaimed path has **no fallback**
  today (`qr.businessName` is used raw, and `aiPages` is pre-filtered to
  only include records where `businessName` is truthy, `dashboard.html:320`,
  so an empty name cannot reach the unclaimed renderer under current
  filtering — this must remain true, or the renderer needs its own
  fallback added, not assumed away).
- Public URL display: `slug ? 'qraivy.com/lp/'+slug : originalUrl` for the
  unclaimed card; `pending.hostedUrl` directly for claimed cards (no
  slug-based reconstruction — claimed cards already carry a fully-formed
  URL, confirmed `dashboard.html:577`/`614`). These are **two different
  URL-resolution rules today**, not one — the canonical renderer must
  accept a pre-resolved display URL string from the caller rather than
  reimplementing slug logic twice, to avoid silently unifying two rules
  that currently produce different output for the same underlying data
  shape.
- CVR: `totalScans>0 ? round(totalSubscribers/totalScans*100) : 0`
  (`dashboard.html:338`), unclaimed only — claimed cards render no
  statistics row today (confirmed: neither claimed-card builder includes
  a `.sqr-stats`-equivalent block). This is a **real content difference
  between claimed and unclaimed**, not an oversight to fix in this
  sprint — carried forward as-is (§9).
- **Sanitization**: `businessName` and any user/AI-generated string
  reaching `innerHTML` today receives **zero escaping** in either the
  claimed or unclaimed path (confirmed by reading the literal template
  strings — no `escapeHtml`/`textContent`-based assignment exists for
  `businessName` anywhere in this code). This is a pre-existing XSS
  surface, not something this architecture introduces, but the canonical
  renderer **must not silently perpetuate it** — recommend the renderer
  assign `businessName` via `.textContent` on the `__title` node after
  building the surrounding structure via template string (a targeted
  fix, not a full rewrite to a non-string-based renderer), rather than
  interpolating it into the `innerHTML` string directly. This is a
  security-relevant deviation from a pure 1:1 port and must be called out
  to the founder explicitly before Phase 2 (§15) implementation, not
  assumed approved by this architecture document alone.

### Claimed/unclaimed differences (full enumeration)
| Aspect | Unclaimed (`.sqr-card`) | Claimed (`.sqr-claimed-card`) |
|---|---|---|
| Status | Live + AI (2 badges) | LIVE only (1 badge, dot-prefixed) |
| Media size | 64×64, wrapped in `.sqr-thumb` white box | 128×128, no wrapping box |
| Statistics | Scans / Subs / CVR (3-up) | None |
| Footer buttons | 3 (Manage, View, Analytics) | 3 or 4 depending on which builder (§11) |
| View action | `<button onclick>` opening in-app | Real `<a href target=_blank>` |
| Grid position | Appended in fetch order | Always inserted first (`insertBefore`) |
| Root class | `.sqr-card` | `.sqr-claimed-card` |

### Empty values
- Zero scans/subs/CVR render as literal `0`/`0`/`0%` (no special empty
  formatting exists today — confirmed no conditional zero-state text in
  `renderCards()`). Canonical renderer preserves this — do not introduce
  a "—" placeholder for zero, which would be a behavior change.

### Missing QR images
- No `onerror` handler exists on `<img>` today in either card type — a
  broken QR image URL renders as a broken-image icon with no fallback.
  Carried forward as a known gap, addressed in §14 (Error/loading
  behavior) as a recommendation, not retroactively fixed by this
  document.

### Missing URLs
- Cannot occur under current filtering (`aiPages` requires `businessName`
  truthy, but every dashboard record is expected to carry either a slug
  or `originalUrl` per the backend's QR-creation contract — **not verified
  against `backend/src/` in this architecture-only sprint**, flagged as
  an assumption inherited from the Migration Plan, not newly re-verified
  against backend code, since backend inspection is out of this sprint's
  scope).

### Action availability
- All 3 (unclaimed) / 3-4 (claimed) actions are always rendered — no
  conditional hiding of any action exists today. The canonical renderer
  does not introduce conditional action visibility; if a future need
  arises (e.g. disable Analytics for a plan tier), that is a new,
  separately-scoped requirement, not inferred here.

---

## 9. Claimed-Card Consolidation

**Why `.sqr-claimed-card` is rendered in two places**: `dashboard.html:566-588`
builds it immediately after a fresh `?claimDemo=` claim completes (part of
the claim-success flow); `dashboard.html:605-624` rebuilds it on a plain
page reload, reading the same data back from `localStorage`
(`qraivy_active_claim`) via `restoreActiveClaim()`. These are two distinct
trigger points in the app's lifecycle (a live event vs. a rehydration on
load) that both need to produce the same card — the duplication is a
historical copy-paste between the two trigger points, not two different
product requirements. Confirmed the two builders have already drifted:
the post-claim builder includes a 4th "Download QR" action
(`dashboard.html:585`) the reload-restore builder lacks
(`dashboard.html:618-621` stops at 3) — direct evidence the duplication is
actively unsafe to leave as-is, not just stylistically redundant.

**Migration to canonical renderer**: both call sites replace their inline
`card.innerHTML=...`/`c.innerHTML=...` construction with a single call to
`renderSmartQRCard(data, {claimed: true})`, where `data` is normalized to
one shape by each call site before invocation:
- Post-claim site (`dashboard.html:566-588`) passes `pending` (already the
  richer object, includes `hostedUrl`, `businessName`, `qrSrc`) plus a
  `download: true` flag so the 4th action renders.
  Confirm with founder before removing the 4-vs-3 asymmetry outright: is a
  Download-QR action supposed to exist on every claimed-card view, or only
  immediately post-claim? This is a product decision, not resolved by
  this architecture (§18 open item).
- Reload-restore site (`dashboard.html:605-624`) passes `p` (the
  `localStorage`-parsed object) with the same shape, `download` flag set
  per whatever the founder decides above.

Both call sites end up invoking the exact same function with the exact
same option shape — the two-builder drift becomes structurally impossible
to reintroduce, since there is only one place the markup is defined.

---

## 10. Empty State

`.sqr-empty` (`dashboard.html:331`) **stays outside `renderSmartQRCard`**,
rendered as a separate, simpler branch exactly as today
(`aiPages.length===0` short-circuits before the `.forEach` that builds
cards). It is not a card variant — it never had QR data to render, and
folding a zero-argument branch into a data-driven renderer function would
complicate the common (populated) path for no benefit. It **does** compose
QDS Surface + a future Empty State component per `QDS_COMPONENT_SPECIFICATIONS_v1.md`
§5's `full` variant — already classified as `default`/`padding-xl`
Surface-adjacent in the Migration Plan (§2.3) and in the prior
Dashboard-wide plan, carried forward unchanged. Not this sprint's job to
implement (Empty State has no `components/*.css` file yet either — same
category of gap as Badge, §18).

The one caveat, confirmed unchanged: `applyLang()`'s manual
`document.querySelector('.sqr-empty .btn-create')` (`dashboard.html:1845`)
is a Button-migration concern (it sets `.textContent` directly, bypassing
`data-i18n`), not a Smart-QR-card-architecture concern — out of this
document's scope, as the Migration Plan already noted.

---

## 11. JavaScript Contract

Full hook inventory, classified. Re-verified line-by-line against current
`dashboard.html` during this sprint (all line numbers below are current,
not carried forward unchecked from the Migration Plan):

| Hook | Type | Classification | Evidence |
|---|---|---|---|
| `#sqrGrid` | id | **Public behavior hook** | `dashboard.html:282,316,567,605` — grid container, read/written from 3 functions |
| `#sqr-loading` | id | **Public behavior hook** | `dashboard.html:277,317` — skeleton container, hidden on first render |
| `#sqr-count-badge` | id | **Public behavior hook** | `dashboard.html:214,326` — sidebar nav badge count |
| `#sqr-section-count` | id | **Public behavior hook** | `dashboard.html:274,328` — section header count text |
| `.sqr-manage` | class | **Public behavior hook** | `dashboard.html:342` — `.onclick` wired by literal selector |
| `.sqr-open` | class | **Public behavior hook** | `dashboard.html:343` — same pattern |
| `.sqr-analytics` | class | **Public behavior hook** | `dashboard.html:344` — same pattern |
| `.sqr-claimed-card` (root) | class | **Public behavior hook** | `dashboard.html:569,606` — existence-check/replace selector, both claimed-card call sites |
| `#claimSuccessOverlay` | id | **Public behavior hook** | `dashboard.html:583,620` — inline `onclick` target, both claimed-card builders |
| `.sqr-card` (root) | class | **Temporary compatibility hook** | Not queried by any external code (confirmed — `renderCards()` sets it and never re-queries it by this exact class outside its own scope), but nothing prevents adding it *alongside* the Surface classes at zero cost; keep during migration for CSS-transition safety (old `dashboard-shell.css` rules stay valid while new Surface CSS rolls in), remove once `dashboard-shell.css:361-377`'s rules are proven unused (Phase 6, §15) |
| `.sqr-thumb`, `.sqr-meta`, `.sqr-name`, `.sqr-url`, `.sqr-stats`, `.sqr-stat-v`, `.sqr-stat-l`, `.sqr-status.live`, `.sqr-status.ai`, `.sqr-divider`, `.sqr-actions`, `.sqr-act` (base, non-selector-suffixed) | class | **Removable after migration** | Confirmed zero JS selector dependency on any of these beyond the 3 suffixed exceptions above (`.sqr-manage`/`.sqr-open`/`.sqr-analytics`, which are also `.sqr-act`-classed but selected by their more specific class, not `.sqr-act` itself) |
| `.sqr-claimed-qr`, `.sqr-claimed-info`, `.sqr-claimed-name`, `.sqr-claimed-url`, `.sqr-claimed-badge`, `.sqr-claimed-badge-dot`, `.sqr-claimed-top`, `.sqr-claimed-actions`, `.sqr-claimed-btn`, `.sqr-claimed-btn-primary`, `.sqr-claimed-btn-secondary` | class | **Removable after migration** | Zero JS selector dependency found — only the root `.sqr-claimed-card` is queried |
| `.sqr-empty`, `.sqr-empty-icon`, `.sqr-empty-title`, `.sqr-empty-sub` | class | **Public behavior hook** (partial) | `.sqr-empty-title`/`.sqr-empty-sub` are read by `applyLang()` (`dashboard.html:1841,1843`) — must survive; `.sqr-empty`/`.sqr-empty-icon` are not selector-dependent themselves but sit in the same block, out of this card architecture's scope regardless (§10) |
| `.btn-create` (inside `.sqr-empty`) | class | **Unknown, requires verification** | `applyLang()` scopes to `.sqr-empty .btn-create` specifically (`dashboard.html:1845`) — also exists as a page-level id `#btn-create-sqr` (`dashboard.html:265`) with a different class; whether these two "create" buttons are meant to be the same component instance styled two ways, or are genuinely independent, was not resolved by the Migration Plan and is not resolved here either — out of this card's scope (belongs to the empty-state/Button migration), flagged so it isn't silently assumed identical |
| `deleteQR(id, cardEl)` | function | **Unknown, requires verification** | `dashboard.html:304-313` exists and does `cardEl.remove()` by direct reference (no selector risk) — but **no call site was found wiring any of the 3 unclaimed-card footer buttons, or any claimed-card button, to this function.** Confirmed again this sprint (grepped `deleteQR(` across `dashboard.html` — only the function definition and zero invocations from within card markup). Before a Delete action is ever added to the canonical footer, this needs a founder answer: is delete meant to exist on this card and simply isn't wired, or does it belong to a different surface (e.g. `smart-qr-detail.html`'s manage view) entirely? |

**Summary — what must never move or rename without a coordinated
multi-line change**: `#sqrGrid`, `#sqr-loading`, `#sqr-count-badge`,
`#sqr-section-count`, `.sqr-manage`, `.sqr-open`, `.sqr-analytics`,
`.sqr-claimed-card`, `#claimSuccessOverlay`, `.sqr-empty-title`,
`.sqr-empty-sub`. Everything else inside either card body is safe to
restructure into QDS regions.

---

## 12. Accessibility

- **Heading hierarchy**: `__title` (business name) should render as a real
  heading element (`<h3>`, consistent with wherever `#sqrGrid`'s section
  heading sits in the document outline — verify against `.sec-title`'s
  actual element, `dashboard.html:274`, uses a `<span>`, not a heading,
  which is itself a pre-existing gap this card inherits rather than
  fixes). Per `QDS_SURFACE_SYSTEM_v1.md` §19, Surface never assigns its
  own heading level — the consuming page (this renderer) chooses it. This
  card should use `<h3>` for `__title` given the section-level "Smart QR
  Pages" label functions as the implicit `<h2>` equivalent, even though
  it is not currently marked up as one.
- **Image alt text**: QR thumbnail `alt="QR"` today (`dashboard.html:341`)
  is present but non-descriptive. Recommend `alt="QR code for {businessName}"`
  — a real improvement, not just a preservation — since the current value
  provides no distinguishing information across a grid of many QR images.
- **Link naming**: the claimed-card's View action is a real `<a>` today
  (`dashboard.html:582`) with visible text "View Live Page" — sufficient,
  no `aria-label` needed. The unclaimed card's View action is a `<button>`
  (not an anchor, despite navigating via `window.open`) with visible text
  "View" — also sufficient as-is.
- **Button naming**: all 3 unclaimed actions and 3-4 claimed actions carry
  visible text (no icon-only buttons in this card) — no `aria-label`
  requirement beyond what's already visually present.
- **Status announcements**: Live/AI/Claimed badges are visual-only today
  (plain `<span>`/`<div>`, no `role` or `aria-label`). Since status is
  conveyed by text content ("Live", "AI", "LIVE"), not color alone, no
  screen-reader-specific gap exists beyond ensuring the text nodes remain
  real text (not e.g. CSS `content:` pseudo-elements) — confirmed true
  today and must remain true in the canonical renderer.
- **Keyboard order**: media (not focusable) → status/title/URL (not
  focusable, plain text) → Manage → View → Analytics, matching visual
  order top-to-bottom, left-to-right. No `tabindex` overrides needed since
  the DOM order already matches visual order.
- **Focus order**: follows keyboard order above; no focus trap, no
  roving-tabindex — each button is an independent native `<button>`/`<a>`.
- **QR image semantics**: decorative-adjacent but not purely decorative
  (the QR code is scannable content, distinct from a background image) —
  keep `alt` present (not `alt=""`/`aria-hidden`), per above.
- **Disabled action semantics**: not applicable — no action is ever
  disabled in this card today (§8, "Action availability"). If a future
  requirement disables an action conditionally, it should follow Button's
  own disabled contract (`aria-disabled`/`disabled` per
  `QDS_COMPONENT_SPECIFICATIONS_v1.md` §1), not be improvised per-card.

---

## 13. Responsive Behavior

Per `QDS_SURFACE_SYSTEM_v1.md` §20, Surface itself has no breakpoint logic
— the grid (`.sqr-grid`, unchanged, `auto-fill, minmax(280px,1fr)`) owns
column-count collapse. Within a single card at any resulting width:

| Aspect | Desktop/tablet (≥280px card width) | Mobile-narrow card (near 280px minimum) |
|---|---|---|
| QR image scaling | Fixed 64×64 (unclaimed) / 128×128 (claimed) — no fluid scaling today, carried forward | Same — `minmax(280px,...)` guarantees the card never shrinks below a width that fits a 64px thumbnail plus text; no new scaling logic required |
| Title truncation | Single-line, ellipsis overflow (`.sqr-name`'s existing `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, `dashboard-shell.css:367`) | Same rule, unchanged — already width-agnostic |
| URL truncation | Same pattern (`.sqr-url`, `dashboard-shell.css:368`) | Same |
| Statistic wrapping | 3-up flex row, no wrap (`.sqr-stats{display:flex;gap:16px}`, `dashboard-shell.css:369`) — at the 280px minimum width this has not been observed to overflow in production per existing behavior, carried forward unchanged | Same — no wrap behavior exists today; if the 3-up row overflows at exactly 280px this is a pre-existing condition, not introduced by this migration |
| Footer action layout | 3-column CSS grid, equal width (`.sqr-actions{grid-template-columns:1fr 1fr 1fr}`, `dashboard-shell.css:373`) → **changes** to `__footer`'s flex row of independent pill buttons per the Migration Plan's already-flagged, founder-visible visual change (§3 of that document) | Flex row may wrap to 2 lines at very narrow widths where 3 pill buttons don't fit one row — this is new behavior versus today's fixed-3-column grid (which never wraps, just compresses); must be visually confirmed against a real 280px-width card before shipping, not assumed acceptable |

No new responsive logic is introduced beyond what the Header wrap rule
(`QDS_SURFACE_SYSTEM_v1.md` §20 — "title+actions row wraps below available
width") already grants Surface generally.

---

## 14. Error and Loading Behavior

| Scenario | Today | Canonical recommendation |
|---|---|---|
| Loading (pre-fetch) | 3 static `.skel-card` placeholders shown in `#sqr-loading`, hidden once `renderCards()` runs (`dashboard.html:277-280,318`) | Unchanged — this is a grid-level skeleton, not a per-card `loading` prop; the renderer function itself is never called in a loading state |
| Broken QR image | No `onerror` handler — renders browser's broken-image icon | **Recommend** adding an `onerror` fallback (e.g. swap `src` to a static placeholder, or hide the `<img>` and show a neutral icon in `__media`) — this is a real gap, not present today, flagged as a should-fix during implementation rather than a preserve-as-is requirement, since it has no functional JS dependency to break by fixing it |
| Missing card data | Cannot occur under current filtering (§8) — not a live scenario to design against beyond what's already documented | No change |
| Unavailable actions | Never occurs today (§8) | No change; do not add conditional disabling speculatively |
| API error (whole-dashboard fetch fails) | Handled upstream of `renderCards()` — out of this card's scope (`loadDashboard()`'s own try/catch, `dashboard.html:349-360`, not modified by this architecture) | No change |
| Partially loaded statistics | Cannot occur — `dashboard.html`'s `/dashboard` endpoint returns the full record or nothing per QR; there is no partial-stat-loading state in the current data flow (confirmed by reading `renderCards()`'s single synchronous pass over `dashboard.filter(...)`) | No change; flagged as an assumption about backend response shape, not independently re-verified against backend code in this architecture-only sprint |

---

## 15. Migration Sequence

Confirms and slightly refines the Migration Plan's Wave structure into the
sprint brief's 6-phase framing — same substance, reconciled numbering:

**Phase 1 — Create canonical renderer alongside existing renderer.**
Add `renderSmartQRCard()` as a new function; do not call it from
`renderCards()` or the claim-flow sites yet. Zero production behavior
change. Validates the function compiles/renders correctly in isolation
(e.g. via a scratch test page) before any live code path depends on it.

**Phase 2 — Render one test card through the canonical renderer.**
Temporarily invoke `renderSmartQRCard()` for exactly one card (e.g. behind
a `?qdsCardTest=1` query flag, or a hardcoded single-record call in a
non-shipped test harness) to visually validate Header/Body/Footer
composition, button hook wiring (`.sqr-manage` etc. still resolve), and
the sanitization change (§8) before touching `renderCards()`'s main loop.

**Phase 3 — Migrate normal `.sqr-card` cards.**
Replace `dashboard.html:339-344`'s inline construction with
`renderSmartQRCard(qr, {claimed:false})`. Highest-risk step (Migration
Plan's "High risk" classification, unchanged) — this is the real
structural restructure. Validate: all 3 buttons navigate; `#sqrGrid`/
`#sqr-loading`/`#sqr-count-badge`/`#sqr-section-count` still populate;
visual diff at 1280/768/640px per the Migration Plan's existing checklist
(§9 of that document, reused here, not rewritten).

**Phase 4 — Migrate claimed cards.**
Both builders (`dashboard.html:566-588` and `605-624`) switch to the same
`renderSmartQRCard(data, {claimed:true, download:?})` call in one commit
— per §9's consolidation plan, never split across two commits (the
4-vs-3-button drift only gets fixed by touching both at once).

**Phase 5 — Migrate empty state.**
`.sqr-empty` (`dashboard.html:331`) migrates to Surface + future Empty
State composition **only once Empty State ships** (§18) — this phase is
blocked, not schedulable yet, consistent with §10's classification.

**Phase 6 — Remove proven-unused legacy markup and CSS.**
Once Phases 3-4 are live in production with no regression window
remaining, remove `dashboard-shell.css:361-377`'s `.sqr-card`/`.sqr-thumb`/
`.sqr-meta`/`.sqr-name`/`.sqr-url`/`.sqr-stats`/`.sqr-stat-v`/`.sqr-stat-l`/
`.sqr-divider`/`.sqr-actions`/`.sqr-act` rules (base rules only — the 3
suffixed action classes' *selectors* stay in JS forever, per §11, but
their *CSS* can be deleted once new Surface-based styling fully replaces
it) and the equivalent `.sqr-claimed-*` rules (`dashboard-shell.css:46-78`).
Also remove the `.sqr-card`/`.sqr-claimed-card` **root class names**
themselves from JS and markup only if a full audit confirms zero remaining
dependency (§11 lists them as "temporary compatibility hooks" specifically
because Phase 6 is when their removal becomes safe to consider, not
before).

---

## 16. Rollback Plan

- Every phase touches only `dashboard.html` (template construction) and,
  eventually in Phase 6, `dashboard-shell.css` (deletion only, additive
  QDS CSS is unaffected) — no backend, database, or API involvement at any
  phase, consistent with the Migration Plan's existing rollback scope.
- Phases 1-2 are additive and inert (new function, not called from any
  live path) — rollback is deleting the new function, zero user-facing
  risk.
- Phase 3 rollback: revert the commit that replaced
  `dashboard.html:339-344`'s inline construction; the pre-migration
  template string is preserved verbatim in the Migration Plan §2.1 and
  this document's §8 evidence quotes for manual restoration if `git
  revert` is for some reason not viable.
- Phase 4 rollback: both claimed-card call sites must be reverted
  together (same non-splittable rule as forward migration, §9) — reverting
  only one reintroduces the pre-existing 4-vs-3 drift mid-incident, which
  is worse than not having migrated at all.
- Phase 6 rollback: CSS deletions are the only destructive step in this
  entire sequence — do not execute Phase 6 until Phases 3-4 have been live
  long enough to be confident no code path still depends on the deleted
  rules (no fixed time window specified here; a founder call at execution
  time, not a number invented by this document).
- No phase is scheduled to run against production without the explicit
  per-wave sign-off the Migration Plan's validation checklist already
  requires (§17 below).

---

## 17. Validation Checklist

Per phase, before merge (extends the Migration Plan's existing checklist,
not a replacement):

- [ ] Visual diff at 1280px, 768px, 640px against current production,
      scoped to `#sqrGrid` only.
- [ ] `.sqr-manage`/`.sqr-open`/`.sqr-analytics` still resolve and
      navigate correctly on at least one real card, post-restructure.
- [ ] `#sqrGrid`, `#sqr-loading`, `#sqr-count-badge`, `#sqr-section-count`
      still populate on a real dashboard load.
- [ ] Claimed-card flow validated both ways: fresh claim (`?claimDemo=`)
      and reload-restore (`restoreActiveClaim()`) render identically
      post-Phase-4.
- [ ] Empty state (`aiPages.length===0`) unaffected by the populated-card
      restructure (Phases 3-4 must not touch the empty-state branch at
      all, confirmed by code review, not just visual check).
- [ ] `applyLang()`/`toggleLang()` regression check — confirm
      `.sqr-empty-title`/`.sqr-empty-sub` still resolve (§11); confirm no
      new `data-i18n` conflict was introduced (none expected, since no
      card-internal element carries `data-i18n` today, re-confirmed this
      sprint).
- [ ] `businessName` sanitization change (§8) specifically verified: a
      business name containing `<`/`>`/`"` characters renders as literal
      text, not interpreted markup, on at least one test record.
- [ ] Confirm `qds.css`/`surface.css`/`button.css` are linked from
      `dashboard.html` before Phase 3 ships (already true per the KPI
      card migration, `dashboard.html:268-271`, but re-confirm for this
      specific wave's build per the Migration Plan's own caution, §9).
- [ ] Founder/design sign-off on the `.sqr-actions` fused-grid →
      `__footer` flex-row visual change (§13) — a real, visible delta,
      not a hidden implementation detail.
- [ ] Founder answer obtained on the Download-QR action asymmetry (§9)
      before Phase 4 ships, not deferred silently.

---

## 18. Remaining QDS Gaps

Blocking a **fully** QDS-native implementation (structural migration
itself is not blocked by any of these — see each item's carve-out):

1. **Missing Badge** (`components/badge.css` does not exist). Blocks
   converting Live/AI/Claimed status presentation to a real
   `qds-badge--*` class. **Not a blocker for Phases 1-4** — the status
   row slot is structurally defined (§6) and holds today's page-level
   classes (`.sqr-status.live` etc.) until Badge ships, per the
   Migration Plan's explicit instruction not to block structural
   migration on it.
2. **Missing Empty State** (`components/` has no Empty State CSS despite
   a full spec existing in `QDS_COMPONENT_SPECIFICATIONS_v1.md` §5).
   Blocks Phase 5 outright — `.sqr-empty` cannot migrate to a component
   that doesn't exist yet. Phases 1-4 are unaffected since they never
   touch the empty-state branch.
3. **Missing Data Display / Stat Group component.** No blocker today
   (§7 resolution keeps stats as page-level classes), but flagged since
   this is the third independent reimplementation of "3-up value+label
   row" found across the codebase (this card, KPI tiles' internal values,
   admin `.stat-card`) — a real convergence candidate for a future sprint,
   named here per the sprint brief's instruction to identify gaps without
   inventing the fix.
4. **No missing token blocks structural migration.** Surface and Button's
   Foundation token audit (`QDS_SURFACE_SYSTEM_v1.md` §31.9) already
   concluded implementation may proceed on the existing Foundation plus
   one already-approved token (`--qds-color-selected-surface`, not used by
   this card since it never sets `selected`). No new token gap was found
   specific to the Smart QR Card during this sprint.

None of items 1-3 block Phases 1-4 of the migration sequence (§15). Only
Phase 5 (empty state) is genuinely blocked, and only on item 2.

---

## 19. Validation Summary (this sprint)

✓ One canonical card architecture defined (§2-§3).
✓ All existing card implementations mapped and re-verified against live
  `dashboard.html`/`dashboard-shell.css` (§8-§11), not merely carried
  forward from the prior planning document unchecked.
✓ Claimed/unclaimed differences fully enumerated (§8) and a
  consolidation path defined (§9).
✓ QDS Surface and Button composition made explicit (§4-§5).
✓ JavaScript hooks documented and classified into 4 categories, with 2
  items flagged as genuinely unresolved rather than guessed (§11).
✓ Accessibility behavior defined, including 2 real improvements
  (heading element, descriptive alt text) beyond pure preservation (§12).
✓ Responsive behavior defined, including 1 flagged new behavior (footer
  wrap) requiring visual confirmation before shipping (§13).
✓ Remaining QDS gaps identified without inventing Badge/Empty
  State/Data Display components (§18).
✓ No production file changed. No CSS, HTML, JavaScript, or backend file
  created or modified. Only this architecture document was created.

---

*Awaiting founder approval. No implementation proceeds from this document
until explicitly approved.*
