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
      nav_dealspromo: 'Deals & Promotions', nav_deals: 'All Deals',
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
      nav_dealspromo: 'Deals & Aktionen', nav_deals: 'Alle Deals',
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

  // Collapse toggle, account name and Sign Out, for a page that does not
  // carry its own copy of this code. Call once, right after the sidebar
  // markup (so the remembered state is applied before the first paint).
  // The choice is remembered as 'sb-collapsed', the key every Admin page
  // uses. With nothing remembered, the sidebar starts collapsed in narrower
  // windows and follows the window as it is resized; once the owner uses
  // the toggle, that choice wins. On phones the sidebar is the drawer
  // (bindMobile), which always opens full width, so nothing is collapsed there.
  var NARROW_SIDEBAR = '(max-width: 1099px)', PHONE_SIDEBAR = '(max-width: 768px)';
  function rememberedCollapse() { try { return localStorage.getItem('sb-collapsed'); } catch (e) { return null; } }
  function bindSidebar() {
    var sb = document.getElementById('sidebar');
    if (!sb || sb.getAttribute('data-shell-bound') === '1') return false;
    sb.setAttribute('data-shell-bound', '1');
    function show(collapsed) { sb.classList.toggle('collapsed', collapsed); document.body.classList.toggle('sb-collapsed', collapsed); }
    var narrow = window.matchMedia ? window.matchMedia(NARROW_SIDEBAR) : null;
    var phone = window.matchMedia ? window.matchMedia(PHONE_SIDEBAR) : null;
    function wanted() {
      if (phone && phone.matches) return false;
      var kept = rememberedCollapse();
      return kept === 'true' ? true : (kept === 'false' ? false : !!(narrow && narrow.matches));
    }
    show(wanted());
    [narrow, phone].forEach(function (q) {
      if (!q) return;
      var follow = function () { show(wanted()); };
      if (q.addEventListener) q.addEventListener('change', follow); else if (q.addListener) q.addListener(follow);
    });
    var toggle = document.getElementById('sb-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      var c = !sb.classList.contains('collapsed');
      show(c);
      try { localStorage.setItem('sb-collapsed', String(c)); } catch (e) {}
    });
    var out = document.getElementById('sb-signout');
    if (out) out.addEventListener('click', function (e) {
      e.preventDefault();
      var go = function () { window.location.href = 'login.html'; };
      try { if (window.Clerk && window.Clerk.signOut) { Promise.resolve(window.Clerk.signOut()).then(go, go); return; } } catch (err) {}
      go();
    });
    if (window.Clerk && window.Clerk.load) {
      Promise.resolve(window.Clerk.load()).then(function () {
        var u = window.Clerk.user; if (!u) return;
        var email = (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || (u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress) || '';
        var name = u.firstName || email; if (!name) return;
        var n = document.getElementById('sb-username'), a = document.getElementById('sb-avatar');
        if (n) n.textContent = name;
        if (a) a.textContent = name.charAt(0).toUpperCase();
      }, function () {});
    }
    return true;
  }

  // The six tabs (MAIN … ACCOUNT). Each is closed until it is clicked; the
  // tab holding the current page (.sb-item.active, also set by pages such as
  // dashboard.html as the owner moves between sections) is marked .current
  // and opens itself -- the CSS does the same with :has() on first paint.
  // Clicking an open tab closes it, even the current one (.shut). On the
  // narrow rail a tab first opens the sidebar, through the page's own toggle.
  function bindTabs() {
    var sb = typeof document.getElementById === 'function' ? document.getElementById('sidebar') : null;
    if (!sb || typeof sb.querySelectorAll !== 'function' || sb.getAttribute('data-tabs-bound') === '1') return false;
    var tabs = [].slice.call(sb.querySelectorAll('.sb-tab'));
    if (!tabs.length) return false;
    sb.setAttribute('data-tabs-bound', '1');
    function isOpen(tab) { return tab.classList.contains('open') || (tab.classList.contains('current') && !tab.classList.contains('shut')); }
    function sync() {
      tabs.forEach(function (tab) {
        var current = !!tab.querySelector('.sb-item.active');
        if (current && !tab.classList.contains('current')) tab.classList.remove('shut');   // the page moved here: show it
        if (current !== tab.classList.contains('current')) tab.classList.toggle('current', current);
        var btn = tab.querySelector('.sb-tab-btn');
        if (btn) btn.setAttribute('aria-expanded', String(isOpen(tab)));
      });
    }
    tabs.forEach(function (tab) {
      var btn = tab.querySelector('.sb-tab-btn');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var rail = sb.classList.contains('collapsed') && !(window.matchMedia && window.matchMedia(PHONE_SIDEBAR).matches);
        if (rail || !isOpen(tab)) { tab.classList.add('open'); tab.classList.remove('shut'); }
        else { tab.classList.remove('open'); tab.classList.add('shut'); }
        if (rail) { var toggle = document.getElementById('sb-toggle'); if (toggle) toggle.click(); }
        sync();
      });
    });
    sync();
    if (window.MutationObserver) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].target.classList && records[i].target.classList.contains('sb-item')) { sync(); return; }
        }
      }).observe(sb, { attributes: true, attributeFilter: ['class'], subtree: true });
    }
    return true;
  }

  function init() {
    bindMobile();
    bindTabs();
    apply(lang());
  }

  // Tabs right away when the sidebar is already parsed (script after it).
  bindTabs();

  window.QraivyShell = { apply: apply, t: t, lang: lang, toast: toast, bindSidebar: bindSidebar, bindTabs: bindTabs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
