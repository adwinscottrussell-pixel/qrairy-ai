# QDS Input Specifications v1

Architecture-only. No CSS, HTML, or JavaScript was created or modified to
produce this document. No existing page was migrated or redesigned. No
Foundation file was modified. This turns the approved
`QDS_INPUT_SYSTEM_v1.md` into a precise, deterministic implementation
contract for the seven approved v1 controls: **Field, TextInput, Textarea,
Native Select, Checkbox, Radio, Search**. Implementation is a later,
separately-approved sprint.

Same relationship to `QDS_INPUT_SYSTEM_v1.md` that
`QDS_COMPONENT_SPECIFICATIONS_v1.md` has to `QDS_COMPONENT_CATALOG_v1.md`:
the System document is architecture (*what* and *why*); this document is
specification (*exactly how*, resolved to the point of being buildable
without further judgment calls). Where the System document left a question
open, named a decision as "not resolved here," or stated two things without
ordering them, this document resolves it explicitly and flags the
resolution as **new in this document**, not carried forward. Everywhere
else, this document is a strict narrowing of the System document — it does
not introduce a new control, variant, or visual treatment the System
document didn't already name.

Out of scope, unchanged from the System document (§3, §22): Toggle,
Combobox/custom Select, CopyField, Number Input, date picker, file uploader,
rich text editor, address autocomplete.

Token references are drawn from the already-established foundation layer
(`qds/foundation/{spacing,radius,typography,colors,elevation,motion,
breakpoints}.css`) and verified against those files directly while writing
this document, not assumed from the System document's own token list. Where
this document calls for something not present in Foundation today, it is
flagged as a **foundation gap** in §13, not assumed into being.

---

## 1. Field

### 1.1 Purpose
The structural composite that gives every control in the family one
label/description/helper/error/success/counter contract and owns the
`for`/`id`/`aria-describedby`/`aria-invalid` wiring, once, so no consuming
page can build a field without correct association.

### 1.2 When to use
Wrapping any TextInput, Textarea, Select, standalone Checkbox, or Radio
group that is read or submitted as a value. Any control this family
renders should be inside a Field in normal use (§1.20, Non-goals in the
System doc §22).

### 1.3 When not to use
Never for Toggle (an immediate-effect setting, not a submitted value —
System §3). Never as a generic layout/spacing wrapper outside a form
context — Field has no background, border, or padding of its own (§1.4)
and is not a substitute for Surface's Body.

### 1.4 Visual anatomy
```
┌ Field ──────────────────────────────────────────────┐
│ Label *                                   (optional) │
│ Description text, when present                       │
│ ┌ children (the wrapped control) ──────────────────┐ │
│ └────────────────────────────────────────────────────┘ │
│ Helper text  /  Error message  /  Success message      │
│                                          12 / 120        │
└────────────────────────────────────────────────────────┘
```
Vertical order is fixed and non-configurable: Label → Description →
control (`children`) → one of {Error, Success, Helper} → Counter. Field is
layout/ARIA only — no background, border, or padding.

### 1.5 Required elements
`label` (string) and `children` (the wrapped control). Every other prop is
optional.

### 1.6 Optional elements
`description`, `helperText`, `error`, `success`, `counter`, `required`,
`optional`.

### 1.7 Public class/API contract
```
Field {
  label:        string
  labelFor:     string?         // explicit id; Field generates one if omitted
  required:     boolean         // mutually exclusive with `optional`
  optional:     boolean
  description:  string?         // long-form context, rendered ABOVE the control
  helperText:   string?         // short-form context, rendered BELOW the control
  error:        string?         // replaces the below-control message when set
  success:      string?         // replaces the below-control message when set and no error
  counter:      { current, max }?
  children:     node
}
```
**New in this document — `description` vs `helperText` resolved as two
distinct slots, not one renamed prop.** The System doc's Field API (§4)
only listed `helperText`; the sprint brief's Field Contract explicitly asks
for both `description` and `helper text` as separate concepts with a
resolved precedence. Resolution: they are not competing for the same slot,
so there is no precedence conflict between them —
- `description` sits **above** the control, directly under Label. Use for
  context needed *before* interacting with the field (e.g. "We'll use this
  to generate your QR code's default name.").
- `helperText`/`error`/`success` sit **below** the control. Use for
  guidance tied to the value itself (format hints, validation outcomes).

Both may render simultaneously — they occupy different positions and serve
different purposes. Only `error`/`success`/`helperText` compete for the
single below-control message slot.

### 1.8 Sizes
Not applicable to Field itself — Field has no visual size of its own; the
wrapped control's `size` prop (`sm`/`md`) drives the rendered height.

### 1.9 States
`default`, `error` (at least one child message is `error`), `success`
(`success` set and no `error`), `disabled` (propagated from the wrapped
control's own `disabled`, for spacing/opacity purposes only — Field does
not independently disable anything).

### 1.10 Typography-token mapping
Label: `--qds-text-label-*`. Description: `--qds-text-body-sm-*` in
`--qds-color-text-secondary` (distinct weight from the below-control
message so the two don't read as the same kind of text). Helper/Error/
Success/Counter: `--qds-text-caption-*`.

### 1.11 Color-token mapping
Label: `--qds-color-text-primary`. Required asterisk:
`--qds-color-danger`. Optional suffix: `--qds-color-text-muted`.
Description: `--qds-color-text-secondary`. Helper: `--qds-color-text-
secondary`. Error: `--qds-color-danger`. Success: `--qds-color-success`.
Counter: `--qds-color-text-muted` at rest, `--qds-color-danger` once
`current > max` (new — see §1.19).

### 1.12 Spacing-token mapping
Unchanged from System §8: Label→Description or Label→control
`--qds-space-2`; Description→control `--qds-space-2`; control→message
`--qds-space-1`; message→counter `--qds-space-1`; between stacked Fields
`--qds-space-4` (a FieldGroup-level token, not enforced by Field itself —
System §8, §21).

### 1.13 Border and radius rules
Not applicable — Field has no border or radius of its own.

### 1.14 Focus behavior
Not applicable to Field directly — focus is owned by the wrapped control
(§2.14 etc). Field does not intercept or wrap focus handling.

### 1.15 Hover behavior
Not applicable — Field itself is not interactive.

### 1.16 Disabled behavior
Field renders whatever `disabled` state the wrapped control reports; it
does not gate interaction itself (there is nothing in the Field wrapper to
disable).

### 1.17 Read-only behavior
Same as Disabled — pass-through from the wrapped control.

### 1.18 Loading behavior
Field does not own loading — the wrapped TextInput/Search owns its own
suffix-slot spinner (§2.18, §7.18). Field's only loading-adjacent job is:
while an async validation is pending, `error`/`success` are both `null` and
no below-control message renders (System §10 — never show error and a
pending spinner at once).

### 1.19 Validation behavior
Field renders whatever `error`/`success`/`helperText` it is given; it does
not decide *when* to validate (System §10, §22). **New in this
document — deterministic message priority, fully resolved:**

| Rule | Resolution |
|---|---|
| error vs helper | error wins, helper does not render |
| success vs helper | success wins if no error, helper does not render |
| error vs success | mutually exclusive; error wins if both are somehow set (defensive default) |
| description vs helper | never conflict — different slot, both may render together |
| counter placement | independent of the above; renders whenever `counter` is passed, regardless of which of {error, success, helper} is showing |
| may multiple messages coexist | yes — up to three visible text elements at once: `description` (above control) + one of {error, success, helper} (below control) + `counter` (below that) |
| counter over-limit | when `current > max`, counter text turns `--qds-color-danger` and Field additionally sets `aria-invalid="true"` on the control even if no explicit `error` string was passed — an over-length value is inherently invalid |

### 1.20 Keyboard behavior
Not applicable — Field adds no keyboard handling; Tab order is whatever
the wrapped control(s) natively provide.

### 1.21 Touch behavior
Not applicable — no touch target of Field's own.

### 1.22 Accessibility requirements
- Field generates the `id`/`for` pairing when `labelFor` is omitted; an
  explicit `labelFor` always wins (System §4).
- `aria-describedby` is a **space-joined list of every currently-rendered
  descriptive element's id** — `description`, the active
  {error|success|helper} message, and `counter`, in that order, omitting
  any that aren't rendered. **New in this document**: the System doc (§4,
  §13) described this as pointing at "whichever is visible" in the
  singular; with `description` now a distinct always-available slot, the
  attribute must be able to carry more than one id at once.
- `aria-invalid="true"` set whenever `error` is present, or when the
  counter's over-limit rule (§1.19) fires. Absent otherwise.
- For Checkbox/Radio groups, Field's label becomes the group's
  `aria-labelledby` target (§5.22, §6.22) rather than a `<label for>`
  pairing, since there is no single control `id` to point at.

### 1.23 Responsive behavior
Field has no responsive behavior of its own; width and stacking are
controlled by the wrapped control (§2.23) and the surrounding layout
(Surface, per §9).

### 1.24 Correct usage examples
- Label "Business name", `required`, no description, helper "Shown on your
  public profile."
- Label "Redirect URL", `required`, description "Where scans of this QR
  code will land.", helper "Must start with https://".
- A Radio group Field with label "Reward type" and a shared `error` when
  nothing is selected at submit.

### 1.25 Incorrect usage examples
- Passing both `required` and `optional` on the same Field (mutually
  exclusive, §1.7).
- Using `description` for a validation-format hint that only matters after
  the user starts typing — that belongs in `helperText`, not `description`
  (§1.7's above/below distinction).
- A consumer hand-assembling their own `aria-describedby` on a control
  used outside Field, duplicating what Field already owns.

### 1.26 Migration targets
`dashboard-shell.css`: `.app-label`, `.field-lbl` → Field's built-in label,
closing the `for`/`id` gap (System §11, §23).

### 1.27 Future extensibility
Form/FieldGroup composite owning the `--qds-space-4` inter-Field gap and
submit-time validation orchestration (System §21) — Field intentionally
stops short of this.

---

## 2. TextInput

### 2.1 Purpose
Single-line free-text entry — the base primitive Search also composes.

### 2.2 When to use
Any single-line value: names, URLs, emails, passwords, phone numbers,
slugs, IDs.

### 2.3 When not to use
Multi-line content (use Textarea, §3). A bounded list of named values (use
Select, §4). Filter-as-you-type over a list (use Search, §7 — Search
extends this component but is not this component).

### 2.4 Visual anatomy
```
┌ Control ─────────────────────────────────────────┐
│ [prefix?]        text value            [suffix?]  │
└────────────────────────────────────────────────────┘
```
One occupant renders in the suffix position at a time — see §2.7's suffix
priority rule.

### 2.5 Required elements
A real `<input>`, given an `id` by Field and pointed at by Field's
`<label for>` (§1.22).

### 2.6 Optional elements
`prefix`, one suffix occupant (custom `suffix` node, clear affordance,
password-reveal toggle, or loading spinner — mutually exclusive, §2.7).

### 2.7 Public class/API contract
```
TextInput {
  size:        'sm' | 'md'
  type:        'text' | 'email' | 'password' | 'url' | 'tel' | 'search'
  variant:     'default' | 'monospace'
  value:       string
  placeholder: string?
  autoComplete: string?         // pass-through, no computed default
  inputMode:   string?          // pass-through; TextInput sets a sensible
                                  // default per `type` (see §2.19) unless overridden
  prefix:      node?
  suffix:      node?
  clearable:   boolean          // NEW — moved here from Search, see note below
  disabled:    boolean
  readOnly:    boolean
  loading:     boolean          // async-validation pending, drives suffix spinner
  required:    boolean          // NEW — native `required`, see §2.19/§10.1
  invalid:     boolean          // driven by Field's `error`; not set directly in normal use
  id, ariaDescribedBy: // supplied by Field
}
```
**New in this document — `clearable` moved from Search's API to
TextInput's.** The System doc's own Search API (§6) declared `Search
extends TextInput` yet listed `clearable` only on Search, which is
internally inconsistent — a component cannot "extend" a behavior its base
doesn't own. Resolution: `clearable` is a TextInput-level capability
(available on any TextInput, not just `type="search"`); Search inherits it
unchanged. This is a consistency fix, not a new feature — the System
doc's Search-specific description of clearable (§16) is unchanged, just
relocated to the component that actually owns the mechanism.

**New in this document — additive TextInput props beyond the System
doc's API (System §6 listed only `size`, `variant`, `value`,
`placeholder`, `prefix`, `suffix`, `disabled`, `readOnly`, `invalid`,
`id`, `ariaDescribedBy`).** Each is a necessary native-`<input>`
pass-through or a resolution of a gap the System doc already implied but
never declared as a prop — none expands the component beyond what §5/§6
of the System doc already described in prose:
- `type` — the System doc's anatomy (§5) and Search composition (§16)
  both assume an underlying `<input>` with a real HTML type
  (`type="url"`, `type="password"`, `type="search"` via Search); the prop
  was never actually named. Disclosed, not removed — this is required
  native pass-through, not a new capability.
- `autoComplete` — pass-through only, no computed default (§2.7's own
  comment); needed so consumers can supply browser-autofill hints
  (e.g. `"current-password"`, §2.22) without a workaround.
- `inputMode` — resolves the virtual-keyboard gap implicit in `type`
  existing at all; default-per-`type` behavior is pinned in §2.19, not
  invented here.
- `loading` — the prop that drives the async-validation suffix spinner
  System §10 already specified in prose ("shows a loading affordance in
  the suffix position"); the System doc described the behavior but never
  named the prop that toggles it.
- `required` — see the consolidated required-semantics resolution below
  and §10.1; added for parity with Select (which already had `required`
  in the System doc, System §6) so the native form-control family isn't
  inconsistent (Select was the only native control with an explicit
  `required` prop prior to this document).

Type `search` on TextInput directly (outside the Search component) is
permitted for the native semantic/keyboard benefit but does not add
Search's icon/debounce — use the Search component for that (§7).

### 2.8 Sizes
| Size | Height | Use |
|---|---|---|
| `sm` | `--qds-control-height-sm` (32px) | Dense contexts — editor property panel, inline table filters. |
| `md` | `--qds-control-height-md` (44px, default) | Everything else. |

No `lg` — unchanged from System §6's explicit rule; do not add one without
a named use case.

### 2.9 States
`default`, `hover`, `focus`, `disabled`, `error`, `success`, `read-only`,
`loading`.

### 2.10 Typography-token mapping
`sm` control: `--qds-text-body-sm-*`. `md` control: `--qds-text-body-*`.
**New in this document** — the System doc (Specifications §3 precedent)
mixed a default-role family token with an sm-size override; this document
pins one full typographic role per control size instead, so
implementation isn't left resolving a partial mapping. `monospace` variant
swaps `--qds-font-family-mono` in for whichever role's family token
applies. Placeholder text uses the same role, colored per §2.11.

### 2.11 Color-token mapping
Border: `--qds-color-border-default` at rest → `--qds-color-brand-primary`
on focus → `--qds-color-danger` on error → `--qds-color-success` on
success. Background: `--qds-color-surface-2` at rest/focus/read-only,
`--qds-color-surface-1` when disabled (flatter, unchanged from
Specifications §3 precedent). Text: `--qds-color-text-primary`.
Placeholder: `--qds-color-text-muted`. Disabled text/border:
`--qds-color-disabled`.

**New in this document — focus-while-error/success precedence.** Not
addressed in the System doc. Resolution: the state-driven border color
(`error`/`success`) always wins over the focus border color — a field
that is both focused and invalid keeps its danger-red border, with the
focus *ring* (`--qds-elevation-focus`, §2.14) still applied on top as the
separate focus signal. This avoids the field visually reading as "fixed"
the instant it's clicked into.

### 2.12 Spacing-token mapping
Padding: `--qds-space-3` horizontal / `--qds-space-2` vertical at `md`;
`--qds-space-2`/`--qds-space-1` at `sm` (System §8, unchanged). Prefix/
suffix inset from the control edge: `--qds-space-2`, vertically centered.

### 2.13 Border and radius rules
1px border, `--qds-radius-md` — consistent with Button/Card
(Specifications §3 precedent, carried forward).

### 2.14 Focus behavior
`--qds-elevation-focus` ring + border-color shift to
`--qds-color-brand-primary` on `:focus-visible` only, unless overridden by
error/success color (§2.11). Identical focus language to Button/Surface —
no second focus treatment introduced.

### 2.15 Hover behavior
Border lightens toward `--qds-color-border-default` at full opacity if
currently below it (rest state already uses full-opacity default in this
family, so hover is a no-op in the common case) — no elevation change on
hover, matching Button's "hover ≠ elevation" rule (System §9).

### 2.16 Disabled behavior
`--qds-color-disabled` border/text, `--qds-color-surface-1` background,
`pointer-events: none`, removed from tab order via the native `disabled`
attribute.

### 2.17 Read-only behavior
**New in this document — resolved without a new token.** Background stays
`--qds-color-surface-2` (same as default/active — the value is still real,
selectable content, not flattened like `disabled`). Border stays
`--qds-color-border-default`. The only differences from `default`:
`cursor: default` (not text-caret), no hover border-lighten, and no
brand-color focus border shift — the field remains focusable and
selectable (native `readonly` semantics), it just never signals
"editable." See §13.1 for why this needed no new Foundation token.

### 2.18 Loading behavior
Async validation pending (§ System §10) renders a small spinner in the
suffix position, reusing Button's spinner token set —
`--qds-icon-size-sm`, `currentColor` border, `--qds-duration-spinner`
rotation, exempt from `prefers-reduced-motion` (spinner conveys
"in progress," same exemption as Button's, Specifications §1). Loading
takes top priority in the suffix-occupancy order (§2.19).

### 2.19 Validation behavior
Client-side sync errors set `error` on Field synchronously (§1.19). Async
validation shows the loading spinner while pending, then resolves to
`error` or `success` (System §10) — never both, never loading + a final
state simultaneously.

Default `inputMode` per `type` (new — resolves an unspecified System-doc
gap): `email`→`"email"`, `tel`→`"tel"`, `url`→`"url"`, `search`→
`"search"`, `text`/`password`→ omitted (native default). Overridable via
an explicit `inputMode` prop.

**Required semantics — new in this document, resolved deterministically
for the whole native form-control family (TextInput, Textarea, Select;
Checkbox and Radio resolved separately at §5.19/§6.19 since neither maps
1:1 to a single native `required` attribute).** `required` renders the
native HTML `required` attribute on the underlying `<input>` — this is a
plain pass-through, not a custom validation behavior: the browser's own
constraint-validation semantics apply, and Field's `error` (§1.19) is the
mechanism for surfacing that state visually, exactly as any other
sync-validation error. `required` and native `required` are the same
state at two layers, the same relationship already established between
Field's `error` and the control's `invalid` (§2.7).

**New in this document — suffix-occupancy priority, fully resolved.** The
suffix position can only render one thing at a time. Priority, highest
first:
1. `loading` spinner (async validation pending)
2. Password-reveal toggle (`type="password"`, always present, §2.20)
3. Clear affordance (`clearable`, once the field has a non-empty value)
4. Consumer-supplied `suffix` node

A consumer-supplied `suffix` is therefore unsupported at the same time as
`type="password"` or `clearable` — document this restriction directly in
the (future) component's prop typing/lint rule when built, so the
conflict is caught at author-time rather than silently dropped at
render-time.

### 2.20 Keyboard behavior
Standard native text-editing keys. `type="password"`'s reveal toggle is a
real focusable button (Tab-reachable, Enter/Space activates) — see §8
Button composition.

### 2.21 Touch behavior
`md` (44px) meets the tap-target minimum directly. Any suffix/prefix
icon-button occupant (reveal toggle, clear "×") still gets its own
44×44px padded hit area layered inside the control per §8, matching
Button's icon-only rule — the *visible* icon can be smaller
(`--qds-icon-size-sm`) than its tap target.

### 2.22 Accessibility requirements
- `<label for="id">` via Field (§1.22).
- `aria-invalid="true"` when `error` present (§1.19).
- `aria-describedby` per §1.22's joined-id rule.
- Password-reveal toggle: `aria-label="Show password"` /
  `aria-label="Hide password"` (state-dependent), `aria-pressed` reflecting
  revealed/hidden.
- Clear affordance: `aria-label="Clear"` — see §8 for why this is not a
  full Button semantically hidden behind an icon.
- `type="password"` never gets `autoComplete` guessed by TextInput itself
  — the consumer supplies `"current-password"`/`"new-password"` per
  context; TextInput has no way to know which is correct.

### 2.23 Responsive behavior
Full-width by default inside Field's container at every size (System
§19). Fixed pixel widths become an explicit `width` prop override, never
a page-local class.

### 2.24 Correct usage examples
- `type="url"`, `monospace`, wrapped in Field, label "Destination URL",
  `required`, helper "Must start with https://".
- `type="password"` with the reveal toggle, no custom `suffix` passed.
- `clearable` on a `type="text"` field used as a quick-filter outside a
  table context (still not the Search component, since there's no
  debounce/leading icon need).

### 2.25 Incorrect usage examples
- Passing a custom `suffix` alongside `type="password"` (unsupported
  combination, §2.19).
- Using TextInput for a value that filters a list with debounce — that's
  Search (§7), not TextInput with `clearable` bolted on.
- Fixed pixel width hard-coded in a page-local class instead of the
  `width` prop.

### 2.26 Migration targets
`dashboard-shell.css`: `.app-input`, `.field-input` → `TextInput`,
`default`. Editor: `.prop-input`, `.tb-file-name` → `TextInput`,
`monospace`. `styles.css`: `#urlInput` → `TextInput`, `monospace`.

### 2.27 Future extensibility
CopyField (suffix-docked `ghost` icon Button, §8); Number Input with
steppers (System §21) — neither specified further here.

---

## 3. Textarea

### 3.1 Purpose
Multi-line free-text entry — loyalty messages, AI-prompt fields,
descriptions.

### 3.2 When to use
Any value expected to run past one line, or where the user benefits from
seeing multiple lines while typing.

### 3.3 When not to use
Single-line values (TextInput, §2), even long ones (a long slug is still
TextInput/`monospace`, not Textarea).

### 3.4 Visual anatomy
Same skeleton as TextInput (System §5) with no prefix/suffix — the control
region grows vertically instead of holding a fixed height.

### 3.5 Required elements
A real `<textarea>`, labeled via Field.

### 3.6 Optional elements
`maxLength` + counter (via Field), `autoResize`.

### 3.7 Public class/API contract
```
Textarea extends TextInput {
  rows:        number   // default 3 — NEW, see §3.8
  autoResize:  boolean  // grows with content up to a max-height; does not replace `rows`
  maxHeight:   number?  // px cap when autoResize is set; default 320 — NEW, see §3.8
}
// No prefix/suffix/clearable/loading — multi-line content has no single-line
// edge to anchor an icon to, and async validation of a long-form field has
// no current use case (System §6's own note, unchanged). `required` IS
// inherited unchanged from TextInput (§2.7/§2.19) and maps to native
// `<textarea required>` — unlike prefix/suffix/clearable/loading, required
// has no single-line-anchored mechanism, so there is no reason to exclude
// it from the inherited set.
```

### 3.8 Sizes
`sm`/`md` control the horizontal padding/typography scale exactly as
TextInput (§2.8); height is governed by `rows`, not the fixed control
height tokens. **New in this document** — two numeric defaults the System
doc left unset: `rows` defaults to **3** (matches the AI-prompt/loyalty-
message use case named in System §20 as the canonical example) and, when
`autoResize` is set, `maxHeight` defaults to **320px** (roughly 10 lines
of `--qds-text-body-*`). Both are reasonable defaults inferred from the
one named use case, not derived from an existing page — flag for
real-usage validation once built, same caveat style as Search's debounce
default (System §16, §24).

### 3.9 States
Same as TextInput (§2.9), minus `loading` (no async-validation use case
named).

### 3.10 Typography-token mapping
Same as TextInput (§2.10).

### 3.11 Color-token mapping
Same as TextInput (§2.11), including the focus-while-error precedence
rule (§2.11).

### 3.12 Spacing-token mapping
Same internal padding as TextInput (§2.12); no prefix/suffix inset since
neither slot exists.

### 3.13 Border and radius rules
Same as TextInput (§2.13).

### 3.14 Focus behavior
Same as TextInput (§2.14).

### 3.15 Hover behavior
Same as TextInput (§2.15).

### 3.16 Disabled behavior
Same as TextInput (§2.16); resize handle hidden when disabled (§3.19).

### 3.17 Read-only behavior
Same background/border resolution as TextInput (§2.17). Resize handle
stays visible and usable when `readOnly` (the user may still want to
resize the box to read more of static content) — resize is only removed
on `disabled` (§3.19), a deliberate distinction from `disabled`'s full
inertness.

### 3.18 Loading behavior
Not applicable — no async-validation use case named for Textarea in the
System doc; do not build one without naming a concrete case first (same
caution System §10 applies to TextInput's own gap).

### 3.19 Validation behavior
Resize direction: `vertical` only, always — never horizontal (width stays
governed by the Field's container per §2.23's rule, unchanged for
Textarea). Overflow once `autoResize` hits `maxHeight`: internal
`overflow-y: auto` scroll, no further growth. `maxLength` pairs with
Field's `counter` exactly as TextInput (§1.19); the same over-limit
`aria-invalid` rule applies. Resize handle (native browser resize grip)
is hidden via `resize: none` when `disabled`, shown otherwise (including
`readOnly`, §3.17).

### 3.20 Keyboard behavior
Standard native multi-line text-editing keys (Enter inserts a newline,
does not submit a form). No custom key handling.

### 3.21 Touch behavior
`md` control height still applies to the *minimum* single-row height so
the first line meets the tap-target rule; growth beyond that via
`autoResize` has no touch-target implication (already-focused content).

### 3.22 Accessibility requirements
Same as TextInput (§2.22), minus the password/clear-specific items (no
suffix occupants exist for Textarea).

### 3.23 Responsive behavior
Full-width by default, same as TextInput (§2.23). No breakpoint-specific
`rows` change — `rows` is chosen per context by the consumer.

### 3.24 Correct usage examples
- `autoResize`, wrapped in Field, label "Welcome message", `optional`,
  counter `{current: 42, max: 160}` — the loyalty AI-message field (System
  §20's canonical example).
- `rows={5}`, no `autoResize`, for a fixed-height admin notes field.

### 3.25 Incorrect usage examples
- Horizontal resize enabled (breaks the container-controlled width rule,
  §2.23).
- A prefix/suffix icon bolted onto a Textarea — not supported, use
  TextInput if a single-line icon-anchored field is actually needed.

### 3.26 Migration targets
`dashboard-shell.css`: `.app-textarea`, `.field-textarea` → `Textarea`,
`default`, evaluate `autoResize` per field (AI-prompt fields are strong
candidates, System §23).

### 3.27 Future extensibility
None named beyond the family's shared Future Extensibility items (System
§21) — Textarea has no control-specific extension named.

---

## 4. Native Select

### 4.1 Purpose
Choose one value from a bounded, named list, hidden until opened.

### 4.2 When to use
A short-to-medium list of known, named options (plan tier, reward type
enum, status filter).

### 4.3 When not to use
A visible small set (2–6) where seeing all options at once matters more
than compactness — that's Radio (§6), not Select (System §3). A long list
needing in-list search — that's the deferred Combobox (§4.19), not Select.

### 4.4 Visual anatomy
Same skeleton as TextInput (System §5); the control region's right edge
carries the native disclosure chevron in place of a suffix slot.

### 4.5 Required elements
A real `<select>`, labeled via Field, with `<option>` children.

### 4.6 Optional elements
A disabled placeholder first option (§4.19).

### 4.7 Public class/API contract
```
Select {
  size:        'sm' | 'md'
  variant:     'default' | 'monospace'
  options:     Array<{ value, label, disabled? }>
  value:       string
  placeholder: string?   // renders as a disabled, selected first <option value="">
  required:    boolean
  disabled:    boolean
  invalid:     boolean   // driven by Field's `error`
  id, ariaDescribedBy: // supplied by Field
}
```
**New in this document — disclosure, not a new addition.** `required`
was already present in the System doc's own Select API (System §6) and is
carried forward unchanged — flagged here only because this document is
the first place its native-`required` mapping and interaction with the
disabled placeholder option are fully resolved (§4.19). Per the required-
semantics audit (§2.19), Select is deliberately **not** left as the only
native control with an explicit `required` prop: equivalent `required`
support is added to TextInput (§2.7) and inherited by Textarea (§3.7) so
the whole native form-control family (TextInput, Textarea, Select) is
consistent.

### 4.8 Sizes
`sm`/`md`, identical height tokens to TextInput (§2.8). No `lg`.

### 4.9 States
`default`, `hover`, `focus`, `disabled`, `error`, `success`. No
`read-only` — native `<select>` has no meaningful readonly mode (the
platform doesn't support it uniformly); a read-only single value is
better represented as static text, not a disabled-look Select.

### 4.10 Typography-token mapping
Same as TextInput (§2.10). `monospace` variant used for `.prop-select`/
`.filter-select`-equivalent technical contexts, unchanged from System §7.

### 4.11 Color-token mapping
Same as TextInput (§2.11), including focus-while-error precedence.

### 4.12 Spacing-token mapping
Same internal padding as TextInput (§2.12); chevron inset
`--qds-space-2` from the right edge, matching a suffix icon's inset.

### 4.13 Border and radius rules
Same as TextInput (§2.13).

### 4.14 Focus behavior
Same as TextInput (§2.14). The native open-dropdown state itself has no
QDS-controlled styling (OS-rendered), same boundary as Accessibility §13
of the System doc.

### 4.15 Hover behavior
Same as TextInput (§2.15).

### 4.16 Disabled behavior
Same as TextInput (§2.16). Individual `<option disabled>` entries
(`options[].disabled`) render with the browser's native disabled-option
styling — not independently styleable, same "native gives free a11y, no
fake dropdown" rule (System §13).

### 4.17 Read-only behavior
Not applicable (§4.9).

### 4.18 Loading behavior
Not applicable — Select's option list is expected to be present
synchronously; a loading state for async-populated options is not named
as a v1 use case. Do not build one speculatively.

### 4.19 Validation behavior
Placeholder option: `<option value="" disabled selected>{placeholder}</
option>`, native `disabled` prevents re-selecting it once the user has
picked a real value. When `required` is set and the placeholder is still
selected at submit-time validation, Field's `error` fires exactly as any
other required-field gap (§1.19) — Select does not self-validate.
Combobox is justified once a real long-option-list need is named (System
§21) — not before.

### 4.20 Keyboard behavior
Native: Space/Enter/Down opens, arrow keys move selection, typing a
letter jumps to matching options. No custom key handling.

### 4.21 Touch behavior
Mobile: native OS picker UI takes over entirely (wheel picker on iOS,
native list on Android) — no QDS-controlled styling applies once opened;
`md` control height still governs the closed/trigger state's tap target.

### 4.22 Accessibility requirements
Never replaced with a fake dropdown for style reasons (System §13,
unchanged) — native `<select>` keyboard/screen-reader support is not
reproducible from scratch to the same standard. `aria-invalid`/
`aria-describedby` wiring identical to TextInput (§2.22).

### 4.23 Responsive behavior
Full-width by default, same as TextInput (§2.23).

### 4.24 Correct usage examples
- Plan-tier picker sourced from the plan enum, wrapped in Field, label
  "Plan tier" (System §20's canonical example).
- A status filter Select, `sm`, in a table toolbar.

### 4.25 Incorrect usage examples
- A custom-styled `<div>`-based dropdown standing in for `<select>`.
- Using Select for a 3-option reward-type choice where all options should
  be visible at once — that's Radio tile (§6), not Select.

### 4.26 Migration targets
`dashboard-shell.css`/page CSS: `.app-select`, `.filter-select`,
`.prop-select`, `.modal-select` → `Select`, `default` or `monospace`
per current font usage (System §23, unchanged).

### 4.27 Future extensibility
Combobox/searchable-select, explicitly deferred (System §21) — the future
Brand→Locations picker is the named candidate trigger.

---

## 5. Checkbox

### 5.1 Purpose
An independent binary choice, or one row's multi-select flag in a list.

### 5.2 When to use
A single yes/no value that is read/submitted (consent, a notification
opt-in), or bulk multi-select in a future Data Grid.

### 5.3 When not to use
An immediate-effect setting (Toggle, System §3, §22). A single choice
among several mutually-exclusive options (Radio, §6).

### 5.4 Visual anatomy
`[box]  label text` — label trails the box, per §5.11's ownership rule
(distinct from Field's normal above-control label placement).

### 5.5 Required elements
A real `<input type="checkbox">`, never a styled `<div>` (System §13).
Its own inline `<label>` wrapping.

### 5.6 Optional elements
`indeterminate`, group-level Field wrapper for a shared helper/error.

### 5.7 Public class/API contract
```
Checkbox {
  checked:       boolean
  indeterminate: boolean   // set via the DOM property, not an HTML attribute
  disabled:      boolean
  error:         boolean   // reflects the parent group's Field error, drives box outline
  required:      boolean   // NEW — see resolution below; scope depends on standalone vs. list usage
  label:         node
  id:            string
}
```
**New in this document — `error: boolean`, not in the System doc's
Checkbox API.** The System doc's Checkbox contract (System §6) had no
`error` prop at all — only Field's own `error` string existed. Rationale:
Checkbox needs a group/control-level *invalid visual state* that Field's
`error` (a message string) cannot drive by itself, because Checkbox's
box-outline color (§5.11) must react to the group being invalid even
though no per-checkbox message renders (§5.19 — only the group carries a
message, individual checkboxes never do). `error` is therefore the boolean
Field derives and pushes down to each Checkbox in the group, mirroring the
exact `error`(Field)→`invalid`(control) relationship System §6 already
established for TextInput/Textarea/Select — Checkbox needed its own
version of that mechanism named explicitly, since it wasn't carried
forward automatically.

**New in this document — `required: boolean`, resolved deterministically
for both usages named in the System doc (System §3: "independent binary
choice, or list-row multi-select"):**
- **Standalone Checkbox** (a single yes/no value, e.g. "I agree to the
  terms"): `required` maps to the native HTML `required` attribute on
  that one `<input type="checkbox">` — the browser's own constraint
  validation requires that specific box be checked. No `aria-required`
  needed beyond what native `required` already communicates to
  assistive tech.
- **Checkbox list/group** (multi-select, e.g. "select at least one
  notification type"): `required` here means "at least one option in the
  list must be checked," which native per-checkbox `required` cannot
  express (native `required` on every checkbox would wrongly demand
  *all* of them be checked). Resolution: `required` is **not** set on
  the individual Checkbox instances in this case — it is expressed once,
  at the group level, as `aria-required="true"` on the Field-supplied
  `role="group"` container (§5.22). Whether at least one is checked is a
  Field-level `error` concern validated at submit time (§5.19), the same
  boundary already drawn for group-level validation generally — Checkbox
  itself never self-validates a group.
- A consumer therefore sets `required` on a standalone Checkbox directly,
  but never on the individual Checkboxes inside a required group — the
  group's Field wrapper carries that requirement instead. This is the
  deterministic rule the Accessibility Matrix (§10.1) reflects.

### 5.8 Sizes
One size only — no `size` prop. The box/glyph uses `--qds-icon-size-md`
(20px) as its diameter — see §13.2, a Foundation-gap-flagged reuse, not a
purpose-built token.

### 5.9 States
`unchecked`, `checked`, `indeterminate`, `disabled`, `error`, plus shared
`hover`/`focus-visible` (System §9, unchanged).

### 5.10 Typography-token mapping
Label text: `--qds-text-body-*` (matches surrounding form body text, not
`--qds-text-label-*` — the Checkbox/Radio inline label is a different role
from Field's structural Label, §5.11).

### 5.11 Color-token mapping
Box border: `--qds-color-border-default` at rest, `--qds-color-brand-
primary` when checked (filled) or on focus, `--qds-color-danger` when
`error`. Checked fill: `--qds-color-brand-primary` background with a
`--qds-color-text-inverse` check glyph. Indeterminate: same fill, a
horizontal dash glyph instead of a check. Disabled: `--qds-color-
disabled` for box border/fill and label text.

### 5.12 Spacing-token mapping
Box-to-label gap: `--qds-space-2`, matching Toggle's existing
`.toggle-label` gap convention (System §8, unchanged).

### 5.13 Border and radius rules
Box: `--qds-radius-sm` (a checkbox is visually smaller than a full
control, `sm` radius reads correctly at 20px vs `md`'s scale on a 44px
control), 1–2px border.

### 5.14 Focus behavior
`--qds-elevation-focus` ring on the box itself on `:focus-visible`, same
focus language as the rest of the family (System §15).

### 5.15 Hover behavior
Border lightens to full `--qds-color-border-default` opacity /
`--qds-color-brand-hover` when already checked — no elevation change.

### 5.16 Disabled behavior
`--qds-color-disabled` box + label, `pointer-events: none`, removed from
tab order via native `disabled`.

### 5.17 Read-only behavior
Not applicable — a checkbox has no native readonly mode; a read-only
boolean is represented as `disabled` with its current value, or as static
text/badge, not a distinct Checkbox state.

### 5.18 Loading behavior
Not applicable — no async-validation use case named.

### 5.19 Validation behavior
Validation is group-level, not per-checkbox, in v1 (System §10's
boundary, applied here): a standalone Checkbox or a Checkbox list is
wrapped in Field for a shared error (e.g. "Select at least one
notification type"); individual checkboxes do not carry their own error
message, only the `error` boolean that drives the box outline (§5.7) when
the group is invalid.

**Required — new in this document (§5.7):** a standalone Checkbox's
`required` is native browser constraint validation (that one box must be
checked). A Checkbox list's "at least one checked" requirement is a
Field-level concern only — no individual Checkbox in a list is given
`required`; the group's Field carries `aria-required` (§5.22) and its
`error` fires at submit time if nothing is checked, following the same
group-level-only rule as the rest of this section.

### 5.20 Keyboard behavior
Space toggles checked state (native). Tab moves between checkboxes in a
list individually (not a roving-tabindex group like Radio, §6.20) — each
checkbox is an independent stop, unlike Radio's single-group-stop
behavior.

### 5.21 Touch behavior
Minimum 44×44px padded hit area around the 20px visual box
(`--qds-touch-target-min`), same pattern as Button icon-only (System §19).

### 5.22 Accessibility requirements
Real `<input type="checkbox">`, `indeterminate` set via the DOM property
only. Label click toggles the input via native `<label>` wrapping. A
Checkbox list wrapped in Field: the group gets `role="group"` with
`aria-labelledby` pointing at Field's label id (§1.22). When a Checkbox
list is `required` (§5.7/§5.19), the group additionally gets
`aria-required="true"` on that same `role="group"` container — a
standalone required Checkbox instead relies on its own native `required`
attribute and needs no `aria-required` (native semantics already cover
it).

### 5.23 Responsive behavior
None — fixed glyph size at every viewport, matches Badge's precedent of
no breakpoint scaling for small fixed-size elements.

### 5.24 Correct usage examples
- A standalone Checkbox wrapped in Field, label "Notify me when a
  customer completes their card", with a helper line, no error expected
  in normal use (System §20's canonical example).

### 5.25 Incorrect usage examples
- A styled `<div>` toggling a class instead of a real
  `<input type="checkbox">`.
- Using Checkbox for an immediate-effect setting that takes effect the
  instant it's clicked — that's Toggle.
- Setting the `indeterminate` HTML attribute directly (no such attribute
  exists; must go through the DOM property).

### 5.26 Migration targets
None today (System §23, unchanged) — first real implementations land
wherever a future bulk-select Data Grid or consent confirmation is built.

### 5.27 Future extensibility
None named beyond the shared family items (System §21).

---

## 6. Radio

### 6.1 Purpose
One choice from a small *visible* set (2–6).

### 6.2 When to use
A bounded, small set of mutually-exclusive options where seeing all
choices at once aids the decision (reward type, size, color preset).

### 6.3 When not to use
More than ~6 options (use Select, §4). A single yes/no (use Checkbox,
§5, or Toggle for immediate-effect).

### 6.4 Visual anatomy
`dot`: `(●)  label text`, inline list. `tile`: a Surface-composed card per
option, label doubling as the tile's own clickable region (§6.11, §9).

### 6.5 Required elements
Real `<input type="radio" name="...">` elements sharing one `name` per
group (System §13) — never reproduced with generic `<div>`s.

### 6.6 Optional elements
`preview` (swatch/icon node, `tile` variant only).

### 6.7 Public class/API contract
```
Radio {
  options:  Array<{ value, label, preview?, disabled? }>
  value:    string
  variant:  'dot' | 'tile'
  disabled: boolean
  required: boolean   // NEW — group-level only, see resolution below
  name:     string
}
```
**New in this document — `options[].disabled`, not in the System doc's
Radio API.** The System doc's Radio contract (System §6) listed options
as `Array<{ value, label, preview? }>` — no per-option `disabled`.
Rationale: individual Radio options may legitimately be unavailable while
the group as a whole stays enabled (e.g. a reward-type tile that's
temporarily unavailable for the current plan tier, while the other reward
types remain selectable) — this is a distinct state from the group-level
`disabled` (§6.7, unchanged from System §6), which disables every option
at once. `options[].disabled` renders the native `disabled` attribute on
that option's own `<input type="radio">` only; it does not affect
`aria-required`/group validity (§6.19) or any other option in the array.

**New in this document — `required: boolean`, group-level only (Radio has
no standalone-vs-group ambiguity the way Checkbox does, §5.7 — a Radio
group is always a group).** Resolution: `required` renders the native
`required` attribute on **every** `<input type="radio" name="...">` in
the group, not only the first — HTML's constraint validation only
strictly needs `required` on one radio in a shared-`name` group to
enforce "at least one selected," but setting it on all of them avoids a
correctness dependency on which option happens to render first (e.g. if
`options` is reordered or filtered). `required` additionally sets
`aria-required="true"` on the group's `role="radiogroup"` container
(§6.22) — redundant with native semantics for browsers/AT that already
announce required-radio-group correctly, but named explicitly because
required-radio-group announcement support varies across screen readers,
and an explicit `aria-required` costs nothing to include.

### 6.8 Sizes
One size only for `dot` — the dot uses `--qds-icon-size-md` (20px)
diameter, same reuse/gap noted for Checkbox (§5.8, §13.2). `tile` sizing
is governed by the composed Surface's `padding` prop (`sm` recommended
for grid-of-tiles contexts, §9).

### 6.9 States
`unselected`, `selected`, `disabled`, plus shared `hover`/`focus-visible`
(System §9).

### 6.10 Typography-token mapping
`dot` label: `--qds-text-body-*` (same role as Checkbox's inline label,
§5.10). `tile` label: whichever `--qds-surface__title`-equivalent role the
composed Surface uses at its chosen size (Surface owns this typography,
Radio does not override it — §9).

### 6.11 Color-token mapping
`dot`: unselected ring `--qds-color-border-default`, selected ring +
fill-dot `--qds-color-brand-primary`, disabled `--qds-color-disabled`.
`tile`: entirely inherited from Surface's own `selected`/`interactive`
color tokens (`--qds-color-selected-surface`, `--qds-color-border-
default`→brand on selected) — Radio does not define a second color
system for tile, it only sets Surface's `selected` prop from `isChecked`
(System §17, unchanged).

### 6.12 Spacing-token mapping
`dot`: dot-to-label gap `--qds-space-2` (System §8, unchanged, matches
Checkbox). `tile`: whatever internal padding the composed Surface's
`padding` prop yields (§9) — Radio does not add its own padding on top.

### 6.13 Border and radius rules
`dot`: circular (`--qds-radius-full`), 1–2px ring border. `tile`:
inherits Surface's `--qds-radius-lg` by composition — not a second radius
decision (System §24, unchanged).

### 6.14 Focus behavior
`dot`: `--qds-elevation-focus` ring on the dot itself. `tile`: focus ring
applies to the tile (the Surface root), not a separately-visible dot,
since the native radio input is visually hidden inside it (System §15,
unchanged) — same pattern Surface already anticipated for a
Surface-wrapping interactive child.

### 6.15 Hover behavior
`dot`: ring lightens toward `--qds-color-brand-hover`. `tile`: whatever
hover treatment Surface's `interactive` state already defines
(`--qds-hover-lift`, no elevation change) — Radio does not add a second
hover treatment on top.

### 6.16 Disabled behavior
`dot`: `--qds-color-disabled` ring/label, `pointer-events: none`. `tile`:
Surface's own `disabled` treatment (`--qds-surface--disabled`) applies —
Radio sets it, does not reimplement it.

### 6.17 Read-only behavior
Not applicable — no native readonly mode for radio groups; a read-only
single choice is represented as static text, not a disabled-look Radio
group.

### 6.18 Loading behavior
Not applicable — no async-validation use case named.

### 6.19 Validation behavior
Group-level only, same boundary as Checkbox (§5.19): a Radio group
wrapped in Field gets a shared `error` if nothing is selected at submit.
Individual options carry no per-option error state. **Required — new in
this document (§6.7):** `required` sets native `required` on every option
in the group plus `aria-required` on the `radiogroup` container (§6.22);
if nothing is selected at submit, Field's `error` fires exactly as any
other required-field gap (§1.19) — same mechanism as Checkbox (§5.19),
Select (§4.19), and TextInput/Textarea (§2.19).

### 6.20 Keyboard behavior
Arrow keys move selection within the group; Tab moves into or out of the
group as **one** stop (native `radiogroup` behavior, free once real
`<input type="radio" name="...">` elements back the group — System §14,
unchanged). This is the reason real radio semantics are mandatory rather
than a nice-to-have: hand-rolling arrow-key roving-tabindex behavior on
`<div>`s would have to reimplement this by hand.

### 6.21 Touch behavior
`dot`: 44×44px padded hit area around the 20px dot, same as Checkbox
(§5.21). `tile`: the whole tile is the hit target, already well above
44×44 by virtue of being a Surface-sized card.

### 6.22 Accessibility requirements
Both variants: real `role="radiogroup"` (native, from grouping
`<input type="radio">` with a shared `name`) / `role="radio"` semantics
per option (System §13). Field's group label becomes the `radiogroup`'s
`aria-labelledby` target (§1.22). `tile`: the native radio input is
visually hidden and the tile itself functions as its `<label>` — exactly
the Surface §14/§16-anticipated pattern (System §13, unchanged); Radio
owns the `radiogroup`/`aria-checked` semantics, Surface only renders the
visual `selected` state underneath. When `required` is set (§6.7/§6.19),
the `radiogroup` additionally carries `aria-required="true"`, in both
`dot` and `tile` variants.

### 6.23 Responsive behavior
`dot`: inline list, wraps naturally with text flow. `tile`: options wrap
into a grid below the container's available width, using whatever grid
layout primitive the page already provides (`.template-grid`/`.dl-sizes`
precedent, System §19) — Radio does not own column-count, same boundary
Surface §29 already draws.

### 6.24 Correct usage examples
- `tile` variant Radio group wrapped in Field, label "Reward type", each
  tile composing Surface with `selected` bound to the current value
  (System §20's canonical example).
- `dot` variant for a short inline "Sort by" choice.

### 6.25 Incorrect usage examples
- Clickable `<div>`s with a manually-toggled "selected" class standing in
  for real radio semantics (the exact pattern this component exists to
  replace, System §13).
- A `tile` Radio used for free-form navigation rather than a selectable
  value — that's a Surface `interactive` card instead (System §17,
  §23's migration note).

### 6.26 Migration targets
`loyalty-setup.html`: `.stamp-opt`, `.cp` → `Radio`, `tile`.
`manage-page.css`/design studio: `.size-opt` → `Radio`, `tile`. Editor:
`.template-card.tc-active` → `Radio`, `tile`, *only* where the tile
represents one exclusive value — a per-instance judgment call at
migration time (System §23, unchanged).

### 6.27 Future extensibility
None named beyond the shared family items (System §21).

---

## 7. Search

### 7.1 Purpose
Filter-as-you-type over a list/table, built on TextInput rather than a
separate visual system (System §16, confirmed unchanged).

### 7.2 When to use
Any client- or server-side filter of a visible list/table by free text.

### 7.3 When not to use
A value that is submitted rather than continuously filtered (use plain
TextInput). A field whose result set needs its own live-region
announcement beyond "filter the list" — that announcement is owned by the
consuming list/table, not Search itself (System §13, §22).

### 7.4 Visual anatomy
Fixed leading search-icon prefix (not consumer-configurable, §7.7) +
TextInput's control anatomy + one suffix occupant (§7.19's priority
order).

### 7.5 Required elements
Everything TextInput requires (§2.5), plus the fixed leading icon.

### 7.6 Optional elements
`clearable` (inherited from TextInput, §2.7), `onSubmit` (switches Search
into submitted-search mode, §7.19).

### 7.7 Public class/API contract
```
Search extends TextInput {
  onDebouncedChange: function?   // fires after debounceMs of no typing
  debounceMs:        number      // default 300ms
  clearable:         boolean     // inherited from TextInput, defaults true for Search
  onSubmit:          function?   // presence switches to submitted-search mode, see §7.19
}
```
**Confirmed, not new**: Search's leading icon is a fixed prefix baked into
the component, not the consumer-settable `prefix` slot it inherits from
TextInput — the same slot-reservation logic as TextInput's password-
reveal toggle reserving the suffix (§2.19). A Search instance cannot
accept a custom `prefix`.

### 7.8 Sizes
Same as TextInput (§2.8) — `sm`/`md`, no `lg`.

### 7.9 States
Same as TextInput (§2.9), plus a debounce-pending micro-state (no visual
change — see §7.18, distinct from `loading`).

### 7.10 Typography-token mapping
Same as TextInput (§2.10).

### 7.11 Color-token mapping
Same as TextInput (§2.11). Leading icon: `--qds-color-text-muted` at
rest, `--qds-color-text-secondary` on focus (subtle emphasis, matching
how a focused field's border also darkens toward brand).

### 7.12 Spacing-token mapping
Same as TextInput (§2.12); leading icon inset `--qds-space-2` from the
left edge, matching a prefix icon's inset exactly (Search's icon *is* a
prefix, just not a swappable one).

### 7.13 Border and radius rules
Same as TextInput (§2.13).

### 7.14 Focus behavior
Same as TextInput (§2.14).

### 7.15 Hover behavior
Same as TextInput (§2.15).

### 7.16 Disabled behavior
Same as TextInput (§2.16).

### 7.17 Read-only behavior
Not applicable in practice — a read-only Search has no meaningful job (it
can't filter anything if it can't be typed into); not a supported
combination.

### 7.18 Loading behavior
Async filter results (server-side search) render TextInput's loading
spinner (§2.18) in the suffix position, taking priority over `clearable`
per §7.19's ordering — same suffix-priority list as TextInput, Search
does not invent a second one. The debounce-pending window itself (before
`onDebouncedChange` fires) has **no** visual loading state — only an
actual in-flight async request shows the spinner; typing alone never
does, to avoid a spinner flashing on every keystroke.

### 7.19 Validation behavior
Not applicable in the error/success sense (System §10's boundary — Search
has no validity concept, only a query value). What *is* resolved here,
**new in this document**:
- **Suffix priority for Search specifically**: `loading` (async request
  in flight) > `clearable` "×" (non-empty value, request settled). Search
  reuses TextInput's general priority list (§2.19) with password/custom-
  suffix occupants never applying (Search has no `type="password"` and no
  consumer `suffix`).
- **Filter-as-you-type vs. submitted search, fully resolved**: a Search
  instance operates in exactly one of two modes, selected by whether
  `onSubmit` is provided:
  - **Filter-as-you-type mode** (`onSubmit` absent): `onDebouncedChange`
    fires `debounceMs` after the last keystroke; there is no separate
    submit action.
  - **Submitted-search mode** (`onSubmit` provided): `onDebouncedChange`
    does not fire at all; Enter (while focused) or an explicit composed
    submit Button (§8) fires `onSubmit` instead. The two firing
    mechanisms are mutually exclusive per instance, not combinable.
- The control's own displayed value always updates synchronously on every
  keystroke regardless of mode — only the *callback* is debounced or
  submit-gated, never the visible text (avoids the common bug of
  debouncing the field's own rendering).
- Empty query: `onDebouncedChange`/`onSubmit` still fires with an empty
  string on clear — the consuming list/table decides what "no query"
  means (show-all, by System §13/§22's boundary), Search does not assume.

### 7.20 Keyboard behavior
Standard TextInput text-editing keys, plus: Escape clears the field when
`clearable` is set and the field has focus (System §14, unchanged) — new
behavior with no current precedent in `.table-search`/`.perf-search`,
adopted for platform-conventional search-box behavior. In submitted-
search mode, Enter fires `onSubmit` (§7.19).

### 7.21 Touch behavior
Same as TextInput (§2.21); the leading icon has no tap target of its own
(decorative, non-interactive) — only the trailing clear/loading occupant
gets a padded hit area.

### 7.22 Accessibility requirements
`role="searchbox"` (or native `type="search"`) per System §13, unchanged.
A results-count/"no results" outcome is announced via a **separate**
`aria-live="polite"` region owned by the consuming list/table, not by
Search (System §13, §22 — Search's contract stops at "filter the list").
Leading icon: `aria-hidden="true"` (decorative, the field's accessible
name comes from Field's label or a placeholder-as-label fallback if used
standalone — standalone-outside-Field usage carries the same caveat as
§2.22 elsewhere in this family, System §22).

### 7.23 Responsive behavior
Full-width by default (§2.23), same fixed-width-becomes-a-prop-override
rule extended explicitly to Search (System §19, which the original
Specifications document didn't cover since Search was out of that
document's five-component scope).

### 7.24 Correct usage examples
- `clearable`, filter-as-you-type mode, filtering the QR performance
  table — converges `.table-search`/`.perf-search` (System §20's
  canonical example).
- Submitted-search mode with a composed `primary` submit Button, for a
  search that triggers a real page navigation/query rather than an
  in-place filter.

### 7.25 Incorrect usage examples
- Providing both `onDebouncedChange` and `onSubmit` and expecting both to
  fire — unsupported, pick one mode (§7.19).
- A custom `prefix` icon passed to Search expecting it to replace the
  fixed search icon — not supported (§7.7).

### 7.26 Migration targets
`dashboard-shell.css`/`analytics-page.css`: `.table-search`,
`.perf-search` → `Search`, converging the duplicated rule set (System
§23, unchanged).

### 7.27 Future extensibility
None named beyond the shared family items (System §21) and the
suffix-priority ordering already resolved above.

---

## 8. Button composition

Applies across the whole family — not a per-component section, per the
sprint brief's explicit separate heading.

- **Internal icon controls** (clear "×", password-reveal toggle, a
  Search's built-in leading icon): none of these are full `qds-btn`
  instances. They follow Button's 44×44 touch-target rule (§2.21, §5.21,
  §7.21) and reuse Button's `ghost`, icon-only visual treatment
  (transparent at rest, `--qds-color-surface-2` fill on hover) but are
  implemented as internal elements of their owning control (e.g.
  `.qds-input__clear`, §11), not as nested `<button class="qds-btn">`
  elements — a full Button instance carries variant/size props and a
  `.qds-btn__content` wrapper this family's internal affordances don't
  need. They are still real `<button type="button">` elements for
  keyboard/AT purposes (§2.22), just not styled through the Button
  component's public class API.
- **Async-validation spinner** (§2.18): reuses Button's spinner *token
  set* (`--qds-icon-size-sm`, `--qds-duration-spinner`, `currentColor`
  border) but is rendered as the owning control's own internal spinner
  element, not a Button in a loading state — there is no button being
  clicked here.
- **Form-level actions** (Save/Cancel/Submit below a group of Fields, or
  Search's optional submit Button in submitted-search mode, §7.19): these
  ARE standard `qds-btn` instances, unmodified — `primary` for the
  recommended next step, `secondary`/`ghost` for Cancel/Reset, per
  Button's own "one primary per view" rule (Specifications §1). Input
  passes no styling overrides into Button here, mirroring Surface's
  identical rule for its own Header/Footer action slots (System §18,
  unchanged).
- **Distinction, stated once**: an internal icon control is *part of* an
  Input-family control's own anatomy (it has no independent identity
  outside the field it lives in); a form-level action Button is a
  *sibling* of the Field(s) it acts on, never nested inside one.

---

## 9. Surface composition

Applies across the whole family — not a per-component section.

- A Field (or several, grouped) sits inside a Surface's Body as a plain
  child (System §17, unchanged) — Surface supplies the bordered/padded
  frame, Field supplies the fields inside it. Neither owns the other's
  concern: Surface never dictates field spacing (`--qds-space-4` between
  Fields is a FieldGroup-level concern, §1.12), Field never dictates the
  surrounding panel's border/radius/padding.
- **What Surface owns**: the panel's own border, radius, background,
  elevation, header/footer action slots, and (for `tile` Radio) the
  `selected`/`interactive` visual states and hover treatment.
- **What Field/Input owns**: the label/description/helper/error/counter
  contract, the control's own border/background/typography, and (for
  `tile` Radio) the `radiogroup`/`aria-checked` semantics layered on top
  of Surface's visuals.
- **`tile` Radio is the one point of direct composition beyond "renders
  inside Body"**: a tile *uses* Surface as its visual shell and layers
  real radio semantics on top (§6.22) — Radio wraps Surface with
  `interactive: true`, `selected: <isChecked>`, and a visually-hidden
  native radio input driving that `selected` state, precisely the
  relationship Surface already reserved for this (System §17, unchanged).
- A `filled` Surface (nested, one level) is the recommended wrapper when
  a sub-group of Fields needs visual separation within a larger form
  panel (e.g. a nested "Advanced" fields block) — Field has no
  nesting-depth concern of its own; it inherits whatever Surface it sits
  inside (System §17, unchanged).
- **Form-section layout, error-summary placement — new in this
  document, not addressed in the System doc**: a Surface's Body holding
  multiple Fields stacks them with the `--qds-space-4` FieldGroup gap
  (§1.12); a page-level or submit-time error summary (e.g. "3 fields need
  attention"), if used, renders as the *first* child of that Body, above
  the first Field, using Field's own `error`-message color/typography
  role (§1.11) so it reads as one visual language rather than a second
  alert style — not specified further here since the summary itself is a
  FieldGroup/Form-level concern (§1.27), only its placement relative to
  Surface's Body is resolved.

---

## 10. Accessibility matrix

Two tables for width; read as one matrix. "—" means not applicable to
that control.

### 10.1 Identity and state

| Component | Semantic element | Accessible name | Label association | Required state | Invalid state |
|---|---|---|---|---|---|
| Field | — (layout/ARIA only) | — | generates `for`/`id` | renders indicator | sets `aria-invalid` on control |
| TextInput | `<input>` | Field's `<label>` | `<label for>` | `required` prop → native `required` (§2.7/§2.19) | `aria-invalid="true"` |
| Textarea | `<textarea>` | Field's `<label>` | `<label for>` | `required` inherited from TextInput → native `required` (§3.7) | `aria-invalid="true"` |
| Select | `<select>` | Field's `<label>` | `<label for>` | `required` prop → native `required` (§4.7/§4.19) | `aria-invalid="true"` |
| Checkbox | `<input type="checkbox">` | own inline `<label>` | native `<label>` wrap | `required` prop: standalone → native `required` on that input; list → `aria-required` on the group container, never on individual options (§5.7/§5.19/§5.22) | `error` prop → visual outline; group `aria-invalid` via Field |
| Radio (dot) | `<input type="radio">` × N | own inline `<label>` per option; group via Field | native `<label>` wrap + `radiogroup` `aria-labelledby` | `required` prop → native `required` on every option + `aria-required` on `radiogroup` (§6.7/§6.19/§6.22); `options[].disabled` → native `disabled` on that option only, independent of group `disabled`/`required` | group `aria-invalid` via Field |
| Radio (tile) | `<input type="radio">` (visually hidden) × N | tile itself is the `<label>` | tile = native `<label>` wrap + `radiogroup` `aria-labelledby` | same as Radio (dot) above | group `aria-invalid` via Field |
| Search | `<input type="search">`/`role="searchbox"` | Field's `<label>` | `<label for>` | `required` inherited from TextInput; rarely used on a filter field | not applicable (§7.19) |

### 10.2 Interaction and lifecycle

| Component | Described-by relationships | Keyboard interaction | Focus handling | Disabled semantics | Read-only semantics | Loading semantics | Live-region behavior |
|---|---|---|---|---|---|---|---|
| Field | owns joined `aria-describedby` (§1.22) | — | — | pass-through | pass-through | pass-through | — |
| TextInput | via Field | native text editing | `:focus-visible` ring | native `disabled` | native `readonly` | suffix spinner, `aria-busy` not applicable to a text field (state conveyed visually + via eventual `error`/`success`) | none owned here |
| Textarea | via Field | native multi-line editing | `:focus-visible` ring | native `disabled` | native `readonly` | — | none |
| Select | via Field | native select-picker keys | `:focus-visible` ring | native `disabled` | — (§4.9) | — | none |
| Checkbox | via Field, group-level | Space toggles | `:focus-visible` ring on box | native `disabled` | — (§5.17) | — | none |
| Radio (dot) | via Field, group-level | arrows move selection, Tab = one group stop | `:focus-visible` ring on dot | native `disabled` per option | — | — | none |
| Radio (tile) | via Field, group-level | arrows move selection, Tab = one group stop | `:focus-visible` ring on tile (Surface root) | `--qds-surface--disabled` + native `disabled` on hidden input | — | — | none |
| Search | via Field | native text editing + Escape-clears | `:focus-visible` ring | native `disabled` | not supported (§7.17) | suffix spinner during async fetch | owned by the **consuming list/table**, not Search (§7.22) |

No screen-reader validation has been performed against this matrix — it
states the intended contract only, per the sprint brief's explicit
instruction not to claim verification that hasn't happened.

---

## 11. Implementation contract — proposed CSS class structure

Not implemented. Naming model matches the existing convention already in
`components/button.css`/`components/surface.css`: `.qds-{block}`,
`.qds-{block}--{modifier}`, `.qds-{block}__{element}`. Only classes with a
named, genuine consumer are listed — no speculative class was added.

### 11.1 Public root classes
`.qds-field`, `.qds-input`, `.qds-textarea`, `.qds-select`,
`.qds-checkbox`, `.qds-radio-group`, `.qds-radio`, `.qds-search`.

`.qds-search` composes `.qds-input` on the same root element (Search
renders `class="qds-input qds-search"`, consistent with "Search composes
TextInput's control anatomy, does not duplicate it," System §16) rather
than duplicating TextInput's rules under a second block name.

`.qds-radio` with the `--tile` modifier (§11.2) composes the relevant
`.qds-surface`/`.qds-surface--*` classes directly on the same element —
`class="qds-radio qds-radio--tile qds-surface qds-surface--interactive"`
— a deliberate dual-block composition (System §17), not a new visual
system reimplementing Surface's chrome.

### 11.2 State modifiers
- `.qds-field--error`, `.qds-field--success`, `.qds-field--group` (group-
  label mode for a wrapped Checkbox list / Radio group, §1.7).
- `.qds-input--sm` / `--md`, `.qds-input--monospace`, `.qds-input--error`,
  `.qds-input--success`, `.qds-input--disabled`, `.qds-input--readonly`,
  `.qds-input--loading`.
- `.qds-textarea--sm` / `--md`, `.qds-textarea--monospace`,
  `.qds-textarea--error`, `.qds-textarea--success`,
  `.qds-textarea--disabled`, `.qds-textarea--readonly`,
  `.qds-textarea--autoresize`.
- `.qds-select--sm` / `--md`, `.qds-select--monospace`,
  `.qds-select--error`, `.qds-select--success`, `.qds-select--disabled`.
- `.qds-checkbox--checked`, `.qds-checkbox--indeterminate`,
  `.qds-checkbox--disabled`, `.qds-checkbox--error`.
- `.qds-radio--selected`, `.qds-radio--disabled`, `.qds-radio--tile`
  (variant selector, not strictly a "state" but grouped here since it's
  the only variant modifier in this family beyond `monospace`).
- `.qds-search--loading` (suffix spinner active, §7.18).

### 11.3 Internal elements
- `.qds-field__label`, `.qds-field__required`, `.qds-field__optional`,
  `.qds-field__description`, `.qds-field__message`,
  `.qds-field__counter`.
- `.qds-input__control` (the real `<input>`), `.qds-input__prefix`,
  `.qds-input__suffix`, `.qds-input__clear`, `.qds-input__reveal`,
  `.qds-input__spinner`.
- `.qds-textarea__control`.
- `.qds-select__control` (the real `<select>`), `.qds-select__chevron`.
- `.qds-checkbox__control` (the real `<input>`), `.qds-checkbox__box`,
  `.qds-checkbox__label`.
- `.qds-radio__control` (the real `<input>`), `.qds-radio__dot` (`dot`
  variant only), `.qds-radio__label`.
- `.qds-search__icon` (fixed leading icon). `.qds-search` reuses
  `.qds-input__clear`/`.qds-input__spinner` rather than duplicating them
  (§11.1).

`.qds-field__message` is a single element whose color is driven by
whichever of {error, success, helper} is active via the parent
`.qds-field--error`/`--success` modifier (§11.2) — not three separate
element classes, since only one ever renders at a time (§1.19).

### 11.4 Playground-only helpers
Matches the existing `.qds-pg-force-*` convention already present in
`button.css`/`surface.css` (force-rendering a state for visual QA without
real interaction; never used on production pages):
`.qds-pg-force-hover`, `.qds-pg-force-focus`, `.qds-pg-force-error`,
`.qds-pg-force-success`, `.qds-pg-force-disabled`,
`.qds-pg-force-checked`, `.qds-pg-force-loading`.

---

## 12. Migration plan

Recommended order, per the sprint brief's requested sequence:

1. **Shared/basic text fields** — `dashboard-shell.css`: `.app-input`,
   `.field-input`; Editor: `.prop-input`, `.tb-file-name`; `styles.css`:
   `#urlInput`; `dashboard-shell.css`: `.app-label`, `.field-lbl` (Field's
   built-in label closes the `for`/`id` gap for every text field migrated
   in this step, §1.26).
2. **Textarea** — `dashboard-shell.css`: `.app-textarea`,
   `.field-textarea`.
3. **Native select** — `dashboard-shell.css`/page CSS: `.app-select`,
   `.filter-select`, `.prop-select`, `.modal-select`.
4. **Search** — `dashboard-shell.css`/`analytics-page.css`:
   `.table-search`, `.perf-search`.
5. **Checkbox** — none today; first real implementation lands wherever a
   future bulk-select Data Grid or consent confirmation is built (no
   existing class to retire).
6. **Radio (dot)** — no existing dot-style precedent named in the catalog
   audit; first real implementation lands with the first small
   mutually-exclusive inline choice built (no existing class to retire).
7. **Radio (tile)** — `loyalty-setup.html`: `.stamp-opt`, `.cp`;
   `manage-page.css`/design studio: `.size-opt`; Editor:
   `.template-card.tc-active` (per-instance judgment call, §6.26).

**Explicitly not migrating in this pass** (System §23, unchanged):
`.toggle-switch`/`.toggle-slider` (stays Toggle, out of scope);
`qr-panel.html`'s form controls (orphaned-page carve-out, migrates as a
whole page later).

Steps 1–4 have real current classes to retire; steps 5–6 are net-new
builds with no current implementation to converge, sequenced last because
they have no urgency driven by an existing inconsistency — step 7 (tile)
comes after dot (6) since tile additionally requires Surface composition
to exist and be stable first.

---

## 13. Foundation token audit

Every token referenced above was checked directly against
`qds/foundation/{spacing,radius,typography,colors,elevation,motion,
breakpoints}.css` while writing this document — not assumed from the
System document's own token list. **No new Foundation token is required
to unblock this specification.** Two items below are flagged as reuse of
an existing token for a purpose it wasn't originally named for; neither
blocks implementation, both are named so a future token can be promoted
deliberately rather than the reuse going unnoticed.

| # | Gap | Class | Why it's needed | Smallest safe resolution | Blocks implementation? |
|---|---|---|---|---|---|
| 13.1 | Read-only background/visual distinction from disabled | Low | Textarea/TextInput/Search all define a `read-only` state (System §9) but no dedicated token distinguishes it from `default` | No new token: readonly reuses `--qds-color-surface-2` (default background) and `--qds-color-border-default`, differing only in `cursor`/hover/focus behavior (§2.17) — a behavioral, not chromatic, distinction | No |
| 13.2 | Checkbox/Radio(dot) glyph size | Medium | Neither `--qds-control-height-*` (sized for text-field-shaped controls) nor a dedicated glyph-size token exists for a checkbox box or radio dot | Reuse `--qds-icon-size-md` (20px) as the glyph diameter (§5.8, §6.8) — visually consistent with a leading icon in an `md` text control. Recommend promoting to a dedicated `--qds-control-size-checkbox`/`--qds-control-size-radio` token once Checkbox/Radio actually ship, rather than inventing one speculatively now | No — resolved by reuse, named for future promotion |
| 13.3 | Async-validation spinner-in-suffix visual spec | Low | Carried forward from Specifications §3 / System §10's own flagged, still-unresolved gap | No new token: reuse Button's spinner token set at `--qds-icon-size-sm` (§2.18, §8) — this document additionally pins the exact icon-size token to use, which the System doc left unspecified | No |
| 13.4 | Numeric defaults for Textarea `rows`/`maxHeight` | Low | Not a token gap — a product-decision default, not a Foundation value | Named directly in this document (§3.8: `rows: 3`, `maxHeight: 320px`), no token involved | No |

All other categories named in the sprint brief — error border, success
border, placeholder text, control heights, icon sizes, validation text,
focus ring, disabled opacity, field spacing — resolve directly against
existing tokens with no gap:
`--qds-color-danger`/`--qds-color-success` (borders),
`--qds-color-text-muted` (placeholder), `--qds-control-height-sm`/`-md`
(control heights), `--qds-icon-size-sm`/`-md` (icon sizes),
`--qds-text-caption-*` (validation text), `--qds-elevation-focus` (focus
ring), `--qds-space-1`–`-4` (field spacing). "Disabled opacity"
specifically resolves via the existing flat `--qds-color-disabled` token
(already an rgba value, not a multiplier applied to another color) —
consistent with how Button and the original Input primitive already
handle disabled, so no separate opacity token is needed (§2.16, §5.16).

---

## 14. Validation

- Every v1 component (Field, TextInput, Textarea, Select, Checkbox,
  Radio, Search) has a complete 27-point contract (§1–§7).
- Architecture and specification agree, with one inconsistency in the
  source architecture resolved and flagged: `clearable` relocated from
  Search's API to TextInput's, since `Search extends TextInput` required
  TextInput to own what it extends (§2.7).
- No out-of-scope control was added — Toggle, Combobox, CopyField, Number
  Input, date picker, file uploader, rich text editor, and address
  autocomplete remain explicitly out of scope (front matter, unchanged
  from System §3, §22).
- Public API is internally consistent across all seven controls, including
  the newly-resolved suffix-occupancy priority (§2.19) applied uniformly
  to TextInput and Search.
- **Sprint 6B.1 alignment pass — required semantics fully resolved and
  deterministic for every control:** `required` now exists on TextInput
  (§2.7, new), is inherited unchanged by Textarea (§3.7), was already
  present on Select (§4.7, now disclosed) and is added to Checkbox (§5.7)
  and Radio (§6.7) with control-specific native/ARIA mappings — no native
  form control in the family is missing an explicit `required` contract,
  and Select is no longer the only one that has it.
- Every API addition beyond the System doc is now explicitly marked "New
  in this document" with rationale, or was confirmed as a pre-existing,
  disclosed carry-forward: TextInput's `type`/`autoComplete`/`inputMode`/
  `loading`/`required` (§2.7/§2.19), Select's `required` (§4.7), Checkbox's
  `error` and `required` (§5.7), and Radio's `options[].disabled` and
  `required` (§6.7). No necessary native HTML pass-through was removed to
  avoid documenting it.
- The Accessibility Matrix (§10.1) required-state column now names the
  exact prop and native/ARIA mechanism per control, matching the public
  API sections above word-for-word rather than describing an unnamed
  behavior.
- Accessibility behavior is explicit for every component, consolidated in
  the two-part matrix (§10) — no screen-reader validation is claimed,
  only the intended contract.
- Token gaps are identified (§13), none blocking, two flagged for future
  dedicated-token promotion rather than silently reused forever.
- Migration targets are mapped for every component with an existing class
  to retire, in the requested order (§12).
- Implemented in commit `513b6e9` (`feat: implement QDS Input components`):
  `frontend/public/qds/components/input.css`, `frontend/public/qds/qds.css`,
  and `frontend/public/qds/playground.{css,html}`.

---

*Founder approved. QDS Input Specifications v1 implemented in commit
513b6e9.*
