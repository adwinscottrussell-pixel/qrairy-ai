# QDS Badge System v1

Status: DRAFT — awaiting founder approval. Architecture only. No CSS, HTML,
JavaScript, or backend file was created or modified to produce this
document. No production file changed.

Builds on `QDS_COMPONENT_CATALOG_v1.md` §12 (initial Badge inventory) and
`QDS_COMPONENT_SPECIFICATIONS_v1.md` §4 (first-pass Badge contract). This
document supersedes both for Badge specifically — it re-verifies every
migration target against live source, resolves the two specs' open
questions (tint tokens, count vs. dedicated Counter, dot-only naming), and
extends coverage to every status/tag/pill pattern in the repo, not just the
six originally catalogued. Also directly unblocks
`QDS_SMART_QR_CARD_ARCHITECTURE_v1.md` §6 and §18 item 1, which named
missing Badge CSS as the reason Live/AI/Claimed status presentation could
not migrate off page-level classes.

---

## 1. Purpose

Communicate a short, glanceable, non-interactive status or category inline
with other content — plan tier, live/paused state, AI-generated marker, a
count. A Badge answers "what state is this in / what kind is this," never
"what can I do to it."

## 2. Design Philosophy

Nine independent color-coded pill implementations exist today for one
concept (§20). Per **Converge on one working mechanism**
(`company/03_CORE_PRINCIPLES.md`), this spec defines a single `qds-badge`
with a `tone` enum and a small, fixed anatomy — a new status (e.g. a future
"trial expiring" state) is a new `tone` value applied to the existing
component, not an tenth bespoke class in a ninth stylesheet. Badge is
deliberately small in scope: it owns presentation of a known, bounded state.
It does not own click behavior, filtering, dismissal, or business logic
(§21). Where a real product need pushes past that boundary (removable tags,
filter chips), the correct answer is a separate, later-specified component
built adjacent to Badge, not an interactive mode bolted onto it.

## 3. When to Use

- A QR/page/campaign's live-vs-not state (Live, Draft, Disabled).
- A content-origin marker (AI-generated).
- A claim/ownership state (Claimed, Unclaimed).
- A plan/tier label (Free, Starter, Pro, Business).
- A category or type label on a row/card (Dynamic, Basic, Static).
- A small numeric count riding on a nav item or section header.

## 4. When Not to Use

- **Button** — any affordance the user clicks to do something. A badge is
  never a click target, even one that merely opens a menu.
- **Tag / removable chip** — a labeled value the user can remove or that
  represents a filter criterion (an "×" dismiss affordance). Not specified
  in this version; flagged as future extensibility (§21, §26).
- **Filter chip** — a selectable option in a filter bar. Interactive and
  stateful (selected/unselected) in ways Badge explicitly is not.
- **Toggle** — an on/off control the user changes. A Badge can *display*
  the result of a toggle's state (e.g. "Live" reflecting a toggle elsewhere)
  but is never itself the control.
- **Status indicator dot with no text** — a bare colored dot with no
  adjacent label text is not a valid Badge composition (§17 — color is
  never the only signal). `dot-only`-style bare dots used elsewhere in the
  codebase without adjacent text (e.g. `.status-dot-off` in isolation) are
  a pre-existing accessibility gap, not a pattern Badge should formalize.
- **Counter standing alone** — a numeric value with no label riding on its
  own (e.g. a notification-bell overlay) is a distinct future component
  (§16, §21), not this version's `count` prop used in isolation.
- **Tooltip** — supplementary hover text. A Badge's label is always
  visible, never revealed only on hover.
- **Notification dot** — an unlabeled presence indicator (e.g. "new items
  exist") overlaid on an icon or avatar corner. Visually similar to a status
  dot but semantically an alert-of-existence, not a state label — out of
  scope for this version (§21).

## 5. Anatomy

```
[ status-dot? ]  [ leading-icon? ]  label  [ count? ]
```

| Element | Included in v1 | Notes |
|---|---|---|
| Root | Yes | `.qds-badge`, the pill container |
| Label | Yes, required | The only mandatory content |
| Leading icon | No | Evaluated and dropped — see §15 |
| Trailing icon | No | Evaluated and dropped — no real use case found; would blur the line with a future removable Tag |
| Status dot | Yes | Optional leading dot, matches `.status-dot-live`/`.trial-dot`/`.settings-status-dot` precedent |
| Count | Yes | Optional, replaces label or sits inside it — resolved as part of Badge, not a separate component, for v1 (§16) |
| Accessible text | Yes, conditional | `aria-label` only when the visible label alone is insufficient (§17) |

Root is a single `<span>`. Never a `<button>`, `<a>`, or any element with a
click handler.

## 6. Public API

Proposed contract only — not implemented in this sprint.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `tone` | `neutral \| brand \| success \| warning \| danger \| information \| ai \| draft \| disabled` | `neutral` | See §7 for which survive as real variants |
| `size` | `sm \| md` | `sm` | See §8 |
| `label` | string | — | Required unless `count`-only usage is explicitly named as a future variant (not in v1 — see §16) |
| `appearance` | `subtle \| solid` | `subtle` | See §9 |
| `dot` | boolean | `false` | Renders the leading status dot |
| `icon` | — | not supported in v1 | See §15 |
| `count` | number | — | See §16 |
| `removable` | boolean | not supported in v1 | See §21, §26 |
| `disabled` | not applicable | — | Badge has no disabled state of its own (§10) — a "disabled" *tone* exists for labeling a disabled QR/page, which is different from the badge itself being interactive-then-disabled |
| `aria-label` | string | — | Only when label text alone doesn't convey full meaning (§17) |
| `title` | string | — | Optional native tooltip for truncated/ambiguous labels; never a substitute for visible text |
| `data-*` | — | consumer-defined | e.g. `data-testid`; not part of the visual contract |

No `onClick`, `onRemove`, `href`, or any event-handler prop exists in this
version's API. Adding one is the signal that the use case has outgrown
Badge and needs a different component (§21).

## 7. Variants (Tone)

Evaluated against real, currently-rendered states (§20):

| Tone | Keep? | Real precedent |
|---|---|---|
| `neutral` | Yes | `.badge-free`, `.plan-free`, admin's default row state |
| `brand` | Yes | `.badge-ai` (repurposed as the generic brand-accent tone, not AI-specific — see `ai` below) |
| `success` | Yes | `.badge-live`, `.badge-success`, `.status-dot-live`, `.pt-badge-live`, `.settings-status-badge` |
| `warning` | Yes | `.badge-trial` (trial/expiring-soon states) |
| `danger` | Yes | No direct current precedent found, but required for a disabled/error/expired state that is a real near-term need (e.g. a suspended account in admin) — kept as a foundation-complete set rather than added reactively later |
| `information` | Yes | No direct current precedent found; kept for neutral-informational callouts (e.g. a "Beta" marker) — same reasoning as `danger` |
| `ai` | Yes, distinct from `brand` | The AI marker (`.badge-ai`, "✨ AI") is a deliberate, recurring product signal (also carried as `variant="ai"` on Button per `QDS_COMPONENT_SPECIFICATIONS_v1.md` §1) — kept as its own tone rather than folded into `brand`, so "AI-generated" always reads identically wherever it appears, independent of whatever a page's brand-accent usage happens to be |
| `draft`/`disabled` | Fold into `neutral`, not kept as separate tones | No current implementation distinguishes a "draft" or "disabled" *color* from plain neutral/muted — `.badge-free`'s muted treatment already serves this. Adding two more tones for a color distinction nobody currently draws would be inventing state, not converging it. **Draft and Disabled are `label` values on the `neutral` tone**, not tones themselves (see §19 for exact Smart QR Card mapping) |

Rejected as page-specific (per sprint brief's explicit instruction):
`smart-qr-live` (→ `tone="success"` `label="Live"`), `campaign-active` (→
`tone="success"` `label="Active"`, once Campaigns exists), `wallet-enabled`
(→ `tone="success"` `label="Enabled"`). Tone is always semantic (what kind
of state); the label carries what the state is called on this page.

Final kept set: **`neutral`, `brand`, `success`, `warning`, `danger`,
`information`, `ai`** — seven tones, not ten.

## 8. Sizes

`sm` only, matching the sprint brief's instruction and the unanimous
current evidence — every existing badge implementation renders at a small,
consistent scale (`.5rem`–`.72rem` font sizes across all nine
implementations, §20). No `md`/`lg` variant is added without a named,
concrete use case. If a future context needs a larger badge (e.g. a
prominent plan-tier marker on a pricing page), that is a new requirement to
bring back to this spec, not something to pre-build speculatively.

## 9. Appearance

Two real patterns exist today, not three:

- **`subtle`** (default) — tinted background + matching border + matching
  text color. Matches `.badge-live`, `.badge-ai`, `.plan-badge` family,
  `.pt-badge-live`, `.settings-status-badge`. This is the dominant pattern
  across every implementation found (§20) and is the only appearance most
  tones need.
- **`solid`** — filled background in the tone's full color, inverse text.
  No current precedent exists in the audited pages. Kept as a defined
  variant (not dropped) because admin/status contexts sometimes need a
  higher-contrast, more attention-grabbing marker than a tint affords (e.g.
  a "Suspended" account state) — but this is a **foundation gap flagged as
  Medium** (§23), not confirmed necessary by current evidence. Do not
  implement `solid` until a real page names the need.

`outline` (border-only, no fill) was evaluated and dropped — no current
implementation uses a border-only badge, and it would be visually
redundant with `subtle`'s already-light tint at this component's font
sizes. Two appearances, not three.

## 10. States

Badge is **non-interactive by default** and has no hover/active/focus
states in this version — restated as a hard constraint, not a default that
implementation is free to add hover treatment to.

- **default** — the only state most badges ever occupy.
- **disabled** (badge itself, not the thing it labels) — not applicable.
  Badge has no interactive state to disable. A badge *labeling* a disabled
  entity uses `tone="neutral"` `label="Disabled"` (§7, §19); the badge
  element itself never carries a disabled/dimmed rendering distinct from
  any other neutral badge.
- **loading** — not applicable. No current implementation shows a
  loading/skeleton badge; if a future async status badge is needed (e.g.
  "Live" pending confirmation from a webhook), that composes with the
  existing Skeleton component's line variant standing in for the whole
  badge, not a new Badge-owned loading state.
- **truncated** — see §18 (Responsive behavior).
- **count overflow** — see §16.

## 11. Typography

`--qds-text-label-*` — same role already assigned to Badge in
`QDS_COMPONENT_SPECIFICATIONS_v1.md` §4 (semibold, small, letter-spaced),
and the same role Form Labels and Button labels use. No component-specific
font-size token is introduced. `--qds-text-label-size` (0.75rem) is larger
than several current implementations' hand-set sizes (`.5rem`–`.58rem`,
§20) — this is a deliberate normalization, not an oversight: nine
implementations currently disagree on badge text size with no evident
reason, and none of the disagreement reflects a real content or contrast
requirement worth preserving.

## 12. Colors

`tone` maps to existing foundation status/brand colors for `subtle`
appearance (background = a tint of the tone color, border = a slightly
stronger tint, text = the tone color at full value):

| Tone | Text / border source | Background |
|---|---|---|
| `neutral` | `--qds-color-text-muted` | tint of `--qds-color-text-muted` — **gap, §23** |
| `brand` | `--qds-color-brand-primary` | tint of `--qds-color-brand-primary` — **gap, §23** |
| `success` | `--qds-color-success` | tint of `--qds-color-success` — **gap, §23** |
| `warning` | `--qds-color-warning` | tint of `--qds-color-warning` — **gap, §23** |
| `danger` | `--qds-color-danger` | tint of `--qds-color-danger` — **gap, §23** |
| `information` | `--qds-color-information` | tint of `--qds-color-information` — **gap, §23** |
| `ai` | `--qds-color-brand-primary` (same hue as `brand` — the two tones are only distinguished by label/usage convention, not a separate AI color) | tint of `--qds-color-brand-primary` |

No tone hard-codes a color — every value above resolves to a foundation
token or a computed tint of one, once the tint tokens (§23) exist. Current
production values (e.g. `rgba(34,197,94,0.1)` background with `#22c55e`
text for `success`/live) are a reasonable starting ratio but are
**unverified against WCAG AA at Badge's actual small text size** — carried
forward as the starting point for the tint token work, not as a confirmed-
safe value (same caveat `QDS_COMPONENT_SPECIFICATIONS_v1.md` §4 already
raised, re-confirmed here, still unresolved).

## 13. Spacing

`--qds-space-2` horizontal padding, `--qds-space-1` vertical padding — same
as the existing spec (`QDS_COMPONENT_SPECIFICATIONS_v1.md` §4), re-affirmed
against this version's wider audit (every current implementation uses a
comparably tight, sub-`--qds-space-2` padding — e.g. `2px 7px`, `3px 8px`,
`4px 10px` — the token pairing is the closest canonical match, not an exact
pixel port). Dot-to-label gap and label-to-count gap: `--qds-space-1`.
Icon is not part of v1's anatomy (§15), so no icon-gap token is needed.

## 14. Radius

`--qds-radius-full` (pill shape) — matches every single current
implementation without exception (`999px`/`99px`/`9999px` are all
functionally full-pill radii already). No deviation proposed.

## 15. Icon Behavior

**No arbitrary leading/trailing icon slot in v1.** Evaluated against real
usage and dropped:

- The AI marker uses a text glyph today (`✨ AI`) which reads correctly as
  part of the label string itself, not a distinct icon slot — the `ai`
  tone's label is expected to include its own leading emoji/glyph as
  authored content, not a separate `icon` prop.
- No current badge implementation composes a semantic (non-decorative)
  icon distinct from its status dot.
- Adding a general icon slot now, with no concrete second use case beyond
  the AI glyph, would blur Badge toward a Tag/Chip component before a real
  need justifies it — consistent with the sprint brief's explicit
  instruction not to add capability without a named use case.

**Status dot** (the one icon-adjacent element that is kept):
- Size: a fixed small circle, `6-8px` diameter matching current
  `.trial-dot`/`.status-dot-live`/`.settings-status-dot` precedent (exact
  token TBD — no `--qds-size-dot-*` token exists yet, flagged §23).
- Placement: leading, before the label, `--qds-space-1` gap.
- Decorative: the dot itself is `aria-hidden="true"` always — it is never
  the sole conveyor of meaning (§17), so it carries no accessible name of
  its own; the adjacent label text is the accessible content.
- The dot's color follows the badge's `tone`, not an independent color prop
  — a `tone="success"` badge with `dot` gets a success-colored dot, never a
  mismatched color.

## 16. Count Behavior

Resolved as **part of Badge in v1**, not a separate Counter component —
the only current count usage (`.sb-badge`, sidebar nav item count) is
structurally identical to every other Badge use (small pill, tinted/solid
background, short numeric label) and does not justify a second component
yet.

- **Numeric count**: renders as the badge's `label` when `count` is set
  (e.g. a nav item's unread/pending count). `count` and `label` (text) are
  mutually exclusive in a single badge in v1 — a badge is either a status
  label or a count, not both in one pill, matching current usage (no
  existing implementation combines status text and a count in one badge).
- **Maximum display**: `99+` once `count > 99` — no current implementation
  defines this (`.sb-badge` has no overflow rule found), so this is a
  **new, recommended behavior**, not a preserved one. Flagged as such, not
  silently assumed.
- **Zero behavior**: a `count={0}` badge should not render at all (the
  consuming page omits the Badge entirely, same convention already implicit
  in `.sb-badge`'s current usage — a nav item with 0 pending items shows no
  badge). Badge itself does not special-case zero internally; this is a
  consumer-side omission rule to document, not a hidden `count===0` branch
  inside the component.
- **Accessible label**: a bare number is insufficient — count badges
  require an `aria-label` stating what is being counted (e.g.
  `aria-label="3 pending subscribers"`), never just `aria-label="3"` (§17).
- **Count vs. separate Counter component**: kept as one component for v1
  per the "do not invent new primitives unless absolutely required"
  instruction; flagged as a candidate to split out (§23, Low priority) if a
  second, structurally different count use case appears (e.g. an
  icon-corner overlay count, which is a different anatomy entirely — a
  notification dot with a number, not a labeled pill).

## 17. Accessibility

- **Plain text is sufficient** whenever the label alone states the full
  meaning ("Live", "AI", "Draft") — the overwhelming majority of Badge
  usage. No `aria-label` needed beyond the visible text in these cases.
- **`aria-label` is required** when: (a) `count` is used (§16 — a bare
  number needs context); (b) the visible label is an abbreviation or glyph
  that doesn't stand alone for assistive tech (none currently identified,
  but the pattern must be available); (c) `dot`-only compositions are ever
  attempted despite §4's guidance against them.
- **Color is never the sufficient signal.** Every kept tone pairs with
  visible label text (`.badge-live` already does this correctly — "LIVE",
  not a bare green dot — this is the precedent to standardize, not an
  aspiration). A tone conveyed by background tint alone, with no
  distinguishing text, is incorrect usage regardless of contrast.
  Restated from `QDS_COMPONENT_SPECIFICATIONS_v1.md` §4, re-confirmed
  against the wider audit — no exception found or introduced.
- **Live-region behavior**: required only when a badge's status changes
  *while the user is on the page* in a way they should be told about
  without re-scanning (e.g. a Smart QR Card's Live badge flipping to
  Disabled after an in-page toggle). The Badge element itself is not
  wrapped in `aria-live` by default (that would cause every badge on a
  polled/re-rendered page to announce on every refresh, which is noise,
  not signal) — the **consuming page** wraps the specific badge instance in
  `aria-live="polite"` only when its value is expected to change from a
  user's own in-page action, not on generic data refresh. This is a
  consumer responsibility, not a Badge default.
- **Icon semantics**: the status dot is always `aria-hidden` (§15) — it
  never carries independent semantic meaning beyond reinforcing the
  adjacent text.
- **Contrast requirements**: `subtle` appearance's tinted-background text
  must meet WCAG AA (4.5:1 for the ~12px label text) — **not yet verified
  for any tone** (§12, §23). This must be confirmed once real tint values
  are computed, not assumed from current unverified production values.
- **Forced-colors behavior**: under `forced-colors: active` (Windows High
  Contrast), a tinted background collapses to the system background and
  tint-based borders may disappear — Badge must retain a visible border in
  forced-colors mode using a `forced-color-adjust`-safe approach (e.g. a
  `1px solid currentColor`-style border that survives the mode), consistent
  with how Button and Surface already handle `forced-colors` for their
  focus rings (`button.css`/`surface.css`, both use an explicit
  `@media (forced-colors: active)` override). **Not yet verified** — this
  is a requirement to test once implemented, not a claim that it already
  works.
- **No screen-reader validation has been performed** on any current badge
  implementation or on this proposed contract — this document states
  requirements to satisfy, not confirmation that they are met.

## 18. Responsive Behavior

- **Truncation**: Badge labels do not truncate internally in v1 — every
  current implementation uses short, fixed vocabulary ("Live", "AI",
  "Draft", plan names) that never approaches wrap-worthy length. If a
  future label source is long or user-generated, that is a new requirement
  (a category/tag label from free text, for instance) needing its own
  truncation rule — not solved here, since no current usage needs it.
- **Wrapping**: a badge's own text never wraps (`white-space: nowrap`,
  matching every current implementation's effective behavior). Multiple
  badges in a row (§19) may wrap to a second line as a group, inside their
  containing flex row — the individual badge stays single-line; the row
  wraps, not the pill.
- **Minimum readable width**: content-driven, no fixed minimum — a
  single-character or short-word label (e.g. "AI") is a valid, common case
  today and should not be artificially widened.
- **Narrow cards**: inside a Smart QR Card or similar compact container
  (§19), a multi-badge status row must wrap gracefully rather than
  overflowing the card's fixed width — this is the flex-wrap behavior
  already native to `qds-surface__header` (`surface.css` — `flex-wrap:
  wrap`), which the status row composes inside of, not a rule Badge needs
  to own independently.

## 19. Smart QR Card Composition

Direct resolution of `QDS_SMART_QR_CARD_ARCHITECTURE_v1.md` §6's status
row, which named the missing Badge CSS as a blocker to full visual
migration (not a blocker to the structural migration itself, per that
document's own carve-out).

| Card state | Badge(s) | Tone | Label | Dot |
|---|---|---|---|---|
| Unclaimed, live, AI-generated (`.sqr-card` today) | Two badges | `success` + `ai` | "Live" + "AI" | Live badge only |
| Claimed (`.sqr-claimed-card` today) | One badge | `success` | "Live" | Yes |
| Draft (no current implementation — named in sprint brief, not yet a real card state per `QDS_SMART_QR_CARD_ARCHITECTURE_v1.md` §6, which confirms no Active/Disabled/Draft flag is currently rendered on any card) | One badge, **not yet backed by real data** | `neutral` | "Draft" | No |
| Disabled (same caveat as Draft) | One badge, **not yet backed by real data** | `neutral` | "Disabled" | No |

**Multiple badges may appear together.** The unclaimed card's Live+AI pair
is the confirmed precedent (`dashboard.html`'s
`<span class="sqr-status live">● Live</span><span class="sqr-status ai">✨ AI</span>`,
per the Architecture doc §6). Order is status-before-category: a
live/draft/disabled state badge (what stage the page is in) precedes a
content-origin badge like AI (what made it) — matching current DOM order
exactly. Claimed cards show only the single Live badge today; Draft and
Disabled are **not currently renderable states** on any card (§6 of the
Architecture doc is explicit that no such flag exists in the data model)
— their row above is this document's proposed mapping for when that data
becomes available, not a currently-shipping combination. **Do not implement
Draft/Disabled badge presentation as a Smart QR Card feature without
confirming the backing status field exists** — this is a data-model gap
inherited from the Architecture doc, not resolved by defining Badge.

The status row occupies the named slot already reserved by the
Architecture doc (§6): inside `__header-text`, above `__title`. This
document does not redefine that placement, only the component that fills
it.

## 20. Other Migration Targets

Full re-audit, superseding the six-implementation count in
`QDS_COMPONENT_CATALOG_v1.md` §12 with nine confirmed implementations:

| Surface | Classes | File | Notes |
|---|---|---|---|
| Dashboard (sidebar) | `.sb-badge` | `dashboard-shell.css:102-108` | Count badge (nav item), not a status badge — same anatomy, different data (§16) |
| Dashboard (plan/status pills) | `.badge`, `.badge-live`, `.badge-ai`, `.badge-trial`, `.badge-free`, `.badge-premium`, `.badge-success` | `dashboard-shell.css:189-200` | Closest thing to an existing canonical base — a shared `.badge` root class already exists here, unlike any other implementation |
| Dashboard (settings tab) | `.settings-status-badge`, `.settings-status-dot` | `dashboard-shell.css:274-294` | Live-connection status, e.g. a settings integration being active |
| Dashboard (Smart QR cards) | `.sqr-status.live`, `.sqr-status.ai`, `.sqr-claimed-badge`, `.sqr-claimed-badge-dot` | `dashboard.html` (via `renderCards()`), `dashboard-shell.css:62-68` (partial rule for claimed only) | See §19; `.sqr-status.*` confirmed to have **zero CSS backing it today** per the Architecture doc §6 |
| QR Manage | `.status-indicator`, `.status-dot-live`, `.status-dot-off` | `manage-page.css:15-17` | Dot-plus-text pattern; `.status-dot-off` used without adjacent required text in at least one context per file structure — flag for audit against §17's "color is never sufficient" rule at implementation time |
| Analytics | `.pt-badge-live`, `.pt-badge-basic` | `analytics-page.css:27-28` | Per-QR-row plan/live marker inside the performance table |
| Admin | `.plan-badge` + `.plan-free`/`.plan-starter`/`.plan-pro`/`.plan-business`, `.status-dot` | `admin.html:180-192`, used at `admin.html:597,926` | Four-tier plan label system — direct precedent for the `tone` enum's need to support at least 4 distinct semantic buckets beyond raw status; also used inline for QR-type labels ("Dynamic"/"AI"/"Basic") at line 926, confirming Badge's dual use as both plan-tier and content-type label |
| Loyalty | `.card-tag` | `loyalty-setup.html:52` | Minimal styling (font-size/letter-spacing/color only, no background/border) — closer to a plain label today than a pill; migration should confirm intended visual weight with design before assuming full Badge treatment |
| Wallet Pass Studio | `.wps-tag` | `wallet-pass-studio.html:21` | Same minimal-styling situation as `.card-tag` — a section eyebrow label, not confirmed to be a status pill in the Badge sense; **flag for founder confirmation this is actually a Badge use case and not a Section Title/eyebrow typography role instead** before migrating |
| Wallet, Subscribers, Campaigns, Multi-location | — | — | No dedicated page exists yet for Campaigns, Subscribers, or Multi-location in the current `frontend/public/` tree (confirmed by directory listing) — nothing to audit; any future badge usage there should adopt this spec from the start rather than inventing a tenth pattern |
| Editor | — | — | No badge/status/tag/pill class found anywhere in `editor.html`, `smart-editor.js`, `panels.js`, or `canvas-elements.js` (grep confirms no match) — the editor currently has no status-badge use case at all |

Nine implementations, not six: the original catalog's count missed
`.sb-badge` (count, not status — but same component), `.settings-status-badge`,
and `.status-indicator`/`.status-dot-*`. `.card-tag` and `.wps-tag` are
flagged above as **possibly not real Badge use cases** (minimal/no pill
styling today) — do not force-migrate them without confirming intent.

## 21. Non-Goals

Badge does not own:

- **Click behavior** — no `onClick`, no `href`, never a `<button>`/`<a>`.
- **Filtering** — a filter-by-status control is a Filter Bar / Button
  Group concern, not Badge, even when it displays the same tone/label
  vocabulary.
- **Toggling** — Badge never changes its own state on interaction; it only
  reflects state owned elsewhere.
- **Navigation** — a badge is never a link, even a disguised one.
- **Dismiss actions** — no "×" removal in this version (§26 names the
  future Tag component that would own this).
- **Tooltips** — a Badge may carry a native `title` attribute for
  supplementary detail, but does not implement or own tooltip behavior
  itself (that's the Tooltip component, composed independently if needed).
- **Business logic** — Badge never computes its own tone/label from
  underlying data; the consuming page decides what tone and label to pass,
  same as every other QDS component in this catalog.
- **Real-time data subscriptions** — Badge has no polling, socket, or
  live-data-fetching behavior; it renders whatever prop values it's given,
  same as Button and Surface.

## 22. Public Class Contract

Proposed class names only — not implemented in this sprint.

**Public API (consumer-facing):**
- `qds-badge` — root
- `qds-badge--neutral`, `qds-badge--brand`, `qds-badge--success`,
  `qds-badge--warning`, `qds-badge--danger`, `qds-badge--information`,
  `qds-badge--ai` — tone modifiers
- `qds-badge--solid` — appearance modifier (absence = `subtle`, the default,
  matching Button/Surface's "no explicit sm/md class = no implicit
  default" pattern is *not* followed here — see note below)
- `qds-badge--sm` — size (only size in v1; included for forward-compatible
  naming if `md` is ever added, not because a modifier is required to
  distinguish it from anything today)

**Internal elements (not part of the public contract, implementation
detail):**
- `qds-badge__dot` — status dot
- `qds-badge__label` — label text wrapper
- `qds-badge__count` — count text wrapper (when `count` is used instead of
  `label`)

**State modifiers:**
- None in v1 — Badge has no interactive/disabled/loading state classes
  (§10). If a future need arises, it is added deliberately, not
  speculatively reserved now.

**Playground-only helpers:**
- None anticipated — Badge has no hover/active/focus state to force-display
  in the playground (unlike Button/Surface's `.qds-pg-force-hover` etc.),
  since Badge has no such states to demonstrate (§10).

Note on defaults: unlike Button and Surface, which require an explicit size
class always, Badge's `sm` is the only size — implementation may treat
`qds-badge--sm` as applied-by-default-in-markup (always written) for
forward-compatibility with a future `md`, consistent with how this
document recommends always writing the tone class explicitly (no implicit
"default tone" left unstated).

## 23. Foundation Gaps

| Gap | Classification | Why needed | Smallest safe addition | Blocks implementation? |
|---|---|---|---|---|
| No `components/badge.css` file | **Critical** | The component does not exist at all — this is the primary gap this document exists to close the spec side of | A new `qds/components/badge.css` file, token-only, following `button.css`/`surface.css`'s existing structure | Yes — nothing in this system can ship without it |
| No pre-computed tint/background color pairs for any tone | **Critical** | `colors.css` defines solid status colors only (`--qds-color-success`, `--qds-color-danger`, etc.) — `subtle` appearance needs a paired background tint for all seven tones, and none exist | Add `--qds-color-{tone}-subtle-bg` / `--qds-color-{tone}-subtle-border` for `success`, `warning`, `danger`, `information`, `brand` (covers `ai` too, same hue) — 5 new token pairs, not 7, since `neutral` can derive from existing `--qds-color-surface-2`/`--qds-color-text-muted` directly | Yes — `subtle` (the default and only-confirmed-needed appearance) cannot render correctly without these |
| WCAG AA contrast unverified for any tint pairing | **Critical** | Current production values for the closest analog (`rgba(34,197,94,0.1)` bg / `#22c55e` text) were already flagged as close to the non-text contrast threshold in the original catalog and never verified | Run a real contrast check once the tint tokens above are drafted, before shipping any tone — this is a verification task, not a token to add | Yes — shipping unverified-contrast status text fails the accessibility requirement this same document states in §17 |
| No status-dot size token | **Medium** | Every current dot implementation hand-sets `6-8px` inline; no `--qds-size-dot-*` or equivalent exists in `spacing.css` | Add `--qds-size-dot-sm: 6px` (or 8px, pending a design decision on which current value is canonical) to `spacing.css` | No — a hard-coded fallback value can ship in `badge.css` initially and be swapped for a token later without a visual change, same category of gap as Button's `lg` typography role was before it was added |
| No `solid` appearance precedent/tokens | **Medium** | §9 keeps `solid` as a defined variant but no current page uses it and no inverse-text-on-solid-background pairing has been designed | Do not add tokens speculatively — defer until a real page names the need, then derive `solid` background from the same solid color already in `colors.css` (e.g. `--qds-color-success` directly, inverse text `--qds-color-text-inverse`) — likely zero new tokens required when the time comes | No — `subtle` alone covers every currently-confirmed use case |
| `count` overflow / accessible-label conventions are newly specified, not preserved | **Low** | §16's "99+" and mandatory count `aria-label` are recommendations with no current implementation to match against (`.sb-badge` has no overflow rule today) | No token needed — this is a behavioral/markup convention for implementation to follow, not a missing CSS value | No |
| `.card-tag` / `.wps-tag` may not be real Badge use cases | **Low** | Both render with near-zero pill styling today (§20) — treating them as Badge migration targets without confirmation risks force-fitting a component onto what might be an eyebrow-label typography role instead | No token — a founder/design confirmation, not a CSS gap | No — does not block Badge shipping generally, only blocks those two specific migration targets until confirmed |

## 24. Implementation Risks

- **Contrast risk (highest)**: shipping `subtle` tint backgrounds without
  the WCAG AA pass named in §23 risks shipping inaccessible status text at
  exactly the small font size (`--qds-text-label-size`, 0.75rem) where
  contrast failures are most likely to matter and least likely to be
  visually obvious to a sighted implementer eyeballing it.
- **Tone proliferation risk**: because `tone` is the component's entire
  semantic surface, there is ongoing pressure to add a new tone per new
  page/status rather than reusing the seven kept here with a different
  `label`. The design philosophy (§2) and the explicit `draft`/`disabled`
  fold-in (§7) exist specifically to resist this; implementation and future
  page authors should default to "new label on an existing tone" and treat
  "new tone" as the exception requiring justification.
- **`.card-tag`/`.wps-tag` misclassification risk**: migrating these two
  targets into Badge before confirming they're actually status/category
  pills (§20, §23) risks visually upgrading a plain eyebrow label into a
  bordered/tinted pill nobody asked for.
- **Draft/Disabled data-model risk**: §19's Draft/Disabled Smart QR Card
  mapping has no backing data field today. Implementing the badge
  presentation before the data model supports it would ship dead UI with
  no way to trigger it, or worse, tempt an ad hoc client-side "guess at
  disabled" heuristic that doesn't reflect real state.
- **Dot-without-text regression risk**: `.status-dot-off`'s current
  standalone usage (manage-page.css, §20) is exactly the anti-pattern §17
  warns against. Migrating it into Badge without also adding the adjacent
  required text would carry the accessibility gap forward under a new
  class name instead of fixing it.
- **Sidebar count-badge naming collision**: `.sb-badge` (§16, §20) is a
  count, structurally identical to status Badge but with different content
  semantics — implementation must confirm `aria-label` requirements (§16)
  are actually applied there, since it's the one existing "Badge-shaped"
  element already live in production today and easiest to forget when
  auditing for accessibility gaps because it currently works without one.

## 25. Recommended Implementation Order

1. Draft the 5 subtle-tint token pairs (§23, Critical #2) and run the WCAG
   AA contrast pass (§23, Critical #3) — blocks everything else, do first.
2. Build `qds/components/badge.css` implementing `neutral`/`brand`/
   `success`/`warning`/`danger`/`information`/`ai` tones, `subtle`
   appearance only, `sm` size, optional `dot`, per this document's anatomy
   and class contract (§5, §6, §22).
3. Migrate Dashboard's `.badge`/`.badge-*` system (§20) first — it already
   has the closest thing to a shared base class (`.badge` root) among all
   nine targets, making it the lowest-friction proof of the new component.
4. Migrate Smart QR Card status row (§19) — directly unblocks
   `QDS_SMART_QR_CARD_ARCHITECTURE_v1.md` Phase 3/4, which is currently
   carrying `.sqr-status.*` as an unstyled placeholder specifically waiting
   on this component.
5. Migrate Admin's `.plan-badge` family and Analytics's `.pt-badge-*` (both
   confirmed real status/tier pills, no ambiguity).
6. Migrate QR Manage's `.status-indicator`/`.status-dot-*`, fixing the
   dot-without-text gap (§24) as part of the migration, not after.
7. Resolve `.card-tag`/`.wps-tag` classification (§20, §23) with
   founder/design before migrating either — do not default them into Badge
   silently.
8. `solid` appearance, count-badge `aria-label` audit on `.sb-badge`, and
   any future Draft/Disabled real-data wiring remain deferred until their
   respective blockers (§23) clear.

---

## Validation Summary (this sprint)

✓ One canonical Badge architecture defined (§5-§9).
✓ Badge clearly separated from Button, Tag, Filter chip, Toggle, Status
  indicator (bare dot), Counter, Tooltip, and Notification dot (§4).
✓ Smart QR Card status requirements covered, including the two states
  (Draft, Disabled) that are not yet backed by real data — flagged, not
  silently implemented (§19).
✓ Variants are semantic (`tone`), not page-specific — `smart-qr-live`/
  `campaign-active`/`wallet-enabled` explicitly rejected in favor of
  tone+label composition (§7).
✓ Accessibility behavior made explicit, including where it is
  a consumer responsibility (live-region wrapping) vs. a component default
  (§17).
✓ Nine migration targets identified (three more than the original
  six-implementation catalog count), two flagged as possibly not real
  Badge use cases rather than force-classified (§20).
✓ Foundation gaps listed and classified Critical/Medium/Low, with the
  smallest safe token addition named for each (§23).
✓ No production file changed. No CSS, HTML, JavaScript, or backend file
  created or modified. Only this document was created.

---

*Awaiting founder approval. No implementation, CSS, HTML, JavaScript, or
page migration proceeds from this document until explicitly approved.*
