# Landing Page Studio V3

Status: Phase 1 (foundation) — local, not deployed, not used by any route.

Visual source of truth: "QRAIVY Landing Page Studio Showcase" (approved Light
and Dark Studio, Bäckerei Staib as the Local Business reference layout).

## Principles

- Additive only. Existing landing pages keep `renderPremiumLP` byte-for-byte
  (`backend/tests/legacyRenderGolden.test.js`) until their owner publishes a
  V3 design.
- Slugs, QR codes, Wallet, loyalty, deals, push, voice and customer identity
  stay keyed by slug and are not changed by V3.
- Owner-only editing in the pilot. Pages without an owner (StadtPocket,
  platform pages) are not eligible.
- The server decides: every draft and every publish is validated by
  `backend/src/lpV3/core.js`; the editor's own checks are only for comfort.

## Data model (migration `20261021090000_add_page_design_v3`)

| Table / column | Purpose |
|---|---|
| `LandingPage.renderer` | `"legacy"` (default, every existing page) or `"v3"` |
| `PageDesign` | one per page: `draft` (JSONB), `draftRevision` (refuses saves based on an older revision), `publishedVersionId` |
| `PageDesignVersion` | published snapshots, never changed after writing |

Rollback (staging, only with approval):

```sql
DROP TABLE "PageDesignVersion";
DROP TABLE "PageDesign";
ALTER TABLE "LandingPage" DROP COLUMN "renderer";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261021090000_add_page_design_v3';
```

## Design format (schemaVersion 1)

```json
{ "schemaVersion": 1,
  "theme":    { "palette": { "brand": "#ff5a1f", "...": "" }, "fontPair": "serif-display", "radius": "md" },
  "settings": { "language": "de", "seo": { "title": "", "description": "" } },
  "header":   { "logo": "<cloudinary>", "logoAlt": "", "showBusinessName": true, "nav": [{ "label": "", "target": "/angebote" }] },
  "footer":   { "text": "", "links": [] },
  "pages":    [{ "id": "start", "title": "Start", "sections": [
    { "id": "s_ab12", "type": "hero", "anchor": "", "hidden": false, "variant": "overlay", "data": {}, "style": {} } ] }] }
```

- `pages[]` exists for later sub-pages; version 1 accepts exactly one page,
  `start`.
- Section library (mockup order): Hero, Gallery, Deals / Offers, Loyalty,
  Products, Opening Hours, Contact, Buttons, Social Media, Text Section.
  Phase 1 renders Hero, Buttons (buttons / cards / list), Text, Opening
  Hours, Contact and Social Media; Gallery and Products (Phase 5, uploads)
  and Deals / Offers and Loyalty (Phase 6, existing data by reference) are
  validated and stored, and reported as `skipped` by the renderer.
- Integration sections store references and display settings only, never
  copies of deals, loyalty or Wallet data.

## Validation and XSS protection

1. Only known types and fields; unknown keys are errors. Typed values,
   length limits (code points), control and bidi characters removed;
   multi-line only where allowed.
2. Links: `https:`, `mailto:`, `tel:` or an internal `/<page-or-anchor>` that
   must exist (rendered as `#anchor`). Typed buttons: `wa.me` numbers, phone,
   e-mail, map hosts (Google Maps, Apple Maps, OpenStreetMap), websites.
   Social links must be on the platform's own domain.
3. Images: `https://res.cloudinary.com/<cloud>/image/upload/...jpg|png|webp`
   only; the server passes its cloud name so only our cloud is accepted.
   No `data:` images (the importer asks for a re-upload).
4. Colours: hex only; fonts, radii, icons, variants, backgrounds: fixed lists.
5. Output: every value escaped for its context, attributes always quoted,
   owner text never interpreted as HTML, no inline event handlers, no
   `<script>` in the output. Icons are fixed SVG constants.
6. Limits: 256 KB per design, 40 sections, list sizes per field.
7. Tests: `lpV3Validate`, and `lpV3Render` (hostile values in every field of
   every section; mutation-checked: removing escaping makes it fail).

## Shared renderer

`core.js` has no dependencies and no Node/DOM APIs. Node loads it with
`require`; a browser gets `window.QraivyV3`. The Studio preview (Phase 4)
will load the same file and render into a sandboxed iframe
(`sandbox="allow-scripts"` without `allow-same-origin`). The output is a
full document with a literal `<head>` so the existing page wrapper
(`handleServeLP`: welcome redirect, deals, voice, push) can be applied to
both renderers in Phase 2.

Responsive: mobile first, breakpoints 768 px and 1200 px; header nav becomes
a `<details>` menu on phones (no script).

## Legacy import

`backend/src/lpV3/importLegacy.js` builds a draft from an existing page
(pure, read-only): language, brand colour, hero texts, buttons, action-link
cards, website. Voice, AI assistant, emoji icons, data: logos and unsafe
links are reported as warnings instead of being copied.

## Phases (each needs approval)

0. Prerequisites: Railway builds, temporary proxy diagnostic cleared,
   deals-preview rewrites to the staging API, isolated V3 staging.
1. Foundation (this phase).
2. Owner API (draft / publish / versions / import / revert, pilot list,
   revision check, cache invalidation) and the `handleServeLP` split behind
   `V3_RENDER_ENABLED`.
3. Studio shell and theme: Light (default) / Dark / System tokens, three
   panels, responsive layout and drawers, device previews.
4. Editing: Sections / Add tabs, Content / Style / Settings, reorder / hide,
   Undo / Redo, Save Draft, Publish.
5. Media: Cloudinary uploads; Gallery, Products, hero image.
6. Integrations: Deals / Offers, Loyalty; voice, push and welcome parity.
7. Page templates (Local Business, Link-in-Bio, Product Gallery, Campaign
   Page, Loyalty & Rewards; placeholder content only) and version history.
8. Production pilot (owner's own pages), then selected customers.
9. Later: sub-pages, Business brand kit, multi-location.

## Studio layout (responsive spec, Phases 3–4)

| Width | Sidebar | Left (Sections / Add) | Preview | Right (Edit) |
|---|---|---|---|---|
| ≥ 1920 | expanded | 320 | desktop + mobile side by side | 360 |
| 1440–1919 | expanded, collapsible | 300 | one, device toggle | 340 |
| 1200–1439 | icons | 280, collapsible | one | 320, collapsible |
| 768–1199 | drawer | drawer | full width | drawer |
| < 768 | drawer | preview and publish only in v1 | | |

Panels scroll independently; no horizontal page overflow; the production
Admin sidebar is kept as it is.
