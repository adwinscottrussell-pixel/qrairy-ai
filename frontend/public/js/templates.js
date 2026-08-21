/* ─────────────────────────────────────────────────
   QRAIVY Editor — Template Engine
   ───────────────────────────────────────────────── */

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
    : window.PUBLIC_APP_ORIGIN;
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
  // Use the interactive CE element system for full editability
  renderElementsToCanvas(tmpl, qrSrc);
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
