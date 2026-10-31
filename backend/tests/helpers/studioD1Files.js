// Landing Page Studio V3 Phase D1 (secure draft creation): every file it adds,
// and the existing production files it changes. Older scope guards allow the
// changed files only through d1Only(): the file with exactly the D1 edits
// taken out must equal the file at `base`, byte for byte (LF), so any other
// change to these files still fails.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const D1_NEW_FILES = [
  'backend/src/lpV3/draftPolicy.js',
  'backend/src/lpV3/studioDraftsController.js',
  'backend/src/middleware/publicDraftGuard.js',
  'backend/prisma/migrations/20261031090000_add_studio_draft_creation/migration.sql',
  'backend/tests/helpers/studioD1Files.js',
  'backend/tests/studioDrafts.test.js',
  'backend/tests/studioDraftsStaging.test.js',
  'backend/tests/publicDraftGuard.test.js',
  'backend/tests/lpPublishDraftGuard.test.js',
  'backend/tests/studioDraftMigration.test.js',
];

// removes `text` exactly `times` times (else null)
function cut(s, text, times = 1, put = '') {
  if (s === null || s.split(text).length !== times + 1) return null;
  return s.split(text).join(put);
}
const LP_ROUTES_HEADER = "const { publicDraftGuard } = require('../middleware/publicDraftGuard');\nconst router  = express.Router();\n" +
  '// Studio V3 drafts are private (Phase D1): every signed-out route below that\n' +
  '// works with a page\'s slug answers 404 for a draft (middleware/publicDraftGuard.js).\n' +
  '// Not guarded, on purpose: GET /lp/:slug (handleServeLP answers 404 for a\n' +
  '// draft itself and never caches one), GET /lp/wallet-hero/:slug (reads no\n' +
  '// page), POST /lp (refuses drafts itself), and the signed-in owner routes.\n' +
  'const draft = publicDraftGuard();\n';
const D1_REVERT = {
  'backend/src/middleware/auth.js': (s) => cut(cut(s,
    ' * Attaches req.userId on success, and the verified token payload as\n * req.authClaims (read-only use: lpV3/draftPolicy.js on staging).\n', 1, ' * Attaches req.userId on success.\n'),
    '    req.authClaims = payload;\n'),
  'backend/src/middleware/stagingGate.js': (s) => {
    s = cut(s, ' *\n * Landing Page Studio V3 (Phase D1): the Studio API (lpV3/studioPagesRoutes.js)\n * is allowed as "user": list own pages, load and save a page\'s draft, create\n * a draft. Its own checks still apply (ownership, verified email, limits).\n');
    if (s === null) return null;
    const lines = s.split('\n');
    const studio = lines.filter((l) => /^  \{ method: '(GET|PUT|POST)', +path: .*studio.*access: 'user', what: 'Studio: /.test(l));
    return studio.length === 4 ? lines.filter((l) => !studio.includes(l)).join('\n') : null;
  },
  'backend/src/routes/lpRoutes.js': (s) => {
    s = cut(s, LP_ROUTES_HEADER, 1, 'const router  = express.Router();\n');
    s = cut(s, "router.post('/lp/chat', publicDraftGuard((req) => req.body && req.body.slug), handleChatLP);", 1, "router.post('/lp/chat', handleChatLP);");
    s = cut(s, "/:slug', draft, async", 1, "/:slug', async");
    // every other guarded route: "..., draft, handleX" (18 routes)
    return cut(s, "', draft, handle", 18, "', handle");
  },
  'backend/src/controllers/lpController.js': (s) => cut(s,
    '      // Studio V3 (Phase D1): an unpublished Studio draft is never written or\n' +
    '      // made live through this legacy route, not even by its owner. It is\n' +
    '      // changed in the Studio only (and published there, later).\n' +
    "      if (existing.status === 'draft') {\n" +
    "        return res.status(409).json({ error: 'studio_draft', message: 'This page is an unpublished Studio draft. Please open it in the Studio.' });\n" +
    '      }\n'),
  'backend/src/utils/tierSystem.js': (s) => cut(cut(s,
    "// (StadtPocket-linked pages included). Unpublished Studio drafts\n// (status 'draft', Phase D1) are not counted: they have their own limit\n// (lpV3/draftPolicy.js). Legacy QR.businessName records and basic/static QR\n// codes are not Smart QR Pages.\n",
    1, '// (drafts and StadtPocket-linked pages included). Legacy QR.businessName\n// records and basic/static QR codes are not Smart QR Pages.\n'),
    "count({ where: { userId, status: { not: 'draft' } } });", 1, 'count({ where: { userId } });'),
};
const D1_CHANGED_FILES = Object.keys(D1_REVERT);

const lf = (s) => s.replace(/\r\n/g, '\n');
// true when `file` differs from `base` by exactly the D1 edits
function d1Only(root, base, file) {
  const revert = D1_REVERT[file];
  if (!revert) return false;
  const now = lf(fs.readFileSync(path.join(root, file), 'utf8'));
  const then = lf(execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  return revert(now) === then;
}

// schema.prisma (LF) without the D1 model block
const D1_MODEL_START = '\n\n// Landing Page Studio V3 (Phase D1, additive). One row per Studio draft';
function withoutD1(schema) {
  const start = schema.indexOf(D1_MODEL_START);
  if (start === -1) return schema;
  const end = '@@index([userId, createdAt])\n}';
  const stop = schema.indexOf(end, start);
  if (stop === -1) throw new Error('D1 model changed shape');
  return schema.slice(0, start) + schema.slice(stop + end.length);
}

// the text of a D1-changed file with exactly the D1 edits taken out (null if they are not there as expected)
function revertD1(file, text) { return D1_REVERT[file](lf(text)); }
// a D1-changed production file that differs from ae2861e by exactly the D1 edits
const isD1Change = (root, file) => D1_CHANGED_FILES.includes(file) && d1Only(root, 'ae2861e', file);
const D1_EXCLUDES = D1_NEW_FILES.concat(D1_CHANGED_FILES).map((f) => ':(exclude)' + f);

module.exports = { D1_NEW_FILES, D1_CHANGED_FILES, D1_EXCLUDES, d1Only, withoutD1, revertD1, isD1Change };
