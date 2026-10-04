// ============================================================
// billing.js — Admin "Billing & Plans" section (#section-billing).
//
// Renders account/billing status and the four canonical plan cards from
// GET /stripe/status (plan catalogue included), so no prices, limits or
// Stripe Price IDs are defined here.
//
// Billing Step 2:
//   - ?plan=<starter|starter_annual|pro|pro_annual> (homepage handoff)
//     preselects the card and billing period; any other value is ignored.
//   - Starter/Pro purchase buttons call the existing POST /stripe/checkout;
//     subscribers use POST /stripe/portal. Buttons are active only when the
//     backend reports checkoutEnabled (production gate).
//   - Business is "coming soon" (catalogue comingSoon) and never purchasable
//     here; existing Business/internal accounts still show their status.
//   - ?checkout=success re-reads /stripe/status until the webhook has
//     applied the plan (the success return itself grants nothing);
//     ?checkout=cancelled keeps the selection for a retry.
//
// Uses hasStripeCustomer / hasSubscription — never the raw Stripe IDs.
// ============================================================
(function () {
  'use strict';

  var REVOKED = ['canceled', 'cancelled', 'unpaid', 'incomplete_expired'];
  // The only selections the public flow may hand over (also validated
  // against the server catalogue's checkoutPlans before use).
  var PUBLIC_SELECTIONS = ['starter', 'starter_annual', 'pro', 'pro_annual'];
  var POLL_INTERVAL_MS = 2500;
  var POLL_ATTEMPTS = 8;

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
      planFree: 'Free',
      planComingSoon: 'Coming Soon',
      businessTagline: 'For growing businesses and advanced automation.',
      internalIncluded: 'Included',
      badgeCurrent: 'Current plan',
      badgeSelected: 'Selected',
      badgeInternal: 'Internal account',
      badgeTrial: 'Trial',
      badgeAnnual: 'Annual',
      badgeMonthly: 'Monthly',
      badgePastDue: 'Payment issue',
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
      actionCurrent: 'Current plan',
      actionAfterTrial: 'After your trial',
      actionUpgrade: function (n) { return 'Upgrade to ' + n; },
      actionChoose: function (n) { return 'Choose ' + n; },
      actionManage: 'Manage subscription',
      redirecting: 'Redirecting to secure checkout…',
      checkoutNotOpen: 'Checkout is not open yet.',
      noticeSuccessPending: 'Payment received — activating your subscription…',
      noticeSuccessActive: function (n) { return 'Your ' + n + ' subscription is active.'; },
      noticeSuccessDelayed: 'Your payment is being processed. Your plan will update shortly — refresh this page in a moment.',
      noticeCancelled: 'Checkout cancelled — no payment was made. You can try again any time.',
      noticeHasSub: 'You already have a subscription. Use Manage subscription to change your plan.',
      noticeInternal: 'This account is managed by QRAIVY and cannot purchase a plan.',
      noticeCheckoutError: 'Checkout could not be started. Please try again.',
      noticePortalError: 'The billing portal could not be opened. Please try again.',
    },
    de: {
      subtitle: 'Dein Tarif, Abonnement und deine Smart-QR-Seiten-Limits.',
      loading: 'Abrechnungsdaten werden geladen…',
      error: 'Abrechnungsdaten konnten nicht geladen werden. Bitte versuche es erneut.',
      retry: 'Erneut versuchen',
      signedOut: 'Bitte melde dich an, um die Abrechnung zu sehen.',
      unavailable: 'Die Abrechnung ist in dieser Umgebung nicht verfügbar. Die Tarife werden nur zur Information angezeigt.',
      currentPlanLabel: 'Aktueller Tarif',
      monthly: 'Monatlich',
      annual: 'Jährlich',
      perMonth: '/ Monat',
      billedAnnually: 'jährliche Abrechnung',
      billedMonthly: 'monatliche Abrechnung',
      noCharge: 'Kostenlos',
      planFree: 'Kostenlos',
      planComingSoon: 'Demnächst',
      businessTagline: 'Für wachsende Unternehmen und erweiterte Automatisierung.',
      internalIncluded: 'Inklusive',
      badgeCurrent: 'Aktueller Tarif',
      badgeSelected: 'Ausgewählt',
      badgeInternal: 'Internes Konto',
      badgeTrial: 'Testphase',
      badgeAnnual: 'Jährlich',
      badgeMonthly: 'Monatlich',
      badgePastDue: 'Zahlungsproblem',
      trialLeft: function (n) { return n === 1 ? 'Noch 1 Tag' : 'Noch ' + n + ' Tage'; },
      trialEnds: function (d) { return 'endet am ' + d; },
      trialEnded: 'Deine Testphase ist beendet.',
      subEnded: 'Dein Abonnement ist beendet.',
      pastDue: 'Zahlung fehlgeschlagen — bitte aktualisiere deine Zahlungsmethode.',
      renews: function (d) { return 'Verlängert sich am ' + d; },
      cancels: function (d) { return 'Endet am ' + d; },
      internalNote: 'Von QRAIVY verwaltet — keine Abrechnung erforderlich.',
      smartPagesNone: 'Keine Smart-QR-Seiten',
      smartPagesN: function (n) { return n === 1 ? '1 Smart-QR-Seite' : n + ' Smart-QR-Seiten'; },
      smartPagesUnlimited: 'Unbegrenzte Smart-QR-Seiten',
      basicUnlimited: 'Unbegrenzte Basis-QR-Codes',
      basicN: function (n) { return n + ' Basis-QR-Codes'; },
      actionCurrent: 'Aktueller Tarif',
      actionAfterTrial: 'Nach deiner Testphase',
      actionUpgrade: function (n) { return 'Upgrade auf ' + n; },
      actionChoose: function (n) { return n + ' wählen'; },
      actionManage: 'Abonnement verwalten',
      redirecting: 'Weiterleitung zum sicheren Checkout…',
      checkoutNotOpen: 'Der Checkout ist noch nicht freigeschaltet.',
      noticeSuccessPending: 'Zahlung erhalten — dein Abonnement wird aktiviert…',
      noticeSuccessActive: function (n) { return 'Dein ' + n + '-Abonnement ist aktiv.'; },
      noticeSuccessDelayed: 'Deine Zahlung wird verarbeitet. Dein Tarif wird in Kürze aktualisiert — lade die Seite gleich neu.',
      noticeCancelled: 'Checkout abgebrochen — es wurde keine Zahlung durchgeführt. Du kannst es jederzeit erneut versuchen.',
      noticeHasSub: 'Du hast bereits ein Abonnement. Ändere deinen Tarif über „Abonnement verwalten“.',
      noticeInternal: 'Dieses Konto wird von QRAIVY verwaltet und kann keinen Tarif kaufen.',
      noticeCheckoutError: 'Der Checkout konnte nicht gestartet werden. Bitte versuche es erneut.',
      noticePortalError: 'Das Abrechnungsportal konnte nicht geöffnet werden. Bitte versuche es erneut.',
    },
  };

  var state = {
    data: null, interval: 'monthly', loading: false, message: null,
    intent: null,      // { plan, checkout } read once from the URL
    selected: null,    // plan id (starter|pro) chosen via the homepage handoff
    notice: null,      // { key, arg, variant }
    busy: false,       // a checkout/portal request is in flight
    polling: false,
  };

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

  // ── URL handoff (read once; parameters removed afterwards) ──
  function readIntent() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return { plan: null, checkout: null }; }
    var plan = q.get('plan');
    var checkout = q.get('checkout');
    return {
      plan: PUBLIC_SELECTIONS.indexOf(plan) !== -1 ? plan : null,
      checkout: checkout === 'success' || checkout === 'cancelled' ? checkout : null,
    };
  }

  function clearIntentFromUrl() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('plan') && !url.searchParams.has('checkout')) return;
      url.searchParams.delete('plan');
      url.searchParams.delete('checkout');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* non-critical */ }
  }

  // Find the catalogue plan offering this checkout plan id (server truth).
  function catalogueSelection(planId) {
    var list = (state.data && state.data.plans) || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i].checkoutPlans || {};
      if (c.monthly === planId) return { id: list[i].id, interval: 'monthly' };
      if (c.annual === planId) return { id: list[i].id, interval: 'annual' };
    }
    return null;
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
      paid: paidBase,
      subscriber: paidBase && !d.isInternal && !!d.hasSubscription,
      pastDue: paidBase && status === 'past_due',
      ended: !!d.hasStripeCustomer && status !== null && REVOKED.indexOf(status) !== -1,
      canAct: !!d.checkoutEnabled,
    };
  }

  // Display name: Free is localized; Starter/Pro/Business are product names
  // taken unchanged from the canonical catalogue.
  function displayName(p) { return p.id === 'free' ? t('planFree') : p.name; }
  function planName(id) {
    var list = (state.data && state.data.plans) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return displayName(list[i]);
    return id;
  }

  // ── Authenticated API calls ────────────────────────────────
  async function token() {
    if (!window.Clerk) throw new Error('Clerk unavailable');
    if (!window.Clerk.loaded && typeof window.Clerk.load === 'function') await window.Clerk.load();
    return window.Clerk.session ? window.Clerk.session.getToken() : null;
  }

  async function api(method, path, body) {
    var tok = await token();
    if (!tok) return { status: 401, body: null };
    var res = await fetch(apiBase() + path, {
      method: method,
      headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    var json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, body: json };
  }

  function navigate(url) { window.location.assign(url); }

  async function startCheckout(planId) {
    // Defence in depth: only the public selections ever leave the browser.
    if (state.busy || PUBLIC_SELECTIONS.indexOf(planId) === -1) return;
    state.busy = true; state.notice = { key: 'redirecting', variant: 'info' }; render();
    var r;
    try { r = await api('POST', '/stripe/checkout', { plan: planId }); } catch (e) { r = { status: 0, body: null }; }
    if (r.status === 200 && r.body && typeof r.body.url === 'string' && /^https:\/\//.test(r.body.url)) {
      navigate(r.body.url);
      return;
    }
    state.busy = false;
    var err = r.body && r.body.error;
    if (r.status === 409 && err === 'subscription_exists') state.notice = { key: 'noticeHasSub', variant: 'warning' };
    else if (r.status === 409 && err === 'internal_account') state.notice = { key: 'noticeInternal', variant: 'warning' };
    else if (r.status === 403) state.notice = { key: 'checkoutNotOpen', variant: 'warning' };
    else state.notice = { key: 'noticeCheckoutError', variant: 'error' };
    render();
  }

  async function openPortal() {
    if (state.busy) return;
    state.busy = true; render();
    var r;
    try { r = await api('POST', '/stripe/portal'); } catch (e) { r = { status: 0, body: null }; }
    if (r.status === 200 && r.body && typeof r.body.url === 'string' && /^https:\/\//.test(r.body.url)) {
      navigate(r.body.url);
      return;
    }
    state.busy = false;
    state.notice = r.status === 403 ? { key: 'checkoutNotOpen', variant: 'warning' } : { key: 'noticePortalError', variant: 'error' };
    render();
  }

  // ── Rendering ──────────────────────────────────────────────
  function renderMessage(key, withRetry) {
    var r = root(); if (!r) return;
    state.message = { key: key, retry: !!withRetry };
    r.innerHTML = '';
    var sub = document.getElementById('billing-subtitle');
    if (sub) sub.textContent = t('subtitle');
    var box = el('div', 'bl-message', t(key));
    if (withRetry) {
      var b = el('button', 'bl-btn bl-btn--secondary', t('retry'));
      b.type = 'button';
      b.addEventListener('click', load);
      box.appendChild(b);
    }
    r.appendChild(box);
  }

  function badge(text, variant) { return el('span', 'bl-badge' + (variant ? ' bl-badge--' + variant : ''), text); }

  // Action button: active only when the backend allows checkout/portal.
  function actionButton(label, variant, canAct, onClick) {
    var b = el('button', 'bl-btn bl-btn--' + variant, label);
    b.type = 'button';
    var enabled = !!(canAct && onClick) && !state.busy;
    b.disabled = !enabled;
    b.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    if (!canAct && onClick) b.title = t('checkoutNotOpen');
    if (enabled) b.addEventListener('click', onClick);
    return b;
  }
  function inertButton(label, variant) { return actionButton(label, variant, false, null); }

  function renderNotice() {
    if (!state.notice) return null;
    var n = state.notice;
    var text = typeof t(n.key) === 'function' ? t(n.key)(n.arg) : t(n.key);
    var box = el('div', 'bl-alert bl-alert--' + (n.variant || 'info'), text);
    box.setAttribute('role', n.variant === 'error' || n.variant === 'warning' ? 'alert' : 'status');
    return box;
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

    // Manage subscription (Stripe portal): Stripe customers only, never internal accounts.
    if (d.hasStripeCustomer && !s.internal) {
      top.appendChild(actionButton(t('actionManage'), s.pastDue ? 'primary' : 'secondary', s.canAct && d.portalAvailable, openPortal));
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

  // Customer-facing benefits: only capabilities usable today (no Dynamic QR yet).
  function featureLines(p) {
    var lines = [];
    if (p.smartPageLimit === null) lines.push(t('smartPagesUnlimited'));
    else if (p.smartPageLimit === 0) lines.push(t('smartPagesNone'));
    else lines.push(t('smartPagesN')(p.smartPageLimit));
    lines.push(p.basicQrLimit === null ? t('basicUnlimited') : t('basicN')(p.basicQrLimit));
    return lines;
  }

  function checkoutPlanFor(p) {
    var c = p.checkoutPlans || {};
    var id = c[state.interval];
    return PUBLIC_SELECTIONS.indexOf(id) !== -1 ? id : null;  // no annual→monthly fallback
  }

  function cardAction(p, d, s) {
    if (s.internal) return null;                                    // internal: never purchases
    if (p.id === s.currentId) return inertButton(t('actionCurrent'), 'ghost');
    if (p.comingSoon) return null;                                  // Business: coming soon
    var offered = !!(p.checkoutPlans && (p.checkoutPlans.monthly || p.checkoutPlans.annual));
    if (!offered) return s.trial ? inertButton(t('actionAfterTrial'), 'ghost') : null;  // Free
    if (s.subscriber || s.pastDue) {
      // Plan changes go through the Stripe portal — never a second subscription.
      return actionButton(t('actionManage'), 'secondary', s.canAct && d.portalAvailable, openPortal);
    }
    var planId = checkoutPlanFor(p);
    var label = s.trial ? t('actionChoose')(displayName(p)) : t('actionUpgrade')(displayName(p));
    return actionButton(label, 'primary', s.canAct, planId ? function () { startCheckout(planId); } : null);
  }

  function renderCard(p, d, s) {
    var current = p.id === s.currentId;
    var soon = !!p.comingSoon && !current;
    var selected = !current && !soon && state.selected === p.id;
    var card = el('article', 'bl-card' + (current ? ' is-current' : '') + (selected ? ' is-selected' : '') + (soon ? ' bl-card--soon' : ''));
    card.setAttribute('data-plan', p.id);
    var head = el('div', 'bl-card__head');
    head.appendChild(el('h3', 'bl-card__name', displayName(p)));
    if (current) head.appendChild(badge(s.internal ? t('badgeInternal') : t('badgeCurrent'), 'accent'));
    else if (selected) head.appendChild(badge(t('badgeSelected'), 'accent'));
    card.appendChild(head);

    var price = el('div', 'bl-card__price');
    if (soon) {
      price.appendChild(el('span', 'bl-card__amount bl-card__amount--soon', t('planComingSoon')));
      card.appendChild(price);
      card.appendChild(el('div', 'bl-card__billing', ' '));
      card.appendChild(el('p', 'bl-card__tagline', t('businessTagline')));
      return card;
    }
    var annual = state.interval === 'annual';
    var amount = annual ? p.annualMonthlyPrice : p.monthlyPrice;
    if (current && s.internal) {
      price.appendChild(el('span', 'bl-card__amount bl-card__amount--soon', t('internalIncluded')));
      card.appendChild(price);
      card.appendChild(el('div', 'bl-card__billing', ' '));
    } else {
      price.appendChild(el('span', 'bl-card__amount', fmtPrice(amount, p.currency)));
      if (amount !== 0) price.appendChild(el('span', 'bl-card__per', t('perMonth')));
      card.appendChild(price);
      card.appendChild(el('div', 'bl-card__billing', amount === 0 ? t('noCharge') : (annual ? t('billedAnnually') : t('billedMonthly'))));
    }

    var ul = el('ul', 'bl-card__features');
    featureLines(p).forEach(function (line) { ul.appendChild(el('li', null, line)); });
    card.appendChild(ul);

    var action = cardAction(p, d, s);
    if (action) { var foot = el('div', 'bl-card__foot'); foot.appendChild(action); card.appendChild(foot); }
    return card;
  }

  function render() {
    var r = root(); var d = state.data;
    if (!r) return;
    if (!d) { if (state.message) renderMessage(state.message.key, state.message.retry); return; }
    state.message = null;
    var s = accountState(d);
    r.innerHTML = '';

    var sub = document.getElementById('billing-subtitle');
    if (sub) sub.textContent = t('subtitle');

    if (!d.stripeConfigured) r.appendChild(el('div', 'bl-notice', t('unavailable')));
    var notice = renderNotice();
    if (notice) r.appendChild(notice);
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
  async function fetchStatus() {
    var r = await api('GET', '/stripe/status');
    if (r.status === 401) return { signedOut: true };
    if (r.status !== 200 || !r.body) throw new Error('HTTP ' + r.status);
    return { data: r.body };
  }

  function applyIntent() {
    var intent = state.intent || {};
    // Only accounts that can start a new purchase get the handoff selection
    // (internal accounts never buy; subscribers change plans in the portal).
    var acct = accountState(state.data);
    var canBuy = !acct.internal && !acct.subscriber && !acct.pastDue;
    var sel = intent.plan && canBuy ? catalogueSelection(intent.plan) : null;
    if (sel) { state.selected = sel.id; state.interval = sel.interval; }
    else state.interval = state.data.isAnnual ? 'annual' : 'monthly';
    if (intent.checkout === 'cancelled') state.notice = { key: 'noticeCancelled', variant: 'info' };
    if (intent.checkout === 'success') state.notice = { key: 'noticeSuccessPending', variant: 'success' };
  }

  // After a successful checkout return, wait for the webhook to apply the plan.
  async function pollForActivation() {
    if (state.polling) return;
    state.polling = true;
    for (var i = 0; i < POLL_ATTEMPTS; i++) {
      var s = accountState(state.data);
      if (s.subscriber && !s.pastDue) {
        state.notice = { key: 'noticeSuccessActive', arg: planName(s.currentId), variant: 'success' };
        state.selected = null;
        render();
        state.polling = false;
        return;
      }
      await new Promise(function (r) { setTimeout(r, POLL_INTERVAL_MS); });
      try { var res = await fetchStatus(); if (res.data) { state.data = res.data; render(); } } catch (e) { /* keep waiting */ }
    }
    state.notice = { key: 'noticeSuccessDelayed', variant: 'info' };
    render();
    state.polling = false;
  }

  async function load() {
    if (!root() || state.loading) return;
    state.loading = true;
    if (!state.intent) { state.intent = readIntent(); clearIntentFromUrl(); }
    renderMessage('loading');
    try {
      var res = await fetchStatus();
      if (res.signedOut) { renderMessage('signedOut'); return; }
      state.data = res.data;
      applyIntent();
      render();
      if (state.intent.checkout === 'success') pollForActivation();
      state.intent = { plan: null, checkout: null };  // consumed
    } catch (err) {
      console.error('[billing] load failed:', err && err.message);
      renderMessage('error', true);
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
