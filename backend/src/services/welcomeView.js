// ============================================================
// welcomeView.js — the unified QRAIVY welcome screen (Phase 5.5B, Stage 1)
// for GET /lp/welcome/:slug.
//
// Served only for pages listed in WELCOME_V2_SLUGS (comma separated slugs,
// read on every request; unset = no page). Every other page keeps today's
// screen. StadtPocket pages never get here: handleLoyaltyWelcome renders
// their Smart Welcome first (StadtPocket project, unchanged).
//
// Two variants of one design:
//   business  every QRAIVY page without loyalty: Add to Home Screen is the
//             main journey (it is what makes web push possible on iPhone);
//             no stamps, no rewards, no wallet pass (today's pass for such a
//             page would show stamps the business never set up).
//   loyalty   a page whose StampSettings are enabled: the same journey plus
//             the real goal and reward, and the Wallet badge for the device.
//
// Unchanged on purpose: the wallet endpoints (/lp/wallet/apple|google/:slug
// with ?cid=), the "already welcomed" flag wEnr_<slug>, the return to
// /lp/:slug (4 s after a wallet tap), and resolveSlugCid (passed in).
// No business logo in the content; the installed app keeps the logo icon.
// ============================================================
const fs = require('fs');
const path = require('path');

const COLORS = { bg: '#101012', card: '#19191C', text: '#FFFFFF', text2: '#C9C9CE', accent: '#FF5B2A', green: '#16A34A' };
const FALLBACK_ICON = 'https://www.qraivy.com/apple-touch-icon.png';
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

// Google's official "Add to Google Wallet" badges, unmodified
// (developers.google.com/wallet, add-to-wallet-svg.zip).
const BADGE_DIR = path.join(__dirname, '..', 'assets', 'wallet-badges');
const GOOGLE_BADGE = {
  de: fs.readFileSync(path.join(BADGE_DIR, 'de_add_to_google_wallet_add-wallet-badge.svg'), 'utf8'),
  en: fs.readFileSync(path.join(BADGE_DIR, 'enUS_add_to_google_wallet_add-wallet-badge.svg'), 'utf8'),
};
// Apple's "Add to Apple Wallet" badge, outline version (for dark
// backgrounds), supplied by the owner from Apple's badge download and kept
// byte for byte. Only the US English badge so far: German pages use it too
// until Apple's de-DE badge is added as its own file. Embedded, so it shows
// on every host that serves /lp/welcome.
const appleImg = (file) => '<img class="wallet-img" src="data:image/png;base64,'
  + fs.readFileSync(path.join(BADGE_DIR, file)).toString('base64') + '" alt="" width="162" height="50">';
const APPLE_BADGE_EN = appleImg('enUS_add_to_apple_wallet_outline.png');
const APPLE_BADGE = { de: APPLE_BADGE_EN, en: APPLE_BADGE_EN };

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// The unified welcome, per page or per account:
//   WELCOME_V2_SLUGS      pages named one by one (as before);
//   WELCOME_V2_OWNER_IDS  every page of these accounts (Phase 5.5C.4). Ownership is
//                         the page's stored owner (LandingPage.userId, loaded on the
//                         server by the caller), never anything the request says.
//                         Pages linked to a Business (StadtPocket) are left out: they
//                         keep their own welcome unless named in WELCOME_V2_SLUGS.
function welcomeV2Enabled(slug, env = process.env, page = null) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return false;
  if (list(env.WELCOME_V2_SLUGS).includes(slug)) return true;
  if (!page || page.slug !== slug || typeof page.userId !== 'string' || !page.userId || page.businessId) return false;
  return list(env.WELCOME_V2_OWNER_IDS).includes(page.userId);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A value inside an inline <script>: a JSON literal that cannot close the tag.
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const httpsUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; } };

// Small line icons for the install steps (drawn here, no emoji, no platform
// artwork): Share = box with an arrow up, Add = square with a plus, Home,
// notification bell, browser menu dots.
const ICON_PATHS = {
  share: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
  add: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.5 21a1.8 1.8 0 0 0 3 0"/>',
  menu: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  blank: '',
};
const ico = (n) => '<span class="ico' + (n === 'blank' ? ' ico-blank' : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + ICON_PATHS[n] + '</svg></span>';

function texts(isDE, name, loyalty) {
  return isDE ? {
    brand: name,
    headline: 'Verpasse keine Angebote mehr!',
    recommended: 'Empfohlen',
    homeTitle: 'Zum Home-Bildschirm hinzufügen',
    homeDesc: 'Öffne ' + name + ' direkt von deinem Home-Bildschirm wie eine App.',
    iphoneNote: '<strong>Wichtig für iPhone:</strong> Füge ' + name + ' zum Home-Bildschirm hinzu, öffne die gespeicherte Seite und aktiviere anschließend Benachrichtigungen.',
    showMe: 'Zeig mir wie',
    loyaltyLabel: 'Treueprogramm',
    loyaltyLine: loyalty ? 'Sammle ' + loyalty.goal + ' Stempel' + (loyalty.rewardName ? ' – erhalte ' + loyalty.rewardName : '') + '.' : '',
    walletLabel: 'Treuekarte im Wallet speichern',
    appleText: 'Zu Apple Wallet hinzufügen',
    googleAlt: 'Zu Google Wallet hinzufügen',
    skip: 'Ohne Speichern fortfahren',
    powered: 'Unterstützt von',
    ready: name + ' ist bereit.',
    readyPush: 'Tippe auf der nächsten Seite auf „Benachrichtigungen aktivieren“ und dann auf „Erlauben“.',
    openSmart: 'Smart Page öffnen',
    close: 'Verstanden',
    guideTitle: 'Zum Home-Bildschirm hinzufügen',
    // The steps name the landing page's notification button exactly as it
    // reads on a page in this language (lpController renderPremiumLP T.push.btn).
    iosSteps: [
      ico('share') + '<span>Tippe in Safari auf „Teilen“. Je nach iOS-Version findest du es unter „•••“.</span>',
      ico('add') + '<span>Wähle „Zum Home-Bildschirm“.</span>',
      ico('blank') + '<span>Tippe oben rechts auf „Hinzufügen“.</span>',
      ico('home') + '<span>Öffne ' + name + ' über das neue Symbol auf deinem Home-Bildschirm.</span>',
      ico('bell') + '<span>Tippe auf „Benachrichtigungen aktivieren“ und dann auf „Erlauben“.</span>',
    ],
    iosOther: 'Öffne diese Seite in Safari, um ' + name + ' zum Home-Bildschirm hinzuzufügen.',
    androidSteps: [
      ico('menu') + '<span>Öffne das Browser-Menü.</span>',
      ico('add') + '<span>Wähle „Zum Startbildschirm hinzufügen“ oder „App installieren“.</span>',
      ico('blank') + '<span>Bestätige.</span>',
      ico('home') + '<span>Öffne ' + name + ' über das neue Symbol auf deinem Startbildschirm.</span>',
      ico('bell') + '<span>Tippe auf „Benachrichtigungen aktivieren“ und dann auf „Zulassen“.</span>',
    ],
    desktop: 'Öffne diese Seite auf deinem Handy, um ' + name + ' zum Home-Bildschirm hinzuzufügen.',
  } : {
    brand: name,
    headline: 'Never miss a new offer!',
    recommended: 'Recommended',
    homeTitle: 'Add to Home Screen',
    homeDesc: 'Open ' + name + ' straight from your Home Screen, like an app.',
    iphoneNote: '<strong>Important on iPhone:</strong> Add ' + name + ' to your Home Screen, open the saved page, then turn on notifications.',
    showMe: 'Show me how',
    loyaltyLabel: 'Loyalty program',
    loyaltyLine: loyalty ? 'Collect ' + loyalty.goal + ' stamps' + (loyalty.rewardName ? ' – get ' + loyalty.rewardName : '') + '.' : '',
    walletLabel: 'Save your loyalty card to Wallet',
    appleText: 'Add to Apple Wallet',
    googleAlt: 'Add to Google Wallet',
    skip: 'Continue without saving',
    powered: 'Powered by',
    ready: name + ' is ready.',
    readyPush: 'On the next page, tap “Enable Updates”, then “Allow”, to turn on notifications.',
    openSmart: 'Open Smart Page',
    close: 'Got it',
    guideTitle: 'Add to Home Screen',
    iosSteps: [
      ico('share') + '<span>In Safari, tap “Share”. Depending on your iOS version, it is under “•••”.</span>',
      ico('add') + '<span>Choose “Add to Home Screen”.</span>',
      ico('blank') + '<span>Tap “Add” in the top right.</span>',
      ico('home') + '<span>Open ' + name + ' from the new icon on your Home Screen.</span>',
      ico('bell') + '<span>Tap “Enable Updates”, then “Allow”.</span>',
    ],
    iosOther: 'Open this page in Safari to add ' + name + ' to your Home Screen.',
    androidSteps: [
      ico('menu') + '<span>Open the browser menu.</span>',
      ico('add') + '<span>Choose “Add to Home screen” or “Install app”.</span>',
      ico('blank') + '<span>Confirm.</span>',
      ico('home') + '<span>Open ' + name + ' from the new icon on your Home screen.</span>',
      ico('bell') + '<span>Tap “Enable Updates”, then “Allow”.</span>',
    ],
    desktop: 'Open this page on your phone to add ' + name + ' to your Home Screen.',
  };
}

const CSS = [
  '*{box-sizing:border-box;margin:0;padding:0}',
  'html{-webkit-text-size-adjust:100%}',
  'body{background:' + COLORS.bg + ';color:' + COLORS.text + ';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;min-height:100dvh;',
  'padding:calc(env(safe-area-inset-top) + 28px) calc(env(safe-area-inset-right) + 18px) calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 18px)}',
  '.wrap{max-width:420px;margin:0 auto}',
  '.brand{font-size:1.15rem;line-height:1.3;font-weight:800;color:' + COLORS.text + ';text-align:center;overflow-wrap:anywhere;margin-bottom:8px}',
  'h1{font-size:1.85rem;line-height:1.15;font-weight:800;letter-spacing:-.015em;text-align:center;text-wrap:balance;overflow-wrap:anywhere;margin-bottom:24px}',
  '.card{background:' + COLORS.card + ';border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:22px 20px;margin-bottom:14px}',
  '.badge{display:inline-block;background:rgba(255,91,42,.14);color:' + COLORS.accent + ';font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 11px;border-radius:999px;margin-bottom:12px}',
  '.card-title{font-size:1.18rem;line-height:1.3;font-weight:800;margin-bottom:6px}',
  '.card-desc{font-size:.95rem;line-height:1.55;color:' + COLORS.text2 + ';margin-bottom:16px}',
  '.note strong{font-weight:800}',
  '.note{display:none;font-size:.92rem;line-height:1.55;color:' + COLORS.text + ';background:rgba(255,91,42,.10);border-left:3px solid ' + COLORS.accent + ';border-radius:10px;padding:12px 14px;margin-bottom:16px}',
  '.btn-green{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;padding:14px 18px;background:' + COLORS.green + ';color:#fff;border:0;border-radius:16px;font-size:1.08rem;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent}',
  '.label{font-size:.78rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + COLORS.text2 + ';margin-bottom:8px}',
  '.loyalty-line{font-size:1.05rem;line-height:1.45;font-weight:700;margin-bottom:16px}',
  '.wallet{display:flex;flex-direction:column;align-items:center;gap:10px}',
  '.wallet-badge{display:none;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
  '.wallet-badge svg,.wallet-badge .wallet-img{display:block;height:50px;width:auto;max-width:100%}',
  '.wallet-text{display:none;min-height:50px;padding:12px 18px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer}',
  '.btn-skip{display:block;width:100%;min-height:50px;padding:13px;background:transparent;color:' + COLORS.text2 + ';border:1.5px solid rgba(255,255,255,.2);border-radius:16px;font-size:.98rem;font-weight:600;cursor:pointer;margin-top:4px}',
  '.footer{margin-top:22px;text-align:center;font-size:.72rem;color:rgba(255,255,255,.35)}',
  '.footer a{color:rgba(255,255,255,.5);text-decoration:none}',
  '.ready{display:none;text-align:center;padding:48px 0 12px}',
  '.ready-check{width:60px;height:60px;border-radius:50%;background:' + COLORS.green + ';display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:1.7rem}',
  '.ready-title{font-size:1.3rem;font-weight:800;margin-bottom:10px;overflow-wrap:anywhere}',
  '.ready-push{font-size:.95rem;line-height:1.5;color:' + COLORS.text2 + ';margin:0 auto 22px;max-width:320px}',
  '.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;align-items:flex-end;justify-content:center}',
  '.sheet{background:' + COLORS.card + ';border-radius:22px 22px 0 0;padding:24px 22px calc(env(safe-area-inset-bottom) + 24px);width:100%;max-width:440px}',
  '.sheet-title{font-size:1.15rem;font-weight:800;margin-bottom:16px}',
  '.steps{list-style:none;counter-reset:s;margin-bottom:18px}',
  '.steps li{counter-increment:s;position:relative;display:flex;align-items:flex-start;gap:10px;padding:1px 0 14px 38px;font-size:.98rem;line-height:1.5}',
  '.steps li>span:not(.ico){min-width:0;flex:1}',
  '.ico{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.1);color:' + COLORS.text + '}',
  '.ico svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
  '.ico svg circle{fill:currentColor;stroke:none}',
  '.ico-blank{background:none}',
  '.steps li:before{content:counter(s);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:' + COLORS.green + ';color:#fff;font-size:.8rem;font-weight:800;display:flex;align-items:center;justify-content:center}',
  '.plain{font-size:.98rem;line-height:1.55;margin-bottom:18px}',
  '.btn-close{width:100%;min-height:50px;background:rgba(255,255,255,.1);color:#fff;border:0;border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer}',
].join('');

// model: { slug, isDE, bizName, iconUrl, loyalty: null | { goal, rewardName }, cidHelperJs }
function renderWelcome(model) {
  const { slug, isDE, bizName, iconUrl, loyalty, cidHelperJs } = model;
  const lang = isDE ? 'de' : 'en';
  const plainName = String(bizName || slug);
  const name = esc(plainName);
  const t = texts(isDE, name, loyalty ? { goal: esc(loyalty.goal), rewardName: loyalty.rewardName ? esc(loyalty.rewardName) : null } : null);
  const icon = httpsUrl(iconUrl) || FALLBACK_ICON;
  const steps = (list) => '<ol class="steps">' + list.map((x) => '<li>' + x + '</li>').join('') + '</ol>';

  const walletCard = loyalty ? '<div class="card" id="loyaltyCard">'
    + '<div class="label">' + t.loyaltyLabel + '</div>'
    + '<div class="loyalty-line">' + t.loyaltyLine + '</div>'
    + '<div class="label">' + t.walletLabel + '</div>'
    + '<div class="wallet">'
    + (APPLE_BADGE[lang]
      ? '<button type="button" class="wallet-badge" id="appleBadge" onclick="addAppleWallet()" aria-label="' + t.appleText + '">' + APPLE_BADGE[lang] + '</button>'
      : '<button type="button" class="wallet-text" id="appleBadge" onclick="addAppleWallet()">' + t.appleText + '</button>')
    + '<button type="button" class="wallet-badge" id="googleBadge" onclick="addGoogleWallet()" aria-label="' + t.googleAlt + '">' + GOOGLE_BADGE[lang] + '</button>'
    + '</div></div>' : '';

  return '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="theme-color" content="' + COLORS.bg + '">'
    + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
    + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
    + '<meta name="apple-mobile-web-app-title" content="' + name + '">'
    + '<link rel="apple-touch-icon" href="' + esc(icon) + '">'
    + '<title>' + name + '</title><style>' + CSS + '</style></head><body data-welcome="unified" data-variant="' + (loyalty ? 'loyalty' : 'business') + '"><div class="wrap">'
    + '<div id="onboarding">'
    + '<p class="brand">' + t.brand + '</p><h1>' + t.headline + '</h1>'
    + '<div class="card" id="homeCard"><span class="badge">' + t.recommended + '</span>'
    + '<div class="card-title">' + t.homeTitle + '</div>'
    + '<p class="card-desc" id="homeDesc">' + t.homeDesc + '</p>'
    + '<p class="note" id="iphoneNote">' + t.iphoneNote + '</p>'
    + '<button type="button" class="btn-green" id="showMeBtn">' + t.showMe + '</button></div>'
    + walletCard
    + '<button type="button" class="btn-skip" id="skipBtn" onclick="continueWithout()">' + t.skip + '</button>'
    + '</div>'
    + '<div class="ready" id="readyState"><div class="ready-check">&#10003;</div><div class="ready-title">' + t.ready + '</div>'
    + '<p class="ready-push" id="readyPush">' + t.readyPush + '</p>'
    + '<button type="button" class="btn-green" style="max-width:300px;margin:0 auto" onclick="continueWithout()">' + t.openSmart + '</button></div>'
    + '<div class="footer">' + t.powered + ' <a href="https://qraivy.com">Qraivy</a></div>'
    + '</div>'
    + '<div class="overlay" id="guidancePanel" role="dialog" aria-modal="true" aria-labelledby="guideTitle"><div class="sheet"><div class="sheet-title" id="guideTitle">' + t.guideTitle + '</div><div id="guidanceBody"></div><button type="button" class="btn-close" id="guidanceClose">' + t.close + '</button></div></div>'
    + '<script>' + (cidHelperJs || '') + '(function(){'
    + 'var s=' + js(slug) + ';'
    + 'var RESOLVED_CID=null;try{RESOLVED_CID=resolveSlugCid(s);}catch(ex){}'
    + 'function q(){return RESOLVED_CID?"?cid="+encodeURIComponent(RESOLVED_CID):"";}'
    + 'function mE(){try{localStorage.setItem("wEnr_"+s,"1");}catch(ex){}}'
    + 'function backToLP(){return "/lp/"+encodeURIComponent(s)+q();}'
    + 'window.continueWithout=function(){mE();window.location.href=backToLP();};'
    + 'window.addAppleWallet=function(){mE();window.location.href="/lp/wallet/apple/"+encodeURIComponent(s)+q();setTimeout(function(){window.location.href=backToLP();},4000);};'
    + 'window.addGoogleWallet=function(){mE();window.location.href="/lp/wallet/google/"+encodeURIComponent(s)+q();setTimeout(function(){window.location.href=backToLP();},4000);};'
    + 'var ua=navigator.userAgent;'
    + 'var isIOS=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);'
    + 'var isAndroid=/Android/i.test(ua);'
    + 'var isSafari=/^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);'
    + 'var isStandalone=(window.navigator.standalone===true)||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);'
    + 'function show(id,on,disp){var e=document.getElementById(id);if(e)e.style.display=on?(disp||"block"):"none";}'
    + 'if(isStandalone){show("onboarding",false);show("readyState",true);show("readyPush",isIOS);return;}'
    + 'show("iphoneNote",isIOS);'
    // Wallet badge for the device; unknown devices see both.
    + 'var apple=document.getElementById("appleBadge"),google=document.getElementById("googleBadge");'
    + 'if(apple)apple.style.display=(isIOS||!isAndroid)?"inline-flex":"none";'
    + 'if(google)google.style.display=(isAndroid||!isIOS)?"inline-flex":"none";'
    + 'if(!isIOS&&!isAndroid){var d=document.getElementById("homeDesc");if(d)d.textContent=' + js(texts(isDE, plainName, null).desktop) + ';show("showMeBtn",false);}'
    + 'var body=document.getElementById("guidanceBody"),panel=document.getElementById("guidancePanel");'
    + 'document.getElementById("showMeBtn").onclick=function(){'
    + 'body.innerHTML=isIOS?(isSafari?' + js(steps(t.iosSteps)) + ':' + js('<p class="plain">' + t.iosOther + '</p>') + '):' + js(steps(t.androidSteps)) + ';'
    + 'panel.style.display="flex";document.getElementById("guidanceClose").focus();};'
    + 'document.getElementById("guidanceClose").onclick=function(){panel.style.display="none";};'
    + 'panel.addEventListener("click",function(e){if(e.target===panel)panel.style.display="none";});'
    + '})();</script></body></html>';
}

module.exports = { renderWelcome, welcomeV2Enabled, COLORS, FALLBACK_ICON, GOOGLE_BADGE, APPLE_BADGE };
