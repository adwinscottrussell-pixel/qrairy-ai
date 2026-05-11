(function(){
  var FREE_PATH='dashboard.html?create=static';
  var UPGRADE_PATH='pricing.html';
  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}
  var qrSVG='<svg width="26" height="26" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="21" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="2" y="18" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="21" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/></svg>';
  var aiSVG='<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M16 3 L17.5 13 L28 16 L17.5 19 L16 29 L14.5 19 L4 16 L14.5 13 Z" stroke="#FF7A35" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M26 5 L26.8 8 L30 9 L26.8 10 L26 13 L25.2 10 L22 9 L25.2 8 Z" fill="#FF7A35" opacity="0.6"/></svg>';
  function chk(a){return '<span class="qr-check'+(a?' qr-check-accent':'')+'">&#10003;</span>';}
  function fi(t,a){return '<li class="qr-feature-item'+(a?' qr-feature-item-accent':'')+'">'+chk(a)+t+'</li>';}
  function ci(t,locked,pro){
    if(locked)return '<li class="qr-compare-item qr-compare-item-locked"><span style="width:14px;text-align:center;color:rgba(240,236,224,0.2);font-family:monospace">&mdash;</span>'+t+'</li>';
    return '<li class="qr-compare-item'+(pro?' qr-compare-item-pro':'')+'"><span class="qr-check'+(pro?' qr-check-accent':'')+'">&#10003;</span>'+t+'</li>';
  }
  function welcomeHTML(){
    return '<div class="qr-modal"><button class="qr-close-btn" id="qr-close">&#215;</button><div class="qr-modal-header"><div class="qr-logo-mark">Q</div><h1 class="qr-modal-title">Welcome to Qraivy &#128075;</h1><p class="qr-modal-subtitle">What would you like to create today?</p></div><div class="qr-card-grid"><div class="qr-card"><span class="qr-badge-free">Free Plan</span><div class="qr-card-icon qr-card-icon-free">'+qrSVG+'</div><div class="qr-card-title">Static QR Code</div><p class="qr-card-desc">Create a fast, free QR code that links directly to websites, PDFs, menus, social pages, or contact info.</p><ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Basic customization',false)+fi('No AI required',false)+'</ul><button class="qr-btn-free" id="qr-free">Create Free QR</button></div><div class="qr-card qr-card-premium"><div class="qr-card-glow"></div><span class="qr-badge-pro">&#10022; Most Popular</span><div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div><div class="qr-card-title">AI Smart QR Experience</div><p class="qr-card-desc">Build AI-powered QR landing pages with voice welcome, AI chat, wallet subscriptions, and customer engagement tools.</p><ul class="qr-feature-list">'+fi('AI chat assistant',true)+fi('Voice welcome',true)+fi('Smart landing pages',true)+fi('Wallet pass support',true)+fi('Push notifications',true)+fi('Analytics',true)+'</ul><button class="qr-btn-premium" id="qr-upgrade">&#10022; Upgrade &amp; Build AI QR</button></div></div><p class="qr-modal-footer">You can always change your plan later from <strong>Settings &rarr; Billing</strong></p></div>';
  }
  function upgradeHTML(){
    return '<div class="qr-modal qr-modal-wide"><button class="qr-close-btn" id="qr-close">&#215;</button><p class="qr-upgrade-eyebrow">ONE STEP AWAY</p><h2 class="qr-upgrade-title">Unlock AI Smart Pages</h2><p class="qr-upgrade-subtitle">Upgrade to create conversational QR experiences that engage, convert, and retain.</p><div class="qr-compare-grid"><div class="qr-compare-col"><span class="qr-badge-free">Free</span><ul class="qr-compare-list">'+ci('Static QR codes',false,false)+ci('Direct links',false,false)+ci('Basic customization',false,false)+ci('Unlimited scans',false,false)+ci('AI smart pages',true,false)+ci('Voice welcome',true,false)+ci('AI chat assistant',true,false)+ci('Wallet subscriptions',true,false)+ci('Push notifications',true,false)+ci('Advanced analytics',true,false)+'</ul></div><div class="qr-compare-col qr-compare-col-pro"><div class="qr-compare-col-glow"></div><span class="qr-badge-pro">Pro &middot; Most Popular</span><ul class="qr-compare-list">'+ci('Static QR codes',false,true)+ci('Direct links',false,true)+ci('Basic customization',false,true)+ci('Unlimited scans',false,true)+ci('AI smart pages',false,true)+ci('Voice welcome',false,true)+ci('AI chat assistant',false,true)+ci('Wallet subscriptions',false,true)+ci('Push notifications',false,true)+ci('Advanced analytics',false,true)+'</ul></div></div><div class="qr-upgrade-actions"><button class="qr-btn-upgrade" id="qr-go-upgrade">&#10022; Upgrade Now</button><button class="qr-btn-secondary" id="qr-cont-free">Continue with Free QR</button></div><button class="qr-back-btn" id="qr-back">&larr; Back</button></div>';
  }
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
  function render(step,u){
    var el=getOrCreateOverlay();
    el.innerHTML=step==='welcome'?welcomeHTML():upgradeHTML();
    document.getElementById('qr-close').onclick=function(){close(u);};
    if(step==='welcome'){
      document.getElementById('qr-free').onclick=function(){close(u);window.location.href=FREE_PATH;};
      document.getElementById('qr-upgrade').onclick=function(){render('upgrade',u);};
    } else {
      document.getElementById('qr-go-upgrade').onclick=function(){close(u);window.location.href=UPGRADE_PATH;};
      document.getElementById('qr-cont-free').onclick=function(){close(u);window.location.href=FREE_PATH;};
      document.getElementById('qr-back').onclick=function(){render('welcome',u);};
    }
  }
  window.qrairyOnboarding={
    init:function(u){if(!u||done(u))return;setTimeout(function(){render('welcome',u);},450);},
    reopen:function(u){render('welcome',u);}
  };
})();
