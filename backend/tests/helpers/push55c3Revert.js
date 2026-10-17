// Shared by the older guard tests: undo exactly the Phase 5.5C.3 edits of the
// landing page's push script (tests/pushPageSubscriptions.test.js tests what
// they do), so those guards keep proving that nothing else in it changed.
//
//   revertPush55c3(line, baseLine, origin)
//     line      the push script line now (source, or as rendered)
//     baseLine  the same line at production 0cd8e45 (source)
//     origin    when `line` is rendered: the page origin to fill in
//   revertInline55c3(text)  the inline button's explicit-consent flag
const MARK = "if(!('Notification' in window)||Notification.permission==='denied'){return;}";

function region(s, start, end, label) {
  const i = s.indexOf(start);
  const j = s.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('5.5C.3 region not found: ' + label);
  return s.slice(i, j);
}
function swap(s, a, b, label) {
  if (s.split(a).length !== 2) throw new Error('5.5C.3 edit not found exactly once: ' + label);
  return s.replace(a, () => b);
}

function revertPush55c3(line, baseLine, origin) {
  const fill = (x) => (origin ? x.split('${pageOrigin}').join(origin) : x);
  // Phase 5.5C.4 (notification settings section): browsers without push report their state there
  let s = swap(line, "_settings(isIOS&&isSafari&&!isStandalone?'ios':'unsupported');return;}", 'return;}', 'settings: unsupported');
  s = swap(s, region(s, 'var _st=null;', MARK, 're-sync'), fill(region(baseLine, "if(localStorage.getItem('wp_sub_'+_s)){", MARK, 'base re-sync')), 're-sync');
  s = swap(s, s.slice(s.indexOf('function doSub(){'), s.lastIndexOf('})()')),
    fill(baseLine.slice(baseLine.indexOf('function doSub(){'), baseLine.lastIndexOf('})()'))), 'doSub');
  s = swap(s, "_pc=localStorage.getItem('qraivy_cid_'+_s)||localStorage.getItem('cTok');", "_pc=localStorage.getItem('cTok');", 'cid');
  s = swap(s, region(s, 'var ICONS={alert:', 'bell:', 'icon'), 'var ICONS={', 'icon');
  s = swap(s, region(s, ",blocked:{icon:'alert'", '};var wrap=', 'states'), '', 'states');
  return s;
}

// handleStampConfirm: the stamp/reward web push goes to this customer's own opt-in only.
function revertStamp55c3(text) {
  return swap(swap(text, "    // Web Push: deep link customer to their loyalty card -- this customer's\n    // own opt-in on this page only (before 5.5C.3 every subscriber of the\n    // page got every customer's stamp message).\n    try {\n      const webSubs = cid ? await webPushPages.recipientsForPage(slug, { cid }) : [];\n      if (webSubs.length > 0) {", "    // Web Push: deep link customer to their loyalty card\n    try {\n      const webSubs = await prisma.webPushSubscription.findMany({ where: { slug } });\n      if (webSubs.length > 0) {\n        const { sendWebPush } = require('../services/webPushService');", 'stamp recipients'),
    "        await webPushPages.sendToRecipients(webSubs, { title, body, url, icon: 'https://qraivy.com/icon-192.png' });", "        for (const sub of webSubs) {\n          await sendWebPush(\n            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },\n            { title, body, url, icon: 'https://qraivy.com/icon-192.png' }\n          );\n        }", 'stamp send');
}

function revertInline55c3(text) {
  return swap(text, "cid: _pc, consent: 'explicit' })", 'cid: _pc })', 'inline button');
}

// The push texts added to T.en.push / T.de.push since 5.5C.2 (5.5C.3 states, 5.5C.4 settings section).
const NEW_TEXT_KEYS = ['blockedTitle', 'blockedDesc', 'failTitle', 'failDesc', 'retry', 'setTitle', 'stOn', 'stOff', 'stChecking', 'stTurningOn', 'stTurningOff', 'stBlocked', 'stUnsupported', 'stIos', 'stError', 'turnOff', 'turnOn'];

// Phase 5.5C.4: the settings section's place in the page.
const SETTINGS_SLOT = '<!-- NOTIFICATIONS (filled by the push script) -->\n<div class="section" id="qraivy-push-settings" hidden></div>\n\n';
const SETTINGS_CSS = '\n.dark-mode #qraivy-push-settings .qps-accent,.dark-mode #qraivy-push-settings .qps-accent *{color:#ff6b00 !important;}';
function revertPage55c4(html) { return swap(swap(html, SETTINGS_SLOT, '', 'settings slot'), SETTINGS_CSS, '', 'settings dark-mode colour'); }

// Paths 5.5C.3 owns in backend/prisma (pinned exactly in pushPageSubscriptions.test.js).
const PRISMA_EXCLUDES = [':(exclude)backend/prisma/schema.prisma', ':(exclude)backend/prisma/migrations/20261017120000_add_webpush_page_subscription'];

module.exports = { revertPush55c3, revertInline55c3, revertStamp55c3, revertPage55c4, NEW_TEXT_KEYS, PRISMA_EXCLUDES };
