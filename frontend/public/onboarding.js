(function(){
  var FREE_PATH='dashboard.html?create=static';
  var UPGRADE_PATH='pricing.html';
  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}

  // ── Onboarding state ─────────────────────────────────────────
  var onboardingState = { qrType: null, selectedUseCase: null };

  // ── SVG icons ────────────────────────────────────────────────
  var qrSVG='<svg width="26" height="26" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="21" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="2" y="18" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="21" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/></svg>';
  var aiSVG='<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M16 3 L17.5 13 L28 16 L17.5 19 L16 29 L14.5 19 L4 16 L14.5 13 Z" stroke="#FF7A35" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M26 5 L26.8 8 L30 9 L26.8 10 L26 13 L25.2 10 L22 9 L25.2 8 Z" fill="#FF7A35" opacity="0.6"/></svg>';

  function chk(a){return '<span class="qr-check'+(a?' qr-check-accent':'')+'">&#10003;</span>';}
  function fi(t,a){return '<li class="qr-feature-item'+(a?' qr-feature-item-accent':'')+'">'+chk(a)+t+'</li>';}
  function ci(t,locked,pro){
    if(locked)return '<li class="qr-compare-item qr-compare-item-locked"><span style="width:14px;text-align:center;color:rgba(240,236,224,0.2);font-family:monospace">&mdash;</span>'+t+'</li>';
    return '<li class="qr-compare-item'+(pro?' qr-compare-item-pro':'')+'"><span class="qr-check'+(pro?' qr-check-accent':'')+'">&#10003;</span>'+t+'</li>';
  }

  // ── Use case definitions ──────────────────────────────────────
  var USE_CASES = [
    { id:'restaurant',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6h4M21 22H3"/></svg>', title:'Restaurant', sub:'Menus, promos, and customer engagement' },
    { id:'bizcard',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10h.01M2 10h2M16 10h4M8 14h8"/></svg>', title:'Business Card', sub:'Modern networking with smart contact sharing' },
    { id:'packaging',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', title:'Product Packaging', sub:'Connect physical products to digital experiences' },
    { id:'event',        icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', title:'Event', sub:'Tickets, schedules, and attendee engagement' },
    { id:'social',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 2H7a5 5 0 00-5 5v10a5 5 0 005 5h10a5 5 0 005-5V7a5 5 0 00-5-5z"/><circle cx="12" cy="12" r="3"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>', title:'Social Media', sub:'Grow followers and drive engagement' },
    { id:'ai-support',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><path d="M12 8v4l3 3" stroke-linecap="round"/><circle cx="12" cy="12" r="1" fill="#FF7A35" stroke="none"/></svg>', title:'AI Customer Support', sub:'Launch AI-powered customer interactions' },
    { id:'realestate',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', title:'Real Estate', sub:'Property showcases and lead capture' },
    { id:'ecommerce',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>', title:'Ecommerce', sub:'Drive traffic to products and offers' },
    { id:'leadgen',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>', title:'Lead Generation', sub:'Capture and qualify new leads' },
    { id:'gym',          icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg>', title:'Gym / Fitness', sub:'Memberships, classes, and promotions' },
    { id:'portfolio',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', title:'Portfolio', sub:'Showcase creative or professional work' },
  ];

  // ── Progress bar HTML ─────────────────────────────────────────
  function progressBar(step, total) {
    var pct = Math.round((step / total) * 100);
    var dots = '';
    for (var i = 1; i <= total; i++) {
      dots += '<span class="qr-prog-dot' + (i <= step ? ' qr-prog-dot-active' : '') + '"></span>';
    }
    return '<div class="qr-progress-wrap">' +
      '<div class="qr-progress-bar-track"><div class="qr-progress-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="qr-progress-meta"><span class="qr-progress-label">Step ' + step + ' of ' + total + '</span><div class="qr-prog-dots">' + dots + '</div></div>' +
      '</div>';
  }

  // ── Step 1: Welcome ───────────────────────────────────────────
  function welcomeHTML(){
    return '<div class="qr-modal">' +
      '<button class="qr-close-btn" id="qr-close">&#215;</button>' +
      progressBar(1, 5) +
      '<div class="qr-modal-header"><div class="qr-logo-mark">Q</div>' +
      '<h1 class="qr-modal-title">Welcome to Qraivy &#128075;</h1>' +
      '<p class="qr-modal-subtitle">What would you like to create today?</p></div>' +
      '<div class="qr-card-grid">' +
        '<div class="qr-card">' +
          '<span class="qr-badge-free">Free Plan</span>' +
          '<div class="qr-card-icon qr-card-icon-free">'+qrSVG+'</div>' +
          '<div class="qr-card-title">Static QR Code</div>' +
          '<p class="qr-card-desc">Create a fast, free QR code that links directly to websites, PDFs, menus, social pages, or contact info.</p>' +
          '<ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Basic customization',false)+fi('No AI required',false)+'</ul>' +
          '<button class="qr-btn-free" id="qr-free">Create Free QR</button>' +
        '</div>' +
        '<div class="qr-card qr-card-premium">' +
          '<div class="qr-card-glow"></div>' +
          '<span class="qr-badge-pro">&#10022; Most Popular</span>' +
          '<div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div>' +
          '<div class="qr-card-title">AI Smart QR Experience</div>' +
          '<p class="qr-card-desc">Build AI-powered QR landing pages with voice welcome, AI chat, wallet subscriptions, and customer engagement tools.</p>' +
          '<ul class="qr-feature-list">'+fi('AI chat assistant',true)+fi('Voice welcome',true)+fi('Smart landing pages',true)+fi('Wallet pass support',true)+fi('Push notifications',true)+fi('Analytics',true)+'</ul>' +
          '<button class="qr-btn-premium" id="qr-upgrade">&#10022; Upgrade &amp; Build AI QR</button>' +
        '</div>' +
      '</div>' +
      '<p class="qr-modal-footer">You can always change your plan later from <strong>Settings &rarr; Billing</strong></p>' +
    '</div>';
  }

  // ── Step 2: Use case selection ────────────────────────────────
  function step2HTML(){
    var cards = USE_CASES.map(function(uc, i){
      return '<button class="qr-uc-card" data-uc="' + uc.id + '" style="animation-delay:' + (i * 35) + 'ms">' +
        '<div class="qr-uc-check"><svg viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#FF7A35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '<div class="qr-uc-icon">' + uc.icon + '</div>' +
        '<div class="qr-uc-title">' + uc.title + '</div>' +
        '<div class="qr-uc-sub">' + uc.sub + '</div>' +
      '</button>';
    }).join('');

    return '<div class="qr-modal qr-modal-wide qr-step2-modal">' +
      '<button class="qr-close-btn" id="qr-close">&#215;</button>' +
      progressBar(2, 5) +
      '<div class="qr-modal-header qr-modal-header-compact">' +
        '<h1 class="qr-modal-title">What are you using your QR for?</h1>' +
        '<p class="qr-modal-subtitle">Choose your primary use case to personalise your experience</p>' +
      '</div>' +
      '<div class="qr-uc-grid">' + cards + '</div>' +
      '<div class="qr-step2-footer">' +
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>' +
        '<button class="qr-btn-continue" id="qr-continue" disabled>Continue &rarr;</button>' +
      '</div>' +
    '</div>';
  }

  // ── Step 3+: Upgrade comparison ───────────────────────────────
  function upgradeHTML(){
    return '<div class="qr-modal qr-modal-wide"><button class="qr-close-btn" id="qr-close">&#215;</button>' +
      progressBar(3, 5) +
      '<p class="qr-upgrade-eyebrow">ONE STEP AWAY</p>' +
      '<h2 class="qr-upgrade-title">Unlock AI Smart Pages</h2>' +
      '<p class="qr-upgrade-subtitle">Upgrade to create conversational QR experiences that engage, convert, and retain.</p>' +
      '<div class="qr-compare-grid">' +
        '<div class="qr-compare-col"><span class="qr-badge-free">Free</span><ul class="qr-compare-list">'+ci('Static QR codes',false,false)+ci('Direct links',false,false)+ci('Basic customization',false,false)+ci('Unlimited scans',false,false)+ci('AI smart pages',true,false)+ci('Voice welcome',true,false)+ci('AI chat assistant',true,false)+ci('Wallet subscriptions',true,false)+ci('Push notifications',true,false)+ci('Advanced analytics',true,false)+'</ul></div>' +
        '<div class="qr-compare-col qr-compare-col-pro"><div class="qr-compare-col-glow"></div><span class="qr-badge-pro">Pro &middot; Most Popular</span><ul class="qr-compare-list">'+ci('Static QR codes',false,true)+ci('Direct links',false,true)+ci('Basic customization',false,true)+ci('Unlimited scans',false,true)+ci('AI smart pages',false,true)+ci('Voice welcome',false,true)+ci('AI chat assistant',false,true)+ci('Wallet subscriptions',false,true)+ci('Push notifications',false,true)+ci('Advanced analytics',false,true)+'</ul></div>' +
      '</div>' +
      '<div class="qr-upgrade-actions">' +
        '<button class="qr-btn-upgrade" id="qr-go-upgrade">&#10022; Upgrade Now</button>' +
        '<button class="qr-btn-secondary" id="qr-cont-free">Continue with Free QR</button>' +
      '</div>' +
      '<button class="qr-back-btn" id="qr-back">&larr; Back</button>' +
    '</div>';
  }

  // ── Overlay management ────────────────────────────────────────
  function getOrCreateOverlay(){
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el){el=document.createElement('div');el.id='qr-onboarding-overlay';document.body.appendChild(el);}
    el.classList.remove('qr-hidden');
    el.style.opacity='1';el.style.transition='';
    return el;
  }

  function close(u){
    mark(u);
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el)return;
    el.style.transition='opacity 0.25s';el.style.opacity='0';
    setTimeout(function(){el.classList.add('qr-hidden');},260);
  }

  // ── Slide transition ──────────────────────────────────────────
  function slideOut(el, dir, cb) {
    var modal = el.querySelector('.qr-modal');
    if (!modal) { cb(); return; }
    modal.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    modal.style.opacity = '0';
    modal.style.transform = 'translateX(' + (dir === 'left' ? '-32px' : '32px') + ') scale(0.98)';
    setTimeout(cb, 190);
  }

  function render(step, u) {
    var el = getOrCreateOverlay();
    var prev = el.querySelector('.qr-modal');

    function setHTML(html) {
      el.innerHTML = html;
      bindStep(step, u);
    }

    if (prev) {
      slideOut(el, step === 'back' ? 'right' : 'left', function(){ setHTML(getHTML(step)); });
    } else {
      setHTML(getHTML(step));
    }
  }

  function getHTML(step) {
    if (step === 'welcome') return welcomeHTML();
    if (step === 'step2')   return step2HTML();
    if (step === 'upgrade') return upgradeHTML();
    return welcomeHTML();
  }

  // ── Event binding per step ────────────────────────────────────
  function bindStep(step, u) {
    var closeBtn = document.getElementById('qr-close');
    if (closeBtn) closeBtn.onclick = function(){ close(u); };

    if (step === 'welcome') {
      document.getElementById('qr-free').onclick = function(){
        onboardingState.qrType = 'static';
        render('step2', u);
      };
      document.getElementById('qr-upgrade').onclick = function(){
        onboardingState.qrType = 'ai';
        render('step2', u);
      };
    }

    else if (step === 'step2') {
      var cards = document.querySelectorAll('.qr-uc-card');
      var continueBtn = document.getElementById('qr-continue');

      cards.forEach(function(card){
        card.addEventListener('click', function(){
          cards.forEach(function(c){ c.classList.remove('qr-uc-card-selected'); });
          card.classList.add('qr-uc-card-selected');
          onboardingState.selectedUseCase = card.getAttribute('data-uc');
          continueBtn.disabled = false;
        });
      });

      continueBtn.onclick = function(){
        if (!onboardingState.selectedUseCase) return;
        if (onboardingState.qrType === 'ai') {
          render('upgrade', u);
        } else {
          close(u);
          window.location.href = FREE_PATH;
        }
      };

      document.getElementById('qr-back').onclick = function(){
        render('welcome', u);
      };
    }

    else if (step === 'upgrade') {
      document.getElementById('qr-go-upgrade').onclick = function(){ close(u); window.location.href = UPGRADE_PATH; };
      document.getElementById('qr-cont-free').onclick = function(){ close(u); window.location.href = FREE_PATH; };
      document.getElementById('qr-back').onclick = function(){ render('step2', u); };
    }
  }

  // ── Public API ────────────────────────────────────────────────
  window.qrairyOnboarding = {
    init:   function(u){ if(!u||done(u))return; setTimeout(function(){ render('welcome',u); }, 450); },
    reopen: function(u){ render('welcome',u); }
  };
})();
