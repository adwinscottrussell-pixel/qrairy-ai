// ============================================================
// deal-starter-images.js — QRAIVY Deal Builder starter-image catalog.
//
// The 18 founder-approved starter images (six categories, three each),
// 1200 x 900 px, 4:3, JPEG. Files live in images/deals/starter/ and are
// byte-identical copies of the approved package
// "stadtpocket_angebote_starter_18_FINAL" (2026-09-10); each entry's
// sha256 below is the checksum of that original, so any later change to
// a file is detectable (tests/dealsPage.test.js checks it).
//
// ORIGIN — kept per image for customer-facing disclosure later:
// every image here is AI-generated (origin.type 'ai_generated').
// origin.sourceMaster is the generator's own master file name as recorded
// in the package manifest. The package records no generator name, date or
// licence text, and the files carry no embedded provenance metadata, so
// none is stated here. Wherever one of these images is shown, the visible
// label "AI · KI-generiert" must be shown with it (EU AI Act Art. 50);
// the Deal Builder reads origin.type to decide that, never a file name.
//
// Plain data, same convention as js/smart-qr-categories.js: no network
// call, no build step. Labels are bilingual; ids are stable and must not
// be reused for a different picture.
// ============================================================
window.QRAIVY_DEAL_STARTER_IMAGES = {
  basePath: 'images/deals/starter/',
  aiLabel: 'AI · KI-generiert',
  categories: [
    { id: 'bakery-cafe', label: { en: 'Bakery & Café', de: 'Bäckerei & Café' } },
    { id: 'restaurant', label: { en: 'Restaurant & Food', de: 'Restaurant & Essen' } },
    { id: 'fashion-retail', label: { en: 'Fashion & Retail', de: 'Mode & Einzelhandel' } },
    { id: 'beauty-wellness', label: { en: 'Beauty & Wellness', de: 'Beauty & Wellness' } },
    { id: 'fitness-sport', label: { en: 'Fitness & Sport', de: 'Fitness & Sport' } },
    { id: 'general-local', label: { en: 'General / Local Business', de: 'Allgemein / Lokales Geschäft' } }
  ],
  images: [
    { id: 'bakery-croissants-01', category: 'bakery-cafe', file: 'bakery-croissants-01.jpg', width: 1200, height: 900,
      label: { en: 'Croissants & pastries', de: 'Croissants & Gebäck' },
      origin: { type: 'ai_generated', sourceMaster: 'a_warm_appetizing_close_up_bakery_scene_a_rustic.png', sha256: '7450b0d7bca77efbf0108a288ac07f2c5a092a4544a0f3c0e517288881f4f69f' } },
    { id: 'bakery-bread-01', category: 'bakery-cafe', file: 'bakery-bread-01.jpg', width: 1200, height: 900,
      label: { en: 'Fresh bread & baked goods', de: 'Frisches Brot & Backwaren' },
      origin: { type: 'ai_generated', sourceMaster: 'a_warm_rustic_photorealistic_close_up_scene_of_f.png', sha256: '580b626cf390ad11215a331ff598902e8d44ec52adb7bcbdca081f520edb0094' } },
    { id: 'bakery-coffee-01', category: 'bakery-cafe', file: 'bakery-coffee-01.jpg', width: 1200, height: 900,
      label: { en: 'Coffee & cake', de: 'Kaffee & Kuchen' },
      origin: { type: 'ai_generated', sourceMaster: 'a_cozy_warm_sunlit_café_scene_in_shallow_depth_o.png', sha256: '3e451a238d7700c50502f37a296b37ceda9fa4038eeda3a699ddc77e7cb4fe49' } },
    { id: 'restaurant-meal-01', category: 'restaurant', file: 'restaurant-meal-01.jpg', width: 1200, height: 900,
      label: { en: 'Freshly served', de: 'Frisch serviert' },
      origin: { type: 'ai_generated', sourceMaster: 'a_warm_inviting_shallow_depth_of_field_restauran.png', sha256: '4bdee6d3a24c0e47fb106da9f2c9e79d5111b5003028c79feb1c5c2b66461a85' } },
    { id: 'restaurant-table-01', category: 'restaurant', file: 'restaurant-table-01.jpg', width: 1200, height: 900,
      label: { en: 'Enjoy together', de: 'Gemeinsam genießen' },
      origin: { type: 'ai_generated', sourceMaster: 'a_warm_inviting_restaurant_dining_scene_shot_in_s.png', sha256: '62e89f021be54767319c63db6c8cc6964728e387045a5816fe88a34536d16680' } },
    { id: 'restaurant-fresh-01', category: 'restaurant', file: 'restaurant-fresh-01.jpg', width: 1200, height: 900,
      label: { en: 'Fresh & tasty', de: 'Frisch & lecker' },
      origin: { type: 'ai_generated', sourceMaster: 'a_high_resolution_cinematic_shallow_depth_of_fie.png', sha256: 'a1082831a81189018077a075362f07e7bc1397a9f655b144fa2c2558073432f6' } },
    { id: 'fashion-boutique-01', category: 'fashion-retail', file: 'fashion-boutique-01.jpg', width: 1200, height: 900,
      label: { en: 'Discover new styles', de: 'Neue Styles entdecken' },
      origin: { type: 'ai_generated', sourceMaster: 'wide_bright_stylish_boutique_interior_scene_a_h.png', sha256: 'c645f5fa9221352ccc43c7e561f290c59472965e064005725631a619f4419a4a' } },
    { id: 'fashion-rack-01', category: 'fashion-retail', file: 'fashion-rack-01.jpg', width: 1200, height: 900,
      label: { en: 'Favourite pieces', de: 'Lieblingsstücke' },
      origin: { type: 'ai_generated', sourceMaster: 'wide_well_lit_stylish_boutique_closet_like_retai.png', sha256: '80fe716ed8cb17dfd6b5a25ef6f817c8355900c651746361fd7b79f1f5f328e2' } },
    { id: 'fashion-lifestyle-01', category: 'fashion-retail', file: 'fashion-lifestyle-01.jpg', width: 1200, height: 900,
      label: { en: 'Shop & discover', de: 'Shoppen & entdecken' },
      origin: { type: 'ai_generated', sourceMaster: 'interior_boutique_shop_scene_warm_natural_lightin.png', sha256: '4da1734d4d9bb2c9c71eada8ed52b1dbfcce2e3fd626e160eef17a1409894596' } },
    { id: 'beauty-spa-01', category: 'beauty-wellness', file: 'beauty-spa-01.jpg', width: 1200, height: 900,
      label: { en: 'Relaxation & well-being', de: 'Entspannung & Wohlbefinden' },
      origin: { type: 'ai_generated', sourceMaster: 'a_warm_serene_spa_wellness_scene_a_cozy_softly.png', sha256: 'c9a00c4473e59ed50e637d03ab477ad57530ac19c663dbc4e41130ced7539b2d' } },
    { id: 'beauty-skincare-01', category: 'beauty-wellness', file: 'beauty-skincare-01.jpg', width: 1200, height: 900,
      label: { en: 'Beauty & care', de: 'Beauty & Pflege' },
      origin: { type: 'ai_generated', sourceMaster: 'a_clean_modern_spa_beauty_clinic_scene_in_warm_na.png', sha256: '6244eba8a5d2c51a441f3d8b2613b35838f24e0b1abbf3ff5341ed9dca8dd6ed' } },
    { id: 'beauty-salon-01', category: 'beauty-wellness', file: 'beauty-salon-01.jpg', width: 1200, height: 900,
      label: { en: 'Your new look', de: 'Dein neuer Look' },
      origin: { type: 'ai_generated', sourceMaster: 'a_modern_stylish_hair_salon_interior_scene_a_war.png', sha256: 'dfe6780b47d2f1d021a7412bd279f792f0ad43f80fc747c11c97ad5977c3f3a0' } },
    { id: 'fitness-gym-01', category: 'fitness-sport', file: 'fitness-gym-01.jpg', width: 1200, height: 900,
      label: { en: 'Fit & strong', de: 'Fit & stark' },
      origin: { type: 'ai_generated', sourceMaster: 'wide_interior_gym_scene_realistic_photo_style_sh.png (text-cleaned exact approved master)', sha256: '08623143e781f133e25467ed1e17768bc64b013747818cb688c7d667515ce477' } },
    { id: 'fitness-training-01', category: 'fitness-sport', file: 'fitness-training-01.jpg', width: 1200, height: 900,
      label: { en: 'Train together', de: 'Gemeinsam trainieren' },
      origin: { type: 'ai_generated', sourceMaster: 'wide_realistic_modern_gym_fitness_studio_group_t.png (text-cleaned exact approved master)', sha256: '58a4af2380d209e35c96238f47e6ff66af6cf98f18fb3eeb0f478cd491606525' } },
    { id: 'fitness-active-01', category: 'fitness-sport', file: 'fitness-active-01.jpg', width: 1200, height: 900,
      label: { en: 'Start your training', de: 'Dein Start ins Training' },
      origin: { type: 'ai_generated', sourceMaster: 'a_bright_modern_gym_reception_scene_in_a_realisti.png', sha256: '30952cf74270781e992afdb9b387c5edfc014051ca1644d354379453310d9627' } },
    { id: 'general-optician-01', category: 'general-local', file: 'general-optician-01.jpg', width: 1200, height: 900,
      label: { en: 'Glasses & advice', de: 'Brillen & Beratung' },
      origin: { type: 'ai_generated', sourceMaster: 'a_crisp_photorealistic_well_lit_interior_scene_i.png (text-cleaned exact approved master)', sha256: '187f9bd64a22651674d1effe4f7938d7f07782f57ee37655c3268cc8fcb34661' } },
    { id: 'general-foodtruck-01', category: 'general-local', file: 'general-foodtruck-01.jpg', width: 1200, height: 900,
      label: { en: 'Fresh on the go', de: 'Frisch unterwegs' },
      origin: { type: 'ai_generated', sourceMaster: 'outdoor_urban_food_truck_scene_candid_street_phot.png (text-cleaned exact approved master)', sha256: 'c784577b7d89ca36d31c917d612e3f7cff59e09daec716650d5b9a0c81a553f4' } },
    { id: 'general-flower-01', category: 'general-local', file: 'general-flower-01.jpg', width: 1200, height: 900,
      label: { en: 'Flowers & joy', de: 'Blumen & Freude' },
      origin: { type: 'ai_generated', sourceMaster: 'wide_bright_naturalistic_photo_of_a_flower_shop.png', sha256: '81ea581b41c91792887cfb18b3d587cbe9d0a352a8d79477df6ecf15afc324c7' } }
  ]
};
