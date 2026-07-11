# QDS Component Catalog v1

Architecture-only. No components, CSS, JS, or HTML were created or modified
to produce this document. Existing pages are untouched.

## Method

Audited every reusable UI pattern actually rendered across
`dashboard.html`, `analytics.html`, `qr-manage.html` (management/design-studio
tabs), `editor.html` (landing page canvas editor), `wallet-pass-studio.html`,
`loyalty-setup.html`, and `admin.html`, plus their supporting stylesheets
(`dashboard-shell.css`, `manage-page.css`, `analytics-page.css`,
`css/toolbar.css`, `css/panels.css`, `css/modal.css`, `css/canvas.css`,
`css/editor.css`, `styles.css`).

Each entry below is tagged with a status:

- **Existing — converge**: the pattern exists today, often 2–4 different
  ways across pages. QDS should define one canonical component; today's
  variants become migration targets, not the spec.
- **Existing — single source**: one implementation already, close to
  canonical as-is.
- **Proposed — net new**: requested in the sprint's expected-component list
  but no real implementation exists yet in the audited pages. Spec is
  forward-looking, informed by adjacent existing patterns.

Properties reference QDS foundation tokens (`--qds-*`) established in
`qds/foundation/`. Where today's CSS uses a raw value or a legacy variable
(`--dashboard-accent`, `--accent`, `--bg`, etc.), that is noted as a
migration point, not copied forward as the standard.

---

## 1. Buttons

**Status:** Existing — converge (4 parallel systems found: `dashboard-shell.css`
`.btn-primary/.btn-outline/.btn-ghost/.btn-create/.btn-primary-app/.btn-save-field`;
`admin.html` `.action-btn`/`.modal-btn`; editor `.tb-btn`/`.wps-btn`; loyalty
`.wbtn`. Same three intents — primary/secondary/ghost — reimplemented with
different padding, radius, and font per page.)

- **Purpose**: trigger a single, immediate action.
- **When to use**: any clickable action that isn't navigation-as-a-link and
  isn't a toggle.
- **When NOT to use**: for navigation between pages (use a link styled as a
  button only when the destination is external/download); for on/off state
  (use Toggle); for a set of 3+ mutually exclusive filters (use Button Group
  or Tabs).
- **Properties (API)**: `variant` (primary | secondary | ghost | danger),
  `size` (sm | md | lg), `icon` (leading | trailing | icon-only),
  `disabled`, `loading`, `fullWidth`, `href` (renders as `<a>` when present).
- **Variants**: `primary` (filled, `--qds-color-brand-primary`), `secondary`
  (outline, border-only), `ghost` (no border/fill, text-only hover state),
  `danger` (destructive actions — admin's `.action-btn.danger`,
  settings "danger zone" delete are the only real precedent today).
- **Sizes**: sm (32px height, matches editor `.tb-btn`), md (40–44px,
  matches `.btn-primary`/mobile tap-target rule already in
  `dashboard-shell.css` `@media (max-width:768px)` block), lg (48px, for
  empty-state CTAs).
- **States**: default, hover, active/pressed (existing `.pressable` scale-97
  micro-interaction in `dashboard-shell.css` is a good precedent to keep),
  focus-visible, disabled, loading (spinner replaces label, button stays
  same width).
- **Accessibility**: real `<button>` or `<a>` element, never a `<div>` with
  an onclick (admin.html currently uses inline `onclick` on real `<button>`
  elements — keep that, don't regress to divs); visible focus ring using
  `--qds-elevation-focus`; icon-only buttons require `aria-label`;
  `aria-busy="true"` + `aria-disabled` while loading, not just `disabled`
  (disabled attribute drops it from the tab order silently, which is fine
  for true disablement but wrong for "in flight").
- **Responsive**: min 44×44px hit target below 768px — already codified as
  a rule in `dashboard-shell.css` line ~644; carry that rule into the QDS
  component rather than re-deriving it per page.
- **Future extensibility**: `iconOnly` circular variant for compact toolbars
  (editor's `.tb-btn` and `.zoom-btn` are early examples); split-button
  (action + caret dropdown) once Menu exists.
- **Note on `.tb-btn-ai`**: the editor's AI-generate button is a bespoke,
  hand-built implementation — 3 layered pseudo-elements plus 2 infinite
  CSS animations (gradient shift + "breath" glow) — not a variant of any
  button system today. It's the only "AI action" affordance in the
  product; worth deciding it as a deliberate `variant="ai"` on this
  component (consistent glow/motion language wherever AI actions appear)
  rather than leaving it a one-off to be copy-pasted differently next time.

## 2. Button Group

**Status:** Proposed — net new, but two ad hoc precedents exist:
`.mgr-tabs`/`.mgr-tab` (segmented-looking but semantically tabs) and the
canvas editor's `.align-row`/`.align-btn` (genuine segmented button group
for text alignment).

- **Purpose**: a connected row of mutually exclusive or multi-select
  buttons acting as one control (e.g. alignment, view toggle).
- **When to use**: 2–5 short, related actions where only one (or a fixed
  few) can be active at once, and the group is small enough to render
  inline without wrapping awkwardly.
- **When NOT to use**: more than ~5 options (use Select or Menu); page-level
  navigation (use Tabs); actions that aren't mutually related.
- **Properties (API)**: `options[]`, `value`/`multiple`, `size`,
  `orientation` (horizontal | vertical).
- **Variants**: segmented (joined, single border, matches `.align-row`
  today), spaced (gap between buttons, matches `.dl-formats`/`.dl-fmt`
  today).
- **Sizes**: sm, md (mirrors Button sizes).
- **States**: per-item selected/unselected, hover, disabled (whole group or
  per-item).
- **Accessibility**: `role="group"` with `aria-label`; for single-select,
  `aria-pressed` per button or a `radiogroup`/`radio` pattern if it behaves
  like exclusive selection.
- **Responsive**: wraps to two rows or converts to a horizontally-scrollable
  strip below a defined breakpoint (`.mgr-tabs` already does horizontal
  scroll with a hidden scrollbar — reuse that technique).
- **Future extensibility**: icon-only segmented variant for density
  toggles, view-mode switchers (grid/list).

## 3. Cards / Panels / Containers

**Status:** Existing — converge (`.panel` in `dashboard-shell.css` is the
closest thing to a canonical card; `.kpi-card`, `.chart-card`, `.sqr-card`,
`.skel-card`, admin's `.stat-card` and `.modal-box`, and editor's
`.block-card`/`.template-card` are all independent reimplementations of
"bordered rounded surface with padding." Two sub-cases worth calling out
individually: (1) dashboard.html alone has *three* unreconciled forms of
"QR summary card" — `.sqr-card` (shell-defined), `.sqr-claimed-card`, and
`.csm-qr-row` (both page-scoped, hardcoded hex instead of shell tokens) —
for what is conceptually one card; (2) the editor has *four* near-duplicate
clickable-tile patterns — `.template-card`, `.element-btn`, `.block-card`,
`.smart-action-btn` — each with a different hover motion (lift, scale,
top-gradient-bar, translateX) and a different border-radius, for what is
conceptually one "selectable tile" component.)

- **Purpose**: group related content on a surface distinct from the page
  background.
- **When to use**: any discrete unit of content — a metric, a list section,
  a settings group, an item in a grid.
- **When NOT to use**: as a layout hack for spacing alone (use a plain
  container/grid); nesting more than 2 levels deep (visually flattens and
  reads as noise — several dashboard sections already nest panel-in-panel).
- **Properties (API)**: `padding` (none | sm | md | lg, maps to
  `--qds-space-*`), `header` (title + optional action slot, matches
  `.panel-hdr`/`.panel-title`/`.panel-action`), `interactive` (adds
  hover-lift, matches `.interactive-card` utility already defined in
  `dashboard-shell.css`), `elevation` (flat | raised | floating).
- **Variants**: `panel` (has header/body split), `card` (no forced header,
  free-form content — KPI tiles, stat cards, preview cards all compose from
  this), `container` (no border/shadow, pure grouping/max-width wrapper —
  matches `.page-wrap`/`.mgr-wrap`).
- **Sizes**: content-driven; component only exposes `padding`, not a fixed
  size scale.
- **States**: default, hover (only if `interactive`), focus-within (if it
  contains a focusable child worth highlighting).
- **Accessibility**: if the whole card is a single click target, it must be
  a real `<a>`/`<button>` wrapper or carry `role="link"`/`role="button"`
  with keyboard handling — not a `<div onclick>` (dashboard's `.sqr-card`
  and `.sqr-act` buttons currently do this correctly by keeping actions as
  real buttons inside the card, which is the right pattern to standardize).
- **Responsive**: card grids collapse column count at defined breakpoints
  (`.sqr-grid`'s `auto-fill, minmax(280px,1fr)` is a reasonable existing
  precedent for a "card grid" layout primitive, separate from this
  component itself).
- **Future extensibility**: a `Panel.Header`/`Panel.Body`/`Panel.Footer`
  sub-component API once real component code exists, so callers don't
  hand-roll `.panel-hdr` markup per page as they do today.

## 4. Inputs (Text)

**Status:** Existing — converge (`.app-input`/`.field-input` in
`dashboard-shell.css` are already aliased to the same rule — a sign
convergence has begun. `.prop-input` in the editor and `#urlInput` in
`styles.css` are separate, older systems.)

- **Purpose**: single-line free text entry.
- **When to use**: short text — names, URLs, single values.
- **When NOT to use**: multi-line content (Textarea); constrained option
  sets (Select); numeric-only with steppers (a future Number Input
  variant).
- **Properties (API)**: `size`, `placeholder`, `error` (message + invalid
  state), `disabled`, `readOnly`, `prefix`/`suffix` (icon or unit label),
  `value`.
- **Variants**: default, monospace (existing `.prop-input`/`.tb-file-name`
  use `--font-mono` for technical values — worth keeping as a deliberate
  variant, not an accident), search (see dedicated Search entry).
- **Sizes**: sm (compact, editor property panel width ~260px context), md
  (default, ~44px per the mobile tap-target rule already enforced),
  matches existing `.field-input`/`.table-search` min-height overrides.
- **States**: default, hover, focus (existing focus ring
  `border-color + box-shadow` glow in `dashboard-shell.css` is a good
  precedent), disabled, error, read-only.
- **Accessibility**: every input has a programmatically associated
  `<label>` (`.app-label`/`.field-lbl` today are visually present but need
  auditing for `for`/`id` pairing, not just visual proximity); error text
  linked via `aria-describedby`; `aria-invalid="true"` on error.
- **Responsive**: full-width by default inside its container; explicit
  fixed widths (`.table-search { width:180px }`) become a `size`/`width`
  prop override, not a one-off class.
- **Future extensibility**: input with inline validation icon, input with
  copy-button suffix (redirect-link/copy pattern already exists ad hoc in
  `styles.css` and QR manage — good candidate for a `CopyField` composite
  built on top of this primitive).

## 5. Textarea

**Status:** Existing — converge (`.app-textarea`/`.field-textarea`, same
alias pattern as Input; used in AI-generation prompt fields).

- **Purpose**: multi-line free text.
- **When to use**: descriptions, AI prompts, notes.
- **When NOT to use**: single short values (Input).
- **Properties (API)**: same as Input, plus `rows`/`autoResize`.
- **Variants**: default; `autoResize` (grows with content, no variant seen
  yet but natural given AI-prompt use cases in this product).
- **Sizes**: driven by `rows`, not a fixed sm/md/lg scale.
- **States**: same as Input; add `resizing` not applicable — resize handle
  is browser-native (`resize: vertical` already set).
- **Accessibility**: same labeling rules as Input.
- **Responsive**: full width; min-height respects the 44px rule for the
  first visible row on mobile.
- **Future extensibility**: character-count footer, AI "regenerate" affordance
  docked to the corner (relevant given `@anthropic-ai/sdk` is used for
  landing-page/campaign copy generation elsewhere in the product).

## 6. Select

**Status:** Existing — converge (native `<select>` styled via
`.app-select`/`.filter-select`/`.prop-select`/`.modal-select` — four class
names, same element, near-identical rules).

- **Purpose**: choose one value from a bounded, named list.
- **When to use**: option count too large for a Button Group, but still a
  closed set (plan tier in admin's modal, date-range granularity in
  analytics).
- **When NOT to use**: free text (Input); open-ended search-then-pick
  (future Combobox, not specified here — out of scope until requested).
- **Properties (API)**: `options[]`, `value`, `placeholder`, `disabled`,
  `size`.
- **Variants**: default (native styled), mono (technical contexts, matches
  `.filter-select`/`.prop-select` using `--font-mono`).
- **Sizes**: sm, md — same scale as Input.
- **States**: default, hover, focus, disabled. Native `<select>` popover
  styling (`option` background) is OS-dependent and only partially
  themeable — `dashboard-shell.css`'s `.filter-select option` background
  override is the current best-effort; document this as a known platform
  limitation, not a bug to chase further in this layer.
- **Accessibility**: label association same as Input; never replace with a
  non-native fake dropdown purely for style — native `<select>` gives free
  keyboard and screen-reader support that a custom implementation would
  have to rebuild.
- **Responsive**: full width on mobile; respects 44px min-height rule
  already in place.
- **Future extensibility**: searchable/combobox variant once a real need
  appears (e.g. selecting from a long list of locations under the
  Brand→Locations model).

## 7. Checkbox

**Status:** Proposed — net new. No checkbox markup found in any audited
page today.

- **Purpose**: single independent binary choice, or one item in a
  multi-select list.
- **When to use**: "select multiple," consent/agreement confirmation,
  bulk-select rows in a future Data Grid.
- **When NOT to use**: a single on/off *setting* that takes effect
  immediately (Toggle is the existing convention for that — see
  `.toggle-switch` used throughout settings tabs).
- **Properties (API)**: `checked`, `indeterminate`, `disabled`, `label`.
- **Variants**: standalone, list-row (paired with a table row for bulk
  actions).
- **Sizes**: single size (18–20px box), matches the general control density
  already established by `.toggle-switch` (38×21px) and radio buttons of
  similar visual weight.
- **States**: unchecked, checked, indeterminate, disabled, focus-visible.
- **Accessibility**: real `<input type="checkbox">`, never a styled `<div>`;
  indeterminate set via JS property, not an attribute; label click toggles
  the input.
- **Responsive**: hit target ≥44×44px on mobile even though the visible box
  is smaller — use padding, not a bigger box, consistent with how
  `.filter-btn` etc. already pad up to 44px on mobile without inflating the
  visual size.
- **Future extensibility**: "select all" header checkbox with indeterminate
  state once Data Grid exists.

## 8. Radio

**Status:** Proposed — net new. `.stamp-opt`/`.preset-chip`/`.cp`
(color-preset) patterns in loyalty-setup and manage-page are radio-like
single-select tiles today, implemented as clickable divs, not real radio
inputs.

- **Purpose**: single choice from a small visible set (2–6 options) where
  every option should stay visible at once (unlike Select, which hides the
  set behind a click).
- **When to use**: visually comparing a few options — reward type, color
  preset, size preset (this covers `.stamp-opt`, `.size-opt`, `.cp`, `.dl-size`
  today).
- **When NOT to use**: more than ~6 options (Select); one independent
  boolean (Checkbox/Toggle).
- **Properties (API)**: `options[]` (each with label + optional preview
  swatch/icon), `value`, `disabled`.
- **Variants**: standard radio dot, tile (card-style, matches
  `.stamp-opt`/`.size-opt`/`.template-card.tc-active` visual language of
  border-highlight + accent background on selection).
- **Sizes**: sm (inline chip, matches `.preset-chip`), md (tile, matches
  `.size-opt`/`.stamp-opt`).
- **States**: unselected, selected, hover, disabled.
- **Accessibility**: real `radiogroup`/`radio` semantics even when styled
  as tiles — today's `.stamp-opt`/`.cp` selection-by-div-click pattern
  should migrate to real radio inputs (visually hidden, tile is the
  `<label>`) so keyboard/screen-reader users get built-in group navigation
  instead of custom JS reimplementing arrow-key behavior.
- **Responsive**: tiles wrap into a grid (`.template-grid`/`.dl-sizes` are
  existing 2-column grid precedents); maintain 44px min tap height.
- **Future extensibility**: radio-with-swatch composite (color/theme
  selection — `.wps-theme-chip`, `.brand-swatch` are current precedents)
  as a documented variant rather than a one-off per page.

## 9. Toggle

**Status:** Existing — single source (`.toggle-switch`/`.toggle-slider` in
`dashboard-shell.css` is one consistent implementation, reused across
settings tabs and QR manage — the best-converged control in the codebase
today).

- **Purpose**: immediate on/off setting.
- **When to use**: settings that take effect as soon as they're changed
  (notifications on/off, QR live/unpublished status).
- **When NOT to use**: an action requiring explicit confirmation before
  taking effect (Button); one choice among 3+ (Radio/Select).
- **Properties (API)**: `checked`, `disabled`, `label`, `description`
  (matches existing `.toggle-label`/`.toggle-desc` pairing in
  `.toggle-row`).
- **Variants**: single variant today; no color-severity variants observed
  (e.g. no visible "danger toggle" — worth deciding deliberately rather
  than improvising if one is needed later).
- **Sizes**: default 38×21px, mobile-enlarged 46×27px per the existing
  `@media (max-width:768px)` override — keep both as the `sm`/`touch`
  sizes rather than two unrelated numbers.
- **States**: off, on, hover, focus-visible, disabled (existing
  `.settings-toggle-row--disabled` opacity-based dimming is a reasonable
  disabled-row treatment to standardize).
- **Accessibility**: real `<input type="checkbox">` under the hood (already
  true today — `.toggle-switch input`) with `role` implicit from the input
  type; ensure the slider `:before` thumb isn't the only indicator of state
  for high-contrast/forced-colors mode — verify a border or text state
  label survives forced-colors, which the current pure-background-color
  state indicator would not.
- **Responsive**: already handled (see Sizes).
- **Future extensibility**: none needed beyond what exists; this is the
  model other components should be brought up to.

## 10. Search

**Status:** Existing — converge (`.table-search`, `.perf-search` — same
control, two class names, defined in two different stylesheets with
duplicated rules).

- **Purpose**: filter a list/table/grid by free text as the user types.
- **When to use**: any list long enough that scanning is slower than
  typing (QR performance table, admin user table).
- **When NOT to use**: fewer than ~10 items (adds noise without saving
  time).
- **Properties (API)**: `placeholder`, `value`, `onDebouncedChange`,
  `icon` (leading search glyph — not present in current markup; worth
  adding for recognizability), `clearable`.
- **Variants**: inline (sits in a table header row, matches current use),
  full-width (mobile stacked).
- **Sizes**: single size, same height as Input/Select for row alignment.
- **States**: default, focus (existing accent-border focus ring), has-value
  vs empty (affects whether a clear "×" button shows).
- **Accessibility**: `role="searchbox"` or `type="search"`; results-count
  or "no results" state announced via `aria-live="polite"` region — not
  observed today, and worth specifying since silent empty-filter results
  are a real usability gap in the current tables.
- **Responsive**: `width:100%` under 640px, already the pattern in
  `analytics-page.css`.
- **Future extensibility**: combine with a Filter Bar dropdown for
  compound filtering (date range + text) once that pattern is needed.

## 11. Labels

**Status:** Existing — single source (`.app-label`/`.field-lbl`, aliased
together already).

- **Purpose**: name a form field.
- **When to use**: above every Input/Textarea/Select/Checkbox/Radio group.
- **When NOT to use**: as a substitute for a heading (use Section Title
  role from typography scale instead).
- **Properties (API)**: `text`, `required` (asterisk/indicator),
  `optional` (explicit "(optional)" suffix — neither currently exists;
  today required/optional is implicit and undocumented per field).
- **Variants**: default (uppercase, letter-spaced, matches current style).
- **Sizes**: single size.
- **States**: default, disabled (dims with its field).
- **Accessibility**: must use `<label for="...">` pointing at the field's
  `id`, not just visual stacking — flagged above under Input as a real
  audit gap, not a hypothetical.
- **Responsive**: none needed.
- **Future extensibility**: inline help/tooltip trigger next to the label
  text for complex fields.

## 12. Badges / Status Pills / Tags

**Status:** Existing — converge (`dashboard-shell.css`'s `.badge-*` system,
`analytics-page.css`'s `.pt-badge-live`/`.pt-badge-basic`, admin's
`.plan-badge`/`.status-dot`, loyalty's `.card-tag`, wallet studio's
`.wps-tag` — six independent color-coded pill implementations for
essentially the same concept: a small labeled state indicator.)

- **Purpose**: communicate a short, glanceable status or category inline
  with other content.
- **When to use**: plan tier, live/paused state, AI-generated marker, row
  category tag.
- **When NOT to use**: as a clickable action (that's a Button/Chip, not a
  Badge); for long text (truncates poorly at pill sizes).
- **Properties (API)**: `label`, `tone` (neutral | success | warning |
  danger | brand | info), `dot` (optional leading status dot, matches
  `.status-dot-live`/`.trial-dot`), `size`.
- **Variants**: solid-tint (current default — tinted background + matching
  border + matching text, e.g. `.badge-live`), dot-only (just the colored
  dot with adjacent plain text, matches `.status-indicator`/`.act-dot`).
- **Sizes**: sm (default, ~10px text), the codebase has no larger variant
  today — don't invent one without a real use case.
- **States**: static display only; no interactive states (not clickable by
  definition of this component).
- **Accessibility**: color is never the only signal — pair tone with text
  (already true: `.badge-live` says "LIVE", not just green) and/or an icon;
  sufficient contrast for tinted-background text at small sizes needs a
  real contrast-ratio check once tokens are finalized, since several
  current tints (`rgba(34,197,94,0.1)` bg with `#22c55e` text) are close to
  the WCAG AA non-text threshold and should be verified, not assumed.
- **Responsive**: none — pills don't reflow internally.
- **Future extensibility**: removable tag variant (with an "×") for
  filter chips once a tag-input pattern is needed.

## 13. Avatar

**Status:** Existing — single source (`.sb-avatar` — initials-in-a-circle,
consistent across every page's sidebar).

- **Purpose**: represent a user or business visually in compact space.
- **When to use**: sidebar user row, any future "assigned to" / team
  member context.
- **When NOT to use**: as a generic icon container (that's an icon chip,
  e.g. `.sqr-thumb`/`.block-icon`, a related but distinct pattern already
  in use and worth keeping separate).
- **Properties (API)**: `initials` (fallback, current only mode),
  `imageSrc` (not implemented yet — every avatar today is initials-only),
  `size`.
- **Variants**: initials (current), image (proposed net-new for future
  profile-photo support).
- **Sizes**: 28px (sidebar, current), 36px (list-row context, matches
  `.skel-avatar`).
- **States**: default; no hover/active state observed (not currently
  interactive).
- **Accessibility**: if avatar becomes clickable (e.g. opens account menu),
  needs `aria-label` with the user's name, not just visual initials.
- **Responsive**: fixed size regardless of viewport.
- **Future extensibility**: status-dot overlay (online/offline) once
  relevant; image with graceful fallback to initials on load failure.

## 14. Navigation — Sidebar

**Status:** Existing — single source (`#sidebar`/`.sb-*` in
`dashboard-shell.css`, reused verbatim across dashboard, analytics,
QR manage, loyalty setup, wallet studio, and admin via `shell-customer.js`/
`shell-admin.js`. This is the strongest existing "component" in the
codebase — it's already a shared, JS-driven include. **Caveat found in
audit**: on both `dashboard.html` and `admin.html`, `<body>` never sets the
`data-shell="customer"`/`data-shell="admin"` attribute that
`shell-customer.js`/`shell-admin.js` gate their sidebar-builder on — so on
both pages the JS builder is dead code, and the sidebar markup actually
rendered is a separate, hand-rolled inline copy in the page itself, using
overlapping-but-not-identical class names (`.sb-item`/`.sb-group` inline vs
`.sb-item`/`.sb-group-label` from the JS builder). This should be fixed as
part of formalizing Sidebar into a real component — the JS builder and the
inline markup should not both exist.)

- **Purpose**: primary app navigation and account context.
- **When to use**: every authenticated app page (customer and admin
  shells).
- **When NOT to use**: public-facing pages (landing pages, `visit.html`,
  marketing `index.html`) — correctly absent there today.
- **Properties (API)**: `items[]` (grouped, with icon/label/badge/active),
  `collapsed` (state, persisted across reload today via the `#sidebar`
  class toggle + likely `localStorage` in `shell-customer.js`), `user`
  (avatar/name/role for footer).
- **Variants**: customer shell (`shell-customer.js`), admin shell
  (`shell-admin.js` — has `.sb-section`/`.sb-tag` instead of `.sb-group`/
  `.sb-badge`, a naming drift worth reconciling under one component with a
  `mode` prop rather than two parallel JS files).
- **Sizes**: expanded 220px, collapsed 56px (desktop); off-canvas
  slide-in on mobile with overlay scrim.
- **States**: expanded, collapsed, mobile-open, mobile-closed; per-item
  active/hover.
- **Accessibility**: nav landmark (`<nav>`) already implied by structure —
  verify it's an actual `<nav>` element, not a bare `<div id="sidebar">`;
  mobile toggle button needs `aria-expanded`; collapsed-state icon-only
  items need `aria-label` since their text label is visually hidden, not
  removed from meaning.
- **Responsive**: off-canvas below 768px with `#mob-btn` trigger and
  `.sb-overlay` scrim — already well-specified behavior, keep as-is.
- **Future extensibility**: multi-brand/agency switcher in the footer area
  once the Brand→Locations hierarchy ships (per
  `docs/company/04_DECISIONS.md`) — the `.sb-user` footer slot is the
  natural place for a brand-switcher affordance to attach to later.

## 15. Navigation — Top Bar

**Status:** Existing — converge (editor's `#topbar`/`.tb-*` is a full,
distinct top bar implementation; dashboard/analytics/admin instead use
`.page-header`/`.dash-header` as an in-page header row, not a fixed top
bar. These solve different problems — editor needs a persistent app-level
bar because it has no sidebar; dashboard pages have a sidebar and use an
in-content header instead. Keep both, but name them as two intentionally
distinct components rather than accidental drift.)

- **Purpose (Top Bar proper, editor-style)**: persistent, fixed
  app-chrome bar for tool-heavy full-canvas contexts where a sidebar isn't
  present.
- **When to use**: full-screen editing/studio contexts (landing page
  editor; wallet pass studio could adopt this instead of its current
  in-page `.wps-head`).
- **When NOT to use**: standard dashboard pages that already have a
  sidebar — use Page Header (in-content) instead, not a second fixed bar.
- **Properties (API)**: `logo`, `title`/`fileName` (editable inline, matches
  `.tb-file-name`), `actions[]` (right-aligned button cluster), `spacer`.
- **Variants**: editor (current), could extend to any future studio-style
  full-canvas tool.
- **Sizes**: fixed height (52px today).
- **States**: default; file-name field has its own focus state.
- **Accessibility**: `<header>` landmark; editable file-name field needs a
  label even if visually just a bare input (`aria-label="Page name"`).
- **Responsive**: currently desktop-oriented (canvas editor isn't a
  primary mobile workflow per the audited markup) — explicitly out of
  scope for mobile optimization unless product direction changes.
- **Future extensibility**: breadcrumb slot between logo and file name for
  nested contexts (e.g. Brand > Location > Page once that hierarchy
  exists).

## 16. Breadcrumb

**Status:** Existing — single source (`.breadcrumb`/`.breadcrumb-current`
in `dashboard-shell.css`, used sparingly today — e.g. QR manage page
"Dashboard / QR Name").

- **Purpose**: show hierarchical location and provide a path back up.
- **When to use**: any page nested more than one level below its shell's
  root (QR manage, a future location-detail page under Brand→Locations).
- **When NOT to use**: top-level shell pages (Dashboard, Analytics) — no
  parent to show.
- **Properties (API)**: `items[]` (label + href), `current` (final,
  non-link segment).
- **Variants**: single variant.
- **Sizes**: single size.
- **States**: link hover/focus on non-current segments.
- **Accessibility**: wrap in `<nav aria-label="Breadcrumb">` with an
  ordered list (`<ol>`), not bare spans/links — current markup should be
  checked against this since the CSS suggests flex spans, not a real list.
- **Responsive**: truncate middle segments with an ellipsis/"…" menu once
  the Brand→Locations hierarchy makes breadcrumbs longer than 2–3 levels.
- **Future extensibility**: exactly the truncation case above — worth
  designing now since the hierarchy is a committed future direction, not a
  maybe.

## 17. Tabs

**Status:** Existing — converge (`.mgr-tabs`/`.mgr-tab` in QR manage is a
real, working tab implementation; `.right-tabs`/`.rtab` in the editor's
right panel is a second, separate implementation of the identical
underline-tab pattern.)

- **Purpose**: switch between mutually exclusive views of the same object
  without navigating away (Design / Settings / Analytics tabs on a single
  QR code; Style / Text / Layers panels in the editor).
- **When to use**: 2–6 views scoped to one object/context.
- **When NOT to use**: primary app navigation (Sidebar); more than ~6
  destinations (consider a Select or restructure the page).
- **Properties (API)**: `items[]` (label, optional count badge — matches
  `.section-count`), `value`/`active`, `orientation`.
- **Variants**: underline (both current implementations use this — one
  visual language already, good), scrollable (mobile — `.mgr-tabs`
  already implements hidden-scrollbar horizontal overflow, reuse verbatim).
- **Sizes**: single size, mobile min-height 44px already enforced in
  `manage-page.css`.
- **States**: active, hover, disabled (not currently used but worth
  defining — e.g. a "Settings" tab disabled until a QR is saved).
- **Accessibility**: `role="tablist"`/`role="tab"`/`role="tabpanel"` with
  `aria-selected` and roving `tabindex` — current markup likely uses plain
  buttons + divs; this is a real gap to close when tabs become a real
  component, not a nice-to-have.
- **Responsive**: horizontal scroll, no wrap (existing behavior, keep).
- **Future extensibility**: vertical tabs for a future settings page with
  many sections (common pattern once the product has more admin surface
  area).

## 18. Accordion

**Status:** Proposed — net new. No collapsible-section pattern found in
any audited page.

- **Purpose**: progressively disclose long-form or optional content
  (advanced settings, FAQ-style help, a long list of integrations).
- **When to use**: content that most users won't need open by default, but
  some will.
- **When NOT to use**: content the majority of users need immediately
  (don't hide primary settings behind a click for false tidiness).
- **Properties (API)**: `items[]` (header + content), `multiple` (allow
  more than one open at once), `defaultOpen`.
- **Variants**: single-open (classic accordion), multi-open (independent
  collapsibles).
- **Sizes**: single size; padding matches Panel body padding for visual
  consistency when nested inside one.
- **States**: collapsed, expanded, hover, focus, disabled.
- **Accessibility**: header is a real `<button aria-expanded>` controlling
  a panel referenced via `aria-controls`; content remains in the DOM
  (`hidden` attribute or height animation), not removed/re-added, so
  in-page search and screen readers behave predictably.
- **Responsive**: full width; no special mobile behavior beyond normal
  stacking.
- **Future extensibility**: nested accordions (avoid unless a real need
  appears — two levels max is a reasonable guardrail to state now).

## 19. Modal

**Status:** Existing — converge (three separate implementations: admin's
`.modal-overlay`/`.modal-box`/`.modal-btns`; editor's `#size-modal`/
`.size-modal-box`; dashboard's `.claim-success-modal`/`.claim-success-overlay`.
All three solve "centered box over a dimmed backdrop" with different class
names, border-radius values, and animation timing.)

- **Purpose**: interrupt the current flow for a focused decision or
  confirmation that blocks the rest of the page.
- **When to use**: destructive confirmations (plan downgrade in admin,
  delete confirmations), a short focused choice (canvas size picker),
  a success/celebration moment (claim-success modal).
- **When NOT to use**: non-blocking information (Toast); content that
  benefits from staying visible alongside the page it relates to (Drawer).
- **Properties (API)**: `title`, `body` (slot), `actions[]` (button row,
  right-aligned per current `.modal-btns` convention), `dismissible`
  (click-outside/Escape close), `size` (sm | md | lg).
- **Variants**: confirmation (title + text + 2 buttons, matches admin's
  plan-change modal), celebratory (icon/glow + single primary CTA, matches
  `.claim-success-modal`), picker (grid of selectable options + implicit
  confirm-on-select, matches `#size-modal`).
- **Sizes**: sm (~360px, matches size-modal), md (~440px, matches
  admin's modal-box), no lg precedent yet — don't invent one without a
  real content need.
- **States**: closed, opening (enter animation — all three existing
  implementations already animate in, converge on one easing/duration
  from `qds/foundation/motion.css`), open, closing.
- **Accessibility**: `role="dialog"` `aria-modal="true"` with a labelled
  title (`aria-labelledby`); focus moves into the modal on open and is
  trapped there; Escape closes (if dismissible); focus returns to the
  triggering element on close. None of this is confirmed present in the
  current three implementations from the CSS alone — treat as a required
  behavior to verify/build when the real component is implemented, not an
  assumption that it already works.
- **Responsive**: full-width bottom-sheet-style on narrow viewports is a
  reasonable evolution but not present today — decide deliberately rather
  than defaulting a centered box that overflows on small screens.
- **Future extensibility**: stacked/nested modal handling (confirm-within-a-modal)
  — explicitly discourage this in the component's usage guidance once
  built, rather than allowing it by accident.

## 20. Drawer

**Status:** Proposed — net new. The mobile sidebar slide-in
(`#sidebar.mob-open`) is architecturally a drawer but is scoped
specifically to primary navigation, not a general-purpose component today.

- **Purpose**: slide-in panel from a screen edge for secondary content that
  should stay contextually anchored to the page behind it (filters, a
  detail view, secondary navigation on mobile).
- **When to use**: mobile navigation (already exists, informally), a
  future "filter panel" for the admin table, a detail/edit panel that
  shouldn't fully replace the list behind it.
- **When NOT to use**: content requiring the user's full, blocking
  attention (Modal); tiny transient content (Toast/Tooltip).
- **Properties (API)**: `side` (left | right | bottom), `size`,
  `dismissible`, `overlay` (scrim on/off).
- **Variants**: nav-drawer (formalizing the existing mobile sidebar
  pattern under this component rather than as a one-off), content-drawer
  (net new).
- **Sizes**: content-drawer width matches existing panel widths (260px,
  the editor's left/right panel width, is a reasonable default to reuse
  rather than invent a new number).
- **States**: closed, open, opening/closing (reuse the existing sidebar's
  transform-based slide animation and timing as the canonical motion).
- **Accessibility**: same dialog/focus-trap requirements as Modal when it
  covers/blocks interaction with the page (mobile nav drawer with a scrim
  should trap focus while open); if used non-modally (no scrim, page still
  interactive), it should not trap focus.
- **Responsive**: this is inherently the mobile-first pattern already
  proven by the sidebar; desktop drawer usage should be considered
  secondary.
- **Future extensibility**: right-side detail drawer as a lighter-weight
  alternative to full-page navigation for the QR manage flow.

## 21. Toast

**Status:** Existing — converge (`#cs-toast` in dashboard-shell, `#_toast`
in the editor — two implementations, same concept: fixed, auto-dismissing
message).

- **Purpose**: brief, non-blocking confirmation or status message
  ("Copied to clipboard," "Saved," "QR is now live").
- **When to use**: acknowledge a completed action that doesn't need the
  user to do anything next.
- **When NOT to use**: errors requiring the user to change something
  (prefer inline field error or a Modal for destructive-action failures);
  anything the user must read and act on before continuing.
- **Properties (API)**: `message`, `tone` (neutral | success | error),
  `duration` (auto-dismiss timing), `action` (optional single inline link/
  button, e.g. "Undo").
- **Variants**: single position convention should be picked (dashboard uses
  bottom-right, editor uses bottom-center) — converge on one, since a user
  moving between an editor and the dashboard shell shouldn't have
  confirmations appear in different screen corners for the same kind of
  event.
- **Sizes**: single size, width hugs content up to a max width.
- **States**: entering, visible, exiting.
- **Accessibility**: `aria-live="polite"` (or `"assertive"` for
  errors) region so screen readers announce it without requiring focus;
  never rely on the toast alone to convey a critical failure the user must
  address — pair with a persistent state elsewhere (e.g. a form's own error
  state) for anything important enough to survive the toast's dismissal.
- **Responsive**: full-width at the bottom on mobile is a common and
  reasonable adaptation, not yet present in either current implementation.
- **Future extensibility**: stacking multiple toasts (queue) once more
  than one async action can plausibly fire in quick succession.

## 22. Tooltip

**Status:** Existing — single source (`.tool-tooltip`/`.tool-tooltip-name`/
`.tool-tooltip-shortcut` in the editor toolbar — one clean implementation:
label + keyboard shortcut, shown on hover).

- **Purpose**: supplementary hint on hover/focus for controls whose
  meaning isn't fully conveyed by their visible label or icon alone.
- **When to use**: icon-only buttons (editor toolbar today), truncated
  text that's cut off with an ellipsis, keyboard-shortcut hints.
- **When NOT to use**: content essential to completing a task (must be
  visible without a hover, since hover isn't available on touch); as a
  substitute for a real accessible name (`aria-label` must exist
  independently of the tooltip).
- **Properties (API)**: `content`, `shortcut` (optional, matches existing
  `.tool-tooltip-shortcut`), `placement`, `delay`.
- **Variants**: label-only, label+shortcut (current editor pattern).
- **Sizes**: single size, content-driven width.
- **States**: hidden, visible (on hover/focus), the current implementation
  is hover-only per the CSS observed — confirm keyboard-focus also
  triggers it when built, since a keyboard user tabbing to an icon-only
  toolbar button needs the same information a mouse user gets on hover.
- **Accessibility**: associate via `aria-describedby`, not just visual
  proximity; must also appear on keyboard focus, not only `:hover` (a real
  gap if the current CSS-only `:hover` implementation has no `:focus`
  equivalent — worth confirming when the component is built).
- **Responsive**: suppress entirely on touch-only devices (no hover state
  to trigger it) rather than trying to simulate hover with a tap, which
  conflicts with the tap's primary action.
- **Future extensibility**: rich tooltip variant with a small preview
  image (e.g. hovering a QR code thumbnail in a dense table).

## 23. Dropdown / Menu

**Status:** Existing (Select only) — converge / partially net new. Every
"dropdown" in the audited pages is actually a native `<select>` (already
cataloged above). A true action menu (click a "⋯" button, get a floating
list of actions) was not found anywhere — this is a real gap given admin's
per-row actions and dashboard's `.sqr-actions` currently render every
action as an always-visible button row instead.

- **Purpose (Menu, net new)**: reveal a list of actions or navigation
  items anchored to a trigger, without the trigger being a native
  `<select>` (needed for a mix of destructive/non-destructive actions with
  icons, or non-form navigation options).
- **When to use**: per-row overflow actions in a future Data Grid; account
  menu off the sidebar avatar.
- **When NOT to use**: choosing a data value for a form (use Select, not a
  custom menu — don't reimplement native picker behavior without a real
  reason).
- **Properties (API)**: `trigger` (button/icon), `items[]` (label, icon,
  danger flag, disabled, divider), `placement`.
- **Variants**: action menu (icon items, e.g. Edit/Duplicate/Delete),
  navigation menu (links).
- **Sizes**: single size; width hugs longest item up to a max.
- **States**: closed, open, item-hover, item-focus, item-disabled.
- **Accessibility**: `role="menu"`/`role="menuitem"` with full arrow-key
  navigation, Escape to close, focus returns to trigger on close — this is
  meaningfully more complex than a native `<select>` and is exactly why
  native `<select>` should stay the default per the Select entry above;
  only build this when a native element genuinely can't do the job.
- **Responsive**: collapses into a full-width bottom sheet on mobile is a
  common pattern worth adopting rather than a tiny floating menu that's
  hard to tap precisely.
- **Future extensibility**: this is the natural foundation for the
  admin table's row actions and the dashboard QR card's action row, both
  of which currently hard-code 3 always-visible buttons that will not
  scale as more per-QR actions are added.

## 24. Table / Data Grid

**Status:** Existing — converge (`.data-table` in `dashboard-shell.css`,
`.perf-table` in `analytics-page.css`, and admin's `.table-wrap`/
`table-header` are three independent table stylings — sortable-header
click behavior (`.data-table th`/`.perf-table th` with a `.sort-icon`) is
duplicated between two of them).

- **Purpose**: display and compare structured, multi-column data
  (QR performance metrics, admin user list, subscriber exports).
- **When to use**: tabular data where columns have consistent meaning
  across rows and users benefit from scanning/sorting/comparing.
- **When NOT to use**: a handful of unstructured items better served by
  Cards (e.g. the dashboard's `.sqr-grid` QR cards intentionally aren't a
  table, and shouldn't become one just for consistency's sake).
- **Properties (API)**: `columns[]` (key, label, sortable, width, align),
  `rows[]`, `sortBy`/`sortDir`, `onRowClick`, `loading`, `empty` (slot).
- **Variants**: standard (current default), compact (denser padding for
  admin's higher-row-count contexts).
- **Sizes**: row height driven by padding token, not a separate size prop;
  matches the 12px/16px padding already consistent across all three
  current implementations — that consistency is worth preserving even
  though the surrounding chrome differs.
- **States**: default row, hover (existing subtle accent-tinted hover in
  both `.data-table`/`.perf-table` — good, keep), sorted-column header
  highlight (existing `.sorted .sort-icon` treatment), loading (skeleton
  rows — `.skel-row`/`.skel-avatar` already exist as building blocks),
  empty (existing `.empty-state`/`.act-empty` patterns to reuse rather
  than inventing a fourth empty-state look).
- **Accessibility**: real `<table>`/`<thead>`/`<tbody>`/`<th scope="col">`
  — verify current markup uses real table elements and not styled divs;
  sortable headers need `aria-sort` on the active column and must be
  operable via keyboard (`<button>` inside `<th>`, not a bare clickable
  `<th>`).
- **Responsive**: horizontal scroll with `min-width` on the table (already
  the pattern in `.perf-table-wrap`) is reasonable for wide data; for
  narrower cases consider a card-per-row transform below a breakpoint as a
  documented alternative, not a hard requirement.
- **Future extensibility**: this is the direct foundation for Data Grid
  (checkbox row-select + bulk action bar + pagination) once bulk actions
  are needed in admin — build Table so those are additive props, not a
  rewrite.

## 25. Pagination

**Status:** Proposed — net new. No pagination control found; current
tables (admin user list, QR performance table) render fully or rely on
client-side search/filter only.

- **Purpose**: navigate a data set too large to render/scan at once.
- **When to use**: admin tables as user count grows past a page's
  comfortable scroll length; any future export/history list.
- **When NOT to use**: small, bounded lists (current QR card grids, which
  are realistically capped per plan tier today).
- **Properties (API)**: `page`, `pageSize`, `totalItems`, `onPageChange`.
- **Variants**: numbered (page 1 2 3 … n), simple prev/next (for infinite
  or unknown-length sets).
- **Sizes**: single size, matches Button sm sizing for page-number
  controls.
- **States**: default, active page, disabled (prev on page 1, next on last
  page), hover.
- **Accessibility**: `<nav aria-label="Pagination">`; active page marked
  `aria-current="page"`; prev/next have real text or `aria-label`, not just
  "‹"/"›" glyphs with no accessible name.
- **Responsive**: collapse to prev/next + "Page X of Y" text below a
  breakpoint rather than showing every page number.
- **Future extensibility**: page-size selector once admin data volume
  justifies it.

## 26. Empty State

**Status:** Existing — mostly converged, with one exception (`.empty-state`/
`.sqr-empty`/`.act-empty`/`.state-empty` cluster around one consistent
visual language: icon + title + subtext + optional CTA, with a documented
`.compact` variant already in `dashboard-shell.css`). The editor is the
exception: it has *two* separate empty-state markups of its own —
`.smart-empty` (icon/title/sub + a stacked list of `.smart-action-btn`
suggestions + `.smart-divider`) for the AI/smart-block panel, and a plainer
`.empty-state`/`.es-icon` for the layers panel — neither reuses the shell's
convention. Don't count the editor as already-converged on this component.)

- **Purpose**: replace a blank/empty list or section with guidance instead
  of nothing.
- **When to use**: no QR codes yet, no activity yet, no search results.
- **When NOT to use**: transient loading (Loading State) or a genuine error
  (a distinct Error State — not currently differentiated from Empty State
  anywhere in the codebase, which is worth deciding on purpose: are "no
  results" and "failed to load" the same visual treatment or not?).
- **Properties (API)**: `icon`, `title`, `description`, `action` (optional
  CTA button), `compact` (existing variant flag).
- **Variants**: full (large icon, generous padding — current default),
  compact (smaller icon/padding, matches `.empty-state.compact`, used
  inside a smaller panel context).
- **Sizes**: driven by the `compact` variant, not a separate size scale.
- **States**: static; the only "state" is which variant/content is shown.
- **Accessibility**: icon is decorative (`aria-hidden="true"`) since the
  title/description already carry the meaning in text.
- **Responsive**: padding scales down on mobile automatically via existing
  relative units — no dedicated breakpoint needed today.
- **Future extensibility**: a distinct Error variant (icon/tone shift +
  retry action) once "empty because there's nothing" and "empty because it
  failed to load" need to look different — flagged above as a real,
  currently-unaddressed gap.

## 27. Loading State

**Status:** Existing — converge (`.state-loading` text-only spinner-less
placeholder text vs. the Skeleton system below — two different
"something is loading" treatments used inconsistently across the same
pages).

- **Purpose**: indicate that content is being fetched, without implying
  it's empty or errored.
- **When to use**: brief fetches where a skeleton would be overkill (a
  single KPI value refreshing).
- **When NOT to use**: initial page/section load of structured content
  (prefer Skeleton, which previews the eventual layout and reduces
  perceived wait — already the more sophisticated pattern available in
  `dashboard-shell.css`, just underused).
- **Properties (API)**: `label` (optional, e.g. "Loading…"), `size`.
- **Variants**: inline text (current `.state-loading`), spinner (not
  currently implemented anywhere as a distinct spinner glyph — worth
  adding since "Loading…" text alone is weaker feedback than a small
  animated indicator for anything taking more than ~1s).
- **Sizes**: sm (inline, within a row/cell), md (section-level).
- **States**: only one state by definition (it is the state).
- **Accessibility**: `aria-live="polite"` + `aria-busy="true"` on the
  container being updated, so screen-reader users get a single announcement
  rather than reading stale-then-fresh content twice.
- **Responsive**: none needed.
- **Future extensibility**: converge fully into Skeleton for anything
  structured; keep this only for truly small, single-value loading spots.

## 28. Skeleton

**Status:** Existing — single source (`.skel`/`.skel-line`/`.skel-card`/
`.skel-row`/`.skel-avatar` in `dashboard-shell.css` — a real, working
shimmer system with width variants already, the most complete "system"
component found besides Toggle).

- **Purpose**: preview the shape of content about to load, reducing
  perceived latency and layout shift.
- **When to use**: initial dashboard KPI/panel/table load.
- **When NOT to use**: content that loads too fast to perceive (avoid
  flashing a skeleton for <100–150ms fetches — add a delay threshold when
  this becomes a real component, not present as a concept today).
- **Properties (API)**: `variant` (line | card | row | avatar, matches
  existing classes), `width` (existing `w-40`/`w-60`/`w-80` presets),
  `count` (repeat N times for a list preview).
- **Variants**: as above — line, card, row, avatar; these compose (a
  skeleton "row" already combines an avatar + lines per
  `.skel-row`/`.skel-avatar` usage).
- **Sizes**: width presets exist (40/60/80%); height is fixed per variant.
- **States**: only the shimmer animation itself; respects
  `prefers-reduced-motion` already (global override in
  `dashboard-shell.css` disables all animation durations, which correctly
  covers this).
- **Accessibility**: container should carry `aria-busy="true"` and
  `aria-live="polite"`, with the skeleton itself `aria-hidden="true"` so
  screen readers don't try to read placeholder shapes as content.
- **Responsive**: widths are percentage-based already, so they scale
  naturally with their container.
- **Future extensibility**: chart-shaped skeleton variant for the KPI/chart
  cards that currently fall back to plain `.state-loading` text instead of
  a skeleton — a concrete near-term migration target.

## 29. Charts

**Status:** Existing — single source, single library (Chart.js 4.4.0 via
CDN, used exclusively in `analytics.html` for scan trend line/area,
subscriber bar, and use-case doughnut charts. No other charting library
found anywhere else in the audited pages — good, no convergence problem
here.)

- **Purpose**: visualize a metric's trend or distribution.
- **When to use**: time-series (scans over time), categorical comparison
  (subscribers by channel), proportional breakdown (use-case doughnut).
- **When NOT to use**: a single current value (KPI Tile) or a short list of
  labeled numbers (Metric Row) — charts are for shape/trend, not for a
  single number that a KPI Tile communicates faster.
- **Properties (API)**: `type` (line | bar | doughnut — the three already
  in use), `data`, `options` (legend/tooltip already configured via a
  shared `chartDefaults` object in `analytics.html` — a real, good
  precedent: centralize chart color/legend/tooltip config once as QDS
  tokens rather than re-declaring `chartDefaults` per page as new chart
  usages are added elsewhere).
- **Variants**: line (with area fill, per scans chart), bar, doughnut.
- **Sizes**: `.chart-wrap`/`.chart-wrap.tall` (180px/220px height presets)
  already exist as the container-size contract Chart.js's `responsive:
  true, maintainAspectRatio: false` options rely on — keep this container/
  canvas size contract explicit in the component API.
- **States**: loading (should use Skeleton's chart-shaped variant, per
  above — not yet built), empty (no data yet — needs its own in-chart
  empty message, not currently distinguished from a chart rendering zero
  values), populated.
- **Accessibility**: Chart.js canvases are not natively accessible to
  screen readers — pair every chart with an offscreen text summary or a
  visually-adjacent data table equivalent for the same numbers (the KPI
  tiles above each chart already partially serve this purpose today —
  worth formalizing that pairing as a requirement, not a coincidence, in
  the component's spec).
- **Responsive**: container-driven sizing already correctly configured;
  legend position/label size may need adjustment below ~480px (not
  currently special-cased).
- **Future extensibility**: consistent color mapping from `--qds-color-*`
  brand/status tokens into Chart.js's dataset colors, so a chart's palette
  never drifts independently from the rest of QDS.

## 30. KPI Tile / Statistic Card

**Status:** Existing — converge (`.kpi-card`/`.kpi-val`/`.kpi-lbl` in
`dashboard-shell.css` vs. admin's separate `.stat-card`/`.stat-value`/
`.stat-label`/`.stat-sub` — near-identical purpose, two implementations,
plus a third smaller variant `.kpi-m`/`.kpi-m-val` for the compact "mini
row" context in QR manage.)

- **Purpose**: surface one important number prominently, with a label and
  optional trend/comparison.
- **When to use**: dashboard/analytics summary rows, admin overview stats.
- **When NOT to use**: more than ~4–6 numbers at once in one row (becomes
  unscannable — current `.kpi-row` already caps at 4 columns, collapsing
  to 2 under 700px, which is the right instinct to keep).
- **Properties (API)**: `value`, `label`, `tone` (neutral | orange/brand |
  green | purple — matches existing `.kpi-val.orange/.green/.purple`
  color-coding convention), `delta` (existing `.an-kpi-delta.up/.dn` trend
  indicator in analytics), `icon` (existing on admin's `.stat-card`, absent
  from dashboard's `.kpi-card` — decide once, apply everywhere).
- **Variants**: full (dashboard/analytics `.kpi-card`, ~72px tall), mini
  (`.kpi-m`, compact inline row inside a tab panel), admin-style with icon
  (current `.stat-card`).
- **Sizes**: full, mini — as above; a single sm/md scale, not per-page
  reinvention.
- **States**: default, hover (existing lift micro-interaction via
  `.interactive-card`), loading (should be Skeleton card, not currently
  wired up everywhere it should be).
- **Accessibility**: value + label read together sensibly for screen
  readers (e.g. wrap as `<div><dt>label</dt><dd>value</dd></div>` or
  equivalent semantic pairing, not two unrelated `<span>`s); delta
  indicators (▲/▼ or color alone) need an accessible text equivalent
  ("up 12%"), not just a colored arrow glyph.
- **Responsive**: grid collapses 4→2 columns under 700px (existing,
  keep); text sizes stay fixed rather than fluid-scaling, which is fine at
  this size.
- **Future extensibility**: sparkline-in-tile variant (tiny inline trend
  line) as a lightweight alternative to a full separate chart card.

## 31. Notification Card

**Status:** Existing — single source (`.notif-card`/`.notif-top`/
`.notif-appname`/`.notif-b`/`.notif-t`/`.notif-ts` in dashboard.html —
appears to preview a push-notification's appearance, likely in the
loyalty/push-campaign context).

- **Purpose**: preview exactly how a push notification will look on a
  device before sending it.
- **When to use**: campaign composer preview pane (matches its apparent
  use alongside `.camp-*` campaign classes in dashboard.html).
- **When NOT to use**: as a general "card with a header" pattern — this is
  a purpose-built preview, not a generic Card variant; keep it distinct so
  its OS-notification-accurate styling doesn't get diluted by unrelated
  reuse.
- **Properties (API)**: `appName`, `title`, `body`, `timestamp`, `icon`.
- **Variants**: single variant (device notification preview); a second iOS
  vs. Android visual variant is plausible future work given the product
  already integrates both Apple and Google Wallet.
- **Sizes**: fixed, mimics real device notification proportions.
- **States**: static preview only — not an interactive/live notification.
- **Accessibility**: this is a preview/mockup, not a real OS notification —
  ensure it's not mistaken for one by assistive tech; a clear "Preview"
  label/context matters more than notification-specific ARIA roles.
- **Responsive**: fixed width matching a typical phone notification card
  width; center within its container on wider viewports.
- **Future extensibility**: platform-accurate iOS/Android visual variants,
  a "scheduled/sent" state badge once tied to real campaign data.

## 32. Landing Page Preview

**Status:** Existing — single source, but architecturally significant
(`lp-preview.html`/`landing-page-renderer.js`/`landing-section-registry.js`
render the actual live landing page — the "preview" in the editor is a
live instance of the real renderer, not a separate mockup component. This
is architecturally the right approach per
`docs/company/04_DECISIONS.md`'s "Smart Landing Pages are the center of
the platform" — worth stating explicitly so a future engineer doesn't
"fix" this by building a second, divergent preview renderer.)

- **Purpose**: show the business owner exactly what their live page will
  look like while editing it.
- **When to use**: inside the canvas editor's live preview surface
  (`#polotno-container` per `canvas.css`); anywhere else a landing page
  needs to be shown (QR manage's mini preview, if any).
- **When NOT to use**: never build a second static-mockup version of this —
  route through the same renderer/section-registry the live page uses, so
  preview and production can't visually drift apart.
- **Properties (API)**: `sections[]` (via the existing section registry),
  `theme`/`brandTokens`, `interactive` (editable in canvas vs. read-only
  preview elsewhere).
- **Variants**: editable (canvas), read-only (QR manage thumbnail, if that
  exists — worth confirming), published (the real `visit.html`/slug page).
- **Sizes**: native canvas size (794×1123 today, per `#polotno-container`);
  scaled via the existing zoom transform system for smaller preview
  contexts rather than a separate fixed-size rendering path.
- **States**: loading (page data fetching), rendered, error (render
  failure — not currently distinguished from a blank canvas as far as the
  audited CSS shows).
- **Accessibility**: not directly applicable to the editor canvas itself
  (canvas-based editing tools are commonly exempted from strict a11y
  parity, per common practice, since the *output* page — the actual
  published landing page — is what needs to meet accessibility standards,
  not the WYSIWYG tool used to build it).
- **Responsive**: the editor canvas is desktop-oriented by design (see Top
  Bar entry); the *published* page it produces must itself be mobile-first
  per `docs/company/03_CORE_PRINCIPLES.md`'s mobile-first principle — two
  different responsive requirements for two different surfaces, worth
  keeping conceptually separate.
- **Future extensibility**: this is the direct dependency for any future
  Brand→Locations preview (one location's page previewed within a brand
  dashboard context) — should compose from the same registry, not fork it.

## 33. Wallet Pass Preview

**Status:** Existing — single source per platform (`.apw-*` classes =
Apple Wallet preview card; `.gow-*` classes = Google Wallet preview card,
both in `wallet-pass-studio.html`, rendering stamp progress, business name,
logo, and reward text in each platform's visual idiom).

- **Purpose**: show a live, platform-accurate preview of the loyalty pass
  before publishing it to Apple/Google Wallet.
- **When to use**: wallet pass studio's design step, and potentially a
  read-only recap in a future campaign/analytics context.
- **When NOT to use**: as a generic "card preview" component — like the
  Landing Page Preview, its value is in being genuinely platform-accurate,
  not generic; don't reuse this styling for unrelated preview needs.
- **Properties (API)**: `platform` (apple | google — two distinct visual
  systems, not a single themed variant, since Apple/Google Wallet have
  genuinely different card conventions), `businessName`, `logo`,
  `stampCount`/`stampGoal` (drives the dot-fill pattern — `.apw-dot.filled`),
  `progressBar` (Google variant's `.gow-bar-fill`/`.gow-bar-track`),
  `rewardText`.
- **Variants**: apple (dot-grid stamp display), google (progress-bar stamp
  display) — these are genuinely different renderings of the same
  underlying stamp-progress data, not a shared template with a skin swap.
- **Sizes**: fixed, matches real wallet-pass card proportions per
  platform.
- **States**: empty (0 stamps), in-progress, reward-ready (goal met —
  visual treatment for this state isn't obviously distinguished in the
  class list audited; worth deciding explicitly rather than leaving
  "reward earned" looking identical to "1 stamp before goal").
- **Accessibility**: this is a visual preview of an external,
  platform-rendered artifact (the real pass lives in Apple/Google Wallet,
  outside this app) — treat the same as Landing Page Preview: the
  *studio's* surrounding controls (inputs, upload buttons) need full
  accessibility; the pass mockup itself is a visual reference.
- **Responsive**: stacks apple/google previews vertically on narrow
  viewports rather than side-by-side (matches `.wps-cards`/`.wps-card-col`
  container behavior — confirm/keep this stacking).
- **Future extensibility**: reward-ready celebratory state (ties back to
  the customer-facing "what the customer sees is always their real,
  current state" principle in `docs/company/03_CORE_PRINCIPLES.md` — stamp
  counts and reward status shown here should never lag the actual
  customer-facing pass).

## 34. QR Preview

**Status:** Existing — converge (`.qr-frame`/`#qrImage` in `styles.css`,
`.qr-preview-frame`/`.qr-preview-main` in `manage-page.css`, and
`.design-qr-frame`/`.design-qr-glow`/`.design-qr-stage` in `manage-page.css`'s
Design Studio layout — three visual treatments of "QR code image on a white
card" with different corner-radius, glow, and sizing choices.)

- **Purpose**: display a generated QR code image prominently, usually with
  a download/customize affordance nearby.
- **When to use**: post-generation result view, QR manage's design tab,
  QR manage's overview preview.
- **When NOT to use**: a small inline thumbnail reference (that's the
  smaller `.sqr-thumb`/`.pt-qr-thumb` pattern, already appropriately
  distinct from this larger "hero" preview).
- **Properties (API)**: `imageSrc`, `size` (hero | standard | thumb — the
  thumb size is really the separate Thumbnail pattern noted above, but
  worth acknowledging as part of the same conceptual family), `glow`
  (decorative accent-colored glow on hover, present in two of the three
  current implementations), `scanCount` (optional adjacent stat, matches
  `.qr-scan-pill`/`.design-qr-scans`).
- **Variants**: plain (styles.css original), glow (manage-page's
  `.qr-preview-frame:hover`), branded-gradient-border (Design Studio's
  `.design-qr-glow` gradient ring) — converge on one as canonical rather
  than keeping all three; the gradient-ring version is visually the most
  refined and a reasonable pick for the canonical style.
- **Sizes**: 160px (styles.css/manage-page), 180px (Design Studio) — pick
  one scale (e.g. sm/md/lg mapped to 120/160/200) rather than three
  arbitrary numbers.
- **States**: default, hover (glow intensifies — existing box-shadow
  transition, keep the easing), loading (QR still generating — not
  currently distinguished from a blank/missing image).
- **Accessibility**: `alt` text must describe the QR's destination/purpose
  (e.g. `alt="QR code linking to [business name]'s page"`), not a generic
  "QR code" — since the image itself is unreadable to a screen-reader
  user, the alt text is their only access to what scanning it would do.
- **Responsive**: fixed pixel size regardless of viewport is acceptable
  for a QR code (scaling too small would break scannability) — but ensure
  container padding around it still respects mobile margins.
- **Future extensibility**: color/logo customization live-preview (ties to
  `.color-swatch`/`.brand-swatch` controls already present in the design
  studio) should visually update this same component in real time rather
  than a separate "final result" render.

---

## Cross-Cutting Findings (for founder review before Sprint 3)

1. **Buttons, Badges, Cards, Tables, and Modals each have 2–4 competing
   implementations** across dashboard/analytics/admin/editor/loyalty/
   wallet. These are the highest-value convergence targets — fixing these
   five touches the largest number of pages per component built.
2. **`dashboard-shell.css` is already the closest thing to a de facto
   design system** (Toggle, Skeleton, Empty State, and the Badge/KPI/Panel
   families are already well-converged there). Sprint 3 component work
   should treat it as the primary source of truth to formalize into real
   QDS components — not as one more legacy file to migrate away from
   equally with the others.
3. **`admin.html` and the editor (`editor.html` + its four CSS files) are
   the two furthest-diverged surfaces** — admin has its own
   stat-card/table/modal/badge vocabulary, and the editor has its own
   button/panel/modal vocabulary, both independent of
   `dashboard-shell.css`. These will need the most real migration work in
   a later phase.
4. **Menu, Accordion, Drawer, Checkbox, Radio, and Pagination don't exist
   yet anywhere** — their specs above are informed by adjacent real
   patterns (segmented tiles, mobile sidebar slide-in, div-based selection)
   but have no current implementation to converge; treat them as genuinely
   new builds, not migrations.
5. **Accessibility gaps recur across nearly every component**: label/input
   association, focus-visible states, `aria-live` regions for async
   content, and keyboard-equivalents for hover-only affordances (Tooltip)
   are worth a dedicated accessibility pass criteria doc before component
   implementation begins, rather than re-deriving them component-by-component.
6. **`qr-panel.html` is architecturally orphaned** — its own font (Syne,
   not Inter), its own accent color (`#FF4E00`, not `--accent`/
   `--dashboard-accent`), and a fully self-contained `<style>` block with
   zero shared classes with `dashboard-shell.css`, `manage-page.css`, or
   `styles.css`. Treat it as a legacy page to migrate later, not a source
   of QDS component variants — its button/card/badge patterns (`.btn-mgr`,
   `.qr-preview-card`, `.qr-preview-badge`, etc.) were intentionally
   excluded from the variant lists above for this reason.
7. **Two rare, undocumented patterns worth naming so they aren't
   reinvented differently later**: the editor's `.ai-thinking-overlay`
   uses a 3-state stepper (`.ai-step` with `.active`/`.done` modifiers) —
   the only step-progress pattern in the codebase, and a plausible seed
   for a future "Stepper" component if wizard-style flows (e.g. onboarding,
   wallet pass setup) need one. Separately, admin's `.cost-row` and
   `.health-row` are pixel-identical "label left, value right, bottom
   border" rows defined twice under different names — a two-line fix
   whenever admin gets touched, not a design question.

---

*Awaiting founder approval before any component implementation begins.*
