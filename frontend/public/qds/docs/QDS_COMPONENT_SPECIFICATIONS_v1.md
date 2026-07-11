# QDS Component Specifications v1

Architecture-only. No CSS, HTML, or JavaScript was created or modified to
produce this document. No existing page was migrated or redesigned. This
defines *how* each component must behave; implementation is a later,
separately-approved sprint.

Scope: the five foundation components — Button, Card, Input, Badge, Empty
State — selected as highest-priority in `QDS_COMPONENT_CATALOG_v1.md`.

Token references are drawn from the already-established foundation layer:
`qds/foundation/{spacing,radius,typography,colors,elevation,motion}.css`.
Where a spec below calls for a token that doesn't yet exist in those files,
it is flagged explicitly as a **foundation gap**, not assumed into being.

---

## 1. Button

### Purpose
Trigger a single, immediate action.

### Design philosophy
One button system, three intents (primary/secondary/ghost), everywhere in
the product. Per **Converge on one working mechanism**
(`company/03_CORE_PRINCIPLES.md`), the four parallel button systems found in
the catalog audit (`dashboard-shell.css`, admin's `.action-btn`/`.modal-btn`,
editor's `.tb-btn`, loyalty's `.wbtn`) collapse into this one component. A
button's visual weight should communicate its importance in the decision at
hand — primary is the one recommended action per view, not a color choice
made per page.

### Visual anatomy
`[ leading-icon? ]  label  [ trailing-icon? ]` inside a single padded,
radiused container. Icon-only variant drops the label and centers the icon.

### Required elements
- A real `<button>` or `<a>` element (never a `<div>` with a click handler).
- A visible label, unless `icon="icon-only"` — in which case `aria-label`
  is required in its place.

### Optional elements
Leading icon, trailing icon, loading spinner (replaces label region only).

### Variants
- `primary` — filled, `--qds-color-brand-primary` background,
  `--qds-color-text-inverse` label.
- `secondary` — outline only, `--qds-color-border-default` border,
  `--qds-color-text-primary` label, transparent fill.
- `ghost` — no border, no fill at rest; `--qds-color-surface-2` fill on
  hover only.
- `danger` — filled, `--qds-color-danger` background, for destructive
  actions only (matches admin's `.action-btn.danger` precedent).
- `ai` — deliberate variant for AI-triggered actions (generate, regenerate,
  smart-suggest). Carries the glow/motion language of the editor's
  `.tb-btn-ai` today, but as one documented variant rather than a
  hand-built one-off to be copy-pasted differently next time.

### Sizes
| Size | Height | Use |
|---|---|---|
| sm | 32px | dense toolbars, inline row actions |
| md | 40–44px | default, most contexts |
| lg | 48px | empty-state CTAs, page-level primary actions |

### States
default, hover, active/pressed (`--qds-pressed-scale` scale-down, matches
existing `.pressable` precedent), focus-visible, disabled, loading.

### Spacing rules
Horizontal padding scales with size: sm → `--qds-space-3`, md →
`--qds-space-4`, lg → `--qds-space-6`. Icon-to-label gap is
`--qds-space-2` at every size. Icon-only buttons are square (padding equal
on all sides).

### Typography usage
Label uses `--qds-text-label-*` tokens (semibold, letter-spaced) at sm/md;
lg may step up to `--qds-text-body-*` weight/size for CTA prominence —
**foundation gap**: no dedicated "button label, large" role exists yet in
`typography.css`; do not invent one ad hoc at implementation time without
resolving this against the type scale first.

### Color token usage
`--qds-color-brand-primary` / `--qds-color-brand-hover` /
`--qds-color-brand-active` drive the primary variant's rest/hover/active
states. `--qds-color-border-default` for secondary. `--qds-color-danger`
for danger. `--qds-color-disabled` overrides all variants when disabled.

### Elevation usage
Flat at rest (`--qds-elevation-none`). No shadow on hover — hover is
communicated by color shift and `--qds-hover-lift`, not elevation, to keep
buttons visually distinct from Cards. `ai` variant may use
`--qds-elevation-brand-glow` as its signature treatment.

### Radius usage
`--qds-radius-md` default across all variants and sizes. Not
`--qds-radius-full` — pill-shaped buttons are out of scope unless a real
use case is named.

### Motion usage
Hover/active transitions use `--qds-duration-fast` with
`--qds-easing-standard`. Press uses `--qds-pressed-scale`. Loading spinner
rotation is continuous and exempt from `prefers-reduced-motion` duration
overrides (a spinner conveying "in progress" is functional, not decorative)
but must still render — never disappear — under reduced motion.

### Icon placement
Leading icon precedes label with `--qds-space-2` gap; trailing icon follows
with the same gap. Icon-only buttons center a single icon with no label in
the DOM beyond `aria-label`.

### Loading behavior
Spinner replaces the label (and any icons) in place; the button's rendered
width does not change, so surrounding layout doesn't shift. Button remains
present in the tab order, but its action is inert while loading —
`aria-busy="true"` communicates this rather than the `disabled` attribute
(see Accessibility).

### Disabled behavior
`--qds-color-disabled` applied to text/border/fill as appropriate per
variant. Pointer events off. Removed from tab order via the native
`disabled` attribute — this is the correct behavior for true disablement,
distinct from loading.

### Keyboard behavior
Focusable via Tab; activates on Enter and Space (native `<button>`
behavior — do not override). `<a>`-rendered buttons (via `href`) activate
on Enter only, per native anchor behavior.

### Focus behavior
`--qds-elevation-focus` ring on `:focus-visible` only (not plain `:focus`,
to avoid a persistent ring after mouse clicks). Ring is visible against
every variant's background, including `ghost` at rest.

### Touch behavior
Minimum 44×44px hit target below the `--qds-breakpoint` mobile threshold
regardless of visual size — carries forward the existing rule already
codified in `dashboard-shell.css` (~line 644). A visually 32px `sm` button
still needs 44px of padded hit area on touch.

### Accessibility requirements
- Real `<button>`/`<a>`, never `<div onclick>`.
- Icon-only buttons require `aria-label`.
- Loading state: `aria-busy="true"` + `aria-disabled="true"`, not the
  `disabled` attribute (which would silently drop it from the tab order,
  correct for true disablement but wrong for "in flight").
- Focus ring meets contrast requirements against every variant background.

### Responsive behavior
`fullWidth` prop stacks the button to 100% width in narrow/mobile layouts
where it would otherwise be a fixed inline width (form actions, modal
footers on small viewports).

### Examples of correct usage
- One `primary` button per view for the recommended next action; every
  other action on that view is `secondary` or `ghost`.
- `danger` reserved for irreversible actions (delete, downgrade), always
  paired with a confirmation step (Modal), not fired directly on click.
- Icon-only toolbar button with `aria-label="Undo"`.

### Examples of incorrect usage
- Two `primary` buttons competing for attention in the same view.
- Using `ghost` for a destructive action (visually under-signals risk).
- A `<div class="btn">` with an `onclick` handler standing in for a real
  button element.
- Disabling a button via `disabled` while an async action is in flight
  (loses `aria-busy` semantics — use `loading` instead).

### Future extensibility
`iconOnly` circular variant for compact toolbars (editor's `.tb-btn`/
`.zoom-btn` are early precedents); split-button (action + caret) once Menu
(catalog #23) exists.

### Migration targets
`dashboard-shell.css`: `.btn-primary`, `.btn-outline`, `.btn-ghost`,
`.btn-create`, `.btn-primary-app`, `.btn-save-field`. `admin.html`:
`.action-btn`, `.modal-btn`. Editor: `.tb-btn`, `.tb-btn-ai`, `.wps-btn`.
Loyalty: `.wbtn`.

---

## 2. Card

### Purpose
Group related content on a surface visually distinct from the page
background.

### Design philosophy
"Bordered rounded surface with padding" is currently reimplemented
independently at least eight times across the audited pages for what is
conceptually one idea. Per **Converge on one working mechanism**, this spec
defines a single primitive with three composition modes (`panel`, `card`,
`container`) rather than one component per page's naming convention. This
also directly resolves the catalog's flagged case of *three* unreconciled
"QR summary card" forms in `dashboard.html` alone.

### Visual anatomy
Outer surface (background + border + radius + optional shadow) containing
an optional header region (title + optional right-aligned action slot) and
a body region. `container` variant omits the surface entirely and is
layout-only.

### Required elements
A padded content region. Nothing else is mandatory — a bare `card` with no
header is valid.

### Optional elements
Header (title + action slot), footer, interactive hover treatment.

### Variants
- `panel` — header/body split, matches `.panel-hdr`/`.panel-title`/
  `.panel-action` today.
- `card` — no forced header, free-form content (KPI tiles, stat cards,
  preview cards all compose from this).
- `container` — no border/shadow, pure grouping/max-width wrapper, matches
  `.page-wrap`/`.mgr-wrap`.

### Sizes
Content-driven. The component exposes `padding` (none | sm | md | lg), not
a fixed width/height size scale.

### States
default; hover (only when `interactive` is set, matches
`.interactive-card` utility already defined in `dashboard-shell.css`);
focus-within (only if the card contains a focusable child worth
highlighting, e.g. a card that's primarily a form).

### Spacing rules
`padding` prop maps directly to `--qds-space-*`: none → `0`, sm →
`--qds-space-4`, md → `--qds-space-6`, lg → `--qds-space-8`. Header-to-body
gap is fixed at `--qds-space-4` regardless of the `padding` setting. Cards
nest at most 2 levels deep — deeper nesting visually flattens and reads as
noise (several dashboard sections already nest panel-in-panel and should be
treated as a migration problem, not a pattern to preserve).

### Typography usage
Header title uses `--qds-text-card-title-*`. Body content typography is
consumer-defined (a card is a container, not a typographic context on its
own) except where the card *is* a KPI tile, in which case the value uses
`--qds-text-kpi-*`.

### Color token usage
Background: `--qds-color-surface-1` (default) or `--qds-color-surface-2`
(nested/secondary card, to stay visually distinct from its parent surface).
Border: `--qds-color-border-subtle` at rest, `--qds-color-border-default`
on hover/interactive states.

### Elevation usage
`elevation` prop: `flat` (`--qds-elevation-none`, default — most cards sit
flush on the page background using border alone), `raised`
(`--qds-elevation-sm`), `floating` (`--qds-elevation-md`, reserved for
cards that visually detach from their context, e.g. a card inside a
Drawer).

### Radius usage
`--qds-radius-lg` default. `container` variant uses `--qds-radius-none`
(it has no visible surface to radius).

### Motion usage
`interactive` hover state transitions over `--qds-duration-fast` with
`--qds-easing-standard`, applying `--qds-hover-lift` as a subtle lift — one
consistent hover motion, replacing the four different hover treatments
(lift, scale, top-gradient-bar, translateX) found across the editor's four
near-duplicate clickable-tile patterns.

### Icon placement
When a header action slot contains an icon-only button, it right-aligns
with `--qds-space-2` from the card's right padding edge, vertically
centered against the title.

### Loading behavior
A loading card renders its Skeleton equivalent (`.skel-card`, catalog #28)
in place of real content — Card itself has no loading state of its own; it
composes with Skeleton.

### Disabled behavior
Not applicable to non-interactive cards. `interactive` cards that represent
a disabled selectable option (future Radio-tile use, catalog #8) dim to
`--qds-color-disabled` and suppress the hover/focus treatment.

### Keyboard behavior
A `card` is not independently focusable unless `interactive` and acting as
a single click target — in which case it must be a real `<a>`/`<button>`
wrapper, focusable and activatable via Tab + Enter, per Accessibility below.
A card containing multiple discrete actions (e.g. dashboard's `.sqr-card`
with several `.sqr-act` buttons) keeps each action independently focusable
instead.

### Focus behavior
`--qds-elevation-focus` ring on the card itself only when the whole card is
one click target. When a card contains multiple focusable children
instead, no ring on the card wrapper.

### Touch behavior
Interactive cards meet the 44×44px minimum hit target on any embedded
action button, same rule as Button. The card surface itself has no minimum
size constraint beyond its content.

### Accessibility requirements
If the entire card is a single click target, it must be a real `<a>`/
`<button>` wrapper or carry `role="link"`/`role="button"` with keyboard
handling — never a `<div onclick>`. Dashboard's `.sqr-card` pattern (real
buttons for actions nested inside a non-clickable card shell) is the
correct precedent to standardize, not the exception.

### Responsive behavior
Card grids collapse column count at defined breakpoints. `.sqr-grid`'s
`auto-fill, minmax(280px,1fr)` is a reasonable existing precedent for the
grid layout primitive that Cards sit inside — that grid is a separate
layout concern from the Card component itself.

### Examples of correct usage
- A `panel` with header + action slot for a dashboard section ("Recent
  Scans" + a "View all" link).
- A `card` (no header) composing a KPI tile.
- Nested: a `container` page wrapper holding a grid of `card`s — 1 level
  of card nesting, not 3.

### Examples of incorrect usage
- A `<div onclick>` wrapping an entire card to make it "clickable" instead
  of a real anchor/button element.
- Panel-in-panel-in-panel nesting (3+ levels) for visual grouping alone.
- Using `container` (no border/shadow) where a `card` was intended —
  content will look unbounded from the page background.

### Future extensibility
`Panel.Header`/`Panel.Body`/`Panel.Footer` sub-component API once real
component code exists, so callers don't hand-roll `.panel-hdr` markup per
page as they do today.

### Migration targets
`dashboard-shell.css`: `.panel`, `.kpi-card`, `.chart-card`, `.sqr-card`,
`.sqr-claimed-card`, `.skel-card`, `.interactive-card`. `dashboard.html`
inline: `.csm-qr-row`. `admin.html`: `.stat-card`, `.modal-box`. Editor:
`.block-card`, `.template-card`, `.element-btn`, `.smart-action-btn`.

---

## 3. Input (Text)

### Purpose
Single-line free text entry.

### Design philosophy
`.app-input`/`.field-input` are already aliased to the same rule in
`dashboard-shell.css` — convergence has already begun there. This spec
extends that convergence to the editor's separate `.prop-input` and
`styles.css`'s standalone `#urlInput`, per **Converge on one working
mechanism**, while explicitly preserving the `monospace` variant as a
deliberate choice (technical/URL values) rather than flattening it away.

### Visual anatomy
`[ prefix? ]  text-field  [ suffix? ]` inside a single bordered container,
with an associated `<label>` above it per the Labels component (catalog
#11).

### Required elements
The `<input>` element itself, programmatically associated with a
`<label>` via `for`/`id` — visual proximity alone (today's unaudited state
for `.app-label`/`.field-lbl`) does not satisfy this.

### Optional elements
Prefix/suffix (icon or short unit label), error message, placeholder.

### Variants
- `default` — standard weight/family.
- `monospace` — `--qds-font-family-mono`, for technical values (URLs,
  slugs, IDs) matching `.prop-input`/`.tb-file-name` today. This is a
  deliberate variant, not an inconsistency to converge away.
- `search` — see Search (catalog #10), a distinct component built on this
  primitive, not specified further here.

### Sizes
sm (compact — editor property-panel context, ~260px container width), md
(default, ~44px height matching the mobile tap-target rule already
enforced in `dashboard-shell.css`).

### States
default, hover, focus, disabled, error, read-only.

### Spacing rules
Internal padding: `--qds-space-3` horizontal, `--qds-space-2` vertical at
md; sm uses `--qds-space-2`/`--qds-space-1`. Label-to-field gap:
`--qds-space-2`. Field-to-error-message gap: `--qds-space-1`.

### Typography usage
Field text: `--qds-text-body-*` (default variant) or
`--qds-text-code-*`-equivalent family (monospace variant) at
`--qds-text-body-sm-size`. Error message: `--qds-text-caption-*` in
`--qds-color-danger`. Associated label: `--qds-text-label-*` (see Labels,
catalog #11).

### Color token usage
Border: `--qds-color-border-default` at rest, `--qds-color-brand-primary`
on focus, `--qds-color-danger` on error. Background:
`--qds-color-surface-2`. Placeholder text: `--qds-color-text-muted`.
Disabled: `--qds-color-disabled` for border and text.

### Elevation usage
None at rest. Focus state uses `--qds-elevation-focus` as the glow ring,
matching the existing `border-color + box-shadow` focus precedent already
in `dashboard-shell.css` — combine border color change and the elevation
token together rather than inventing a separate shadow value.

### Radius usage
`--qds-radius-md`, consistent with Button and Card.

### Motion usage
Border/shadow transition on focus over `--qds-duration-fast` with
`--qds-easing-standard`.

### Icon placement
Prefix icon sits inside the field's left padding, `--qds-space-2` from the
field edge, vertically centered; field text padding increases to
accommodate it. Suffix (unit label or icon, e.g. a future copy-button)
mirrors this on the right.

### Loading behavior
Not applicable to the base Input. A field awaiting async validation (e.g.
slug-availability check) shows a small inline spinner in the suffix
position — **foundation gap**: no async-validation state is defined in the
catalog's Input entry; do not build this without naming the concrete use
case first.

### Disabled behavior
`--qds-color-disabled` border/text, `--qds-color-surface-1` background
(flatter than the active `--qds-color-surface-2`), pointer-events off,
removed from tab order via the native `disabled` attribute.

### Keyboard behavior
Standard native text input behavior — Tab to focus, all native text-editing
keys apply. No custom key handling in scope for this primitive.

### Focus behavior
`--qds-elevation-focus` ring + border color shift to
`--qds-color-brand-primary` on `:focus-visible`.

### Touch behavior
md size (~44px height) satisfies the mobile tap-target minimum directly —
no separate touch-specific override needed, unlike Button/Checkbox which
pad up to 44px around a visually smaller element.

### Accessibility requirements
- Every input has a programmatically associated `<label for="id">` — flag
  for audit against today's markup, which has visual pairing only in some
  cases (`.app-label`/`.field-lbl`).
- Error text linked via `aria-describedby` pointing at the error message
  element's id.
- `aria-invalid="true"` set whenever `error` is present.

### Responsive behavior
Full-width by default inside its container. Fixed pixel widths seen today
(e.g. `.table-search { width:180px }`) become an explicit `width`/`size`
prop override on the consuming component, not a one-off class on the
input itself.

### Examples of correct usage
- A URL field using the `monospace` variant with a `<label for="dest-url">
  Destination URL</label>`.
- An error state with the message linked via `aria-describedby`, not just
  rendered visually below the field.

### Examples of incorrect usage
- A `<label>` positioned visually above a field but with no `for`
  attribute pointing at the input's `id`.
- Fixed pixel width hard-coded per page instead of using the `width`/`size`
  prop.
- Using Input for multi-line content instead of Textarea.

### Future extensibility
Inline validation icon; `CopyField` composite (input + copy-button suffix)
built on this primitive — the redirect-link/copy pattern already exists ad
hoc in `styles.css` and QR manage and is a good first composite to build.

### Migration targets
`dashboard-shell.css`: `.app-input`, `.field-input`. Editor: `.prop-input`,
`.tb-file-name`. `styles.css`: `#urlInput`.

---

## 4. Badge

### Purpose
Communicate a short, glanceable status or category inline with other
content.

### Design philosophy
Six independent color-coded pill implementations exist today for one
concept. Per **Converge on one working mechanism**, this spec defines one
`Badge` with a `tone` enum rather than per-context color classes — a new
status (e.g. a future "trial expiring" state) should be a new `tone` value,
not a seventh bespoke class in an eighth stylesheet.

### Visual anatomy
`[ dot? ]  label` inside a small pill-shaped container. Non-interactive —
a Badge is display-only, never a click target (that's Button/Chip).

### Required elements
The label text. Color alone never carries the meaning — label text (or an
accompanying icon) is mandatory precisely because tone/color is not treated
as a sufficient signal on its own.

### Optional elements
Leading status dot (`.status-dot-live`/`.trial-dot` precedent).

### Variants
- `solid-tint` — tinted background + matching border + matching text
  color, current default (matches `.badge-live`).
- `dot-only` — colored dot with adjacent plain (non-tinted) text, matches
  `.status-indicator`/`.act-dot`.

### Sizes
sm only (~10px text) — the codebase has no larger badge today; do not add
one without a concrete need.

### States
Static display only. Badge is not interactive by definition — it has no
hover/active/focus states.

### Spacing rules
Horizontal padding `--qds-space-2`, vertical padding `--qds-space-1`.
Dot-to-label gap (when `dot` is present): `--qds-space-1`.

### Typography usage
`--qds-text-label-*` (semibold, small, letter-spaced) — same role as form
labels, appropriate given both are short, all-caps-leaning identifiers at
a glance.

### Color token usage
`tone` maps to token pairs, background always at reduced opacity of the
matching solid color:
- `neutral` → `--qds-color-text-muted` / `--qds-color-surface-2`
- `success` → `--qds-color-success`
- `warning` → `--qds-color-warning`
- `danger` → `--qds-color-danger`
- `brand` → `--qds-color-brand-primary`
- `info` → `--qds-color-information`

**Foundation gap**: `colors.css` defines solid status colors only, no
pre-computed tint/background pairs. Contrast at tinted-background + small
text must be verified against WCAG AA before implementation — the catalog
audit flagged current values like `rgba(34,197,94,0.1)` background with
`#22c55e` text as close to the non-text contrast threshold and unverified,
not confirmed safe. Do not carry that pairing forward without a real
contrast check.

### Elevation usage
None (`--qds-elevation-none`) — a badge sits flush with its tint, no
shadow.

### Radius usage
`--qds-radius-full` (pill shape) — the one component in this set where a
full pill is correct, unlike Button.

### Motion usage
None. Badges do not animate on mount/update in current usage; introducing
motion here is out of scope without a concrete need (e.g. a live-updating
count badge).

### Icon placement
Not applicable beyond the optional leading dot — Badge does not support
arbitrary leading/trailing icons in this version; that would blur the line
with a future Tag/Chip component.

### Loading behavior
Not applicable — Badge has no loading state.

### Disabled behavior
Not applicable — Badge is not interactive.

### Keyboard behavior
Not applicable — Badge is never focusable.

### Focus behavior
Not applicable.

### Touch behavior
Not applicable — no tap target, since Badge is non-interactive by
definition. If a future use case makes a badge clickable (e.g. a filter
chip), that is explicitly a different component (see Future extensibility)
with its own touch-target spec, not this one gaining interactivity.

### Accessibility requirements
Tone is never the only signal — pair with text (already true: `.badge-live`
says "LIVE", not just a green dot) and/or an icon. Tinted-background text
contrast at small sizes must be verified once real token values are
computed (see Color token usage gap above).

### Responsive behavior
None — pills don't reflow internally at any viewport.

### Examples of correct usage
- `tone="success"` badge reading "LIVE" next to a QR code's name.
- `tone="brand"` badge reading "AI" marking AI-generated content.

### Examples of incorrect usage
- A badge with only a colored dot and no text label, relying on color
  alone to convey meaning.
- Making a badge clickable (use Button or a future Chip instead).
- Long text inside a badge (truncates poorly at pill sizes) — if the label
  needs to wrap or truncate, it's not a Badge use case.

### Future extensibility
Removable tag variant (with an "×") for filter chips, once a tag-input
pattern is actually needed — a distinct, separately-specified component,
not a prop added to this one.

### Migration targets
`dashboard-shell.css`: `.badge-*` system, `.status-dot-live`,
`.status-indicator`. `analytics-page.css`: `.pt-badge-live`,
`.pt-badge-basic`. `admin.html`: `.plan-badge`, `.status-dot`. Loyalty:
`.card-tag`. Wallet studio: `.wps-tag`.

---

## 5. Empty State

### Purpose
Replace a blank/empty list or section with guidance instead of nothing.

### Design philosophy
The shell-level `.empty-state`/`.sqr-empty`/`.act-empty`/`.state-empty`
cluster is already mostly converged around one visual language (icon +
title + subtext + optional CTA), including a documented `compact` variant.
The editor is the explicit exception — its `.smart-empty` and
`.empty-state`/`.es-icon` markups do not reuse this convention and should
not be treated as already-converged. This spec formalizes the shell's
existing pattern as canonical and names the editor as the migration case,
not the other way around.

### Visual anatomy
Centered stack: icon → title → description → optional action button.

### Required elements
Title and description text. Icon and action are optional but recommended.

### Optional elements
Icon (decorative), action button (CTA), a short list of suggested actions
(editor's `.smart-empty` suggestion-list pattern — see Future
extensibility, not part of the base spec).

### Variants
- `full` — large icon, generous padding, current default for full-page/
  full-section empty states (no QR codes yet, no activity yet).
- `compact` — smaller icon/padding, matches `.empty-state.compact`, used
  inside a smaller panel context (a single card/widget with nothing to
  show).

### Sizes
Driven entirely by the `compact` variant flag — not a separate numeric
size scale.

### States
Static — the only variability is which variant/content is shown. Empty
State does not itself have interactive states beyond its optional action
button's own Button states.

### Spacing rules
`full`: icon-to-title gap `--qds-space-4`, title-to-description
`--qds-space-2`, description-to-action `--qds-space-6`, outer vertical
padding `--qds-space-12`. `compact`: same relative order, halved —
icon-to-title `--qds-space-2`, title-to-description `--qds-space-1`,
description-to-action `--qds-space-4`, outer vertical padding
`--qds-space-6`.

### Typography usage
Title: `--qds-text-card-title-*` (`full`) or `--qds-text-body-*` with
semibold weight (`compact`). Description: `--qds-text-body-sm-*` in
`--qds-color-text-secondary`.

### Color token usage
Icon: `--qds-color-text-muted`. Title: `--qds-color-text-primary`.
Description: `--qds-color-text-secondary`. Action button: standard Button
tokens (typically `secondary` or `primary` variant depending on how
central the missing content is).

### Elevation usage
None — Empty State typically renders inside an existing Card/Panel surface
and does not add its own elevation.

### Radius usage
Not applicable to the Empty State content itself (no bounding surface of
its own); if wrapped in a Card, that Card's radius rules apply.

### Motion usage
None required. A subtle fade-in on mount is acceptable but not specified
as required behavior — do not add a bespoke animation per instance.

### Icon placement
Centered above the title, `--qds-space-4` (full) / `--qds-space-2`
(compact) below it before the title begins.

### Loading behavior
Not applicable — Empty State and Loading State (catalog #27) are distinct;
a section transitions from Loading/Skeleton state to either populated
content or Empty State, never displays both concepts at once.

### Disabled behavior
Not applicable.

### Keyboard behavior
Only the optional action button is interactive — standard Button keyboard
behavior applies to it; the rest of the component is non-interactive
static content.

### Focus behavior
No focus ring on the Empty State container itself. If an action button is
present, it follows standard Button focus behavior.

### Touch behavior
Action button (if present) follows standard Button touch-target rules
(44×44px minimum).

### Accessibility requirements
Icon is decorative — `aria-hidden="true"` — since title and description
already carry the meaning in text. No additional live-region requirement
unless the empty state appears as the *result* of an async operation (e.g.
a search returning zero results), in which case it should be inside a
container already carrying `aria-live="polite"` per the Search component's
spec (catalog #10) — Empty State itself does not own that announcement.

### Responsive behavior
Padding scales down on mobile automatically via existing relative units —
no dedicated breakpoint override needed.

### Examples of correct usage
- "No QR codes yet" with an icon, one line of description, and a `primary`
  "Create your first QR code" action button.
- A `compact` empty state inside a single dashboard widget ("No recent
  scans") with no action button, since there's no single action that
  resolves it.

### Examples of incorrect usage
- Using Empty State to represent a failed request (a genuine Error State
  is a distinct, currently-undesigned case — see Future extensibility;
  don't silently reuse Empty State's copy/icon for a load failure).
- Rendering nothing at all instead of an Empty State when a list has zero
  items — the gap this component exists to close.
- Two competing action buttons inside one Empty State (dilutes the single
  recommended next step, same principle as Button's "one primary per
  view").

### Future extensibility
A distinct **Error State** variant (icon/tone shift + retry action) is a
real, currently-unaddressed gap flagged in the catalog: "no results" and
"failed to load" read identically today and should be deliberately
differentiated, not left conflated. The editor's `.smart-empty` stacked
suggestion-list (icon/title/sub + list of suggested actions +
`.smart-divider`) is a candidate for a documented `suggestions` variant
once the editor migrates onto this component, rather than remaining a
one-off.

### Migration targets
`dashboard-shell.css`: `.empty-state`, `.sqr-empty`, `.act-empty`,
`.state-empty`, `.empty-state.compact`. Editor: `.smart-empty`
(AI/smart-block panel), `.empty-state`/`.es-icon` (layers panel — a second,
separate editor-local implementation, both migration targets).

---

## Cross-Component Notes

- **Token gaps found while writing this spec** (to resolve before or
  during implementation, not silently invented): a "button label, large"
  typography role for `lg` buttons; pre-computed tint/background color
  pairs for Badge `tone` values, pending a real WCAG AA contrast check.
- **Accessibility audit items surfaced, not yet verified against real
  markup**: Input label `for`/`id` pairing across `.app-label`/
  `.field-lbl` usage; whether current empty-state icons already carry
  `aria-hidden`.
- These five components share four tokens sets consistently: radius
  (`--qds-radius-md` for Button/Input, `--qds-radius-lg` for Card,
  `--qds-radius-full` for Badge), the `--qds-duration-fast` +
  `--qds-easing-standard` pairing for all hover/focus transitions, and
  `--qds-elevation-focus` as the single focus-ring treatment across every
  interactive element in this set (Button, Input, and any interactive
  Card). No component in this batch introduces a second focus-ring
  treatment.

---

*Awaiting founder approval. No implementation, CSS, HTML, JavaScript, or
page migration proceeds from this document until explicitly approved.*
