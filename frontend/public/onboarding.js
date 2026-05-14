(function(){
  var FREE_PATH='dashboard.html?create=static';
  var UPGRADE_PATH='pricing.html';
  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}

  var onboardingState = { qrType: null, selectedUseCase: null };

  var qrSVG='<svg width="26" height="26" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="21" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="2" y="18" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="21" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/></svg>';
  var aiSVG='<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M16 3 L17.5 13 L28 16 L17.5 19 L16 29 L14.5 19 L4 16 L14.5 13 Z" stroke="#FF7A35" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M26 5 L26.8 8 L30 9 L26.8 10 L26 13 L25.2 10 L22 9 L25.2 8 Z" fill="#FF7A35" opacity="0.6"/></svg>';

  function chk(a){return '<span class="qr-check'+(a?' qr-check-accent':'')+'">&#10003;</span>';}
  function fi(t,a){return '<li class="qr-feature-item'+(a?' qr-feature-item-accent':'')+'">'+chk(a)+t+'</li>';}
  function ci(t,locked,pro){
    if(locked)return '<li class="qr-compare-item qr-compare-item-locked"><span style="width:14px;text-align:center;color:rgba(240,236,224,0.2);font-family:monospace">&mdash;</span>'+t+'</li>';
    return '<li class="qr-compare-item'+(pro?' qr-compare-item-pro':'')+'"><span class="qr-check'+(pro?' qr-check-accent':'')+'">&#10003;</span>'+t+'</li>';
  }

  var USE_CASES = [
    { id:'restaurant',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6h4M21 22H3"/></svg>', title:'Restaurant', sub:'Menus, promos, and customer engagement' },
    { id:'bizcard',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10h.01M2 10h2M16 10h4M8 14h8"/></svg>', title:'Business Card', sub:'Modern networking with smart contact sharing' },
    { id:'packaging',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', title:'Product Packaging', sub:'Connect physical products to digital experiences' },
    { id:'event',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', title:'Event', sub:'Tickets, schedules, and attendee engagement' },
    { id:'social',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 2H7a5 5 0 00-5 5v10a5 5 0 005 5h10a5 5 0 005-5V7a5 5 0 00-5-5z"/><circle cx="12" cy="12" r="3"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>', title:'Social Media', sub:'Grow followers and drive engagement' },
    { id:'ai-support',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3" stroke-linecap="round"/></svg>', title:'AI Customer Support', sub:'Launch AI-powered customer interactions' },
    { id:'realestate',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', title:'Real Estate', sub:'Property showcases and lead capture' },
    { id:'ecommerce',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>', title:'Ecommerce', sub:'Drive traffic to products and offers' },
    { id:'leadgen',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>', title:'Lead Generation', sub:'Capture and qualify new leads' },
    { id:'gym',         icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg>', title:'Gym / Fitness', sub:'Memberships, classes, and promotions' },
    { id:'portfolio',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', title:'Portfolio', sub:'Showcase creative or professional work' },
  ];

  var STARTER_KITS = {
    restaurant: { templateId:'restaurant-menu',   label:'Restaurant Menu',   emoji:'🍽' },
    bizcard:    { templateId:'business-card',     label:'Business Card',     emoji:'💼' },
    packaging:  { templateId:'promo-flyer-dark',  label:'Product Promo',     emoji:'📦' },
    event:      { templateId:'event-poster',      label:'Event Poster',      emoji:'🎵' },
    social:     { templateId:'instagram-promo',   label:'Social Post',       emoji:'📱' },
    'ai-support':{ templateId:'promo-flyer-dark', label:'AI Support Page',   emoji:'🤖' },
    realestate: { templateId:'promo-flyer-light', label:'Property Showcase', emoji:'🏠' },
    ecommerce:  { templateId:'promo-flyer-dark',  label:'Product Promo',     emoji:'🛒' },
    leadgen:    { templateId:'qr-landing-promo',  label:'Lead Capture',      emoji:'🎯' },
    gym:        { templateId:'promo-flyer-dark',  label:'Fitness Promo',     emoji:'💪' },
    portfolio:  { templateId:'business-card',     label:'Portfolio Card',    emoji:'🎨' },
  };

  var LOADING_MSGS = [
    'Analyzing your business type\u2026',
    'Building your smart QR experience\u2026',
    'Preparing AI layouts\u2026',
    'Generating conversion-focused sections\u2026',
    'Personalizing your workspace\u2026',
    'Almost ready\u2026',
  ];

  function progressBar(step, total) {
    var pct = Math.round((step/total)*100);
    var dots='';
    for(var i=1;i<=total;i++) dots+='<span class="qr-prog-dot'+(i<=step?' qr-prog-dot-active':'')+'"></span>';
    return '<div class="qr-progress-wrap">'+
      '<div class="qr-progress-bar-track"><div class="qr-progress-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="qr-progress-meta"><span class="qr-progress-label">Step '+step+' of '+total+'</span><div class="qr-prog-dots">'+dots+'</div></div>'+
      '</div>';
  }

  function welcomeHTML(){
    return '<div class="qr-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(1,5)+
      '<div class="qr-modal-header"><div class="qr-logo-mark">Q</div>'+
      '<h1 class="qr-modal-title">Welcome to Qraivy &#128075;</h1>'+
      '<p class="qr-modal-subtitle">What would you like to create today?</p></div>'+
      '<div class="qr-card-grid">'+
        '<div class="qr-card">'+
          '<span class="qr-badge-free">Free Plan</span>'+
          '<div class="qr-card-icon qr-card-icon-free">'+qrSVG+'</div>'+
          '<div class="qr-card-title">Static QR Code</div>'+
          '<p class="qr-card-desc">Create a fast, free QR code that links directly to websites, PDFs, menus, social pages, or contact info.</p>'+
          '<ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Basic customization',false)+fi('No AI required',false)+'</ul>'+
          '<button class="qr-btn-free" id="qr-free">Create Free QR</button>'+
        '</div>'+
        '<div class="qr-card qr-card-premium">'+
          '<div class="qr-card-glow"></div>'+
          '<span class="qr-badge-pro">&#10022; Most Popular</span>'+
          '<div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div>'+
          '<div class="qr-card-title">AI Smart QR Experience</div>'+
          '<p class="qr-card-desc">Build AI-powered QR landing pages with voice welcome, AI chat, wallet subscriptions, and customer engagement tools.</p>'+
          '<ul class="qr-feature-list">'+fi('AI chat assistant',true)+fi('Voice welcome',true)+fi('Smart landing pages',true)+fi('Wallet pass support',true)+fi('Push notifications',true)+fi('Analytics',true)+'</ul>'+
          '<button class="qr-btn-premium" id="qr-upgrade">&#10022; Upgrade &amp; Build AI QR</button>'+
        '</div>'+
      '</div>'+
      '<p class="qr-modal-footer">You can always change your plan later from <strong>Settings &rarr; Billing</strong></p>'+
    '</div>';
  }

  function step2HTML(){
    var cards=USE_CASES.map(function(uc,i){
      return '<button class="qr-uc-card" data-uc="'+uc.id+'" style="animation-delay:'+(i*35)+'ms">'+
        '<div class="qr-uc-check"><svg viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#FF7A35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'+
        '<div class="qr-uc-icon">'+uc.icon+'</div>'+
        '<div class="qr-uc-title">'+uc.title+'</div>'+
        '<div class="qr-uc-sub">'+uc.sub+'</div>'+
      '</button>';
    }).join('');
    return '<div class="qr-modal qr-modal-wide qr-step2-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(2,5)+
      '<div class="qr-modal-header qr-modal-header-compact">'+
        '<h1 class="qr-modal-title">What are you using your QR for?</h1>'+
        '<p class="qr-modal-subtitle">Choose your primary use case to personalise your experience</p>'+
      '</div>'+
      '<div class="qr-uc-grid">'+cards+'</div>'+
      '<div class="qr-step2-footer">'+
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
        '<button class="qr-btn-continue" id="qr-continue" disabled>Continue &rarr;</button>'+
      '</div>'+
    '</div>';
  }

  function step3HTML(){
    var kit = STARTER_KITS[onboardingState.selectedUseCase] || { label:'Your Workspace', emoji:'✦' };
    return '<div class="qr-modal qr-step3-modal">'+
      '<div class="qr-s3-particles" id="qr-s3-particles"></div>'+
      '<div class="qr-s3-content">'+
        '<div class="qr-s3-orb-wrap">'+
          '<div class="qr-s3-ring qr-s3-ring-outer"></div>'+
          '<div class="qr-s3-ring qr-s3-ring-inner"></div>'+
          '<div class="qr-s3-orb">'+
            '<div class="qr-logo-mark" style="margin:0;width:44px;height:44px;font-size:1.3rem;">Q</div>'+
          '</div>'+
        '</div>'+
        '<div class="qr-s3-kit-label">'+kit.emoji+' '+kit.label+'</div>'+
        '<h2 class="qr-s3-title">Preparing your AI workspace</h2>'+
        '<p class="qr-s3-msg" id="qr-s3-msg">'+LOADING_MSGS[0]+'</p>'+
        '<div class="qr-s3-prog-wrap">'+
          '<div class="qr-s3-prog-track"><div class="qr-s3-prog-fill" id="qr-s3-fill"></div></div>'+
          '<span class="qr-s3-pct" id="qr-s3-pct">0%</span>'+
        '</div>'+
        '<div class="qr-s3-feats">'+
          '<div class="qr-s3-feat" id="qr-s3-f0"><span class="qr-s3-feat-dot"></span>AI Layout Engine</div>'+
          '<div class="qr-s3-feat" id="qr-s3-f1"><span class="qr-s3-feat-dot"></span>Smart QR Blocks</div>'+
          '<div class="qr-s3-feat" id="qr-s3-f2"><span class="qr-s3-feat-dot"></span>CTA Generator</div>'+
          '<div class="qr-s3-feat" id="qr-s3-f3"><span class="qr-s3-feat-dot"></span>Brand Personalizer</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function upgradeHTML(){
    return '<div class="qr-modal qr-modal-wide"><button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5)+
      '<p class="qr-upgrade-eyebrow">ONE STEP AWAY</p>'+
      '<h2 class="qr-upgrade-title">Unlock AI Smart Pages</h2>'+
      '<p class="qr-upgrade-subtitle">Upgrade to create conversational QR experiences that engage, convert, and retain.</p>'+
      '<div class="qr-compare-grid">'+
        '<div class="qr-compare-col"><span class="qr-badge-free">Free</span><ul class="qr-compare-list">'+ci('Static QR codes',false,false)+ci('Direct links',false,false)+ci('Basic customization',false,false)+ci('Unlimited scans',false,false)+ci('AI smart pages',true,false)+ci('Voice welcome',true,false)+ci('AI chat assistant',true,false)+ci('Wallet subscriptions',true,false)+ci('Push notifications',true,false)+ci('Advanced analytics',true,false)+'</ul></div>'+
        '<div class="qr-compare-col qr-compare-col-pro"><div class="qr-compare-col-glow"></div><span class="qr-badge-pro">Pro &middot; Most Popular</span><ul class="qr-compare-list">'+ci('Static QR codes',false,true)+ci('Direct links',false,true)+ci('Basic customization',false,true)+ci('Unlimited scans',false,true)+ci('AI smart pages',false,true)+ci('Voice welcome',false,true)+ci('AI chat assistant',false,true)+ci('Wallet subscriptions',false,true)+ci('Push notifications',false,true)+ci('Advanced analytics',false,true)+'</ul></div>'+
      '</div>'+
      '<div class="qr-upgrade-actions">'+
        '<button class="qr-btn-upgrade" id="qr-go-upgrade">&#10022; Upgrade Now</button>'+
        '<button class="qr-btn-secondary" id="qr-cont-free">Continue with Free QR</button>'+
      '</div>'+
      '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
    '</div>';
  }

  function getOrCreateOverlay(){
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el){el=document.createElement('div');el.id='qr-onboarding-overlay';document.body.appendChild(el);}
    el.classList.remove('qr-hidden');el.style.opacity='1';el.style.transition='';
    return el;
  }

  function closeModal(u){
    mark(u);
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el)return;
    el.style.transition='opacity 0.25s';el.style.opacity='0';
    setTimeout(function(){el.classList.add('qr-hidden');},260);
  }

  function slideOut(el, cb){
    var modal=el.querySelector('.qr-modal');
    if(!modal){cb();return;}
    modal.style.transition='opacity 0.18s ease,transform 0.18s ease';
    modal.style.opacity='0';modal.style.transform='translateX(-28px) scale(0.98)';
    setTimeout(cb,190);
  }

  function render(step,u){
    var el=getOrCreateOverlay();
    var hasPrev=!!el.querySelector('.qr-modal');
    function setHTML(html){el.innerHTML=html;bindStep(step,u);}
    if(hasPrev){slideOut(el,function(){setHTML(getHTML(step));});}
    else{setHTML(getHTML(step));}
  }

  function getHTML(step){
    if(step==='welcome') return welcomeHTML();
    if(step==='step2')   return step2HTML();
    if(step==='step3')   return step3HTML();
    if(step==='upgrade') return upgradeHTML();
    return welcomeHTML();
  }

  // ── Step 3 animation engine ───────────────────────
  function runStep3Animation(u){
    var msgEl  = document.getElementById('qr-s3-msg');
    var fillEl = document.getElementById('qr-s3-fill');
    var pctEl  = document.getElementById('qr-s3-pct');
    var feats  = [0,1,2,3].map(function(i){return document.getElementById('qr-s3-f'+i);});

    spawnParticles();

    var DURATION = 3800;
    var start = Date.now();
    var msgIdx = 0;
    var featIdx = 0;

    var msgTimer = setInterval(function(){
      msgIdx = (msgIdx+1) % LOADING_MSGS.length;
      if(msgEl){
        msgEl.style.opacity='0';
        setTimeout(function(){
          if(msgEl){msgEl.textContent=LOADING_MSGS[msgIdx];msgEl.style.opacity='1';}
        },150);
      }
    }, 620);

    var featTimer = setInterval(function(){
      if(featIdx<feats.length && feats[featIdx]){
        feats[featIdx].classList.add('qr-s3-feat-active');
        featIdx++;
      }
    }, DURATION/(feats.length+1));

    function tick(){
      var elapsed=Date.now()-start;
      var raw=elapsed/DURATION;
      var eased=Math.round(100*(1-Math.pow(1-Math.min(raw,1),2.4)));
      eased=Math.min(99,eased);
      if(fillEl) fillEl.style.width=eased+'%';
      if(pctEl)  pctEl.textContent=eased+'%';
      if(elapsed<DURATION) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    setTimeout(function(){
      clearInterval(msgTimer);
      clearInterval(featTimer);
      feats.forEach(function(f){if(f)f.classList.add('qr-s3-feat-active');});
      if(fillEl) fillEl.style.width='100%';
      if(pctEl)  pctEl.textContent='100%';
      if(msgEl){
        msgEl.style.opacity='0';
        setTimeout(function(){
          if(msgEl){msgEl.textContent='Your workspace is ready \u2726';msgEl.style.opacity='1';msgEl.style.color='#FF7A35';}
        },150);
      }
      setTimeout(function(){launchEditor(u);},650);
    }, DURATION);
  }

  function spawnParticles(){
    var c=document.getElementById('qr-s3-particles');
    if(!c) return;
    for(var i=0;i<20;i++){
      (function(idx){
        setTimeout(function(){
          var p=document.createElement('div');
          p.className='qr-s3-particle';
          p.style.cssText=[
            'position:absolute',
            'bottom:0',
            'left:'+(8+Math.random()*84)+'%',
            'width:'+(2+Math.random()*3)+'px',
            'height:'+(2+Math.random()*3)+'px',
            'border-radius:50%',
            'background:rgba(255,78,0,'+(0.3+Math.random()*0.5)+')',
            'animation:qrParticleRise '+(2.5+Math.random()*2.5)+'s ease-out '+(Math.random()*1.5)+'s both',
            'pointer-events:none',
          ].join(';');
          c.appendChild(p);
        }, idx*120);
      })(i);
    }
  }

  function launchEditor(u){
    var el=getOrCreateOverlay();
    el.style.transition='opacity 0.35s';
    el.style.opacity='0';
    setTimeout(function(){el.classList.add('qr-hidden');mark(u);},360);

    var kit=STARTER_KITS[onboardingState.selectedUseCase];
    if(!kit) return;

    var isEditor = window.location.pathname.indexOf('editor')!==-1 ||
                   document.getElementById('polotno-container')!==null;

    if(isEditor){
      setTimeout(function(){
        if(typeof loadTemplate==='function'){
          loadTemplate(kit.templateId);
          if(typeof showToast==='function') showToast('\u2726 AI workspace ready \u2014 '+kit.label+' loaded');
        }
      },400);
    } else {
      window.location.href='editor.html?kit='+encodeURIComponent(kit.templateId)+'&usecase='+encodeURIComponent(onboardingState.selectedUseCase||'');
    }
  }

  // ── Bind step events ──────────────────────────────
  function bindStep(step,u){
    var closeBtn=document.getElementById('qr-close');
    if(closeBtn) closeBtn.onclick=function(){closeModal(u);};

    if(step==='welcome'){
      document.getElementById('qr-free').onclick=function(){onboardingState.qrType='static';render('step2',u);};
      document.getElementById('qr-upgrade').onclick=function(){onboardingState.qrType='ai';render('step2',u);};
    }
    else if(step==='step2'){
      var cards=document.querySelectorAll('.qr-uc-card');
      var contBtn=document.getElementById('qr-continue');
      cards.forEach(function(card){
        card.addEventListener('click',function(){
          cards.forEach(function(c){c.classList.remove('qr-uc-card-selected');});
          card.classList.add('qr-uc-card-selected');
          onboardingState.selectedUseCase=card.getAttribute('data-uc');
          contBtn.disabled=false;
        });
      });
      contBtn.onclick=function(){if(!onboardingState.selectedUseCase)return;render('step3',u);};
      document.getElementById('qr-back').onclick=function(){render('welcome',u);};
    }
    else if(step==='step3'){
      setTimeout(function(){runStep3Animation(u);},80);
    }
    else if(step==='upgrade'){
      document.getElementById('qr-go-upgrade').onclick=function(){closeModal(u);window.location.href=UPGRADE_PATH;};
      document.getElementById('qr-cont-free').onclick=function(){closeModal(u);window.location.href=FREE_PATH;};
      document.getElementById('qr-back').onclick=function(){render('step2',u);};
    }
  }

  // ── Handle editor.html ?kit= param ───────────────
  window.addEventListener('load',function(){
    var params=new URLSearchParams(window.location.search);
    var kit=params.get('kit');
    if(kit && typeof loadTemplate==='function'){
      setTimeout(function(){loadTemplate(kit);},500);
    }
  });

  window.qrairyOnboarding={
    init:   function(u){if(!u||done(u))return;setTimeout(function(){render('welcome',u);},450);},
    reopen: function(u){render('welcome',u);}
  };
})();
