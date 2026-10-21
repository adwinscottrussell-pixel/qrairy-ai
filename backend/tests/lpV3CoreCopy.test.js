// ============================================================
// lpV3CoreCopy.test.js — the browser copy of the shared V3 code
// (frontend/public/js/lpV3/core.js, for the Studio preview) is byte for byte
// the server's backend/src/lpV3/core.js, and it works in a browser-like
// sandbox. Change backend/src/lpV3/core.js, then copy it:
//   cp backend/src/lpV3/core.js frontend/public/js/lpV3/core.js
// Run: node tests/lpV3CoreCopy.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'backend', 'src', 'lpV3', 'core.js');
const BROWSER = path.join(ROOT, 'frontend', 'public', 'js', 'lpV3', 'core.js');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('byte-identical to the server copy', () => {
  const a = fs.readFileSync(SERVER), b = fs.readFileSync(BROWSER);
  assert.equal(b.length, a.length, 'same size');
  assert.ok(a.equals(b), 'same bytes: copy backend/src/lpV3/core.js to frontend/public/js/lpV3/core.js');
});

test('the browser copy runs without Node (window.QraivyV3) and renders like the server', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(fs.readFileSync(BROWSER, 'utf8'), sandbox, { filename: 'core.js' });
  const B = vm.runInContext('QraivyV3', sandbox);
  const S = require('../src/lpV3/core');
  const d = require('./fixtures/lpV3/localBusiness.json');
  for (const opts of [undefined, { preview: true }]) {
    const a = B.renderDesign(JSON.parse(JSON.stringify(d)), { businessName: 'Musterbäckerei' }, opts);
    const b = S.renderDesign(d, { businessName: 'Musterbäckerei' }, opts);
    assert.equal(a.html, b.html);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(B.describe())), S.describe());
  assert.equal(B.SCHEMA_VERSION, S.SCHEMA_VERSION);
});

test('only the Studio page loads it (Phase 2A-2); no customer page does', () => {
  const pages = fs.readdirSync(path.join(ROOT, 'frontend', 'public')).filter((f) => f.endsWith('.html'));
  const loaders = pages.filter((p) => fs.readFileSync(path.join(ROOT, 'frontend', 'public', p), 'utf8').includes('lpV3/core.js'));
  assert.deepEqual(loaders, ['studio.html']);
});

(async () => {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log('PASS  ' + name); }
    catch (err) { failed++; console.log('FAIL  ' + name); console.log('      ' + String(err.stack || err.message).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  process.exit(failed ? 1 : 0);
})();
