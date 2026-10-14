// ============================================================
// editorPhonePreview.test.js — the phone preview in the Smart Landing
// Page editor (smart-qr-detail.html) is shown at full size, and its
// column scrolls on its own when the window is too short for it.
//
// Static checks: no scaling of the device, the column (and only the
// column) becomes a scroll container on desktop, the phone keeps its
// own scrolling, and the phone markup is the original.
//
// Run: node tests/editorPhonePreview.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'public', 'smart-qr-detail.html'), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS  ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); } }

const at = page.indexOf('<style id="sqd-preview-column">');
const css = at === -1 ? '' : page.slice(at, page.indexOf('</style>', at));

test('one style block, in <head>, after the shared and Admin shell styles', () => {
  assert.equal((page.match(/<style id="sqd-preview-column">/g) || []).length, 1);
  assert.ok(at > -1 && at < page.indexOf('</head>'));
  assert.ok(at > page.indexOf('href="dashboard-shell.css"') && at > page.indexOf('<style id="sqd-admin-shell">'));
});

test('the phone is not scaled any more', () => {
  assert.ok(!page.includes('sqd-phone-size') && !page.includes('--sqd-phone-scale'));
  assert.ok(!/transform\s*:\s*scale/.test(css) && !/zoom\s*:/.test(css));
});

test('on desktop the preview column scrolls on its own and keeps the phone centred', () => {
  const desktop = css.slice(css.indexOf('@media (min-width: 769px) {'));
  assert.ok(desktop.startsWith('@media (min-width: 769px) {\n  div:has(> div > div > .sqd-phone-frame) {'), 'the column: phone screen > device shell > phone wrapper > column');
  for (const rule of ['overflow-x: hidden !important;', 'overflow-y: auto !important;', 'scrollbar-gutter: stable both-edges;']) assert.ok(desktop.includes(rule), rule);
  assert.ok(!/@media \(max-width/.test(css), 'nothing changes at phone widths');
  // the column is the one with the inline overflow:hidden the rule overrides
  const col = page.slice(page.lastIndexOf('<div style="', page.indexOf('<!-- Phone preview label -->')), page.indexOf('<!-- Phone preview label -->'));
  assert.ok(col.includes('height:calc(100vh - 52px);') && col.includes('position:sticky;') && col.includes('overflow:hidden;'));
});

test('the column scrollbar is visible: 12 px, dark track, muted orange thumb, bright orange on hover', () => {
  const col = 'div:has(> div > div > .sqd-phone-frame)';
  assert.ok(css.includes(col + '::-webkit-scrollbar { width: 12px; }'));
  assert.ok(css.includes(col + '::-webkit-scrollbar-track { background: #14171d; }'));
  assert.ok(css.includes(col + '::-webkit-scrollbar-thumb { background: rgba(255,90,31,0.5);'));
  assert.ok(css.includes(col + '::-webkit-scrollbar-thumb:hover,\n  ' + col + '::-webkit-scrollbar-thumb:active { background: #ff5a1f; }'));
  // Firefox only: in Chromium, scrollbar-color/-width would switch the ::-webkit-scrollbar rules off
  const ff = css.slice(css.indexOf('@supports not selector(::-webkit-scrollbar) {'));
  assert.ok(ff.includes(col + ' { scrollbar-width: auto; scrollbar-color: rgba(255,90,31,0.5) #14171d; }'));
  assert.ok(ff.includes(col + ':hover { scrollbar-color: #ff5a1f #14171d; }'));
  const outsideFf = css.slice(0, css.indexOf('@supports not selector(::-webkit-scrollbar) {'));
  assert.ok(!/scrollbar-(color|width)\s*:/.test(outsideFf), 'no scrollbar-color/-width outside the Firefox block');
  // only the column is styled, never the phone screen
  assert.ok(!/\.sqd-phone-frame::-webkit-scrollbar/.test(css));
});

test('the page inside the phone keeps its own scrolling', () => {
  assert.ok(css.includes('.sqd-phone-frame { overscroll-behavior: contain; }'));
  assert.ok(page.includes("var phoneFrame = document.querySelector('.sqd-phone-frame');"));
});

test('the phone itself is the original: 375 x 774 device, 355 x 700 screen, 355 px page width', () => {
  assert.ok(page.includes('<div class="sqd-phone-frame" style="width:355px;height:700px;overflow-y:auto;overflow-x:hidden;border-radius:32px;-webkit-overflow-scrolling:touch;background:#000;">'));
  assert.ok(page.includes('<iframe id="sqd-iframe" src="" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:355px;height:2600px;border:none;display:block;" scrolling="no"></iframe>'));
  const shell = page.slice(page.indexOf('<!-- Device shell -->'), page.indexOf('<!-- Single action button below preview -->'));
  assert.ok(shell.includes('border-radius:44px;padding:10px;'));
  assert.ok(shell.includes('height:28px;margin-bottom:2px;'));
  assert.ok(shell.includes('<div style="display:flex;justify-content:center;height:24px;align-items:center;">'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)');
process.exit(failed ? 1 : 0);
