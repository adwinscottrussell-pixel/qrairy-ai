const fs = require('fs');
let fe = fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
let lp = fs.readFileSync('backend/src/controllers/lpController.js','utf8').replace(/\r\n/g,'\n');
const walletFields = fs.readFileSync('loop_wallet_fields.txt','utf8');

// 1. Insert wallet fields before the old combined wallet toggle
const OLD_WALLET_TOG = `          <!-- Wallet Toggle -->
          <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;">
            <div>
              <div style="font-size:.72rem;color:#f0f4f8;font-family:'Inter',sans-serif;font-weight:500;">Apple / Google Wallet Buttons</div>
              <div style="font-size:.6rem;color:rgba(240,244,248,0.55);margin-top:2px;">Show wallet pass buttons below form</div>
            </div>
            <button id="loop-wallet-toggle" style="padding:4px 10px;border-radius:20px;font-size:.62rem;font-weight:600;cursor:pointer;border:0.5px solid;">On</button>
          </div>`;
if (fe.includes(OLD_WALLET_TOG)) {
  fe = fe.replace(OLD_WALLET_TOG, walletFields);
  console.log('1. Wallet fields inserted');
} else console.log('1. FAILED wallet toggle not found');

// 2. Update the Loop wiring IIFE to add new fields + apple/google toggles
const OLD_LOOP_IIFE = `  // ── Wire Loop inputs to sections.loop ─────────────────────────────
  (function() {
    function sync() {
      var s = window.QRAIVY_EDITOR_STATE.sections.loop;
      var t=document.getElementById('loop-input-title');
      var d=document.getElementById('loop-input-desc');
      var e=document.getElementById('loop-input-email-placeholder');
      var b=document.getElementById('loop-input-btn-label');
      if(t) s.title=t.value;
      if(d) s.description=d.value;
      if(e) s.emailPlaceholder=e.value;
      if(b) s.buttonLabel=b.value;
      // also keep legacy state.loop in sync
      window.QRAIVY_EDITOR_STATE.loop = Object.assign({}, window.QRAIVY_EDITOR_STATE.loop, {
        title: s.title, description: s.description,
        emailPlaceholder: s.emailPlaceholder, buttonLabel: s.buttonLabel
      });
      markDirty();
    }
    ['loop-input-title','loop-input-desc','loop-input-email-placeholder','loop-input-btn-label'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.addEventListener('input',sync);
    });
    var loopTog = document.getElementById('loop-enabled-toggle');
    if(loopTog) loopTog.addEventListener('click', function(){
      var s = window.QRAIVY_EDITOR_STATE.sections.loop;
      s.enabled = !s.enabled;
      loopTog.textContent = s.enabled ? 'On' : 'Off';
      loopTog.style.background = s.enabled ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
      loopTog.style.color = s.enabled ? '#ff5a1f' : 'rgba(240,244,248,0.5)';
      markDirty();
    });
  })();`;
const NEW_LOOP_IIFE = `  // ── Wire Loop inputs to sections.loop ─────────────────────────────
  (function() {
    function sync() {
      var s = window.QRAIVY_EDITOR_STATE.sections.loop;
      var t=document.getElementById('loop-input-title');
      var d=document.getElementById('loop-input-desc');
      var e=document.getElementById('loop-input-email-placeholder');
      var b=document.getElementById('loop-input-btn-label');
      var wt=document.getElementById('loop-input-wallet-title');
      var ws=document.getElementById('loop-input-wallet-subtitle');
      if(t) s.title=t.value;
      if(d) s.description=d.value;
      if(e) s.emailPlaceholder=e.value;
      if(b) s.buttonLabel=b.value;
      if(wt) s.walletTitle=wt.value;
      if(ws) s.walletSubtitle=ws.value;
      window.QRAIVY_EDITOR_STATE.loop = Object.assign({}, window.QRAIVY_EDITOR_STATE.loop||{}, {
        title: s.title, description: s.description,
        emailPlaceholder: s.emailPlaceholder, buttonLabel: s.buttonLabel,
        walletTitle: s.walletTitle, walletSubtitle: s.walletSubtitle
      });
      if(window.markDirty) window.markDirty();
    }
    ['loop-input-title','loop-input-desc','loop-input-email-placeholder','loop-input-btn-label','loop-input-wallet-title','loop-input-wallet-subtitle'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.addEventListener('input',sync);
    });
    function wireToggle(id, field) {
      var btn=document.getElementById(id); if(!btn) return;
      btn.addEventListener('click', function(){
        var s=window.QRAIVY_EDITOR_STATE.sections.loop;
        s[field] = s[field]===false ? true : false;
        var on = s[field]!==false;
        btn.textContent=on?'On':'Off';
        btn.style.background=on?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
        btn.style.color=on?'#ff5a1f':'rgba(240,244,248,0.5)';
        btn.style.border=on?'0.5px solid rgba(255,90,31,0.4)':'0.5px solid rgba(255,255,255,0.15)';
        if(window.markDirty) window.markDirty();
      });
    }
    wireToggle('loop-apple-toggle','appleEnabled');
    wireToggle('loop-google-toggle','googleEnabled');
    var loopTog=document.getElementById('loop-enabled-toggle');
    if(loopTog) loopTog.addEventListener('click', function(){
      var s=window.QRAIVY_EDITOR_STATE.sections.loop;
      s.enabled=!s.enabled;
      loopTog.textContent=s.enabled?'On':'Off';
      loopTog.style.background=s.enabled?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
      loopTog.style.color=s.enabled?'#ff5a1f':'rgba(240,244,248,0.5)';
      if(window.markDirty) window.markDirty();
    });
  })();`;
if (fe.includes(OLD_LOOP_IIFE)) { fe = fe.replace(OLD_LOOP_IIFE, NEW_LOOP_IIFE); console.log('2. Loop IIFE: updated'); }
else console.log('2. FAILED loop IIFE not found');

// 3. Add new fields to collectEditorStateFromInputs
const OLD_COLLECT = "    S.sections.loop.emailPlaceholder = val('loop-input-email-placeholder');\n    S.sections.loop.buttonLabel      = val('loop-input-btn-label');";
const NEW_COLLECT = "    S.sections.loop.emailPlaceholder = val('loop-input-email-placeholder');\n    S.sections.loop.buttonLabel      = val('loop-input-btn-label');\n    S.sections.loop.walletTitle      = val('loop-input-wallet-title');\n    S.sections.loop.walletSubtitle   = val('loop-input-wallet-subtitle');";
if (fe.includes(OLD_COLLECT)) { fe = fe.replace(OLD_COLLECT, NEW_COLLECT); console.log('3. collectEditorState: updated'); }
else console.log('3. FAILED collect');

// 4. Add STEP25 hydration for new loop fields
const OLD_STEP25_LOOP = "      hydrate('loop-input-btn-label',          sl.buttonLabel || '');";
const NEW_STEP25_LOOP = "      hydrate('loop-input-btn-label',          sl.buttonLabel || '');\n      hydrate('loop-input-wallet-title',         sl.walletTitle || '');\n      hydrate('loop-input-wallet-subtitle',      sl.walletSubtitle || '');";
if (fe.includes(OLD_STEP25_LOOP)) { fe = fe.replace(OLD_STEP25_LOOP, NEW_STEP25_LOOP); console.log('4. STEP25 hydrate: updated'); }
else { console.log('4. FAILED step25 loop. Searching...'); const i = fe.indexOf('loop-input-btn-label'); console.log('btn-label at:', i, JSON.stringify(fe.slice(i,i+80))); }

// 5. Update buildDraftHTML loop section
// Find and update wallet card brand + subtitle in the loop section
const OLD_LOOP_WALLET = '<span class="lp-wallet-brand">${loop.title || \'Stay in the loop\'}</span>';
const OLD_DRAFT_WALLET_CHECK = fe.indexOf('lp-wallet-brand');
if (OLD_DRAFT_WALLET_CHECK !== -1) {
  const ctx = fe.slice(OLD_DRAFT_WALLET_CHECK - 10, OLD_DRAFT_WALLET_CHECK + 100);
  console.log('5. Draft wallet context:', JSON.stringify(ctx));
} else console.log('5. No lp-wallet-brand in buildDraftHTML');

fs.writeFileSync('frontend/public/smart-qr-detail.html', fe, 'utf8');

// 6. Update lpController.js - wallet brand, subtitle, apple/google visibility
// Wallet brand: change ${bizName} to ${sl.walletTitle || bizName}
const OLD_LP_BRAND = "<span class=\"lp-wallet-brand\">${bizName}</span>";
const NEW_LP_BRAND = "<span class=\"lp-wallet-brand\">${sl.walletTitle || bizName}</span>";
if (lp.includes(OLD_LP_BRAND)) { lp = lp.replace(OLD_LP_BRAND, NEW_LP_BRAND); console.log('6a. LP wallet brand: done'); }
else console.log('6a. FAILED wallet brand');

// Wallet member subtitle: change QRAIVY MEMBER to dynamic
const OLD_LP_MEMBER = "<span class=\"lp-wallet-id\">QRAIVY MEMBER</span>";
const NEW_LP_MEMBER = "<span class=\"lp-wallet-id\">${sl.walletSubtitle || 'QRAIVY MEMBER'}</span>";
if (lp.includes(OLD_LP_MEMBER)) { lp = lp.replace(OLD_LP_MEMBER, NEW_LP_MEMBER); console.log('6b. LP wallet subtitle: done'); }
else console.log('6b. FAILED wallet subtitle');

// Wallet buttons: split apple/google with individual visibility
const OLD_LP_WALLETBTNS = "<div class=\"lp-wallet-btns\"><button class=\"lp-wallet-btn\">&#9679; Add to Apple Wallet &mdash; coming soon</button><button class=\"lp-wallet-btn\">&#9632; Add to Google Wallet &mdash; coming soon</button></div>";
const NEW_LP_WALLETBTNS = "${(sl.appleEnabled!==false||sl.googleEnabled!==false)?'<div class=\"lp-wallet-btns\">'+(sl.appleEnabled!==false?'<button class=\"lp-wallet-btn\">&#9679; Add to Apple Wallet &mdash; coming soon</button>':'')+(sl.googleEnabled!==false?'<button class=\"lp-wallet-btn\">&#9632; Add to Google Wallet &mdash; coming soon</button>':'')+'</div>':''}";
if (lp.includes(OLD_LP_WALLETBTNS)) { lp = lp.replace(OLD_LP_WALLETBTNS, NEW_LP_WALLETBTNS); console.log('6c. LP wallet buttons: done'); }
else console.log('6c. FAILED wallet buttons');

fs.writeFileSync('backend/src/controllers/lpController.js', lp, 'utf8');
console.log('Done.');
console.log('wallet-title input in HTML:', fe.includes('loop-input-wallet-title'));
console.log('appleEnabled in IIFE:', fe.includes("'appleEnabled'"));
console.log('walletTitle in LP:', lp.includes('sl.walletTitle'));
