// Phase 0 (S1, tests/lpRenderEscaping.test.js) changed how a page writes its
// values: escaped text, the slug as a JSON string, links in data- attributes
// instead of inside onclick code. Older "byte for byte as before" tests undo
// exactly these edits with revertPage0() and keep comparing everything else.
// Only valid for pages whose values need no escaping beyond apostrophes in
// the built-in card texts (the fixtures these tests use).

const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function revertPage0(html) {
  let out = html
    // var SLUG = "slug";  ->  var SLUG = 'slug';
    .replace(/var SLUG = "([A-Za-z0-9_-]*)";/, "var SLUG = '$1';")
    // the "auto-fill from your URL" line: the link went back into onclick code
    .replace(/data-href="([^"]*)" onclick="window\.location\.href=this\.getAttribute\('data-href'\)"/, (m, u) => `onclick="window.location.href='${unesc(u)}'"`)
    // action cards: url and label back into the onclick call
    .replace(/<div onclick="openCard\(this\.getAttribute\('data-url'\),this\.getAttribute\('data-label'\)\)" data-url="([^"]*)" data-label="([^"]*)" style=/g,
      (m, u, l) => `<div onclick="openCard('${unesc(u)}','${unesc(l).replace(/'/g, "\\'")}'  )" style=`);
  // card texts were written unescaped
  const a = out.indexOf('<!-- ACTION CARDS');
  const b = out.indexOf('<!-- SUBSCRIBE', a);
  if (a >= 0 && b > a) out = out.slice(0, a) + unesc(out.slice(a, b)) + out.slice(b);
  return out;
}

// The same edits in lpController.js source text, for tests that compare a
// template or function with an older commit.
function revertSource0(src) {
  return src
    .split("var s=' + jsStr(slug) + '").join("var s=\"' + slug + '\"")
    .split("' + escHtml(bizName) + '").join("' + bizName + '");
}

// handleStamp / handleStampConfirm source: the slug as a script-safe string
// (S1) and the customer's loyalty record counted in the confirm step (S3).
function revertStamp0(src) {
  const s3 = src.indexOf('    // Phase 0 (S3): the customer\'s loyalty record');
  if (s3 >= 0) {
    const endMark = "catch (e) { console.error('[Stamp] LoyaltyCustomer update error:', e.message); }\n    }\n";
    const end = src.indexOf(endMark, s3);
    if (end < 0) throw new Error('Phase 0 S3 block not found as expected');
    src = src.slice(0, s3) + src.slice(end + endMark.length);
  }
  return src.split("resolveSlugCid(' + jsStr(slug) + ')").join("resolveSlugCid(' + JSON.stringify(slug) + ')");
}

// smart-qr-detail.html: the page-record fallback now sends the sign-in (S4).
const SQD_NEW = "  // Answered only to the page's signed-in owner, so the token is sent along.\n" +
  "  function fallbackFromLP(slug, lpUrl) {\n" +
  "    var tok = null;\n" +
  "    try { tok = (window.Clerk && window.Clerk.session) ? window.Clerk.session.getToken() : null; } catch (_) {}\n" +
  "    Promise.resolve(tok).catch(function() { return null; })\n" +
  "      .then(function(t) { return fetch((window.QRAIVY_API_BASE || 'https://api.qraivy.com') + '/api/lp/' + encodeURIComponent(slug), t ? { headers: { Authorization: 'Bearer ' + t } } : undefined); })\n";
const SQD_OLD = "  function fallbackFromLP(slug, lpUrl) {\n" +
  "    fetch((window.QRAIVY_API_BASE || 'https://api.qraivy.com') + '/api/lp/' + encodeURIComponent(slug))\n";
function revertSqd0(html) {
  const s = html.replace(/\r\n/g, '\n');
  if (s.split(SQD_NEW).length !== 2) throw new Error('Phase 0 smart-qr-detail edit not found exactly once');
  return s.replace(SQD_NEW, SQD_OLD);
}

// js/voice-greeting-editor.js: the page record is read with the sign-in in
// production too (S4), not only on staging.
const VGE_NEW = "      // The page record is answered only to the signed-in owner (staging\n" +
  "      // and, since Phase 0, production), so the token is always sent along.\n" +
  "      var pageUrl = API + '/api/lp/' + encodeURIComponent(slug) + '?t=' + Date.now();\n" +
  "      var read = Promise.resolve(authToken()).then(function (tok) { return fetch(pageUrl, tok ? { headers: { 'Authorization': 'Bearer ' + tok } } : undefined); });\n";
const VGE_OLD = "      // Production reads the page as before. A staging API answers this\n" +
  "      // only to the signed-in owner, so there the token is sent along.\n" +
  "      var pageUrl = API + '/api/lp/' + encodeURIComponent(slug) + '?t=' + Date.now();\n" +
  "      var read = window.QRAIVY_ROUTING.mode === 'staging'\n" +
  "        ? Promise.resolve(authToken()).then(function (tok) { return fetch(pageUrl, tok ? { headers: { 'Authorization': 'Bearer ' + tok } } : undefined); })\n" +
  "        : fetch(pageUrl);\n";
function revertVoiceEditor0(js) {
  const s = js.replace(/\r\n/g, '\n');
  if (s.split(VGE_NEW).length !== 2) throw new Error('Phase 0 voice editor edit not found exactly once');
  return s.replace(VGE_NEW, VGE_OLD);
}

module.exports = { revertPage0, revertSource0, revertStamp0, revertSqd0, revertVoiceEditor0, SQD_NEW, VGE_NEW };
