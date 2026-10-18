// Phase 0 security release (S1-S5): every file it changes. Older scope
// guards exclude exactly these paths and keep checking everything else; the
// Phase 0 tests (lpRenderEscaping, stampCodeAuth, lpGetAuth, staffPinAuth)
// pin what changed inside them.
const PHASE0_FRONTEND = ['frontend/public/stamp-scanner.html', 'frontend/public/js/voice-greeting-editor.js', 'frontend/public/smart-qr-detail.html'];

const PHASE0_FILES = PHASE0_FRONTEND.concat([
  'backend/src/controllers/lpController.js',
  'backend/src/services/staffPin.js',
  'backend/tests/helpers/phase0Files.js',
  'backend/tests/helpers/phase0Revert.js',
  'backend/tests/helpers/phase0Harness.js',
  'backend/tests/dealsPreviewSafety.test.js',
  'backend/tests/lpRenderEscaping.test.js',
  'backend/tests/stampCodeAuth.test.js',
  'backend/tests/lpGetAuth.test.js',
  'backend/tests/staffPinAuth.test.js',
  // older tests adjusted to the intended Phase 0 behaviour
  'backend/tests/academyPage.test.js',
  'backend/tests/lpDeleteAuth.test.js',
  'backend/tests/lpStagingGate.test.js',
  'backend/tests/lpStagingRouting.test.js',
  'backend/tests/lpVoiceGreetings.test.js',
  'backend/tests/lpVoiceRecordingLimits.test.js',
  'backend/tests/pushCampaignAuth.test.js',
  'backend/tests/pushPageSubscriptions.test.js',
  'backend/tests/slugReservation.test.js',
  'backend/tests/welcomeUnified.test.js',
]);

const PHASE0_EXCLUDES = PHASE0_FRONTEND.map((f) => ':(exclude)' + f);

module.exports = { PHASE0_FRONTEND, PHASE0_FILES, PHASE0_EXCLUDES };
