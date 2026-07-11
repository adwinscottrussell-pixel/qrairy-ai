# QRAIVY Design System (QDS)

## Purpose

QDS is the foundation layer for a unified design language across QRAIVY's
frontend. This v0.1 sprint establishes token infrastructure only — it does
not change, replace, or migrate any existing page styling.

**QDS tokens are the new canonical standard.** They define a small,
deliberate set of values (spacing, radius, type, color, elevation, motion,
breakpoints) — not a preservation of every value already found in production
CSS. Where an existing value was inconsistent, arbitrary, or duplicative
(e.g. `2px`/`6px`/`14px` spacing, `7px`/`9px` radius, a second unused accent
color), it was **not** carried forward as a token.

**Existing legacy values are not automatically canonical.** `styles.css`,
`dashboard-shell.css`, and other production CSS keep working exactly as they
do today. Nothing in this folder overrides or reads from them.

**Current pages remain untouched until migration.** `qds.css` is not
imported anywhere in the application. Zero visual or functional impact.

**Compatibility aliases will come later, in a separate layer.** Where a
legacy value doesn't map cleanly onto a canonical QDS token, a compatibility
alias may be introduced in a future, separately-approved phase — not in this
foundation layer.

**New components must not hard-code visual values when an approved QDS
token exists.** Once a component is built against QDS (`components/`), it
should reference `--qds-*` tokens rather than introducing new raw px/hex/rgba
values that duplicate an existing token's purpose.

## Architecture

```
qds/
  foundation/     Design tokens (CSS custom properties). No component styles,
                   no selectors beyond :root. One concern per file.
  components/      Reserved for future component-level styles. Empty in v0.1.
  layouts/         Reserved for future layout primitives. Empty in v0.1.
  docs/            Reserved for future usage guides/examples. Empty in v0.1.
  qds.css          Single entry point — imports all foundation files in order.
```

## Import Order

`qds.css` imports foundation files in this order:

1. `colors.css` — surfaces, borders, text, brand, status, interaction
2. `typography.css` — font families, semantic type scale
3. `spacing.css` — 4px-based spacing scale
4. `radius.css` — border-radius scale
5. `elevation.css` — semantic shadow levels (references color tokens for
   the focus level, so colors must load first)
6. `motion.css` — durations, easings, reduced-motion handling
7. `breakpoints.css` — documented breakpoint reference constants

## Naming Rules

- All custom properties are prefixed `--qds-` to avoid collision with
  existing unprefixed variables (`--bg`, `--accent`, etc.) already in use
  throughout `frontend/public/*.css`.
- Tokens follow `--qds-{category}-{role-or-scale}` — e.g.
  `--qds-space-4`, `--qds-color-brand-primary`, `--qds-text-card-title-size`.
- No page-specific or component-specific names in `foundation/`
  (e.g. no `--qds-card-padding`). Component-level, purpose-named tokens
  belong in `components/` once that layer exists, and should reference
  foundation tokens rather than raw values.
- File names are singular, lowercase, one word per concern
  (`colors.css`, not `color-tokens.css`).

## Foundation Summary (v0.1, revised)

- **Spacing** — 4px-based scale, `--qds-space-0` through `--qds-space-20`.
- **Radius** — `none / sm / md / lg / xl / full`.
- **Typography** — 11 semantic roles (display, page title, section title,
  card title, body large, body, body small, label, caption, KPI/stat, code).
  Inter is the primary UI font; DM Mono is used only for KPI/stat figures
  and code, where exact technical values matter.
- **Colors** — semantic roles for surfaces, borders, text, brand, status,
  and interaction states. Near-black foundation retained (no navy). Only
  one brand accent family (`brand-primary` / `brand-hover` / `brand-active`);
  the unused second accent from the legacy palette was dropped.
- **Elevation** — `none / sm / md / lg / floating / overlay / focus /
  brand-glow`. No component-named shadows (e.g. no "toast shadow").
- **Motion** — instant/fast/standard/slow durations, standard/enter/exit
  easings, hover-lift, pressed-scale, and a full `prefers-reduced-motion`
  override.
- **Breakpoints** — small mobile (360px), mobile (480px), tablet (768px),
  desktop (1024px), wide desktop (1440px). Documented as reference
  constants only — CSS custom properties cannot be used directly inside
  `@media` conditions without a preprocessing step.

## Current Status (v0.1, revised)

- Foundation token files exist and are internally consistent.
- `qds.css` is **not imported anywhere** in the application. No page
  references it. Zero visual or functional impact.
- `components/`, `layouts/`, `docs/` are empty, reserved for later phases.

## Future Expansion

- `components/`: buttons, cards, panels, tables — built on top of foundation
  tokens, migrated incrementally per-page with visual sign-off at each step.
  Includes the future compatibility-alias layer for legacy values that don't
  map cleanly onto a canonical token.
- `layouts/`: shared shell/grid primitives (sidebar, page-wrap, dashboard
  grid) once a common pattern is confirmed across `dashboard-shell.css`,
  `manage-page.css`, `analytics-page.css`.
- `docs/`: living usage examples once components exist.
- Migration of existing pages to QDS is explicitly out of scope until a
  separate, approved sprint.
