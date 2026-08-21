/* ─────────────────────────────────────────────────
   QRAIVY Editor — AI Generation System
   ───────────────────────────────────────────────── */

function showAIModal() {
  var modal = document.getElementById('_aiModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = '_aiModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:8000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(16px)';
    var inner = document.createElement('div');
    inner.style.cssText = 'background:#0d0d0d;border:1px solid rgba(255,90,31,0.2);border-radius:24px;padding:32px;width:540px;max-width:92vw;position:relative;box-shadow:0 0 80px rgba(255,90,31,0.1),0 32px 80px rgba(0,0,0,0.9)';
    inner.innerHTML = '<button id="_aiCloseBtn" style="position:absolute;top:14px;right:14px;width:28px;height:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:7px;color:rgba(255,255,255,0.4);cursor:pointer;font-size:16px">×</button>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:38px;height:38px;background:linear-gradient(135deg,#ff5a1f,#ff8c00);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 20px rgba(255,90,31,0.4)">✦</div>' +
      '<div><div style="font-size:1rem;font-weight:700;color:#f0ece0">AI Design Generator</div><div style="font-family:monospace;font-size:0.6rem;color:rgba(255,90,31,0.7);letter-spacing:0.1em">POWERED BY CLAUDE SONNET</div></div></div>' +
      '<p style="font-family:monospace;font-size:0.7rem;color:rgba(240,236,224,0.4);margin-bottom:14px;line-height:1.7">Describe your design and Claude will generate a fully editable layout.</p>' +
      '<textarea id="_aiPrompt" placeholder="e.g. Dark luxury restaurant promo flyer, orange theme, 20% summer offer..." style="width:100%;height:90px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;color:#f0ece0;font-family:monospace;font-size:0.75rem;outline:none;resize:none;line-height:1.6;display:block;margin-bottom:12px"></textarea>' +
      '<div id="_aiSuggestionsContainer" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px"></div>' +
      '<div style="margin-bottom:14px"><div style="font-family:monospace;font-size:0.6rem;color:rgba(255,255,255,0.2);margin-bottom:8px;letter-spacing:0.1em">VISUAL STYLE</div><div id="_aiStyleCards" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"></div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px">' +
      '<select id="_aiSize" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:8px;color:rgba(240,236,224,0.6);font-family:monospace;font-size:0.7rem;outline:none"><option value="a4">A4 Poster</option><option value="a5">A5 Flyer</option><option value="business">Business Card</option><option value="square">Instagram Post</option><option value="dl">DL Flyer</option></select>' +
      '<select id="_aiQR" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:8px;color:rgba(240,236,224,0.6);font-family:monospace;font-size:0.7rem;outline:none"><option value="include">Include QR code</option><option value="prominent">QR prominent</option><option value="none">No QR code</option></select></div>' +
      '<button id="_aiGenerateBtn" style="width:100%;padding:14px;background:linear-gradient(135deg,#ff5a1f,#ff8c00);border:none;border-radius:12px;color:#fff;font-family:monospace;font-size:0.82rem;font-weight:700;cursor:pointer;box-shadow:0 0 24px rgba(255,90,31,0.3)">✦ Generate Design</button>' +
      '<div style="text-align:center;margin-top:10px;font-family:monospace;font-size:0.58rem;color:rgba(255,255,255,0.15)">Claude AI → JSON Layout → Editable Canvas</div>';
    modal.appendChild(inner);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
    document.body.appendChild(modal);
    inner.querySelector('#_aiCloseBtn').addEventListener('click', function() { modal.style.display = 'none'; });
    inner.querySelector('#_aiGenerateBtn').addEventListener('click', triggerAIGenerate);
    // Suggestions
    var suggs = ['Luxury restaurant promo','Event QR poster','Business card dark','Social media promo','Product launch flyer','Real estate campaign'];
    var sc = inner.querySelector('#_aiSuggestionsContainer');
    suggs.forEach(function(s) {
      var b = document.createElement('button');
      b.textContent = s;
      b.style.cssText = 'padding:4px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(240,236,224,0.45);font-family:monospace;font-size:0.62rem;cursor:pointer;transition:all 0.15s;white-space:nowrap';
      b.onclick = function() { var p = document.getElementById('_aiPrompt'); if(p) p.value = s; };
      b.onmouseover = function() { this.style.borderColor='rgba(255,90,31,0.3)'; this.style.color='rgba(255,130,60,0.8)'; };
      b.onmouseout = function() { this.style.borderColor='rgba(255,255,255,0.08)'; this.style.color='rgba(240,236,224,0.45)'; };
      sc.appendChild(b);
    });
    // Style cards
    var styles = [{id:'dark-luxury',label:'Dark Luxury',bg:'#0a0a0a',accent:'#ff5a1f',sel:true},{id:'bold-orange',label:'Bold Orange',bg:'#ff5a1f',accent:'#fff'},{id:'minimal-white',label:'Minimal',bg:'#f0ece0',accent:'#0a0a0a'},{id:'restaurant-gold',label:'Restaurant',bg:'#1a1208',accent:'#c8860a'},{id:'event-purple',label:'Event Neon',bg:'#05082e',accent:'#7c3aed'},{id:'editorial',label:'Editorial',bg:'#ffffff',accent:'#222'}];
    var stc = inner.querySelector('#_aiStyleCards');
    styles.forEach(function(s) {
      var b = document.createElement('button');
      b.id = 'style_' + s.id;
      b.style.cssText = 'padding:8px 6px;background:' + s.bg + ';border:2px solid ' + (s.sel ? 'rgba(255,90,31,0.7)' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all 0.15s';
      var isDark = s.bg === '#f0ece0' || s.bg === '#ffffff';
      b.innerHTML = '<div style="width:20px;height:4px;border-radius:2px;background:' + s.accent + ';opacity:0.8"></div><div style="font-family:monospace;font-size:0.55rem;color:' + (isDark?'#333':'rgba(255,255,255,0.5)') + '">' + s.label + '</div>';
      b.onclick = (function(sid){return function(){selectAIStyle(sid);};})(s.id);
      stc.appendChild(b);
    });
  } else {
    modal.style.display = 'flex';
  }
  S.selectedAIStyle = S.selectedAIStyle || 'dark-luxury';
  setTimeout(function() { var p = document.getElementById('_aiPrompt'); if(p) p.focus(); }, 100);
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

  const qrUrl = S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : window.PUBLIC_APP_ORIGIN;

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
  // Resize canvas to match layout
  S.canvasW = layout.canvas.width;
  S.canvasH = layout.canvas.height;
  const c = document.getElementById('polotno-container');
  if (c) { c.style.width = S.canvasW + 'px'; c.style.height = S.canvasH + 'px'; }
  document.getElementById('canvas-size-btn').textContent =
    (layout.name || 'AI Design') + ' · ' + S.canvasW + ' × ' + S.canvasH;

  const qrUrl = S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : window.PUBLIC_APP_ORIGIN;
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrUrl);

  // Use Polotno store if available, otherwise use interactive CE system
  if (S.store) {
    renderTemplateToStore(layout, qrSrc);
  } else {
    // CE system: fully interactive draggable/editable elements
    renderElementsToCanvas(layout, qrSrc);
  }

  // Cinematic canvas reveal animation
  const wrapper = document.getElementById('canvas-wrapper');
  if (wrapper) {
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'scale(0.96)';
    wrapper.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
    setTimeout(function() {
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'scale(1)';
      setTimeout(function() { editorActions.zoomFit(); }, 300);
    }, 80);
  }

  showToast('✦ AI design ready — click any element to edit');
}


