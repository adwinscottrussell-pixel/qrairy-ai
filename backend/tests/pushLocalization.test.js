// ============================================================
// pushLocalization.test.js — Phase 5.5C.2: the landing page's push texts
// (bottom sheet, iPhone hint, inline button) follow the page's saved
// language. English pages keep their existing English texts; only the
// strings move into renderPremiumLP's dictionary (T.en.push / T.de.push).
// The push logic itself (service worker, VAPID key, subscribe call,
// permission handling) is byte for byte as before.
// ============================================================
const assert = require('assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const pages = {};
const mockPrisma = {
  landingPage: { async findUnique({ where: { slug } }) { return pages[slug] ? Object.assign({}, pages[slug]) : null; } },
  stampSettings: { async findUnique() { return null; } },
};
require.cache[resolve('src', 'utils', 'prismaClient.js')] = { loaded: true, exports: mockPrisma };
for (const [f, exports] of [
  ['apnsService.js', { pushUpdateToDevices: async () => ({ success: 0, failed: 0 }) }],
  ['emailService.js', { sendCampaignEmail: async () => ({}), sendWelcomeEmail: async () => ({}) }],
  ['webPushService.js', { sendWebPush: async () => ({ ok: true }) }],
]) require.cache[resolve('src', 'services', f)] = { loaded: true, exports };
const { handleServeLP } = require('../src/controllers/lpController');

const page = (slug, language) => {
  pages[slug] = { id: 'lp_' + slug, slug, businessName: 'Test Bakery', websiteUrl: 'https://example.com', useCase: 'local_business', brandColor: '#000064', logoUrl: null,
    userId: null, qrType: 'ai', template: 'premium', status: 'live', scanCount: 0, createdAt: new Date(), updatedAt: new Date(1700000000000),
    sections: JSON.stringify(Object.assign(language ? { language } : {}, { hero: { aiTitle: 'Hello', aiSubtitle: 'World' }, featured: [], businessInfo: {} })) };
  return slug;
};
async function render(slug) {
  const res = { headers: {}, statusCode: 200, body: '', setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; } };
  await handleServeLP({ params: { slug }, query: { preview: '1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}
const pushText = (html) => { const m = html.match(/window\.QRAIVY_PUSH_TEXT = (\{.*?\});\n/); assert.ok(m, 'push texts present'); return JSON.parse(m[1]); };
const pushLine = (html) => html.split('\n').find((l) => l.includes("console.log('[Push] Premium LP loaded"));
const lf = (s) => s.split('\r\n').join('\n');
const SRC = () => lf(require('fs').readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'lpController.js'), 'utf8'));
const HEAD = () => lf(execFileSync('git', ['show', 'e7060e5:backend/src/controllers/lpController.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

const EN = {
  hintTitle: '📲 Turn on notifications',
  hintBody: 'Tap <b>Share</b> → <b>Add to Home Screen</b>, then open the app from your Home Screen to turn on notifications.',
  hintOk: 'Got it', title: 'Stay updated instantly', desc: 'Get special offers and updates from this business.',
  btn: 'Enable Updates', trust: 'You can turn this off anytime.', asking: 'Setting things up…',
  okTitle: "You're subscribed!", okDesc: "We'll notify you about special offers.", close: 'Close',
  unsupported: 'Notifications not supported in this browser.', enabled: '✓ Notifications enabled!', blocked: '⛔ Notifications blocked in browser settings',
};
const DE = {
  hintTitle: '📲 Benachrichtigungen aktivieren',
  hintBody: 'Tippe auf <b>Teilen</b> → <b>Zum Home-Bildschirm</b>, dann öffne die App vom Home-Bildschirm, um Benachrichtigungen zu aktivieren.',
  hintOk: 'Verstanden', title: 'Bleib auf dem Laufenden', desc: 'Erhalte Angebote und Neuigkeiten von diesem Betrieb.',
  btn: 'Benachrichtigungen aktivieren', trust: 'Du kannst das jederzeit wieder abschalten.', asking: 'Wird eingerichtet…',
  okTitle: 'Du bist angemeldet!', okDesc: 'Wir informieren dich über neue Angebote.', close: 'Schließen',
  unsupported: 'Dieser Browser unterstützt keine Benachrichtigungen.', enabled: '✓ Benachrichtigungen aktiviert!', blocked: '⛔ Benachrichtigungen sind in den Browser-Einstellungen blockiert',
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('English page: the existing English push texts, unchanged', async () => {
  const t = pushText(await render(page('push-en', 'en')));
  assert.deepEqual(t, EN);
  // the sheet's texts are exactly the ones the page showed before this change
  const before = pushLine(HEAD());
  for (const k of ['title', 'desc', 'btn', 'trust', 'asking', 'okTitle', 'okDesc']) assert.ok(before.includes(EN[k]), k + ' was the English text before');
});

test('German page: German push texts, "Benachrichtigungen aktivieren" on the button', async () => {
  const html = await render(page('push-de', 'de'));
  assert.deepEqual(pushText(html), DE);
  assert.ok(!/Stay updated instantly|Enable Updates|You're subscribed|Setting things up|Turn on notifications/.test(html), 'no English push text on a German page');
});

test('a page without a saved language is English, as the rest of the page', async () => {
  assert.deepEqual(pushText(await render(page('push-none', null))), EN);
});

test('the push block reads every text from QRAIVY_PUSH_TEXT; none is left in the script', async () => {
  const line = pushLine(await render(page('push-line', 'en')));
  for (const k of ['hintTitle', 'hintBody', 'hintOk', 'title', 'desc', 'btn', 'trust', 'asking', 'okTitle', 'okDesc', 'close']) assert.ok(line.includes('_pt.' + k), k);
  assert.ok(!/Stay updated instantly|Enable Updates|You're subscribed|Benachrichtigungen aktivieren|Verstanden|Setting things up/.test(line));
  const src = SRC();
  for (const k of ['unsupported', 'enabled', 'blocked']) assert.ok(src.includes('window.QRAIVY_PUSH_TEXT.' + k), k);
});

test('the push logic is unchanged: put the old texts back and the script is identical to before', () => {
  const now = pushLine(SRC()), before = pushLine(HEAD());
  const BS = String.fromCharCode(92), u = (h) => BS + 'u' + h, end = (n) => '<' + BS + '/' + n + '>';
  const restored = now
    .replace('(function(){var _pt=window.QRAIVY_PUSH_TEXT;', '(function(){')
    .replace("'+_pt.hintTitle+'", u('D83D') + u('DCF2') + ' Benachrichtigungen aktivieren')
    .replace("'+_pt.hintBody+'", 'Tippe auf <b>Teilen' + end('b') + ' ' + u('2192') + ' <b>Zum Home-Bildschirm' + end('b') + ', dann ' + u('00f6') + 'ffne die App vom Home-Bildschirm, um Benachrichtigungen zu aktivieren.')
    .replace("'+_pt.hintOk+'", 'Verstanden')
    .replace('title:_pt.title,desc:_pt.desc,btn:_pt.btn,trust:_pt.trust', "title:'Stay updated instantly',desc:'Get special offers and updates from this business.',btn:'Enable Updates',trust:'You can turn this off anytime.'")
    .replace('title:_pt.asking', "title:'Setting things up…'")
    .replace('title:_pt.okTitle,desc:_pt.okDesc', 'title:"You\'re subscribed!",desc:"We\'ll notify you about special offers."')
    .replace("xBtn.setAttribute('aria-label',_pt.close);", '');
  assert.equal(restored, before);
  // the inline button's handler: only its three texts changed
  const fn = (s) => s.slice(s.indexOf('window.lpEnableNotifications = function() {'), s.indexOf('// Show notif button if not already subscribed'));
  const restoredFn = fn(SRC())
    .replace('alert(window.QRAIVY_PUSH_TEXT.unsupported)', "alert('Notifications not supported in this browser.')")
    .replace('btn.textContent = window.QRAIVY_PUSH_TEXT.enabled;', "btn.textContent = '" + u('2713') + " Notifications enabled!';")
    .replace('btn.textContent = window.QRAIVY_PUSH_TEXT.blocked;', "btn.textContent = '" + u('26d4') + " Notifications blocked in browser settings';");
  assert.equal(restoredFn, fn(HEAD()));
});

test('the texts cannot end the script element, and they load before the push code runs', async () => {
  const html = await render(page('push-esc', 'en'));
  const m = html.match(/window\.QRAIVY_PUSH_TEXT = (\{.*?\});\n/);
  assert.ok(!m[1].includes('<'), 'every "<" is written as \\u003c');
  assert.ok(html.indexOf('window.QRAIVY_PUSH_TEXT =') < html.indexOf("console.log('[Push] Premium LP loaded"));
  assert.ok(html.indexOf('window.QRAIVY_PUSH_TEXT =') < html.indexOf('window.lpEnableNotifications = function()'));
});

test('service worker, VAPID key, subscribe call and subscription storage are untouched', () => {
  const root = path.join(__dirname, '..', '..');
  const changed = execFileSync('git', ['diff', 'e7060e5', '--name-only', '--', 'frontend/public/sw.js', 'backend/public/sw.js', 'backend/src/services/webPushService.js', 'backend/src/routes', 'backend/prisma',
    'backend/src/services/passService.js', 'backend/src/services/googleWalletService.js'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  // the push campaign security hotfix (tests/pushCampaignAuth.test.js) adds sign-in to two push routes, nothing else
  assert.deepEqual(changed.filter((f) => f !== 'backend/src/routes/lpRoutes.js'), []);
  const routes = lf(require('fs').readFileSync(path.join(root, 'backend', 'src', 'routes', 'lpRoutes.js'), 'utf8'))
    .replace("// The page's own account only (handlers check ownership): device counts and\n// campaign texts are that business's data.\n", '')
    .replace("count', requireAuth, handlePushCount", "count', handlePushCount").replace("history', requireAuth, handlePushHistory", "history', handlePushHistory")
    // and the subscriber data hotfix (tests/subscriberDataAuth.test.js): sign-in on the email list route
    .replace("// The page's own account only (the handler checks ownership): subscriber emails.\nrouter.get('/lp/subscribers/:slug', requireAuth, handleGetSubscribers);", "router.get('/lp/subscribers/:slug', handleGetSubscribers);");
  assert.equal(routes, lf(execFileSync('git', ['show', 'e7060e5:backend/src/routes/lpRoutes.js'], { cwd: root, encoding: 'utf8' })));
  const fn = (s, name) => s.slice(s.indexOf('async function ' + name + '('), s.indexOf('\n}\n', s.indexOf('async function ' + name + '(')));
  // handleSendPush: only the hotfix's owner check and its reuse of the page it loaded
  const sendNow = fn(SRC(), 'handleSendPush')
    .replace("    const ownedPage = await findOwnedPushPage(slug, req.userId);\n    if (!ownedPage) return pushPageNotFound(res);\n", '')
    .replace('      emailResults = await sendCampaignEmail(emailSubs, { title, message, linkUrl, bizName: ownedPage.businessName || slug, slug });',
      "      const page = await prisma.landingPage.findUnique({ where: { slug } });\n      emailResults = await sendCampaignEmail(emailSubs, { title, message, linkUrl, bizName: page?.businessName || slug, slug });");
  assert.equal(sendNow, fn(HEAD(), 'handleSendPush'), 'handleSendPush');
  for (const name of ['handleWebPushSubscribe', 'handleWebPushVapidKey']) assert.equal(fn(SRC(), name), fn(HEAD(), name), name);
});

(async () => {
  let passed = 0, failed = 0;
  console.log('pushLocalization');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
