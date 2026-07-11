# QDS Smart QR Card Migration Plan v1

Status: DRAFT — awaiting founder approval. Analysis only. No production file
was modified to produce this document.

Scope: the Smart QR cards rendered inside `#sqrGrid` on `frontend/public/dashboard.html`
— `.sqr-card` (built by `renderCards()`, dashboard.html:315-347), `.sqr-claimed-card`
(built twice, dashboard.html:571-587 and 609-623), and the `.sqr-empty` empty state
(dashboard.html:331) — against `frontend/public/qds/components/{surface,button}.css`
and their specs (`QDS_SURFACE_SYSTEM_v1.md`, `QDS_COMPONENT_CATALOG_v1.md`).

Out of scope (per sprint brief): KPI cards (already migrated, dashboard.html:268-271),
sidebar/navigation, Subscribers, Campaigns, Loyalty, Analytics, Wallet, Settings.

---

## 1. Executive Summary

The Dashboard renders three visually related but structurally independent
"QR summary card" implementations into the same `#sqrGrid` grid:

1. **`.sqr-card`** — the primary, data-driven card. Built once per QR by
   `renderCards()` via a single `card.innerHTML =` template-literal-style
   string (dashboard.html:341), then its 3 action buttons are re-queried and
   given `.onclick` handlers (dashboard.html:342-344). Entire grid is
   destroyed and rebuilt (`grid.innerHTML=''`, dashboard.html:319) on every
   dashboard load/refresh — there is no incremental DOM patching to protect.
2. **`.sqr-claimed-card`** — a one-off, richer card injected at the *front*
   of the same grid (`grid.insertBefore`) for a user who just claimed a demo
   QR. Built independently in two near-identical places (dashboard.html:571-587
   post-claim, and 609-623 on page reload via `restoreActiveClaim()`), with a
   4-button footer instead of 3 and a `LIVE` badge instead of `● Live`/`✨ AI`.
3. **`.sqr-empty`** — the zero-state shown when `aiPages.length===0`
   (dashboard.html:331), a simple icon/title/sub/CTA block, not a card at all.

This confirms the finding already on record in `QDS_COMPONENT_CATALOG_v1.md`
(§3, "three unreconciled forms of one conceptual card") and in
`QDS_SURFACE_SYSTEM_v1.md` §28 ("`.sqr-card`, `.sqr-claimed-card`, inline
`.csm-qr-row` → `default` variant, real nested Buttons for `.sqr-act` actions
per §13"). This plan turns that prior direction into an implementable,
line-referenced spec for `.sqr-card` specifically (the highest-traffic of the
three), with `.sqr-claimed-card` and `.sqr-empty` folded in as same-pattern
riders.

**The card itself must not become `interactive`.** Nothing in `.sqr-card`
navigates on a root click — only its 3 footer buttons do. This matches
`QDS_COMPONENT_CATALOG_v1.md` §3's explicit accessibility note: "dashboard's
`.sqr-card` and `.sqr-act` buttons currently do this correctly by keeping
actions as real buttons inside the card." Migration must preserve that, not
"upgrade" the card to a clickable Surface.

**The dominant migration risk is not visual, it's structural.** `.sqr-card`
today has no Header/Body/Footer regions — it is two ad hoc rows
(`.sqr-card-top`, then a `.sqr-divider`, then `.sqr-actions`) with the QR
thumbnail, status badges, name, URL, and stats all flattened into one
`.sqr-meta` block. Mapping it onto QDS Surface's `__header`/`__media`/`__body`/
`__footer` regions is a genuine restructure of the template string inside
`renderCards()`, not a class rename — this was already flagged as **High
risk / "Do not migrate yet"** in `QDS_DASHBOARD_MIGRATION_PLAN_v1.md` §4 row 2
and §8. This plan exists to make that restructure safe to execute, not to
argue it's actually low-risk.

**Favorable finding:** no element inside `.sqr-card`, `.sqr-claimed-card`, or
`.sqr-empty` carries `data-i18n`, and none is targeted by `applyLang()`
(confirmed by grep — `applyLang()`'s only Dashboard-scoped selector is
`document.querySelector('.sqr-empty .btn-create')`, dashboard.html:1844,
which sets `.textContent` directly and is a manual mismatch already flagged
in the prior Dashboard plan, not new to this one). This removes the
data-i18n/child-wrapping conflict that dominated the Dashboard-wide plan's
risk list — Smart QR cards are entirely JS-rendered from live QR data, never
translated in place.

---

## 2. Current Component Inventory

### 2.1 `.sqr-card` (dashboard.html:339-344, template string built in `renderCards()`)

| Region (as built today) | Markup | Class(es) |
|---|---|---|
| Wrapper | `<div>` | `.sqr-card` |
| Top row | `<div>` | `.sqr-card-top` (flex row, thumb + meta) |
| QR image | `<div><img></div>` | `.sqr-thumb` (64×64, white bg) wrapping `<img>` |
| Status badges | `<span><span>` ×2 | `.sqr-status.live` ("● Live"), `.sqr-status.ai` ("✨ AI") — inline, no shared class in `dashboard-shell.css` (see §6, CSS gap) |
| Business name | `<div>` | `.sqr-name` |
| URL | `<div>` | `.sqr-url` |
| Statistics row | `<div>` wrapping 3× `<div><div>` pairs | `.sqr-stats` > `.sqr-stat-v` (value) + `.sqr-stat-l` (label) — Scans / Subs / CVR% |
| Divider | `<div>` | `.sqr-divider` (1px hairline, full width, between top row and actions) |
| Footer actions | `<div>` wrapping 3× `<button>` | `.sqr-actions` (CSS grid, `1fr 1fr 1fr`, bordered dividers between cells — a fused 3-up toolbar, not 3 independent buttons) |
| Manage button | `<button>` | `.sqr-act.primary.sqr-manage` — "⚙ Manage" |
| View button | `<button>` | `.sqr-act.sqr-open` — "🌐 View" |
| Analytics button | `<button>` | `.sqr-act.sqr-analytics` — "↗ Analytics" |

Full source string, dashboard.html:341:
```
<div class="sqr-card-top">
  <div class="sqr-thumb"><img src="{qrImg}" alt="QR" loading="lazy"/></div>
  <div class="sqr-meta">
    <div><span class="sqr-status live">● Live</span><span class="sqr-status ai">✨ AI</span></div>
    <div class="sqr-name">{businessName}</div>
    <div class="sqr-url">{slug ? qraivy.com/lp/{slug} : originalUrl}</div>
    <div class="sqr-stats">
      <div><div class="sqr-stat-v">{scans}</div><div class="sqr-stat-l">Scans</div></div>
      <div><div class="sqr-stat-v">{subs}</div><div class="sqr-stat-l">Subs</div></div>
      <div><div class="sqr-stat-v">{cvr}%</div><div class="sqr-stat-l">CVR</div></div>
    </div>
  </div>
</div>
<div class="sqr-divider"></div>
<div class="sqr-actions">
  <button class="sqr-act primary sqr-manage">⚙ Manage</button>
  <button class="sqr-act sqr-open">🌐 View</button>
  <button class="sqr-act sqr-analytics">↗ Analytics</button>
</div>
```

CSS source, `dashboard-shell.css:360-377` (+ `.sqr-empty` 565-568):
- `.sqr-grid` (360): `grid-template-columns: repeat(auto-fill, minmax(280px,1fr))`
- `.sqr-card` (361-362): bordered, `radius-lg`, hover border/shadow change
- `.sqr-card-top` (363): flex, 14px gap, `18px 18px 14px` padding
- `.sqr-thumb`/`.sqr-thumb img` (364-365): 64×64 white box, 60×60 image
- `.sqr-name`/`.sqr-url` (367-368): truncating single-line text
- `.sqr-stats`/`.sqr-stat-v`/`.sqr-stat-l` (369-371): flex row of 3 value/label pairs
- `.sqr-divider` (372): 1px hairline
- `.sqr-actions`/`.sqr-act`/`.sqr-act:hover`/`.sqr-act.primary` (373-377): 3-column
  grid, bordered dividers between cells (`border-right`, last child none)
- **No CSS rule for `.sqr-status`/`.sqr-status.live`/`.sqr-status.ai` was found
  in `dashboard-shell.css`** — grep against the file returns zero matches for
  `sqr-status`. These badges render with only browser-default inline-element
  styling today (no color, no pill shape, no background) unless a rule exists
  elsewhere not covered by this audit's scope (only `dashboard-shell.css` and
  `dashboard.html` were reviewed, per the prior Dashboard plan's stated scope).
  **Flagged for founder/design clarification before badge migration — do not
  assume a visual spec exists to preserve.**

### 2.2 `.sqr-claimed-card` (dashboard.html:571-587 and 609-623, two near-duplicate builders)

| Region | Markup | Class(es) | Notes |
|---|---|---|---|
| Wrapper | `<div>` | `.sqr-claimed-card` | Inserted via `grid.insertBefore(card, grid.firstChild)` — always first in the grid |
| Top row | `<div>` | `.sqr-claimed-top` | |
| QR image | `<img>` | `.sqr-claimed-qr` | 128×128, no wrapping thumb box (unlike `.sqr-card`'s `.sqr-thumb`) |
| Info block | `<div>` | `.sqr-claimed-info` > `.sqr-claimed-name` + `.sqr-claimed-url` | |
| Status badge | `<div>` | `.sqr-claimed-badge` (dot + "LIVE" text) | Single badge, not two like `.sqr-card`'s Live+AI pair |
| Footer actions | `<div>` wrapping 3-4 elements | `.sqr-claimed-actions` | **4 buttons in the post-claim builder (571-587: View/Manage/Analytics/Download QR), only 3 in the reload-restore builder (609-623: View/Manage/Analytics) — the two builders have drifted, not identical** |
| View button | `<a target="_blank">` | `.sqr-claimed-btn.sqr-claimed-btn-primary` | Real link, not button+onclick |
| Manage button | `<button onclick=...>` | `.sqr-claimed-btn.sqr-claimed-btn-secondary` | Inline `onclick` opens `#claimSuccessOverlay` |
| Analytics button | `<a>` | `.sqr-claimed-btn.sqr-claimed-btn-secondary` | Plain nav link |
| Download QR (post-claim builder only) | `<a download>` | `.sqr-claimed-btn.sqr-claimed-btn-secondary` | Absent from the reload-restore builder — pre-existing drift, not part of this migration's job to fix, but flagged since it will surface immediately once both builders are touched |

`dashboard-shell.css` has **no rules found** for any `.sqr-claimed-*` class
(grep confirms zero matches) — same CSS-gap situation as `.sqr-status`. This
card's entire visual appearance today is either inline `style=""` not shown
in the reviewed 70-line excerpt, or is unstyled/browser-default. **This must
be re-verified against the full stylesheet before any visual-parity claim is
made** — this audit did not find the rule, it did not confirm the rule is
truly absent from every CSS file in the repo (only `dashboard-shell.css` was
grepped).

### 2.3 `.sqr-empty` (dashboard.html:331)

Icon + title + subtext + single CTA button, shown when `aiPages.length===0`.
Already inventoried in the prior Dashboard plan (§4 row 4, §3 row 12) as
`default`/`padding-xl` Surface-adjacent — carried forward unchanged here
since it is not itself a "Smart QR card," it is the grid's zero-state.

---

## 3. Proposed QDS Composition

```
QDS Surface (.qds-surface--default, .qds-surface--padding-none, .qds-surface--elevation-raised)
├── __header                          (replaces .sqr-card-top's badge+name+url portion)
│   ├── __header-main
│   │   ├── __media                   (replaces .sqr-thumb — QR image, 64×64)
│   │   └── __header-text
│   │       ├── [badges row]          (replaces the two .sqr-status spans — see §6 gap)
│   │       ├── __title               (replaces .sqr-name)
│   │       └── __description         (replaces .sqr-url)
├── __body                            (replaces .sqr-stats)
│   └── [3× stat pair: value + label] (no dedicated "Stats" sub-region exists in
│                                       surface.css today — composed from plain
│                                       __body content, not a named QDS region;
│                                       see §6 gap — sprint brief's example
│                                       diagram's "Stats" box is aspirational,
│                                       not a real class in surface.css v1)
└── __footer                          (replaces .sqr-divider + .sqr-actions)
    ├── qds-btn--secondary qds-btn--sm  (Manage — was .sqr-act.primary.sqr-manage)
    ├── qds-btn--ghost qds-btn--sm      (View — was .sqr-act.sqr-open)
    └── qds-btn--ghost qds-btn--sm      (Analytics — was .sqr-act.sqr-analytics)
```

Rationale, region by region:

- **Root: `default`, not `interactive`.** Per `QDS_COMPONENT_CATALOG_v1.md`
  §3 and `QDS_SURFACE_SYSTEM_v1.md` §28, the card is not itself a click
  target — only its footer buttons are. Setting `--interactive` would be
  incorrect usage per Surface's own §27 ("`selected` without `interactive`"
  is the named anti-pattern; the inverse — `interactive` with no root action
  — is equally wrong, just not explicitly enumerated).
- **Padding: `none` at the root**, because the current design has asymmetric
  internal spacing (18px/18px/14px top block, flush divider, then the
  `.sqr-actions` toolbar with its own `10px 8px` per-cell padding) that does
  not match any single `--qds-space-*` padding preset applied uniformly. The
  `__header`/`__body`/`__footer` regions carry their own internal padding
  per `surface.css`'s existing per-region rules; the root itself should not
  double up. **This must be verified against `surface.css`'s actual
  `__header`/`__body`/`__footer` padding values before implementation** —
  this audit read the region-existence and modifier list (§ shown in this
  plan's research) but did not diff exact padding tokens against the current
  18px/14px/10px pixel values pixel-for-pixel.
- **Elevation: `raised`.** Matches current behavior — `.sqr-card` already
  has a hover shadow/border change (`dashboard-shell.css:362`) equivalent to
  `--qds-elevation-sm`, i.e. QDS's `raised` tier, not `flat`.
- **Media region for the QR thumbnail.** `__media` exists precisely for a
  "media-dominant leading element" per `surface.css` (§ media region, used
  for the `preview` variant's QR/pass frame use case per
  `QDS_SURFACE_SYSTEM_v1.md` §26). Using it here (inside `__header-main`,
  alongside text) rather than `preview` variant's full-body media placement
  keeps the current "thumbnail + text side by side" layout rather than
  QDS's "QR dominates the whole card" preview pattern, which would be a
  visual regression from today's compact card.
- **Badges: not yet mappable to a real QDS component.** `Badge` is
  catalogued (`QDS_COMPONENT_CATALOG_v1.md` #12) but has **no corresponding
  CSS file** — only `button.css`, `surface.css`, `input.css` exist in
  `qds/components/`. The "Live" and "AI" indicators must stay as today's
  `.sqr-status.live`/`.sqr-status.ai` classes (or an equivalent page-level
  addon class) placed inside `__header-text`, not converted to a
  `qds-badge--*` class that does not exist yet. **This is a hard blocker for
  a visually-complete migration, not a style preference** — flagged again in
  §5.
- **Stats row: composed inside `__body`, not a distinct QDS region.**
  `surface.css` defines `__header`, `__media`, `__body`, `__footer`,
  and KPI-specific `__kpi-label`/`__kpi-value`/`__kpi-delta` (used by the
  already-migrated KPI cards) — there is no `__stats` region for a
  multi-value row inside a non-KPI card. Two options, decided by whichever
  engineer implements this wave:
  1. Reuse `__kpi-label`/`__kpi-value` three times inside `__body` (visually
     closest to current `.sqr-stat-v`/`.sqr-stat-l`, but semantically
     borrows KPI's typography scale for a non-KPI card).
  2. Keep `.sqr-stats`/`.sqr-stat-v`/`.sqr-stat-l` as page-level addon
     classes nested inside `__body`, unconverted — safest, but only
     partially "QDS-composed."
  This plan does not choose between them — flagged as an open decision
  for whoever executes Wave 1 (§7), not resolved here per the sprint
  brief's "do not invent new primitives unless absolutely required."
- **Footer: real nested `qds-btn` elements**, per
  `QDS_SURFACE_SYSTEM_v1.md` §28's explicit instruction ("real nested
  Buttons for `.sqr-act` actions per §13"). This drops the current
  `.sqr-actions` CSS-grid fused-toolbar layout (equal-width cells with
  bordered dividers) in favor of `__footer`'s flex row of independent
  pill buttons — a visual change already flagged as a risk in the prior
  Dashboard-wide plan (§3 row 11, §6) and repeated here since it applies
  specifically to this component.
- **Manage vs. View/Analytics button variant.** Today `.sqr-manage` carries
  `.primary` (accent-colored, bold) while `.sqr-open`/`.sqr-analytics` are
  plain muted-text buttons. Proposed: `qds-btn--secondary` for Manage
  (visually the more prominent of the three, but not full `--primary` fill,
  since three filled-primary-style buttons in one card footer would compete
  for attention) and `qds-btn--ghost` for View/Analytics — this is a
  judgment call, not a 1:1 token mapping, and should be confirmed against a
  real visual comp before implementation, not treated as settled by this
  document.

---

## 4. JavaScript Dependency Map

All three JS sites that touch `.sqr-card`/`.sqr-claimed-card` internals:

| Location | Pattern | What it does | Must remain unchanged |
|---|---|---|---|
| `renderCards()`, dashboard.html:315-319 | `getElementById('sqrGrid')`, `getElementById('sqr-loading')`, `grid.innerHTML=''` | Clears the grid and hides the skeleton loader before every re-render | `id="sqrGrid"`, `id="sqr-loading"` |
| `renderCards()`, dashboard.html:339-341 | `document.createElement('div')`, `card.className='sqr-card'`, `card.innerHTML=...` | Builds one full card per QR record as a single template string, appended once | The wrapper element must still receive whatever root class name is chosen (`sqr-card` or a QDS-equivalent) — nothing queries this class from *outside* `renderCards()` itself, so a rename is safe as long as this function's own later lines (below) are updated in the same change |
| `renderCards()`, dashboard.html:342-344 | `card.querySelector('.sqr-manage')`, `.sqr-open`, `.sqr-analytics`, each immediately assigned `.onclick=` | Wires up navigation for the 3 footer buttons, once per card, right after `innerHTML` is set | **`.sqr-manage`, `.sqr-open`, `.sqr-analytics` class names must stay on the 3 buttons regardless of what `qds-btn--*` classes are added alongside them** — this is the single hardest constraint in this migration. These are property-assignment listeners (`.onclick =`), not inline HTML attributes, which the prior Dashboard plan already noted is the safer pattern (dashboard-shell.css review, §3 row 11) — but the *selector* itself is a hard dependency on the literal class string, not on structure or position |
| `renderCards()`, dashboard.html:326-329 | `getElementById('sqr-count-badge')`, `getElementById('sqr-section-count')` | Updates sidebar badge count and section header count text — lives *outside* the card markup, in the sidebar/section-header regions explicitly out of this sprint's scope | Unaffected by card-internal changes; listed here only because it executes inside the same function |
| `deleteQR()`, dashboard.html:304-313 | `cardEl.remove()` | Removes a card element by direct reference (passed in as a parameter, not re-queried by selector) | No selector dependency at all — safe regardless of internal markup changes, **but note**: this function is not currently wired to any button in `.sqr-card`'s actual 3-button footer (Manage/View/Analytics) — grep found no call site passing a `.sqr-card` reference into `deleteQR()` from within `renderCards()`. Confirm whether a delete affordance exists elsewhere before assuming this function is dead code for this component; out of this audit's card-only scope to resolve. |
| Claim-card injection, dashboard.html:566-570 | `getElementById('sqrGrid')`, `grid.querySelector('.sqr-claimed-card')`, `existing.remove()` | Finds/replaces any existing claimed-card before inserting a fresh one | `.sqr-claimed-card` class name is a hard selector dependency, same constraint as `.sqr-manage` etc. above |
| Claim-card restore, dashboard.html:605-606 | `grid.querySelector('.sqr-claimed-card')` (existence check, not removed) | Skips re-inserting a claimed card if one is already present (guards against double-insert on top of a fresh claim) | Same `.sqr-claimed-card` selector dependency |
| Inline `onclick` inside the claimed-card template, dashboard.html:583, 620 | `onclick="document.getElementById('claimSuccessOverlay').classList.add('show')"` | Opens a modal overlay, string-built directly into `innerHTML` | Inline handler survives any class change on the same button element; only breaks if the button's *element type* changes (it doesn't need to) |
| `applyLang()`, dashboard.html:1828-1846 | `document.querySelectorAll('[data-i18n]')` | Translates every `data-i18n`-tagged element on the page | **Confirmed: no element inside `.sqr-card`, `.sqr-claimed-card`, or their action buttons carries `data-i18n`.** The only Dashboard-scoped selector this function touches outside the standard `[data-i18n]` sweep is `.sqr-empty .btn-create` (dashboard.html:1844-1845), which is the empty-state CTA, not a card — out of this sprint's card-only scope but noted since it lives in the same `#sqrGrid` container |
| `closest()` | — | **None found** anywhere in `dashboard.html` referencing any `.sqr-*` class | No risk from this pattern |
| Event delegation (ancestor listener + `e.target` check) | — | **None found** — every `.sqr-act`/`.sqr-claimed-btn` listener binds directly to its own element, either via `.onclick =` (sqr-card) or inline `onclick=` attribute (sqr-claimed-card) | Lower risk than typical delegation-based migrations; no assumption about DOM depth between the grid and a button to protect |

**Summary of what must not move or rename:** `#sqrGrid`, `#sqr-loading`,
`#sqr-count-badge`, `#sqr-section-count`, `.sqr-manage`, `.sqr-open`,
`.sqr-analytics`, `.sqr-claimed-card`. Everything else inside the card body
(`.sqr-thumb`, `.sqr-meta`, `.sqr-name`, `.sqr-url`, `.sqr-stats`,
`.sqr-status.*`, `.sqr-divider`) is **not** queried by any JS found in this
audit and can be freely restructured into QDS regions, provided the required
classes above are preserved on the correct elements in the new markup.

---

## 5. Risk Assessment

| Target | Classification |
|---|---|
| `.sqr-manage` / `.sqr-open` / `.sqr-analytics` → `qds-btn` (class added alongside, not replacing) | **Safe with preserved hooks** — `.onclick=` assignment pattern is selector-based on these exact class names (§4); as long as they remain on the button elements post-migration, `renderCards()`'s wiring lines (342-344) need zero changes |
| `.sqr-claimed-card` root class name | **Safe with preserved hooks** — two selector dependencies (§4) both key off the literal string `.sqr-claimed-card`; safe to keep as-is alongside any added `qds-surface*` classes, or rename only if both dashboard.html:569/606 call sites are updated in the same commit |
| `#sqrGrid`, `#sqr-loading`, `#sqr-count-badge`, `#sqr-section-count` | **Safe** — untouched by any card-internal region restructure |
| `.sqr-card` root → `qds-surface--default` (structural restructure of `renderCards()`'s template string into Header/Media/Body/Footer regions) | **Requires JavaScript adjustment** — not because any *selector* breaks (§4 confirms nothing external queries `.sqr-card` itself), but because the template string inside `renderCards()` (dashboard.html:341) must be rewritten region-by-region, and the 3 button `.onclick` wiring lines immediately after it (342-344) must still find `.sqr-manage`/`.sqr-open`/`.sqr-analytics` inside whatever new nested structure results |
| Status badges (`.sqr-status.live`, `.sqr-status.ai`) | **Do not migrate yet** — no QDS Badge CSS component exists (§3); no existing `dashboard-shell.css` rule was found styling these classes at all (§2.1), so there is no confirmed current visual to preserve parity against. Blocked on (a) Badge component shipping, (b) founder/design confirming these badges' actual current appearance in production (possible they're styled by a file outside this audit's scope, or are currently unstyled — must be checked in a browser before deciding, not assumed from grep alone) |
| Stats row (`.sqr-stats`/`.sqr-stat-v`/`.sqr-stat-l`) inside `__body` | **Requires JavaScript adjustment** — no, actually **no JS reads these classes** (§4 confirms), so reclassifying is a pure markup change; risk is purely the open design decision in §3 (reuse KPI's `__kpi-value`/`__kpi-label` vs. keep page-level addon classes), not a functional risk |
| `.sqr-divider` + `.sqr-actions` grid → `__footer` flex row | **Requires JavaScript adjustment** (layout only, not JS logic) — dropping the fused 3-up bordered-toolbar grid for 3 independent pill buttons is a visual change with no JS dependency to break, but should be confirmed against a design comp before shipping, since it's a real visual departure from current production, not a class-name-only swap |
| `.sqr-claimed-card`'s internal region split (top/info/badge/actions → Header/Media/Body/Footer) | **Requires JavaScript adjustment** — same category of restructure as `.sqr-card`, applied to *two* separate template-string builders (dashboard.html:571-587 and 609-623) that must both be updated together or they will drift further apart than they already have (§2.2 4-button vs. 3-button discrepancy) |
| `.sqr-empty` | **Safe with preserved hooks** — already scoped and classified in the prior Dashboard-wide plan (`QDS_DASHBOARD_MIGRATION_PLAN_v1.md` §3 row 12, §4 row 4); the one open item (`applyLang()`'s manual `querySelector('.sqr-empty .btn-create')`) is a Button-map concern, not a Smart-QR-card concern, and is out of this document's scope to re-litigate |
| `deleteQR()` (dashboard.html:304-313) | **Do not migrate yet** — audit found no call site wiring this function to any button inside the current 3-button `.sqr-card` footer; before touching the footer at all, confirm with the founder/dev whether a delete affordance is supposed to exist here and simply isn't wired, or whether this function serves an unrelated surface not covered by this audit |

---

## 6. Component Gaps Blocking a Full Migration

Confirmed absent from `qds/components/` (only `button.css`, `surface.css`,
`input.css` exist):

- **No Badge/status-pill CSS component.** Blocks a real migration of the
  Live/AI status badges and the claimed-card's LIVE badge. `QDS_COMPONENT_CATALOG_v1.md`
  #12 documents Badge as "Existing — converge" at the *inventory* level but
  no implementation file backs it yet.
- **No dedicated "Stats row" / multi-value metric-strip region** in
  `surface.css` beyond the KPI-specific `__kpi-label`/`__kpi-value`/`__kpi-delta`
  trio (built for the single-value KPI card, not a 3-across compact row
  inside a different card type). The sprint brief's example composition
  diagram's "Stats" box is directional, not a real class today.
- **No fused/bordered 3-up button toolbar pattern.** `__footer` is a plain
  flex row of independent buttons; the current `.sqr-actions` divided-grid
  toolbar look has no QDS equivalent (same gap already on record in
  `QDS_DASHBOARD_MIGRATION_PLAN_v1.md` §13).
- **No Menu/Dropdown component**, relevant because `QDS_COMPONENT_CATALOG_v1.md`
  #23 explicitly names the Smart QR card's `.sqr-actions` 3-always-visible-button
  row as the reason a future overflow Menu is needed once more per-QR actions
  are added — not a blocker for *this* migration, but worth the founder
  knowing before locking in "3 buttons in a footer" as the long-term shape.

None of these gaps block migrating the **structure** (Header/Media/Body/Footer
regions, real nested Buttons) — they only block fully replacing every visual
element with a named QDS primitive. Where a gap exists, the recommendation is
to keep today's page-level class (e.g. `.sqr-status.live`) nested inside the
new QDS region rather than inventing a new primitive, per the sprint brief's
explicit instruction not to invent primitives unless absolutely required.

---

## 7. Migration Sequence

**Wave 1 — Structural restructure of `.sqr-card` inside `renderCards()`**
Files: `dashboard.html` (315-347, template string + button wiring).
Action: rewrite the template string built at dashboard.html:341 into
Surface Header (media + badges + name + url) / Body (stats) / Footer (3
buttons) regions; update nothing else in `renderCards()` except confirming
lines 342-344 still resolve `.sqr-manage`/`.sqr-open`/`.sqr-analytics`
against the new nested structure.
Blocked on: §6 Badge gap (proceed with page-level `.sqr-status.*` classes
retained inside the new Header region if Badge isn't ready in time — do not
block the whole wave on it), and the open Stats-region design decision (§3).
Risk: High (this is the restructure previously deferred in the Dashboard-wide
plan). Validation: full visual diff at 1280/768/640px against current
production; confirm all 3 footer buttons still navigate correctly; confirm
`deleteQR()` question (§5) is resolved first, since it touches this same
function's card-removal path.

**Wave 2 — `.sqr-claimed-card`, both builders**
Files: `dashboard.html` (571-587, 609-623).
Action: apply the same region restructure to both template-string builders
in the same commit — do not update one without the other, since they are
already drifted (4 vs. 3 footer buttons, §2.2) and touching only one risks
widening that gap further.
Blocked on: Wave 1 landing first (proves the pattern), plus the same Badge
gap for the single LIVE badge.
Risk: Medium — smaller markup than `.sqr-card`, but the dual-builder
duplication is a real hazard specific to this element.

**Wave 3 — Status badges → real Badge component**
Files: `dashboard.html` (badge markup inside both card types).
Action: swap page-level `.sqr-status.*`/`.sqr-claimed-badge` classes for a
real `qds-badge--*` class once that component ships.
Blocked on: Badge component (§6) — not schedulable until that exists.

Not included in this plan (unchanged, prior plan's classification stands):
`.sqr-empty`'s CTA button and the Dashboard-wide `applyLang()` selector fix
for it — those belong to the Button migration track already covered in
`QDS_DASHBOARD_MIGRATION_PLAN_v1.md`, not this card-specific document.

---

## 8. Rollback Strategy

- Wave 1 and Wave 2 both touch only `dashboard.html` (no CSS/JS file split,
  since the template strings and their surrounding functions live inline in
  this file) — rollback is `git revert` of the wave's commit, or manual
  restoration of the pre-migration template-literal strings recorded
  verbatim in §2.1/§2.2 of this document.
- No `.onclick` wiring lines (dashboard.html:342-344) change independently
  of the template string they query — they are part of the same function
  and must be committed together, then reverted together, never split.
- Wave 2's two builders (571-587, 609-623) must be reverted together if
  either is reverted — reverting only one re-introduces the pre-existing
  4-vs-3-button drift at a moment when it would be actively confusing to
  debug.
- No backend, database, or API changes are implicated by any wave.

---

## 9. Validation Checklist

Per wave, before merge:
- [ ] Visual diff at 1280px, 768px, 640px against current production
      screenshots of `#sqrGrid` specifically (not the full dashboard).
- [ ] `renderCards()`'s 3-button wiring (dashboard.html:342-344) still
      resolves `.sqr-manage`/`.sqr-open`/`.sqr-analytics` post-restructure —
      click all three on at least one real card and confirm navigation.
- [ ] `#sqrGrid`, `#sqr-loading`, `#sqr-count-badge`, `#sqr-section-count`
      still resolve via `getElementById` — confirm KPI counts and sidebar
      badge still populate on a real dashboard load.
- [ ] Empty state (`aiPages.length===0`) still renders correctly — a grid
      restructure of the populated-card path must not accidentally break the
      separate `.sqr-empty` branch (dashboard.html:330-333).
- [ ] Claimed-card flow: trigger a fresh claim (`?claimDemo=...`) and a page
      reload with an already-persisted claim (`restoreActiveClaim()`) —
      confirm both builders render the restructured card identically post-Wave-2.
- [ ] Confirm no `data-i18n`/`applyLang()` regression — re-run `toggleLang()`
      and verify the card region is unaffected (expected: no change, since
      §4 confirms zero `data-i18n` inside these elements today).
- [ ] Confirm `qds.css`/`surface.css`/`button.css` are actually linked from
      `dashboard.html` before this wave ships — `dashboard.html` currently
      already references `qds-surface*` classes for the migrated KPI cards
      (dashboard.html:268-271), so this should already be true, but must be
      re-confirmed rather than assumed for this specific wave's build.
- [ ] Founder/design sign-off on the visual delta from `.sqr-actions`'
      fused 3-up bordered toolbar to `__footer`'s independent pill buttons —
      this is a real, visible change, not a hidden implementation detail.

---

## 10. Validation Summary (this audit)

✓ No production files changed.
✓ No CSS changed.
✓ No HTML changed.
✓ No JavaScript changed.
✓ No backend files changed.
✓ Only this migration document was created.
