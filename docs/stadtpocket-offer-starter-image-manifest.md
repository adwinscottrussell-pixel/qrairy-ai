# StadtPocket Angebote — Starter Image Manifest (Phase B.2.1)

The 18 approved starter images for the Deal Builder Step 2 "Vorlage
auswählen" path, live in `backend/src/data/stadtpocketOfferStarterImages.js`
(mirrored in `frontend/public/stadtpocket-admin.html`'s own
`STADTPOCKET_OFFER_STARTER_IMAGES` constant).

**Status: 18 of 18 uploaded and live.** Uploaded via
`backend/scripts/uploadStadtpocketStarterImages.js` from the approved
`stadtpocket_angebote_starter_18_FINAL.zip` package into Cloudinary
folder `stadtpocket-headers/angebote-starter` on the project's real
account (cloud `dwqc6n7rn`). This table reflects the actual delivered
package (the initial planning draft of this manifest, written before
the approved ZIP existed, guessed different ids/labels for the
"Allgemein / Lokales Geschäft" category — optician/food-truck/flower
shop was the real, approved final selection, not "local storefront /
shopping / neutral background").

## Image standard (every entry meets this)

- 1200 × 900 px, 4:3 aspect ratio, landscape orientation, JPEG
- No promotional text, prices, fake business names, logos, StadtPocket
  branding, or watermarks baked into the photo — StadtPocket adds the
  actual promotional text and branding separately in the Deal Builder
- Category-neutral enough for the overlay system to brand for any
  business type
- Cloudinary folder: `stadtpocket-headers/angebote-starter`

## Manifest (as shipped)

| Stable ID | German Label | Category | Cloudinary publicId |
|---|---|---|---|
| `bakery-croissants-01` | Croissants & Gebäck | Bäckerei & Café | `stadtpocket-headers/angebote-starter/bakery-croissants-01` |
| `bakery-bread-01` | Frisches Brot & Backwaren | Bäckerei & Café | `stadtpocket-headers/angebote-starter/bakery-bread-01` |
| `bakery-coffee-01` | Kaffee & Kuchen | Bäckerei & Café | `stadtpocket-headers/angebote-starter/bakery-coffee-01` |
| `restaurant-meal-01` | Frisch serviert | Restaurant & Essen | `stadtpocket-headers/angebote-starter/restaurant-meal-01` |
| `restaurant-table-01` | Gemeinsam genießen | Restaurant & Essen | `stadtpocket-headers/angebote-starter/restaurant-table-01` |
| `restaurant-fresh-01` | Frisch & lecker | Restaurant & Essen | `stadtpocket-headers/angebote-starter/restaurant-fresh-01` |
| `fashion-boutique-01` | Neue Styles entdecken | Mode & Einzelhandel | `stadtpocket-headers/angebote-starter/fashion-boutique-01` |
| `fashion-rack-01` | Lieblingsstücke | Mode & Einzelhandel | `stadtpocket-headers/angebote-starter/fashion-rack-01` |
| `fashion-lifestyle-01` | Shoppen & entdecken | Mode & Einzelhandel | `stadtpocket-headers/angebote-starter/fashion-lifestyle-01` |
| `beauty-spa-01` | Entspannung & Wohlbefinden | Beauty & Wellness | `stadtpocket-headers/angebote-starter/beauty-spa-01` |
| `beauty-skincare-01` | Beauty & Pflege | Beauty & Wellness | `stadtpocket-headers/angebote-starter/beauty-skincare-01` |
| `beauty-salon-01` | Dein neuer Look | Beauty & Wellness | `stadtpocket-headers/angebote-starter/beauty-salon-01` |
| `fitness-gym-01` | Fit & stark | Fitness & Sport | `stadtpocket-headers/angebote-starter/fitness-gym-01` |
| `fitness-training-01` | Gemeinsam trainieren | Fitness & Sport | `stadtpocket-headers/angebote-starter/fitness-training-01` |
| `fitness-active-01` | Dein Start ins Training | Fitness & Sport | `stadtpocket-headers/angebote-starter/fitness-active-01` |
| `general-optician-01` | Brillen & Beratung | Allgemein / Lokales Geschäft | `stadtpocket-headers/angebote-starter/general-optician-01` |
| `general-foodtruck-01` | Frisch unterwegs | Allgemein / Lokales Geschäft | `stadtpocket-headers/angebote-starter/general-foodtruck-01` |
| `general-flower-01` | Blumen & Freude | Allgemein / Lokales Geschäft | `stadtpocket-headers/angebote-starter/general-flower-01` |

## Category → id mapping

Category ids match `STADTPOCKET_OFFER_STARTER_CATEGORIES` exactly
(catalog-only grouping metadata, never enforced against a business's
own category):

| Category id | German label |
|---|---|
| `bakery-cafe` | Bäckerei & Café |
| `restaurant` | Restaurant & Essen |
| `fashion-retail` | Mode & Einzelhandel |
| `beauty-wellness` | Beauty & Wellness |
| `fitness-sport` | Fitness & Sport |
| `general-local` | Allgemein / Lokales Geschäft |

## Provenance

- Source package: `stadtpocket_angebote_starter_18_FINAL.zip` (externally supplied, approved)
- Uploader: `backend/scripts/uploadStadtpocketStarterImages.js`
- Raw upload output (starterId/publicId/secure_url/width/height/format/bytes
  for all 18, as returned by Cloudinary): `backend/scripts/upload_results.json`
- `alt` text in the catalog reuses each entry's German `label` — the
  approved manifest carries no separate alt-text field.
