$root = "C:\Users\adwin\OneDrive\Desktop\qrairy.ai\frontend\public"
$dashPath = "$root\dashboard.html"

Write-Host "Starting Qraivy onboarding install..." -ForegroundColor Cyan

# ── 1. Download onboarding.css from outputs ──────────────────
$css = @"
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@400;500&display=swap');

#qr-onboarding-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
  background: rgba(5,5,5,0.82);
  backdrop-filter: blur(12px) saturate(0.6);
  -webkit-backdrop-filter: blur(12px) saturate(0.6);
  animation: qrOverlayIn 0.25s ease both;
}
@keyframes qrOverlayIn { from { opacity:0 } to { opacity:1 } }
#qr-onboarding-overlay.qr-hidden { display: none; }
.qr-modal {
  background: #111110; border: 0.5px solid rgba(255,78,0,0.22);
  border-radius: 20px; padding: 2.25rem 2rem; width: 100%; max-width: 660px;
  max-height: 90vh; overflow-y: auto; position: relative;
  animation: qrModalIn 0.35s cubic-bezier(0.22,1,0.36,1) both; scrollbar-width: none;
}
.qr-modal::-webkit-scrollbar { display: none; }
.qr-modal-wide { max-width: 760px; }
@keyframes qrModalIn { from { opacity:0; transform:translateY(22px) scale(0.97) } to { opacity:1; transform:none } }
.qr-close-btn {
  position: absolute; top: 1.1rem; right: 1.1rem; width: 30px; height: 30px;
  background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(240,236,224,0.45); font-size: 1.1rem; line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.qr-close-btn:hover { background: rgba(255,255,255,0.1); color: #f0ece0; }
.qr-modal-header { text-align: center; margin-bottom: 1.75rem; }
.qr-logo-mark {
  width: 38px; height: 38px; background: #FF4E00; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Playfair Display', Georgia, serif; font-weight: 700; font-size: 1.1rem;
  color: #fff; margin: 0 auto 0.875rem;
}
.qr-modal-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(1.4rem, 4vw, 1.85rem); font-weight: 700;
  color: #f0ece0; margin-bottom: 0.3rem; line-height: 1.2;
}
.qr-modal-subtitle {
  font-size: 0.8rem; color: rgba(240,236,224,0.45);
  font-family: 'JetBrains Mono', monospace; letter-spacing: 0.02em;
}
.qr-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; }
@media (max-width: 580px) { .qr-card-grid { grid-template-columns: 1fr; } }
.qr-card {
  background: #1a1a18; border: 0.5px solid rgba(255,255,255,0.08);
  border-radius: 15px; padding: 1.35rem; display: flex; flex-direction: column;
  gap: 0.65rem; position: relative; overflow: hidden; transition: border-color 0.2s;
}
.qr-card:hover { border-color: rgba(255,255,255,0.16); }
.qr-card-premium { background: #1a1510; border-color: rgba(255,78,0,0.38); }
.qr-card-premium:hover { border-color: rgba(255,78,0,0.62); }
.qr-card-glow {
  position: absolute; top: -35px; right: -35px; width: 120px; height: 120px;
  background: radial-gradient(circle, rgba(255,78,0,0.17), transparent 70%);
  pointer-events: none; border-radius: 50%;
}
.qr-badge-free {
  display: inline-flex; align-self: flex-start; padding: 0.18rem 0.55rem;
  background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.11);
  border-radius: 20px; font-family: 'JetBrains Mono', monospace;
  font-size: 0.64rem; letter-spacing: 0.05em; color: rgba(240,236,224,0.45);
}
.qr-badge-pro {
  display: inline-flex; align-self: flex-start; padding: 0.18rem 0.55rem;
  background: rgba(255,78,0,0.14); border: 0.5px solid rgba(255,78,0,0.38);
  border-radius: 20px; font-family: 'JetBrains Mono', monospace;
  font-size: 0.64rem; letter-spacing: 0.05em; color: #FF7A35; font-weight: 500;
}
.qr-card-icon { width: 48px; height: 48px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
.qr-card-icon-free { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1); }
.qr-card-icon-ai { background: rgba(255,78,0,0.13); border: 0.5px solid rgba(255,78,0,0.28); }
.qr-card-title { font-family: 'Playfair Display', Georgia, serif; font-size: 0.98rem; font-weight: 700; color: #f0ece0; line-height: 1.3; }
.qr-card-desc { font-family: 'JetBrains Mono', monospace; font-size: 0.71rem; line-height: 1.7; color: rgba(240,236,224,0.4); }
.qr-feature-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.38rem; }
.qr-feature-item { display: flex; align-items: center; gap: 0.42rem; font-family: 'JetBrains Mono', monospace; font-size: 0.69rem; color: rgba(240,236,224,0.5); }
.qr-feature-item-accent { color: rgba(240,236,224,0.75); }
.qr-check { flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.55rem; color: rgba(240,236,224,0.4); }
.qr-check-accent { background: rgba(255,78,0,0.12); border-color: rgba(255,78,0,0.3); color: #FF7A35; }
.qr-btn-free { margin-top: auto; padding: 0.68rem 1rem; background: transparent; border: 0.5px solid rgba(255,255,255,0.14); border-radius: 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; letter-spacing: 0.04em; color: rgba(240,236,224,0.65); cursor: pointer; transition: background 0.15s, color 0.15s; width: 100%; }
.qr-btn-free:hover { background: rgba(255,255,255,0.06); color: #f0ece0; }
.qr-btn-premium { margin-top: auto; padding: 0.72rem 1rem; background: #FF4E00; border: none; border-radius: 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; letter-spacing: 0.04em; color: #fff; cursor: pointer; width: 100%; transition: background 0.15s, transform 0.1s; }
.qr-btn-premium:hover { background: #e04400; }
.qr-btn-premium:active { transform: scale(0.98); }
.qr-modal-footer { text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: rgba(240,236,224,0.22); }
.qr-modal-footer strong { color: rgba(240,236,224,0.38); font-weight: 500; }
.qr-upgrade-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 0.64rem; letter-spacing: 0.14em; color: #FF7A35; margin-bottom: 0.4rem; text-align: center; }
.qr-upgrade-title { font-family: 'Playfair Display', Georgia, serif; font-size: 1.5rem; font-weight: 700; color: #f0ece0; margin-bottom: 0.3rem; text-align: center; }
.qr-upgrade-subtitle { font-family: 'JetBrains Mono', monospace; font-size: 0.77rem; color: rgba(240,236,224,0.4); text-align: center; margin-bottom: 1.5rem; }
.qr-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
@media (max-width: 520px) { .qr-compare-grid { grid-template-columns: 1fr; } }
.qr-compare-col { background: #1a1a18; border: 0.5px solid rgba(255,255,255,0.07); border-radius: 13px; padding: 1.2rem; }
.qr-compare-col-pro { background: #1a1510; border-color: rgba(255,78,0,0.35); position: relative; overflow: hidden; }
.qr-compare-col-glow { position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: radial-gradient(circle, rgba(255,78,0,0.15), transparent 70%); pointer-events: none; border-radius: 50%; }
.qr-compare-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
.qr-compare-item { display: flex; align-items: center; gap: 0.42rem; font-family: 'JetBrains Mono', monospace; font-size: 0.71rem; color: rgba(240,236,224,0.55); }
.qr-compare-item-locked { opacity: 0.28; }
.qr-compare-item-pro { color: rgba(240,236,224,0.75); }
.qr-upgrade-actions { display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1rem; }
.qr-btn-upgrade { padding: 0.82rem 1.5rem; background: #FF4E00; border: none; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; letter-spacing: 0.05em; color: #fff; cursor: pointer; width: 100%; transition: background 0.15s, transform 0.1s; }
.qr-btn-upgrade:hover { background: #e04400; }
.qr-btn-upgrade:active { transform: scale(0.98); }
.qr-btn-secondary { padding: 0.72rem; background: transparent; border: 0.5px solid rgba(255,255,255,0.11); border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; letter-spacing: 0.04em; color: rgba(240,236,224,0.45); cursor: pointer; width: 100%; transition: background 0.15s, color 0.15s; }
.qr-btn-secondary:hover { background: rgba(255,255,255,0.05); color: rgba(240,236,224,0.8); }
.qr-back-btn { background: transparent; border: none; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: rgba(240,236,224,0.28); cursor: pointer; letter-spacing: 0.04em; padding: 0; transition: color 0.15s; }
.qr-back-btn:hover { color: rgba(240,236,224,0.6); }
"@

Set-Content -Path "$root\onboarding.css" -Value $css -Encoding UTF8
Write-Host "onboarding.css created" -ForegroundColor Green

# ── 2. Create onboarding.js ───────────────────────────────────
$js = @"
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
"@

Set-Content -Path "$root\onboarding.js" -Value $js -Encoding UTF8
Write-Host "onboarding.js created" -ForegroundColor Green

# ── 3. Patch dashboard.html ───────────────────────────────────
$dash = Get-Content $dashPath -Raw -Encoding UTF8

if ($dash -notmatch 'onboarding\.css') {
  $dash = $dash -replace '</head>', "  <link rel=`"stylesheet`" href=`"onboarding.css`">`n</head>"
  Write-Host "Injected onboarding.css link" -ForegroundColor Green
} else { Write-Host "onboarding.css already linked - skipped" -ForegroundColor Yellow }

if ($dash -notmatch 'onboarding\.js') {
  $dash = $dash -replace '</body>', "  <script src=`"onboarding.js`"></script>`n</body>"
  Write-Host "Injected onboarding.js script" -ForegroundColor Green
} else { Write-Host "onboarding.js already injected - skipped" -ForegroundColor Yellow }

if ($dash -notmatch 'qrairyOnboarding\.init') {
  $dash = $dash -replace 'loadDashboard\(\);', "if(window.Clerk&&window.Clerk.user){window.qrairyOnboarding.init(window.Clerk.user.id);}`n      loadDashboard();"
  Write-Host "Injected qrairyOnboarding.init() call" -ForegroundColor Green
} else { Write-Host "qrairyOnboarding.init already present - skipped" -ForegroundColor Yellow }

Set-Content -Path $dashPath -Value $dash -Encoding UTF8
Write-Host "dashboard.html patched" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Install complete! Now run:" -ForegroundColor Cyan
Write-Host " git add . && git commit -m 'feat: onboarding modal' && git push" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
