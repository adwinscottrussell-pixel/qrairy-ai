// ============================================================
// home-pricing.js — public homepage pricing section (#pricing).
//
// Renders Free / Starter / Pro / Business from GET /public/plans — the
// same canonical catalogue Admin Billing receives — so no prices or limits
// are defined in the homepage. Strings come from the homepage dictionary
// (window.QH_I18N, applied by qhApplyLang) in the current QRAIVY_LANGUAGE.
//
// CTAs do not start Stripe checkout. They use the existing account flow
// (login.html → dashboard) and carry the selected paid plan to Admin
// Billing as ?plan=<starter|pro|business>[_annual] for the later
// authenticated checkout step.
// ============================================================
(function () {
  'use strict';

  var state = { plans: null, interval: 'monthly', failed: false, aligned: false };

  function lang() { return window.QRAIVY_LANGUAGE === 'de' ? 'de' : 'en'; }
  function t(key) {
    var dict = window.QH_I18N || {};
    var v = (dict[lang()] || {})[key];
    if (v === undefined) v = (dict.en || {})[key];
    return v === undefined ? '' : v;
  }
  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function fmtPrice(amount, currency) {
    try {
      return new Intl.NumberFormat(lang() === 'de' ? 'de-DE' : 'en-IE', {
        style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(amount);
    } catch (e) { return String(amount); }
  }
  function grid() { return document.getElementById('qhPricingGrid'); }

  // Free is localized; Starter/Pro/Business are product names from the catalogue.
  function displayName(p) { return p.id === 'free' ? t('pricing_plan_free') : p.name; }

  function featureLines(p) {
    var lines = [];
    if (p.smartPageLimit === null) lines.push(t('pricing_sp_unlimited'));
    else if (p.smartPageLimit === 0) lines.push(t('pricing_sp_none'));
    else if (p.smartPageLimit === 1) lines.push(t('pricing_sp_one'));
    else lines.push(fill(t('pricing_sp_n'), { n: p.smartPageLimit }));
    lines.push(p.basicQrLimit === null ? t('pricing_basic_unlimited') : fill(t('pricing_basic_n'), { n: p.basicQrLimit }));
    if (p.dynamicQr) lines.push(t('pricing_dynamic'));
    return lines;
  }

  // Existing account flow: login.html (Clerk sign-in incl. sign-up) → redirect.
  function ctaHref(p) {
    var signedIn = !!(window.Clerk && window.Clerk.user);
    var checkout = p.checkoutPlans || {};
    var planId = checkout[state.interval] || checkout.monthly || null;
    var target = planId ? 'dashboard.html?section=billing&plan=' + encodeURIComponent(planId) : 'dashboard.html';
    return signedIn ? target : 'login.html?redirect=' + encodeURIComponent(target);
  }

  function renderCard(p) {
    var paid = !!(p.checkoutPlans && (p.checkoutPlans.monthly || p.checkoutPlans.annual));
    var annual = state.interval === 'annual';
    var amount = annual ? p.annualMonthlyPrice : p.monthlyPrice;

    var card = el('article', 'qh-pricing-card');
    card.appendChild(el('h3', 'qh-pricing-name', displayName(p)));

    var price = el('div', 'qh-pricing-price');
    price.appendChild(el('span', 'qh-pricing-amount', fmtPrice(amount, p.currency)));
    if (amount !== 0) price.appendChild(el('span', 'qh-pricing-per', t('pricing_per_month')));
    card.appendChild(price);
    // Billing period only applies to paid plans; Free keeps the row for alignment.
    card.appendChild(el('div', 'qh-pricing-billing', amount === 0 ? ' ' : (annual ? t('pricing_billed_annually') : t('pricing_billed_monthly'))));

    var ul = el('ul', 'qh-pricing-features');
    featureLines(p).forEach(function (line) { ul.appendChild(el('li', null, line)); });
    card.appendChild(ul);

    var cta = el('a', 'qh-pricing-cta' + (paid ? ' qh-pricing-cta--paid' : ''), paid ? fill(t('pricing_cta_choose'), { plan: displayName(p) }) : t('pricing_cta_free'));
    cta.href = ctaHref(p);
    card.appendChild(cta);
    return card;
  }

  function syncToggle() {
    var group = document.getElementById('qhPricingToggle');
    if (!group) return;
    group.setAttribute('aria-label', t('pricing_toggle_label'));
    group.querySelectorAll('[data-interval]').forEach(function (b) {
      var on = b.getAttribute('data-interval') === state.interval;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Keep #pricing aligned under the fixed nav after an anchor jump. Content
  // above (lazy images without intrinsic size, web fonts) can still grow
  // while or after the browser scrolls, which would leave the section too
  // low. Once scrolling has stopped, re-align (behavior 'auto' follows the
  // CSS: smooth normally, instant with prefers-reduced-motion). Stops on
  // any user scroll/touch/key input and after a short window.
  var settleTimer = null;
  function settleOnPricing(windowMs) {
    var section = document.getElementById('pricing');
    if (!section) return;
    clearInterval(settleTimer);
    var until = Date.now() + (windowMs || 2500);
    var lastY = -1;
    var stop = function () { clearInterval(settleTimer); settleTimer = null; ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.removeEventListener(ev, stop, true); }); };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, stop, true); });
    settleTimer = setInterval(function () {
      if (Date.now() > until) return stop();
      var y = window.scrollY;
      if (y !== lastY) { lastY = y; return; } // still scrolling
      var margin = parseFloat(window.getComputedStyle(section).scrollMarginTop) || 0;
      var offset = section.getBoundingClientRect().top - margin;
      var maxY = document.documentElement.scrollHeight - window.innerHeight;
      if (Math.abs(offset) > 4 && !(offset > 0 && y >= maxY - 1)) section.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 150);
  }

  function alignDirectLink() {
    // Direct /#pricing: cards render after the fetch; settle once loaded.
    if (state.aligned || window.location.hash !== '#pricing') return;
    state.aligned = true;
    if (document.readyState === 'complete') settleOnPricing(3000);
    else window.addEventListener('load', function () { settleOnPricing(3000); }, { once: true });
  }

  function render() {
    var g = grid();
    if (!g) return;
    syncToggle();
    g.innerHTML = '';
    if (state.failed) { g.appendChild(el('div', 'qh-pricing-status', t('pricing_unavailable'))); return; }
    if (!state.plans) { g.appendChild(el('div', 'qh-pricing-status', t('pricing_loading'))); return; }
    state.plans.forEach(function (p) { g.appendChild(renderCard(p)); });
  }

  function valid(list) {
    return Array.isArray(list) && list.length > 0 && list.every(function (p) {
      return p && typeof p.id === 'string' && typeof p.name === 'string' &&
        typeof p.monthlyPrice === 'number' && typeof p.annualMonthlyPrice === 'number';
    });
  }

  async function load() {
    try {
      var base = window.QRAIVY_API_BASE || 'https://api.qraivy.com';
      var res = await fetch(base + '/public/plans', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var body = await res.json();
      if (!valid(body && body.plans)) throw new Error('invalid catalogue');
      state.plans = body.plans;
    } catch (err) {
      console.error('[pricing] catalogue unavailable:', err && err.message);
      state.failed = true;
    }
    render();
    alignDirectLink();
  }

  function init() {
    var group = document.getElementById('qhPricingToggle');
    if (group) {
      group.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-interval]') : null;
        if (!b || b.getAttribute('data-interval') === state.interval) return;
        state.interval = b.getAttribute('data-interval');
        render();
      });
    }
    // Nav / footer links keep their native anchor behaviour; only settle afterwards.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href="#pricing"]') : null;
      if (a) setTimeout(function () { settleOnPricing(2500); }, 0);
    });
    render();
    load();
  }

  window.qhPricing = { render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
