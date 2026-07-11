# QDS Surface System v1

Architecture-only. No CSS, HTML, or JavaScript was created or modified to
produce this document. No existing page was migrated or redesigned.
Defines *what* the Surface primitive is and *how* it behaves; implementation
is a later, separately-approved sprint.

Builds on `QDS_COMPONENT_CATALOG_v1.md` #3 (Cards / Panels / Containers) and
`QDS_COMPONENT_SPECIFICATIONS_v1.md` #2 (Card). This document supersedes
those two entries' scope: Card's three composition modes (`panel`, `card`,
`container`) become Surface's variant + region system, extended to also
absorb KPI Tile (#30), Notification Card (#31 — partially), Landing Page
Preview (#32 — frame only), Wallet Pass Preview (#33 — frame only), and QR
Preview (#34), per the catalog's own note that these are "bordered rounded
surface with padding" reimplemented independently across the audited pages.

---

## 1. Purpose

Provide the one visually-distinct-from-page-background container that every
grouped unit of content in QRAIVY renders on — a metric, a settings group, a
list section, a selectable option, a preview frame. Surface is the shared
skin; what varies page to page is composition (which regions are present)
and a small set of justified modifiers, not a new component per shape.

## 2. Design philosophy

Per **Converge on one working mechanism**: the catalog audit found
"bordered rounded surface with padding" reimplemented independently at
least eight times (`.panel`, `.kpi-card`, `.chart-card`, `.sqr-card`,
`.sqr-claimed-card`, `.stat-card`, `.modal-box`, `.block-card`,
`.template-card`, plus three separate "QR preview" frames and a
notification-preview card). None of these differ in a way that earns a
separate component — they differ in which optional regions are populated
(header vs. none), how much padding they carry, and whether they respond to
interaction. Surface expresses all of that through **composition**
(regions) and a small, justified set of **modifiers** (variant, padding,
elevation, interactive, selected, disabled, loading), not through parallel
class systems per page.

A Surface is a container, not a layout tool and not a control. It does not
decide page width, grid columns, or form-field styling — see Non-goals
(§29).

## 3. Visual anatomy

```
┌ Surface root ───────────────────────────────┐
│ ┌ Header (optional) ─────────────────────┐   │
│ │ [media?] [badge?] Title            [actions/toolbar?] │
│ │ Description?                            │   │
│ └──────────────────────────────────────────┘   │
│ ┌ Body (required) ───────────────────────┐   │
│ │  free-form content                      │   │
│ └──────────────────────────────────────────┘   │
│ ┌ Footer (optional) ─────────────────────┐   │
│ │  secondary actions / meta               │   │
│ └──────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

Outer surface = background + border + radius + optional shadow, exactly as
Card specified. Header and footer are horizontal bands; body is the only
region every Surface must have content in.

## 4. Required regions

- **Surface root** — the outer container. Owns background, border, radius,
  elevation, padding, and all interactive/selected/disabled/loading state.
- **Body** — the only region a Surface must render content into. A bare
  Surface with no header/footer and free-form body content is valid and
  covers the majority of today's `card`/KPI/preview use cases.

## 5. Optional regions

- **Header** — title + optional description, right-aligned action slot.
  Matches `.panel-hdr`/`.panel-title`/`.panel-action` today.
- **Title** — sub-slot of Header; text only, typography per §9.
- **Description** — sub-slot of Header; one line of supporting text below
  the title.
- **Actions** — right-aligned button cluster inside Header (e.g. "View
  all"), composes with Button (§23).
- **Toolbar** — a denser row of controls inside Header, distinct from
  Actions in that it can hold non-Button controls (a Select, a Search) —
  needed for cases like `.chart-card` headers with a date-range control.
  Toolbar and Actions are mutually exclusive per Header; a Surface needing
  both should move the secondary controls into a second header row rather
  than stacking both slots (avoid inventing a three-row header).
- **Media** — leading visual inside Header or as the dominant Body content
  (icon, thumbnail, QR image, wallet-pass render). Distinct from Actions'
  icon-only buttons — Media is not interactive by itself.
- **Badge/status** — a Badge (catalog #12) placed in Header, typically
  trailing the Title (e.g. "LIVE" next to a QR name), or as an overlay on
  Media (a status dot on a preview thumbnail).
- **Footer** — secondary actions or meta text below Body, separated by a
  border-subtle divider. Matches modal-style action rows and card
  footers alike.

## 6. Public API

Proposed contract. Not implemented.

```
Surface {
  variant:      'default' | 'outlined' | 'filled' | 'feature' | 'kpi' | 'preview'
  padding:      'none' | 'sm' | 'md' | 'lg' | 'xl'
  elevation:    'flat' | 'raised' | 'elevated' | 'floating'
  interactive:  boolean          // hover affordance; whole-surface click target
  selected:     boolean          // requires interactive=true
  disabled:     boolean          // requires interactive=true
  loading:      boolean          // renders Skeleton in place of regions, see §21
  href:         string?          // renders root as <a>, forces interactive
  onAction:     function?        // renders root as <button>, forces interactive
  as:           'div' | 'a' | 'button'  // escape hatch; inferred from href/onAction when omitted

  // Regions (composition, not props with primitive values)
  header:  { title, description?, media?, badge?, actions?, toolbar? }
  body:    node  // required
  footer:  node?
}
```

Notes:
- `interactive`, `selected`, `disabled`, `loading` are **states/behavior
  flags**, not variants — see §7 for why they were demoted out of the
  variant enum the sprint brief asked to evaluate.
- `href` and `onAction` are mutually exclusive. Setting either implies
  `interactive: true` and determines whether the root renders as `<a>` or
  `<button>` (see §13, §19 — never a `<div>` with a click handler).
- A Surface with neither `href` nor `onAction` but `interactive: true` is
  valid only when it wraps a single already-interactive child that should
  visually lead the hover state (rare; prefer `href`/`onAction` when the
  whole card is genuinely one action).

## 7. Variants

Evaluated against the sprint's minimum list. Kept vs. cut, with reasoning:

| Requested | Verdict | Reasoning |
|---|---|---|
| `default` | **Kept** | Border-only surface at `surface-1`, flat elevation. The baseline every other variant is a delta from. |
| `outlined` | **Cut, folded into `default`** | `default` already is border-first with no fill/shadow distinction — a separate `outlined` variant would be visually identical to `default` in this token set. Re-introduce only if a future filled-by-default direction makes the distinction real. |
| `filled` | **Kept** | Background steps to `surface-2` with a subtler border (`border-subtle` only, no `border-default` escalation) — genuine visual difference for surfaces that should read as recessed/secondary rather than bordered-primary (e.g. a nested surface, §9). |
| `elevated` | **Cut, folded into `elevation` prop** | "Elevated" is a shadow amount, not a distinct visual system — it's already `elevation="elevated"` on top of `default` or `filled`. Keeping it as a separate variant would let two props express the same axis. |
| `interactive` | **Cut, moved to boolean prop** | Every variant can be interactive or not (a `kpi` tile, a `preview`, a `feature` block can all be clickable). Modeling it as a variant would force a combinatorial variant × interactive matrix instead of one boolean layered on top. |
| `selected` | **Cut, moved to boolean prop** | Same reasoning as `interactive` — selection is a state any interactive surface can enter, not a distinct visual family. Requires `interactive: true` (§14). |
| `feature` | **Kept** | Generous padding (`xl`), larger title role, meant for hero/marketing-adjacent blocks (empty-state-with-CTA-scale content, a plan-upsell block). No direct precedent today but named in the sprint's expected-component list and distinguishable from `default` by scale/padding, not just decoration. |
| `kpi` | **Kept** | Fixed internal layout (value + label composition, monospace numeric type), not just "a card with a number in it" — genuinely different internal anatomy from a free-form `card`, matching catalog #30's `.kpi-card`/`.stat-card`/`.kpi-m` convergence target. |
| `preview` | **Kept** | Media-dominant layout (image/render fills most of Body, minimal chrome), converging catalog #34 (QR Preview) and the frame portions of #32/#33 (Landing Page Preview, Wallet Pass Preview) and #31 (Notification Card). See §28 for what stays out-of-scope. |

Final variant enum: **`default` | `outlined`\* | `filled` | `feature` |
`kpi` | `preview`** — `outlined` is listed only because the sprint asked it
be evaluated; recommend dropping it before implementation unless a real
visual need surfaces (see table). If dropped, five variants ship.

`interactive`, `selected`, `disabled`, `loading` are state props layered on
any variant (§6), not additional variants.

## 8. Padding scale

| Token | Space value | Typical use |
|---|---|---|
| `none` | `0` | Surface is a pure frame around media that already has its own padding (e.g. `preview` variant wrapping a QR image) |
| `sm` | `--qds-space-4` (16px) | Dense contexts — `kpi` mini rows, editor property-panel tiles |
| `md` | `--qds-space-6` (24px) | Default — matches current `.panel`/`.kpi-card` body padding |
| `lg` | `--qds-space-8` (32px) | Spacious panels, settings groups with breathing room |
| `xl` | `--qds-space-12` (48px) | **New** — `feature` variant only. **Foundation gap**: not part of Card's approved padding scale in `QDS_COMPONENT_SPECIFICATIONS_v1.md`; needs confirmation before implementation that `--qds-space-12` is intended for this purpose and doesn't collide with another planned use. |

Header-to-body and body-to-footer gaps stay fixed at `--qds-space-4`
regardless of the `padding` setting, carried forward from the Card spec —
padding governs the outer inset, not inter-region spacing.

## 9. Surface hierarchy

| Layer | Background token | Typical elevation | Notes |
|---|---|---|---|
| Page background | `--qds-color-background` | — | Never a Surface itself. |
| Primary surface | `--qds-color-surface-1` | `flat` or `raised` | Default variant's resting state — the first surface a user sees on any page (a `.panel`, a top-level `card`). |
| Nested surface | `--qds-color-surface-2` | `flat` | A Surface placed inside another Surface's Body must step up one background level so it reads as distinct from its parent, not as a continuation of it — this is what the `filled` variant is for. Never nest two `surface-1` Surfaces directly. |
| Floating surface | `--qds-color-surface-3` (background) + `floating` elevation | `floating` | Surfaces that visually detach from the page flow — inside a Drawer, or a popover-adjacent preview. Rare; most product surfaces are `primary` or `nested`. |

This directly answers §21 of the Card spec's unresolved "nested panel"
audit finding (several dashboard sections nest panel-in-panel using the
same background) — the fix is a background-token step-up on the inner
Surface, not a new shadow.

## 10. Border and radius rules

- Border: `--qds-color-border-subtle` at rest for `default`/`filled`;
  `--qds-color-border-default` on `interactive` hover, `selected`, and
  `focus-visible`.
- Radius: `--qds-radius-lg` for every variant, at every size — one decision,
  no per-variant fragmentation (matches Card's existing precedent).
  `preview` variant does not get a larger radius by default; if a specific
  preview instance needs a more rounded "hero" frame (e.g. QR Preview's
  current `--qds-radius-xl`-scale gradient ring), that is page-level
  content styling on the media inside Body, not a Surface-root radius
  override — keeps the root radius contract uniform.

## 11. Elevation rules

| `elevation` value | Token | Use |
|---|---|---|
| `flat` (default) | `--qds-elevation-none` | Most Surfaces — border does the separation work, not shadow. |
| `raised` | `--qds-elevation-sm` | A Surface that should read as slightly lifted without being a floating overlay (e.g. a `kpi` tile in a dense row, for scannability). |
| `elevated` | `--qds-elevation-md` | Stronger separation — `feature` blocks, a `card` competing for attention against several flat neighbors. |
| `floating` | `--qds-elevation-floating` | Reserved for Drawer/popover-adjacent contexts (§9). Not for ordinary page content. |

No shadow changes on hover for any variant — hover is communicated by
`--qds-hover-lift` transform + border-color shift, keeping the same
Button-vs-Card visual distinction rule already established in the Card
spec (hover ≠ elevation change).

## 12. Motion rules

- `interactive` hover: `transform: translateY(--qds-hover-lift)` +
  border-color transition, both over `--qds-duration-fast` /
  `--qds-easing-standard` — one hover motion for every Surface variant,
  replacing the four different hover treatments (lift, scale,
  top-gradient-bar, translateX) the catalog found across the editor's four
  near-duplicate tile patterns.
- Press (when `onAction` is set): `transform: scale(--qds-pressed-scale)`,
  same token Button uses.
- `selected` transition: border-color + background tint over
  `--qds-duration-fast` — no transform, so a selected tile doesn't visually
  "jump" separately from its hover state.
- `loading`→loaded transition: none specified here — governed by whatever
  Skeleton's own reveal behavior is (§21); Surface does not add a
  cross-fade of its own.
- Respects `prefers-reduced-motion` via the same global token overrides
  already defined in `foundation/motion.css` (durations and lift/scale
  collapse to 0/none) — no Surface-specific override needed.

## 13. Interactive behavior

`interactive: true` (or implied by `href`/`onAction`) adds: `cursor:
pointer`, hover transform + border shift (§12), and — critically — changes
the required root element per §19 (real `<a>` or `<button>`, never a `<div
onclick>`). A Surface that merely *contains* interactive children (e.g. a
`panel` with several action buttons in its header, or a `card` with several
`.sqr-act`-style buttons in its body) is **not** itself `interactive` —
each child manages its own focus/hover independently. This preserves the
Card spec's existing correct precedent (`.sqr-card` keeps real buttons
nested inside a non-clickable shell) rather than making the whole shell a
second, redundant click target.

## 14. Selected behavior

`selected: true` requires `interactive: true` and represents a
tile-style single/multi-select option (the future Radio-tile pattern,
catalog #8 — `.stamp-opt`/`.size-opt`/`.template-card.tc-active`).
Visually: border escalates to `--qds-color-brand-primary` (not just
`border-default`), background tint shifts toward a selected state.
**Foundation gap**: no `--qds-color-selected`/tint token pair exists in
`colors.css` today — the current per-page pattern (`.tc-active` etc.) uses
ad hoc brand-tinted backgrounds; a real token pair needs defining, with the
same WCAG AA contrast verification flagged for Badge tone tints in
`QDS_COMPONENT_SPECIFICATIONS_v1.md`, before this is implemented — do not
improvise the value at CSS-authoring time.

Selection *semantics* (radiogroup vs. multi-select checkbox-group) belong
to the future Radio/Checkbox component wrapping the Surface, not to
Surface itself — Surface only renders the visual selected state; it does
not own `role="radio"`/`aria-checked` (see §16, §19).

## 15. Disabled behavior

`disabled: true` requires `interactive: true` (a non-interactive Surface
has no meaningful disabled state — it was never actionable). Applies
`--qds-color-disabled` to border and any text directly owned by the
Surface chrome (Title, Description); suppresses hover/press transforms;
`pointer-events: none` on the root. If the root is a real `<button>`, the
native `disabled` attribute applies (removes from tab order, matches
Button's own disabled precedent) — this is correct here because, unlike
Button's `loading` case, a disabled *selectable tile* has no in-flight
state to preserve in the tab order.

## 16. Keyboard behavior

- Non-interactive Surface: not focusable, no keyboard behavior of its own.
- Interactive whole-surface Surface (`href`/`onAction`): focusable via Tab;
  activates on Enter (and Space, if rendered as `<button>`) — native
  element behavior, not custom key handling, per the same rule Button
  follows.
- `selected` state toggling via keyboard (arrow-key roving within a group)
  is owned by the future Radio/Checkbox-tile component that composes
  Surface, not by Surface itself — Surface exposes the visual state; the
  parent control owns group navigation.

## 17. Focus behavior

`--qds-elevation-focus` ring on `:focus-visible` (not plain `:focus`) —
same token, same trigger condition as Button and Input, keeping one focus
treatment across every interactive element in QDS. Ring applies to the
Surface root **only** when the whole Surface is the single click target;
a Surface containing multiple focusable children (buttons, links) does not
put a ring on its own root, since focus correctly lands on those children
instead.

## 18. Touch behavior

Whole-surface interactive targets (`href`/`onAction`) meet the 44×44px
minimum inherently once `padding` is `sm` or larger, given control heights
already exceed that; explicit padding-based touch-target expansion (the
`::before` overlay technique Button uses for its `sm` size) is only needed
if a future `padding: none` + `interactive: true` combination produces a
visually smaller hit area — flag as a real case to handle (a `preview`
tile with `padding: none` wrapping a small thumbnail) rather than assuming
it away. Embedded action buttons inside Header/Footer follow Button's own
44×44 rule independently.

## 19. Accessibility requirements

- Non-interactive Surface renders as a plain `<div>` — no implicit role.
- Interactive whole-surface Surface **must** render as a real `<a
  href="...">` (when `href` is set) or `<button type="button">` (when
  `onAction` is set) — never a `<div>` with a click handler, matching the
  Card spec's existing correct precedent from `.sqr-card`.
- Surface never assigns its own heading level to the Title region — the
  consuming page chooses the correct `<h2>`/`<h3>`/etc. based on document
  outline. **Flagged as a real policy gap, not solved here**: today's
  `.panel-title` markup should be audited for whether it uses real heading
  elements at all before broad migration (see §30).
- `selected` state must be exposed as `aria-pressed="true"` (toggle-style)
  or via the wrapping group's `aria-checked`/`role="radio"` (group-style)
  — Surface itself doesn't pick which; the composing control does (§14).
- `disabled` state on a `<button>`-rendered Surface uses the native
  `disabled` attribute (§15) — no `aria-disabled` duplication needed since
  the native attribute already communicates it correctly here (unlike
  Button's `loading` case, which deliberately avoids `disabled`).
- `loading` state: container carries `aria-busy="true"`, consistent with
  Skeleton's own accessibility contract (§21) — Surface doesn't reinvent
  this, it inherits Skeleton's existing rule.

## 20. Responsive behavior

Surface itself has no breakpoint-specific behavior — it is fluid width
(100% of its parent) at every viewport by default. Column-count collapse
for grids of Surfaces (`.sqr-grid`'s `auto-fill, minmax(280px,1fr)`,
`.kpi-row`'s 4→2 column collapse under 700px) is the responsibility of the
layout primitive the Surfaces sit inside, explicitly out of Surface's
scope — see Non-goals (§29). Internal region stacking (header actions
wrapping below the title on narrow Surfaces) is the one responsive
behavior Surface does own: Header's title+actions row wraps to two lines
below its container's available width rather than truncating or
overflowing.

## 21. Loading behavior

Surface composes with Skeleton (catalog #28) rather than owning a loading
implementation of its own, exactly as the Card spec already established.
`loading: true` renders the Skeleton equivalent of whatever regions would
otherwise be populated — a `.skel-card`-shaped placeholder in Body, a
`.skel-line` for Title, etc. — inside the same Surface root (so the outer
border/radius/padding stay stable and nothing shifts layout when real
content arrives). Surface does not implement the shimmer animation,
`aria-busy` timing threshold, or width presets itself; those are Skeleton's
contract. This is a delegation relationship, not a duplication — Surface's
only job during loading is to keep its own chrome (border, radius,
padding) present so the transition to real content doesn't reflow the
page.

## 22. Empty State compatibility

Empty State (catalog #26) renders **inside** Surface's Body region when a
Surface has nothing to show (e.g. a `panel` titled "Recent Scans" with zero
scans yet). Surface does not duplicate Empty State's icon/title/description
layout, and Empty State does not duplicate Surface's border/padding — the
composition is: Surface provides the bordered, padded frame (via its own
`padding` prop); Empty State provides the centered icon/title/description
stack inside it. A `compact` Empty State is the correct choice when nested
inside a `padding: sm` or `md` Surface; `full` Empty State suits a
full-page `container`-scale context (which, per §29, is not itself a
Surface — see the "container" resolution below).

## 23. Button compatibility

Header's `actions`/`toolbar` slot and Footer both compose with the
approved QDS Button (`qds-btn`) unmodified — Surface passes no styling
overrides down into Button; Button's own `sm`/`md` sizing and
`ghost`/`secondary`/`primary` variants apply exactly as they would
anywhere else. Per Button's own usage guidance (one `primary` per view),
a Surface's header action slot should default to `ghost` or `secondary`
unless that specific action is the page's single recommended next step —
Surface does not enforce this, it's a consumer discipline note carried
over from Button's spec. Icon-only Footer/Header actions still require
`aria-label` per Button's own accessibility contract; Surface adds nothing
extra on top.

## 24. Future Input compatibility

A Surface used as a form section (a settings group, a future onboarding
step) hosts Input/Label/Select/etc. inside its Body region as plain
children — Surface does not own label positioning, field spacing, or
validation-state styling; those remain entirely the responsibility of the
Input component (per `QDS_COMPONENT_SPECIFICATIONS_v1.md` #3) and whatever
future Form/Field-group composite groups multiple inputs together. The
only contract Surface offers a form section is its own `padding` and
optional Header title (e.g. "Business Details") — nothing about form-control
layout leaks into the Surface API surface itself.

## 25. Nesting rules

Maximum safe nesting depth: **2 levels** (an outer primary Surface
containing one nested Surface), carried forward unchanged from the Card
spec's existing rule — several current dashboard sections already nest
panel-in-panel 3+ levels deep and are named as a migration problem to fix,
not a pattern to preserve.

A nested Surface (level 2) must:
- Step up one background token (`surface-1` → `surface-2`, or use the
  `filled` variant which encodes this), per §9.
- Drop to `flat` elevation regardless of what elevation the parent uses —
  stacking shadows on nested surfaces reads as visual noise and is
  explicitly disallowed rather than left to implementer discretion.

A third level is **incorrect usage** (§27) — if a design calls for it, the
content likely belongs in a Tabs/Accordion disclosure instead of deeper
nesting.

## 26. Correct usage examples

- A `default` Surface, `padding: md`, with Header (title "Recent Scans" +
  Actions slot holding a `ghost` "View all" Button) and a Body containing a
  Table — the `panel` composition.
- A `kpi` Surface, `padding: sm`, no Header, Body containing the value +
  label pairing — four of these in a row inside a layout grid (grid itself
  is not a Surface concern).
- A `preview` Surface, `padding: none`, Body dominated by a QR image, no
  Header — converges the QR Preview / Wallet Pass Preview frame use case.
- A `default` Surface, `interactive: true`, `href` set, wrapping a
  clickable summary row where the whole row genuinely navigates elsewhere.
- A `filled` Surface nested one level inside a `default` `panel`'s Body,
  `elevation: flat` — a sub-grouping within a larger settings panel.
- A `feature` Surface, `padding: xl`, `elevation: elevated`, Body holding a
  plan-upsell block with a single `primary` Button in Footer.

## 27. Incorrect usage examples

- A `<div onclick>` wrapping an entire Surface to fake a click target
  instead of setting `href`/`onAction` and letting Surface render the real
  element.
- Three or more levels of Surface nesting for visual grouping alone (§25).
- `selected: true` without `interactive: true` (selection implies the
  Surface is choosable, which requires it be interactive).
- Using `variant: preview` for a generic content card that isn't
  media-dominant — `preview`'s minimal-chrome layout will visually starve
  ordinary text/action content.
- A Surface root styled with `padding: none` and no interior padding on its
  content, producing text flush against the border — `none` is for
  Surfaces wrapping content that supplies its own padding (media), not a
  general-purpose density option for text content.
- Stacking both `actions` and `toolbar` in one Header (§5) instead of using
  a second header row.

## 28. Migration targets

Every current implementation identified in the catalog audit that should
eventually migrate to Surface, organized by the sprint's requested
groupings:

**Dashboard panels**
- `dashboard-shell.css`: `.panel`, `.panel-hdr`, `.panel-title`,
  `.panel-action` → `default` variant, Header/Body composition.

**KPI cards**
- `dashboard-shell.css`: `.kpi-card`, `.kpi-val`, `.kpi-lbl`, `.kpi-m`,
  `.kpi-m-val` → `kpi` variant, `md`/`sm` padding respectively.
- `admin.html`: `.stat-card`, `.stat-value`, `.stat-label`, `.stat-sub` →
  `kpi` variant with Media (icon) region populated.

**QR summary cards**
- `dashboard.html`/`dashboard-shell.css`: `.sqr-card`, `.sqr-claimed-card`,
  inline `.csm-qr-row` → `default` variant, `interactive` where the card
  itself navigates, real nested Buttons for `.sqr-act` actions per §13.

**Analytics chart cards**
- `analytics-page.css`: `.chart-card` → `default` variant with Header
  Toolbar slot holding the date-range control, `.chart-wrap`/`.chart-wrap.tall`
  container sizing lives inside Body, unchanged.

**Admin stat cards**
- `admin.html`: `.stat-card` (see KPI cards above), `.modal-box` → out of
  Surface's scope, stays with Modal (catalog #19) — a modal's box is a
  dialog surface with focus-trap semantics Surface does not own (§29).

**Editor tiles**
- Editor CSS: `.block-card`, `.template-card`, `.element-btn`,
  `.smart-action-btn` → `default` variant, `interactive: true`,
  `selected: true` where a `.tc-active`-style current-selection state
  exists — converges four different hover motions into Surface's one
  hover treatment (§12).

**Wallet and loyalty panels**
- `wallet-pass-studio.html`: `.wps-*` card/column wrappers (non-preview
  chrome) → `default`/`filled` variant depending on nesting level.
- `loyalty-setup.html`: card-style groupings around `.stamp-opt`/`.cp`
  preset pickers → `default` Surface as the group wrapper; the
  `.stamp-opt`/`.cp` tiles themselves migrate to the future Radio-tile
  component (composes Surface with `selected`, per §14), not to Surface
  directly as standalone items.

**Preview cards**
- `styles.css`: `.qr-frame`/`#qrImage` → `preview` variant.
- `manage-page.css`: `.qr-preview-frame`/`.qr-preview-main`,
  `.design-qr-frame`/`.design-qr-glow`/`.design-qr-stage` → `preview`
  variant (converges three treatments into one, per catalog #34's own
  recommendation to pick the gradient-ring look as canonical — the glow
  itself is a Body-content decoration, not a Surface-root style, per §10).
- `dashboard.html`: `.notif-card`/`.notif-top`/`.notif-appname`/`.notif-b`/
  `.notif-t`/`.notif-ts` → `preview` variant, frame only; the
  device-notification-accurate inner layout stays a Body-content concern
  Surface does not standardize away (per catalog #31's explicit warning
  not to genericize this into a normal Card).
- `wallet-pass-studio.html`: `.apw-*`/`.gow-*` platform preview cards →
  `preview` variant, frame only, same caveat as above (per catalog #33 —
  platform-accurate inner rendering is not a Surface concern).
- Editor: the live landing-page preview surface (`#polotno-container`
  wrapper chrome only, per catalog #32) → `preview` variant frame; the
  renderer itself is explicitly out of scope (it is not a static preview
  card, it is the live renderer — §32's own note against building a second
  divergent preview component applies unchanged here).

**Explicitly not migrating to Surface**
- `qr-panel.html`'s `.btn-mgr`/`.qr-preview-card`/`.qr-preview-badge` —
  already flagged in the catalog as an architecturally orphaned page (own
  font, own accent color, zero shared classes) to migrate as a whole page
  later, not to seed Surface variants from now.
- Any of the three current Modal implementations (`.modal-box`,
  `.size-modal-box`, `.claim-success-modal`) — Modal is a distinct
  component with focus-trap/dialog semantics Surface does not implement
  (§29).

## 29. Non-goals

Surface does **not** own:

- **Grid/layout** — column counts, `auto-fill`/`minmax` grid definitions,
  gap sizing between multiple Surfaces. That's a layout primitive
  Surfaces sit inside, not Surface itself.
- **Page width / max-width wrapping** — Card's old `container` variant
  (`.page-wrap`/`.mgr-wrap`, no border/shadow, pure grouping) is **not**
  carried into Surface's variant enum, because a borderless, shadowless,
  background-matching wrapper is not a "surface" at all — it never
  visually distinguishes from the page background, which is the one
  property every real Surface variant shares. This is a genuine scope
  narrowing versus the Card spec, not an oversight: a plain layout wrapper
  should be a separate, undocumented-until-requested Layout/Container
  primitive, not a zero-decoration Surface variant. **Flagged as an open
  gap** — `.page-wrap`/`.mgr-wrap` still need a home; it is just not this
  component (see §30).
- **Modal/dialog behavior** — focus trap, `role="dialog"`, backdrop scrim,
  Escape-to-close. Modal (catalog #19) may use a Surface-like visual frame
  internally, but Modal owns its own interaction contract; Surface does
  not gain a `modal` variant.
- **Form controls** — Input, Select, Checkbox, Radio, Label styling. A
  Surface can host a form section (§24) but never dictates field layout.
- **Navigation** — Sidebar, Tabs, Breadcrumb are structurally and
  behaviorally distinct; Surface is not a navigation primitive even where
  a nav element happens to sit on a bordered background.
- **Data fetching / async orchestration** — Surface renders whatever state
  (loading/populated/empty) it's given; it does not decide when to fetch,
  retry, or cache.
- **Chart rendering** — Charts (catalog #29) render inside a Surface's Body
  exactly like any other content; Surface has no Chart-specific API.

## 30. Implementation risks

Foundation-token gaps and API ambiguities to resolve before CSS
implementation begins — named here, not silently assumed:

1. **`padding: xl` is new** — `--qds-space-12` exists in `spacing.css` but
   was not part of Card's approved padding scale. Needs explicit sign-off
   it's the right token for `feature` variant use before implementation
   (§8).
2. **No selected-state color tokens** — `--qds-color-selected` (or
   equivalent tint pair) does not exist in `colors.css`. Current per-page
   patterns (`.tc-active`, `.cp.selected`) use ad hoc brand-tinted
   backgrounds with unverified contrast, same category of gap already
   flagged for Badge tone tints in the Specifications doc (§14).
3. **Nested + elevated combination untested** — behavior of a `filled`,
   `flat`-elevation nested Surface inside a `floating`-elevation parent
   (e.g. inside a future Drawer) has not been visually validated; the
   rule in §9/§25 is a reasonable default, not a confirmed-good outcome.
4. **KPI delta/trend color tokens missing** — catalog #30 references an
   existing `.kpi-val.orange/.green/.purple` + `.an-kpi-delta.up/.dn`
   color-coding convention with no corresponding semantic tokens in
   `colors.css`. Must be mapped to `success`/`warning`/`brand`/
   `information` (or new tokens added) before the `kpi` variant is built —
   do not invent hex values at CSS-authoring time.
5. **`preview` variant's glow/gradient-ring treatment has no token** —
   `--qds-elevation-brand-glow` exists (used by Button's `ai` variant) but
   a gradient-*border* (per catalog #34's `.design-qr-glow` precedent) is a
   different rendering technique with no foundation equivalent. Needs a
   real technical decision (box-shadow glow vs. gradient border-image)
   before implementation, not an improvisation per preview instance.
6. **`.page-wrap`/`.mgr-wrap` (plain layout wrapper) has no home** — see
   §29. Explicitly out of Surface's scope, but not yet assigned to any
   other named component either. A future Layout/Container primitive needs
   naming before those two classes have a migration target.
7. **No heading-level contract for Header's Title slot** (§19) — Surface
   doesn't mandate a heading element or level, which is correct
   architecturally, but leaves a real, currently-unaudited a11y question
   open: are today's `.panel-title` elements real headings at all? Worth a
   dedicated pass before broad migration, not resolved by this document.
8. **Toolbar vs. Actions boundary is a judgment call** — §5 declares them
   mutually exclusive per Header, but no current page cleanly separates
   "action buttons" from "non-button controls" in a header row today
   (`.chart-card` headers mix both informally). Migration will require
   real per-instance decisions, not a mechanical rule.

---

## 31. Architecture Resolution

Sprint 5A.5. Resolves every gap named in §30 against the actual Foundation
files (`qds/foundation/{spacing,colors,typography,elevation,radius,motion}.css`)
and the approved Card/Badge specs. Architecture only — no token was added to
a `.css` file to produce this section; where a new token is recommended, it
is named and justified, not implemented.

### 31.1 Padding scale (`padding: xl`)

- **Problem**: §8/§30.1 flagged `--qds-space-12` as outside Card's approved
  padding enum (none/sm/md/lg only).
- **Why it exists**: Card's spec (§2 of Specifications doc) was written
  before `feature`-scale content (hero/upsell blocks) was in scope; its
  padding rule only ever needed to cover panel/kpi/preview density.
- **Recommendation**: Approve `xl` using `--qds-space-12`. The token already
  exists in `spacing.css` today — this is not a new Foundation token, it is
  an unused rung on the existing scale. No collision: nothing else in the
  audited specs currently claims `--qds-space-12`.
- **Alternatives considered**: (a) Reuse `lg` (`--qds-space-8`) for `feature`
  too — rejected, collapses the one variant defined specifically by its
  generous scale (§7) back into indistinguishability from `lg` panels. (b)
  Introduce a new token between `lg` and the next scale step — rejected,
  the scale is already 4px-multiple canonical and `--qds-space-12` sits
  exactly where a `feature`-scale step belongs.
- **Final**: `xl` ships using existing `--qds-space-12`. **No new Foundation
  token required.**

### 31.2 Selected-state colors

- **Problem**: §14/§30.2 — no `--qds-color-selected`-style token pair exists
  in `colors.css`.
- **Why it exists**: `colors.css` was scoped to Button/Card/Badge's needs in
  Sprint 5; selection is a Surface-and-later-Radio-tile concept that hadn't
  been specified yet when Foundation colors were authored.
- **Recommendation**:
  - **Selected border** → reuse existing `--qds-color-brand-primary`. No new
    token; this is the same escalation Button's `primary` and `link`
    variants already use for brand-colored emphasis.
  - **Selected background** → new token `--qds-color-selected-surface`, a
    low-opacity tint of brand-primary (value TBD at CSS-authoring time,
    pending the WCAG AA contrast check below — do not improvise the alpha
    now).
  - **Selected text** → no new token. Stays `--qds-color-text-primary`; a
    tint-only background at the opacity level Badge's own gap analysis
    implies (§30.2 cross-references Badge's tint gap, Specifications §4)
    should never need a text-color swap to stay legible.
  - **Selected focus** → no new token. Reuses `--qds-elevation-focus`
    unchanged (§17) — selection and focus are orthogonal states that can
    co-occur (a selected tile can also be focused) and must not fight over
    the same visual signal.
  - **Placement**: **Foundation**, not Component tokens. `colors.css`
    already groups cross-cutting interaction state under an "Interaction"
    heading (`focus-ring`, `disabled`, `overlay`) — `selected-surface`
    belongs there, not scoped to Surface, because Radio-tile (catalog #8)
    and any future Chip/multi-select control will need the identical token,
    not a Surface-local variable other components would have to reach into.
- **Alternatives considered**: (a) Scope the token to a future
  `components/surface.css` file instead of Foundation — rejected, creates
  exactly the kind of per-component color reinvention Foundation exists to
  prevent, and Radio-tile isn't even a Surface subclass, it *composes*
  Surface, so a Surface-scoped token wouldn't be visible to it cleanly. (b)
  Skip a background tint entirely, signal selection via border-color alone
  — rejected, contradicts the explicit "color alone is insufficient signal"
  principle already applied to Badge (Specifications §4) and weakens the
  selected/hover visual distinction on touch devices where hover never
  fires.
- **Final**: One new Foundation token, `--qds-color-selected-surface`,
  added to `colors.css`'s Interaction group. Border/text/focus reuse
  existing tokens. Contrast verification required before implementation
  (same open item as Badge's tint gap) — flagged, not resolved, here.

### 31.3 KPI delta colors

- **Problem**: §30.4 — catalog #30 references `.kpi-val.orange/.green/
  .purple` and `.an-kpi-delta.up/.dn` with no mapped semantic tokens.
- **Why it exists**: these classes were authored per-page before Badge's
  `tone` enum (Specifications §4) existed as a converged pattern to map
  onto.
- **Recommendation**: Split the two concerns, they don't share a resolution:
  - **Delta (up/down trend)** is a two-state signal, not a tone palette —
    map directly to `--qds-color-success` (up) / `--qds-color-danger`
    (down). Both tokens already exist in Foundation. **No new token.**
  - **KPI value tone** (`orange`/`green`/`purple`) should reuse Badge's
    existing `tone` enum (`neutral | success | warning | danger | brand |
    info`) rather than invent a parallel KPI-specific palette — `orange` is
    `brand` (`--qds-color-brand-primary`), `green` is `success`. `purple`
    has **no Foundation equivalent** and no other component in the approved
    spec set uses it. Per the same converge-don't-invent standard applied
    to Surface's own variant table (§7), recommend dropping `purple` from
    v1 rather than inventing a token for a single legacy usage — reassign
    those instances to `brand` or `info` at migration time, case by case.
  - **Ownership**: the token *values* (success/danger/brand/info) are
    Foundation, already settled, and sufficient for delta + tone as scoped
    above — no Surface-specific or KPI-specific token work is needed to
    unblock the `kpi` variant. Anything beyond flat tone/delta — sparklines,
    multi-series color, trend-line rendering (§30's "Future extensibility"
    note on catalog #30) — belongs to a future Data Display System, not
    Foundation and not Surface.
- **Alternatives considered**: (a) Add a dedicated `--qds-color-kpi-purple`
  token — rejected, a one-off token for a single unreplaced legacy class is
  the exact pattern this whole sprint exists to stop. (b) Push the entire
  tone question to the future Data Display System and leave it unresolved
  here — rejected for delta specifically (it's needed the moment `kpi`
  ships, can't be deferred), accepted for anything beyond flat tone/delta
  (sparklines etc., see Ownership above).
- **Final**: Delta uses existing `success`/`danger` tokens (no new token).
  KPI value tone reuses Badge's existing tone enum minus `purple`, which is
  dropped, not replaced. **No new Foundation token required.**

### 31.4 Preview surfaces

- **Problem**: §30.5 — `preview` variant's glow/gradient-ring treatment
  (catalog #34's `.design-qr-glow`) has no Foundation rendering technique;
  §5's Media region also raises inset-frame and device-preview cases.
- **Why it exists**: three divergent QR-preview implementations
  (`.qr-frame`, `.qr-preview-frame`, `.design-qr-frame`/`.design-qr-glow`)
  evolved independently, one of them (Design Studio's gradient ring) using a
  technique — gradient border-image — with no prior Foundation precedent,
  while Notification Card and Wallet Pass Preview are visually unrelated
  platform-accurate mockups that happen to share the word "preview."
- **Recommendation**: Confirms and closes out the classification §10 already
  started, plus a technique decision for the one open piece:
  - **Structural framing** (bordered, radiused, padded frame around
    media-dominant content) → stays the `preview` **variant** of Surface,
    already decided in §7. Not a separate component — it shares 100% of
    Surface's anatomy (root, optional header, body, elevation, radius
    rules), it only differs in how Body is composed (media-dominant, `padding:
    none` typical). A separate Preview component would duplicate Surface's
    entire chrome contract for zero anatomical difference.
  - **Glow/gradient-ring decoration** → stays Body-content styling, not a
    Surface-root modifier (already decided in §10, reaffirmed here). This
    is the resolution to the open technique question in §30.5: recommend
    the decoration render as a `box-shadow` using the **existing**
    `--qds-elevation-brand-glow` token (already defined in `elevation.css`,
    already used by Button's `ai` variant), not a gradient border-image.
    Gradient-border-image would be a genuinely new rendering technique with
    zero Foundation precedent and its own unresolved token needs (gradient
    stops, angle); reusing the existing glow token means QR Preview's "hero"
    treatment converges onto the same visual language as Button's `ai`
    glow instead of inventing a second one. This is a **modifier on Body
    content** (a class the consuming page adds to its media wrapper), not a
    Surface prop.
  - **Inset frame** → covered by existing `padding: none` + border/radius on
    the Surface root; no new mechanism needed.
  - **Device preview** (Notification Card, Wallet Pass Preview) → confirmed
    **out of Surface's scope**, per §28's existing "frame only" carve-outs.
    These are **separate components** that may use a Surface-like frame
    internally for their own outer chrome, but their platform-accurate
    inner layout is not something Surface should standardize (per catalog
    #31/#33's explicit warnings against genericizing them) — not a Surface
    variant, not a Surface modifier.
- **Alternatives considered**: (a) Make `preview` a modifier instead of a
  variant, layered on `default` — rejected, `preview`'s Body composition
  (media-dominant, minimal/no header, typically `padding: none`) is a
  structural difference in what regions get populated, matching the same
  reasoning that kept `kpi` a variant rather than a modifier (§7). (b) Build
  gradient border-image as a new Foundation technique — rejected above;
  revisit only if a real, distinct future use case can't be served by the
  glow token. (c) Fold Notification Card / Wallet Pass Preview into
  `preview` variant fully (not just frame) — rejected, already correctly
  rejected in §28/§30 for platform-accuracy reasons; reaffirmed, not
  reopened.
- **Final**: `preview` remains a Surface **variant**. Glow renders via the
  existing `--qds-elevation-brand-glow` token as Body-content styling, not a
  new Surface prop or a new token. Device-preview components stay separate,
  frame-only convergence with Surface. **No new Foundation token required.**

### 31.5 Surface title typography

- **Problem**: §30 implicitly (via §9's cross-reference to Card) — does
  Surface define its own Title typography, or reference existing roles?
- **Why it exists**: Card's spec ties `--qds-text-card-title-*` to its
  Header title; Surface's `feature` variant (§7) was separately described
  as having "a larger title role" without naming which token.
- **Recommendation**: Surface owns **zero** typography definitions of its
  own — it only maps Title-region-per-variant onto existing
  `typography.css` roles, exactly as Card already does:
  - `default` / `filled` / `kpi` / `preview` variants → `--qds-text-card-
    title-*` (1.125rem, semibold) — identical to Card's existing rule, no
    change.
  - `feature` variant → `--qds-text-section-title-*` (1.5rem, semibold) —
    already exists in `typography.css`, unused by any other approved spec
    for this purpose, exactly the "larger title role" §7 asked for without
    requiring a new type scale entry.
- **Alternatives considered**: (a) Define a new `--qds-text-surface-title-*`
  role — rejected, `typography.css`'s own header comment states it is a
  "compact semantic scale," not a per-component list; a Surface-specific
  title role would duplicate `card-title` or `section-title` with no visual
  delta. (b) Use `--qds-text-page-title-*` for `feature` — rejected, that
  role (2rem, `-0.01em` tracking) is reserved for actual page-level titles
  per its own doc comment ("top of a dashboard/app page"); `feature`
  Surfaces are page *content*, not the page title itself.
- **Final**: No new typography tokens. Title maps to `--qds-text-card-
  title-*` by default, `--qds-text-section-title-*` for `feature`.

### 31.6 Surface header spacing

- **Problem**: §8 fixes Header↔Body and Body↔Footer gaps at
  `--qds-space-4`, but leaves internal Header spacing (Title↔Description,
  Title-row↔Toolbar-row) unspecified.
- **Why it exists**: §8 only inherited the macro gap Card's spec already
  defined; Header's internal sub-slots (Title, Description, Actions,
  Toolbar — §5) are new to Surface and weren't in Card's simpler
  title-only-header model.
- **Recommendation**: Map every internal Header relationship onto existing
  `--qds-space-*` steps, none new:
  | Relationship | Token | Rationale |
  |---|---|---|
  | Header → Body | `--qds-space-4` | Unchanged, carried from §8/Card spec. |
  | Body → Footer | `--qds-space-4` | Unchanged, carried from §8/Card spec. |
  | Title → Description | `--qds-space-1` (4px) | Tightest step on the scale — Description reads as a caption directly under Title, not a separate block (matches `--qds-text-caption-*`'s own tight `1.4` line-height intent). |
  | Title row → second Header row (Toolbar, when Actions/Toolbar split into two rows per §5) | `--qds-space-2` (8px) | One step looser than Title→Description, enough to read as a distinct row without matching the Header→Body macro gap. |
  | Title/Description column → Actions/Toolbar slot (same row) | No token — `justify-content: space-between` / flex gap is a layout concern, not a spacing-scale value. |
- **Alternatives considered**: (a) Reuse `--qds-space-4` for Title→
  Description too, for "one gap value everywhere in Header" simplicity —
  rejected, it would visually detach Description from its Title, reading as
  a second unrelated line rather than supporting text. (b) Leave Toolbar
  row spacing unspecified until implementation — rejected, the sprint
  brief's explicit purpose is eliminating exactly this kind of ambiguity
  before CSS starts.
- **Final**: All Header-internal spacing resolved using existing tokens
  (`--qds-space-1`, `--qds-space-2`, `--qds-space-4`). **No new Foundation
  token required.**

### 31.7 Nested surfaces

- **Problem**: §25 proposes a 2-level max nesting depth; sprint asks it be
  validated, not just asserted.
- **Why it exists**: several current dashboard sections already nest
  panel-in-panel 3+ levels deep, so the limit has to be justified against
  real existing usage, not just a clean-slate preference.
- **Recommendation**: Validate 2 levels as correct, unchanged from §25.
  It's not a new decision for Surface — it's the exact limit Card's spec
  already sets (Specifications §2: "Cards nest at most 2 levels deep —
  deeper nesting visually flattens and reads as noise"). Surface inherits
  it rather than re-deriving a different number, which matters because
  Surface explicitly supersedes Card's scope (document header) — a
  divergent nesting rule between the two would be a regression, not a
  refinement. The background-token step-up rule (`surface-1` → `surface-2`,
  §9) only defines two levels' worth of visual distinction anyway
  (`surface-3` is reserved for `floating`, not deeper nesting, per §9's
  table) — there is no third background step available to make a 3rd level
  read as distinct even if it were allowed.
- **Alternatives considered**: (a) Allow 3 levels since Surface's `filled`
  variant gives nested surfaces a real visual step (unlike Card, which had
  no equivalent) — rejected, `surface-3` is already committed to `floating`
  context, not a third nesting rung, so a 3rd nested level would either
  reuse `surface-2` (indistinguishable from level 2) or claim `surface-3`
  and collide with the floating-surface convention. (b) Reduce to 1 level
  (no nesting at all) — rejected, `filled` variant's entire justification
  (§7) is the nested-surface case; disallowing nesting entirely would strand
  a variant with no use case.
- **Final**: 2 levels confirmed, identical to and inherited from Card's
  existing rule. No change.

### 31.8 Interactive surfaces

- **Problem**: sprint asks whether `interactive` should be a modifier
  (current proposal, §6/§7/§13) or promoted to a variant.
- **Why it exists**: `interactive` sits at the intersection of visual
  variant (`kpi`, `preview`, etc.) and behavior (click target, hover,
  focus) — it's reasonable to ask whether that intersection is better
  modeled as its own variant rather than a flag layered on every other one.
- **Recommendation**: Keep `interactive` a boolean state prop, not a
  variant — reaffirms §7's existing decision. Tradeoffs:
  - **As a modifier (current, recommended)**: every variant (`kpi`,
    `preview`, `feature`, `default`, `filled`) can independently be
    interactive or not — one boolean, five variants, no combinatorial
    explosion. `selected` and `disabled` already depend on `interactive`
    being a prop (§14, §15) they can require — if `interactive` were itself
    a variant, `selected`/`disabled` would need to become variant-of-a-
    variant states, which the API in §6 has no mechanism for.
  - **As a variant**: would require either doubling the variant enum
    (`kpi` / `kpi-interactive` / `preview` / `preview-interactive` / ...) or
    collapsing all interactive surfaces into one generic `interactive`
    variant that discards which base variant they are — both worse than
    the current model. The doubling breaks the moment a second orthogonal
    boolean is needed (which already happened: `selected`, `disabled`,
    `loading` are all in the same category); the collapse loses real
    visual information (an interactive `kpi` tile and an interactive
    `preview` tile look nothing alike).
- **Alternatives considered**: covered inline above (doubling vs.
  collapsing) — no third structural option found; this is a binary
  modeling choice, not a spectrum.
- **Final**: `interactive` stays a boolean modifier, unchanged from §6/§7.
  No API change.

### 31.9 Foundation token audit

- **New Foundation tokens required: one.**
  - `--qds-color-selected-surface` (colors.css, Interaction group) — see
    §31.2. Value pending WCAG AA contrast verification; not to be
    improvised at CSS-authoring time.
- **Everything else resolves using tokens that already exist**:
  `--qds-space-12` (padding xl, §31.1), `--qds-color-brand-primary` +
  `--qds-elevation-focus` (selected border/focus, §31.2),
  `--qds-color-success` / `--qds-color-danger` (KPI delta, §31.3),
  `--qds-elevation-brand-glow` (preview glow, §31.4), `--qds-text-card-
  title-*` / `--qds-text-section-title-*` (title typography, §31.5),
  `--qds-space-1` / `--qds-space-2` / `--qds-space-4` (header spacing,
  §31.6).
- **Conclusion: Surface implementation may proceed on the existing
  Foundation, plus the single `--qds-color-selected-surface` addition
  named above.** No other `foundation/*.css` file requires a new token to
  unblock Surface.

### 31.10 Residual risks (not resolved by this document)

Carried forward from §30, not architectural questions — resolved by
process, not by a token or API decision:

- `--qds-color-selected-surface`'s actual value needs a WCAG AA contrast
  pass before implementation (§30.2/§31.2), same category of open item as
  Badge's tinted-background gap (Specifications §4).
- Nested + `floating`-elevation combination (§30.3) is still visually
  unvalidated — a design/architecture review can propose the rule, not
  confirm it reads correctly; needs a real rendered check once
  implementation exists.
- `.panel-title` heading-level audit (§30.7) is a content audit, not an
  architecture question — unresolved here by design, needs its own pass.
- Toolbar-vs-Actions boundary (§30.8) remains a per-instance judgment call
  at migration time — no mechanical rule was found that resolves it
  architecturally; flagged for migration-time review, not blocking
  Foundation readiness.

---

*Awaiting founder approval. No implementation, CSS, HTML, JavaScript, or
page migration proceeds from this document until explicitly approved.*
