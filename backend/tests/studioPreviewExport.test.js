// ============================================================
// studioPreviewExport.test.js — the Studio-files-only upload for the private
// Vercel project qraivy-studio-staging (backend/staging/studio-preview-export.js):
// - exactly the Studio page, its CSS / JS, the two icons, plus the generated
//   vercel.json and robots.txt; every file studio.html loads is included;
// - the generated vercel.json has no rewrites (nothing reaches the
//   production API), sends "/" to the Studio and sets noindex / no-store;
// - a vercel.json from the repository is never uploaded; a missing
//   dependency stops the export;
// - an export reads the commit, not the working tree, and refuses a
//   non-empty output folder;
// - the shared vercel.json files are not changed for the Studio.
// Run: node tests/studioPreviewExport.test.js
// ============================================================
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const X = require('../staging/studio-preview-export');

const REPO = path.join(__dirname, '..', '..');
const PUB = path.join(REPO, 'frontend', 'public');
const fsSource = {
  list: (dir) => fs.readdirSync(path.join(PUB, dir), { recursive: true }).map((f) => dir + String(f).replace(/\\/g, '/')).filter((f) => fs.statSync(path.join(PUB, f)).isFile()),
  read: (name) => fs.readFileSync(path.join(PUB, name)),
};
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the upload: the Studio files, two icons, the three demo photos and the generated files, nothing else', () => {
  const names = [...X.buildUpload(fsSource).keys()].sort();
  const studio = fs.readdirSync(path.join(PUB, 'js', 'studio')).map((f) => 'js/studio/' + f);
  const photos = ['bakery-croissants-01', 'bakery-bread-01', 'bakery-coffee-01'].map((id) => 'images/deals/starter/' + id + '.jpg');
  assert.deepEqual(names, ['apple-touch-icon.png', 'css/studio.css', 'dashboard-shell.css', 'favicon.ico', 'js/admin-shell.js', 'js/lpV3/core.js', 'js/lpV3/gallery-nav.js', 'js/qraivy-lang.js']
    .concat(studio, photos, ['robots.txt', 'studio.html', 'vercel.json']).sort());
});

test('every local copy the Studio shows for the demo photos is in the upload (2A-3H)', () => {
  const files = X.buildUpload(fsSource);
  const DEMO = require('../../frontend/public/js/studio/studio-demo-images.js');
  assert.ok(DEMO.STARTERS.length >= 3);
  for (const id of DEMO.STARTERS) assert.ok(files.has(DEMO.localSrc(DEMO.cloudinaryUrl(id))), id);
});

test('every script, stylesheet and CSS image studio.html loads is in the upload', () => {
  const files = X.buildUpload(fsSource);
  const deps = X.dependencies(files);
  for (const d of ['js/studio/studio-routing.js', 'js/lpV3/core.js', 'css/studio.css', 'dashboard-shell.css', 'apple-touch-icon.png']) assert.ok(deps.includes(d), d);
  for (const d of deps) assert.ok(files.has(d), d);
});

test('generated vercel.json: no rewrites, "/" -> studio.html, noindex / no-store; robots.txt disallows all', () => {
  const files = X.buildUpload(fsSource);
  const cfg = JSON.parse(files.get('vercel.json').toString('utf8'));
  assert.deepEqual(Object.keys(cfg).sort(), ['headers', 'redirects']);
  assert.equal(cfg.rewrites, undefined);
  assert.deepEqual(cfg.redirects, [{ source: '/', destination: '/studio.html', permanent: false }]);
  const h = Object.fromEntries(cfg.headers[0].headers.map((x) => [x.key, x.value]));
  assert.equal(cfg.headers[0].source, '/(.*)');
  assert.equal(h['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(h['Cache-Control'], 'no-store');
  assert.doesNotMatch(files.get('vercel.json').toString('utf8'), /qraivy\.com|https?:/);
  assert.equal(files.get('robots.txt').toString('utf8'), 'User-agent: *\nDisallow: /\n');
});

test('nothing in the upload mentions the production API', () => {
  for (const [n, buf] of X.buildUpload(fsSource)) if (!/\.(png|ico|jpg)$/.test(n)) assert.doesNotMatch(buf.toString('utf8'), /api\.qraivy\.com/, n);
});

test('refuses a repository vercel.json and a missing dependency', () => {
  const withConfig = { list: (d) => fsSource.list(d).concat(d === 'js/studio/' ? ['js/studio/vercel.json'] : []), read: (n) => (n.endsWith('vercel.json') ? Buffer.from('{}') : fsSource.read(n)) };
  assert.throws(() => X.buildUpload(withConfig), /refusing to upload a vercel\.json/);
  const html = fsSource.read('studio.html').toString('utf8').replace('<script src="js/studio/studio-shell.js"></script>', '<script src="js/studio/studio-shell.js"></script><script src="js/extra.js"></script>');
  const extra = { list: fsSource.list, read: (n) => (n === 'studio.html' ? Buffer.from(html) : fsSource.read(n)) };
  assert.throws(() => X.buildUpload(extra), /not in the upload: js\/extra\.js/);
});

test('export: reads the commit (not the working tree), writes upload + manifest, refuses a non-empty folder', () => {
  const head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-export-'));
  try {
    const m = X.exportCommit(REPO, 'HEAD', out);
    assert.equal(m.commit, head);
    assert.equal(m.project, 'qraivy-studio-staging');
    const base = path.join(out, 'upload', 'frontend', 'public');
    for (const f of m.files) {
      const buf = fs.readFileSync(path.join(base, ...f.path.split('/')));
      assert.equal(buf.length, f.bytes, f.path);
      if (!m.generated.includes(f.path)) assert.ok(buf.equals(execFileSync('git', ['-C', REPO, 'show', head + ':frontend/public/' + f.path])), f.path + ' is the committed version');
    }
    assert.deepEqual(fs.readdirSync(out).sort(), ['manifest.json', 'upload']);
    assert.throws(() => X.exportCommit(REPO, 'HEAD', out), /not empty/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('the shared vercel.json files are not changed for the Studio', () => {
  for (const f of ['vercel.json', 'frontend/public/vercel.json']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert.doesNotMatch(src, /studio/i, f);
    assert.match(src, /"destination": "https:\/\/api\.qraivy\.com\/lp\/:path\*"/, f + ' keeps its rewrites');
    assert.equal(execFileSync('git', ['-C', REPO, 'diff', 'HEAD', '--', f], { encoding: 'utf8' }), '', f + ' has no uncommitted change');
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
}
console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
process.exit(failed ? 1 : 0);
