
// ── QRAIVY EDITOR STATE (Step 11) ─────────────────────────────────────────
window.QRAIVY_DRAFT_VERSION = 2; // bump to invalidate old drafts
window.QRAIVY_EDITOR_STATE = {
  pageName: '', slug: '', dirty: false,
  hero: { title: '', subtitle: '', badgeText: 'Qraivy Smart Page', logoInitial: 'A' },
  buttons: [],
  loop: { title: 'Stay in the loop', description: '', emailPlaceholder: 'your@email.com', buttonLabel: 'Subscribe →', showWalletButtons: true },
  sections: {
    hero:  { enabled: true, title: '', subtitle: '', badge: '', logoText: '', logoUrl: '' },
    voice: { enabled: true, title: 'Voice Welcome', description: '', buttonLabel: 'Play' },
    ai:    { enabled: true, title: 'AI Assistant', description: '', placeholder: 'Ask a question…' },
    loop:  { enabled: true, title: 'Stay in the loop', description: '', emailPlaceholder: 'your@email.com', buttonLabel: 'Subscribe →' },
    footer:{ enabled: true, businessName: '', footerText: '', footerLink: '' },
    buttons: [],
    order: ['hero','voice','ai','buttons','loop','footer'],
    theme: { background: 'dark', accentColor: '#ff5a1f', buttonStyle: 'rounded', fontStyle: 'modern', logoMode: 'initials' }
  }
};

(function() {
  var DRAFT_KEY_PREFIX = 'qraivy_editor_draft_';
  function getDraftKey() { return DRAFT_KEY_PREFIX + (window.QRAIVY_EDITOR_STATE.slug || 'demo'); }
  function saveDraft() { try { localStorage.setItem(getDraftKey(), JSON.stringify(window.QRAIVY_EDITOR_STATE)); } catch(e) {} }
  async function publishPage() {
    var state = window.QRAIVY_EDITOR_STATE;
    var slug = state.slug;
    if (!slug) { setStatus('No slug — cannot publish', '#f87171'); return; }
    if (!window.confirm('Publish this page? This will update your live Smart QR page immediately.')) return;
    setStatus('Publishing…', '#ff5a1f');
    try {
      var tok = null;
      if (window.Clerk && window.Clerk.session) tok = await window.Clerk.session.getToken();
      var headers = { 'Content-Type': 'application/json' };
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      var payload = {
        slug: slug,
        businessName: state.pageName || state.hero.title || slug,
        websiteUrl: state.websiteUrl || (state.sections && state.sections.info && state.sections.info.website) || '',
        useCase: state.useCase || 'restaurant',
        brandColor: state.brandColor || '#ff5a1f',
        logoUrl: state.logoUrl || '',
        sections: Object.assign({}, state.sections || {}, { buttons: (state.buttons || []), order: (state.sections && state.sections.order) || ['hero','voice','ai','buttons','loop','footer'], theme: (state.sections && state.sections.theme) || { background:'dark', accentColor:'#ff5a1f', buttonStyle:'rounded', fontStyle:'modern', logoMode:'initials' } })
      };
      var res = await fetch('https://api.qraivy.com/lp', { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Publish failed');
      saveDraft();
      setStatus('Published just now ✓', '#22d47e');
      window.QRAIVY_EDITOR_STATE.dirty = false;
      // Reload LIVE iframe
      var iframe = document.getElementById('sqd-iframe') || document.querySelector('iframe');
      if (iframe) { var src = iframe.src.split("?")[0] + "?preview=1"; iframe.src = ''; setTimeout(function(){ iframe.src = src; }, 100); }
      setTimeout(function(){ setStatus('No changes'); }, 4000);
    } catch(e) {
      setStatus('Publish failed: ' + e.message, '#f87171');
    }
  }
  function loadDraft(slug) { try { var r = localStorage.getItem(DRAFT_KEY_PREFIX+(slug||'demo')); return r?JSON.parse(r):null; } catch(e) { return null; } }
  function setStatus(msg, color) { var el=document.getElementById('hero-save-status'); if(el){el.textContent=msg;el.style.color=color||'rgba(240,244,248,0.50)';} var el2=document.getElementById('sqd-save-global-status'); if(el2){el2.textContent=msg;el2.style.color=color||'rgba(240,244,248,0.50)';} }
  function updateDraftSummary() {
    var s=window.QRAIVY_EDITOR_STATE.hero;
    var summary=document.getElementById('hero-draft-summary');
    var pt=document.getElementById('draft-preview-title');
    var ps=document.getElementById('draft-preview-subtitle');
    if(summary) summary.style.display=window.QRAIVY_EDITOR_STATE.dirty?'block':'none';
    if(pt) pt.textContent=s.title||'—';
    if(ps) ps.textContent=s.subtitle||'—';
  }
  function hydrateFields(hero) {
    var ti=document.getElementById('hero-title-input');
    var si=document.getElementById('hero-subtitle-input');
    var bi=document.getElementById('hero-badge-input');
    var li=document.getElementById('hero-logo-input');
    var lp=document.getElementById('hero-logo-preview');
    var ct=document.getElementById('hero-cta-text-input');
    var cu=document.getElementById('hero-cta-url-input');
    if(ti) ti.value=hero.title||'';
    if(si) si.value=hero.subtitle||'';
    if(bi) bi.value=hero.badgeText||'Qraivy Smart Page';
    if(li) li.value=hero.logoInitial||'';
    if(lp) lp.textContent=(hero.logoInitial||(hero.title&&hero.title[0])||'A').toUpperCase().slice(0,2);
    if(ct) ct.value=hero.ctaText!==undefined?hero.ctaText:'Start a Conversation →';
    if(cu) cu.value=hero.ctaUrl||'';
  }
  function wireHeroFields() {
    var ti=document.getElementById('hero-title-input');
    var si=document.getElementById('hero-subtitle-input');
    var bi=document.getElementById('hero-badge-input');
    var li=document.getElementById('hero-logo-input');
    var lp=document.getElementById('hero-logo-preview');
    var ct=document.getElementById('hero-cta-text-input');
    var cu=document.getElementById('hero-cta-url-input');
    function onChange() {
      var s=window.QRAIVY_EDITOR_STATE.hero;
      s.title=ti?ti.value:s.title; s.subtitle=si?si.value:s.subtitle;
      s.badgeText=bi?bi.value:s.badgeText; s.logoInitial=li?li.value:s.logoInitial;
      s.ctaText=ct?ct.value:s.ctaText; s.ctaUrl=cu?cu.value:s.ctaUrl;
      if(lp&&li) lp.textContent=(li.value||(s.title&&s.title[0])||'A').toUpperCase().slice(0,2);
      var sh = window.QRAIVY_EDITOR_STATE.sections.hero;
      if(sh) { sh.title=ti?ti.value:sh.title; sh.subtitle=si?si.value:sh.subtitle; sh.badge=bi?bi.value:sh.badge; sh.logoText=li?li.value:sh.logoText; sh.ctaText=ct?ct.value:sh.ctaText; sh.ctaUrl=cu?cu.value:sh.ctaUrl; }
      if(window.markDirty) window.markDirty();
    }
    if(ti) ti.addEventListener('input',onChange);
    if(si) si.addEventListener('input',onChange);
    if(bi) bi.addEventListener('input',onChange);
    if(li) li.addEventListener('input',onChange);
    if(ct) ct.addEventListener('input',onChange);
    if(cu) cu.addEventListener('input',onChange);
  }
  var saveBtn=document.getElementById('sqd-save-draft-btn');
  if(saveBtn) saveBtn.addEventListener('click',function(){
    saveDraft(); setStatus('Saved just now ✓','#22d47e');
    window.QRAIVY_EDITOR_STATE.dirty=false; updateDraftSummary();
    setTimeout(function(){setStatus('No changes');},3000);
  });
  function wirePublishBtns() {
    ['sqd-publish-btn','sqd-publish-btn-2'].forEach(function(id){
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function(){ publishPage(); });
    });
  }
  wirePublishBtns();
  window.publishPage = publishPage;

  // ── Wire Voice inputs ──────────────────────────────────────────────
  (function() {
    function sync() {
      var s = window.QRAIVY_EDITOR_STATE.sections.voice;
      var t=document.getElementById('voice-input-title');
      var d=document.getElementById('voice-input-desc');
      var b=document.getElementById('voice-input-btn');
      if(t) s.title=t.value;
      if(d) s.description=d.value;
      if(b) s.buttonLabel=b.value;
      markDirty();
    }
    ['voice-input-title','voice-input-desc','voice-input-btn'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.addEventListener('input',sync);
    });
    var tog=document.getElementById('voice-enabled-toggle');
    if(tog) tog.addEventListener('click',function(){
      var s=window.QRAIVY_EDITOR_STATE.sections.voice;
      s.enabled=!s.enabled;
      tog.textContent=s.enabled?'On':'Off';
      tog.style.background=s.enabled?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
      tog.style.color=s.enabled?'#ff5a1f':'rgba(240,244,248,0.5)';
      markDirty();
    });
    // hydrate
    var saved=window.QRAIVY_EDITOR_STATE.sections.voice;
    if(document.getElementById('voice-input-title')) document.getElementById('voice-input-title').value=saved.title||'';
    if(document.getElementById('voice-input-desc')) document.getElementById('voice-input-desc').value=saved.description||'';
    if(document.getElementById('voice-input-btn')) document.getElementById('voice-input-btn').value=saved.buttonLabel||'';
  })();

  // ── Wire AI inputs ─────────────────────────────────────────────────
  (function() {
    function sync() {
      var s = window.QRAIVY_EDITOR_STATE.sections.ai;
      var t=document.getElementById('ai-input-title');
      var d=document.getElementById('ai-input-desc');
      var p=document.getElementById('ai-input-placeholder');
      if(t) s.title=t.value;
      if(d) s.description=d.value;
      if(p) s.placeholder=p.value;
      markDirty();
    }
    ['ai-input-title','ai-input-desc','ai-input-placeholder'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.addEventListener('input',sync);
    });
    var tog=document.getElementById('ai-enabled-toggle');
    if(tog) tog.addEventListener('click',function(){
      var s=window.QRAIVY_EDITOR_STATE.sections.ai;
      s.enabled=!s.enabled;
      tog.textContent=s.enabled?'On':'Off';
      tog.style.background=s.enabled?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
      tog.style.color=s.enabled?'#ff5a1f':'rgba(240,244,248,0.5)';
      markDirty();
    });
    var saved=window.QRAIVY_EDITOR_STATE.sections.ai;
    if(document.getElementById('ai-input-title')) document.getElementById('ai-input-title').value=saved.title||'';
    if(document.getElementById('ai-input-desc')) document.getElementById('ai-input-desc').value=saved.description||'';
    if(document.getElementById('ai-input-placeholder')) document.getElementById('ai-input-placeholder').value=saved.placeholder||'';
  })();

  // ── Wire Hero enabled toggle ───────────────────────────────────────
  (function() {
    var tog = document.getElementById('hero-enabled-toggle');
    if(tog) tog.addEventListener('click', function(){
      var s = window.QRAIVY_EDITOR_STATE.sections.hero;
      s.enabled = !s.enabled;
      tog.textContent = s.enabled ? 'On' : 'Off';
      tog.style.background = s.enabled ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
      tog.style.color = s.enabled ? '#ff5a1f' : 'rgba(240,244,248,0.5)';
      markDirty();
    });
  })();

  // ── Wire Loop inputs to sections.loop ─────────────────────────────
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
  })();

  // ── Wire Footer inputs ─────────────────────────────────────────────
  (function() {
    function syncFooter() {
      var s = window.QRAIVY_EDITOR_STATE.sections.footer;
      var bn = document.getElementById('footer-input-bizname');
      var ft = document.getElementById('footer-input-text');
      var fl = document.getElementById('footer-input-link');
      if(bn) s.businessName = bn.value;
      if(ft) s.footerText = ft.value;
      if(fl) s.footerLink = fl.value;
      markDirty();
    }
    ['footer-input-bizname','footer-input-text','footer-input-link'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.addEventListener('input', syncFooter);
    });
    var tog = document.getElementById('footer-enabled-toggle');
    if(tog) tog.addEventListener('click', function(){
      var s = window.QRAIVY_EDITOR_STATE.sections.footer;
      s.enabled = !s.enabled;
      tog.textContent = s.enabled ? 'On' : 'Off';
      tog.style.background = s.enabled ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
      tog.style.color = s.enabled ? '#ff5a1f' : 'rgba(240,244,248,0.5)';
      markDirty();
    });
  })();

  // ── Section Order Panel ────────────────────────────────────────────────
  var SECTION_LABELS = { hero:'🏠 Hero', voice:'🎙 Voice', ai:'🤖 AI Chat', buttons:'🔗 Buttons', loop:'📬 Loop', footer:'🔻 Footer' };

  function renderOrderList() {
    var list = document.getElementById('sqd-order-list');
    if (!list) return;
    var order = (window.QRAIVY_EDITOR_STATE.sections.order || ['hero','voice','ai','buttons','loop','footer']).slice();
    list.innerHTML = '';
    order.forEach(function(key, idx) {
      (function(key, idx) {
      var sec = window.QRAIVY_EDITOR_STATE.sections[key] || {};
      var enabled = sec.enabled !== false;
      var locked = (key === 'hero' || key === 'voice' || key === 'ai' || key === 'footer');
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;background:' + (locked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)') + ';border:0.5px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 12px;opacity:' + (locked ? '0.6' : '1') + ';';

      // Label
      var label = document.createElement('div');
      label.style.cssText = 'flex:1;font-size:.75rem;font-weight:500;color:' + (enabled ? '#f0f4f8' : 'rgba(240,244,248,0.35)') + ';';
      label.textContent = SECTION_LABELS[key] || key;
      if (locked) { var lockSpan = document.createElement('span'); lockSpan.textContent = ' 🔒'; lockSpan.style.fontSize='.6rem'; label.appendChild(lockSpan); }
      row.appendChild(label);

      // Status badge
      var badge = document.createElement('div');
      badge.style.cssText = 'font-size:.58rem;font-weight:700;padding:2px 7px;border-radius:20px;' +
        (enabled ? 'color:#22d47e;background:rgba(34,212,126,0.1);border:0.5px solid rgba(34,212,126,0.25);' : 'color:rgba(240,244,248,0.35);background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);');
      badge.textContent = enabled ? 'On' : 'Off';
      row.appendChild(badge);

      if (!locked) {
        // Up button
        var upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.disabled = idx === 0;
        upBtn.style.cssText = 'padding:3px 8px;border-radius:5px;font-size:.7rem;cursor:pointer;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);color:' + (idx===0?'rgba(240,244,248,0.2)':'#f0f4f8') + ';';
        upBtn.addEventListener('click', (function(i){ return function() {
          var o = window.QRAIVY_EDITOR_STATE.sections.order;
          var tmp = o[i-1]; o[i-1] = o[i]; o[i] = tmp;
          window.QRAIVY_EDITOR_STATE.dirty=true; if(window.markDirty) window.markDirty(); renderOrderList(); reloadIframePreview();
        };})(idx));
        row.appendChild(upBtn);

        // Down button
        var downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.disabled = idx === order.length - 1;
        downBtn.style.cssText = 'padding:3px 8px;border-radius:5px;font-size:.7rem;cursor:pointer;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);color:' + (idx===order.length-1?'rgba(240,244,248,0.2)':'#f0f4f8') + ';';
        downBtn.addEventListener('click', (function(i){ return function() {
          var o = window.QRAIVY_EDITOR_STATE.sections.order;
          var tmp = o[i+1]; o[i+1] = o[i]; o[i] = tmp;
          window.QRAIVY_EDITOR_STATE.dirty=true; if(window.markDirty) window.markDirty(); renderOrderList(); reloadIframePreview();
        };})(idx));
        row.appendChild(downBtn);
      }

      list.appendChild(row);
      })(key, idx);
    });
  }

  function reloadIframePreview() {
    var iframe = document.getElementById('sqd-iframe');
    if (iframe && iframe.src && iframe.src !== '' && iframe.src !== window.location.href) {
      var _sl = window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.slug;
      var base = _sl ? ('lp-preview.html?slug=' + encodeURIComponent(_sl)) : iframe.src.split("?")[0];
      iframe.src = ''; setTimeout(function(){ iframe.src = base + '&preview=1'; }, 80);
    }
  }

  var _themeReloadTimer = null;
  window.injectThemePreview = function injectThemePreview() {
    if (_themeReloadTimer) clearTimeout(_themeReloadTimer);
    _themeReloadTimer = setTimeout(function() {
      var iframe = document.getElementById('sqd-iframe');
      if (!iframe || !iframe.contentWindow) return;
      var t = (window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.sections && window.QRAIVY_EDITOR_STATE.sections.theme) || {};
      var accent = t.accentColor || '#ff5a1f';
      var bg = t.background === 'light' ? '#f5f0e8' : t.background === 'gradient' ? '#0d0d14' : '#0a0a0a';
      var text = t.background === 'light' ? '#1a1209' : '#f0ece0';
      var btnR = t.buttonStyle === 'pill' ? '999px' : t.buttonStyle === 'square' ? '4px' : '12px';
      var font = t.fontStyle === 'elegant' ? 'Georgia,serif' : t.fontStyle === 'bold' ? 'Syne,sans-serif' : 'DM Mono,monospace';
      var css = 'body{background:' + bg + '!important;color:' + text + '!important;font-family:' + font + '!important}'
        + '.lp-btn{border-radius:' + btnR + '!important}'
        + '.lp-btn-primary,.lp-sub-btn,.lp-voice-btn,.lp-nav-dot{background:' + accent + '!important}'
        + '.lp-hero-eyebrow,.lp-nav-pill{color:' + accent + '!important}';
      iframe.contentWindow.postMessage({ type: 'QRAIVY_THEME_CSS', css: css }, '*');
    }, 100);
  }

  // Re-render order list when tab is clicked
  ;(function() {
    var orderTab = document.querySelector('[data-tab="order"]');
    if (orderTab) orderTab.addEventListener('click', function(){ setTimeout(renderOrderList, 50); });
    // Also re-render when enabled toggles change
    ['voice-enabled-toggle','ai-enabled-toggle','loop-enabled-toggle','footer-enabled-toggle'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function(){ setTimeout(renderOrderList, 100); });
    });
    // Initial render
    setTimeout(renderOrderList, 200);
  })();

  // ── Wire Theme Controls ────────────────────────────────────────────────
  ;(function() {
    var th = window.QRAIVY_EDITOR_STATE.sections.theme;

    function setActive(groupId, val) {
      var grp = document.getElementById(groupId);
      if (!grp) return;
      grp.querySelectorAll('button').forEach(function(b) {
        var active = b.getAttribute('data-val') === val;
        b.style.borderColor = active ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.1)';
        b.style.background  = active ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
        b.style.color       = active ? '#ff5a1f' : 'rgba(240,244,248,0.6)';
      });
    }

    function wireGroup(groupId, key) {
      var grp = document.getElementById(groupId);
      if (!grp) return;
      grp.querySelectorAll('button').forEach(function(b) {
        b.addEventListener('click', function() {
          window.QRAIVY_EDITOR_STATE.sections.theme[key] = b.getAttribute('data-val');
          setActive(groupId, b.getAttribute('data-val'));
          if(window.markDirty) window.markDirty(); else window.QRAIVY_EDITOR_STATE.dirty = true;
          setTimeout(function(){ if(window.injectThemePreview) window.injectThemePreview(); }, 100);
        });
      });
    }

    wireGroup('theme-bg-btns',   'background');
    wireGroup('theme-btn-btns',  'buttonStyle');
    wireGroup('theme-font-btns', 'fontStyle');
    // Also trigger draft preview rerender on theme change
    ['theme-bg-btns','theme-btn-btns','theme-font-btns'].forEach(function(gid){
      var g = document.getElementById(gid);
      if(g) g.addEventListener('click', function(){
        setTimeout(function(){ if(window.markDirty) window.markDirty(); }, 50);
      });
    });
    wireGroup('theme-logo-btns', 'logoMode');

    // Accent color picker
    var picker = document.getElementById('theme-accent-picker');
    var hexInput = document.getElementById('theme-accent-hex');
    var preview = document.getElementById('sqd-color-preview');
    function applyAccent(val) {
      window.QRAIVY_EDITOR_STATE.sections.theme.accentColor = val;
      window.QRAIVY_EDITOR_STATE.brandColor = val;
      if (picker) picker.value = val;
      if (hexInput) hexInput.value = val;
      if (preview) preview.style.background = val;
      if(window.markDirty) window.markDirty(); else window.QRAIVY_EDITOR_STATE.dirty = true;
      setTimeout(injectThemePreview, 50);
      if(window.markDirty) window.markDirty();
    }
    if (picker) picker.addEventListener('input', function(){ applyAccent(this.value); });
    if (hexInput) hexInput.addEventListener('change', function(){
      var v = this.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) applyAccent(v);
    });

    // Hydrate from state
    setTimeout(function() {
      var t = window.QRAIVY_EDITOR_STATE.sections.theme;
      if (!t) return;
      setActive('theme-bg-btns',   t.background   || 'dark');
      setActive('theme-btn-btns',  t.buttonStyle  || 'rounded');
      setActive('theme-font-btns', t.fontStyle    || 'modern');
      setActive('theme-logo-btns', t.logoMode     || 'initials');
      if (t.accentColor) {
        if (picker) picker.value = t.accentColor;
        if (hexInput) hexInput.value = t.accentColor;
        if (preview) preview.style.background = t.accentColor;
      }
    }, 300);
  })();

  window.addEventListener('beforeunload', function(e) {
    if (window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.dirty) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Leave anyway?';
      return e.returnValue;
    }
  });
  window.QRAIVY_HERO_EDITOR = {
    init: function(pending) {
      var slug=pending.slug||'demo';
      window.QRAIVY_EDITOR_STATE.slug=slug;
      window.QRAIVY_EDITOR_STATE.pageName=pending.businessName||'';
      var draft=loadDraft(slug);
      if (draft && draft.sections && Array.isArray(draft.sections.order)) {
        window.QRAIVY_EDITOR_STATE.sections.order = draft.sections.order;
      }
      if (draft && draft.sections && draft.sections.theme) {
        window.QRAIVY_EDITOR_STATE.sections.theme = Object.assign({}, window.QRAIVY_EDITOR_STATE.sections.theme, draft.sections.theme);
        if (draft.sections.theme.accentColor) window.QRAIVY_EDITOR_STATE.brandColor = draft.sections.theme.accentColor;
      }
      var hero=(draft&&draft.hero)?draft.hero:{
        title: pending.businessName?'Welcome to '+pending.businessName:'',
        subtitle:'', badgeText:'Qraivy Smart Page',
        logoInitial: pending.businessName?pending.businessName[0].toUpperCase():'A'
      };
      window.QRAIVY_EDITOR_STATE.hero=hero;
      hydrateFields(hero); wireHeroFields();
      if(draft&&draft.dirty){ window.QRAIVY_EDITOR_STATE.dirty=true; updateDraftSummary(); setStatus('Draft loaded','#22d47e'); setTimeout(function(){setStatus('No changes');},2500); }
    }
  };
})();


// ── BUTTONS EDITOR (Step 12) ───────────────────────────────────────────────
;(function() {
  var DEFAULT_BUTTONS = {
    restaurant:     [{id:'b1',label:'Reserve a Table',url:'',active:true,style:'primary'},{id:'b2',label:'View Menu',url:'',active:true,style:'secondary'}],
    event:          [{id:'b1',label:'Get Tickets',url:'',active:true,style:'primary'},{id:'b2',label:'View Lineup',url:'',active:true,style:'secondary'}],
    creator:        [{id:'b1',label:'Follow on Instagram',url:'',active:true,style:'primary'},{id:'b2',label:'Watch Latest Video',url:'',active:true,style:'secondary'}],
    ecommerce:      [{id:'b1',label:'Shop Now',url:'',active:true,style:'primary'},{id:'b2',label:'View Offer',url:'',active:true,style:'secondary'}],
    fitness:        [{id:'b1',label:'Start Training',url:'',active:true,style:'primary'},{id:'b2',label:'Book a Session',url:'',active:true,style:'secondary'}],
    artist_music:   [{id:'b1',label:'Listen Now',url:'',active:true,style:'primary'},{id:'b2',label:'Tour Dates',url:'',active:true,style:'secondary'}],
    local_business: [{id:'b1',label:'Book Now',url:'',active:true,style:'primary'},{id:'b2',label:'Visit Website',url:'',active:true,style:'secondary'}],
    other:          [{id:'b1',label:'Visit Website',url:'',active:true,style:'primary'},{id:'b2',label:'Learn More',url:'',active:true,style:'secondary'}]
  };

  function setStatus(msg, color) {
    var el = document.getElementById('btn-save-status');
    if (el) { el.textContent = msg; el.style.color = color || 'rgba(240,244,248,0.50)'; }
  }

  function makeid() { return 'b' + Math.random().toString(36).slice(2,7); }

  // ── QRAIVY BUTTONS EDITOR v2 — Step 15 (Linktree-style) ──────────────────
;(function() {

  // ── Status ──────────────────────────────────────────────────────────────
  function setStatus(msg, color) {
    var el = document.getElementById('btn-save-status');
    if (el) { el.textContent = msg; el.style.color = color || 'rgba(240,244,248,0.45)'; }
    var gs = document.getElementById('sqd-save-global-status');
    if (gs) { gs.textContent = msg; gs.style.color = color || 'rgba(240,244,248,0.45)'; }
  }

  window.markDirty = function markDirty() {
    window.QRAIVY_EDITOR_STATE.dirty = true;
    setStatus('Unsaved changes', 'rgba(255,90,31,0.9)');
    schedulePreviewRerender();
  }

  // ── STEP 25: Wire all section inputs to EDITOR_STATE + live preview ────────
  ;(function() {
    function wire(id, stateWriter) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function() {
        stateWriter(this.value);
        if (window.markDirty) window.markDirty();
      });
    }

    function hydrate(id, val) {
      var el = document.getElementById(id);
      if (el && val) el.value = val;
    }

    function initStep25() {
      var S = window.QRAIVY_EDITOR_STATE;
      if (!S) return;
      var sec = S.sections || {};

      // ── Hero ──
      wire('hero-title-input', function(v) {
        S.sections.hero.title = v; S.hero.title = v; S.pageName = v;
      });
      wire('hero-subtitle-input', function(v) {
        S.sections.hero.subtitle = v; S.hero.subtitle = v;
      });
      wire('hero-badge-input', function(v) {
        S.sections.hero.badge = v; S.hero.badgeText = v;
      });
      wire('hero-logo-input', function(v) {
        S.sections.hero.logoText = v; S.hero.logoInitial = v;
        var lp = document.getElementById('hero-logo-preview');
        if (lp) lp.textContent = (v||'A').toUpperCase().slice(0,2);
      });
      wire('hero-cta-text-input', function(v) { if(S.sections&&S.sections.hero) S.sections.hero.ctaText=v; if(S.hero) S.hero.ctaText=v; });
      wire('hero-cta-url-input',  function(v) { if(S.sections&&S.sections.hero) S.sections.hero.ctaUrl=v;  if(S.hero) S.hero.ctaUrl=v; });

      // ── Voice ──
      wire('voice-input-title', function(v) { S.sections.voice.title = v; });
      wire('voice-input-desc',  function(v) { S.sections.voice.description = v; });
      wire('voice-input-btn',   function(v) { S.sections.voice.buttonLabel = v; });
      var langEl=document.getElementById('voice-input-language'); if(langEl){langEl.addEventListener('change',function(){S.sections.voice.voiceLanguage=this.value;if(window.markDirty)window.markDirty();});}
      var keyEl=document.getElementById('voice-input-key'); if(keyEl){keyEl.addEventListener('change',function(){S.sections.voice.voiceKey=this.value;if(window.markDirty)window.markDirty();});}
      // ── Loop ──
      wire('loop-input-title',            function(v) { S.sections.loop.title = v; });
      wire('loop-input-desc',             function(v) { S.sections.loop.description = v; });
      wire('loop-input-email-placeholder',function(v) { S.sections.loop.emailPlaceholder = v; });
      wire('loop-input-btn-label',        function(v) { S.sections.loop.buttonLabel = v; });

      // ── Footer ──
      wire('footer-input-bizname', function(v) { S.sections.footer.businessName = v; });
      wire('footer-input-text',    function(v) { S.sections.footer.footerText = v; });
      wire('footer-input-link',    function(v) { S.sections.footer.footerLink = v; });

      // ── AI ──
      wire('ai-input-title',       function(v) { S.sections.ai.title = v; });
      wire('ai-input-placeholder', function(v) { S.sections.ai.placeholder = v; });

      // ── Hydrate all inputs from state ──
      var h = sec.hero || {};
      hydrate('hero-title-input',    (h.title || (S.hero && S.hero.title) || '').replace(/\s+[a-z0-9]{3,5}$/, '').trim());
      hydrate('hero-title-input',    (h.title || (S.hero && S.hero.title) || '').replace(/\s+[a-z0-9]{3}$/, '').trim());
      var _cleanTitle = document.getElementById('hero-title-input').value;
      if (sec.hero) sec.hero.title = _cleanTitle;
      if (S.sections && S.sections.hero) S.sections.hero.title = _cleanTitle;
      var _cleanTitle = document.getElementById('hero-title-input').value;
      if (sec.hero) sec.hero.title = _cleanTitle;
      if (S.sections && S.sections.hero) S.sections.hero.title = _cleanTitle;
      hydrate('hero-badge-input',    h.badge || S.hero && S.hero.badgeText || '');
      hydrate('hero-logo-input',     h.logoText || S.hero && S.hero.logoInitial || '');
      hydrate('hero-cta-text-input', h.ctaText!==undefined ? h.ctaText : (S.hero&&S.hero.ctaText!==undefined ? S.hero.ctaText : 'Start a Conversation →'));
      hydrate('hero-cta-url-input',  h.ctaUrl || (S.hero&&S.hero.ctaUrl) || '');

      var v = sec.voice || {};
      hydrate('voice-input-title', v.title || '');
      hydrate('voice-input-desc',  v.description || '');
      hydrate('voice-input-btn',   v.buttonLabel || '');
      if(document.getElementById('voice-input-key')) document.getElementById('voice-input-key').value = v.voiceKey || 'sarah';
      if(document.getElementById('voice-input-language')) document.getElementById('voice-input-language').value = v.voiceLanguage || 'en';
      hydrate('loop-input-title',             l.title || '');
      hydrate('loop-input-desc',              l.description || '');
      hydrate('loop-input-email-placeholder', l.emailPlaceholder || '');
      hydrate('loop-input-btn-label',         l.buttonLabel || '');
      hydrate('loop-input-wallet-title',       l.walletTitle || '');
      hydrate('loop-input-wallet-subtitle',    l.walletSubtitle || '');

      var f = sec.footer || {};
      hydrate('info-input-address', (S.sections.info||{}).address||'');
      hydrate('info-input-phone',   (S.sections.info||{}).phone||'');
      hydrate('info-input-website',  (S.sections.info||{}).website||'');
      hydrate('info-input-hours',    (S.sections.info||{}).hours||'');
      hydrate('info-input-email',    (S.sections.info||{}).email||'');
      hydrate('footer-input-bizname', f.businessName || '');
      hydrate('footer-input-text',    f.footerText || '');
      // Settings toggles hydration
      (function(){
        var ss=(S.sections.settings&&typeof S.sections.settings==='object')?S.sections.settings:{};
        var _d={pageActive:true,voiceEnabled:true,aiEnabled:true,subscribersEnabled:true,walletEnabled:true,brandingEnabled:true,analyticsEnabled:true};
        var _ids={pageActive:'settings-pageActive-toggle',voiceEnabled:'settings-voice-toggle',aiEnabled:'settings-ai-toggle',subscribersEnabled:'settings-subscribers-toggle',walletEnabled:'settings-wallet-toggle',brandingEnabled:'settings-branding-toggle',analyticsEnabled:'settings-analytics-toggle'};
        Object.keys(_ids).forEach(function(f){
          var btn=document.getElementById(_ids[f]); if(!btn) return;
          var on=(ss[f]!==undefined?ss[f]:_d[f])!==false;
          btn.textContent=on?'On':'Off';
          btn.style.background=on?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
          btn.style.color=on?'#ff5a1f':'rgba(240,244,248,0.5)';
          btn.style.border=on?'0.5px solid rgba(255,90,31,0.4)':'0.5px solid rgba(255,255,255,0.15)';
        });
      })();
      hydrate('footer-input-link',    f.footerLink || '');

      var lp = document.getElementById('hero-logo-preview');
      var li = document.getElementById('hero-logo-input');
      if (lp && li && li.value) lp.textContent = li.value.toUpperCase().slice(0,2);
    }

    // Run after initPage hydrates state
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initStep25, 600);
    });

    window.QRAIVY_STEP25_REINIT = initStep25;
  })();

  function schedulePreviewRerender() {
    clearTimeout(window._btnPreviewTimer);
    window._btnPreviewTimer = setTimeout(function() {
      if (window.QRAIVY_PREVIEW && window.QRAIVY_PREVIEW.getMode() === 'draft') {
        window.QRAIVY_PREVIEW.render();
      }
    }, 60);
  }

  // ── Track open card ────────────────────────────────────────────────────
  var openCardId = null;

  // ── Render button list ─────────────────────────────────────────────────
  function renderButtons() {
    var list = document.getElementById('btn-list');
    if (!list) return;
    var btns = window.QRAIVY_EDITOR_STATE.buttons || [];
    list.innerHTML = '';

    btns.forEach(function(btn, idx) {
      var isOpen = (openCardId === btn.id || (btns.length === 1));
      var card = document.createElement('div');
      card.setAttribute('data-btn-id', btn.id);
      card.style.cssText = 'background:rgba(255,255,255,0.04);border:0.5px solid ' +
        (btn.active ? 'rgba(255,90,31,0.25)' : 'rgba(255,255,255,0.08)') +
        ';border-radius:10px;overflow:hidden;transition:border-color .15s;';

      // ── Card header (always visible) ──
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;';

      // Drag handle placeholder
      var drag = document.createElement('div');
      drag.style.cssText = 'color:rgba(240,244,248,0.25);font-size:.7rem;flex-shrink:0;user-select:none;';
      drag.textContent = '⠿';
      header.appendChild(drag);

      // Label preview
      var labelPreview = document.createElement('div');
      labelPreview.style.cssText = 'flex:1;font-size:.75rem;font-weight:500;color:' +
        (btn.active ? '#f0f4f8' : 'rgba(240,244,248,0.4)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      labelPreview.textContent = btn.label || 'Untitled button';
      header.appendChild(labelPreview);

      // Active toggle
      var toggle = document.createElement('button');
      toggle.style.cssText = 'padding:3px 8px;border-radius:20px;font-size:.6rem;font-weight:600;cursor:pointer;flex-shrink:0;border:0.5px solid;transition:all .15s;';
      if (btn.active) {
        toggle.style.background = 'rgba(34,212,126,0.12)';
        toggle.style.borderColor = 'rgba(34,212,126,0.3)';
        toggle.style.color = '#22d47e';
        toggle.textContent = 'On';
      } else {
        toggle.style.background = 'rgba(255,255,255,0.04)';
        toggle.style.borderColor = 'rgba(255,255,255,0.1)';
        toggle.style.color = 'rgba(240,244,248,0.4)';
        toggle.textContent = 'Off';
      }
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        window.QRAIVY_EDITOR_STATE.buttons[idx].active = !window.QRAIVY_EDITOR_STATE.buttons[idx].active;
        markDirty(); renderButtons();
      });
      header.appendChild(toggle);

      // Chevron
      var chevron = document.createElement('div');
      chevron.style.cssText = 'color:rgba(240,244,248,0.3);font-size:.65rem;flex-shrink:0;transition:transform .15s;';
      chevron.textContent = isOpen ? '▲' : '▼';
      header.appendChild(chevron);

      header.addEventListener('click', function() {
        openCardId = isOpen ? null : btn.id;
        renderButtons();
      });
      card.appendChild(header);

      // ── Expanded body ──
      if (isOpen) {
        var body = document.createElement('div');
        body.style.cssText = 'padding:0 12px 12px;display:flex;flex-direction:column;gap:8px;border-top:0.5px solid rgba(255,255,255,0.06);';

        // Label field
        var labelWrap = document.createElement('div');
        var labelLbl = document.createElement('label');
        labelLbl.style.cssText = 'display:block;font-size:.58rem;color:rgba(240,244,248,0.6);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;margin-top:10px;';
        labelLbl.textContent = 'Label';
        var labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = btn.label || '';
        labelInput.placeholder = 'Button label';
        labelInput.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:7px;padding:8px 10px;font-size:.78rem;color:#f0f4f8;outline:none;';
        labelInput.addEventListener('focus', function(){ this.style.borderColor='rgba(255,90,31,0.5)'; });
        labelInput.addEventListener('blur', function(){ this.style.borderColor='rgba(255,255,255,0.12)'; });
        labelInput.addEventListener('input', function() {
          window.QRAIVY_EDITOR_STATE.buttons[idx].label = this.value;
          // Update preview without full re-render
          var lp = card.querySelector('[data-label-preview]');
          if (lp) lp.textContent = this.value || 'Untitled button';
          markDirty();
        });
        labelWrap.appendChild(labelLbl);
        labelWrap.appendChild(labelInput);
        body.appendChild(labelWrap);

        // URL field
        var urlWrap = document.createElement('div');
        var urlLbl = document.createElement('label');
        urlLbl.style.cssText = 'display:block;font-size:.58rem;color:rgba(240,244,248,0.6);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;';
        urlLbl.textContent = 'URL';
        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = btn.url || '';
        urlInput.placeholder = 'https://';
        urlInput.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:7px;padding:8px 10px;font-size:.75rem;color:#f0f4f8;outline:none;';
        urlInput.addEventListener('focus', function(){ this.style.borderColor='rgba(255,90,31,0.5)'; });
        urlInput.addEventListener('blur', function(){ this.style.borderColor='rgba(255,255,255,0.12)'; });
        urlInput.addEventListener('input', function() {
          window.QRAIVY_EDITOR_STATE.buttons[idx].url = this.value;
          markDirty();
        });
        urlWrap.appendChild(urlLbl);
        urlWrap.appendChild(urlInput);
        body.appendChild(urlWrap);

        // Style selector
        var styleWrap = document.createElement('div');
        styleWrap.style.cssText = 'display:flex;gap:6px;';
        ['primary','secondary'].forEach(function(s) {
          var sb = document.createElement('button');
          var isActive = btn.style === s;
          sb.style.cssText = 'flex:1;padding:5px;border-radius:6px;font-size:.62rem;cursor:pointer;border:0.5px solid ' +
            (isActive ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.08)') +
            ';background:' + (isActive ? 'rgba(255,90,31,0.1)' : 'rgba(255,255,255,0.03)') +
            ';color:' + (isActive ? '#ff5a1f' : 'rgba(240,244,248,0.55)') + ';';
          sb.textContent = s.charAt(0).toUpperCase() + s.slice(1);
          sb.addEventListener('click', function() {
            window.QRAIVY_EDITOR_STATE.buttons[idx].style = s;
            markDirty(); renderButtons();
          });
          styleWrap.appendChild(sb);
        });
        body.appendChild(styleWrap);

        // Actions row
        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:6px;margin-top:2px;';

        function makeAction(label, color, fn) {
          var b = document.createElement('button');
          b.textContent = label;
          b.style.cssText = 'flex:1;padding:5px 4px;border-radius:6px;font-size:.6rem;cursor:pointer;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);color:' + (color||'rgba(240,244,248,0.6)') + ';';
          b.addEventListener('click', fn);
          return b;
        }

        // Duplicate
        actions.appendChild(makeAction('⧉ Copy', null, function() {
          var copy = JSON.parse(JSON.stringify(window.QRAIVY_EDITOR_STATE.buttons[idx]));
          copy.id = 'b' + Math.random().toString(36).slice(2,7);
          copy.label = copy.label + ' (copy)';
          window.QRAIVY_EDITOR_STATE.buttons.splice(idx+1, 0, copy);
          openCardId = copy.id;
          markDirty(); renderButtons();
        }));

        // Move up
        actions.appendChild(makeAction('↑ Up', null, function() {
          if (idx === 0) return;
          var arr = window.QRAIVY_EDITOR_STATE.buttons;
          var tmp = arr[idx-1]; arr[idx-1] = arr[idx]; arr[idx] = tmp;
          markDirty(); renderButtons();
        }));

        // Move down
        actions.appendChild(makeAction('↓ Down', null, function() {
          var arr = window.QRAIVY_EDITOR_STATE.buttons;
          if (idx === arr.length-1) return;
          var tmp = arr[idx+1]; arr[idx+1] = arr[idx]; arr[idx] = tmp;
          markDirty(); renderButtons();
        }));

        // Delete
        actions.appendChild(makeAction('✕ Delete', 'rgba(255,80,80,0.7)', function() {
          window.QRAIVY_EDITOR_STATE.buttons.splice(idx, 1);
          if (openCardId === btn.id) openCardId = null;
          markDirty(); renderButtons();
        }));

        body.appendChild(actions);
        card.appendChild(body);
      }

      list.appendChild(card);
    });

    // Wire Add Button
    var addBtn = document.getElementById('btn-add');
    if (addBtn) {
      // Remove old listeners by cloning
      var newAdd = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAdd, addBtn);
      newAdd.addEventListener('click', function() {
        var newBtn = { id: 'b' + Math.random().toString(36).slice(2,7), label: 'New Button', url: '', active: true, style: 'primary' };
        window.QRAIVY_EDITOR_STATE.buttons.push(newBtn);
        openCardId = newBtn.id;
        markDirty(); renderButtons();
      });
    }
  }

  window.renderButtonsFn = renderButtons;

;(function() {
  var ICON_OPTS = [
    ['globe','🌐','Globe'],['phone','📞','Phone'],['email','📧','Email'],
    ['location','📍','Location'],['booking','📅','Booking'],['shop','🛒','Shop'],
    ['instagram','📸','Instagram'],['tiktok','🎵','TikTok'],['facebook','📘','Facebook'],
    ['youtube','▶','YouTube'],['custom','🔗','Custom']
  ];
  var ICON_MAP = {};
  ICON_OPTS.forEach(function(o){ ICON_MAP[o[0]]=o[1]; });
  function getIcon(k){ return ICON_MAP[k]||'🔗'; }
  function getDomain(u){ return u ? u.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0] : ''; }
  function getBtns(){ return (window.QRAIVY_EDITOR_STATE&&window.QRAIVY_EDITOR_STATE.buttons)||[]; }
  function findBtn(id){ return getBtns().find(function(b){ return b.id===id; }); }

  var _listening = false;

  function renderButtons() {
    var list = document.getElementById('btn-list');
    if (!list) return;
    list.innerHTML = '';
    var buttons = getBtns();

    if (!buttons.length) {
      list.innerHTML = '<div style="text-align:center;padding:24px;font-size:.72rem;color:rgba(240,244,248,0.32);">No buttons yet — click + Add Button.</div>';
    } else {
      var BL = 'display:block;font-size:.56rem;color:rgba(240,244,248,0.48);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;';
      var BI = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;padding:7px 10px;font-size:.75rem;color:#f0f4f8;outline:none;';
      var BB = 'flex:1;padding:5px 0;border-radius:6px;font-size:.62rem;cursor:pointer;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(240,244,248,0.6);';
      var BD = 'flex:1;padding:5px 0;border-radius:6px;font-size:.62rem;cursor:not-allowed;border:0.5px solid rgba(255,255,255,0.04);background:transparent;color:rgba(240,244,248,0.18);';
      buttons.forEach(function(b, idx) {
        var on = b.enabled!==false&&b.active!==false;
        var title = b.title||b.label||'';
        var icon = b.icon||'globe';
        var url = b.url||'';
        var card = document.createElement('div');
        card.id = 'bcard_'+b.id;
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,'+(on?'0.12':'0.05')+');border-radius:10px;padding:12px;opacity:'+(on?'1':'0.5')+';';
        var h='';
        h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
        h+='<span style="color:rgba(240,244,248,0.2);font-size:.75rem;letter-spacing:2px;user-select:none;cursor:default;">⋮⋮</span>';
        h+='<span style="flex:1;font-size:.78rem;font-weight:700;color:#f0f4f8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+getIcon(icon)+' '+(title||'—')+'</span>';
        h+='<button data-toggle="'+b.id+'" style="padding:3px 9px;border-radius:20px;font-size:.58rem;font-weight:700;cursor:pointer;border:0.5px solid '+(on?'rgba(255,90,31,0.5)':'rgba(255,255,255,0.12)')+';background:'+(on?'rgba(255,90,31,0.15)':'transparent')+';color:'+(on?'#ff5a1f':'rgba(240,244,248,0.35)')+'">'+(on?'On':'Off')+'</button>';
        h+='<button data-del="'+b.id+'" style="padding:3px 8px;border-radius:6px;font-size:.68rem;cursor:pointer;border:0.5px solid rgba(255,80,80,0.2);background:rgba(255,80,80,0.06);color:rgba(255,110,110,0.65);" title="Delete">🗑</button>';
        h+='</div>';
        h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
        h+='<label style="'+BL+'white-space:nowrap;margin-bottom:0;">Icon</label>';
        h+='<select data-icon="'+b.id+'" style="flex:1;background:#1e1e2e;border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;padding:5px 8px;font-size:.72rem;color:#f0f4f8;outline:none;">';
        ICON_OPTS.forEach(function(o){ h+='<option value="'+o[0]+'" style="background:#1e1e2e;color:#e8e8f0;"'+(o[0]===icon?' selected':'')+'>'+o[1]+' '+o[2]+'</option>'; });
        h+='</select></div>';
        h+='<div style="margin-bottom:8px;"><label style="'+BL+'">Button Title</label>';
        h+='<input data-title="'+b.id+'" type="text" value="'+title.replace(/"/g,'&quot;')+'" placeholder="e.g. Visit Website" style="'+BI+'" onfocus="this.style.borderColor=\'rgba(255,90,31,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'"/></div>';
        h+='<div style="margin-bottom:10px;"><label style="'+BL+'">URL</label>';
        h+='<input data-url="'+b.id+'" type="text" value="'+url.replace(/"/g,'&quot;')+'" placeholder="https://..." style="'+BI+'font-family:\'DM Mono\',monospace;" onfocus="this.style.borderColor=\'rgba(255,90,31,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'"/></div>';
        h+='<div style="display:flex;gap:6px;">';
        h+='<button data-up="'+b.id+'" style="'+(idx===0?BD:BB)+'"'+(idx===0?' disabled':'')+'>↑ Up</button>';
        h+='<button data-dn="'+b.id+'" style="'+(idx===buttons.length-1?BD:BB)+'"'+(idx===buttons.length-1?' disabled':'')+'>↓ Down</button>';
        h+='</div>';
        card.innerHTML=h;
        list.appendChild(card);
      });
    }

    if (!_listening) {
      _listening = true;
      list.addEventListener('input', function(e) {
        var t=e.target, b;
        if (t.dataset.title){ b=findBtn(t.dataset.title); if(b){b.title=t.value;b.label=t.value;} if(window.markDirty)window.markDirty(); }
        if (t.dataset.url)  { b=findBtn(t.dataset.url);   if(b){b.url=t.value;}   if(window.markDirty)window.markDirty(); }
      });
      list.addEventListener('change', function(e) {
        var t=e.target, b;
        if (t.dataset.icon){ b=findBtn(t.dataset.icon); if(b){b.icon=t.value; if(window.markDirty)window.markDirty(); renderButtons();} }
      });
      list.addEventListener('click', function(e) {
        var t=e.target;
        var arr=window.QRAIVY_EDITOR_STATE.buttons;
        if (t.dataset.toggle){ var b2=findBtn(t.dataset.toggle); if(b2){var was=b2.enabled!==false&&b2.active!==false;b2.enabled=!was;b2.active=!was;if(window.markDirty)window.markDirty();renderButtons();} }
        if (t.dataset.del)   { var i=arr.findIndex(function(x){return x.id===t.dataset.del;}); if(i!==-1){arr.splice(i,1);if(window.markDirty)window.markDirty();renderButtons();} }
        if (t.dataset.up)    { var i2=arr.findIndex(function(x){return x.id===t.dataset.up;}); if(i2>0){var tmp=arr[i2];arr[i2]=arr[i2-1];arr[i2-1]=tmp;if(window.markDirty)window.markDirty();renderButtons();} }
        if (t.dataset.dn)    { var i3=arr.findIndex(function(x){return x.id===t.dataset.dn;}); if(i3<arr.length-1){var tmp2=arr[i3];arr[i3]=arr[i3+1];arr[i3+1]=tmp2;if(window.markDirty)window.markDirty();renderButtons();} }
      });
    }

    var addBtn=document.getElementById('btn-add');
    if (addBtn){
      var fresh=addBtn.cloneNode(true); addBtn.parentNode.replaceChild(fresh,addBtn);
      fresh.addEventListener('click',function(){
        var nb={id:'b'+Math.random().toString(36).slice(2,7),icon:'globe',title:'New Button',label:'New Button',url:'',enabled:true,active:true,style:'primary'};
        window.QRAIVY_EDITOR_STATE.buttons.push(nb);
        if(window.markDirty)window.markDirty(); renderButtons();
        setTimeout(function(){ var inp=document.querySelector('[data-title="'+nb.id+'"]'); if(inp){inp.focus();inp.select();} },60);
      });
    }
  }

  window.renderButtonsFn = renderButtons;
  window._ICON_MAP_BTN = ICON_MAP;

})();

;(function() {
  var FEAT_ICONS = ['✨','💳','🔔','📍','📞','🌐','⭐','❤️','🎯','🤖'];
  var FEAT_DEFAULTS = [
    { icon:'✨', title:'AI Concierge',  description:'Customers get instant answers.',    enabled:true },
    { icon:'💳', title:'Digital Wallet', description:'One-tap membership and rewards.',   enabled:true },
    { icon:'🔔', title:'Smart Updates',  description:'Reconnect after every scan.',       enabled:true }
  ];

  function getFeats() {
    var S = window.QRAIVY_EDITOR_STATE;
    if (!S || !S.sections) return [];
    if (!Array.isArray(S.sections.featured)) {
      S.sections.featured = JSON.parse(JSON.stringify(FEAT_DEFAULTS));
    }
    return S.sections.featured;
  }

  var _fl = false;

  function renderFeatured() {
    var list = document.getElementById('feat-list');
    if (!list) return;
    var feats = getFeats();
    list.innerHTML = '';

    if (!feats.length) {
      list.innerHTML = '<div style="text-align:center;padding:24px;font-size:.72rem;color:rgba(240,244,248,0.32);">No features yet — click + Add Feature.</div>';
    } else {
      var BL = 'display:block;font-size:.56rem;color:rgba(240,244,248,0.48);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;';
      var BI = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;padding:7px 10px;font-size:.75rem;color:#f0f4f8;outline:none;';
      var BTA = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;padding:7px 10px;font-size:.72rem;color:#f0f4f8;outline:none;resize:vertical;font-family:inherit;line-height:1.5;';
      var BB = 'flex:1;padding:5px 0;border-radius:6px;font-size:.62rem;cursor:pointer;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(240,244,248,0.6);';
      var BD = 'flex:1;padding:5px 0;border-radius:6px;font-size:.62rem;cursor:not-allowed;border:0.5px solid rgba(255,255,255,0.04);background:transparent;color:rgba(240,244,248,0.18);';

      feats.forEach(function(f, idx) {
        var on = f.enabled !== false;
        var card = document.createElement('div');
        card.dataset.idx = idx;
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,'+(on?'0.12':'0.05')+');border-radius:10px;padding:12px;opacity:'+(on?'1':'0.5')+';';

        var h = '';
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
        h += '<span style="color:rgba(240,244,248,0.2);font-size:.75rem;letter-spacing:2px;user-select:none;">⋮⋮</span>';
        h += '<span style="flex:1;font-size:.78rem;font-weight:700;color:#f0f4f8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(f.icon||'✨')+' '+(f.title||'Feature')+'</span>';
        h += '<button data-ftoggle="'+idx+'" style="padding:3px 9px;border-radius:20px;font-size:.58rem;font-weight:700;cursor:pointer;border:0.5px solid '+(on?'rgba(255,90,31,0.5)':'rgba(255,255,255,0.12)')+';background:'+(on?'rgba(255,90,31,0.15)':'transparent')+';color:'+(on?'#ff5a1f':'rgba(240,244,248,0.35)')+'">'+(on?'On':'Off')+'</button>';
        h += '<button data-fdel="'+idx+'" style="padding:3px 8px;border-radius:6px;font-size:.68rem;cursor:pointer;border:0.5px solid rgba(255,80,80,0.2);background:rgba(255,80,80,0.06);color:rgba(255,110,110,0.65);" title="Delete">🗑</button>';
        h += '</div>';

        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
        h += '<label style="'+BL+'white-space:nowrap;margin-bottom:0;">Icon</label>';
        h += '<select data-ficon="'+idx+'" style="flex:1;background:#1e1e2e;border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;padding:5px 8px;font-size:.9rem;color:#f0f4f8;outline:none;">';
        FEAT_ICONS.forEach(function(ic){ h += '<option value="'+ic+'" style="background:#1e1e2e;color:#e8e8f0;"'+(ic===f.icon?' selected':'')+'>'+ic+'</option>'; });
        h += '</select></div>';

        h += '<div style="margin-bottom:8px;"><label style="'+BL+'">Title</label>';
        h += '<input data-ftitle="'+idx+'" type="text" value="'+(f.title||'').replace(/"/g,'&quot;')+'" placeholder="e.g. AI Concierge" style="'+BI+'" onfocus="this.style.borderColor=\'rgba(255,90,31,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'"/></div>';

        h += '<div style="margin-bottom:10px;"><label style="'+BL+'">Description</label>';
        h += '<textarea data-fdesc="'+idx+'" rows="2" placeholder="e.g. Customers get instant answers." style="'+BTA+'" onfocus="this.style.borderColor=\'rgba(255,90,31,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">'+(f.description||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</textarea></div>';

        h += '<div style="display:flex;gap:6px;">';
        h += '<button data-fup="'+idx+'" style="'+(idx===0?BD:BB)+'"'+(idx===0?' disabled':'')+'>↑ Up</button>';
        h += '<button data-fdn="'+idx+'" style="'+(idx===feats.length-1?BD:BB)+'"'+(idx===feats.length-1?' disabled':'')+'>↓ Down</button>';
        h += '</div>';

        card.innerHTML = h;
        list.appendChild(card);
      });
    }

    if (!_fl) {
      _fl = true;
      list.addEventListener('input', function(e) {
        var t=e.target, fa=getFeats();
        if (t.dataset.ftitle!==undefined){ var f2=fa[+t.dataset.ftitle]; if(f2){f2.title=t.value;} if(window.markDirty)window.markDirty(); }
        if (t.dataset.fdesc!==undefined){  var f3=fa[+t.dataset.fdesc];  if(f3){f3.description=t.value;} if(window.markDirty)window.markDirty(); }
      });
      list.addEventListener('change', function(e) {
        var t=e.target, fa=getFeats();
        if (t.dataset.ficon!==undefined){ var f4=fa[+t.dataset.ficon]; if(f4){f4.icon=t.value; if(window.markDirty)window.markDirty(); renderFeatured();} }
      });
      list.addEventListener('click', function(e) {
        var t=e.target, arr=getFeats();
        if (t.dataset.ftoggle!==undefined){ var i=+t.dataset.ftoggle; if(arr[i]){arr[i].enabled=!(arr[i].enabled!==false);if(window.markDirty)window.markDirty();renderFeatured();} }
        if (t.dataset.fdel!==undefined)   { var i2=+t.dataset.fdel; arr.splice(i2,1); if(window.markDirty)window.markDirty(); renderFeatured(); }
        if (t.dataset.fup!==undefined)    { var i3=+t.dataset.fup; if(i3>0){var tmp=arr[i3];arr[i3]=arr[i3-1];arr[i3-1]=tmp;if(window.markDirty)window.markDirty();renderFeatured();} }
        if (t.dataset.fdn!==undefined)    { var i4=+t.dataset.fdn; if(i4<arr.length-1){var tmp2=arr[i4];arr[i4]=arr[i4+1];arr[i4+1]=tmp2;if(window.markDirty)window.markDirty();renderFeatured();} }
      });
    }

    var ab=document.getElementById('feat-add');
    if(ab){
      var fr=ab.cloneNode(true); ab.parentNode.replaceChild(fr,ab);
      fr.addEventListener('click',function(){
        getFeats().push({icon:'✨',title:'New Feature',description:'',enabled:true});
        if(window.markDirty)window.markDirty(); renderFeatured();
        setTimeout(function(){ var els=document.querySelectorAll('[data-ftitle]'); var last=els[els.length-1]; if(last){last.focus();last.select();} },60);
      });
    }
  }

  window.renderFeaturedFn = renderFeatured;

})();

;(function() {
  function ensureInfo() {
    var S = window.QRAIVY_EDITOR_STATE;
    if (!S || !S.sections) return null;
    if (!S.sections.info || typeof S.sections.info !== 'object' || Array.isArray(S.sections.info)) {
      S.sections.info = { address:'', addressEnabled:true, phone:'', phoneEnabled:true, website:'', websiteEnabled:true, hours:'', hoursEnabled:true, email:'', emailEnabled:true };
    }
    return S.sections.info;
  }
  function syncInfo() {
    var si = ensureInfo(); if (!si) return;
    var a=document.getElementById('info-input-address');
    var p=document.getElementById('info-input-phone');
    var w=document.getElementById('info-input-website');
    var h=document.getElementById('info-input-hours');
    var e=document.getElementById('info-input-email');
    if(a) si.address=a.value;
    if(p) si.phone=p.value;
    if(w) si.website=w.value;
    if(h) si.hours=h.value;
    if(e) si.email=e.value;
    if(window.markDirty) window.markDirty();
  }
  function wireInfoToggle(id, field) {
    var btn=document.getElementById(id); if(!btn) return;
    btn.addEventListener('click', function(){
      var si=ensureInfo(); if(!si) return;
      si[field] = si[field]===false ? true : false;
      var on=si[field]!==false;
      btn.textContent=on?'On':'Off';
      btn.style.background=on?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
      btn.style.color=on?'#ff5a1f':'rgba(240,244,248,0.5)';
      btn.style.border=on?'0.5px solid rgba(255,90,31,0.4)':'0.5px solid rgba(255,255,255,0.15)';
      if(window.markDirty) window.markDirty();
    });
  }
  document.addEventListener('DOMContentLoaded', function(){
    ['info-input-address','info-input-phone','info-input-website','info-input-hours','info-input-email'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.addEventListener('input',syncInfo);
    });
    wireInfoToggle('info-address-toggle','addressEnabled');
    wireInfoToggle('info-phone-toggle','phoneEnabled');
    wireInfoToggle('info-website-toggle','websiteEnabled');
    wireInfoToggle('info-hours-toggle','hoursEnabled');
    wireInfoToggle('info-email-toggle','emailEnabled');
  });
  window.ensureInfoSection = ensureInfo;
})();

;(function() {
  function ensureSettings() {
    var S=window.QRAIVY_EDITOR_STATE; if(!S||!S.sections) return null;
    if(!S.sections.settings||typeof S.sections.settings!=='object'){
      S.sections.settings={pageActive:true,voiceEnabled:true,aiEnabled:true,subscribersEnabled:true,walletEnabled:true,brandingEnabled:true,analyticsEnabled:true};
    }
    return S.sections.settings;
  }
  function wireST(id,field){
    var btn=document.getElementById(id); if(!btn) return;
    btn.addEventListener('click',function(){
      var ss=ensureSettings(); if(!ss) return;
      ss[field]=ss[field]===false?true:false;
      var on=ss[field]!==false;
      btn.textContent=on?'On':'Off';
      btn.style.background=on?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';
      btn.style.color=on?'#ff5a1f':'rgba(240,244,248,0.5)';
      btn.style.border=on?'0.5px solid rgba(255,90,31,0.4)':'0.5px solid rgba(255,255,255,0.15)';
      if(window.markDirty) window.markDirty();
    });
  }
  document.addEventListener('DOMContentLoaded',function(){
    wireST('settings-pageActive-toggle','pageActive');
    wireST('settings-voice-toggle','voiceEnabled');
    wireST('settings-ai-toggle','aiEnabled');
    wireST('settings-subscribers-toggle','subscribersEnabled');
    wireST('settings-wallet-toggle','walletEnabled');
    wireST('settings-branding-toggle','brandingEnabled');
    wireST('settings-analytics-toggle','analyticsEnabled');
  });
  window.ensureSettingsSection=ensureSettings;
})();





  // ── Wire global save + publish buttons ───────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    // ── Collect all input values into EDITOR_STATE before save ──────────────
  function collectEditorStateFromInputs() {
    var S = window.QRAIVY_EDITOR_STATE;
    if (!S) return;
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    // Hero
    S.sections.hero.title    = val('hero-title-input');
    S.sections.hero.subtitle = val('hero-subtitle-input');
    S.sections.hero.badge    = val('hero-badge-input');
    S.sections.hero.logoText = val('hero-logo-input');
    S.hero.title      = S.sections.hero.title;
    S.hero.subtitle   = S.sections.hero.subtitle;
    S.hero.badgeText  = S.sections.hero.badge;
    S.hero.logoInitial= S.sections.hero.logoText;
    S.pageName        = S.sections.hero.title || S.pageName;
    // Voice
    S.sections.voice.title       = val('voice-input-title');
    S.sections.voice.description = val('voice-input-desc');
    S.sections.voice.buttonLabel = val('voice-input-btn');
    S.sections.voice.voiceKey      = val('voice-input-key') || 'sarah';
    S.sections.voice.voiceLanguage = val('voice-input-language') || 'en';
    // AI
    S.sections.ai.placeholder = val('ai-input-placeholder');
    // Loop
    S.sections.loop.title            = val('loop-input-title');
    S.sections.loop.description      = val('loop-input-desc');
    S.sections.loop.emailPlaceholder = val('loop-input-email-placeholder');
    S.sections.loop.buttonLabel      = val('loop-input-btn-label');
    S.sections.loop.walletTitle      = val('loop-input-wallet-title');
    S.sections.loop.walletSubtitle   = val('loop-input-wallet-subtitle');
    // Footer
    if(!S.sections.info||typeof S.sections.info!=='object') S.sections.info={};
    S.sections.info.address  = val('info-input-address');
    S.sections.info.phone    = val('info-input-phone');
    S.sections.info.website  = val('info-input-website');
    S.sections.info.hours    = val('info-input-hours');
    S.sections.info.email    = val('info-input-email');
    if(!S.sections.settings||typeof S.sections.settings!=='object')S.sections.settings={pageActive:true,voiceEnabled:true,aiEnabled:true,subscribersEnabled:true,walletEnabled:true,brandingEnabled:true,analyticsEnabled:true};
    S.sections.footer.businessName = val('footer-input-bizname');
    S.sections.footer.footerText   = val('footer-input-text');
    S.sections.footer.footerLink   = val('footer-input-link');
  }

  function setDraftSaveStatus(msg, color) {
    var c = color || 'rgba(240,244,248,0.50)';
    // Update all known status elements directly (setStatus is in other IIFEs)
    var ids = ['hero-save-status', 'sqd-save-global-status', 'sqd-save-status'];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = msg; el.style.color = c; }
    });
    // Also flash all save buttons text if not already overridden
  }

  async function saveDraftToBackend() {
    collectEditorStateFromInputs();
    var S = window.QRAIVY_EDITOR_STATE;
    var slug = S.slug;

    // Always save to localStorage
    try { localStorage.setItem('qraivy_editor_draft_' + (slug||'demo'), JSON.stringify(S)); } catch(e) {}

    if (!slug) {
      setDraftSaveStatus('Saved locally ✓', '#22d47e');
      S.dirty = false;
      setTimeout(function(){ setDraftSaveStatus('No changes'); }, 3000);
      return;
    }

    setDraftSaveStatus('Saving…', '#ff5a1f');
    document.querySelectorAll('[id^="sqd-save-draft-btn"]').forEach(function(b){
      b.textContent = 'Saving…'; b.disabled = true;
    });

    try {
      var tok = null;
      if (window.Clerk && window.Clerk.session) tok = await window.Clerk.session.getToken();
      var headers = { 'Content-Type': 'application/json' };
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      // Use same payload structure as publish — this is the only save endpoint
      var payload = {
        slug: slug,
        businessName: S.pageName || S.sections.hero.title || slug,
        websiteUrl: S.websiteUrl || (S.sections && S.sections.info && S.sections.info.website) || '',
        useCase: S.useCase || 'restaurant',
        brandColor: S.brandColor || (S.sections.theme && S.sections.theme.accentColor) || '#ff5a1f',
        logoUrl: S.logoUrl || '',
        sections: Object.assign({}, S.sections || {}, {
          buttons: (S.buttons || []),
          order:   (S.sections && S.sections.order) || ['hero','voice','ai','buttons','loop','footer'],
          theme:   (S.sections && S.sections.theme) || { background:'dark', accentColor:'#ff5a1f', buttonStyle:'rounded', fontStyle:'modern', logoMode:'initials' }
        })
      };
      var res = await fetch('https://api.qraivy.com/lp', { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      // Save succeeded — update localStorage with confirmed state
      try { localStorage.setItem('qraivy_editor_draft_' + slug, JSON.stringify(S)); } catch(e) {}
      S.dirty = false;
      setDraftSaveStatus('Saved ✓', '#22d47e');
      setTimeout(function(){ setDraftSaveStatus('No changes'); }, 3000);
    } catch(err) {
      // Backend failed — localStorage save still worked
      setDraftSaveStatus('Saved locally (offline) ✓', '#f59e0b');
      S.dirty = false;
      setTimeout(function(){ setDraftSaveStatus('No changes'); }, 4000);
    } finally {
      document.querySelectorAll('[id^="sqd-save-draft-btn"]').forEach(function(b){
        b.textContent = 'Save Draft'; b.disabled = false;
      });
    }
  }

  window.saveDraftToBackend = saveDraftToBackend;
  window.collectEditorStateFromInputs = collectEditorStateFromInputs;

  document.querySelectorAll('[id^="sqd-save-draft-btn"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        saveDraftToBackend();
      });
    });
    ['sqd-publish-btn','sqd-publish-btn-2'].forEach(function(id){
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function(){ if(window.publishPage) window.publishPage(); });
    });
  });

  // ── DEFAULT_BUTTONS fallback ───────────────────────────────────────────
  var DEFAULT_BUTTONS = {
    restaurant: [
      { id:'b1', label:'Reserve a Table', url:'', active:true, style:'primary' },
      { id:'b2', label:'View Menu', url:'', active:true, style:'secondary' }
    ],
    other: [
      { id:'b1', label:'Visit Website', url:'', active:true, style:'primary' },
      { id:'b2', label:'Learn More', url:'', active:true, style:'secondary' }
    ]
  };

  // ── QRAIVY_BUTTONS_EDITOR ─────────────────────────────────────────────
  window.QRAIVY_BUTTONS_EDITOR = {
    init: function(pending) {
      var slug = pending.slug || 'demo';
      var uc = (pending.useCase || 'other').toLowerCase().replace(/\s/g,'_');
      function migrate(b,i){ return { id:b.id||('b'+i), icon:b.icon||'globe', title:b.title||b.label||'Button', label:b.title||b.label||'Button', url:b.url||'', enabled:b.enabled!==false&&b.active!==false, active:b.active!==false, style:b.style||'primary' }; }
      // 1. Check localStorage
      try {
        var raw = localStorage.getItem('qraivy_editor_draft_' + slug);
        if (raw) {
          var draft = JSON.parse(raw);
          if (draft.buttons && draft.buttons.length) {
            window.QRAIVY_EDITOR_STATE.buttons = draft.buttons.map(migrate);
            setTimeout(renderButtons, 100);
            return;
          }
        }
      } catch(e) {}
      // 2. Use AI-generated buttons from pending
      var pendingBtns = (pending.sections&&pending.sections.buttons&&pending.sections.buttons.length) ? pending.sections.buttons : (pending.buttons&&pending.buttons.length ? pending.buttons : null);
      if (pendingBtns) {
        window.QRAIVY_EDITOR_STATE.buttons = pendingBtns.map(migrate);
        setTimeout(renderButtons, 100);
        return;
      }
      // 3. Defaults
      var defaults = DEFAULT_BUTTONS[uc] || DEFAULT_BUTTONS['other'];
      window.QRAIVY_EDITOR_STATE.buttons = JSON.parse(JSON.stringify(defaults)).map(migrate);
      setTimeout(renderButtons, 100);
    }
  };

})();
})();

