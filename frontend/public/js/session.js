const QRairySession = (function () {
  'use strict';
  var API_BASE = window.API_ORIGIN;
  var TYPE = { ANONYMOUS:'anonymous', FREE:'free', TRIAL:'trial', PREMIUM:'premium', ADMIN:'admin' };
  var GATES = {
    freeQrGenerator:[TYPE.ANONYMOUS,TYPE.FREE,TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    dashboard:[TYPE.FREE,TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    analytics:[TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    subscribers:[TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    campaigns:[TYPE.PREMIUM,TYPE.ADMIN],
    walletPasses:[TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    aiLandingPage:[TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    aiAssistant:[TYPE.PREMIUM,TYPE.ADMIN],
    dynamicQr:[TYPE.PREMIUM,TYPE.ADMIN],
    push:[TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN],
    adminPanel:[TYPE.ADMIN],
  };
  var ROUTES = {
    public:{ home:'/', pricing:'/pricing.html', freeQr:'/qr/free.html', login:'/login.html' },
    app:{ dashboard:'/dashboard.html', analytics:'/analytics.html', upgrade:'/upgrade.html' },
    admin:{ overview:'/admin.html' },
  };
  var _session = {
    type:TYPE.ANONYMOUS, userId:null, email:null, firstName:null, role:null, loaded:false,
    plan:null, rawPlan:null, basePlan:null, isFree:true, isTrial:false, isTrialExpired:false,
    isPremium:false, isAnnual:false, trialExpiresAt:null, trialSecondsRemaining:null,
    subscriptionStatus:null, canCreateAI:false, canUseDynamic:false, canAccessSmartDash:false,
    canUseAnalytics:false, canUseWallet:false, canUsePush:false, canUseCampaigns:false,
    aiLimit:0, aiQrCount:0, aiRemaining:0, hasPhone:false, planLoaded:false,
  };
  var _trialTimer = null;
  function _deriveTypeFromPlan(p) {
    if (!p) return TYPE.FREE;
    if (p.isTrial && !p.isTrialExpired) return TYPE.TRIAL;
    if (p.isPremium) return TYPE.PREMIUM;
    return TYPE.FREE;
  }
  async function init() {
    if (!window.Clerk) { _session.type=TYPE.ANONYMOUS; _session.loaded=true; return _session; }
    await window.Clerk.load();
    var user = window.Clerk.user;
    if (!user) { _session.type=TYPE.ANONYMOUS; _session.loaded=true; return _session; }
    var meta = user.publicMetadata || {};
    if (meta.role === 'admin') _session.type = TYPE.ADMIN;
    _session.userId = user.id;
    _session.email = user.primaryEmailAddress ? user.primaryEmailAddress.emailAddress : null;
    _session.firstName = user.firstName || null;
    _session.role = meta.role || null;
    _session.loaded = true;
    return _session;
  }
  async function loadPlan() {
    if (!_session.loaded) await init();
    if (!_session.userId || _session.type === TYPE.ANONYMOUS) return _session;
    try {
      var token = await window.Clerk.session.getToken();
      var res = await fetch(API_BASE + '/tier/plan', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('Plan fetch failed');
      var data = await res.json();
      var p = data.planInfo;
      if (!p) throw new Error('No planInfo');
      _session.plan=p.plan; _session.rawPlan=p.rawPlan; _session.basePlan=p.basePlan;
      _session.isFree=p.isFree; _session.isTrial=p.isTrial; _session.isTrialExpired=p.isTrialExpired;
      _session.isPremium=p.isPremium; _session.isAnnual=p.isAnnual;
      _session.trialExpiresAt=p.trialExpiresAt; _session.trialSecondsRemaining=p.trialSecondsRemaining;
      _session.subscriptionStatus=p.subscriptionStatus;
      _session.canCreateAI=p.canCreateAI; _session.canUseDynamic=p.canUseDynamic;
      _session.canAccessSmartDash=p.canAccessSmartDash; _session.canUseAnalytics=p.canUseAnalytics;
      _session.canUseWallet=p.canUseWallet; _session.canUsePush=p.canUsePush;
      _session.canUseCampaigns=p.canUseCampaigns; _session.aiLimit=p.aiLimit;
      _session.aiQrCount=p.aiQrCount; _session.aiRemaining=p.aiRemaining;
      _session.hasPhone=p.hasPhone; _session.planLoaded=true;
      if (_session.type !== TYPE.ADMIN) _session.type = _deriveTypeFromPlan(p);
    } catch(err) {
      console.warn('[QRairySession] loadPlan failed:', err.message);
      var meta = window.Clerk.user.publicMetadata || {};
      if (meta.plan==='trial') _session.type=TYPE.TRIAL;
      else if (['starter','pro','starter_annual','pro_annual','business','business_annual'].includes(meta.plan)) _session.type=TYPE.PREMIUM;
    }
    return _session;
  }
  async function startTrial() {
    if (!_session.userId) return null;
    var token = await window.Clerk.session.getToken();
    var res = await fetch(API_BASE + '/tier/trial', { method:'POST', headers:{ Authorization:'Bearer '+token } });
    var data = await res.json();
    if (data.planInfo) await loadPlan();
    return data;
  }
  function applyTrialUI() {
    if (_trialTimer) clearInterval(_trialTimer);
    var pill=document.getElementById('trial-pill');
    var dot=document.getElementById('trial-dot');
    var txt=document.getElementById('trial-text');
    var badge=document.getElementById('plan-badge');
    if (badge) badge.textContent = (_session.basePlan||_session.plan||'FREE').toUpperCase();
    if (!pill) return;
    if (_session.isTrial && _session.trialSecondsRemaining > 0) {
      pill.classList.add('show'); pill.classList.remove('expired');
      var secs = _session.trialSecondsRemaining;
      function tick() {
        if (secs<=0) { clearInterval(_trialTimer); pill.classList.add('expired'); if(dot) dot.style.background='#ef4444'; if(txt) txt.innerHTML='<strong>Trial expired</strong> &mdash; upgrade to reactivate your AI pages'; return; }
        var m=Math.floor(secs/60),s=secs%60;
        if (txt) txt.innerHTML='<strong>Trial Active</strong> &middot; '+m+'m '+s+'s remaining';
        secs--;
      }
      tick(); _trialTimer = setInterval(tick, 1000);
    } else if (_session.isTrialExpired && (_session.aiQrCount > 0)) {
      pill.classList.add('show','expired');
      if (dot) dot.style.background='#ef4444';
      if (txt) txt.innerHTML='<strong>Trial expired</strong> &mdash; upgrade to reactivate your AI pages';
    } else {
      pill.style.display='none';
    }
  }
  function can(feature) {
    if (_session.planLoaded) {
      var m={analytics:_session.canUseAnalytics,subscribers:_session.canUseAnalytics,campaigns:_session.canUseCampaigns,walletPasses:_session.canUseWallet,aiLandingPage:_session.canCreateAI,aiAssistant:_session.canCreateAI,dynamicQr:_session.canUseDynamic,push:_session.canUsePush,dashboard:_session.canAccessSmartDash,adminPanel:_session.type===TYPE.ADMIN,freeQrGenerator:true};
      if (feature in m) return !!m[feature];
    }
    var allowed=GATES[feature];
    if (!allowed) { console.warn('[QRairySession] Unknown gate:',feature); return false; }
    return allowed.indexOf(_session.type) !== -1;
  }
  function requireFeature(feature, upgradePath) {
    if (!_session.loaded) return;
    if (!can(feature)) window.location.replace(upgradePath||ROUTES.app.upgrade);
  }
  function requireType(minType, redirectTo) {
    var ORDER=[TYPE.ANONYMOUS,TYPE.FREE,TYPE.TRIAL,TYPE.PREMIUM,TYPE.ADMIN];
    if (ORDER.indexOf(_session.type)<ORDER.indexOf(minType)) window.location.replace(redirectTo||ROUTES.public.login);
  }
  function shouldShowUpgradePrompt(feature) {
    if (_session.type===TYPE.PREMIUM||_session.type===TYPE.ADMIN) return false;
    return !can(feature);
  }
  function trialDaysLeft() {
    if (!_session.isTrial||!_session.trialExpiresAt) return 0;
    return Math.max(0, Math.ceil((new Date(_session.trialExpiresAt)-new Date())/(1000*60*60*24)));
  }
  return {
    TYPE, ROUTES, GATES, init, loadPlan, startTrial, applyTrialUI,
    get: function(){ return Object.assign({},_session); },
    can, requireFeature, requireType, shouldShowUpgradePrompt, trialDaysLeft,
    isAdmin: function(){ return _session.type===TYPE.ADMIN; },
    isAuthenticated: function(){ return _session.type!==TYPE.ANONYMOUS; },
    isPremium: function(){ return _session.type===TYPE.PREMIUM; },
    isTrial: function(){ return _session.type===TYPE.TRIAL; },
  };
})();
