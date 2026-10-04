/*
 * QRAIVY API base resolver + Plan Preview safety boundary.
 *
 * Exactly one hostname — plan-preview.qraivy.com — talks to the isolated
 * plan-consolidation backend. Every other host (qraivy.com, www, admin-preview,
 * preview, raw Vercel preview URLs, localhost) resolves to the same production
 * values the pages used before this file existed, and gets no extra behaviour.
 *
 * On plan-preview.qraivy.com only, navigation into pages that still hardcode
 * the production API, and live Landing Page views (rendered pages post to
 * production endpoints), are intercepted with a "Not available in Plan Preview"
 * notice so nothing silently crosses into production.
 */
(function () {
  var PLAN_PREVIEW_HOST = 'plan-preview.qraivy.com';
  var PLAN_PREVIEW_API = 'https://qraivy-plan-api-plan-preview.up.railway.app';
  var isPlanPreview = window.location.hostname === PLAN_PREVIEW_HOST;

  window.QRAIVY_IS_PLAN_PREVIEW = isPlanPreview;
  window.QRAIVY_API_BASE = isPlanPreview ? PLAN_PREVIEW_API : 'https://api.qraivy.com';
  // Push endpoints were called through the www rewrite; unchanged off preview.
  window.QRAIVY_PUSH_BASE = isPlanPreview ? PLAN_PREVIEW_API : 'https://www.qraivy.com';

  // Same-origin pages that still call https://api.qraivy.com directly.
  var BLOCKED_PAGES = [
    'analytics.html', 'wallet-pass-studio.html', 'smart-qr-detail.html',
    'loyalty-setup.html', 'editor.html', 'qr-free.html', 'qr-free-dashboard.html',
    'qr-manage.html', 'designer-saved.html', 'admin.html', 'stamp-scanner.html'
  ];
  // Production-hosted Landing Page / stamp URLs (not in the preview database).
  var PRODUCTION_PAGE_PREFIXES = [
    'https://www.qraivy.com/lp/', 'https://qraivy.com/lp/', 'https://api.qraivy.com/lp/',
    'https://www.qraivy.com/stamp/', 'https://api.qraivy.com/stamp/'
  ];

  function blockReason(url) {
    var u;
    try { u = new URL(url, window.location.href); } catch (e) { return null; }
    var href = u.href;
    for (var i = 0; i < PRODUCTION_PAGE_PREFIXES.length; i++) {
      if (href.indexOf(PRODUCTION_PAGE_PREFIXES[i]) === 0) return 'Live page view is not available in Plan Preview.';
    }
    if (u.origin === window.location.origin && BLOCKED_PAGES.indexOf(u.pathname.split('/').pop()) !== -1) {
      return 'Not available in Plan Preview.';
    }
    return null;
  }

  function notice(message) {
    var el = document.getElementById('qraivy-plan-preview-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qraivy-plan-preview-notice';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
        'background:#1a1a1a;color:#fff;border:1px solid #ff5a1f;border-radius:10px;padding:12px 18px;' +
        'font:500 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45);max-width:90vw;text-align:center';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 3500);
  }

  // Returns true when navigation may proceed. Always true off Plan Preview.
  window.qraivyAllowNavigation = function (url) {
    if (!isPlanPreview) return true;
    var reason = blockReason(url);
    if (!reason) return true;
    notice(reason);
    return false;
  };

  if (isPlanPreview) {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var reason = blockReason(a.getAttribute('href'));
      if (!reason) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      notice(reason);
    }, true);
  }
})();
