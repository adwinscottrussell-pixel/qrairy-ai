// QRAIVY Admin shell — canonical sidebar labels (EN/DE), language selector
// and mobile menu for every logged-in business Admin page.
//
// Not a separate translation framework: the language state is the one in
// js/qraivy-lang.js (window.QRAIVY_LANGUAGE / setQraivyLang, localStorage
// 'qraivy_lang') and labels use the existing data-i18n attribute. Pages
// with their own dictionary call QraivyShell.apply(lang) at the end of
// their applyLang(), so shell labels always come from this one place.
//
// Load after js/qraivy-lang.js. The sidebar markup itself is the static
// block copied from dashboard.html (see tests: admin-nav-shell).
(function () {
  var T = {
    en: {
      nav_main: 'Main', nav_dashboard: 'Dashboard', nav_analytics: 'Analytics',
      nav_smartpages: 'Smart Pages', nav_sqrpages: 'Smart QR Pages', nav_createnew: 'Create New QR',
      nav_engage: 'Engage', nav_campaigns: 'AI Campaigns', nav_customers: 'Customers', nav_loyalty: 'Loyalty',
      nav_configure: 'Configure', nav_wallet: 'Wallet Passes',
      nav_account: 'Account', nav_billing: 'Billing & Plans', nav_settings: 'Settings',
      role_owner: 'Business Owner', nav_signout: 'Sign Out',
      shell_language: 'Language', shell_navigate: 'Navigate',
      bn_home: 'Home', bn_pages: 'Pages', bn_campaigns: 'Campaigns',
      lang_current: 'English', lang_switch: 'Switch to Deutsch',
      settings_sub: 'Manage your account and preferences.', settings_prefs: 'Preferences',
      settings_lang_current: 'Current language', settings_quick: 'Quick Links',
      settings_signed_in: 'Signed in as', settings_role: 'Role'
    },
    de: {
      nav_main: 'Hauptmenü', nav_dashboard: 'Dashboard', nav_analytics: 'Analytics',
      nav_smartpages: 'Smart Pages', nav_sqrpages: 'Smart QR-Seiten', nav_createnew: 'Neuen QR erstellen',
      nav_engage: 'Engagement', nav_campaigns: 'KI-Kampagnen', nav_customers: 'Kunden', nav_loyalty: 'Treue',
      nav_configure: 'Konfigurieren', nav_wallet: 'Wallet-Pässe',
      nav_account: 'Konto', nav_billing: 'Abrechnung & Pläne', nav_settings: 'Einstellungen',
      role_owner: 'Unternehmensinhaber', nav_signout: 'Abmelden',
      shell_language: 'Sprache', shell_navigate: 'Navigation',
      bn_home: 'Start', bn_pages: 'Seiten', bn_campaigns: 'Kampagnen',
      lang_current: 'Deutsch', lang_switch: 'Zu Englisch wechseln',
      settings_sub: 'Verwalte dein Konto und deine Präferenzen.', settings_prefs: 'Präferenzen',
      settings_lang_current: 'Aktuelle Sprache', settings_quick: 'Schnellzugriff',
      settings_signed_in: 'Angemeldet als', settings_role: 'Rolle'
    }
  };

  function norm(l) { return l === 'de' ? 'de' : 'en'; }
  function lang() { return norm(window.QRAIVY_LANGUAGE); }
  function t(key) { var d = T[lang()]; return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : T.en[key]; }

  // Apply shell labels + selector state for `lang` and persist it through
  // the canonical language state.
  function apply(l) {
    l = norm(l || lang());
    if (window.setQraivyLang) window.setQraivyLang(l);
    else { window.QRAIVY_LANGUAGE = l; window._qraivyLang = l; try { localStorage.setItem('qraivy_lang', l); } catch (e) {} }
    var d = T[l];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (Object.prototype.hasOwnProperty.call(d, k)) el.textContent = d[k];
    });
    // The selector shows the language currently in use; the button's
    // tooltip / the mobile button name the action.
    var lbl = document.getElementById('lang-toggle-label');
    if (lbl) lbl.textContent = d.lang_current;
    var btn = document.getElementById('lang-toggle');
    if (btn) { btn.title = d.lang_switch; btn.setAttribute('aria-label', d.lang_switch); }
    var mobLbl = document.getElementById('mob-lang-label');
    if (mobLbl) mobLbl.textContent = d.lang_current;
    var mobBtn = document.getElementById('mob-lang-btn');
    if (mobBtn) mobBtn.textContent = d.lang_switch;
    document.documentElement.lang = l;
  }

  function toast(msg) {
    var box = document.getElementById('cs-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'cs-toast';
      box.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1c2128;border:1px solid rgba(255,90,31,0.3);color:#f0f4f8;padding:10px 16px;border-radius:7px;font-size:.78rem;z-index:9999;display:none;align-items:center;gap:8px;';
      box.innerHTML = '<span style="color:#ff5a1f">&#x26A1;</span><span id="cs-toast-msg"></span>';
      document.body.appendChild(box);
    }
    var m = document.getElementById('cs-toast-msg');
    if (m) m.textContent = ' ' + msg;
    box.style.display = 'flex';
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { box.style.display = 'none'; }, 2800);
  }

  // Mobile: the menu button opens the canonical sidebar as a drawer; the
  // overlay or Escape closes it. (Idempotent with pages' own handlers.)
  function bindMobile() {
    var sb = document.getElementById('sidebar');
    var btn = document.getElementById('mob-btn');
    var ov = document.getElementById('sb-overlay');
    if (!sb || !btn) return;
    function close() { sb.classList.remove('mob-open'); if (ov) ov.classList.remove('on'); }
    btn.addEventListener('click', function () { sb.classList.add('mob-open'); if (ov) ov.classList.add('on'); });
    if (ov) ov.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    // While the drawer is open the page underneath stays put: the body is
    // pinned at its scroll position (iOS ignores overflow:hidden alone) and
    // restored on close. Follows the class, so every page's own open/close
    // handlers are covered.
    var lockedY = null;
    function sync() {
      var open = sb.classList.contains('mob-open');
      var bs = document.body.style;
      if (open && lockedY === null) {
        lockedY = window.scrollY || 0;
        bs.position = 'fixed'; bs.top = -lockedY + 'px'; bs.left = '0'; bs.right = '0'; bs.width = '100%';
      } else if (!open && lockedY !== null) {
        bs.position = ''; bs.top = ''; bs.left = ''; bs.right = ''; bs.width = '';
        window.scrollTo(0, lockedY);
        lockedY = null;
      }
    }
    if (window.MutationObserver) new MutationObserver(sync).observe(sb, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    bindMobile();
    apply(lang());
  }

  window.QraivyShell = { apply: apply, t: t, lang: lang, toast: toast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
