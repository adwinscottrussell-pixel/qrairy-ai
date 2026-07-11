# QDS Input System v1

Architecture-only. No CSS, HTML, or JavaScript was created or modified to
produce this document. No existing page was migrated or redesigned. Defines
*what* the Input component family is and *how* it behaves; implementation is
a later, separately-approved sprint.

Builds on `QDS_COMPONENT_CATALOG_v1.md` #4 (Inputs/Text), #5 (Textarea), #6
(Select), #7 (Checkbox), #8 (Radio), #10 (Search), #11 (Labels), and
`QDS_COMPONENT_SPECIFICATIONS_v1.md` #3 (Input (Text)), which this document
supersedes and extends into a full family rather than a single primitive.
Composes with `QDS_SURFACE_SYSTEM_v1.md` §24 (Future Input compatibility) and
`components/button.css` (Search's clear affordance, Field actions).

---

## 1. Purpose

Provide the one set of form-control primitives every data-entry point in
QRAIVY renders on — a business name, a redirect URL, a loyalty reward
description, a plan-tier picker, a consent checkbox, a reward-type radio, a
table filter. Input is not one component; it is a **family** sharing one
label/helper/error contract, one focus/validation language, and one spacing
system — what varies control to control is the input mechanism (text,
choice-from-list, boolean, single-choice-from-few), not the surrounding
contract.

## 2. Design philosophy

Per **Converge on one working mechanism**: the catalog audit found free
text entry implemented at least four separate ways (`.app-input`/
`.field-input` already aliased in `dashboard-shell.css`, the editor's
`.prop-input`, `styles.css`'s standalone `#urlInput`), native `<select>`
styled four different ways (`.app-select`/`.filter-select`/`.prop-select`/
`.modal-select`), and single-choice-from-few implemented as clickable
`<div>`s with no real form semantics at all (`.stamp-opt`/`.preset-chip`/
`.cp`). Checkbox has no implementation today. This document converges all
of it onto one family: one Field contract, one Label, one helper/error
language, and per-mechanism controls (`TextInput`, `Textarea`, `Select`,
`Checkbox`, `Radio`, `Search`) that share that contract rather than each
reinventing label placement, error color, and spacing independently.

The recurring, unaudited gap named in every relevant catalog/spec entry
(#4, #6, #7, #8, #11; Specifications §3) is real `<label for="id">`
association — today's `.app-label`/`.field-lbl` are visually positioned
above fields with no confirmed programmatic pairing. This system does not
patch that per-control; it resolves it once, structurally, in the Field
composite (§4), so no consuming page can build a field without the
association existing.

An Input-family control is a **control**, not a container and not a layout
tool — it does not decide page width or grid columns (Surface/layout
concern, per `QDS_SURFACE_SYSTEM_v1.md` §29) and it does not decide where
on the page a form section sits (that's Surface's Body, per Surface §24).

## 3. Component family

| Component | Mechanism | Status (catalog) | Base |
|---|---|---|---|
| **TextInput** | single-line free text | Existing — converge (#4) | primitive |
| **Textarea** | multi-line free text | Existing — converge (#5) | primitive |
| **Select** | one value from a bounded named list, hidden until opened | Existing — converge (#6) | primitive (native `<select>`) |
| **Checkbox** | independent binary choice, or list-row multi-select | Proposed — net new (#7) | primitive |
| **Radio** | one choice from a small *visible* set (2–6) | Proposed — net new (#8) | primitive, `tile` variant composes Surface |
| **Search** | filter-as-you-type | Existing — converge (#10) | composes TextInput |

Not in this family, named for boundary clarity:
- **Toggle** (#9) — already single-sourced and out of scope; an immediate
  on/off *setting*, not a form-submission value. Toggle is not rebuilt here.
- **Combobox / searchable-select** — out of scope until a real need is
  named (per catalog #6's own note); native `Select` stays the default.
- **CopyField, Number Input (with steppers)** — named as future
  extensions (§21), not specified in v1.

## 4. The Field composite

Every control in this family is normally consumed through **Field**, not
directly — Field is the structural piece that resolves the label-association
gap and gives every control the same helper/error/counter layout, once.

```
Field {
  label:        string
  labelFor:     string          // id of the wrapped control; Field owns for/id pairing
  required:     boolean         // renders indicator per §11
  optional:     boolean         // renders "(optional)" suffix per §11 — mutually exclusive with required
  helperText:   string?         // shown when no error is present
  error:        string?         // replaces helperText when present; sets aria-invalid on the control
  success:      string?         // shown only when explicitly set AND no error — see §9
  counter:      { current, max }?  // character counter, see §12
  children:     node            // the control itself (TextInput/Textarea/Select/Checkbox/Radio)
}
```

- Field renders: Label → control slot (`children`) → one of
  {error, success, helperText} (error takes priority) → counter, in that
  order (§8 confirms the exact vertical rhythm).
- Field generates the `id`/`for` pairing when `labelFor` is omitted (the
  control still needs *a* stable id; Field can generate one, but an
  explicit `labelFor` always wins so consumers aren't forced to accept a
  generated id in forms that need a predictable one, e.g. for
  autofill/testing hooks).
- Field, not the individual control, owns `aria-describedby` wiring:
  it points the control at whichever of {error, success, helperText,
  counter} is currently rendered (§13).
- Checkbox and Radio render their own inline label differently (§11.1) —
  Field still supplies the *group*-level label/error/helper wrapper for a
  Checkbox list or Radio group, but the per-option label is owned by the
  option itself, not Field. See §11.1 for the resolved distinction.

Field is a layout/ARIA composite, not a bordered container — it has no
background, border, or padding of its own. A Field placed inside a
Surface's Body (per Surface §24) is the expected, common case; Field does
not duplicate Surface's chrome.

## 5. TextInput anatomy

```
┌ Field ───────────────────────────────────────────────┐
│ Label *                                    (optional) │
│ ┌ Control ─────────────────────────────────────────┐ │
│ │ [prefix?]  text value                  [suffix?]  │ │
│ └────────────────────────────────────────────────────┘ │
│ Helper text  /  Error message  /  Success message      │
│                                          12 / 120       │
└────────────────────────────────────────────────────────┘
```

Same skeleton applies to Textarea (control region grows vertically instead
of a fixed height) and Select (control region's right edge carries the
native disclosure chevron instead of a suffix slot).

## 6. Public API

Proposed contract per control. Not implemented.

```
TextInput {
  size:        'sm' | 'md'
  variant:     'default' | 'monospace'
  value:       string
  placeholder: string?
  prefix:      node?           // icon or short unit label, e.g. "https://"
  suffix:      node?           // icon or short unit label, e.g. a future copy button
  disabled:    boolean
  readOnly:    boolean
  invalid:     boolean         // driven by Field's `error` prop; not set directly in normal use
  id:          string          // supplied by Field
  ariaDescribedBy: string?     // supplied by Field
}

Textarea extends TextInput {
  rows:        number
  autoResize:  boolean         // grows with content up to a max-height, does not replace `rows`
}
// Textarea has no prefix/suffix — multi-line content has no single-line edge to anchor an icon to.

Select {
  size:        'sm' | 'md'
  variant:     'default' | 'monospace'
  options:     Array<{ value, label, disabled? }>
  value:       string
  placeholder: string?         // renders as a disabled, selected first <option>
  disabled:    boolean
  id, ariaDescribedBy: // as above
}

Checkbox {
  checked:       boolean
  indeterminate: boolean
  disabled:      boolean
  label:         node          // Checkbox owns its own inline label, see §11.1
  id: string
}

Radio {
  options:  Array<{ value, label, preview? }>  // preview: swatch/icon node, tile variant only
  value:    string
  variant:  'dot' | 'tile'
  disabled: boolean
  name:     string             // shared name attribute binding the group
}

Search extends TextInput {
  onDebouncedChange: function
  debounceMs:        number   // default 300ms — no current precedent to inherit, named as a decision (§16)
  clearable:         boolean  // shows a suffix clear affordance once value is non-empty
}
```

Notes:
- `size` is `sm | md` only across the whole family — no `lg` size exists
  for any Input-family control, unlike Button. No current page uses a
  larger control, and Input's `md` (44px) already meets the touch-target
  minimum outright (Specifications §3's existing finding); a `lg` variant
  would have no visual or functional job to do. Do not add one without a
  named use case.
- `invalid`/`aria-invalid` on the control and `error` on Field are the same
  underlying state expressed at two layers — a consumer sets `error` on
  Field; Field derives and pushes `invalid` down to the control. Controls
  are never given `invalid` directly in normal usage (kept in the API
  table only because the control must be able to render its own error
  border when used standalone, outside a Field, which is unsupported but
  not physically prevented — see §22).

## 7. Variants

| Control | Variant | Verdict | Reasoning |
|---|---|---|---|
| TextInput/Textarea/Select | `default` | Kept | Baseline, `--qds-font-family-primary`. |
| TextInput/Textarea/Select | `monospace` | Kept | `--qds-font-family-mono`, deliberate — matches `.prop-input`/`.tb-file-name` today for URLs/slugs/IDs, per Specifications §3's existing correct precedent. Not an inconsistency to flatten. |
| Radio | `dot` | Kept | Standard radio circle + label, inline list. |
| Radio | `tile` | Kept | Card-style option (border-highlight + selected background), converges `.stamp-opt`/`.size-opt`/`.cp`/`.template-card.tc-active` per catalog #8. Composes Surface's `selected` state (§14 below) rather than reimplementing selection visuals. |
| Search | — | Kept, as a thin composition | Not a variant of TextInput — a distinct component that *uses* TextInput's control (§17) plus behavior (debounce, clear) TextInput itself does not own. |

No `filled`/`outlined` visual-weight variant is proposed for any control in
this family — Specifications §3 already fixed one visual treatment
(`--qds-color-surface-2` background, `--qds-color-border-default` border)
and no audited page shows a second, intentionally different treatment for
the same mechanism. Introducing one now would be inventing a variant with
no source pattern, the exact thing this sprint exists to avoid.

## 8. Sizes and spacing

| Size | Height | Use |
|---|---|---|
| `sm` | `--qds-control-height-sm` (32px) | Dense contexts — editor property panel (~260px width, matches `.prop-input` today), inline table filters. |
| `md` | `--qds-control-height-md` (44px, default) | Everything else — meets the touch-target minimum directly, no separate mobile override needed (Specifications §3's existing finding, carried forward unchanged). |

Internal control padding: `--qds-space-3` horizontal / `--qds-space-2`
vertical at `md`; `--qds-space-2`/`--qds-space-1` at `sm` — unchanged from
Specifications §3.

Field-level vertical rhythm (new in this document — Specifications §3 only
covered the control itself, not the full Field stack):

| Relationship | Token | Rationale |
|---|---|---|
| Label → control | `--qds-space-2` | Unchanged from Specifications §3. |
| Control → helper/error/success | `--qds-space-1` | Unchanged from Specifications §3 ("field-to-error-message gap"). |
| Helper/error/success → counter | `--qds-space-1` | Same tight step — counter reads as part of the same meta-text row, not a separate block. Mirrors Surface §31.6's Title→Description reasoning (tightest scale step for directly-related meta text). |
| Between stacked Fields in a form | `--qds-space-4` | New — no current page defines a formal "form" layout, but every audited settings/modal form uses a visually consistent ~16px gap between rows; naming it as `--qds-space-4` avoids each consuming page re-deriving its own value. **This is a Form/FieldGroup-level token, not a Field-internal one** — Field itself doesn't enforce spacing to its neighbors, the same way Surface doesn't enforce grid gaps (§29 of Surface doc). Named here so the future FieldGroup (§21) has a concrete starting value rather than improvising one. |

Checkbox/Radio (`dot`) label gap: `--qds-space-2` between the box/dot and
its label text, matching Toggle's existing `.toggle-label` gap convention
(#9) rather than inventing a second value for adjacent same-purpose
controls.

## 9. States

Shared across TextInput/Textarea/Select: `default`, `hover`, `focus`,
`disabled`, `error`, `read-only` — unchanged from Specifications §3.

**Success state — net new, not in Specifications §3.** Added because the
sprint brief explicitly asks for it and a real use case exists (slug/URL
availability confirmation, per Specifications §3's own flagged async-
validation gap). Rules:
- `success` and `error` are mutually exclusive on a single Field — `error`
  always wins if both are somehow set (defensive default, not an expected
  input).
- Success renders: border `--qds-color-success`, message in
  `--qds-color-success`, no icon by default (consistent with Badge's own
  "color is never the only signal" rule — the success *text* itself must
  say what succeeded, e.g. "Slug is available," not just render a green
  border).
- Success does **not** get its own elevation/glow treatment — it is a
  border-color and message-color change only, keeping the same "hover ≠
  elevation" restraint already established for Button and Card.

Checkbox/Radio add: `unchecked`/`checked` (Checkbox), `indeterminate`
(Checkbox only), `unselected`/`selected` (Radio) — in place of TextInput's
text-editing states, plus shared `hover`/`disabled`/`focus-visible`.

## 10. Validation behavior

- Validation is **not** owned by any Input-family control — a control only
  *renders* whatever `error`/`success`/`invalid` state it's given. Deciding
  *when* to validate (on blur, on submit, debounced on change) is a
  Form/FieldGroup-level or page-level concern, out of scope for this
  document (see §21).
- Client-side sync validation (e.g. "required field is empty") sets
  `error` on Field synchronously.
- Async validation (e.g. slug-availability check, per Specifications §3's
  flagged gap) shows a loading affordance in the suffix position while
  pending, then resolves to `error` or `success` on Field. **Foundation
  gap, carried forward from Specifications §3, still unresolved here**: no
  spinner-in-suffix visual spec exists yet. Recommend reusing Button's
  existing spinner treatment (`--qds-icon-size-sm`/`md`, `currentColor`
  border, `--qds-duration-spinner` rotation, exempt from
  `prefers-reduced-motion`) scaled to the suffix slot, rather than
  inventing a second spinner — not implemented here, named as the
  intended source to copy from when this is built.
- A Field never shows both `error` and a pending-validation spinner at
  once — pending state clears before either final state renders.

## 11. Labels

Every Field-wrapped control gets a real `<label for="...">` pointing at the
control's `id` — Field owns this pairing structurally (§4), closing the
audit gap named in catalog #11 and Specifications §3 rather than leaving it
to per-page discipline.

- `required` renders a trailing indicator (asterisk, per current implicit
  convention) in `--qds-color-danger` — chosen over a text suffix like
  "(required)" because every other field in a form would otherwise need
  the inverse "(optional)" suffix for contrast, and required is the more
  common case in this product's forms (business details, redirect URL).
- `optional` renders a trailing "(optional)" suffix in
  `--qds-color-text-muted` — for the minority of genuinely optional
  fields (e.g. a loyalty program's custom message).
- `required` and `optional` are mutually exclusive; a field with neither
  is implicitly required-by-convention but unmarked — **flagged as a real
  gap**: today's fields don't mark required/optional at all
  (Specifications §3, catalog #11), so a broad migration will need a
  per-field audit to assign one or the other, not a mechanical default.
- Typography: `--qds-text-label-*`, unchanged from catalog #11/
  Specifications §3.

### 11.1 Checkbox/Radio label ownership

Unlike TextInput/Textarea/Select, Checkbox and Radio each own their *own*
inline label directly (the label sits beside the box/dot, not above a
control region) — this is a real structural difference from Field's normal
label placement, not an inconsistency:

- **Standalone Checkbox / a Radio group as a whole** is still wrapped in
  Field when it needs a group-level heading, helper, or error (e.g. "Notify
  customers of stamp completion" checkbox with a helper line below it, or a
  "Reward type" Radio group with a shared error if none is selected on
  submit).
- **Each individual Checkbox/Radio option's label** ("Send email
  notifications", "10% off", "Free item") is owned by the option itself via
  native `<label>` wrapping, per Accessibility (§13) — Field's `labelFor`/
  group label is a separate, outer label from each option's own.
- A Radio group's Field-level label answers "what is this group of
  choices," each option's own label answers "what is this specific
  choice" — both are real labels, at different levels, not a duplication.

## 12. Helper text, error messaging, success messaging

- **Helper text** — supporting context shown when the field has no error
  (e.g. "Must be a valid URL starting with https://"). Typography:
  `--qds-text-caption-*` in `--qds-color-text-secondary`.
- **Error message** — replaces helper text when `error` is set. Typography:
  `--qds-text-caption-*` in `--qds-color-danger`, unchanged from
  Specifications §3. Always paired with `aria-invalid="true"` and
  `aria-describedby` (§13).
- **Success message** — same typographic treatment as error, in
  `--qds-color-success` (§9). Not paired with any `aria-invalid` — a
  successful field is, by definition, not invalid.
- Only one of {helper, error, success} renders at a time — Field resolves
  priority as error → success → helper (§9's mutual-exclusion rule applies
  identically here).

## 13. Accessibility requirements

- Every Field-wrapped control has a real, programmatic `<label for="id">`
  — Field's structural job (§4), closing the gap flagged repeatedly in
  catalog #4/#6/#7/#8/#11 and Specifications §3.
- `aria-describedby` on the control points at whichever of
  {error, success, helper, counter} is currently visible — Field manages
  this id wiring so a consumer never hand-assembles it (extends
  Specifications §3's error-only rule to cover success/counter too).
- `aria-invalid="true"` set whenever `error` is present; absent otherwise
  — unchanged from Specifications §3, now formalized as Field's job rather
  than the bare control's.
- Checkbox: real `<input type="checkbox">`, never a styled `<div>`;
  `indeterminate` set via the DOM property, not an HTML attribute (no such
  attribute exists); label click toggles the input via native `<label>`
  wrapping.
- Radio (`dot` and `tile` alike): real `radiogroup`/`radio` semantics —
  this is the resolved fix for catalog #8's flagged gap (`.stamp-opt`/`.cp`
  today are clickable `<div>`s with no radio semantics at all). `tile`
  variant visually hides the native radio input and uses the tile itself as
  the `<label>`, exactly the pattern already named as correct in Surface
  §14/§16 for the Radio-tile-composes-Surface relationship — Radio owns
  `role="radiogroup"`/`aria-checked`, Surface only renders the visual
  `selected` state underneath it.
- Select: never replace native `<select>` with a fake dropdown purely for
  style — unchanged from catalog #6, native gives free keyboard/screen-
  reader support a custom implementation would have to rebuild from
  scratch.
- Search: `role="searchbox"` or `type="search"`; a results-count/"no
  results" outcome is announced via a **separate** `aria-live="polite"`
  region owned by the list/table Search filters, not by Search itself —
  Search's own contract stops at "filter the list," per catalog #10.

## 14. Keyboard behavior

- TextInput/Textarea/Select: standard native text-editing/select-picker
  keys apply; no custom key handling in scope, unchanged from
  Specifications §3.
- Checkbox: Space toggles checked state (native behavior).
- Radio (`dot` and `tile`): arrow keys move selection within the group,
  Tab moves *into or out of* the group as one stop (native `radiogroup`
  behavior) — this is free once real `<input type="radio" name="...">`
  elements back the group (§13), which is precisely why real radio
  semantics were required rather than optional custom JS reimplementing
  roving-tabindex arrow-key behavior by hand.
- Search: Escape clears the field when `clearable` is set and the field has
  focus — new behavior, no current precedent in `.table-search`/
  `.perf-search`; recommended because it's the platform-conventional
  search-box behavior, not because an existing page already does it.

## 15. Focus behavior

`--qds-elevation-focus` ring + border-color shift to
`--qds-color-brand-primary` on `:focus-visible` — identical across every
control in the family, and identical to Button's and Surface's focus
treatment (Specifications §3, Surface §17, cross-referenced explicitly in
Specifications' Cross-Component Notes). One focus language across the
entire design system; this document introduces no second one.

Radio `tile` variant: focus ring applies to the tile (Surface root), not a
separately-visible dot, since the native radio input is visually hidden
inside it — same pattern Surface §17 already anticipated for a
Surface-wrapping interactive child.

## 16. Search-specific behavior

- `debounceMs` default: **300ms**, named here as a decision because
  `.table-search`/`.perf-search` today filter synchronously on every
  keystroke with no debounce at all — 300ms is a conventional default (not
  copied from an existing value, since none exists) chosen to reduce
  redundant filter passes on fast typers without feeling laggy to slow
  typers. Flagged as a value to validate against real usage once built,
  not a hard-derived number.
- `clearable`: renders a suffix "×" affordance once the field has a
  non-empty value; clicking it (or pressing Escape, §14) clears the value
  and returns focus to the field. Not present in either current
  implementation — a net-new but low-risk addition matching common search
  UX.
- Search composes TextInput's control anatomy (§5) with a fixed leading
  search-icon prefix (not present today — catalog #10 already names this
  as worth adding for recognizability) — Search does not duplicate
  TextInput's border/radius/typography rules, it configures TextInput with
  a fixed prefix and adds debounce/clear behavior on top.

## 17. Composition with Surface

- A Field (or several, grouped) sits inside a Surface's Body as a plain
  child, exactly as Surface §24 already specifies — Surface supplies the
  bordered/padded frame (e.g. a "Business Details" panel), Input supplies
  the fields inside it. Neither owns the other's concern: Surface never
  dictates field spacing, Field never dictates the surrounding panel's
  border/radius/padding.
- Radio `tile` variant is the one point of direct composition beyond
  "renders inside Body" — a tile **uses** Surface as its visual shell
  (border, radius, `selected`/`interactive` state, hover treatment) and
  layers real radio semantics on top (§13). This is not Radio duplicating
  Surface's chrome; it's Radio wrapping Surface with `interactive: true`,
  `selected: <isChecked>`, and a visually-hidden native radio input driving
  that `selected` state — precisely the relationship Surface §14/§24
  already reserved for "the future Radio/Checkbox-tile component."
- A `filled` Surface (nested, one level, per Surface §9) is the recommended
  wrapper when a sub-group of Fields needs visual separation from a larger
  settings panel (e.g. a nested "Advanced" fields block within a bigger
  form Surface) — Field itself has no nesting-depth concern of its own,
  it inherits whatever Surface it's placed inside.

## 18. Composition with Button

- **Field-level actions**: a Search's `clearable` "×" is a small inline
  affordance, not a full Button instance — it does not need Button's full
  variant system, just a minimal icon-only tap target following Button's
  own 44×44 touch-target rule (§19 of Specifications, "Touch behavior").
- **Form-level actions**: Save/Cancel/Submit buttons below a group of
  Fields are standard QDS Button (`qds-btn`), unmodified, following
  Button's own "one primary per view" guidance (Specifications §1) — a
  form's submit action is typically the page's one recommended next step
  and should be `primary`; Cancel/Reset are `secondary` or `ghost`. Input
  passes no styling overrides into Button, mirroring Surface §23's
  identical rule for its own Header/Footer action slots.
- **Async-validation spinner** (§10): recommended to reuse Button's
  existing spinner visual token set (`--qds-icon-size-*`,
  `--qds-duration-spinner`, `currentColor` border) rather than a
  Field-specific spinner design — see §10 for why this is named, not
  built, here.
- **Future CopyField** (§21): a suffix-docked copy button composing Button
  in `ghost`, icon-only form inside TextInput's suffix slot — named as the
  first concrete Input+Button composite worth building, not specified
  further in v1.

## 19. Responsive behavior

- Full-width by default inside the Field's container at every size —
  unchanged from Specifications §3/catalog #4.
- Fixed pixel widths seen today (`.table-search { width:180px }`) become an
  explicit `width` prop override on the consuming Search instance, never a
  one-off page-local class — unchanged from Specifications §3's existing
  rule, now extended explicitly to Search (which Specifications §3 didn't
  cover, since Search wasn't in that document's five-component scope).
- Radio `tile` options wrap into a grid below their container's available
  width — `.template-grid`/`.dl-sizes`'s existing 2-column grid precedent
  (catalog #8) is the layout primitive Radio tiles sit inside, same
  boundary rule as Surface §29 (grid/column-count is not this component's
  concern, it's the layout wrapper's).
- No control in this family has breakpoint-specific size changes — `sm`/
  `md` are chosen per context by the consumer, not swapped automatically
  at a viewport, consistent with how Button's sizes work today.

## 20. Correct usage examples

- A `TextInput`, `md`, `monospace` variant, wrapped in Field with label
  "Destination URL", `required`, helper text "Must start with https://" —
  the canonical redirect-URL field.
- A `Textarea`, `autoResize`, wrapped in Field with label "Welcome message",
  `optional`, a character counter at `{current: 42, max: 160}` — an
  AI-assisted loyalty program message field.
- A `Select` wrapped in Field with label "Plan tier", options sourced from
  the current plan enum — admin's plan-change picker.
- A standalone `Checkbox` wrapped in Field with label "Notify me when a
  customer completes their card" and a helper line, no error state
  expected in normal use.
- A `Radio` (`tile` variant) group wrapped in Field with label "Reward
  type", each tile composing Surface with `selected` bound to the current
  value — the loyalty reward-type picker.
- A `Search`, `clearable`, filtering the QR performance table — converges
  `.table-search`/`.perf-search`.

## 21. Future extensibility

- **CopyField** — TextInput + suffix-docked `ghost` icon-only Button
  (§18), converging the ad hoc redirect-link/copy pattern already present
  in `styles.css` and QR manage (named in catalog #4 and Specifications §3
  as the first good composite candidate).
- **Number Input** — numeric-only variant with steppers, named in catalog
  #4 as a future variant, not specified here; no current page has a
  numeric-stepper pattern to converge from.
- **Combobox** — searchable Select, explicitly deferred until a real long-
  option-list need appears (e.g. the future Brand→Locations model's
  location picker), per catalog #6.
- **Form / FieldGroup** — a composite that lays out multiple Fields with
  the `--qds-space-4` inter-field gap named in §8, owns submit-time
  validation orchestration (§10), and groups Radio/Checkbox options under
  one shared error. Not specified in this document; named because several
  sections above (§8, §10, §11) reference it as the eventual home for
  concerns Field intentionally does not own alone.
- **Async slug/URL-availability affordance** — the concrete use case
  behind §10's success-state and pending-spinner behavior; worth building
  as the first real consumer of `success` once Field ships.
- **Inline validation icon** — a leading/trailing checkmark or alert glyph
  reinforcing `error`/`success` state, named in catalog #4 as a future
  addition; deferred in v1 per Badge's "color/border alone is a
  weaker-but-currently-sufficient signal, add an icon only when a real
  legibility gap is found" precedent (Specifications §4's own reasoning
  applied here by analogy).

## 22. Non-goals

Input does **not** own:

- **Validation orchestration** — when to validate, cross-field rules,
  submit-time blocking. Field renders a given state; it does not decide
  when that state changes (§10, §21's Form/FieldGroup).
- **Layout/grid** — column counts, form-row wrapping beyond a single
  Field's own internal stacking. That's Surface/layout's job (§17), same
  boundary Surface itself already draws (Surface §29).
- **Toggle's job** — immediate-effect settings stay Toggle (#9); Input
  is for values that are read/submitted, not instantaneously-applied
  booleans.
- **Standalone usage outside Field** — every control's public API (§6)
  technically accepts direct `id`/`invalid` props for the rare case a
  consumer bypasses Field, but this is **not a supported pattern** — it
  exists only so the control isn't structurally forbidden from rendering
  alone, not as a recommended path. Bypassing Field re-opens exactly the
  label-association gap this whole document exists to close.
- **Search's list/table filtering logic** — Search emits a debounced
  value; deciding how a table filters on it is the table's concern (§13).

## 23. Migration targets

**Text inputs**
- `dashboard-shell.css`: `.app-input`, `.field-input` → `TextInput`,
  `default` variant.
- Editor: `.prop-input`, `.tb-file-name` → `TextInput`, `monospace`
  variant.
- `styles.css`: `#urlInput` → `TextInput`, `monospace` variant.

**Textareas**
- `dashboard-shell.css`: `.app-textarea`, `.field-textarea` → `Textarea`,
  `default`, evaluate `autoResize` per field (AI-prompt fields are strong
  `autoResize` candidates).

**Selects**
- `dashboard-shell.css`/page CSS: `.app-select`, `.filter-select`,
  `.prop-select`, `.modal-select` → `Select`, `default` or `monospace`
  (`.prop-select`/`.filter-select` contexts) per current font usage.

**Checkboxes**
- None today — first real implementations land wherever a future bulk-
  select Data Grid or consent confirmation is built (catalog #7).

**Radios**
- `loyalty-setup.html`: `.stamp-opt`, `.cp` (color preset) → `Radio`,
  `tile` variant, composing Surface's `selected` state (§17).
- `manage-page.css`/design studio: `.size-opt` → `Radio`, `tile` variant.
- Editor: `.template-card.tc-active` selection state → `Radio`, `tile`
  variant, where the tile represents one exclusive choice (template
  selection); if a given `.template-card` usage is actually free-form
  navigation rather than a selectable value, it stays a Surface
  `interactive` card per Surface §28's own migration note, not a Radio
  tile — a per-instance judgment call at migration time, not a mechanical
  rule.

**Labels**
- `dashboard-shell.css`: `.app-label`, `.field-lbl` → Field's built-in
  label, closing the `for`/`id` audit gap (§4, §11).

**Search**
- `dashboard-shell.css`/`analytics-page.css`: `.table-search`,
  `.perf-search` → `Search`, converging the duplicated rule set named in
  catalog #10.

**Explicitly not migrating in this pass**
- `.toggle-switch`/`.toggle-slider` — stays Toggle (#9), out of this
  family's scope (§22).
- `qr-panel.html`'s form controls — same orphaned-page carve-out Surface
  §28 already applied; migrate as a whole page later, not used to seed
  Input variants now.

## 24. Foundation token audit

Everything below resolves using tokens that already exist in
`qds/foundation/`. No new Foundation token is required to unblock this
architecture.

- Sizing: `--qds-control-height-sm` / `--qds-control-height-md`,
  `--qds-touch-target-min`.
- Spacing: `--qds-space-1` / `-2` / `-3` / `-4` (control padding, Field
  rhythm, §8).
- Radius: `--qds-radius-md` (unchanged from Specifications §3), `Radio`
  `tile` inherits Surface's `--qds-radius-lg` by composition (§17), not a
  second radius decision.
- Color: `--qds-color-border-default`, `--qds-color-brand-primary`
  (focus/selected), `--qds-color-danger` (error), `--qds-color-success`
  (success, net new *usage* of an existing token — no new token), `--qds-
  color-surface-2` (control background), `--qds-color-text-muted`
  (placeholder, optional-label suffix), `--qds-color-disabled`.
- Elevation: `--qds-elevation-focus` (shared focus ring, unchanged from
  Specifications §3/Surface §17).
- Typography: `--qds-text-body-*` (field text), `--qds-text-code-*`-
  equivalent via `--qds-font-family-mono` (monospace variant),
  `--qds-text-label-*` (Label), `--qds-text-caption-*` (helper/error/
  success/counter).
- Motion: `--qds-duration-fast` + `--qds-easing-standard` (focus/border
  transitions, unchanged).

**Residual risks, not resolved by this document** (naming only, per this
sprint's own instruction not to improvise):
1. Async-validation spinner-in-suffix has no built visual spec (§10) —
   recommended to copy Button's spinner token usage, not designed fresh
   here.
2. Required/optional labeling has no current per-field convention to
   migrate from (§11) — needs a field-by-field audit at migration time,
   not a mechanical default.
3. `--qds-space-4` as the inter-Field gap (§8) is named for the future
   Form/FieldGroup but not validated against every existing form's actual
   current spacing — a reasonable default inferred from visual consistency
   across audited pages, not measured from a single canonical source.
4. Search's 300ms debounce default (§16) is a conventional value, not
   derived from existing behavior (today's search is fully synchronous) —
   flag for real-usage validation once built.

---

*Awaiting founder approval. No implementation, CSS, HTML, JavaScript, or
page migration proceeds from this document until explicitly approved.*
