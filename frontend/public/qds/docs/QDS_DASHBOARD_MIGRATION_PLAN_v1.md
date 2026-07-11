# QDS Dashboard Migration Plan v1

Status: DRAFT — awaiting founder approval. Analysis only. No production file was
modified to produce this document.

Scope: `frontend/public/dashboard.html` + `frontend/public/dashboard-shell.css`,
against `frontend/public/qds/components/{button,surface,input}.css` and their specs.

---

## 1. Executive Summary

Dashboard.html is a single 2000-line file: static shell (sidebar, header, KPI
row, Smart QR grid) plus three large inline-scripted sections
(`#section-subscribers`, `#section-campaigns`, `#section-loyalty`) that are
hidden/shown via `style.display` toggles, not routed. Two of those three
sections (Subscribers, Campaigns) use their own scoped `<style>` blocks with a
**light theme** (white cards) that is visually inconsistent with the dark
dashboard shell. The Loyalty section and most of its child cards are built
entirely as JS string-concatenated `innerHTML` with **inline `style=""`
attributes** — it uses no shared CSS classes at all and is a de facto fourth
design system.

`styles.css` is **not linked from `dashboard.html`** — only `dashboard-shell.css`
and `onboarding.css` are. It is out of scope for this migration (the sprint
brief listed it as a candidate source; confirmed not applicable here).

QDS Button, Surface, and Input are all CSS-only — no QDS JS component exists
for any of the three (confirmed in each component file's header comment:
`button.css` "Built for a real `<button>`/`<a>` element only", `surface.css`
"No JS component exists for Surface", `input.css` "no Input-family control in
this file requires JavaScript to render any of its states"). This is
favorable for migration: state is driven by native pseudo-classes, `:has()`,
and a small, fixed set of modifier classes — not a runtime.

The dominant migration risk is not CSS collision, it's **two Dashboard-owned
JS systems whose contracts assume today's flat DOM**:

1. The `data-i18n` translation system (`applyLang()`, dashboard.html:1827-1846)
   does `el.textContent = t[key]` on the element carrying `data-i18n`. QDS
   Button's icon/loading/spinner variants require child `<span>` structure
   (`.qds-btn__content`, `.qds-btn__icon`, `.qds-btn__spinner`). Any button
   that keeps `data-i18n` on the `<button>` root after migration will have its
   icon/spinner markup silently wiped on every language toggle.
2. Section-switching (`showSection()`, dashboard.html:1940-1988) and the
   sidebar/bottom-nav active-state logic depend on exact `#id` and
   `.sb-item`/`.bn-item`/`.dash-section` class names via
   `getElementById`/`querySelectorAll`. None of these are candidates for this
   sprint's migration (they're not Button/Surface/Input), but QDS Button
   markup must nest *inside* the existing `.sb-item`/`.bn-item` structure, not
   replace it, or navigation breaks.

Recommended proof-of-concept: the 4 static **KPI cards** (dashboard.html:266-271)
— see §10.

---

## 2. Dashboard Inventory

| Region | Lines | Theme | Notes |
|---|---|---|---|
| Sidebar (`#sidebar`) | 202-242 | dark | Static markup, always rendered |
| Top banners (claim/demo-upgrade) | 14-201 | dark | Hidden by default, JS-shown |
| Main dashboard (`#main-content` / `.page-wrap`) | 246-284 | dark | Default visible section |
| `#section-subscribers` | 660-944 | **light** (own `<style>`) | Hidden by default |
| `#section-campaigns` | 946-1316 | **light** (own `<style>`) | Hidden by default |
| `#section-loyalty` | 1318-1658 | dark, **inline-styled only** | Hidden by default, no shared classes |
| `#section-settings` (mobile only) | 1860-1888 | dark, inline-styled | Hidden by default |
| Bottom nav (mobile) | 1890-1917 | dark | `dashboard-shell.css` |

`styles.css` (349 lines): not referenced by `dashboard.html`. Excluded from
this audit's scope.

`onboarding.js`/`onboarding.css`: a self-contained modal wizard with its own
`qr-*` prefixed classes (`qr-btn-free`, `qr-btn-premium`, `qr-field-input`,
`qr-card`, etc.), entirely independent of `dashboard-shell.css`. It overlays
the dashboard but shares no selectors with it. Out of scope for this
migration — flagged as a separate future migration target, not touched here.

---

## 3. Button Migration Map

Only real `<button>`/`<a>` elements are listed (QDS Button requires a native
element; `.camp-trig` and `.tone-pill`, which are `<div>`s with `onclick`, are
Surface/selection candidates instead — see §4).

| # | Element / class | Line | ID | JS deps | Proposed QDS | Visual parity risk | Behavior risk |
|---|---|---|---|---|---|---|---|
| 1 | `<button class="sb-toggle">` | 207 | `sb-toggle` | `addEventListener('click', ...)` dashboard.html:386-390 (toggles `.collapsed` + localStorage) | `qds-btn--ghost qds-btn--icon qds-btn--sm` | Low — currently a circular 20px button, QDS icon-sm is 32×32; sidebar toggle affordance shrinks/grows | Low — listener attaches by `id`, unaffected by class change |
| 2 | `<button id="mob-btn">` | 243 | `mob-btn` | listener dashboard.html:393 | `qds-btn--secondary qds-btn--icon qds-btn--lg` (44px touch min already required at this breakpoint) | Medium — custom position:fixed hamburger, QDS icon button has no built-in fixed positioning; wrapper needed | Low |
| 3 | `<button class="btn-create" id="btn-create-sqr">` | 264 | `btn-create-sqr` | listener 442-443; has `data-i18n="btn_create"` **directly on button** | `qds-btn--primary qds-btn--md` | Medium — `.btn-create` has custom glow `box-shadow` (dashboard-shell.css:384) QDS primary lacks; drop or keep as page-level addon class | **High** — must move `data-i18n` off the button root onto a `.qds-btn__content` child, or lang toggle wipes any added icon markup |
| 4 | `.dub-close` (inline `<style>`) | 151-153, 167 | none | inline `onclick=` | `qds-btn--ghost qds-btn--icon qds-btn--sm` | Low | Low — inline onclick untouched by class swap |
| 5 | `.dub-btn` (`<a>`) | 146-150, 166 | none | none (plain nav link), has `data-i18n="demo_btn"` | `qds-btn--primary qds-btn--md` (as `<a>`) | Low | Low |
| 6 | `.claim-banner-btn` | 199 | `claim-manage-btn` | `.onclick=` assigned dashboard.html:560-563; has `data-i18n="banner_btn"` | `qds-btn--primary qds-btn--sm` | Low | **High** — same data-i18n-on-root issue as #3 |
| 7 | `.claim-banner-close` | 200 | none | inline `onclick=` | `qds-btn--ghost qds-btn--icon qds-btn--sm` | Low | Low |
| 8 | `.csm-btn-primary` | 185 | `csmManageBtn` | `.onclick=` assigned 530-533; `data-i18n="csm_manage"` | `qds-btn--primary qds-btn--lg qds-btn--full` | Low | High — data-i18n-on-root |
| 9 | `.csm-btn-secondary` (`<a>`) | 186 | `csmViewBtn` | `.href=` assigned 529; `data-i18n="csm_view"` | `qds-btn--secondary qds-btn--lg qds-btn--full` (as `<a>`) | Low | High — data-i18n-on-root |
| 10 | `.trial-upgrade` (`<a>`) | 253 | none | none | `qds-btn--primary qds-btn--sm` | Low | Low |
| 11 | `.sqr-act` ×3 (`.sqr-manage`/`.sqr-open`/`.sqr-analytics`) | built in JS, dashboard.html:340 | none | `.onclick =` assigned per-card, dashboard.html:341-343 (property assignment, not inline attr — safe pattern) | `qds-btn--ghost qds-btn--sm` (manage = `qds-btn--secondary` per `.primary` modifier today) | Medium — today these are 3 equal-width grid cells (`.sqr-actions{grid-template-columns:1fr 1fr 1fr}`, dashboard-shell.css:373) forming one visual toolbar row with dividers; QDS buttons are independent pills, loses the fused-toolbar look unless wrapped in `.qds-surface__footer` | Low — JS re-queries `card.querySelector('.sqr-manage')` etc. after `card.innerHTML=` (dashboard.html:341); safe as long as those class names stay on the button regardless of added `qds-btn*` classes |
| 12 | `.sqr-empty .btn-create` (empty state CTA) | 330 | none | inline `onclick="launchOnboarding()"`; **also targeted by** `applyLang()` via `document.querySelector('.sqr-empty .btn-create')` (dashboard.html:1844-1845) which does `.textContent =` | `qds-btn--primary qds-btn--lg` | Low | **High** — `applyLang()` sets `textContent` directly on this element; same span-wrapping conflict as #3, and this one isn't even using `data-i18n`, it's a manual querySelector — must update that JS line too if content is wrapped |
| 13 | `.sqr-claimed-btn-primary` (`<a>`) | 581, 618 | none | template-literal built, static per render | `qds-btn--primary qds-btn--md` | Low | Low |
| 14 | `.sqr-claimed-btn-secondary` ×3 (button + 2×`<a>`) | 582-584, 619-621 | none | inline `onclick=` on the button variant | `qds-btn--secondary qds-btn--md` | Low | Low |
| 15 | `.sub-export-btn` ×2 | 739, 760 | none | inline `onclick="subExportAll()"` / `subExportPage()` | `qds-btn--secondary qds-btn--sm` | Medium — currently light-theme grey pill; QDS button tokens resolve to dark-theme colors (`--qds-color-surface-2` etc.) — **must confirm QDS foundation tokens support a light-surface context before migrating anything inside `#section-subscribers`/`#section-campaigns`**, or the button will look inverted against the white card background | Low |
| 16 | `.sub-view-btn` (built in JS) | 842 | none | inline `onclick="subViewDetail(...)"` string-built into `innerHTML` | `qds-btn--secondary qds-btn--sm` | Same light-theme caveat as #15 | Low |
| 17 | `.sub-back-btn` | 748 | none | inline `onclick="subShowTable()"` | `qds-btn--ghost qds-btn--sm` | Same light-theme caveat | Low |
| 18 | `.camp-back` ×2 | 1054, 1084 | none | inline `onclick=` | `qds-btn--ghost qds-btn--sm` | Light-theme caveat | Low |
| 19 | `.camp-gen-btn` | 1076 | `campGenBtn` | inline `onclick="campGenerate()"`; JS mutates `btn.disabled` and `btn.childNodes[...].textContent` directly (dashboard.html:1229, 1247) to show "Generating…" | `qds-btn--primary qds-btn--md qds-btn--full` + `qds-btn--loading` toggle | Light-theme caveat | **High** — JS reaches into `btn.childNodes[btn.childNodes.length-1]` positionally; QDS's `.qds-btn--loading` pattern hides `.qds-btn__content` via CSS and shows a separate `.qds-btn__spinner`, it does not swap text — this call site needs a rewrite of the loading logic, not just a class swap. Flag "Requires JavaScript adjustment." |
| 20 | `.camp-send-btn` | 1112 | `campSendBtn` | `disabled` toggled by `campRefreshPreview()` (1218); inline `onclick="campSend()"`; also disabled inside `campSend()` (1261) and `.finally()` re-enabled (1280) | `qds-btn--primary qds-btn--md qds-btn--full` | Light-theme caveat | Low — disabled state is native `disabled` attribute, QDS handles this via `:disabled` selector natively, no adjustment needed |
| 21 | `.ly-copybtn-*`, edit/save/status/PIN/customer-list buttons (dynamic) | 1457-1501 | per-instance `ly-*-{id}` | All inline `onclick="window.xyz(this)"`, all inline `style=""` (no classes at all) | Not recommended this sprint — see §9 "Do not migrate yet" | N/A | **High** — zero shared classes today; adopting QDS here is a rewrite of `_lyBuildCard()`, not a swap |
| 22 | `.camp-trig` action buttons — N/A, these are `<div>`s | — | — | — | — | — | See §4 |

---

## 4. Surface Migration Map

| # | Element / class | Line | Conceptual variant | Padding | Elevation | Interactive? | JS deps | Nested-surface concern | Risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `.kpi-card` ×4 | 266-271 | `kpi` | `sm` (18px 20px today ≈ closest to `--qds-space-6`/md-ish; needs design confirm) | `raised` (dashboard-shell.css:630-636 gives all `.kpi-card` a box-shadow + hover lift already) | No (static display) | `setKPI()` (dashboard.html:320) does `el.textContent` on **inner** `#kpi-pages` etc., not the card root — safe, doesn't touch card structure | None | **Low — best POC candidate, see §10** |
| 2 | `.sqr-card` (built in JS) | dashboard.html:338-344 | `default` or `feature` | `none` (has internal `.sqr-card-top`/`.sqr-divider`/`.sqr-actions` regions that don't map 1:1 to Surface header/body/footer) | `raised` (dashboard-shell.css:630, hover lift 687-689) | Card itself isn't clickable (only its 3 action buttons are) | Entire card is `card.innerHTML =` on every dashboard load/refresh (dashboard.html:339) — full re-render each time, not incremental DOM patching, which **lowers** migration risk (no persistent references to internal nodes across renders except the 3 `.sqr-act` buttons re-queried immediately after) | Would need `.qds-surface__header` (thumb+meta+status), `.qds-surface__body` (stats), `.qds-surface__footer` (3 actions) — a real restructure, not a class rename | **High** — structural rewrite of `renderCards()`, defer past Wave 2 |
| 3 | `.sqr-claimed-card` | 570-587, 608-623 | `feature` | `lg` | `elevated` (has custom top gradient bar via `::before`, not a QDS pattern) | No | Static template string, one-time render | Same header/body/footer restructure as #2 | Medium — smaller/simpler markup than `.sqr-card`, good Wave 4 candidate after #2 proves the pattern |
| 4 | `.sqr-empty` (empty state) | 330 | `default`, `padding-xl` | xl | flat | No | Contains the `.btn-create` from Button map #12 | Simple: icon + title + sub + button, close to QDS's documented empty-state Body pattern (surface.css comment references Skeleton/loading, not empty-state explicitly — QDS has no dedicated empty-state variant, reuse `default` + manual content) | Low |
| 5 | `.sub-card` ×4 | 712-731 | `kpi` | sm | flat (light theme — `box-shadow:0 1px 8px rgba(0,0,0,.07)` is a *shadow on white*, inverse of QDS's dark-token elevation) | No | none | None | **Medium** — same light/dark token mismatch as Button #15; do not migrate until QDS confirms light-surface support |
| 6 | `.sub-tbl-wrap` | 672, 736, 757 | `default`, `padding-none` (table has its own padding) | none | flat | No | Contains dynamically-injected `<table>` via `innerHTML` (dashboard.html:830-847, 879-887) | Table content is fully JS-owned; Surface wrapper swap is low-risk if only the outer `<div>` classes change | Low, but blocked on light-theme token question |
| 7 | `.camp-card` (multiple: prog-wrap, goal panel, preview panel, history) | 1012, 1053, 1101, 1120 | `default` | md | flat | No | `#campProgSel` select lives inside #1's card (see Input map); goal/preview panels are `style.display` toggled by JS (1184, 1190, 1195-1196) — toggling display on the Surface root is unaffected by an internal class swap | None beyond nested `<select>`/`<textarea>`/`<input>` — see Input map | Medium — light theme caveat, and display-toggle logic must keep targeting the same wrapper id/class |
| 8 | `.camp-trig` ×3 (selectable trigger cards) | 1019, 1029, 1038 | `default`, **interactive** | md | raised, hover lift already defined (dashboard-shell.css:683-689) | **Yes** — `onclick="campSelectTrig(...)"` (inline), JS does `classList.remove('sel')` on all + `classList.add('sel')` on the clicked one (dashboard.html:1174-1175) | These are `<div onclick>` today — QDS Surface's interactive contract explicitly forbids this ("never a `<div onclick>`", surface.css:24) — migrating requires converting to real `<button type="button">` with `.qds-surface--interactive` + `.qds-surface--selected` (which QDS drives off the `--selected` class exactly the same way this code already does with `.sel` — near drop-in for the *selection* logic, but the *element type* must change from `<div>` to `<button>`, which affects click-target semantics, focus order, and any CSS assuming block-level `<div>` layout) | **Medium-High** — good candidate for a dedicated Wave 4 spike, not Wave 1-3 |
| 9 | `#section-loyalty` cards (`_lyBuildCard`) | 1385-1517 | `feature`/`kpi` mix | — | — | Partially (edit toggle, PIN, status) | 100% inline `style=""`, zero shared classes | N/A | **Do not migrate yet** — see §9 |

---

## 5. Input Migration Map

| # | Element / class | Line | Type | Label assoc. | Validation | JS deps | Proposed QDS | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | `#campProgSel` | 1014 | `<select>` | `<label>` above, no `for`/`id` pairing (label text is plain, not `<label for>`) | none client-side | `addEventListener('change', campProgChanged)` (1158); options appended via `document.createElement('option')` in `campInitProgs()` (1148-1153); `sel.dataset.loaded` guard flag | `qds-select` + `qds-field` | Medium — must add `id`/`for` pairing for correct QDS Field semantics; option-building JS untouched (appends to same `<select>` element regardless of wrapper markup) |
| 2 | `#campGoalText` | 1061 | `<textarea>` | `<label>` above, no `for` | required only via JS `alert()` gate in `campGenerate()` (1225-1226), not native `required` | `.value` read in `campGenerate()` | `qds-textarea` inside `qds-field` | Low — read-only value access unaffected by wrapper |
| 3 | `#campOfferText` | 1065 | `<input type="text">` | `<label>` (has `<em>optional</em>` inline) | none | `.value` read (1227) | `qds-input` + `qds-field__optional` for the "(optional)" affordance | Low |
| 4 | `.tone-pill` ×4 | 1070-1073 | `<div onclick>` acting as a radio group | Group label above (`camp_tone_label`) | Single-select via `classList.remove('sel')` all + add to clicked (1203-1204) | `campSelectTone()` | `qds-radio--tile` group (real `<input type="radio">` + `.qds-radio--tile`, selection driven by native `:checked` via `:has()`, **no JS class-toggle needed post-migration** — this one can actually *drop* its JS selection logic entirely per input.css:784-787 comment) | **Medium** — behavior actually simplifies, but requires real `<input type="radio" name="camp-tone">` markup + removing `campSelectTone()`'s classList calls, i.e. it's a genuine code change, not a class rename; flag "Requires JavaScript adjustment" |
| 5 | `#campTitleIn` | 1104 | `<input type="text" maxlength="60">` | `<label>` with counter `<em id="campTitleCnt">` | Length check driven by JS `classList.toggle('over', tLen>45)` (1214) — **soft max of 45 enforced only by classList, hard `maxlength=60`** | `oninput="campRefreshPreview()"` | `qds-input` + `qds-field__counter`/`qds-field__counter--over` (QDS already has this exact counter pattern, field spec §98-110 counter-over modifier) | Low — near 1:1 mapping, `campRefreshPreview()` just needs its target class renamed from `.over` to `qds-field__counter--over`-equivalent state, or keep `.over` as an additional class alongside QDS's |
| 6 | `#campBodyIn` | 1108 | `<textarea>` | same pattern as #5, 120-char soft limit | same `.over` toggle (1215) | same | `qds-textarea` + counter | Low, same caveat as #5 |
| 7 | `#campLinkUrl` | 1110 | `<input type="url">` | inline `<label>` + optional tag; **also has stray class `"camp-field input"`** (dashboard.html:1110 — `class="camp-field input"` looks like a copy-paste bug, `camp-field` is normally a wrapper div class, not applied to an `<input>` before) | URL normalization in JS at send time (1266) | `.value` read | `qds-input type="url"` | Low, but flag the pre-existing malformed class attribute for cleanup regardless of QDS migration |
| 8 | `.ly-er-*`, `.ly-eg-*`, `.ly-pin-*` (dynamic loyalty inputs) | 1480-1485 | text/select/number | Adjacent `<label>` with inline `style=""`, no `for` | PIN length check (`pin.length<4`) via `alert()` (1529) | Read via `document.getElementById()` per instance id | Not recommended this sprint — see §9 | **High** — 100% inline-styled, no shared class, id-per-instance |
| 9 | Subscribers/Campaigns section — no free-text search input exists today | — | — | — | — | — | N/A | Dashboard has no search input; nothing to migrate here despite the sprint brief listing "search" as an example — confirmed absent, not an oversight |
| 10 | Sidebar — no inputs | — | — | — | — | — | N/A | — |

---

## 6. Legacy CSS Audit

**Duplicated / overlapping with QDS:**
- `.btn-create` is defined **twice** inside `dashboard-shell.css` itself (lines 384-385 and again 569-570, identical properties) — pre-existing internal duplication, unrelated to QDS, flagged for separate cleanup, not touched by this migration.
- `.btn-primary` / `.btn-outline` / `.btn-ghost` (dashboard-shell.css:221-244) are a parallel button system **not currently used anywhere in `dashboard.html`** (grep confirms zero references in this file — likely used by `analytics.html`/other dashboard-family pages per the file's own header comment "Import this on: dashboard.html, analytics.html, qr-manage.html..."). Do not remove — other pages may depend on them. Out of scope.
- `.kpi-card`, `.sqr-card`, `.sqr-act`, `.camp-trig`, `.btn-create` all appear in the `.pressable`/`.interactive-card` multi-selector utility block (dashboard-shell.css:662-707). QDS Button/Surface already bake in equivalent `:hover`/`:active` transforms (`--qds-hover-lift`, `--qds-pressed-scale`). Once an element is migrated, its entry in this utility list becomes **redundant but harmless** (same transform values, applied twice is a no-op, not a conflict) — safe to leave until a later cleanup wave; removing it prematurely risks breaking any not-yet-migrated sibling that still relies on it.

**Dashboard-only CSS that becomes unnecessary after migration** (only for elements actually migrated in a given wave — do not remove file-wide):
- `.kpi-card`, `.kpi-val`, `.kpi-val.orange/green/purple`, `.kpi-lbl` (dashboard-shell.css:205-210) once KPI cards migrate (§10) — but `.kpi-val` color modifiers (`orange`/`green`/`purple`) have **no QDS equivalent** (QDS `qds-surface__kpi-value` is a single fixed color, kpi-delta up/down only signals trend direction, not arbitrary category color) — this rule **must be kept** as a page-level addon class layered on top of `qds-surface__kpi-value`, not deleted.

**CSS that must remain (QDS does not replace it):**
- All light-theme rules inside `#section-subscribers`/`#section-campaigns`'s scoped `<style>` blocks (662-703, 947-1002) — QDS's token set (`--qds-color-surface-*`) is authored for the dark shell; nothing in the reviewed QDS files defines a light-mode variant. Confirm with design before any Button/Input migration touches these two sections.
- `.dash-section` display-toggle mechanics, `#bottom-nav`, `.fab`, sidebar `#sidebar`/`.sb-*` — page chrome and navigation, not Button/Surface/Input targets.
- `.sqr-actions{grid-template-columns:1fr 1fr 1fr}` fused-toolbar layout (dashboard-shell.css:373) — no QDS equivalent for a bordered 3-up button toolbar; if `.sqr-act` migrates to `qds-btn`, this grid layout must be kept or replaced with `.qds-surface__footer`'s flex layout (visual change, flagged in §4 row 2).

**Selectors too tightly coupled to current DOM structure:**
- `document.querySelector('.sqr-empty .btn-create')` (dashboard.html:1844) — descendant-selector coupling; any class rename on either ancestor or the button breaks this specific `applyLang()` line silently (no error thrown, the text just stops translating).
- `btn.childNodes[btn.childNodes.length-1].textContent` in `campGenerate()` (1229, 1247) — positional child-node coupling, breaks the instant `.qds-btn__content`/`.qds-btn__spinner` structure is introduced.

**Selectors used by JavaScript (must be preserved as class hooks regardless of visual restyle):**
`.sb-item`, `.bn-item`, `.dash-section`, `.sel` (camp-trig/tone-pill), `.over` (campTitleIn/campBodyIn), `.sqr-manage`/`.sqr-open`/`.sqr-analytics`, `#sqrGrid`, `#sqr-loading`, all `id="..."` targets listed in §3/§5 JS-deps columns.

**Selectors used by responsive behavior:** see §7.

---

## 7. JavaScript Dependency Audit

Classified by pattern, dashboard.html unless noted:

| Pattern | Locations | Migration implication |
|---|---|---|
| `getElementById` | Pervasive (60+ call sites) | Safe under class swaps as long as `id` attributes are preserved on migrated elements |
| `.classList.add/remove/toggle` | 174-175 (`#claim-banner`/`.show`), 387-389 (`sidebar`/`.collapsed`), 397 (settings toast), 408-409/418/434/437/460-461/470/478 (`.sb-item`/`.active`), 1174-1175/1203-1204 (`.sel`), 1214-1215 (`.over`), 1935-1937/1961/1970 (`.bn-item`/`.active`, `.sb-item`/`.active`) | None of these target Button/Surface/Input classes directly except `.sel`/`.over` (Input map #4/#5/#6) and `.sqr-manage` etc. indirectly via querySelector-after-innerHTML — flagged per-row above |
| `.style.display =` | Section show/hide (403-483, 1940-1988), panel toggles (861-862, 896-898, 1184/1190/1195-1196, 1238, 1273), skeleton hide (317) | Orthogonal to Button/Surface/Input class migration — untouched |
| `querySelector`/`querySelectorAll` | `.sqr-manage`/`.sqr-open`/`.sqr-analytics` per-card (341-343), `[data-i18n]` (1831), `.sqr-empty-title`/`.sqr-empty-sub`/`.sqr-empty .btn-create` (1840-1845), `.camp-trig`/`.tone-pill` (1174/1203), `.sb-item`/`.dash-section` (multiple) | See §6 tight-coupling list |
| `.closest()` | **None found** in dashboard.html or the 3 reviewed `js/*.js` files | No risk from this pattern |
| Event delegation (listener on ancestor, `e.target` check) | **None found** — every listener binds directly to its target element | Lower risk than typical: no delegated-listener assumptions about DOM depth to break |
| Inline `onclick=`/`oninput=` attributes | Extremely common in `#section-campaigns` and `#section-loyalty` (all string-built HTML) | Inline handlers survive class changes on the same element untouched — the risk is only when migration also changes the *element type* (`<div>`→`<button>` for `.camp-trig`, Surface map #8) or *nesting* (adding `.qds-btn__content` wrapper) |
| `data-*` attribute reads | `data-i18n` (translation keys, ~90 occurrences), `data-uc`/`dataset.biz`/`dataset.reward`/`dataset.id`/`dataset.slug`/`dataset.status`/`dataset.url`/`dataset.loaded` (loyalty/campaigns dynamic cards) | `data-i18n` is the single biggest cross-cutting risk — see §1 and per-row flags in §3 |
| Fetch/DOM data binding | `renderCards()` (314-346), `_lyBuildCard()` (1397-1510), subscriber table builders (830-847, 879-887) all use string-concatenated `innerHTML` | Full re-render on each data load — no incremental-patch assumptions to break, which is favorable for migration (safe to change the template string's classes as a unit) |

---

## 8. Risk Matrix

| Target | Classification |
|---|---|
| `.kpi-card` ×4 (static) | **Safe** |
| `.sb-toggle`, `#mob-btn` | **Safe with preserved hooks** (keep `id`) |
| `.dub-close`, `.claim-banner-close` | **Safe with preserved hooks** |
| `.dub-btn`, `.trial-upgrade`, `.sqr-claimed-btn-primary` | **Safe with preserved hooks** |
| `.btn-create` (all instances) | **Requires JavaScript adjustment** (move `data-i18n` off root; fix `querySelector('.sqr-empty .btn-create')`) |
| `.claim-banner-btn`, `.csm-btn-primary`, `.csm-btn-secondary` | **Requires JavaScript adjustment** (data-i18n-on-root) |
| `.sqr-act` ×3 | **Requires JavaScript adjustment** (toolbar layout decision) + revisit after `.sqr-card` Surface migration, not standalone |
| `.sqr-card` (dynamic) | **Do not migrate yet** (needs header/body/footer restructure of `renderCards()`) |
| `.sqr-claimed-card` | **Requires JavaScript adjustment** (minor — header/body/footer split) |
| `.camp-gen-btn` | **Requires JavaScript adjustment** (positional childNodes text-swap must be rewritten for `.qds-btn--loading`) |
| `.camp-send-btn` | **Safe with preserved hooks** (native `disabled` toggle, no adjustment) |
| `.camp-trig` (Surface, selectable) | **Requires JavaScript adjustment** (`<div>`→`<button>`, but selection logic can simplify) |
| `.tone-pill` (Input, radio-tile) | **Requires JavaScript adjustment** (real radio inputs, JS selection logic can be deleted) |
| `#campProgSel`, `#campGoalText`, `#campOfferText`, `#campTitleIn`, `#campBodyIn`, `#campLinkUrl` | **Safe with preserved hooks** — *blocked on* light-theme token confirmation (§6) |
| `.sub-*` (all Subscribers section) | **Do not migrate yet** — blocked on light-theme token confirmation |
| `.ly-*` (all Loyalty section: cards, buttons, inputs) | **Do not migrate yet** — zero shared classes today, this is a rewrite not a migration |
| `#section-settings` mobile nav rows | **Do not migrate yet** — out of Button/Surface/Input scope (plain nav rows), and `handleSignOut()` called at dashboard.html:1887 has **no definition found** in any file read for this audit (dead reference or defined in an unreviewed file) — flag for founder/dev clarification before touching this section at all |
| `.sb-item`, `.bn-item`, sidebar/bottom-nav shell | **Do not migrate yet** — navigation chrome, not this sprint's component scope |

---

## 9. Migration Waves

**Wave 1 — Low-risk static Buttons**
Files: `dashboard.html` (lines 199-200, 151-153, 166-167, 253).
Targets: `.claim-banner-close`, `.dub-close`, `.dub-btn`, `.trial-upgrade`.
Risk: Low. Validation: visual diff at all breakpoints (768px, 640px), click-through each banner's dismiss/nav action manually. Rollback: revert class attribute only (single-line diffs, no JS touched).

**Wave 2 — Non-interactive Surfaces**
Files: `dashboard.html` (266-271), `dashboard-shell.css` (203-210, kept as addon classes for color modifiers per §6).
Targets: 4× `.kpi-card`.
Risk: Low. Validation: confirm `setKPI()` (dashboard.html:320) still finds `#kpi-pages`/`#kpi-scans`/`#kpi-subs`/`#kpi-wallet` post-migration (they're inner elements, untouched by the card wrapper's class change); visual diff against current KPI row at 700px breakpoint (dashboard-shell.css:204 grid collapse). Rollback: revert `.kpi-card` wrapper classes; inner `#kpi-*` ids untouched throughout, zero JS risk.

**Wave 3 — Inputs and Search**
Files: `dashboard.html` (1014, 1061, 1065, 1104, 1108, 1110).
Targets: `#campProgSel`, `#campGoalText`, `#campOfferText`, `#campTitleIn`, `#campBodyIn`, `#campLinkUrl`.
Blocked on: founder/design confirmation that QDS Input's dark-theme tokens are acceptable inside `#section-campaigns`'s current light-theme card shell, or that this section's theme is being unified to dark as a prerequisite (out of this sprint's scope to decide).
Risk: Medium once unblocked. Validation: full campaign-generation flow (select program → trigger card → fill goal/offer → generate → edit title/body with counters → send) exercised end-to-end after migration, since `campRefreshPreview()`/`campGenerate()`/`campSend()` all read `.value` off these exact elements. Rollback: revert wrapper markup; all `id`s and `.value` access patterns unchanged.

**Wave 4 — Interactive cards and QR summary elements**
Files: `dashboard.html` (1019-1049 `.camp-trig`, 1070-1073 `.tone-pill`), `renderCards()` (314-346) for `.sqr-card` + `.sqr-act`.
Targets: `.camp-trig` → `qds-surface--interactive`, `.tone-pill` → `qds-radio--tile`, `.sqr-card`/`.sqr-act` → Surface + Button (header/body/footer restructure).
Risk: **High**. This is the only wave requiring element-type changes (`<div>`→`<button>`) and JS logic rewrites (`campSelectTrig`, `campSelectTone`, `renderCards`), not class renames. Recommend splitting into its own sub-sprint after Waves 1-3 validate the QDS integration pattern in production. Validation: full campaign-trigger-selection flow, full dashboard-load-and-card-render flow, keyboard navigation/focus order (native `<button>` vs `<div onclick>` changes tab order). Rollback: highest cost of any wave — revert both markup and the 3 JS functions together, test as a unit.

**Wave 5 — Legacy CSS cleanup**
Files: `dashboard-shell.css`.
Action: only after Waves 1-4 are live and stable, audit which rules in `.pressable`/`.interactive-card` (662-707), `.kpi-card`/`.sqr-card`/`.camp-trig` base rules become fully dead (no remaining unmigrated element uses them). Per sprint brief's Non-Goals, **do not execute this wave now** — this plan only identifies the candidates in §6.

---

## 10. Recommended First Proof-of-Concept Target

**The 4 static `.kpi-card` elements (dashboard.html:266-271), migrated to `qds-surface--kpi`.**

Why this is the best first target:
- **Visible enough to validate QDS**: sits directly under the dashboard header, always rendered, unmissable in any visual review.
- **Lowest behavior risk on the entire inventory**: the cards themselves are static markup; only their *inner text nodes* (`#kpi-pages`, `#kpi-scans`, `#kpi-subs`, `#kpi-wallet`) are JS-managed, via plain `el.textContent =` in `setKPI()` (dashboard.html:320), which is completely indifferent to the wrapper `<div>`'s class list.
- **No inline `onclick`, no `data-i18n` on the card root, no dynamic re-render** — none of the three cross-cutting risks flagged in §1 apply to this element.
- **Minimal JS changes**: zero. Only the static class attribute on 4 `<div>`s changes, plus keeping the `orange`/`green`/`purple` color-modifier classes as page-level addons alongside `qds-surface__kpi-value` (§6).
- **Easy to roll back**: a single, isolated diff — 4 lines of `dashboard.html`, no `dashboard-shell.css` deletions (color-modifier rules stay, only newly-redundant base `.kpi-card` box/border/radius rules become unused, not removed this sprint).
- **Does not trigger a page-wide redesign**: the KPI row is visually self-contained; migrating it doesn't force any change to the sidebar, sections, or any other component.

Wave 1 (banner close/dismiss buttons) is lower-risk still but far less *visible* proof that QDS renders correctly in this dashboard's real dark theme — the KPI row is the better founder-facing validation.

---

## 11. Validation Checklist

Per wave, before merge:
- [ ] Visual diff at 1280px (desktop), 768px, 640px breakpoints against current production screenshots.
- [ ] All `id`-based `getElementById` lookups listed in §7 for the migrated element still resolve (manually grep the element's `id` post-migration).
- [ ] Any `data-i18n` on a migrated element's root has been moved to an inner text-only node; run `toggleLang()` and confirm no icon/spinner/child markup is wiped.
- [ ] Any `querySelector` with a descendant/compound selector referencing the migrated element's old class (§6 "tightly coupled" list) still matches, or has been updated in the same commit.
- [ ] Keyboard navigation (Tab order, Enter/Space activation) unchanged or intentionally improved, especially for Wave 4's `<div>`→`<button>` conversions.
- [ ] No new CSS specificity conflicts — confirm `qds.css` load order relative to `dashboard-shell.css` (not yet established; dashboard.html doesn't currently link `qds.css` at all — **must be added** before any wave ships).
- [ ] Confirm backend/API calls unaffected (none of the reviewed changes touch `fetch()` call sites).
- [ ] Mobile bottom-nav and FAB still function (unrelated chrome, but shares the viewport with Wave 2's KPI row at 768px).

---

## 12. Rollback Strategy

- Every wave is scoped to a small, contiguous line range in `dashboard.html` (see §9 "Files") — revert via `git revert` of the wave's commit(s), or manual re-application of the pre-migration class attributes, which this document records verbatim in §3-§5.
- Waves 1-3 touch zero JS logic (only class attributes and, for Wave 3, are blocked pending a separate decision) — rollback is a pure markup revert.
- Wave 4 is the only wave that changes JS function bodies (`campSelectTrig`, `campSelectTone`, `renderCards`) — commit the markup and JS changes together, tagged distinctly from Waves 1-3, so rollback reverts both in one step rather than leaving JS expecting markup that was rolled back.
- No backend, database, or API changes are implicated by any wave — rollback is entirely frontend-local.

---

## 13. Remaining QDS Component Gaps

Confirmed absent from the reviewed `button.css`/`surface.css`/`input.css` (v1), needed for a full Dashboard migration beyond this sprint's 3-component scope:

- **No Skeleton component** — `surface.css`'s own header comment defers shimmer/`aria-busy` timing to "a real Skeleton component (catalog #28)" not yet implemented; Dashboard's `.skel`/`.skel-card`/`.skel-line` (dashboard-shell.css:317-334, used at dashboard.html:277-279) has no migration target yet.
- **No light-theme token variant** — blocks all of Wave 3+ work inside `#section-subscribers`/`#section-campaigns` until resolved (§6, §9).
- **No toast/notification component** — `#cs-toast` (dashboard-shell.css:166-174) has no QDS equivalent reviewed.
- **No toggle-switch component** — `.toggle-switch`/`.toggle-slider` (dashboard-shell.css:404-414) has no QDS equivalent reviewed; not present in current Dashboard markup but defined in the shared stylesheet for sibling pages.
- **No fused 3-up button toolbar pattern** — `.sqr-actions` grid (§6) has no direct QDS analog; `.qds-surface__footer` is a flex row of independent buttons, not a bordered-divider toolbar.
- **No arbitrary-color KPI value modifier** — QDS `qds-surface__kpi-value` is single-color; Dashboard's orange/green/purple category coloring (§6) must remain a page-level addon indefinitely, not a gap to close, but worth noting as a permanent deviation from strict QDS usage.
