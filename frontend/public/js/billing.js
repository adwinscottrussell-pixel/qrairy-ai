// ============================================================
// billing.js — Admin "Billing & Plans" section (#section-billing).
//
// Phase 2G Step 1: read-only. Renders account/billing status and the four
// canonical plan cards from GET /stripe/status (plan catalogue included),
// so no prices or limits are defined here. Checkout and portal actions are
// rendered but intentionally not wired yet.
//
// Uses hasStripeCustomer / hasSubscription — never the raw Stripe IDs.
// ============================================================
(function () {
  'use strict';

  var REVOKED = ['canceled', 'cancelled', 'unpaid', 'incomplete_expired'];

  var T = {
    en: {
      subtitle: 'Your plan, subscription and Smart QR Page limits.',
      loading: 'Loading billing information…',
      error: 'Billing information could not be loaded. Please try again.',
      retry: 'Retry',
      signedOut: 'Please sign in to view billing.',
      unavailable: 'Billing is not available in this environment. Plans are shown for reference only.',
      currentPlanLabel: 'Current plan',
      monthly: 'Monthly',
      annual: 'Annual',
      perMonth: '/ month',
      billedAnnually: 'billed annually',
      billedMonthly: 'billed monthly',
      noCharge: 'No charge',
      badgeCurrent: 'Current plan',
      badgeInternal: 'Internal account',
      badgeTrial: 'Trial',
      badgeAnnual: 'Annual',
      badgeMonthly: 'Monthly',
      badgePastDue: 'Payment issue',
      badgeEnded: 'Ended',
      trialLeft: function (n) { return n === 1 ? '1 day left' : n + ' days left'; },
      trialEnds: function (d) { return 'ends ' + d; },
      trialEnded: 'Your trial has ended.',
      subEnded: 'Your subscription has ended.',
      pastDue: 'Payment failed — please update your payment method.',
      renews: function (d) { return 'Renews on ' + d; },
      cancels: function (d) { return 'Cancels on ' + d; },
      internalNote: 'Managed by QRAIVY — no billing required.',
      smartPagesNone: 'No Smart QR Pages',
      smartPagesN: function (n) { return n === 1 ? '1 Smart QR Page' : n + ' Smart QR Pages'; },
      smartPagesUnlimited: 'Unlimited Smart QR Pages',
      basicUnlimited: 'Unlimited basic QR codes',
      basicN: function (n) { return n + ' basic QR codes'; },
      dynamicQr: 'Dynamic QR codes',
      actionCurrent: 'Current plan',
      actionAfterTrial: 'After your trial',
      actionUpgrade: function (n) { return 'Upgrade to ' + n; },
      actionChoose: function (n) { return 'Choose ' + n; },
      actionManage: 'Manage subscription',
      comingSoon: 'Available in the next step',
    },
    de: {
      subtitle: 'Dein Plan, dein Abo und deine Smart-QR-Page-Limits.',
      loading: 'Abrechnungsdaten werden geladen…',
      error: 'Abrechnungsdaten konnten nicht geladen werden. Bitte erneut versuchen.',
      retry: 'Erneut versuchen',
      signedOut: 'Bitte melde dich an, um die Abrechnung zu sehen.',
      unavailable: 'Abrechnung ist in dieser Umgebung nicht verfügbar. Die Pläne dienen nur zur Übersicht.',
      currentPlanLabel: 'Aktueller Plan',
      monthly: 'Monatlich',
      annual: 'Jährlich',
      perMonth: '/ Monat',
      billedAnnually: 'jährliche Abrechnung',
      billedMonthly: 'monatliche Abrechnung',
      noCharge: 'Keine Kosten',
      badgeCurrent: 'Aktueller Plan',
      badgeInternal: 'Internes Konto',
      badgeTrial: 'Testphase',
      badgeAnnual: 'Jährlich',
      badgeMonthly: 'Monatlich',
      badgePastDue: 'Zahlungsproblem',
      badgeEnded: 'Beendet',
      trialLeft: function (n) { return n === 1 ? 'noch 1 Tag' : 'noch ' + n + ' Tage'; },
      trialEnds: function (d) { return 'endet am ' + d; },
      trialEnded: 'Deine Testphase ist beendet.',
      subEnded: 'Dein Abo ist beendet.',
      pastDue: 'Zahlung fehlgeschlagen — bitte aktualisiere deine Zahlungsmethode.',
      renews: function (d) { return 'Verlängert sich am ' + d; },
      cancels: function (d) { return 'Endet am ' + d; },
      internalNote: 'Von QRAIVY verwaltet — keine Abrechnung erforderlich.',
      smartPagesNone: 'Keine Smart QR Pages',
      smartPagesN: function (n) { return n === 1 ? '1 Smart QR Page' : n + ' Smart QR Pages'; },
      smartPagesUnlimited: 'Unbegrenzte Smart QR Pages',
      basicUnlimited: 'Unbegrenzte Basis-QR-Codes',
      basicN: function (n) { return n + ' Basis-QR-Codes'; },
      dynamicQr: 'Dynamische QR-Codes',
      actionCurrent: 'Aktueller Plan',
      actionAfterTrial: 'Nach der Testphase',
      actionUpgrade: function (n) { return 'Upgrade auf ' + n; },
      actionChoose: function (n) { return n + ' wählen'; },
      actionManage: 'Abo verwalten',
      comingSoon: 'Im nächsten Schritt verfügbar',
    },
  };

  var state = { data: null, interval: 'monthly', loading: false };

  function lang() { return window._qraivyLang === 'de' ? 'de' : 'en'; }
  function t(key) { var v = T[lang()][key]; return v !== undefined ? v : T.en[key]; }
  function apiBase() { return window.QRAIVY_API_BASE || 'https://api.qraivy.com'; }
  function root() { return document.getElementById('billing-root'); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function fmtDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(lang() === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtPrice(amount, currency) {
    try {
      return new Intl.NumberFormat(lang() === 'de' ? 'de-DE' : 'en-IE', {
        style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(amount);
    } catch (e) { return '€' + amount; }
  }

  // ── Account state derived from /stripe/status (canonical fields) ──
  function accountState(d) {
    var status = typeof d.subscriptionStatus === 'string' ? d.subscriptionStatus.toLowerCase() : null;
    var paidBase = ['starter', 'pro', 'business'].indexOf(d.basePlan) !== -1;
    return {
      internal: !!d.isInternal,
      trial: !!d.isTrial,
      trialEnded: !d.isTrial && String(d.plan || '').trim().toLowerCase() === 'trial',
      // Card marked current: none during a trial; Business for internal accounts.
      currentId: d.isTrial ? null : (d.isInternal ? 'business' : d.basePlan),
      subscriber: paidBase && !d.isInternal && !!d.hasSubscription,
      pastDue: paidBase && status === 'past_due',
      ended: !!d.hasStripeCustomer && status !== null && REVOKED.indexOf(status) !== -1,
    };
  }

  function planName(id) {
    var list = (state.data && state.data.plans) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return id;
  }

  // ── Rendering ──────────────────────────────────────────────
  function renderMessage(text, withRetry) {
    var r = root(); if (!r) return;
    r.innerHTML = '';
    var box = el('div', 'bl-message', text);
    if (withRetry) {
      var b = el('button', 'bl-btn bl-btn--secondary', t('retry'));
      b.type = 'button';
      b.addEventListener('click', load);
      box.appendChild(b);
    }
    r.appendChild(box);
  }

  function badge(text, variant) { return el('span', 'bl-badge' + (variant ? ' bl-badge--' + variant : ''), text); }

  function disabledButton(label, variant, configured) {
    var b = el('button', 'bl-btn bl-btn--' + variant, label);
    b.type = 'button';
    b.disabled = true;
    b.setAttribute('aria-disabled', 'true');
    if (configured) b.title = t('comingSoon');
    return b;
  }

  function renderStatus(d, s) {
    var box = el('section', 'bl-status');
    var top = el('div', 'bl-status__top');
    var left = el('div', 'bl-status__main');
    left.appendChild(el('div', 'bl-status__label', t('currentPlanLabel')));

    var nameRow = el('div', 'bl-status__name');
    nameRow.appendChild(el('span', null, s.trial ? t('badgeTrial') : planName(s.currentId || 'free')));
    if (s.internal) nameRow.appendChild(badge(t('badgeInternal'), 'accent'));
    else if (s.pastDue) nameRow.appendChild(badge(t('badgePastDue'), 'warning'));
    else if (s.subscriber) nameRow.appendChild(badge(d.isAnnual ? t('badgeAnnual') : t('badgeMonthly')));
    left.appendChild(nameRow);

    var details = [];
    if (s.internal) details.push(t('internalNote'));
    if (s.trial && d.trialExpiresAt) {
      var ms = new Date(d.trialExpiresAt).getTime() - Date.now();
      var days = Math.max(0, Math.ceil(ms / 86400000));
      details.push(t('trialLeft')(days) + ' · ' + t('trialEnds')(fmtDate(d.trialExpiresAt)));
    }
    if (s.trialEnded) details.push(t('trialEnded'));
    if (s.ended && !s.trialEnded) details.push(t('subEnded'));
    if (s.pastDue) details.push(t('pastDue'));
    if (s.subscriber && !s.pastDue && d.subscription && d.subscription.currentPeriodEnd) {
      details.push(d.subscription.cancelAtPeriodEnd
        ? t('cancels')(fmtDate(d.subscription.currentPeriodEnd))
        : t('renews')(fmtDate(d.subscription.currentPeriodEnd)));
    }
    details.forEach(function (line) { left.appendChild(el('div', 'bl-status__detail', line)); });
    top.appendChild(left);

    // Manage subscription: for Stripe customers (never internal accounts).
    if (d.hasStripeCustomer && !s.internal) {
      top.appendChild(disabledButton(t('actionManage'), s.pastDue ? 'primary' : 'secondary', d.stripeConfigured));
    }
    box.appendChild(top);
    return box;
  }

  function renderToggle() {
    var wrap = el('div', 'bl-toggle');
    wrap.setAttribute('role', 'group');
    ['monthly', 'annual'].forEach(function (key) {
      var b = el('button', 'bl-toggle__btn' + (state.interval === key ? ' is-active' : ''), t(key));
      b.type = 'button';
      b.setAttribute('aria-pressed', state.interval === key ? 'true' : 'false');
      b.addEventListener('click', function () { if (state.interval !== key) { state.interval = key; render(); } });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function featureLines(p) {
    var lines = [];
    if (p.smartPageLimit === null) lines.push(t('smartPagesUnlimited'));
    else if (p.smartPageLimit === 0) lines.push(t('smartPagesNone'));
    else lines.push(t('smartPagesN')(p.smartPageLimit));
    lines.push(p.basicQrLimit === null ? t('basicUnlimited') : t('basicN')(p.basicQrLimit));
    if (p.dynamicQr) lines.push(t('dynamicQr'));
    return lines;
  }

  function cardAction(p, d, s) {
    if (s.internal) return null;                               // internal: no purchase actions
    if (p.id === s.currentId) return disabledButton(t('actionCurrent'), 'ghost', false);
    var paid = !!(p.checkoutPlans && (p.checkoutPlans.monthly || p.checkoutPlans.annual));
    if (s.trial) {
      return paid ? disabledButton(t('actionChoose')(p.name), 'primary', d.stripeConfigured)
                  : disabledButton(t('actionAfterTrial'), 'ghost', false);
    }
    if (s.subscriber) {
      // Plan changes for subscribers go through the Stripe portal; Free is not a direct downgrade.
      return paid ? disabledButton(t('actionManage'), 'secondary', d.stripeConfigured) : null;
    }
    return paid ? disabledButton(t('actionUpgrade')(p.name), 'primary', d.stripeConfigured) : null;
  }

  function renderCard(p, d, s) {
    var current = p.id === s.currentId;
    var card = el('article', 'bl-card' + (current ? ' is-current' : ''));
    var head = el('div', 'bl-card__head');
    head.appendChild(el('h3', 'bl-card__name', p.name));
    if (current) head.appendChild(badge(s.internal ? t('badgeInternal') : t('badgeCurrent'), 'accent'));
    card.appendChild(head);

    var annual = state.interval === 'annual';
    var amount = annual ? p.annualMonthlyPrice : p.monthlyPrice;
    var price = el('div', 'bl-card__price');
    if (amount === 0) {
      price.appendChild(el('span', 'bl-card__amount', fmtPrice(0, p.currency)));
    } else {
      price.appendChild(el('span', 'bl-card__amount', fmtPrice(amount, p.currency)));
      price.appendChild(el('span', 'bl-card__per', t('perMonth')));
    }
    card.appendChild(price);
    card.appendChild(el('div', 'bl-card__billing', amount === 0 ? t('noCharge') : (annual ? t('billedAnnually') : t('billedMonthly'))));

    var ul = el('ul', 'bl-card__features');
    featureLines(p).forEach(function (line) { ul.appendChild(el('li', null, line)); });
    card.appendChild(ul);

    var action = cardAction(p, d, s);
    if (action) { var foot = el('div', 'bl-card__foot'); foot.appendChild(action); card.appendChild(foot); }
    return card;
  }

  function render() {
    var r = root(); var d = state.data;
    if (!r || !d) return;
    var s = accountState(d);
    r.innerHTML = '';

    var sub = document.getElementById('billing-subtitle');
    if (sub) sub.textContent = t('subtitle');

    if (!d.stripeConfigured) r.appendChild(el('div', 'bl-notice', t('unavailable')));
    r.appendChild(renderStatus(d, s));

    if (!Array.isArray(d.plans) || !d.plans.length) {
      r.appendChild(el('div', 'bl-message', t('error')));
      return;
    }
    if (!s.internal) {
      var bar = el('div', 'bl-bar');
      bar.appendChild(renderToggle());
      r.appendChild(bar);
    }
    var grid = el('div', 'bl-grid');
    d.plans.forEach(function (p) { grid.appendChild(renderCard(p, d, s)); });
    r.appendChild(grid);
  }

  // ── Data ───────────────────────────────────────────────────
  async function load() {
    if (!root() || state.loading) return;
    state.loading = true;
    renderMessage(t('loading'));
    try {
      if (!window.Clerk) throw new Error('Clerk unavailable');
      if (!window.Clerk.loaded && typeof window.Clerk.load === 'function') await window.Clerk.load();
      var token = window.Clerk.session ? await window.Clerk.session.getToken() : null;
      if (!token) { renderMessage(t('signedOut')); return; }
      var res = await fetch(apiBase() + '/stripe/status', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.data = await res.json();
      state.interval = state.data.isAnnual ? 'annual' : 'monthly';
      render();
    } catch (err) {
      console.error('[billing] load failed:', err && err.message);
      renderMessage(t('error'), true);
    } finally {
      state.loading = false;
    }
  }

  function init() {
    var sb = document.getElementById('sb-billing');
    if (sb) {
      sb.addEventListener('click', function (e) {
        if (typeof window.showSection !== 'function') return; // fall back to the href
        e.preventDefault();
        window.showSection('billing');
      });
    }
  }

  window.qraivyBilling = { load: load, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
