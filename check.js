
const S = {
  store: null, zoom: 1, canvasW: 794, canvasH: 1123,
  activePanelId: 'templates', pendingW: 794, pendingH: 1123,
  uploadedImages: [], qrCodes: [], authToken: null,
};

window.addEventListener('load', async () => {
  await initClerk();
  initPolotno();
  renderPanel('templates');
  window.addEventListener('resize', () => editorActions.zoomFit());
  // Init indicator on first active button
  setTimeout(() => {
    const firstActive = document.querySelector('.tool-btn.active');
    if (firstActive) moveIndicator(firstActive);
  }, 100);

  initOnboarding();
  // Ensure topbar always shows A4 on load
  document.getElementById('canvas-size-btn').textContent = 'A4 · 794 × 1123';
  S.canvasW = 794; S.canvasH = 1123; S.pendingW = 794; S.pendingH = 1123;
  const _c = document.getElementById('polotno-container');
  if (_c) { _c.style.width = '794px'; _c.style.height = '1123px'; }
});

async function initClerk() {
  if (!window.Clerk) return;
  await window.Clerk.load();
  if (!window.Clerk.user) { window.location.href = 'login.html'; return; }
  S.authToken = await window.Clerk.session.getToken();
  try {
    const r = await fetch('https://api.qraivy.com/dashboard', { headers: { 'Authorization': 'Bearer ' + S.authToken } });
    const d = await r.json();
    S.qrCodes = d.qrCodes || [];
  } catch(e) {}
}

function initPolotno() {
  const c = document.getElementById('polotno-container');
  c.style.width = S.canvasW + 'px';
  c.style.height = S.canvasH + 'px';
  try {
    if (window.polotno && window.polotno.createStore) {
      S.store = window.polotno.createStore({ key: 'qraivy' });
      S.store.setSize(S.canvasW, S.canvasH);
      if (!S.store.pages.length) S.store.addPage();
      const w = document.createElement('div');
      w.style.cssText = 'width:100%;height:100%';
      c.appendChild(w);
      if (window.polotno.Workspace) {
        window.polotno.Workspace({ store: S.store, components: { Toolbar: null, ZoomButtons: null, PagesTimeline: null } }, w);
      }
      S.store.on('change', () => { updateLayers(); showElementProps(); });
    } else { fallbackCanvas(); }
  } catch(e) { fallbackCanvas(); }
  setTimeout(() => editorActions.zoomFit(), 200);
}

function fallbackCanvas() {
  const c = document.getElementById('polotno-container');
  c.style.cssText += ';display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
  c.innerHTML = '<div style="font-size:3rem;opacity:0.15">⬡</div><div style="font-family:\'DM Mono\',monospace;font-size:0.72rem;color:#999;text-align:center">Canvas ready<br><span style="font-size:0.6rem;opacity:0.5">' + S.canvasW + ' × ' + S.canvasH + 'px</span></div>';
}


// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE ENGINE — JSON-based editable layout system
// This same engine powers AI-generated layouts in Step 2
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  'Marketing': [
    {
      id: 'promo-flyer-dark',
      name: 'Promo Flyer',
      preview: { hasHeader:true, hasTitle:true, hasSubtitle:true, hasImage:true, hasQR:true, hasCTA:true, accent:'#ff5a1f' },
      canvas: { width:794, height:1123, background:'#0a0a0a' },
      elements: [
        { type:'rect', x:0, y:0, width:794, height:180, fill:'#ff5a1f', name:'Header BG' },
        { type:'rect', x:0, y:160, width:794, height:40, fill:'#e04400', name:'Header Accent' },
        { type:'text', x:40, y:40, width:714, text:'SPECIAL OFFER', fontSize:52, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', name:'Main Headline' },
        { type:'text', x:40, y:105, width:714, text:'Limited time deal — scan to claim yours', fontSize:22, fill:'rgba(255,255,255,0.85)', fontFamily:'Inter', name:'Subheadline' },
        { type:'rect', x:40, y:220, width:714, height:380, fill:'#1a1a18', cornerRadius:16, name:'Image Placeholder' },
        { type:'text', x:240, y:380, width:314, text:'📸 Your Image Here', fontSize:18, fill:'rgba(255,255,255,0.25)', fontFamily:'Inter', align:'center', name:'Image Label' },
        { type:'text', x:40, y:630, width:500, text:'Get 30% Off', fontSize:56, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', name:'Offer Text' },
        { type:'text', x:40, y:700, width:500, text:'Use code QRAIVY at checkout.\nValid until end of month.', fontSize:18, fill:'rgba(255,255,255,0.6)', fontFamily:'Inter', name:'Offer Details' },
        { type:'image', x:574, y:620, width:180, height:180, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:574, y:810, width:180, text:'Scan me', fontSize:13, fill:'rgba(255,255,255,0.4)', fontFamily:'Inter', align:'center', name:'QR Label' },
        { type:'rect', x:40, y:1010, width:714, height:72, fill:'#ff5a1f', cornerRadius:12, name:'CTA Button' },
        { type:'text', x:40, y:1033, width:714, text:'CLAIM YOUR OFFER NOW', fontSize:22, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA Text' },
        { type:'text', x:40, y:1095, width:714, text:'qraivy.com', fontSize:14, fill:'rgba(255,255,255,0.3)', fontFamily:'DM Mono', align:'center', name:'Footer URL' }
      ]
    },
    {
      id: 'promo-flyer-light',
      name: 'Promo Light',
      preview: { hasHeader:true, hasTitle:true, hasSubtitle:true, hasBody:true, hasQR:true, hasCTA:true, accent:'#ff5a1f' },
      canvas: { width:794, height:1123, background:'#f0ece0' },
      elements: [
        { type:'rect', x:0, y:0, width:794, height:8, fill:'#ff5a1f', name:'Top Bar' },
        { type:'text', x:40, y:60, width:714, text:'YOUR BRAND', fontSize:18, fontWeight:'bold', fill:'#ff5a1f', fontFamily:'DM Mono', name:'Brand Name' },
        { type:'text', x:40, y:120, width:714, text:'Big Sale\nThis Weekend', fontSize:72, fontWeight:'bold', fill:'#0a0a0a', fontFamily:'Inter', lineHeight:1.1, name:'Headline' },
        { type:'rect', x:40, y:310, width:120, height:6, fill:'#ff5a1f', cornerRadius:3, name:'Divider' },
        { type:'text', x:40, y:340, width:500, text:'Shop our biggest sale of the year.\nUp to 50% off selected items.', fontSize:20, fill:'#333333', fontFamily:'Inter', name:'Body Text' },
        { type:'rect', x:40, y:420, width:714, height:380, fill:'#e8e0d0', cornerRadius:16, name:'Image Area' },
        { type:'text', x:200, y:580, width:394, text:'📸 Your Image Here', fontSize:18, fill:'rgba(0,0,0,0.2)', fontFamily:'Inter', align:'center', name:'Image Label' },
        { type:'image', x:40, y:830, width:160, height:160, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:220, y:840, width:534, text:'Scan for exclusive deals', fontSize:20, fontWeight:'bold', fill:'#0a0a0a', fontFamily:'Inter', name:'QR CTA' },
        { type:'text', x:220, y:875, width:534, text:'Point your camera at the QR code to unlock your discount instantly.', fontSize:15, fill:'#666666', fontFamily:'Inter', name:'QR Description' },
        { type:'rect', x:40, y:1030, width:714, height:60, fill:'#0a0a0a', cornerRadius:10, name:'CTA Button' },
        { type:'text', x:40, y:1050, width:714, text:'Shop Now →', fontSize:20, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA Text' }
      ]
    }
  ],
  'Restaurant': [
    {
      id: 'restaurant-menu',
      name: 'Menu Card',
      preview: { hasHeader:true, hasTitle:true, hasSubtitle:true, hasBody:true, hasQR:true, accent:'#c8860a' },
      canvas: { width:794, height:1123, background:'#1a1208' },
      elements: [
        { type:'rect', x:0, y:0, width:794, height:1123, fill:'#1a1208', name:'Background' },
        { type:'rect', x:30, y:30, width:734, height:1063, fill:'none', strokeWidth:1.5, stroke:'rgba(200,134,10,0.4)', cornerRadius:8, name:'Border Frame' },
        { type:'rect', x:0, y:0, width:794, height:220, fill:'rgba(200,134,10,0.08)', name:'Header Area' },
        { type:'text', x:60, y:55, width:674, text:'✦', fontSize:28, fill:'#c8860a', fontFamily:'Inter', align:'center', name:'Ornament' },
        { type:'text', x:60, y:95, width:674, text:'RESTAURANT NAME', fontSize:38, fontWeight:'bold', fill:'#f0dea0', fontFamily:'Inter', align:'center', name:'Restaurant Name' },
        { type:'text', x:60, y:145, width:674, text:'Fine Dining & Cuisine', fontSize:16, fill:'rgba(200,134,10,0.8)', fontFamily:'DM Mono', align:'center', name:'Tagline' },
        { type:'rect', x:200, y:175, width:394, height:1, fill:'rgba(200,134,10,0.4)', name:'Divider' },
        { type:'text', x:60, y:230, width:674, text:'— STARTERS —', fontSize:13, fill:'rgba(200,134,10,0.7)', fontFamily:'DM Mono', align:'center', name:'Section Label' },
        { type:'text', x:60, y:265, width:480, text:'Bruschetta al Pomodoro', fontSize:18, fontWeight:'bold', fill:'#f0dea0', fontFamily:'Inter', name:'Dish 1 Name' },
        { type:'text', x:60, y:290, width:480, text:'Grilled bread, fresh tomato, basil, olive oil', fontSize:13, fill:'rgba(240,222,160,0.5)', fontFamily:'Inter', name:'Dish 1 Desc' },
        { type:'text', x:660, y:265, width:80, text:'€8.50', fontSize:16, fontWeight:'bold', fill:'#c8860a', fontFamily:'Inter', align:'right', name:'Dish 1 Price' },
        { type:'text', x:60, y:320, width:480, text:'Burrata & Prosciutto', fontSize:18, fontWeight:'bold', fill:'#f0dea0', fontFamily:'Inter', name:'Dish 2 Name' },
        { type:'text', x:60, y:345, width:480, text:'Creamy burrata, aged prosciutto, honey', fontSize:13, fill:'rgba(240,222,160,0.5)', fontFamily:'Inter', name:'Dish 2 Desc' },
        { type:'text', x:660, y:320, width:80, text:'€12.00', fontSize:16, fontWeight:'bold', fill:'#c8860a', fontFamily:'Inter', align:'right', name:'Dish 2 Price' },
        { type:'rect', x:60, y:380, width:674, height:0.5, fill:'rgba(200,134,10,0.2)', name:'Divider 2' },
        { type:'text', x:60, y:400, width:674, text:'— MAINS —', fontSize:13, fill:'rgba(200,134,10,0.7)', fontFamily:'DM Mono', align:'center', name:'Mains Label' },
        { type:'text', x:60, y:435, width:480, text:'Pasta al Tartufo', fontSize:18, fontWeight:'bold', fill:'#f0dea0', fontFamily:'Inter', name:'Dish 3 Name' },
        { type:'text', x:60, y:460, width:480, text:'Handmade pappardelle, black truffle, butter', fontSize:13, fill:'rgba(240,222,160,0.5)', fontFamily:'Inter', name:'Dish 3 Desc' },
        { type:'text', x:660, y:435, width:80, text:'€24.00', fontSize:16, fontWeight:'bold', fill:'#c8860a', fontFamily:'Inter', align:'right', name:'Dish 3 Price' },
        { type:'text', x:60, y:490, width:480, text:'Branzino al Forno', fontSize:18, fontWeight:'bold', fill:'#f0dea0', fontFamily:'Inter', name:'Dish 4 Name' },
        { type:'text', x:60, y:515, width:480, text:'Whole sea bass, lemon, capers, cherry tomato', fontSize:13, fill:'rgba(240,222,160,0.5)', fontFamily:'Inter', name:'Dish 4 Desc' },
        { type:'text', x:660, y:490, width:80, text:'€28.00', fontSize:16, fontWeight:'bold', fill:'#c8860a', fontFamily:'Inter', align:'right', name:'Dish 4 Price' },
        { type:'rect', x:60, y:555, width:674, height:0.5, fill:'rgba(200,134,10,0.2)', name:'Divider 3' },
        { type:'rect', x:60, y:600, width:674, height:340, fill:'rgba(200,134,10,0.05)', cornerRadius:12, name:'Bottom Area' },
        { type:'image', x:297, y:620, width:200, height:200, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:60, y:840, width:674, text:'Scan for full menu & reservations', fontSize:15, fill:'rgba(200,134,10,0.7)', fontFamily:'DM Mono', align:'center', name:'QR Caption' },
        { type:'text', x:60, y:880, width:674, text:'Via Roma 12 · Mon–Sun 12:00–23:00', fontSize:13, fill:'rgba(240,222,160,0.35)', fontFamily:'Inter', align:'center', name:'Address' },
        { type:'text', x:200, y:930, width:394, height:0.5, fill:'rgba(200,134,10,0.3)', name:'Bottom Divider' },
        { type:'text', x:60, y:960, width:674, text:'✦  Buon Appetito  ✦', fontSize:20, fill:'rgba(200,134,10,0.5)', fontFamily:'Inter', align:'center', name:'Footer' }
      ]
    }
  ],
  'Events': [
    {
      id: 'event-poster',
      name: 'Event Poster',
      preview: { hasHeader:true, hasTitle:true, hasSubtitle:true, hasImage:true, hasQR:true, hasCTA:true, accent:'#7c3aed' },
      canvas: { width:794, height:1123, background:'#05082e' },
      elements: [
        { type:'rect', x:0, y:0, width:794, height:1123, fill:'#05082e', name:'Background' },
        { type:'rect', x:0, y:0, width:794, height:500, fill:'rgba(124,58,237,0.08)', name:'Top Gradient' },
        { type:'rect', x:0, y:0, width:794, height:6, fill:'#7c3aed', name:'Top Bar' },
        { type:'text', x:40, y:60, width:714, text:'PRESENTS', fontSize:13, fill:'rgba(124,58,237,0.8)', fontFamily:'DM Mono', align:'center', name:'Presents' },
        { type:'rect', x:40, y:110, width:714, height:260, fill:'rgba(255,255,255,0.03)', cornerRadius:16, name:'Hero Image Area' },
        { type:'text', x:200, y:210, width:394, text:'🎵 Artist Photo', fontSize:18, fill:'rgba(255,255,255,0.15)', fontFamily:'Inter', align:'center', name:'Image Placeholder' },
        { type:'text', x:40, y:410, width:714, text:'ARTIST NAME', fontSize:64, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'Artist Name' },
        { type:'text', x:40, y:490, width:714, text:'WORLD TOUR 2026', fontSize:18, fill:'rgba(124,58,237,0.9)', fontFamily:'DM Mono', align:'center', name:'Tour Name' },
        { type:'rect', x:200, y:530, width:394, height:1, fill:'rgba(124,58,237,0.3)', name:'Divider' },
        { type:'rect', x:60, y:565, width:220, height:80, fill:'rgba(255,255,255,0.04)', cornerRadius:12, name:'Date Box' },
        { type:'text', x:60, y:582, width:220, text:'DATE', fontSize:11, fill:'rgba(124,58,237,0.7)', fontFamily:'DM Mono', align:'center', name:'Date Label' },
        { type:'text', x:60, y:600, width:220, text:'15 June 2026', fontSize:18, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'Date Value' },
        { type:'rect', x:297, y:565, width:200, height:80, fill:'rgba(255,255,255,0.04)', cornerRadius:12, name:'Time Box' },
        { type:'text', x:297, y:582, width:200, text:'DOORS OPEN', fontSize:11, fill:'rgba(124,58,237,0.7)', fontFamily:'DM Mono', align:'center', name:'Time Label' },
        { type:'text', x:297, y:600, width:200, text:'20:00', fontSize:18, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'Time Value' },
        { type:'rect', x:514, y:565, width:220, height:80, fill:'rgba(255,255,255,0.04)', cornerRadius:12, name:'Venue Box' },
        { type:'text', x:514, y:582, width:220, text:'VENUE', fontSize:11, fill:'rgba(124,58,237,0.7)', fontFamily:'DM Mono', align:'center', name:'Venue Label' },
        { type:'text', x:514, y:600, width:220, text:'City Arena', fontSize:18, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'Venue Value' },
        { type:'image', x:297, y:680, width:200, height:200, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:40, y:900, width:714, text:'Scan for tickets & info', fontSize:14, fill:'rgba(255,255,255,0.4)', fontFamily:'DM Mono', align:'center', name:'QR Caption' },
        { type:'rect', x:40, y:960, width:714, height:60, fill:'#7c3aed', cornerRadius:12, name:'Buy Button' },
        { type:'text', x:40, y:980, width:714, text:'BUY TICKETS NOW', fontSize:20, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'Buy CTA' },
        { type:'text', x:40, y:1060, width:714, text:'All ages · Standing & seated available', fontSize:13, fill:'rgba(255,255,255,0.25)', fontFamily:'Inter', align:'center', name:'Footer Note' }
      ]
    }
  ],
  'Business': [
    {
      id: 'business-card',
      name: 'Business Card',
      preview: { hasTitle:true, hasSubtitle:true, hasBody:true, hasQR:true, accent:'#ff5a1f' },
      canvas: { width:680, height:380, background:'#0a0a0a' },
      elements: [
        { type:'rect', x:0, y:0, width:680, height:380, fill:'#0a0a0a', name:'Background' },
        { type:'rect', x:0, y:0, width:6, height:380, fill:'#ff5a1f', name:'Left Bar' },
        { type:'rect', x:6, y:0, width:674, height:380, fill:'rgba(255,255,255,0)', name:'Card Base' },
        { type:'text', x:40, y:60, width:400, text:'YOUR NAME', fontSize:36, fontWeight:'bold', fill:'#f0ece0', fontFamily:'Inter', name:'Name' },
        { type:'text', x:40, y:108, width:400, text:'Job Title · Company Name', fontSize:16, fill:'rgba(255,90,31,0.8)', fontFamily:'DM Mono', name:'Title' },
        { type:'rect', x:40, y:140, width:200, height:1, fill:'rgba(255,255,255,0.1)', name:'Divider' },
        { type:'text', x:40, y:165, width:400, text:'✉  your@email.com', fontSize:14, fill:'rgba(240,236,224,0.55)', fontFamily:'Inter', name:'Email' },
        { type:'text', x:40, y:192, width:400, text:'📞  +1 234 567 8900', fontSize:14, fill:'rgba(240,236,224,0.55)', fontFamily:'Inter', name:'Phone' },
        { type:'text', x:40, y:219, width:400, text:'🌐  yourwebsite.com', fontSize:14, fill:'rgba(240,236,224,0.55)', fontFamily:'Inter', name:'Website' },
        { type:'rect', x:40, y:280, width:400, text:'yourwebsite.com', fontSize:14, fill:'rgba(255,255,255,0.04)', cornerRadius:8, height:60, name:'Tag Area' },
        { type:'text', x:60, y:304, width:360, text:'Premium · Professional · Trusted', fontSize:12, fill:'rgba(255,255,255,0.2)', fontFamily:'DM Mono', align:'center', name:'Tagline' },
        { type:'image', x:490, y:80, width:160, height:160, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:490, y:252, width:160, text:'Scan to connect', fontSize:11, fill:'rgba(255,255,255,0.3)', fontFamily:'DM Mono', align:'center', name:'QR Label' },
        { type:'rect', x:490, y:300, width:160, height:40, fill:'#ff5a1f', cornerRadius:8, name:'CTA Btn' },
        { type:'text', x:490, y:314, width:160, text:'Say Hello →', fontSize:13, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA' }
      ]
    },
    {
      id: 'qr-landing-promo',
      name: 'QR Promo Card',
      preview: { hasHeader:true, hasTitle:true, hasQR:true, hasCTA:true, accent:'#ff5a1f' },
      canvas: { width:559, height:794, background:'#111111' },
      elements: [
        { type:'rect', x:0, y:0, width:559, height:794, fill:'#111111', name:'Background' },
        { type:'rect', x:0, y:0, width:559, height:320, fill:'linear-gradient(180deg,rgba(255,90,31,0.15),transparent)', name:'Header Gradient' },
        { type:'text', x:40, y:55, width:479, text:'⬡ QRAIVY', fontSize:16, fill:'rgba(255,90,31,0.7)', fontFamily:'DM Mono', align:'center', name:'Brand' },
        { type:'text', x:40, y:110, width:479, text:'Scan & Discover', fontSize:48, fontWeight:'bold', fill:'#f0ece0', fontFamily:'Inter', align:'center', name:'Headline' },
        { type:'text', x:60, y:180, width:439, text:'One scan connects your customers to your world — menus, offers, loyalty cards, and more.', fontSize:16, fill:'rgba(240,236,224,0.5)', fontFamily:'Inter', align:'center', name:'Description' },
        { type:'rect', x:60, y:260, width:439, height:1, fill:'rgba(255,90,31,0.2)', name:'Divider' },
        { type:'image', x:155, y:290, width:250, height:250, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'rect', x:60, y:570, width:439, height:80, fill:'rgba(255,255,255,0.03)', cornerRadius:12, name:'Info Box' },
        { type:'text', x:60, y:596, width:439, text:'Point your camera here', fontSize:14, fontWeight:'bold', fill:'rgba(240,236,224,0.7)', fontFamily:'Inter', align:'center', name:'Instruction' },
        { type:'text', x:60, y:618, width:439, text:'No app needed · Works on all phones', fontSize:12, fill:'rgba(240,236,224,0.3)', fontFamily:'Inter', align:'center', name:'Sub Instruction' },
        { type:'rect', x:60, y:685, width:439, height:60, fill:'#ff5a1f', cornerRadius:12, name:'CTA Button' },
        { type:'text', x:60, y:705, width:439, text:'✦ Powered by Qraivy', fontSize:16, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA' },
        { type:'text', x:60, y:758, width:439, text:'qraivy.com', fontSize:12, fill:'rgba(255,255,255,0.2)', fontFamily:'DM Mono', align:'center', name:'Footer' }
      ]
    }
  ],
  'Social': [
    {
      id: 'instagram-promo',
      name: 'Instagram Post',
      preview: { hasHeader:true, hasTitle:true, hasSubtitle:true, hasQR:true, hasCTA:true, accent:'#ff5a1f' },
      canvas: { width:1080, height:1080, background:'#0a0a0a' },
      elements: [
        { type:'rect', x:0, y:0, width:1080, height:1080, fill:'#0a0a0a', name:'Background' },
        { type:'rect', x:0, y:0, width:1080, height:400, fill:'rgba(255,90,31,0.07)', name:'Top Gradient' },
        { type:'rect', x:0, y:0, width:8, height:1080, fill:'#ff5a1f', name:'Left Accent' },
        { type:'text', x:60, y:80, width:960, text:'YOUR BRAND', fontSize:24, fill:'rgba(255,90,31,0.7)', fontFamily:'DM Mono', align:'center', name:'Brand' },
        { type:'text', x:60, y:160, width:960, text:'Big Announcement', fontSize:96, fontWeight:'bold', fill:'#f0ece0', fontFamily:'Inter', align:'center', lineHeight:1.0, name:'Title' },
        { type:'text', x:100, y:340, width:880, text:'Something amazing is coming.\nStay tuned.', fontSize:30, fill:'rgba(240,236,224,0.5)', fontFamily:'Inter', align:'center', name:'Subtitle' },
        { type:'rect', x:340, y:440, width:400, height:2, fill:'rgba(255,90,31,0.3)', name:'Divider' },
        { type:'image', x:390, y:480, width:300, height:300, src:'{{QR_URL}}', name:'QR Code', isQR:true },
        { type:'text', x:60, y:810, width:960, text:'Scan for exclusive content', fontSize:20, fill:'rgba(255,255,255,0.4)', fontFamily:'DM Mono', align:'center', name:'QR Caption' },
        { type:'rect', x:140, y:880, width:800, height:80, fill:'#ff5a1f', cornerRadius:16, name:'CTA Button' },
        { type:'text', x:140, y:906, width:800, text:'LEARN MORE →', fontSize:28, fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA Text' },
        { type:'text', x:60, y:1000, width:960, text:'Follow us · Tag a friend · Share the love', fontSize:16, fill:'rgba(255,255,255,0.2)', fontFamily:'Inter', align:'center', name:'Footer' }
      ]
    }
  ]
};

// ── TEMPLATE RENDERER ─────────────────────────────────────────────────────
// This is the core engine — Claude AI will also output this same JSON format

function loadTemplate(id) {
  // Find template
  let tmpl = null;
  Object.values(TEMPLATES).forEach(cat => {
    const found = cat.find(t => t.id === id);
    if (found) tmpl = found;
  });
  if (!tmpl) return showToast('Template not found');

  // Show loading state
  showLoadingOverlay('Loading template...');

  // Mark template card active
  document.querySelectorAll('.template-card').forEach(c => {
    c.classList.toggle('tc-active', c.dataset.tid === id);
  });

  // Get QR URL — use first available QR or placeholder
  const qrUrl = S.qrCodes.length > 0
    ? S.qrCodes[0].redirectUrl
    : 'https://qraivy.com';
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrUrl);

  // Resize canvas if needed
  if (tmpl.canvas.width !== S.canvasW || tmpl.canvas.height !== S.canvasH) {
    S.canvasW = tmpl.canvas.width;
    S.canvasH = tmpl.canvas.height;
    const c = document.getElementById('polotno-container');
    c.style.width = S.canvasW + 'px';
    c.style.height = S.canvasH + 'px';
    if (S.store) S.store.setSize(S.canvasW, S.canvasH);
    document.getElementById('canvas-size-btn').textContent =
      tmpl.name + ' · ' + S.canvasW + ' × ' + S.canvasH;
  }

  // If Polotno store available — use it
  if (S.store) {
    renderTemplateToStore(tmpl, qrSrc);
  } else {
    // Fallback: render to canvas DOM
    renderTemplateToFallback(tmpl, qrSrc);
  }

  hideLoadingOverlay();
  showToast('✦ ' + tmpl.name + ' loaded — all elements editable');
  S.activeTemplate = id;
}

function loadBlank(bg) {
  setBgColor(bg);
  if (S.store) {
    const page = S.store.pages[0];
    if (page) { page.set({ background: bg }); page.elements.forEach(e => e.remove()); }
  } else {
    const c = document.getElementById('polotno-container');
    c.style.background = bg;
    c.innerHTML = '<div style="font-size:3rem;opacity:0.1;color:' + (bg === '#0a0a0a' ? '#fff' : '#000') + ';display:flex;align-items:center;justify-content:center;height:100%">+</div>';
  }
  showToast('Blank canvas ready');
}

function renderTemplateToStore(tmpl, qrSrc) {
  const page = S.store.pages[0];
  if (!page) return;

  // Clear existing elements
  try { page.elements.forEach(e => e.remove()); } catch(e) {}

  // Set background
  page.set({ background: tmpl.canvas.background || '#ffffff' });

  // Add each element
  tmpl.elements.forEach(function(el, i) {
    setTimeout(function() {
      try {
        const props = Object.assign({}, el);
        delete props.isQR;
        delete props.name;
        if (props.type === 'image' && el.isQR) props.src = qrSrc;
        if (props.type === 'image' && (!props.src || props.src === '{{QR_URL}}')) props.src = qrSrc;
        page.addElement(props);
      } catch(e) { console.warn('Element add failed:', e); }
    }, i * 20);
  });

  setTimeout(() => { updateLayers(); editorActions.zoomFit(); }, tmpl.elements.length * 20 + 200);
}

function renderTemplateToFallback(tmpl, qrSrc) {
  const c = document.getElementById('polotno-container');
  c.style.background = tmpl.canvas.background || '#ffffff';
  c.style.position = 'relative';
  c.style.overflow = 'hidden';

  // Build HTML representation of the template
  let innerHTML = '';
  tmpl.elements.forEach(function(el) {
    const src = (el.isQR || el.src === '{{QR_URL}}') ? qrSrc : (el.src || '');
    if (el.type === 'rect') {
      innerHTML += '<div style="position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + (el.height||40) + 'px;background:' + (el.fill||'transparent') + ';border-radius:' + (el.cornerRadius||0) + 'px;' + (el.stroke ? 'border:' + (el.strokeWidth||1) + 'px solid ' + el.stroke + ';' : '') + '"></div>';
    } else if (el.type === 'text') {
      innerHTML += '<div style="position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;font-size:' + (el.fontSize||16) + 'px;font-weight:' + (el.fontWeight||'normal') + ';color:' + (el.fill||'#000') + ';font-family:' + (el.fontFamily||'Inter') + ',sans-serif;text-align:' + (el.align||'left') + ';line-height:' + (el.lineHeight||1.4) + ';white-space:pre-wrap;">' + (el.text||'') + '</div>';
    } else if (el.type === 'image') {
      innerHTML += '<div style="position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;background:#fff;border-radius:4px;overflow:hidden;"><img src="' + src + '" style="width:100%;height:100%;object-fit:cover"></div>';
    }
  });
  c.innerHTML = innerHTML;
  setTimeout(() => editorActions.zoomFit(), 100);
}

// ── LOADING OVERLAY ────────────────────────────────────────────────────────
function showLoadingOverlay(msg) {
  let ov = document.getElementById('_loadingOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_loadingOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(5,5,5,0.7);backdrop-filter:blur(8px);z-index:8000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity 0.2s;';
    ov.innerHTML = '<div style="width:40px;height:40px;border:2px solid rgba(255,90,31,0.2);border-top-color:#ff5a1f;border-radius:50%;animation:spin 0.7s linear infinite"></div><div style="font-family:monospace;font-size:0.75rem;color:rgba(240,236,224,0.6);letter-spacing:0.08em">' + (msg||'Loading...') + '</div>';
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform:rotate(360deg); } }';
    document.head.appendChild(style);
    document.body.appendChild(ov);
  } else {
    ov.style.opacity = '1';
    ov.style.display = 'flex';
  }
}

function hideLoadingOverlay() {
  const ov = document.getElementById('_loadingOverlay');
  if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.style.display = 'none', 200); }
}

const PANELS = {
  templates: { title: 'Templates', render: () => {
    const cats = Object.keys(TEMPLATES);
    return cats.map(cat => {
      const items = TEMPLATES[cat];
      return '<div class="section-label">' + cat + '</div>' +
        '<div class="template-grid">' +
        items.map(t => {
          const bg = t.canvas.background || '#ffffff';
          const isDark = bg === '#0a0a0a' || bg === '#1a1a18' || bg === '#05082e' || bg.includes('gradient');
          const textColor = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
          const accentColor = t.preview.accent || '#ff5a1f';
          // Mini SVG preview
          const previewSVG = '<svg viewBox="0 0 60 80" xmlns=\'http://www.w3.org/2000/svg\'>' +
            '<rect width=\'60\" height=\'80\" fill=\"' + bg + '\"/>' +
            (t.preview.hasHeader ? '<rect x=\"4\" y=\"6\" width=\"52\" height=\"10\" rx=\"2\" fill=\"' + accentColor + '\" opacity=\"0.9\"/>' : '') +
            (t.preview.hasTitle ? '<rect x=\"4\" y=\"20\" width=\"38\" height=\"5\" rx=\"1\" fill=\"' + textColor + '\" opacity=\"0.8\"/>' : '') +
            (t.preview.hasSubtitle ? '<rect x=\"4\" y=\"28\" width=\"28\" height=\"3\" rx=\"1\" fill=\"' + textColor + '\" opacity=\"0.4\"/>' : '') +
            (t.preview.hasImage ? '<rect x=\"4\" y=\"34\" width=\"52\" height=\"22\" rx=\"2\" fill=\"' + textColor + '\" opacity=\"0.08\"/><text x=\"30\" y=\"49\" text-anchor=\"middle\" font-size=\"8\" fill=\"' + textColor + '\" opacity=\"0.3\">IMG</text>' : '') +
            (t.preview.hasQR ? '<rect x=\"38\" y=\"56\" width=\"18\" height=\"18\" rx=\"2\" fill=\"' + textColor + '\" opacity=\"0.12\"/><rect x=\"40\" y=\"58\" width=\"14\" height=\"14\" rx=\"1\" fill=\"none\" stroke=\"' + textColor + '\" stroke-width=\"1\" opacity=\"0.3\"/>' : '') +
            (t.preview.hasBody ? '<rect x=\"4\" y=\"58\" width=\"30\" height=\"2\" rx=\"1\" fill=\"' + textColor + '\" opacity=\"0.3\"/><rect x=\"4\" y=\"63\" width=\"24\" height=\"2\" rx=\"1\" fill=\"' + textColor + '\" opacity=\"0.2\"/><rect x=\"4\" y=\"68\" width=\"20\" height=\"2\" rx=\"1\" fill=\"' + textColor + '\" opacity=\"0.15\"/>' : '') +
            (t.preview.hasCTA ? '<rect x=\"4\" y=\"70\" width=\"52\" height=\"8\" rx=\"3\" fill=\"' + accentColor + '\"/>' : '') +
            '</svg>';
          return '<div class=\"template-card\" data-tid=\"' + t.id + '\" onclick=\"loadTemplate(\'' + t.id + '\')\"><div class=\"tc-preview\" style=\"padding:0;overflow:hidden\">' + previewSVG + '</div><div class=\"tc-label\">' + t.name + '</div></div>';
        }).join('') + '</div>';
    }).join('') +
    '<div class="section-label">Blank</div>' +
    '<div class="template-grid">' +
    '<div class="template-card" onclick="loadBlank(&quot;#ffffff&quot;)"><div class="tc-preview" style="background:#fff;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:rgba(0,0,0,0.2)">+</div><div class="tc-label">White</div></div>' +
    '<div class="template-card" onclick="loadBlank(&quot;#0a0a0a&quot;)"><div class="tc-preview" style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:rgba(255,255,255,0.2)">+</div><div class="tc-label">Dark</div></div>' +
    '</div>';
  }},
  elements: { title: 'Elements', render: () => `
    <div class="section-label">Shapes</div>
    <div class="element-grid">
      ${[['⬜','Rectangle','rect'],['⬬','Ellipse','ellipse'],['△','Triangle','triangle'],['★','Star','star'],['╱','Line','line'],['◈','Arrow','arrow']].map(([i,l,t]) => `<div class="element-btn" onclick="addElement('${t}')"><span class="ei">${i}</span><span class="el">${l}</span></div>`).join('')}
    </div>
    <div class="section-label">Decorative</div>
    <div class="element-grid">
      ${[['▬','Divider'],['⬡','Badge'],['🏷','Label'],['📐','Grid']].map(([i,l]) => `<div class="element-btn" onclick="showToast('Add ${l}')"><span class="ei">${i}</span><span class="el">${l}</span></div>`).join('')}
    </div>` },
  text: { title: 'Text', render: () => `
    <div class="section-label">Add Text</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${[['H','Heading','heading',800],['H2','Subheading','subheading',600],['¶','Body Text','body',400],['ab','Caption','caption',300]].map(([ic,l,s,w]) => `<div class="element-btn" style="flex-direction:row;justify-content:flex-start;gap:12px" onclick="addText('${s}')"><span style="font-size:1.1rem;font-weight:${w};color:var(--text);width:24px;text-align:center">${ic}</span><span class="el" style="font-size:0.72rem">${l}</span></div>`).join('')}
    </div>
    <div class="section-label">Font Presets</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${['Inter','DM Mono','Georgia','Playfair Display'].map(f => `<div class="element-btn" style="flex-direction:row;justify-content:space-between" onclick="addTextWithFont('${f}')"><span style="font-family:'${f}',serif;font-size:0.85rem;color:var(--text)">${f}</span><span class="el">+ Add</span></div>`).join('')}
    </div>` },
  images: { title: 'Images', render: () => `
    <div class="upload-zone" onclick="document.getElementById('upload-input').click()">
      <div class="uz-icon">⬆</div>
      <div class="uz-text">Click to upload image<br><span style="opacity:0.5">PNG, JPG, SVG, WebP</span></div>
    </div>
    <input type="file" id="upload-input" accept="image/*" multiple onchange="handleUpload(event)" style="display:none">
    ${S.uploadedImages.length ? `<div class="section-label">Uploaded</div><div class="uploaded-grid">${S.uploadedImages.map(img => `<div class="uploaded-img" onclick="addImageToCanvas('${img}')"><img src="${img}"></div>`).join('')}</div>` : ''}` },
  qrcodes: { title: 'QR Codes', render: () => S.qrCodes.length ? `
    <div class="section-label">Your QR Codes</div>
    <div class="qr-list">
      ${S.qrCodes.map(q => `<div class="qr-item" onclick="addQR('${q.redirectUrl}')"><div class="qr-item-thumb"><img src="https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(q.redirectUrl)}"></div><div class="qr-item-info"><div class="qr-item-name">${q.businessName||'QR Code'}</div><div class="qr-item-url">${q.redirectUrl}</div></div></div>`).join('')}
    </div>` : `<div class="empty-state"><div class="es-icon">⬡</div><p>No QR codes yet.<br>Create one in the Dashboard.</p></div><a href="dashboard.html" class="tb-btn primary" style="width:100%;justify-content:center;text-decoration:none;display:flex;margin-top:12px">Go to Dashboard</a>` },
  background: { title: 'Background', render: () => `
    <div class="section-label">Colors</div>
    <div class="color-row" style="flex-wrap:wrap;gap:8px">
      ${['#ffffff','#0a0a0a','#ff5a1f','#1a1a18','#f0ece0','#05082e','#ff8c00','#2d2d2d'].map(c => `<div class="color-swatch" style="background:${c};width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" onclick="setBgColor('${c}')"></div>`).join('')}
    </div>
    <div class="section-label">Gradients</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${[['Sunset','linear-gradient(135deg,#ff5a1f,#ff8c00)'],['Dark','linear-gradient(135deg,#0a0a0a,#2d2d2d)'],['Ocean','linear-gradient(135deg,#0f0c29,#302b63)'],['Warm','linear-gradient(135deg,#f0ece0,#e8d5b0)']].map(([n,g]) => `<div style="height:48px;border-radius:8px;background:${g};cursor:pointer;border:1px solid var(--border);display:flex;align-items:flex-end;padding:4px 6px" onclick="setBgGradient('${g}')"><span style="font-family:var(--mono);font-size:0.55rem;color:rgba(255,255,255,0.8)">${n}</span></div>`).join('')}
    </div>` }
};

function renderPanel(id) {
  const p = PANELS[id]; if (!p) return;
  document.getElementById('panel-title').textContent = p.title;
  document.getElementById('panel-body').innerHTML = p.render();
}

function togglePanel(id, btn) {
  const panel = document.getElementById('left-panel');
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

  if (S.activePanelId === id && panel.classList.contains('open')) {
    panel.classList.remove('open');
    S.activePanelId = null;
    hideIndicator();
  } else {
    panel.classList.add('open');
    S.activePanelId = id;
    btn.classList.add('active');
    renderPanel(id);
    moveIndicator(btn);
  }
}

// ── TOOLBAR INDICATOR ──────────────────────────────────────
function moveIndicator(btn) {
  const indicator = document.getElementById('toolbar-indicator');
  if (!indicator || !btn) return;
  const toolbar = document.getElementById('left-toolbar');
  const tbRect = toolbar.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const top = btnRect.top - tbRect.top;
  const height = btnRect.height;
  indicator.style.top = (top + height * 0.18) + 'px';
  indicator.style.height = (height * 0.64) + 'px';
  indicator.style.opacity = '1';
}

function hideIndicator() {
  const indicator = document.getElementById('toolbar-indicator');
  if (indicator) indicator.style.opacity = '0';
}


// ── COMMAND PALETTE ───────────────────────────────────────────
const CP_COMMANDS = [
  { id:'ai-generate',  icon:'✦',  label:'Generate with AI',       hint:'AI',  action: () => showAIModal(),                         category:'AI' },
  { id:'ai-template',  icon:'⊞',  label:'AI Smart Template',      hint:'AI',  action: () => showAIModal(),                         category:'AI' },
  { id:'tmpl',         icon:'⊞',  label:'Browse Templates',       hint:'T',   action: () => { togglePanel('templates', document.querySelector('[data-panel=templates]')); }, category:'Add' },
  { id:'text',         icon:'T',  label:'Add Text Block',         hint:'X',   action: () => { togglePanel('text', document.querySelector('[data-panel=text]')); },          category:'Add' },
  { id:'qr',           icon:'⬡',  label:'Insert QR Code',         hint:'Q',   action: () => { togglePanel('qrcodes', document.querySelector('[data-panel=qrcodes]')); },    category:'Add' },
  { id:'image',        icon:'🖼', label:'Upload Image',           hint:'I',   action: () => { togglePanel('images', document.querySelector('[data-panel=images]')); },      category:'Add' },
  { id:'bg',           icon:'🎨', label:'Change Background',      hint:'B',   action: () => { togglePanel('background', document.querySelector('[data-panel=background]')); }, category:'Add' },
  { id:'promo-block',  icon:'🎯', label:'Add Promo Block',        hint:'',    action: () => { loadTemplate('promo-flyer-dark'); closeCp(); },  category:'Blocks' },
  { id:'menu-block',   icon:'🍽', label:'Add Restaurant Menu',    hint:'',    action: () => { loadTemplate('restaurant-menu'); closeCp(); },   category:'Blocks' },
  { id:'event-block',  icon:'🎵', label:'Add Event Poster',       hint:'',    action: () => { loadTemplate('event-poster'); closeCp(); },      category:'Blocks' },
  { id:'biz-block',    icon:'💼', label:'Add Business Card',      hint:'',    action: () => { loadTemplate('business-card'); closeCp(); },     category:'Blocks' },
  { id:'ig-block',     icon:'📱', label:'Add Instagram Post',     hint:'',    action: () => { loadTemplate('instagram-promo'); closeCp(); },   category:'Blocks' },
  { id:'png',          icon:'⬇', label:'Export PNG',             hint:'',    action: () => editorActions.exportPNG(),              category:'Export' },
  { id:'pdf',          icon:'⬇', label:'Export PDF',             hint:'',    action: () => editorActions.exportPDF(),              category:'Export' },
  { id:'save',         icon:'💾', label:'Save Design',            hint:'⌘S',  action: () => editorActions.save(),                   category:'File' },
  { id:'undo',         icon:'↩', label:'Undo',                   hint:'⌘Z',  action: () => editorActions.undo(),                   category:'File' },
  { id:'redo',         icon:'↪', label:'Redo',                   hint:'⌘Y',  action: () => editorActions.redo(),                   category:'File' },
];

let cpSelectedIdx = 0;
let cpFiltered = [...CP_COMMANDS];

function openCp() {
  const cp = document.getElementById('command-palette');
  cp.classList.add('open');
  cpFiltered = [...CP_COMMANDS];
  renderCpResults('');
  setTimeout(() => document.getElementById('cp-input').focus(), 50);
}

function closeCp() {
  document.getElementById('command-palette').classList.remove('open');
  document.getElementById('cp-input').value = '';
}

function filterCommands(q) {
  const query = q.toLowerCase().trim();
  cpFiltered = query
    ? CP_COMMANDS.filter(c => c.label.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
    : CP_COMMANDS;
  cpSelectedIdx = 0;
  renderCpResults(query);
}

function renderCpResults(query) {
  const container = document.getElementById('cp-results');
  if (!cpFiltered.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--mono);font-size:0.68rem;color:rgba(255,255,255,0.2)">No commands found</div>';
    return;
  }

  // Group by category
  const grouped = {};
  cpFiltered.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  let html = '';
  let globalIdx = 0;
  Object.entries(grouped).forEach(([cat, items]) => {
    if (!query) html += '<div class="cp-section-label">' + cat + '</div>';
    items.forEach(item => {
      const isAI = cat === 'AI';
      const selected = globalIdx === cpSelectedIdx;
      html += '<div class="cp-item' + (selected ? ' cp-selected' : '') + '" data-idx="' + globalIdx + '" onclick="executeCpItem(' + globalIdx + ')">';
      html += '<div class="cp-item-icon' + (isAI ? ' ai' : '') + '">' + item.icon + '</div>';
      html += '<div class="cp-item-name">' + item.label + '</div>';
      if (item.hint) html += '<div class="cp-item-hint">' + item.hint + '</div>';
      html += '</div>';
      globalIdx++;
    });
  });

  container.innerHTML = html;
}

function executeCpItem(idx) {
  const flat = [];
  const grouped = {};
  cpFiltered.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });
  Object.values(grouped).forEach(items => items.forEach(i => flat.push(i)));
  if (flat[idx]) {
    closeCp();
    flat[idx].action();
  }
}

function cpKeyNav(e) {
  const flat = cpFiltered;
  if (e.key === 'ArrowDown') { e.preventDefault(); cpSelectedIdx = Math.min(cpSelectedIdx+1, flat.length-1); renderCpResults(document.getElementById('cp-input').value); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); cpSelectedIdx = Math.max(cpSelectedIdx-1, 0); renderCpResults(document.getElementById('cp-input').value); }
  if (e.key === 'Enter')     { e.preventDefault(); executeCpItem(cpSelectedIdx); }
  if (e.key === 'Escape')    { closeCp(); }
}

document.getElementById('command-palette').addEventListener('click', e => {
  if (e.target === document.getElementById('command-palette')) closeCp();
});

// ── AI THINKING STATE SYSTEM ──────────────────────────────────
const AI_MESSAGES = [
  'Analysing your prompt...',
  'Generating layout structure...',
  'Building QR experience...',
  'Creating campaign visuals...',
  'Applying brand colours...',
  'Finalising your design...'
];

function showAIThinking(durationMs, onComplete) {
  const overlay = document.getElementById('ai-thinking');
  overlay.classList.add('active');

  const textEl = document.getElementById('ai-thinking-text');
  const steps = [1,2,3,4,5].map(i => document.getElementById('ai-step-'+i));
  steps.forEach(s => { s.classList.remove('active','done'); });

  let msgIdx = 0;
  let stepIdx = 0;

  textEl.textContent = AI_MESSAGES[0];

  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % AI_MESSAGES.length;
    textEl.style.animation = 'none';
    setTimeout(() => {
      textEl.textContent = AI_MESSAGES[msgIdx];
      textEl.style.animation = 'textFade 0.5s ease';
    }, 50);
  }, Math.floor(durationMs / AI_MESSAGES.length));

  const stepInterval = setInterval(() => {
    if (stepIdx < steps.length) {
      if (stepIdx > 0) steps[stepIdx-1].classList.replace('active','done');
      steps[stepIdx].classList.add('active');
      stepIdx++;
    }
  }, Math.floor(durationMs / (steps.length + 1)));

  setTimeout(() => {
    clearInterval(msgInterval);
    clearInterval(stepInterval);
    steps.forEach(s => s.classList.remove('active'));
    overlay.classList.remove('active');
    if (onComplete) onComplete();
  }, durationMs);
}

// ── SMART MARKETING BLOCKS PANEL ─────────────────────────────
function renderBlocksPanel() {
  return '<div class="section-label">Quick Blocks</div>' +
    '<div class="block-grid">' +
    [
      { icon:'🎯', name:'Promo Block', desc:'Sale offer + QR', tid:'promo-flyer-dark' },
      { icon:'🍽', name:'Menu Card', desc:'Restaurant layout', tid:'restaurant-menu' },
      { icon:'🎵', name:'Event Poster', desc:'Ticket promo', tid:'event-poster' },
      { icon:'💼', name:'Biz Card', desc:'Professional', tid:'business-card' },
      { icon:'📱', name:'Instagram', desc:'Social post', tid:'instagram-promo' },
      { icon:'⬡', name:'QR Promo', desc:'Scan-first design', tid:'qr-landing-promo' },
    ].map(b =>
      '<div class="block-card" onclick="loadTemplate(\'' + b.tid + '\')">' +
        '<div class="block-icon">' + b.icon + '</div>' +
        '<div class="block-name">' + b.name + '</div>' +
        '<div class="block-desc">' + b.desc + '</div>' +
      '</div>'
    ).join('') +
  '</div>';
}

// Patch keyboard shortcuts to add "/" for command palette
// ── KEYBOARD SHORTCUTS ─────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const map = { 't': 'templates', 'e': 'elements', 'x': 'text', 'i': 'images', 'q': 'qrcodes', 'b': 'background' };
  const panelId = map[e.key.toLowerCase()];
  if (panelId) {
    const btn = document.querySelector('.tool-btn[data-panel="' + panelId + '"]');
    if (btn) { btn.click(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); editorActions.undo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); editorActions.redo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); editorActions.save(); }
  if (e.key === '/') { e.preventDefault(); openCp(); }
});

function switchRTab(id, btn) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('rtab-' + id).classList.add('active');
}

function applyZoom(z) {
  S.zoom = Math.min(3, Math.max(0.1, z));
  document.getElementById('canvas-wrapper').style.transform = 'scale(' + S.zoom + ')';
  document.getElementById('zoom-label').textContent = Math.round(S.zoom * 100) + '%';
}

function openSizeModal() { document.getElementById('size-modal').classList.add('open'); }
function closeSizeModal() { document.getElementById('size-modal').classList.remove('open'); }
function selectSize(el) { document.querySelectorAll('.size-opt').forEach(s => s.classList.remove('active')); el.classList.add('active'); S.pendingW = parseInt(el.dataset.w); S.pendingH = parseInt(el.dataset.h); }
function applySize() {
  S.canvasW = S.pendingW; S.canvasH = S.pendingH;
  const c = document.getElementById('polotno-container');
  c.style.width = S.canvasW + 'px'; c.style.height = S.canvasH + 'px';
  if (S.store) S.store.setSize(S.canvasW, S.canvasH);
  document.getElementById('canvas-size-btn').textContent = document.querySelector('.size-opt.active .size-opt-name').textContent + ' · ' + S.canvasW + ' × ' + S.canvasH;
  closeSizeModal(); setTimeout(() => editorActions.zoomFit(), 100);
}

function addElement(type) {
  if (!S.store) return showToast('Canvas loading...');
  const page = S.store.pages[0]; if (!page) return;
  const map = { rect:{type:'rect',width:200,height:120,fill:'#ff5a1f',x:100,y:100}, ellipse:{type:'circle',width:150,height:150,fill:'#ff5a1f',x:120,y:120}, line:{type:'rect',width:300,height:4,fill:'#ff5a1f',x:50,y:200} };
  page.addElement(map[type] || map.rect); updateLayers();
}
function addText(style) {
  if (!S.store) return showToast('Canvas loading...');
  const page = S.store.pages[0]; if (!page) return;
  const map = { heading:{text:'Your Heading',fontSize:48,fontWeight:'bold',fill:'#0a0a0a'}, subheading:{text:'Subheading',fontSize:28,fontWeight:'600',fill:'#0a0a0a'}, body:{text:'Body text here',fontSize:16,fill:'#333333'}, caption:{text:'Caption',fontSize:12,fill:'#666666'} };
  page.addElement({ type:'text', ...(map[style]||map.body), x:80, y:100, width:S.canvasW-160 }); updateLayers();
}
function addTextWithFont(font) {
  if (!S.store) return showToast('Canvas loading...');
  const page = S.store.pages[0]; if (!page) return;
  page.addElement({ type:'text', text:'Your text here', fontSize:32, fontFamily:font, fill:'#0a0a0a', x:80, y:100, width:S.canvasW-160 }); updateLayers();
}
function addQR(url) {
  if (!S.store) return showToast('Canvas loading...');
  const page = S.store.pages[0]; if (!page) return;
  const src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(url);
  page.addElement({ type:'image', src, width:200, height:200, x:S.canvasW/2-100, y:S.canvasH/2-100 }); updateLayers(); showToast('QR added to canvas');
}
function addImageToCanvas(url) {
  if (!S.store) return;
  const page = S.store.pages[0]; if (!page) return;
  page.addElement({ type:'image', src:url, width:300, height:200, x:50, y:50 }); updateLayers();
}
function handleUpload(e) {
  Array.from(e.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => { S.uploadedImages.push(ev.target.result); renderPanel('images'); addImageToCanvas(ev.target.result); };
    reader.readAsDataURL(file);
  });
}
function setBgColor(color) {
  document.getElementById('polotno-container').style.background = color;
  document.getElementById('bg-color-preview').style.background = color;
  document.getElementById('bg-color-hex').textContent = color;
  if (S.store && S.store.pages[0]) S.store.pages[0].set({ background: color });
}
function setBgGradient(g) { document.getElementById('polotno-container').style.background = g; }
function setTextColor(color) {
  document.getElementById('text-color-preview').style.background = color;
  document.getElementById('text-color-hex').textContent = color;
  if (S.store) { const sel = S.store.selectedElements; if (sel && sel.length) sel[0].set({ fill: color }); }
}
function applyAlign(dir) {
  if (!S.store) return;
  const sel = S.store.selectedElements; if (!sel || !sel.length) return;
  const el = sel[0];
  const x = dir==='left'?0:dir==='center'?S.canvasW/2-(el.width||0)/2:S.canvasW-(el.width||0);
  el.set({ x });
}
function updateLayers() {
  if (!S.store) return;
  const page = S.store.pages[0]; if (!page) return;
  const els = page.elements || [];
  const list = document.getElementById('layer-list');
  if (!els.length) { list.innerHTML = '<div class="empty-state"><div class="es-icon">⊹</div><p>No elements yet.</p></div>'; return; }
  const icons = { text:'T', image:'🖼', rect:'⬜', circle:'⬬', svg:'◈' };
  list.innerHTML = [...els].reverse().map(el => `<div class="layer-item${el.selected?' selected':''}" onclick="selectLayer('${el.id}')"><span class="layer-icon">${icons[el.type]||'◈'}</span><span class="layer-name">${el.text||el.type||'Element'}</span><button class="layer-vis" onclick="event.stopPropagation();toggleVis('${el.id}')">${el.visible===false?'🙈':'👁'}</button></div>`).join('');
}
function selectLayer(id) { if (S.store) { S.store.selectElements([id]); showElementProps(); } }
function toggleVis(id) { if (!S.store) return; const p=S.store.pages[0]; if(!p)return; const el=p.elements.find(e=>e.id===id); if(el)el.set({visible:el.visible===false}); updateLayers(); }
function showElementProps() {
  if (!S.store) return;
  const sel = S.store.selectedElements;
  const noSel = document.getElementById('no-selection');
  const tp = document.getElementById('text-props');
  const ip = document.getElementById('image-props');
  if (sel && sel.length) {
    noSel.style.display = 'none';
    if (sel[0].type === 'text') { tp.style.display='block'; ip.style.display='none'; }
    else { ip.style.display='block'; tp.style.display='none'; const el=sel[0]; document.getElementById('prop-x').value=Math.round(el.x||0); document.getElementById('prop-y').value=Math.round(el.y||0); document.getElementById('prop-w').value=Math.round(el.width||0); document.getElementById('prop-h').value=Math.round(el.height||0); }
  } else { noSel.style.display='block'; tp.style.display='none'; ip.style.display='none'; }
}

const editorActions = {
  undo() { if (S.store) S.store.history.undo(); },
  redo() { if (S.store) S.store.history.redo(); },
  zoomIn()  { applyZoom(S.zoom + 0.1); },
  zoomOut() { applyZoom(S.zoom - 0.1); },
  zoomFit() {
    const area = document.getElementById('canvas-area');
    const scale = Math.min((area.clientWidth - 80) / S.canvasW, (area.clientHeight - 80) / S.canvasH, 1);
    applyZoom(scale);
  },
  save() {
    const name = document.getElementById('file-name').value || 'design';
    if (S.store) localStorage.setItem('qraivy_design_' + name, JSON.stringify(S.store.toJSON()));
    showToast('Saved: ' + name);
  },
  exportPNG() {
    if (S.store && S.store.toDataURL) { S.store.toDataURL({pixelRatio:2}).then(url => { const a=document.createElement('a'); a.href=url; a.download='qraivy-design.png'; a.click(); }); }
    else showToast('Select elements first');
  },
  exportPDF() { showToast('PDF export via Puppeteer — coming in Step 2'); }
};

// ── CANVAS ONBOARDING ─────────────────────────────────────────
function dismissOnboarding() {
  const el = document.getElementById('canvas-onboarding');
  if (el) { el.classList.add('hidden'); setTimeout(() => el.style.display='none', 400); }
  localStorage.setItem('qraivy_onboarding_dismissed', '1');
}

function initOnboarding() {
  if (localStorage.getItem('qraivy_onboarding_dismissed')) {
    const el = document.getElementById('canvas-onboarding');
    if (el) el.style.display = 'none';
  }
}


function selectAIStyle(id) {
  S.selectedAIStyle = id;
  document.querySelectorAll('[id^="style_"]').forEach(btn => {
    btn.style.borderColor = 'rgba(255,255,255,0.08)';
  });
  const sel = document.getElementById('style_' + id);
  if (sel) sel.style.borderColor = 'rgba(255,90,31,0.7)';
}

document.addEventListener("click",function(e){if(e.target&&e.target.id==="_aiGenerateBtn")triggerAIGenerate();});
function triggerAIGenerate() {

  const prompt = document.getElementById('_aiPrompt').value.trim();
  if (!prompt) { showToast('Enter a design description first'); return; }

  const size = document.getElementById('_aiSize') ? document.getElementById('_aiSize').value : 'a4';
  const style = S.selectedAIStyle || 'dark-luxury';
  const includeQR = document.getElementById('_aiQR') ? document.getElementById('_aiQR').value !== 'none' : true;

  // Close modal
  const modal = document.getElementById('_aiModal');
  if (modal) { modal.style.opacity='0'; modal.style.transition='opacity 0.2s'; setTimeout(()=>modal.style.display='none',200); }

  // Dismiss onboarding
  dismissOnboarding();

  // Show cinematic generation overlay
  runCinematicGeneration(prompt, size, style, includeQR);
}

// ── CINEMATIC AI GENERATION ENGINE ────────────────────────────
const GENERATION_STAGES = [
  { label: 'Analysing your prompt...', duration: 900 },
  { label: 'Generating layout structure...', duration: 1100 },
  { label: 'Creating visual hierarchy...', duration: 900 },
  { label: 'Building QR experience...', duration: 800 },
  { label: 'Applying brand system...', duration: 700 },
  { label: 'Rendering editable design...', duration: 600 },
];

const STYLE_TEMPLATES = {
  'dark-luxury':    'promo-flyer-dark',
  'bold-orange':    'promo-flyer-dark',
  'minimal-white':  'promo-flyer-light',
  'restaurant-gold':'restaurant-menu',
  'event-purple':   'event-poster',
  'editorial':      'promo-flyer-light',
};

const SIZE_MAP = {
  'a4': { width:794, height:1123, name:'A4 Poster' },
  'a5': { width:559, height:794,  name:'A5 Flyer' },
  'business': { width:680, height:380, name:'Business Card' },
  'square': { width:1080, height:1080, name:'Instagram' },
  'dl': { width:374, height:794, name:'DL Flyer' },
};

function runCinematicGeneration(prompt, size, style, includeQR) {
  // Build the overlay
  let overlay = document.getElementById('_genOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_genOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,4,4,0.95);backdrop-filter:blur(20px);gap:0;overflow:hidden';
    document.body.appendChild(overlay);
  }

  overlay.style.display = 'flex';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.3s ease';

  overlay.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 50%,rgba(255,90,31,0.08),transparent 65%);pointer-events:none;animation:atmosphereShift 6s ease-in-out infinite alternate"></div>

    <!-- Floating particles -->
    <canvas id="_genParticles" style="position:absolute;inset:0;pointer-events:none;opacity:0.4"></canvas>

    <!-- Main content -->
    <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:32px;max-width:440px;padding:0 24px;text-align:center">

      <!-- AI Orb -->
      <div style="position:relative">
        <div id="_genOrb" style="width:96px;height:96px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,150,60,0.7),rgba(255,90,31,0.5),rgba(200,50,0,0.2));box-shadow:0 0 60px rgba(255,90,31,0.5),0 0 120px rgba(255,90,31,0.2);animation:orbPulse 2s ease-in-out infinite;display:flex;align-items:center;justify-content:center;font-size:32px;color:rgba(255,255,255,0.9)">✦</div>
        <div style="position:absolute;inset:-12px;border-radius:50%;border:1px solid rgba(255,90,31,0.2);animation:heroRingPulse 2.5s ease-in-out infinite"></div>
        <div style="position:absolute;inset:-24px;border-radius:50%;border:1px solid rgba(255,90,31,0.08);animation:heroRingPulse 2.5s ease-in-out infinite 0.5s"></div>
      </div>

      <!-- Stage text -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div id="_genStageText" style="font-family:'DM Mono',monospace;font-size:0.85rem;color:rgba(255,130,60,0.9);letter-spacing:0.1em;animation:textFade 0.4s ease">Analysing your prompt...</div>
        <div style="font-size:0.78rem;color:rgba(240,236,224,0.3);font-family:'DM Mono',monospace;max-width:320px;line-height:1.6;font-style:italic">"${prompt.length > 60 ? prompt.substring(0,60) + '...' : prompt}"</div>
      </div>

      <!-- Progress bar -->
      <div style="width:280px;height:2px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
        <div id="_genProgress" style="height:100%;width:0%;background:linear-gradient(90deg,#ff5a1f,#ff8c00);border-radius:2px;transition:width 0.8s ease;box-shadow:0 0 8px rgba(255,90,31,0.6)"></div>
      </div>

      <!-- Steps -->
      <div style="display:flex;flex-direction:column;gap:6px;width:100%;max-width:300px">
        <div id="_gs0" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">1</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Analysing your prompt...</div></div>
        <div id="_gs1" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">2</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Generating layout structure...</div></div>
        <div id="_gs2" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">3</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Creating visual hierarchy...</div></div>
        <div id="_gs3" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">4</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Building QR experience...</div></div>
        <div id="_gs4" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">5</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Applying brand system...</div></div>
        <div id="_gs5" style="display:flex;align-items:center;gap:10px;padding:4px 0;opacity:0.2;transition:opacity 0.3s,color 0.3s"><div style="width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">6</div><div style="font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.04em;text-align:left">Rendering editable design...</div></div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    initGenParticles();
    runGenerationStages(prompt, size, style, includeQR);
  });
}

function initGenParticles() {
  const canvas = document.getElementById('_genParticles');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = Array.from({length: 30}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.5,
    speedX: (Math.random() - 0.5) * 0.4,
    speedY: -Math.random() * 0.6 - 0.2,
    opacity: Math.random() * 0.4 + 0.1,
    color: Math.random() > 0.5 ? '255,90,31' : '255,140,0',
  }));

  let animId;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.speedX; p.y += p.speedY; p.opacity -= 0.001;
      if (p.y < -10 || p.opacity <= 0) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; p.opacity = Math.random() * 0.4 + 0.1; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(' + p.color + ',' + p.opacity + ')'; ctx.fill();
    });
    animId = requestAnimationFrame(animate);
  }
  animate();
  canvas._animId = animId;
}

function runGenerationStages(prompt, size, style, includeQR) {
  let stageIdx = 0;
  let elapsed = 0;
  const total = GENERATION_STAGES.reduce((s,g) => s + g.duration, 0);

  function runStage() {
    if (stageIdx >= GENERATION_STAGES.length) {
      // Generation complete — render layout
      setTimeout(() => revealGeneratedLayout(prompt, size, style, includeQR), 300);
      return;
    }

    const stage = GENERATION_STAGES[stageIdx];

    // Update stage text
    const stageText = document.getElementById('_genStageText');
    if (stageText) {
      stageText.style.animation = 'none';
      setTimeout(() => { stageText.textContent = stage.label; stageText.style.animation = 'textFade 0.4s ease'; }, 50);
    }

    // Update step indicators
    for (let i = 0; i < GENERATION_STAGES.length; i++) {
      const el = document.getElementById('_gs' + i);
      if (!el) continue;
      if (i < stageIdx) { el.style.opacity = '0.3'; el.style.color = 'rgba(255,255,255,0.3)'; }
      else if (i === stageIdx) { el.style.opacity = '1'; el.style.color = 'rgba(255,130,60,0.9)'; }
      else { el.style.opacity = '0.2'; el.style.color = 'rgba(255,255,255,0.2)'; }
    }

    // Update progress bar
    elapsed += stage.duration;
    const pct = Math.round((elapsed / total) * 100);
    const bar = document.getElementById('_genProgress');
    if (bar) bar.style.width = pct + '%';

    stageIdx++;
    setTimeout(runStage, stage.duration);
  }

  runStage();
}

function revealGeneratedLayout(prompt, size, style, includeQR) {
  // Determine which template to use based on style
  const templateId = STYLE_TEMPLATES[style] || 'promo-flyer-dark';

  // Customize the template based on the prompt
  const customLayout = buildCustomLayout(prompt, size, style, includeQR);

  // Hide generation overlay with cinematic reveal
  const overlay = document.getElementById('_genOverlay');
  if (overlay) {
    const stageText = document.getElementById('_genStageText');
    if (stageText) { stageText.textContent = 'Design ready ✦'; stageText.style.color = 'rgba(100,255,100,0.8)'; }

    const bar = document.getElementById('_genProgress');
    if (bar) bar.style.width = '100%';

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
        // Cancel particles animation
        const canvas = document.getElementById('_genParticles');
        if (canvas && canvas._animId) cancelAnimationFrame(canvas._animId);
        // Render the layout
        renderAILayout(customLayout);
      }, 400);
    }, 600);
  }
}

function buildCustomLayout(prompt, size, style, includeQR) {
  // Map styles to theme colors
  const themes = {
    'dark-luxury':    { bg:'#0a0a0a', primary:'#ff5a1f', text:'#f0ece0', secondary:'rgba(255,255,255,0.6)' },
    'bold-orange':    { bg:'#ff5a1f', primary:'#0a0a0a', text:'#ffffff', secondary:'rgba(0,0,0,0.7)' },
    'minimal-white':  { bg:'#f5f5f0', primary:'#0a0a0a', text:'#0a0a0a', secondary:'rgba(0,0,0,0.5)' },
    'restaurant-gold':{ bg:'#1a1208', primary:'#c8860a', text:'#f0dea0', secondary:'rgba(200,134,10,0.7)' },
    'event-purple':   { bg:'#05082e', primary:'#7c3aed', text:'#ffffff', secondary:'rgba(255,255,255,0.6)' },
    'editorial':      { bg:'#ffffff', primary:'#222222', text:'#222222', secondary:'rgba(0,0,0,0.5)' },
  };

  const theme = themes[style] || themes['dark-luxury'];
  const dims = SIZE_MAP[size] || SIZE_MAP['a4'];
  const W = dims.width;
  const H = dims.height;

  // Extract key words from prompt for layout text
  const words = prompt.split(' ');
  const headline = words.slice(0,4).join(' ').toUpperCase() || 'YOUR DESIGN';
  const subline = prompt.length > 40 ? prompt.substring(0,45) + '...' : prompt;

  const qrUrl = S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : 'https://qraivy.com';

  const elements = [
    // Background
    { type:'rect', x:0, y:0, width:W, height:H, fill:theme.bg, name:'Background' },

    // Header bar
    { type:'rect', x:0, y:0, width:W, height:Math.round(H*0.18), fill:theme.primary, name:'Header' },

    // Headline
    { type:'text', x:Math.round(W*0.05), y:Math.round(H*0.04), width:Math.round(W*0.9),
      text:headline, fontSize:Math.round(W*0.065), fontWeight:'bold', fill:'#ffffff',
      fontFamily:'Inter', name:'Headline' },

    // Subtitle
    { type:'text', x:Math.round(W*0.05), y:Math.round(H*0.13), width:Math.round(W*0.9),
      text:subline, fontSize:Math.round(W*0.022), fill:'rgba(255,255,255,0.8)',
      fontFamily:'Inter', name:'Subtitle' },

    // Image placeholder
    { type:'rect', x:Math.round(W*0.05), y:Math.round(H*0.22), width:Math.round(W*0.9), height:Math.round(H*0.3),
      fill: theme.primary === '#0a0a0a' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)',
      cornerRadius:12, name:'Image Area' },

    { type:'text', x:Math.round(W*0.25), y:Math.round(H*0.34), width:Math.round(W*0.5),
      text:'📸 Add your image here', fontSize:Math.round(W*0.018),
      fill: theme.primary === '#0a0a0a' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)',
      fontFamily:'Inter', align:'center', name:'Image Hint' },

    // Body copy
    { type:'text', x:Math.round(W*0.05), y:Math.round(H*0.57), width:Math.round(W*0.58),
      text:'Scan the QR code to learn more and claim your exclusive offer today.',
      fontSize:Math.round(W*0.02), fill:theme.secondary, fontFamily:'Inter', name:'Body Copy' },
  ];

  // QR code
  if (includeQR) {
    const qrSize = Math.round(Math.min(W, H) * 0.18);
    const qrX = W - qrSize - Math.round(W*0.05);
    const qrY = Math.round(H*0.55);
    elements.push({ type:'image', x:qrX, y:qrY, width:qrSize, height:qrSize, src:'{{QR_URL}}', name:'QR Code', isQR:true });
    elements.push({ type:'text', x:qrX, y:qrY+qrSize+8, width:qrSize, text:'Scan me', fontSize:Math.round(W*0.014), fill:theme.secondary, fontFamily:'DM Mono', align:'center', name:'QR Label' });
  }

  // CTA button
  elements.push({ type:'rect', x:Math.round(W*0.05), y:Math.round(H*0.86), width:Math.round(W*0.9), height:Math.round(H*0.07), fill:theme.primary, cornerRadius:Math.round(H*0.014), name:'CTA Button' });
  elements.push({ type:'text', x:Math.round(W*0.05), y:Math.round(H*0.876), width:Math.round(W*0.9), text:'LEARN MORE →', fontSize:Math.round(W*0.024), fontWeight:'bold', fill:'#ffffff', fontFamily:'Inter', align:'center', name:'CTA Text' });

  // Footer
  elements.push({ type:'text', x:Math.round(W*0.05), y:Math.round(H*0.955), width:Math.round(W*0.9), text:'qraivy.com · Powered by AI', fontSize:Math.round(W*0.014), fill:theme.secondary, fontFamily:'DM Mono', align:'center', name:'Footer' });

  return { canvas:{ width:W, height:H, background:theme.bg }, elements, name:'AI Generated' };
}

function renderAILayout(layout) {
  // Resize canvas
  S.canvasW = layout.canvas.width; S.canvasH = layout.canvas.height;
  const c = document.getElementById('polotno-container');
  c.style.width = S.canvasW + 'px'; c.style.height = S.canvasH + 'px';

  const qrUrl = S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : 'https://qraivy.com';
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrUrl);

  // Use Polotno if available, else fallback
  if (S.store) {
    renderTemplateToStore(layout, qrSrc);
  } else {
    renderTemplateToFallback(layout, qrSrc);
  }

  // Animate canvas reveal
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) {
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'scale(0.96)';
    wrapper.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)';
    setTimeout(() => {
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'scale(1)';
      setTimeout(() => editorActions.zoomFit(), 300);
    }, 100);
  }

  showToast('✦ AI design generated — all elements editable');
}

function showToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id='_toast'; t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;border:1px solid rgba(255,255,255,0.15);color:#f0ece0;font-family:\'DM Mono\',monospace;font-size:0.72rem;padding:8px 16px;border-radius:20px;z-index:9999;transition:opacity 0.3s;pointer-events:none;white-space:nowrap'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', 2500);
}
