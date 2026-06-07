
window.QrTier={
  loadPlan:async function(){},
  can:function(){return true;},
  get:function(){return {};}
};

async function initPage() {
  try {

  } catch(e) { console.warn('[initPage] auth/sidebar error:', e); }

  // ── Load Smart QR data ────────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  // Read from localStorage first (instant hydration)
  let pending = null;
  try {
    pending = JSON.parse(localStorage.getItem('qraivy_active_claim') || null)
           || JSON.parse(localStorage.getItem('qraivy_pending_demo') || null);
  } catch(e) {}

  // If slug in URL, try to fetch from API
  if (slug) {
    try {
      let _apiToken = '';
      try { if(window.Clerk && window.Clerk.session) _apiToken = await window.Clerk.session.getToken() || ''; } catch(_){}
      const res  = await fetch(`https://api.qraivy.com/lp/${slug}`, {
        headers: _apiToken ? { Authorization: 'Bearer ' + _apiToken } : {}
      });
      const data = await res.json();
      if (data && data.slug) {
        pending = {
          slug:         data.slug,
          businessName: data.businessName,
          hostedUrl:    `https://qraivy.com/lp/${data.slug}`,
          useCase:      data.useCase,
          brandColor:   data.brandColor,
          sections:     data.sections
        };
      }
    } catch(e) {}
  }

  // If still no pending, build a minimal fallback from the slug itself
  if (!pending && slug) {
    pending = {
      slug:         slug,
      businessName: slug.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
      hostedUrl:    'https://api.qraivy.com/lp/' + slug
    };
  }
  if (!pending) {
    window.location.href = 'dashboard.html';
    return;
  }

  const hostedUrl = (pending.hostedUrl || `https://qraivy.com/lp/${pending.slug}`);
  const qrSrc     = `https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(hostedUrl)}&color=1a1a1a&bgcolor=ffffff&margin=6`;

  // ── Populate hero ─────────────────────────────────────────────────────
  document.title = `${pending.businessName || 'Smart QR'} — QRAivy`;
  document.getElementById('sqd-qr-img').src     = qrSrc;
  document.getElementById('sqd-biz-name').textContent = pending.businessName || 'Your Smart QR';
  var tb=document.getElementById('sqd-topbar-name'); if(tb) tb.textContent = pending.businessName || 'Your Smart QR';
  var sn=document.getElementById('sqd-settings-name'); if(sn) sn.textContent = pending.businessName || '—';
  var su=document.getElementById('sqd-settings-url'); if(su) su.textContent = hostedUrl;
  var sc=document.getElementById('sqd-settings-scans'); if(sc) sc.textContent = pending.scanCount || '—';
  window.QRAIVY_EDITOR_STATE.useCase = pending.useCase || 'restaurant';
  if (window.QRAIVY_HERO_EDITOR) window.QRAIVY_HERO_EDITOR.init(pending);
  if (window.QRAIVY_BUTTONS_EDITOR) window.QRAIVY_BUTTONS_EDITOR.init(pending);
  if (window.QRAIVY_LOOP_EDITOR) window.QRAIVY_LOOP_EDITOR.init(pending);
  // Start in DRAFT preview mode - after state is populated
  setTimeout(function() {
    if (window.QRAIVY_PREVIEW) {
      window.QRAIVY_PREVIEW.setMode('draft');
    }
  }, 400);
  var cp=document.getElementById('sqd-color-preview'); if(cp && pending.brandColor) cp.style.background = pending.brandColor;
  var ch=document.getElementById('sqd-color-hex'); if(ch && pending.brandColor) ch.textContent = pending.brandColor;
  document.getElementById('sqd-url').textContent      = hostedUrl;
  document.getElementById('sqd-view-btn').href        = hostedUrl;
  document.getElementById('sqd-view-btn2').href       = hostedUrl;
  window.QRAIVY_EDITOR_STATE.hostedUrl = hostedUrl;
  window.QRAIVY_EDITOR_STATE.slug = pending.slug || '';
  // Hydrate sections from API response
  if (pending.sections) {
    try {
      var apiSections = typeof pending.sections === 'string' ? JSON.parse(pending.sections) : pending.sections;
      if (apiSections && typeof apiSections === 'object') {
        if (apiSections.hero)   Object.assign(window.QRAIVY_EDITOR_STATE.sections.hero,   apiSections.hero);
        if (apiSections.voice)  Object.assign(window.QRAIVY_EDITOR_STATE.sections.voice,  apiSections.voice);
        if (apiSections.ai)     Object.assign(window.QRAIVY_EDITOR_STATE.sections.ai,     apiSections.ai);
        if (apiSections.loop)   Object.assign(window.QRAIVY_EDITOR_STATE.sections.loop,   apiSections.loop);
        if (apiSections.footer) Object.assign(window.QRAIVY_EDITOR_STATE.sections.footer, apiSections.footer);
        if (Array.isArray(apiSections.buttons)) window.QRAIVY_EDITOR_STATE.buttons = apiSections.buttons;
        if (Array.isArray(apiSections.order))   window.QRAIVY_EDITOR_STATE.sections.order = apiSections.order;
        if (apiSections.theme)  Object.assign(window.QRAIVY_EDITOR_STATE.sections.theme,  apiSections.theme);
        if (apiSections.theme && apiSections.theme.accentColor) window.QRAIVY_EDITOR_STATE.brandColor = apiSections.theme.accentColor;
      }
    } catch(e) { console.warn('[initPage] sections hydration error:', e); }
  }
  // Load localStorage draft if newer than API state
  try {
    var _draftKey = 'qraivy_editor_draft_' + (window.QRAIVY_EDITOR_STATE.slug || 'demo');
  var _urlSlug = new URLSearchParams(window.location.search).get('slug') || '';
  if (_urlSlug && _draftKey !== 'qraivy_editor_draft_' + _urlSlug) { _saved = null; } // don't load wrong slug draft
    var _saved = localStorage.getItem(_draftKey);
    if (_saved) {
      var _draft = JSON.parse(_saved);
      if (_draft && _draft.sections) {
        if (_draft.sections.hero)   Object.assign(window.QRAIVY_EDITOR_STATE.sections.hero,   _draft.sections.hero);
        if (_draft.sections.voice)  Object.assign(window.QRAIVY_EDITOR_STATE.sections.voice,  _draft.sections.voice);
        if (_draft.sections.ai)     Object.assign(window.QRAIVY_EDITOR_STATE.sections.ai,     _draft.sections.ai);
        if (_draft.sections.loop)   Object.assign(window.QRAIVY_EDITOR_STATE.sections.loop,   _draft.sections.loop);
        if (_draft.sections.footer) Object.assign(window.QRAIVY_EDITOR_STATE.sections.footer, _draft.sections.footer);
        if (Array.isArray(_draft.buttons) && _draft.buttons.length > 0) window.QRAIVY_EDITOR_STATE.buttons = _draft.buttons;
        if (_draft.sections.theme)  Object.assign(window.QRAIVY_EDITOR_STATE.sections.theme,  _draft.sections.theme);
        if (_draft.pageName) window.QRAIVY_EDITOR_STATE.pageName = _draft.pageName;
        console.log('[initPage] localStorage draft restored');
      }
    }
  } catch(e) { console.warn('[initPage] draft restore error:', e); }
  // Render buttons list now that state is fully hydrated
  setTimeout(function(){ if(window.renderButtonsFn) window.renderButtonsFn(); }, 50);
  document.getElementById('sqd-download-btn').href    = qrSrc.replace('192x192','600x600');

  // ── Phone iframe ──────────────────────────────────────────────────────
  var iframeEl = document.getElementById('sqd-iframe');
  var _iframeSlug = (window.QRAIVY_EDITOR_STATE.slug || '');
  iframeEl.src = _iframeSlug ? ('lp-preview.html?slug=' + encodeURIComponent(_iframeSlug) + '&preview=1') : (hostedUrl + (hostedUrl.indexOf("?") === -1 ? "?preview=1" : "&preview=1"));
  var phoneFrame = document.querySelector('.sqd-phone-frame');
  if (phoneFrame) {
    phoneFrame.addEventListener('wheel', function(e) {
      e.stopPropagation();
    }, { passive: true });
    phoneFrame.addEventListener('touchmove', function(e) {
      e.stopPropagation();
    }, { passive: true });
  }
  iframeEl.addEventListener('load', function() {
    setTimeout(function(){ if(window.injectThemePreview) window.injectThemePreview(); }, 200);
    var frame = document.querySelector('.sqd-phone-frame');
    if (!frame) return;
    frame.scrollTop = 0;
    var attempts = 0;
    var reset = setInterval(function() {
      frame.scrollTop = 0;
      attempts++;
      if (attempts >= 5) clearInterval(reset);
    }, 100);
  });

  // ── Plan boundary check ───────────────────────────────────────────────
  // Upsell suppressed — Smart QR users are paid customers

  // ── Copy button ───────────────────────────────────────────────────────
  document.getElementById('sqd-copy-btn').addEventListener('click', function() {
    navigator.clipboard.writeText(hostedUrl).then(() => {
      this.textContent = 'Copied!';
      setTimeout(() => { this.textContent = 'Copy URL'; }, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = hostedUrl; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      this.textContent = 'Copied!';
      setTimeout(() => { this.textContent = 'Copy URL'; }, 2000);
    });
  });

  // ── Fetch live stats if slug available ────────────────────────────────
  if (pending.slug) {
    try {
      const token = (window.Clerk && window.Clerk.session) ? await window.Clerk.session.getToken() : null;
      const res = await fetch(`https://api.qraivy.com/lp/${pending.slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.scanCount !== undefined) document.getElementById('sqd-scans').textContent  = data.scanCount;
    } catch(e) {}
  }
}

function toast(msg) {
  const t = document.getElementById('cs-toast');
  document.getElementById('cs-toast-msg').textContent = ' ' + msg;
  t.style.display = 'flex';
  setTimeout(() => { t.style.display = 'none'; }, 2800);
}

document.addEventListener('DOMContentLoaded', initPage);

// ── QRAIVY_PREVIEW: Draft renderer engine ─────────────────────────────────
(function() {
  var _mode = 'live';

  function getState() { return window.QRAIVY_EDITOR_STATE || {}; }

  function buildDraftHTML() {
    var s = getState();
    var sec = s.sections || {};
    var theme = sec.theme || {};
    var accent = theme.accentColor || s.brandColor || '#ff5a1f';
    var bg = theme.background === 'light' ? '#f5f0e8' : theme.background === 'gradient' ? '#0d0d14' : '#0a0a0a';
    var textColor = theme.background === 'light' ? '#1a1209' : '#f0ece0';
    var subColor = theme.background === 'light' ? 'rgba(26,18,9,0.6)' : 'rgba(240,236,224,0.7)';
    var cardBg = theme.background === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
    var cardBorder = theme.background === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
    var btnR = theme.buttonStyle === 'pill' ? '999px' : theme.buttonStyle === 'square' ? '4px' : '12px';
    var font = theme.fontStyle === 'elegant' ? 'Georgia,serif' : theme.fontStyle === 'bold' ? 'Syne,sans-serif' : "'DM Mono',monospace";
    var hero = sec.hero || {};
    var voice = sec.voice || {};
    var ai = sec.ai || {};
    var loop = sec.loop || {};
    var footer = sec.footer || {};
    var featCards = Array.isArray(sec.featured) ? sec.featured : [];
    var si = sec.info || {};
    var buttons = s.buttons || [];
    var order = sec.order || ['hero','voice','ai','buttons','loop','footer'];
    var bizName = s.pageName || hero.title || s.slug || 'My Business';
    var logoInitial = ((hero.logoText&&hero.logoText.trim())?hero.logoText.trim():(bizName[0]||'A')).toUpperCase().slice(0,2);

    var sections = {
      hero: hero.enabled !== false ? `
        <div data-section="hero" style="padding:32px 20px 24px;text-align:center;background:linear-gradient(160deg,${accent}18 0%,transparent 55%);">
          <div style="display:inline-flex;align-items:center;gap:6px;border:0.5px solid ${accent}44;border-radius:99px;padding:4px 12px;font-size:0.58rem;color:${accent};letter-spacing:.1em;margin-bottom:16px;">${hero.badge || '✦ Qraivy Smart Page'}</div>
          <div style="width:36px;height:36px;border-radius:10px;background:${accent}20;border:0.5px solid ${accent}44;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:1rem;font-weight:800;color:${accent};margin:0 auto 12px;">${logoInitial}</div>
          <h1 style="font-family:Syne,sans-serif;font-size:1.6rem;font-weight:800;line-height:1.15;letter-spacing:-.02em;margin-bottom:10px;color:${textColor};">${hero.title || 'Welcome to ' + bizName}</h1>
          <p style="font-size:.8rem;color:${subColor};max-width:300px;margin:0 auto 20px;line-height:1.7;">${hero.subtitle || ''}</p>
          ${(theme.background==='light'||hero.ctaText)?'<a href="'+(hero.ctaUrl||'#aiSection')+'" style="display:inline-flex;align-items:center;gap:6px;background:'+accent+';color:#fff;padding:11px 22px;border-radius:50px;font-family:Syne,sans-serif;font-weight:700;font-size:.82rem;text-decoration:none;margin-top:8px;">'+(hero.ctaText||'Start a Conversation \u2192')+'</a>':''}        
        </div>` : '',

      voice: voice.enabled !== false ? `
        <div data-section="voice" style="padding:16px 20px;">
          <div style="background:${cardBg};border:0.5px solid ${cardBorder};border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.8rem;">▶</div>
            <div>
              <div style="font-size:.78rem;font-weight:600;color:${textColor};margin-bottom:2px;">${voice.title || 'Personal welcome message'}</div>
              <div style="font-size:.64rem;color:${subColor};">Tap to listen</div>
            </div>
          </div>
        </div>` : '',

      ai: ai.enabled !== false ? `
        <div data-section="ai" style="padding:8px 20px 16px;">
          <div style="background:${cardBg};border:0.5px solid ${cardBorder};border-radius:14px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:.72rem;color:${subColor};">AI Assistant — Online</span>
            <span style="font-size:.62rem;color:${accent};">Tap to activate</span>
          </div>
        </div>` : '',

      buttons: buttons.filter(function(b){ return b.enabled!==false&&b.active !== false; }).length > 0 ? `
        <div data-section="buttons" style="padding:8px 20px 16px;display:flex;flex-direction:column;gap:8px;">` +
          buttons.filter(function(b){ return b.enabled!==false&&b.active !== false; }).map(function(b) {
            var isPrimary = b.style !== 'secondary';
            var _im = window._ICON_MAP_BTN||{}; var _ico = b.icon&&_im[b.icon]?_im[b.icon]+' ':'';
            var _lbl = _ico + (b.title||b.label||'Button');
            return `<div style="display:block;width:100%;padding:13px 20px;border-radius:${btnR};font-family:Syne,sans-serif;font-size:.82rem;font-weight:700;text-align:center;box-sizing:border-box;${isPrimary ? 'background:'+accent+';color:#fff;' : 'background:'+cardBg+';color:'+textColor+';border:0.5px solid '+cardBorder+';'}">${_lbl}</div>`;
          }).join('') + `</div>` : '',

      featured: Array.isArray(featCards) && featCards.filter(function(f){ return f.enabled!==false; }).length>0 ?
        '<div data-section="featured" style="padding:8px 20px 28px;">'+
        '<div style="text-align:center;margin-bottom:20px;">'+
          '<div style="font-size:.92rem;font-weight:800;color:'+textColor+';font-family:Syne,sans-serif;letter-spacing:-.01em;margin-bottom:4px;">Why Choose Us</div>'+
          '<div style="font-size:.63rem;color:'+subColor+';">Discover what makes us different.</div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">'+
        featCards.filter(function(f){ return f.enabled!==false; }).map(function(f){
          return '<div style="background:'+cardBg+';border:0.5px solid '+cardBorder+';border-radius:18px;padding:16px 8px 14px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.2);">'+
            '<div style="font-size:1.6rem;margin-bottom:8px;">'+(f.icon||'\u2728')+'</div>'+
            '<div style="font-size:.68rem;font-weight:800;color:'+textColor+';margin-bottom:5px;font-family:Syne,sans-serif;line-height:1.3;">'+(f.title||'Feature')+'</div>'+
            '<div style="font-size:.58rem;color:'+subColor+';line-height:1.5;">'+(f.description||'')+'</div>'+
          '</div>';
        }).join('')+
        '</div></div>' : '',

      
      loop: loop.enabled !== false ? `
        <div data-section="loop" style="padding:16px 20px;">
          <div style="background:${cardBg};border:0.5px solid ${cardBorder};border-radius:16px;padding:20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;background:${accent}22;border:0.5px solid ${accent}44;border-radius:10px;padding:10px 14px;margin-bottom:14px;">
              <div><div style="font-size:.72rem;font-weight:800;color:${textColor};font-family:Syne,sans-serif;">${loop.walletTitle || bizName}</div><div style="font-size:.58rem;color:${subColor};margin-top:2px;">${loop.walletSubtitle || 'QRAIVY MEMBER'}</div></div>
              <div style="font-size:.62rem;color:${subColor};">SMART PASS</div>
            </div>
            <div style="font-size:.9rem;font-weight:700;color:${textColor};margin-bottom:6px;">${loop.title || 'Stay in the loop'}</div>
            <div style="font-size:.7rem;color:${subColor};margin-bottom:14px;">${loop.description || 'Subscribe for updates and early access.'}</div>
            <div style="background:rgba(255,255,255,0.05);border:0.5px solid ${cardBorder};border-radius:8px;padding:10px 12px;font-size:.72rem;color:${subColor};margin-bottom:10px;">${loop.emailPlaceholder || 'your@email.com'}</div>
            <div style="display:block;width:100%;padding:11px 20px;border-radius:${btnR};font-family:Syne,sans-serif;font-size:.8rem;font-weight:700;text-align:center;background:${accent};color:#fff;box-sizing:border-box;">${loop.buttonLabel || 'Subscribe →'}</div>
            ${loop.appleEnabled!==false||loop.googleEnabled!==false ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'+(loop.appleEnabled!==false?'<div style="padding:8px;border-radius:8px;border:0.5px solid '+cardBorder+';font-size:.65rem;color:'+subColor+';text-align:center;">&#9679; Add to Apple Wallet</div>':'')+(loop.googleEnabled!==false?'<div style="padding:8px;border-radius:8px;border:0.5px solid '+cardBorder+';font-size:.65rem;color:'+subColor+';text-align:center;">&#9632; Add to Google Wallet</div>':'')+'</div>' : ''}
          </div>
        </div>` : '',

      info: (function(){
        if (!si||(!si.address&&!si.phone&&!si.website&&!si.hours&&!si.email)) return '';
        var _ic='width:14px;height:14px;display:block;';
        var _pin='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
        var _ph='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12 12 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.79-1.79a2 2 0 0 1 2.11-.45 12 12 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
        var _gl='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
        var _cl='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        var _em='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>';
        var _mkR=function(ico,lbl,val,href){
          var v=href?'<a href="'+href+'" style="font-size:.77rem;font-weight:500;color:'+textColor+';text-decoration:none;line-height:1.3;word-break:break-all;">'+val+'</a>':'<div style="font-size:.77rem;font-weight:500;color:'+textColor+';line-height:1.3;word-break:break-all;white-space:pre-line;">'+val+'</div>';
          return '<div style="background:'+cardBg+';border:0.5px solid '+cardBorder+';border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;"><div style="width:32px;height:32px;border-radius:10px;background:'+accent+'18;border:0.5px solid '+accent+'30;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+ico+'</div><div style="min-width:0;flex:1;"><div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:'+subColor+';margin-bottom:2px;">'+lbl+'</div>'+v+'</div></div>';
        };
        var rows=[];
        if(si.address&&si.addressEnabled!==false)rows.push(_mkR(_pin,'Address',si.address,''));
        if(si.phone&&si.phoneEnabled!==false)rows.push(_mkR(_ph,'Phone',si.phone,'tel:'+si.phone));
        if(si.website&&si.websiteEnabled!==false){var _wu=si.website.startsWith('http')?si.website:'https://'+si.website;rows.push(_mkR(_gl,'Website',si.website,_wu));}
        if(si.hours&&si.hoursEnabled!==false)rows.push(_mkR(_cl,'Opening Hours',si.hours,''));
        if(si.email&&si.emailEnabled!==false)rows.push(_mkR(_em,'Email',si.email,'mailto:'+si.email));
        if(!rows.length)return '';
        return '<div data-section="info" style="padding:8px 20px 28px;">'+
          '<div style="margin-bottom:14px;">'+
            '<div style="font-size:.92rem;font-weight:800;color:'+textColor+';font-family:Syne,sans-serif;letter-spacing:-.01em;margin-bottom:3px;">Visit & Contact</div>'+
            '<div style="font-size:.63rem;color:'+subColor+';">Everything you need to reach us.</div>'+
          '</div>'+
          '<div style="display:flex;flex-direction:column;gap:8px;">'+rows.join('')+'</div>'+
        '</div>';
      })(),

      footer: footer.enabled !== false ? `
        <div data-section="footer" style="padding:24px 20px 32px;text-align:center;border-top:0.5px solid ${cardBorder};margin-top:8px;">
          <div style="font-size:.72rem;color:${subColor};margin-bottom:4px;">${footer.businessName || bizName}</div>
          <div style="font-size:.62rem;color:${subColor}55;">${footer.footerText || 'Powered by Qraivy'}</div>
        </div>` : ''
    };

    var _ord = order.map(function(k){ return sections[k] || ''; });
    var _fi2=-1; if (!order.includes('featured')) { var _fbi=order.indexOf('loop'); _fi2=_fbi!==-1?_fbi+1:_ord.length-1; _ord.splice(_fi2,0,sections.featured||''); } else { _fi2=order.indexOf('featured'); }
    if (!order.includes('info')) { _ord.splice(_fi2+1,0,sections.info||''); }
    var body = _ord.join('');

    return `<div style="background:${bg};color:${textColor};font-family:${font};min-height:100%;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:${theme.background === 'light' ? 'rgba(245,240,232,0.95)' : 'rgba(10,10,10,0.95)'};border-bottom:0.5px solid ${cardBorder};">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;border-radius:7px;background:${accent}20;border:0.5px solid ${accent}44;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;color:${accent};">${logoInitial}</div>
          <span style="font-family:Syne,sans-serif;font-size:.82rem;font-weight:700;color:${textColor};">${bizName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;background:${accent}18;border:0.5px solid ${accent}33;border-radius:99px;padding:3px 10px;font-size:.55rem;color:${accent};letter-spacing:.08em;">
          <div style="width:5px;height:5px;border-radius:50%;background:${accent};"></div>AI Powered
        </div>
      </div>
      ${body}
    </div>`;
  }

  function render() {
    var stage = document.getElementById('sqd-draft-stage');
    var iframe = document.getElementById('sqd-iframe');
    if (!stage) return;
    stage.innerHTML = buildDraftHTML();
    // Reset scroll to top after DOM update
    var _pf = document.querySelector('.sqd-phone-frame');
    if (_pf) { _pf.scrollTop = 0; requestAnimationFrame(function(){ _pf.scrollTop = 0; }); }
    // Add click-through to hotspots
    if (window.QRAIVY_HOTSPOTS) window.QRAIVY_HOTSPOTS.rebuild();
    // Mark editable elements for click-to-edit
    if (window.QRAIVY_DRAFT_EDIT) window.QRAIVY_DRAFT_EDIT.init();
  }

  function setMode(mode) {
    _mode = mode;
    var stage = document.getElementById('sqd-draft-stage');
    var iframe = document.getElementById('sqd-iframe');
    var draftBtn = document.getElementById('sqd-preview-draft-btn');
    var liveBtn = document.getElementById('sqd-preview-live-btn');

    if (mode === 'draft') {
      if (stage) stage.style.display = 'block';
      if (iframe) iframe.style.display = 'none';
      var _pf2 = document.querySelector('.sqd-phone-frame');
      if (_pf2) _pf2.scrollTop = 0;
      render();
      // Update button styles
      if (draftBtn) { draftBtn.style.background='rgba(255,90,31,0.15)'; draftBtn.style.borderColor='rgba(255,90,31,0.3)'; draftBtn.style.color='#ff5a1f'; }
      if (liveBtn)  { liveBtn.style.background='transparent'; liveBtn.style.borderColor='transparent'; liveBtn.style.color='rgba(240,244,248,0.45)'; }
      if (window.QRAIVY_HOTSPOTS) window.QRAIVY_HOTSPOTS.enable();
    } else {
      if (stage) stage.style.display = 'none';
      if (iframe) iframe.style.display = 'block';
      if (draftBtn) { draftBtn.style.background='transparent'; draftBtn.style.borderColor='transparent'; draftBtn.style.color='rgba(240,244,248,0.45)'; }
      if (liveBtn)  { liveBtn.style.background='rgba(255,255,255,0.08)'; liveBtn.style.borderColor='rgba(255,255,255,0.14)'; liveBtn.style.color='#f0f4f8'; }
      if (window.QRAIVY_HOTSPOTS) window.QRAIVY_HOTSPOTS.disable();
    }
  }

  function getMode() { return _mode; }

  window.QRAIVY_PREVIEW = { setMode: setMode, render: render, getMode: getMode };
})();

// ── STEP 25: Draft preview click-to-edit ──────────────────────────────────
(function() {
  var _listenerAttached = false;

  // Map: [data-edit] value → { tab, inputId }
  var EDIT_MAP = {
    'hero-title':       { tab: 'hero',   input: 'hero-title-input' },
    'hero-subtitle':    { tab: 'hero',   input: 'hero-subtitle-input' },
    'hero-badge':       { tab: 'hero',   input: 'hero-badge-input' },
    'voice-title':      { tab: 'voice',  input: 'voice-input-title' },
    'voice-desc':       { tab: 'voice',  input: 'voice-input-desc' },
    'ai-title':         { tab: 'ai',     input: 'ai-input-title' },
    'ai-placeholder':   { tab: 'ai',     input: 'ai-input-placeholder' },
    'loop-title':       { tab: 'loop',   input: 'loop-input-title' },
    'loop-desc':        { tab: 'loop',   input: 'loop-input-desc' },
    'loop-btn':         { tab: 'loop',   input: 'loop-input-btn-label' },
    'footer-bizname':   { tab: 'footer', input: 'footer-input-bizname' },
    'footer-text':      { tab: 'footer', input: 'footer-input-text' }
  };

  // Called after every render() — tags specific child elements
  function markEditables(stage) {
    if (!stage) return;

    function tag(el, key) {
      if (!el) return;
      el.setAttribute('data-edit', key);
      el.style.cursor = 'text';
    }

    // Hero
    var hero = stage.querySelector('[data-section="hero"]');
    if (hero) {
      tag(hero.querySelector('h1'), 'hero-title');
      tag(hero.querySelector('p'),  'hero-subtitle');
      // badge = first inline-flex div
      var badge = hero.querySelector('div[style*="inline-flex"]');
      tag(badge, 'hero-badge');
    }

    // Voice
    var voice = stage.querySelector('[data-section="voice"]');
    if (voice) {
      // title is first div inside the inner card that has font-weight:600
      var vTitle = voice.querySelector('div[style*="font-weight:600"]');
      tag(vTitle, 'voice-title');
      var vDesc = voice.querySelector('div[style*="font-size:.64rem"]');
      tag(vDesc, 'voice-desc');
    }

    // AI
    var ai = stage.querySelector('[data-section="ai"]');
    if (ai) {
      var aiLabel = ai.querySelector('span[style*="font-size:.72rem"]');
      tag(aiLabel, 'ai-title');
      var aiTap = ai.querySelector('span[style*="font-size:.62rem"]');
      tag(aiTap, 'ai-placeholder');
    }

    // Loop
    var loop = stage.querySelector('[data-section="loop"]');
    if (loop) {
      var lTitle = loop.querySelector('div[style*="font-weight:700"]');
      tag(lTitle, 'loop-title');
      var lDesc = loop.querySelector('div[style*="font-size:.7rem"]');
      tag(lDesc, 'loop-desc');
      var lBtn = loop.querySelector('div[style*="text-align:center"][style*="background"]');
      tag(lBtn, 'loop-btn');
    }

    // Footer
    var footer = stage.querySelector('[data-section="footer"]');
    if (footer) {
      var fBiz = footer.querySelector('div[style*="font-size:.72rem"]');
      tag(fBiz, 'footer-bizname');
      var fTxt = footer.querySelector('div[style*="font-size:.62rem"]');
      tag(fTxt, 'footer-text');
    }
  }

  // Activate a tab and focus its input
  function activateEdit(key) {
    var mapping = EDIT_MAP[key];
    if (!mapping) return;

    // Click the tab button
    var tabBtn = document.querySelector('.sqd-tab[data-tab="' + mapping.tab + '"]');
    if (tabBtn) tabBtn.click();

    // Focus input after panel becomes visible
    setTimeout(function() {
      var inp = document.getElementById(mapping.input);
      if (inp) {
        inp.focus();
        inp.select();
        // Brief highlight flash on the input
        inp.style.borderColor = 'rgba(255,90,31,0.8)';
        inp.style.boxShadow = '0 0 0 2px rgba(255,90,31,0.2)';
        setTimeout(function() {
          inp.style.borderColor = '';
          inp.style.boxShadow = '';
        }, 1200);
      }
    }, 80);
  }

  // Attach delegated listener to draft stage — only once
  function attachListener() {
    var stage = document.getElementById('sqd-draft-stage');
    if (!stage || _listenerAttached) return;
    _listenerAttached = true;

    stage.addEventListener('click', function(e) {
      var el = e.target;
      // Walk up to find data-edit attribute (max 4 levels)
      for (var i = 0; i < 4; i++) {
        if (!el || el === stage) break;
        var key = el.getAttribute('data-edit');
        if (key) {
          e.stopPropagation();
          // Flash the clicked element
          var origOutline = el.style.outline;
          el.style.outline = '1.5px solid rgba(255,90,31,0.7)';
          el.style.borderRadius = '3px';
          setTimeout(function(){ el.style.outline = origOutline; }, 700);
          activateEdit(key);
          return;
        }
        el = el.parentElement;
      }
    });
  }

  // Inject hover CSS once
  function injectHoverCSS() {
    if (document.getElementById('step25-edit-css')) return;
    var s = document.createElement('style');
    s.id = 'step25-edit-css';
    s.textContent = [
      '[data-edit]{transition:box-shadow .1s,background .1s;border-radius:3px;cursor:text !important;}',
      '[data-edit]:hover{box-shadow:inset 0 0 0 2px rgba(255,90,31,0.7) !important;background:rgba(255,90,31,0.04) !important;}'
    ].join('');
    document.head.appendChild(s);
  }

  // Public API — called by QRAIVY_PREVIEW.render() after innerHTML update
  window.QRAIVY_DRAFT_EDIT = {
    mark: markEditables,
    attach: attachListener,
    init: function() {
      injectHoverCSS();
      attachListener();
      markEditables(document.getElementById('sqd-draft-stage'));
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    injectHoverCSS();
    setTimeout(attachListener, 400);
  });
})();




// ── STEP 25: Click-to-edit hotspots ───────────────────────────────────────
(function() {
  // Section definitions: tab name, label, approximate top offset in LP, height
  var HOTSPOTS = [
    { tab: 'hero',    label: '🏠 Hero',    top: 0,    height: 280 },
    { tab: 'voice',   label: '🎙 Voice',   top: 280,  height: 120 },
    { tab: 'ai',      label: '🤖 AI',      top: 400,  height: 100 },
    { tab: 'buttons', label: '🔗 Buttons', top: 500,  height: 140 },
    { tab: 'loop',    label: '📬 Loop',    top: 640,  height: 260 },
    { tab: 'footer',  label: '🦶 Footer',  top: 900,  height: 120 }
  ];

  function activateTab(tabName) {
    var tab = document.querySelector('.sqd-tab[data-tab="' + tabName + '"]');
    if (tab) {
      tab.click();
      // Focus first input in the tab panel after short delay
      setTimeout(function() {
        var panel = document.getElementById('sqd-tab-' + tabName);
        if (!panel) panel = document.querySelector('[data-panel="' + tabName + '"]');
        if (panel) {
          var input = panel.querySelector('input,textarea');
          if (input) { input.focus(); input.select(); }
        }
      }, 120);
    }
  }

  function buildHotspots() {
    var overlay = document.getElementById('sqd-hotspot-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    HOTSPOTS.forEach(function(h) {
      var div = document.createElement('div');
      div.className = 'sqd-section-hotspot';
      div.style.top = h.top + 'px';
      div.style.height = h.height + 'px';
      div.dataset.tab = h.tab;
      div.innerHTML = '<div class="sqd-hotspot-label">' + h.label + '</div>';
      div.addEventListener('click', function(e) {
        e.stopPropagation();
        // Clear previous active
        document.querySelectorAll('.sqd-hotspot-active').forEach(function(el){ el.classList.remove('sqd-hotspot-active'); });
        div.classList.add('sqd-hotspot-active');
        setTimeout(function(){ div.classList.remove('sqd-hotspot-active'); }, 800);
        activateTab(h.tab);
      });
      overlay.appendChild(div);
    });
  }

  function enableHotspots() {
    var overlay = document.getElementById('sqd-hotspot-overlay');
    if (overlay) overlay.classList.add('active');
  }
  function disableHotspots() {
    var overlay = document.getElementById('sqd-hotspot-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  // Build hotspots on load
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(buildHotspots, 600);
    // Enable in draft mode, disable in live mode
    var draftBtn = document.getElementById('sqd-preview-draft-btn');
    var liveBtn  = document.getElementById('sqd-preview-live-btn');
    if (draftBtn) draftBtn.addEventListener('click', function(){ setTimeout(enableHotspots, 100); });
    if (liveBtn)  liveBtn.addEventListener('click',  function(){ disableHotspots(); });
    // Enable by default since we start in draft
    setTimeout(enableHotspots, 800);
  });

  window.QRAIVY_HOTSPOTS = { enable: enableHotspots, disable: disableHotspots, rebuild: buildHotspots };
})();


