/* ─────────────────────────────────────────────────
   QRAIVY Editor — Keyboard Shortcuts
   ───────────────────────────────────────────────── */

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
