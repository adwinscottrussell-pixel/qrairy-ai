// ============================================================
// welcomeUnified.test.js — Phase 5.5B Stage 1: the unified QRAIVY welcome
// screen (services/welcomeView.js) behind the per-page gate WELCOME_V2_SLUGS,
// rendered by handleLoyaltyWelcome. Mocked Prisma, no network.
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const resolve = (...p) => require.resolve(path.join(__dirname, '..', ...p));
const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const emailServicePath = resolve('src', 'services', 'emailService.js');

const businesses = { 'biz-1': { id: 'biz-1', name: 'Ulm Cafe', status: 'active' } };
const businessLocations = { 'biz-1': { id: 'bl-1', businessId: 'biz-1', location: { id: 'loc-ulm', name: 'Ulm' } } };
const pages = {};
const stamps = {};
const page = (slug, o = {}) => Object.assign({ id: slug + '-id', slug, businessName: 'Stan Store', brandColor: null, userId: null, businessId: null, logoUrl: null,
  sections: JSON.stringify({ theme: { accentColor: '#ff5a1f' }, logo: { url: 'https://res.cloudinary.com/fake/logo-' + slug + '.png' } }) }, o);
pages['plain'] = page('plain');                                   // no loyalty, not StadtPocket (like STAN STORE)
pages['loyal'] = page('loyal', { businessName: 'Kaffee Ulm' });   // loyalty on
pages['loyal-noreward'] = page('loyal-noreward');                // loyalty on, no reward name
pages['loyal-off'] = page('loyal-off');                          // StampSettings row, disabled
pages['sp'] = page('sp', { businessId: 'biz-1', businessName: 'Ulm Cafe' }); // StadtPocket, loyalty off
pages['nologo'] = page('nologo', { sections: JSON.stringify({}) });
pages['httplogo'] = page('httplogo', { sections: JSON.stringify({ logo: { url: 'http://insecure.example/logo.png' } }) });
pages['evil'] = page('evil', { businessName: '<img src=x onerror="alert(1)">\'</script>', sections: JSON.stringify({ logo: { url: 'https://x.example/a.png"><script>alert(2)</script>' } }) });
// saved page languages (LandingPage.sections.language)
pages['page-en'] = page('page-en', { businessName: 'Qraivy', sections: JSON.stringify({ language: 'en' }) });
pages['page-de'] = page('page-de', { businessName: 'Qraivy', sections: JSON.stringify({ language: 'de' }) });
pages['page-xx'] = page('page-xx', { businessName: 'Qraivy', sections: JSON.stringify({ language: 'fr' }) });
pages['loyal-en'] = page('loyal-en', { businessName: 'Kaffee Ulm', sections: JSON.stringify({ language: 'en' }) });
pages['sp-en'] = page('sp-en', { businessId: 'biz-1', businessName: 'Ulm Cafe', sections: JSON.stringify({ language: 'en' }) });
stamps['loyal-en'] = { enabled: true, goal: 8, rewardName: 'Free Coffee' };
stamps['loyal'] = { enabled: true, goal: 8, rewardName: 'Free Coffee' };
stamps['loyal-noreward'] = { enabled: true, goal: 6, rewardName: '' };
stamps['loyal-off'] = { enabled: false, goal: 10, rewardName: 'Gratisprodukt' };

const mockPrisma = {
  landingPage: { async findUnique({ where: { slug } }) { return pages[slug] || null; } },
  business: { async findUnique({ where: { id } }) { return businesses[id] || null; } },
  businessLocation: { async findFirst({ where: { businessId } }) { return businessLocations[businessId] || null; } },
  stampSettings: { async findUnique({ where: { slug } }) { return stamps[slug] || null; } },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };
require.cache[emailServicePath] = { id: emailServicePath, filename: emailServicePath, loaded: true, exports: { sendWelcomeEmail: async () => ({ success: 0, failed: 0 }) } };

const { handleLoyaltyWelcome } = require('../src/controllers/lpController');
const { welcomeV2Enabled, COLORS, FALLBACK_ICON } = require('../src/services/welcomeView');

async function welcome(slug, query, gate) {
  const before = process.env.WELCOME_V2_SLUGS;
  if (gate === undefined) delete process.env.WELCOME_V2_SLUGS; else process.env.WELCOME_V2_SLUGS = gate;
  const res = { body: undefined, statusCode: 200, status(c) { this.statusCode = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
  try { await handleLoyaltyWelcome({ params: { slug }, query: query || {} }, res); } finally { if (before === undefined) delete process.env.WELCOME_V2_SLUGS; else process.env.WELCOME_V2_SLUGS = before; }
  return res.body;
}
const ALL = 'plain,loyal,loyal-noreward,loyal-off,sp,nologo,httplogo,evil';
const lf = (s) => s.split('\r\n').join('\n');
const git = (...a) => lf(execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const src = () => lf(fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'lpController.js'), 'utf8'));
const visible = (html) => html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('gate: only exact, well-formed slugs listed in WELCOME_V2_SLUGS; unset or wildcard means no page', () => {
  assert.equal(welcomeV2Enabled('plain', {}), false);
  assert.equal(welcomeV2Enabled('plain', { WELCOME_V2_SLUGS: 'plain' }), true);
  assert.equal(welcomeV2Enabled('plain', { WELCOME_V2_SLUGS: ' other , plain ' }), true);
  assert.equal(welcomeV2Enabled('plai', { WELCOME_V2_SLUGS: 'plain' }), false);
  for (const v of ['*', 'all', '', ',', 'PLAIN']) assert.equal(welcomeV2Enabled('plain', { WELCOME_V2_SLUGS: v }), false, v);
  assert.equal(welcomeV2Enabled('../x', { WELCOME_V2_SLUGS: '../x' }), false);
});

test('gate off: every page keeps today\'s screen, byte for byte the same template as production 3b0804f', async () => {
  const html = await welcome('plain');
  assert.ok(html.includes('Treueprämien') && !html.includes('data-welcome="unified"'));
  const line = (src) => src.split('\n').find((l) => l.trim().startsWith("const html = '<!DOCTYPE html><html lang=\"' + lang + '\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"));
  const now = line(src());
  assert.ok(now && now === line(git('show', '3b0804f:backend/src/controllers/lpController.js')), 'the legacy loyalty template is unchanged');
});

test('StadtPocket pages keep their Smart Welcome even when listed (StadtPocket unchanged)', async () => {
  const html = await welcome('sp', {}, ALL);
  assert.ok(html.includes('StadtPocket &middot; Ulm') && html.includes('card-primary') && !html.includes('data-welcome="unified"'));
  const fn = (src) => src.slice(src.indexOf('function renderStadtPocketSmartWelcome('), src.indexOf('// ── GET /lp/welcome/:slug'));
  assert.equal(fn(src()), fn(git('show', '3b0804f:backend/src/controllers/lpController.js')));
});

test('no loyalty: the business variant, without stamps, rewards or a wallet pass', async () => {
  for (const slug of ['plain', 'loyal-off']) {
    const html = await welcome(slug, {}, ALL);
    assert.ok(html.includes('data-welcome="unified"') && html.includes('data-variant="business"'), slug);
    const v = visible(html);
    assert.ok(!/Stempel|stamps|Gratisprodukt|Treue|Prämie|reward/i.test(v), slug + ': no loyalty text');
    assert.ok(!html.includes('id="appleBadge"') && !html.includes('id="googleBadge"') && !html.includes('id="loyaltyCard"'), slug + ': no wallet');
  }
});

test('loyalty: only the configured goal and reward, with the device\'s Wallet badge', async () => {
  const html = await welcome('loyal', {}, ALL);
  assert.ok(html.includes('data-variant="loyalty"'));
  assert.ok(html.includes('Sammle 8 Stempel – erhalte Free Coffee.'));
  assert.ok(!/\b10\b/.test(visible(html).replace(/&#10003;/g, '')) && !html.includes('Gratisprodukt'), 'no defaults');
  assert.ok(html.includes('id="appleBadge"') && html.includes('id="googleBadge"'));
  const noReward = await welcome('loyal-noreward', {}, ALL);
  assert.ok(noReward.includes('<div class="loyalty-line">Sammle 6 Stempel.</div>') && !noReward.includes('Stempel – erhalte'), 'no invented reward');
});

test('official Google and Apple Wallet badges, used byte for byte, never stretched', async () => {
  const badge = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'wallet-badges', f), 'utf8');
  const de = await welcome('loyal', {}, ALL), en = await welcome('loyal', { lang: 'en' }, ALL);
  assert.ok(de.includes(badge('de_add_to_google_wallet_add-wallet-badge.svg')));
  assert.ok(en.includes(badge('enUS_add_to_google_wallet_add-wallet-badge.svg')));
  // SVGs are text: a Windows checkout (core.autocrlf) adds a CR per line, which is not a change to
  // the artwork. Hash them with LF line ends, as git stores and the server deploys them.
  const sha = (f) => { const b = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'wallet-badges', f)); return require('crypto').createHash('sha256').update(f.endsWith('.svg') ? Buffer.from(b.toString('utf8').split('\r\n').join('\n'), 'utf8') : b).digest('hex').slice(0, 16); };
  assert.equal(sha('de_add_to_google_wallet_add-wallet-badge.svg'), '8ad2913864b48714');
  assert.equal(sha('enUS_add_to_google_wallet_add-wallet-badge.svg'), 'fee1f26a7f5d5c59');
  // Apple: the owner-supplied outline badge (for dark backgrounds), embedded unchanged
  assert.equal(sha('enUS_add_to_apple_wallet_outline.png'), '77dbf22318381ccb');
  const png = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'wallet-badges', 'enUS_add_to_apple_wallet_outline.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 396]);
  const img = '<img class="wallet-img" src="data:image/png;base64,' + png.toString('base64') + '" alt="" width="162" height="50">';
  for (const [html, label] of [[de, 'Zu Apple Wallet hinzufügen'], [en, 'Add to Apple Wallet']]) {
    assert.ok(html.includes('<button type="button" class="wallet-badge" id="appleBadge" onclick="addAppleWallet()" aria-label="' + label + '">' + img + '</button>'), label);
    assert.ok(!html.includes('class="wallet-text"'), 'no text stand-in left');
  }
  // fixed height, width from the image itself: the proportions stay Apple's
  assert.ok(/\.wallet-badge svg,\.wallet-badge \.wallet-img\{display:block;height:50px;width:auto;max-width:100%\}/.test(de));
  // no wallet badge at all on pages without loyalty
  assert.ok(!(await welcome('plain', {}, ALL)).includes('data:image/png'));
});

test('device logic: iPhone sees Apple and the push note, Android sees Google, unknown sees both; standalone shows the ready state', async () => {
  const html = await welcome('loyal', {}, ALL);
  const s = html.slice(html.lastIndexOf('<script>'));
  assert.ok(s.includes('apple.style.display=(isIOS||!isAndroid)?"inline-flex":"none"'));
  assert.ok(s.includes('google.style.display=(isAndroid||!isIOS)?"inline-flex":"none"'));
  assert.ok(s.includes('show("iphoneNote",isIOS)'));
  assert.ok(s.includes('if(isStandalone){show("onboarding",false);show("readyState",true);show("readyPush",isIOS);return;}'));
  assert.ok(html.includes('<p class="note" id="iphoneNote"><strong>Wichtig für iPhone:</strong> Füge Kaffee Ulm zum Home-Bildschirm hinzu, öffne die gespeicherte Seite und aktiviere anschließend Benachrichtigungen.</p>'), 'iPhone: Home Screen before notifications');
});

test('header: the business name stays visible above the benefit headline (DE and EN)', async () => {
  const de = await welcome('plain', {}, ALL), en = await welcome('plain', { lang: 'en' }, ALL);
  assert.ok(de.includes('<p class="brand">Stan Store</p><h1>Verpasse keine Angebote mehr!</h1>'));
  assert.ok(en.includes('<p class="brand">Stan Store</p><h1>Never miss a new offer!</h1>'));
  assert.ok(!/mit einem Tipp wieder da|one tap away/.test(de + en), 'the old introduction is gone');
  assert.equal((de.match(/<h1>/g) || []).length, 1);
});

test('install steps: line icons for Share, Add, Home and notifications; no emoji; the real button names', async () => {
  const html = await welcome('plain', {}, ALL);
  const s = html.slice(html.lastIndexOf('<script>'));
  // the steps sit in the script as JSON, with every "<" written as <
  for (const piece of ['path d=\\"M12 3v12\\"/>', 'rect x=\\"4\\" y=\\"4\\" width=\\"16\\" height=\\"16\\" rx=\\"4\\"/>', 'path d=\\"M4 11l8-7 8 7\\"/>', 'path d=\\"M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9\\"/>']) {
    assert.ok(s.includes(piece), piece);
  }
  assert.ok(s.includes('class=\\"ico\\" aria-hidden=\\"true\\"'), 'icons are decorative; the text says it all');
  assert.ok(!/\p{Extended_Pictographic}/u.test(html.replace(/•••/g, '').replace(/&#10003;/g, '')), 'no emoji');
  assert.ok(s.includes('Tippe auf „Benachrichtigungen aktivieren“ und dann auf „Erlauben“.'), 'names the German landing page button as visitors see it');
  assert.ok(/\.btn-green\{[^}]*min-height:56px/.test(html) && html.includes('id="showMeBtn">Zeig mir wie</button>'));
});

test('ready screen and continue are unchanged in behaviour', async () => {
  const html = await welcome('plain', {}, ALL);
  assert.ok(html.includes('<div class="ready" id="readyState"><div class="ready-check">&#10003;</div><div class="ready-title">Stan Store ist bereit.</div>'));
  assert.ok(html.includes('onclick="continueWithout()">Smart Page öffnen</button>'));
});

test('unchanged journeys: continue, wallet endpoints with cid, 4 s return, wEnr_ flag, resolveSlugCid', async () => {
  const html = await welcome('loyal', {}, ALL);
  for (const part of ['function resolveSlugCid(', 'RESOLVED_CID=resolveSlugCid(s)', 'localStorage.setItem("wEnr_"+s,"1")', 'return "/lp/"+encodeURIComponent(s)+q();',
    '"/lp/wallet/apple/"+encodeURIComponent(s)+q()', '"/lp/wallet/google/"+encodeURIComponent(s)+q()', '},4000);', 'window.continueWithout=function(){mE();window.location.href=backToLP();};']) {
    assert.ok(html.includes(part), part);
  }
  assert.ok(html.includes('id="skipBtn" onclick="continueWithout()">Ohne Speichern fortfahren<'));
});

test('first visit: listed pages are sent to the welcome screen, as loyalty and StadtPocket pages already are', () => {
  assert.ok(src().includes('let _shouldWelcome = !!(_lset && _lset.enabled) || welcomeV2Enabled(slug);'));
});

test('no business logo in the content; the installed app keeps the logo icon (fallback: the QRAIVY icon)', async () => {
  const html = await welcome('plain', {}, ALL);
  assert.ok(!/<img\b/i.test(visible(html)), 'no logo image');
  assert.ok(html.includes('<link rel="apple-touch-icon" href="https://res.cloudinary.com/fake/logo-plain.png">'));
  assert.ok(html.includes('<meta name="apple-mobile-web-app-title" content="Stan Store">') && html.includes('<title>Stan Store</title>'));
  assert.ok((await welcome('nologo', {}, ALL)).includes('<link rel="apple-touch-icon" href="' + FALLBACK_ICON + '">'));
  assert.ok((await welcome('httplogo', {}, ALL)).includes('<link rel="apple-touch-icon" href="' + FALLBACK_ICON + '">'), 'only https icons');
  assert.ok(fs.existsSync(path.join(ROOT, 'frontend', 'public', 'apple-touch-icon.png')));
});

test('everything from the page is escaped (name, icon URL, slug in the script)', async () => {
  const html = await welcome('evil', {}, ALL);
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>alert'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&lt;/script&gt;'));
  assert.equal((html.match(/<\/script>/g) || []).length, 1, 'one closing script tag: nothing breaks out');
});

test('design: the approved palette, the large green "Zeig mir wie" and safe areas', async () => {
  const html = await welcome('plain', {}, ALL);
  assert.deepEqual(COLORS, { bg: '#101012', card: '#19191C', text: '#FFFFFF', text2: '#C9C9CE', accent: '#FF5B2A', green: '#16A34A' });
  for (const c of Object.values(COLORS)) assert.ok(html.includes(c), c);
  assert.ok(/\.btn-green\{[^}]*min-height:56px;[^}]*background:#16A34A/.test(html));
  assert.ok(html.includes('id="showMeBtn">Zeig mir wie</button>'));
  assert.ok(html.includes('viewport-fit=cover') && html.includes('env(safe-area-inset-bottom)') && html.includes('env(safe-area-inset-top)'));
});

test('English copy is complete, without German left over', async () => {
  const html = await welcome('loyal', { lang: 'en' }, ALL);
  const v = visible(html).replace(/<svg[\s\S]*?<\/svg>/g, '');
  for (const s of ['Add to Home Screen', 'Show me how', 'Continue without saving', 'Collect 8 stamps – get Free Coffee.', 'Enable Updates']) assert.ok(v.includes(s), s);
  assert.ok(!/Zeig mir|Ohne Speichern|Stempel|Home-Bildschirm|Treue/.test(v));
});

test('language: the page\'s saved language, unless ?lang=de|en says otherwise; German when nothing is saved', async () => {
  const L = 'page-en,page-de,page-xx,loyal-en,plain';
  const lang = (html) => (html.match(/<html lang="([a-z]+)">/) || [])[1] + '/' + ((html.match(/<h1>([^<]*)<\/h1>/) || [])[1]);
  assert.equal(lang(await welcome('page-en', {}, L)), 'en/Never miss a new offer!', 'English page, no ?lang (as after the first-visit redirect)');
  assert.equal(lang(await welcome('page-de', {}, L)), 'de/Verpasse keine Angebote mehr!');
  assert.equal(lang(await welcome('plain', {}, L)), 'de/Verpasse keine Angebote mehr!', 'nothing saved: German, as before');
  assert.equal(lang(await welcome('page-xx', {}, L)), 'de/Verpasse keine Angebote mehr!', 'unknown saved language: German');
  assert.equal(lang(await welcome('page-en', { lang: 'de' }, L)), 'de/Verpasse keine Angebote mehr!', '?lang=de wins over an English page');
  assert.equal(lang(await welcome('page-de', { lang: 'en' }, L)), 'en/Never miss a new offer!', '?lang=en wins over a German page');
  assert.equal(lang(await welcome('page-en', { lang: 'fr' }, L)), 'en/Never miss a new offer!', 'an unknown ?lang falls back to the page');
  // the loyalty variant follows the page too, with the matching Google badge
  const loyal = await welcome('loyal-en', {}, L);
  assert.ok(loyal.includes('Collect 8 stamps – get Free Coffee.') && loyal.includes('aria-label="Add to Google Wallet"'));
});

test('language: pages without the unified screen and StadtPocket pages keep their language rule (?lang, else German)', async () => {
  const legacy = await welcome('page-en', {}, 'plain');          // not listed: today's screen
  assert.ok(legacy.includes('<html lang="de">') && legacy.includes('Treueprämien'), 'not listed: unchanged, still German without ?lang');
  const sp = await welcome('sp-en', {}, 'sp-en');                  // StadtPocket, even if listed
  assert.ok(sp.includes('<html lang="de">') && sp.includes('auf deinem Handy speichern') && !sp.includes('data-welcome="unified"'), 'StadtPocket: unchanged');
  assert.ok((await welcome('sp-en', { lang: 'en' }, 'sp-en')).includes('<html lang="en">'));
});

test('first visit: the redirect still sends no ?lang, so the welcome screen follows the page', () => {
  const s = src();
  assert.ok(s.includes('var u=new URL("/lp/welcome/"+s,window.location.origin);if(c)u.searchParams.set("cid",c);window.location.replace(u.toString());'));
  assert.ok(s.includes("const asked = req.query.lang === 'de' || req.query.lang === 'en' ? req.query.lang : null;"));
  assert.ok(s.includes("const saved = sections.language === 'de' || sections.language === 'en' ? sections.language : null;"));
});

test('scope: wallet passes, wallet routes, StadtPocket and the database are untouched', () => {
  const changed = git('diff', '3b0804f', '--name-only', '--', 'backend/src/services/passService.js', 'backend/src/services/googleWalletService.js',
    'backend/src/services/stadtPocketContext.js', 'backend/prisma', 'frontend/public/manifest.json', 'frontend/public/sw.js', 'backend/public/sw.js').trim();
  assert.equal(changed, '');
  // lpRoutes.js: unchanged apart from the push campaign security hotfix (sign-in on two push routes)
  const routes = lf(fs.readFileSync(path.join(ROOT, 'backend', 'src', 'routes', 'lpRoutes.js'), 'utf8'))
    .replace("// The page's own account only (handlers check ownership): device counts and\n// campaign texts are that business's data.\n", '')
    .replace("count', requireAuth, handlePushCount", "count', handlePushCount").replace("history', requireAuth, handlePushHistory", "history', handlePushHistory")
    // and the subscriber data hotfix (tests/subscriberDataAuth.test.js): sign-in on the email list route
    .replace("// The page's own account only (the handler checks ownership): subscriber emails.\nrouter.get('/lp/subscribers/:slug', requireAuth, handleGetSubscribers);", "router.get('/lp/subscribers/:slug', handleGetSubscribers);");
  assert.equal(routes, git('show', '3b0804f:backend/src/routes/lpRoutes.js'));
});

(async () => {
  let passed = 0, failed = 0;
  console.log('welcomeUnified');
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { failed++; console.error('  FAIL ' + t.name + '\n       ' + e.message); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + tests.length + ' total)');
  if (failed) process.exitCode = 1;
})();
