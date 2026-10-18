// ============================================================
// lpRenderEscaping.test.js — Phase 0, S1: page content reaches public pages
// escaped; new page addresses have a safe format.
//
// Before: the public page (GET /lp/:slug), the loyalty card (/lp/card/:slug)
// and the older welcome page (/lp/welcome/:slug) wrote the business name,
// headline, subtitle, badge, buttons, logo, website, the website scan's
// cards, colours, the slug, ?cid and ?lang into their HTML as they were.
// Pages run on www.qraivy.com and can be created without signing in, so
// anyone could put script on that site. Now every such value is escaped,
// links keep only http(s)/mailto/tel (others become '#'), colours must be
// hex, and a new page's address must match [A-Za-z0-9][A-Za-z0-9_-]{0,119}.
// The original reproduction (a marker containing < > " ') is used below.
// ============================================================
const assert = require('assert/strict');
const h = require('./helpers/phase0Harness');

const M = 'ZQ<i>"\'';                      // the audit's marker
const RAW = /ZQ<i>/;                      // the marker unescaped
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function serve(slug) {
  const r = h.res();
  await h.lp.handleServeLP(h.req({ params: { slug }, query: { preview: '1' } }), r);
  return String(r.body);
}
function hostile(slug, extra = {}) {
  return h.page(slug, Object.assign({
    userId: null, businessName: 'N' + M, websiteUrl: 'https://w.example/' + M, brandColor: '#fff;}</style><i>' + M,
    sections: { language: 'en', hero: { badge: 'B' + M, title: 'T' + M, subtitle: 'S' + M }, logo: { url: 'https://l.example/' + M },
      theme: { lightBackgroundColor: 'red;}</style>' + M },
      buttons: [{ type: 'website', label: 'L' + M, url: 'https://u.example/' + M, active: true }],
      actionLinks: [{ icon: 'I' + M, label: 'A' + M, description: 'C' + M, url: 'https://a.example/' + M }] },
  }, extra));
}

test('public page: the audit marker in every field is written escaped, never raw', async () => {
  h.reset(); hostile('probe-page');
  const html = await serve('probe-page');
  assert.ok(html.length > 20000 && html.includes('id="chat-input"'), 'the page itself renders');
  assert.doesNotMatch(html, RAW, 'no field reaches the HTML unescaped');
  for (const f of ['N', 'T', 'S', 'B', 'L', 'A', 'C', 'I']) assert.ok(html.includes(f + 'ZQ&lt;i&gt;&quot;&#39;'), f + ' is shown, escaped');
  for (const host of ['l.example', 'u.example', 'w.example', 'a.example']) assert.ok(!html.includes(host + '/ZQ<i>"'), host + ': no attribute break-out');
  assert.ok(!html.includes('</style><i>'), 'colours cannot end the style element');
  assert.ok(html.includes('background:#0a0a0a') || html.includes('#0a0a0a'), 'an invalid brand colour falls back to the default');
});

test('public page: the cards no longer put the link inside onclick code', async () => {
  h.reset(); hostile('probe-page');
  const html = await serve('probe-page');
  assert.ok(html.includes('onclick="openCard(this.getAttribute(\'data-url\'),this.getAttribute(\'data-label\'))" data-url="https://a.example/ZQ&lt;i&gt;&quot;&#39;" data-label="AZQ&lt;i&gt;&quot;&#39;"'));
  assert.ok(html.includes('data-href="https://w.example/ZQ&lt;i&gt;&quot;&#39;" onclick="window.location.href=this.getAttribute(\'data-href\')"'));
  assert.ok(!/openCard\('/.test(html), 'no value inside an openCard(...) string any more');
});

test('public page: javascript:, data: and vbscript: links become "#"; an embedded image logo is kept', async () => {
  h.reset();
  h.page('scheme-page', { websiteUrl: ' java\tscript:alert(1)', sections: { language: 'en', logo: { url: 'javascript:alert(2)' },
    actionLinks: [{ label: 'X', url: 'JaVaScRiPt:alert(3)' }, { label: 'Y', url: 'data:text/html,<b>' }, { label: 'Z', url: 'vbscript:x' }] } });
  let html = await serve('scheme-page');
  assert.ok(!/javascript:|data:text|vbscript:/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'no unsafe scheme in the markup');
  assert.ok(html.includes('data-url="#" data-label="X"') && html.includes('data-url="#" data-label="Y"') && html.includes('data-url="#" data-label="Z"'));
  assert.ok(html.includes('data-href="#"'));
  assert.ok(!html.includes('<img src="javascript'), 'a javascript: logo is not used');
  h.reset();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  h.page('logo-page', { sections: { language: 'en', logo: { url: png } } });
  html = await serve('logo-page');
  assert.ok(html.includes('<img src="' + png + '"'), 'the two live pages with an embedded logo keep it');
});

test('public page: normal values look the same (umlauts, "&" in a link, apostrophes in the built-in cards)', async () => {
  h.reset();
  h.page('real-page', { businessName: 'Getränke Göbel', websiteUrl: 'https://example.de/?a=1&b=2', sections: { language: 'de', hero: { title: 'Willkommen bei Göbel' },
    buttons: [{ type: 'instagram', label: 'Instagram', url: 'https://instagram.com/x?a=1&b=2', active: true }] } });
  const html = await serve('real-page');
  assert.ok(html.includes('Getränke Göbel') && html.includes('Willkommen bei Göbel'));
  assert.ok(html.includes('href="https://instagram.com/x?a=1&amp;b=2"'), '& in a link is written as &amp; (the browser reads it as &)');
  h.reset(); h.page('en-page', { sections: { language: 'en' } });
  const en = await serve('en-page');
  assert.ok(en.includes('Today&#39;s special'), 'built-in card text, escaped');
  assert.ok(en.includes('var SLUG = "en-page";'));
});

test('public page: the slug is written as a script-safe string', async () => {
  h.reset(); hostile('sZQ<i>"\'');
  const html = await serve('sZQ<i>"\'');
  assert.doesNotMatch(html, /sZQ<i>"'/, 'no raw slug');
  assert.ok(html.includes('var SLUG = "sZQ\\u003ci>\\"\'";'));
  assert.ok(html.includes('href="/manifest/sZQ&lt;i&gt;&quot;&#39;"'));
});

test('loyalty card page: name, logo, reward, colour, slug and ?cid are escaped', async () => {
  h.reset(); hostile('card-page', { sections: { logo: { url: 'https://l.example/' + M }, theme: { accentColor: 'red;}</style><i>' } } });
  h.T('stampSettings').push({ slug: 'card-page', goal: 5, rewardName: 'R' + M, enabled: true });
  const r = h.res();
  await h.lp.handleLoyaltyCardPage(h.req({ params: { slug: 'card-page' }, query: { cid: '</script><script>alert(1)</script>' } }), r);
  const html = String(r.body);
  assert.doesNotMatch(html, RAW);
  assert.ok(!html.includes('</script><script>alert(1)'), 'the cid cannot end the script');
  assert.ok(html.includes('var CID="\\u003c/script>\\u003cscript>alert(1)\\u003c/script>";'));
  assert.ok(html.includes('RZQ&lt;i&gt;&quot;&#39;') && html.includes('NZQ&lt;i&gt;&quot;&#39;'));
  assert.ok(html.includes('.card{background:#ff5a1f;'), 'an invalid colour falls back to the default');
  const r2 = h.res();
  await h.lp.handleLoyaltyCardPage(h.req({ params: { slug: 'card-page' }, query: {} }), r2);
  assert.ok(String(r2.body).includes('var CID=null;'), 'without ?cid the script is as before');
});

test('older welcome page: ?lang is only "de" or "en"; name, logo, colour and reward are escaped', async () => {
  h.reset(); hostile('welcome-page', { sections: { logo: { url: 'https://l.example/' + M }, theme: { accentColor: 'x;}</style>' } } });
  h.T('stampSettings').push({ slug: 'welcome-page', goal: 5, rewardName: 'R' + M, enabled: true });
  const r = h.res();
  await h.lp.handleLoyaltyWelcome(h.req({ params: { slug: 'welcome-page' }, query: { lang: '"><script>alert(1)</script>' } }), r);
  const html = String(r.body);
  assert.ok(html.startsWith('<!DOCTYPE html><html lang="en">'), 'unknown ?lang: English, as before');
  assert.ok(!html.includes('<script>alert(1)'));
  assert.doesNotMatch(html, RAW);
  assert.ok(!html.includes('</style>' + "'") && !html.includes('x;}</style>'));
  const de = h.res();
  await h.lp.handleLoyaltyWelcome(h.req({ params: { slug: 'welcome-page' }, query: {} }), de);
  assert.ok(String(de.body).startsWith('<!DOCTYPE html><html lang="de">'), 'no ?lang: German, as before');
});

test('new pages: the address must match the safe format; signed-out creation still works', async () => {
  for (const bad of ['a b', 'x"y', '<i>', '-start', 'a/b', 'a.b', '', 'ä-page', 'x'.repeat(121)]) {
    h.reset();
    const r = h.res();
    await h.quiet(() => h.lp.handlePublishLP(h.req({ method: 'POST', body: { slug: bad, businessName: 'New', sections: {} } }), r));
    assert.equal(r.statusCode, 400, JSON.stringify(bad));
    assert.ok(!h.db.writes.some((w) => w.startsWith('landingPage.')), 'nothing written for ' + JSON.stringify(bad));
  }
  for (const good of ['demo-casa-lumi-ab12c', 'getraenke-goebel-rw0', 'A_b-1', 'x'.repeat(120)]) {
    h.reset();
    const r = h.res();
    await h.quiet(() => h.lp.handlePublishLP(h.req({ method: 'POST', body: { slug: good, businessName: 'New', sections: {} } }), r));
    assert.equal(r.statusCode, 200, good);
    assert.equal(h.T('landingPage')[0].userId, null, 'signed-out creation is unchanged (no owner)');
  }
});

test('existing pages keep their address even if it would not be allowed for a new page', async () => {
  h.reset(); h.page('legacy.page', { userId: 'user_owner' });
  const r = h.res();
  await h.quiet(() => h.lp.handlePublishLP(h.req({ method: 'POST', headers: { authorization: 'Bearer user_owner' }, body: { slug: 'legacy.page', businessName: 'Casa Lumi', sections: { hero: { title: 'x' } } } }), r));
  assert.equal(r.statusCode, 200);
});

h.run('lpRenderEscaping', tests);
