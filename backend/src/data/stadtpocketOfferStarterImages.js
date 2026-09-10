/**
 * stadtpocketOfferStarterImages.js — StadtPocket Angebote Foundation,
 * Phase B.2 ("🖼 Vorlage auswählen").
 * ─────────────────────────────────────────────────────────────
 * The curated starter-image catalog for Step 2's "Vorlage auswählen"
 * path. A plain, versioned, hand-maintained list -- same convention as
 * VOICES in voiceService.js and DEAL_TYPES in stadtpocket-admin.html --
 * no database table, no CRUD, no migration. Mirrored verbatim in
 * frontend/public/stadtpocket-admin.html's own
 * STADTPOCKET_OFFER_STARTER_IMAGES constant (same "inline data, no
 * backend route" posture DEAL_TYPES already uses there); this file is
 * the canonical, documented source of truth to copy from, and the
 * natural future read target for a provider-independent
 * generateOfferImage(context) AI seam (see the Phase B.1 architecture
 * report) once that's ever built -- not used by any other code yet.
 *
 * Every entry below is a REAL, already-uploaded Cloudinary asset in
 * this project's own account -- checkOfferImage() in
 * stadtpocketOfferService.js enforces this independently via
 * isTrustedStadtPocketHeaderImage() (stadtPocketHeaderImageService.js),
 * which rejects any url/publicId that doesn't genuinely belong to our
 * Cloudinary cloud under the stadtpocket-headers folder -- so nothing
 * added here can ever bypass that check, and nothing invalid here would
 * silently "work."
 *
 * Populated in Phase B.2.1 from the approved 18-image starter library
 * (stadtpocket_angebote_starter_18_FINAL.zip), uploaded via
 * backend/scripts/uploadStadtpocketStarterImages.js into
 * stadtpocket-headers/angebote-starter on 2026-09-10/11. Every
 * url/publicId/width/height below is copied verbatim from that
 * script's real upload_results.json (Cloudinary's own returned
 * values) -- none invented or reconstructed. `alt` reuses each entry's
 * approved German label (the approved manifest carries no separate
 * alt-text field) since it already describes the photo itself, never
 * promotional copy.
 *
 * The manifest this catalog was populated from lives in
 * docs/stadtpocket-offer-starter-image-manifest.md.
 *
 * CATEGORY is catalog-only metadata, used purely to group the gallery
 * for a browsable 18-image library -- it is never sent to the backend
 * as part of an offer's image, never validated by checkOfferImage(),
 * and never affects trust/persistence. Category ids intentionally
 * mirror the manifest's category ids so the two stay easy to
 * cross-reference; they are NOT a hard-coded business-category
 * requirement -- any business may pick any starter image regardless of
 * its own category (see the Phase B.2 category-neutrality direction).
 *
 * To add a real entry, once a suitable image for a given category has
 * been uploaded to Cloudinary (folder: stadtpocket-headers, already
 * cropped or convertible to 4:3 at delivery time):
 *
 *   {
 *     id: 'bakery-croissants-01',       // stable, unique, never reused for a different image once referenced by a published offer -- see the manifest for the full planned id list
 *     label: 'Frische Croissants',      // short German label shown in the admin gallery thumbnail caption
 *     category: 'bakery-cafe',          // one of STADTPOCKET_OFFER_STARTER_CATEGORIES' ids, purely for gallery grouping
 *     alt: 'Frisch gebackene Croissants auf einem Holzbrett', // German alt text for the <img>, describes the photo itself -- never promotional copy, no prices/business names
 *     url: 'https://res.cloudinary.com/<cloud>/image/upload/v.../stadtpocket-headers/<publicId>.jpg',
 *     publicId: 'stadtpocket-headers/<publicId>',
 *     width: 1200,
 *     height: 900,
 *     tags: ['gebäck', 'warm'],         // free-text, category-neutral hints only -- never a hard-coded business category; also the future AI-reference hint field
 *   }
 *
 * Deterministic ordering: entries render in array order (grouped by
 * category for display, per STADTPOCKET_OFFER_STARTER_CATEGORIES'
 * order) -- no separate sort step exists anywhere downstream of this
 * file.
 * ─────────────────────────────────────────────────────────────
 */

// Display order + German labels for the gallery's category grouping.
// Purely presentational (grouping/headings only) -- ids here are never
// validated against an offer's own business category, and adding or
// reordering a category never touches any persisted offer.
const STADTPOCKET_OFFER_STARTER_CATEGORIES = [
  { id: 'bakery-cafe', label: 'Bäckerei & Café' },
  { id: 'restaurant', label: 'Restaurant & Essen' },
  { id: 'fashion-retail', label: 'Mode & Einzelhandel' },
  { id: 'beauty-wellness', label: 'Beauty & Wellness' },
  { id: 'fitness-sport', label: 'Fitness & Sport' },
  { id: 'general-local', label: 'Allgemein / Lokales Geschäft' },
];

const STADTPOCKET_OFFER_STARTER_IMAGES = [
  { id: "bakery-croissants-01", label: "Croissants & Gebäck", category: "bakery-cafe", alt: "Croissants & Gebäck", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071557/stadtpocket-headers/angebote-starter/bakery-croissants-01.jpg", publicId: "stadtpocket-headers/angebote-starter/bakery-croissants-01", width: 1200, height: 900, tags: [] },
  { id: "bakery-bread-01", label: "Frisches Brot & Backwaren", category: "bakery-cafe", alt: "Frisches Brot & Backwaren", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071558/stadtpocket-headers/angebote-starter/bakery-bread-01.jpg", publicId: "stadtpocket-headers/angebote-starter/bakery-bread-01", width: 1200, height: 900, tags: [] },
  { id: "bakery-coffee-01", label: "Kaffee & Kuchen", category: "bakery-cafe", alt: "Kaffee & Kuchen", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071559/stadtpocket-headers/angebote-starter/bakery-coffee-01.jpg", publicId: "stadtpocket-headers/angebote-starter/bakery-coffee-01", width: 1200, height: 900, tags: [] },
  { id: "restaurant-meal-01", label: "Frisch serviert", category: "restaurant", alt: "Frisch serviert", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071560/stadtpocket-headers/angebote-starter/restaurant-meal-01.jpg", publicId: "stadtpocket-headers/angebote-starter/restaurant-meal-01", width: 1200, height: 900, tags: [] },
  { id: "restaurant-table-01", label: "Gemeinsam genießen", category: "restaurant", alt: "Gemeinsam genießen", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071561/stadtpocket-headers/angebote-starter/restaurant-table-01.jpg", publicId: "stadtpocket-headers/angebote-starter/restaurant-table-01", width: 1200, height: 900, tags: [] },
  { id: "restaurant-fresh-01", label: "Frisch & lecker", category: "restaurant", alt: "Frisch & lecker", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071562/stadtpocket-headers/angebote-starter/restaurant-fresh-01.jpg", publicId: "stadtpocket-headers/angebote-starter/restaurant-fresh-01", width: 1200, height: 900, tags: [] },
  { id: "fashion-boutique-01", label: "Neue Styles entdecken", category: "fashion-retail", alt: "Neue Styles entdecken", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071563/stadtpocket-headers/angebote-starter/fashion-boutique-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fashion-boutique-01", width: 1200, height: 900, tags: [] },
  { id: "fashion-rack-01", label: "Lieblingsstücke", category: "fashion-retail", alt: "Lieblingsstücke", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071564/stadtpocket-headers/angebote-starter/fashion-rack-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fashion-rack-01", width: 1200, height: 900, tags: [] },
  { id: "fashion-lifestyle-01", label: "Shoppen & entdecken", category: "fashion-retail", alt: "Shoppen & entdecken", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071565/stadtpocket-headers/angebote-starter/fashion-lifestyle-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fashion-lifestyle-01", width: 1200, height: 900, tags: [] },
  { id: "beauty-spa-01", label: "Entspannung & Wohlbefinden", category: "beauty-wellness", alt: "Entspannung & Wohlbefinden", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071566/stadtpocket-headers/angebote-starter/beauty-spa-01.jpg", publicId: "stadtpocket-headers/angebote-starter/beauty-spa-01", width: 1200, height: 900, tags: [] },
  { id: "beauty-skincare-01", label: "Beauty & Pflege", category: "beauty-wellness", alt: "Beauty & Pflege", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071567/stadtpocket-headers/angebote-starter/beauty-skincare-01.jpg", publicId: "stadtpocket-headers/angebote-starter/beauty-skincare-01", width: 1200, height: 900, tags: [] },
  { id: "beauty-salon-01", label: "Dein neuer Look", category: "beauty-wellness", alt: "Dein neuer Look", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071568/stadtpocket-headers/angebote-starter/beauty-salon-01.jpg", publicId: "stadtpocket-headers/angebote-starter/beauty-salon-01", width: 1200, height: 900, tags: [] },
  { id: "fitness-gym-01", label: "Fit & stark", category: "fitness-sport", alt: "Fit & stark", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071569/stadtpocket-headers/angebote-starter/fitness-gym-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fitness-gym-01", width: 1200, height: 900, tags: [] },
  { id: "fitness-training-01", label: "Gemeinsam trainieren", category: "fitness-sport", alt: "Gemeinsam trainieren", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071570/stadtpocket-headers/angebote-starter/fitness-training-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fitness-training-01", width: 1200, height: 900, tags: [] },
  { id: "fitness-active-01", label: "Dein Start ins Training", category: "fitness-sport", alt: "Dein Start ins Training", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071571/stadtpocket-headers/angebote-starter/fitness-active-01.jpg", publicId: "stadtpocket-headers/angebote-starter/fitness-active-01", width: 1200, height: 900, tags: [] },
  { id: "general-optician-01", label: "Brillen & Beratung", category: "general-local", alt: "Brillen & Beratung", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071573/stadtpocket-headers/angebote-starter/general-optician-01.jpg", publicId: "stadtpocket-headers/angebote-starter/general-optician-01", width: 1200, height: 900, tags: [] },
  { id: "general-foodtruck-01", label: "Frisch unterwegs", category: "general-local", alt: "Frisch unterwegs", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071574/stadtpocket-headers/angebote-starter/general-foodtruck-01.jpg", publicId: "stadtpocket-headers/angebote-starter/general-foodtruck-01", width: 1200, height: 900, tags: [] },
  { id: "general-flower-01", label: "Blumen & Freude", category: "general-local", alt: "Blumen & Freude", url: "https://res.cloudinary.com/dwqc6n7rn/image/upload/v1789071575/stadtpocket-headers/angebote-starter/general-flower-01.jpg", publicId: "stadtpocket-headers/angebote-starter/general-flower-01", width: 1200, height: 900, tags: [] },
];

module.exports = { STADTPOCKET_OFFER_STARTER_IMAGES, STADTPOCKET_OFFER_STARTER_CATEGORIES };
