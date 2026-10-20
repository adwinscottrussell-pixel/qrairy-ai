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
  // older scope guards that now allow the files above
  'backend/tests/academyPage.test.js',
  'backend/tests/lpDeleteAuth.test.js',
  'backend/tests/pushPageSubscriptions.test.js',
  'docs/architecture/LP_STUDIO_V3.md',
];

const LPV3_EXCLUDES = [':(exclude)backend/prisma/schema.prisma', ':(exclude)backend/prisma/migrations/20261021090000_add_page_design_v3'];

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

module.exports = { LPV3_FILES, LPV3_EXCLUDES, withoutV3 };
