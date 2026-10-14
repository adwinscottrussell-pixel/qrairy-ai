// ============================================================
// editorPhonePreview.test.js — the phone preview in the Smart Landing
// Page editor (smart-qr-detail.html) is drawn smaller so the whole device
// fits the window.
//
// Static checks: the size is a CSS transform on the device shell (the
// page inside keeps its real 355 px phone width), it shrinks further in
// shorter windows, it applies on desktop only, and the 774 px the margin
// compensation is based on still matches the device markup.
//
// Run: node tests/editorPhonePreview.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'smart-qr-detail.html'), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); } }

const at = page.indexOf('<style id="sqd-phone-size">');
const css = at === -1 ? '' : page.slice(at, page.indexOf('</style>', at));

test('one style block, in <head>, after the shared and Admin shell styles', () => {
  assert.equal((page.match(/<style id="sqd-phone-size">/g) || []).length, 1);
  assert.ok(at < page.indexOf('</head>'));
  assert.ok(at > page.indexOf('href="dashboard-shell.css"') && at > page.indexOf('<style id="sqd-admin-shell">'));
});

test('the device shell is scaled, from its top centre, to 78 % on desktop', () => {
  const desktop = css.slice(css.indexOf('@media (min-width: 769px) {'));
  assert.ok(desktop.startsWith('@media (min-width: 769px) {\n  div:has(> .sqd-phone-frame) {'), 'the device shell, i.e. the direct parent of the phone screen');
  assert.ok(desktop.includes('--sqd-phone-scale: .78;'));
  assert.ok(desktop.includes('transform: scale(var(--sqd-phone-scale));'));
  assert.ok(desktop.includes('transform-origin: top center;'), 'stays centred in the preview column');
  assert.ok(desktop.includes('margin-bottom: calc(-774px * (1 - var(--sqd-phone-scale)));'), 'the freed space is handed back');
});

test('shorter windows get a smaller phone; phones keep the page layout', () => {
  const steps = [...css.matchAll(/@media \(min-width: 769px\) and \(max-height: (\d+)px\) \{ div:has\(> \.sqd-phone-frame\) \{ --sqd-phone-scale: ([.\d]+); \} \}/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(steps, [[799, 0.68], [699, 0.58], [599, 0.5]]);
  // With the 52 px top bar, 20 px column padding, ~30 px label and ~46 px button around it,
  // the device and its button fit the SHORTEST window each size is used for.
  const around = 52 + 20 + 30 + 46;
  assert.ok(around + 774 * 0.78 <= 800, 'default (windows 800 px and taller)');
  for (const [[maxH, s], shortest] of steps.map((st, i) => [st, [700, 600, 540][i]])) {
    assert.ok(around + 774 * s <= shortest, maxH + ' px step fits down to ' + shortest + ' px: ' + Math.round(around + 774 * s));
  }
  assert.ok(!/@media \(max-width/.test(css), 'nothing changes at phone widths');
});

test('the phone itself is unchanged: 355 x 700 screen, 355 px page width, same device chrome', () => {
  assert.ok(page.includes('<div class="sqd-phone-frame" style="width:355px;height:700px;overflow-y:auto;overflow-x:hidden;border-radius:32px;-webkit-overflow-scrolling:touch;background:#000;">'));
  assert.ok(page.includes('<iframe id="sqd-iframe" src="" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:355px;height:2600px;border:none;display:block;" scrolling="no"></iframe>'));
  // 774 = 10 padding + 28 notch + 2 gap + 700 screen + 24 home indicator + 10 padding
  const shell = page.slice(page.indexOf('<!-- Device shell -->'), page.indexOf('<!-- Single action button below preview -->'));
  assert.ok(shell.includes('border-radius:44px;padding:10px;'));
  assert.ok(shell.includes('height:28px;margin-bottom:2px;'));
  assert.ok(shell.includes('<div style="display:flex;justify-content:center;height:24px;align-items:center;">'));
  assert.equal(10 + 28 + 2 + 700 + 24 + 10, 774);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
process.exit(failed ? 1 : 0);
