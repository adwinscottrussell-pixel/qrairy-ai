// Landing Page Studio V3, Image Phase 1 (secure shared upload foundation):
// every file it adds, and the existing production files it changes. As with
// Phase D1 (studioD1Files.js), older scope guards allow a changed file only
// through imageOnly(): the file with exactly the Image Phase 1 edits taken
// out must equal the file at `base`, byte for byte (LF).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const IMG_NEW_FILES = [
  'backend/src/data/studioImages.js',
  'backend/src/lpV3/studioImagesController.js',
  'backend/src/services/studioImageUploadService.js',
  'backend/src/services/studioImageUploadLimiter.js',
  'backend/scripts/studio-starters-upload.js',
  'backend/tests/helpers/studioImageFiles.js',
  'backend/tests/studioImages.test.js',
  'backend/tests/studioImageUpload.test.js',
];

function cut(s, text, times = 1, put = '') {
  if (s === null || s.split(text).length !== times + 1) return null;
  return s.split(text).join(put);
}
// the staging gate's Image Phase 1 lines (also taken out by studioD1Files.js before its own check)
const GATE_LINES = "  // Image Phase 1 (lpV3/studioImagesController.js): stored only in the staging STUDIO_IMAGE_FOLDER; without it 503\n" +
  "  { method: 'POST',   path: new RegExp('^/studio/pages/' + SLUG + '/images$'),  access: 'user', what: 'Studio: upload an image (own pages, verified email, staging folder only)' },\n";
function withoutImageGate(s) { return cut(s, GATE_LINES); }

const POLICY_DOC = ' *   STUDIO_IMAGE_FOLDER              optional. Storage folder for Landing\n' +
  ' *                                    Page Studio V3 image uploads (Image\n' +
  ' *                                    Phase 1); same rules as\n' +
  ' *                                    DEAL_IMAGE_FOLDER, and different from\n' +
  ' *                                    both other folders. Without it a\n' +
  ' *                                    staging server refuses Studio uploads.\n';
const POLICY_BLOCK = "  // Landing Page Studio V3 uploads (Image Phase 1): an explicit staging folder, or none at all.\n" +
  "  const studioFolder = String(env.STUDIO_IMAGE_FOLDER || '').trim();\n" +
  '  if (studioFolder) {\n' +
  "    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(studioFolder)) problems.push('STUDIO_IMAGE_FOLDER may only contain lowercase letters, digits and hyphens.');\n" +
  "    else if (PRODUCTION_STORAGE_FOLDERS.includes(studioFolder)) problems.push('STUDIO_IMAGE_FOLDER is a production folder. Staging Studio images must go somewhere else.');\n" +
  "    else if (!/(^|-)staging(-|$)/.test(studioFolder)) problems.push('STUDIO_IMAGE_FOLDER must contain the word \"staging\" (for example qraivy-studio-staging).');\n" +
  "    else if (studioFolder === folder || studioFolder === dealFolder) problems.push('STUDIO_IMAGE_FOLDER must differ from VOICE_AUDIO_FOLDER and DEAL_IMAGE_FOLDER.');\n" +
  '  }\n\n';
const IMG_REVERT = {
  'backend/src/config/stagingPolicy.js': (s) => {
    s = cut(s, POLICY_DOC);
    s = cut(s, POLICY_BLOCK);
    s = cut(s, "    studioImageFolder: studioFolder || null,\n");
    return cut(s, ", 'qraivy-studio', 'qraivy-studio-starters'];", 1, '];');
  },
  // stagingGate.js also carries D1's edits: it is checked by studioD1Files.js (which takes these lines out first)
};
const IMG_CHANGED_FILES = Object.keys(IMG_REVERT);

const lf = (s) => s.replace(/\r\n/g, '\n');
function imageOnly(root, base, file) {
  const revert = IMG_REVERT[file];
  if (!revert) return false;
  const now = lf(fs.readFileSync(path.join(root, file), 'utf8'));
  const then = lf(execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  return revert(now) === then;
}
// an Image Phase 1 production file that differs from ae2861e by exactly its edits
const isImageChange = (root, file) => IMG_CHANGED_FILES.includes(file) && imageOnly(root, 'ae2861e', file);
const IMG_EXCLUDES = IMG_NEW_FILES.concat(IMG_CHANGED_FILES).map((f) => ':(exclude)' + f);

module.exports = { IMG_NEW_FILES, IMG_CHANGED_FILES, IMG_EXCLUDES, imageOnly, isImageChange, withoutImageGate, GATE_LINES };
