// Landing Page Studio V3 Phase 1 (foundation): every file it adds or changes.
// Older scope guards allow exactly these. schema.prisma is not simply
// excluded: withoutV3() removes exactly the two V3 blocks, so the older
// guards keep checking every other line of the schema byte for byte.
const LPV3_FILES = [
  'backend/prisma/schema.prisma',
  'backend/prisma/migrations/20261021090000_add_page_design_v3/migration.sql',
  'backend/src/lpV3/core.js',
  'backend/src/lpV3/importLegacy.js',
  'backend/tests/fixtures/legacyPages/fixtures.json',
  'backend/tests/fixtures/legacyPages/legacyRender.golden.json',
  'backend/tests/fixtures/lpV3/localBusiness.json',
  'backend/tests/helpers/legacyRenderHarness.js',
  'backend/tests/helpers/lpV3Files.js',
  'backend/tests/legacyRenderGolden.test.js',
  'backend/tests/lpV3Validate.test.js',
  'backend/tests/lpV3Render.test.js',
  'backend/tests/lpV3ImportLegacy.test.js',
  'backend/tests/lpV3Migration.test.js',
  'backend/tests/lpV3Scope.test.js',
  // Phase 2A-1 (core additions): preview mode, describe(), Gallery and
  // Products, and the browser copy of core.js for the Studio preview
  'frontend/public/js/lpV3/core.js',
  'backend/tests/fixtures/lpV3/allRenderedVariants.json',
  'backend/tests/fixtures/lpV3/publicRender.golden.json',
  'backend/tests/lpV3Preview.test.js',
  'backend/tests/lpV3CoreCopy.test.js',
  // Phase 2A-2 (Studio shell): a new page and its own files only; no
  // existing page links to it yet
  'frontend/public/studio.html',
  'frontend/public/css/studio.css',
  'frontend/public/js/studio/studio-routing.js',
  'frontend/public/js/studio/studio-demo.js',
  'frontend/public/js/studio/studio-shell.js',
  'backend/tests/studioShell.test.js',
  'backend/tests/studioShell.browser.test.js',
  'backend/tests/adminNavShell.test.js',
  // Phase 2A-3A (Hero editing): in-memory draft with Undo / Redo, inspector,
  // live preview with click-to-select; still local only, nothing saved
  'frontend/public/js/studio/studio-store.js',
  'frontend/public/js/studio/studio-preview.js',
  'frontend/public/js/studio/studio-inspector.js',
  'backend/tests/studioStore.test.js',
  'backend/tests/studioInspector.test.js',
  'backend/tests/studioPreviewBridge.test.js',
  'backend/tests/studioEditor.browser.test.js',
  // Phase 2A-3B (Buttons editing): same files, plus its browser test
  'backend/tests/studioButtonsEditor.browser.test.js',
  // Phase 2A-3C (Social Media editing): same files, plus its browser test
  'backend/tests/studioSocialEditor.browser.test.js',
  // Phase 2A-3D (Contact editing): same files, plus its browser test
  'backend/tests/studioContactEditor.browser.test.js',
  // Phase 2A-3E (Opening Hours editing): same files, plus its browser test
  'backend/tests/studioHoursEditor.browser.test.js',
  // Phase 2A-3F (Products editing): same files, plus its browser test
  'backend/tests/studioProductsEditor.browser.test.js',
  // Phase 2A-3G (Text editing): same files, plus its browser test; Plain is
  // text only in core.js (golden revision 2026-10-24)
  'backend/tests/studioTextEditor.browser.test.js',
  // Phase 2A-3H (Gallery editing): same files, the Studio-only demo photo
  // mapping and its browser test; Gallery caption contrast in core.js
  'frontend/public/js/studio/studio-demo-images.js',
  'backend/tests/studioGalleryEditor.browser.test.js',
  'backend/tests/studioDemoImages.test.js',
  // the demo photos behind a sign-in (live preview fix, 2A-3H)
  'backend/tests/studioPreviewAuth.browser.test.js',
  // Gallery carousel navigation: buttons rendered by core.js (no script), the
  // trusted first-party controller that runs them, and its browser tests
  // (Chrome; Edge, Firefox and WebKit)
  'backend/tests/studioGalleryCarousel.browser.test.js',
  'frontend/public/js/lpV3/gallery-nav.js',
  'backend/tests/studioGalleryNavBrowsers.browser.test.js',
  // Phase D2 (Deals preview): the owner's real deals in the Studio preview,
  // read only through the existing Deals GET endpoints (one data file), the
  // Deals renderer in core.js, the inspector's Deals editing, and their tests
  'frontend/public/js/studio/studio-deals-data.js',
  'backend/tests/studioDealsData.test.js',
  'backend/tests/lpV3Deals.test.js',
  'backend/tests/studioDealsPreview.browser.test.js',
  'backend/tests/helpers/studioDealsServer.js',
  // Deals connection (deals-preview): the QRAIVY sign-in on the one connected
  // preview address (studio-routing.js), loaded by studio-auth.js only
  'frontend/public/js/studio/studio-auth.js',
  'backend/tests/studioDealsConnection.test.js',
  // Phase A / B (customer pages): the owner's own pages for the Studio
  // (GET /studio/pages, GET and PUT /studio/pages/:slug/design: read, and
  // save the Studio draft), the Studio's page selector, Save Draft and their tests
  'backend/src/lpV3/studioPagesController.js',
  'backend/src/lpV3/studioPagesRoutes.js',
  'frontend/public/js/studio/studio-pages-data.js',
  'backend/tests/studioPages.test.js',
  'backend/tests/studioPagesData.test.js',
  'backend/tests/studioPagesLoad.browser.test.js',
  'backend/tests/studioPagesSave.browser.test.js',
  'backend/tests/helpers/studioPagesServer.js',
  // Studio preview mode: the private Vercel project qraivy-studio-staging
  // (routing + shell label above), its Studio-files-only export, its tests
  'backend/staging/studio-preview-export.js',
  'backend/staging/README.md',
  'backend/tests/studioPreviewExport.test.js',
  'backend/tests/studioPreviewMode.browser.test.js',
  // older scope guards that now allow the files above
  'backend/tests/academyPage.test.js',
  'backend/tests/lpDeleteAuth.test.js',
  'backend/tests/pushPageSubscriptions.test.js',
  // ...and those comparing committed history (they saw the V3 migration only
  // once it was committed; fixed in Phase 2A-1)
  'backend/tests/dealImageMaster.test.js',
  'backend/tests/lpStagingFrontend.test.js',
  'backend/tests/lpStagingRouting.test.js',
  'backend/tests/lpVoicePreview.test.js',
  'backend/tests/pushLocalization.test.js',
  'backend/tests/welcomeUnified.test.js',
  'backend/tests/slugReservation.test.js',
  'docs/architecture/LP_STUDIO_V3.md',
];

// The browser copy of core.js is pinned by tests/lpV3CoreCopy.test.js (byte for byte
// the server file) and lpV3Scope.test.js (the only new frontend file).
// The Studio files (new, loaded only by studio.html) are pinned by
// tests/studioShell.test.js and lpV3Scope.test.js.
const LPV3_NEW_FRONTEND = ['frontend/public/js/lpV3/core.js', 'frontend/public/js/lpV3/gallery-nav.js', 'frontend/public/studio.html', 'frontend/public/css/studio.css', 'frontend/public/js/studio'];
const LPV3_EXCLUDES = [':(exclude)backend/prisma/schema.prisma', ':(exclude)backend/prisma/migrations/20261021090000_add_page_design_v3']
  .concat(LPV3_NEW_FRONTEND.map((f) => ':(exclude)' + f));

// schema.prisma (LF line endings) without the V3 column block and models.
function withoutV3(schema) {
  let s = schema;
  const colStart = s.indexOf('  // Landing Page Studio V3 (2026-10, additive). Which renderer');
  if (colStart !== -1) {
    const colEnd = s.indexOf('pageDesign PageDesign?\n\n', colStart);
    if (colEnd === -1) throw new Error('V3 column block changed shape');
    s = s.slice(0, colStart) + s.slice(colEnd + 'pageDesign PageDesign?\n\n'.length);
  }
  const modStart = s.indexOf('\n\n// Landing Page Studio V3 (2026-10, additive). One design per landing page');
  if (modStart !== -1) {
    const end = '@@unique([designId, version])\n}';
    const modEnd = s.indexOf(end, modStart);
    if (modEnd === -1) throw new Error('V3 models changed shape');
    s = s.slice(0, modStart) + s.slice(modEnd + end.length);
  }
  return s;
}

// Phase A: the server entry point's only V3 change is the Studio pages mount
// (these exact two lines). True when index.js, without exactly them, equals
// index.js at `base` (unchanged from 12df76d to ae2861e); any other change fails.
const STUDIO_MOUNT = "// Landing Page Studio V3 (Phase A): the signed-in owner's own pages, read only\napp.use('/studio', require('./lpV3/studioPagesRoutes'));\n";
function indexOnlyStudioMount(root, base) {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const now = lf(fs.readFileSync(path.join(root, 'backend', 'src', 'index.js'), 'utf8'));
  if (now.split(STUDIO_MOUNT).length !== 2) return false;
  return now.replace(STUDIO_MOUNT, '') === lf(execFileSync('git', ['show', base + ':backend/src/index.js'], { cwd: root, encoding: 'utf8' }));
}

module.exports = { LPV3_FILES, LPV3_EXCLUDES, LPV3_NEW_FRONTEND, withoutV3, STUDIO_MOUNT, indexOnlyStudioMount };
