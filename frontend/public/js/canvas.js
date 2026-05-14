/* ─────────────────────────────────────────────────
   QRAIVY Editor — Canvas, Actions & Properties
   ───────────────────────────────────────────────── */

/* ══ VIEWPORT ENGINE ════════════════════════════════
   Architecture:
     #workspace-viewport  → scroll container (overflow:auto)
     #workspace-surface   → sized = canvasW*zoom + PAD*2 wide,
                            canvasH*zoom + PAD*2 tall
     #canvas-wrapper      → position:absolute, top/left = PAD,
                            transform: scale(zoom), transform-origin: top left
     #polotno-container   → native canvas size, never scaled directly

   Zoom math:
     surfaceW = canvasW * zoom + PAD * 2
     surfaceH = canvasH * zoom + PAD * 2
     wrapper.left = PAD  (always — centering is via scrollLeft)
     wrapper.top  = PAD
     transform: scale(zoom)

   To zoom toward a point (cx, cy) in viewport coords:
     1. Convert to canvas-local coords before zoom:
        canvasX = (cx + scrollLeft - PAD) / oldZoom
        canvasY = (cy + scrollTop  - PAD) / oldZoom
     2. Apply new zoom, recalc surface size
     3. Restore scroll so same canvas point is under cursor:
        scrollLeft = canvasX * newZoom + PAD - cx
        scrollTop  = canvasY * newZoom + PAD - cy
   ═══════════════════════════════════════════════════ */

const WORKSPACE_PAD = 400; // px of breathing room around canvas at all zoom levels

/* ── applyZoom ────────────────────────────────────
   The single source of truth for all zoom operations.
   focalViewportX/Y = viewport-relative pixel to zoom toward.
   If omitted, zooms toward viewport center. */
function applyZoom(newZoom, focalViewportX, focalViewportY) {
  newZoom = Math.max(0.1, Math.min(4.0, newZoom));
  newZoom = Math.round(newZoom * 100) / 100; // avoid floating drift

  const vp      = document.getElementById('workspace-viewport');
  const surface = document.getElementById('workspace-surface');
  const wrapper = document.getElementById('canvas-wrapper');
  const label   = document.getElementById('zoom-label');

  if (!vp || !surface || !wrapper) return;

  const oldZoom = S.zoom;
  const PAD     = WORKSPACE_PAD;
  const cW      = S.canvasW;
  const cH      = S.canvasH;

  // ── 1. Determine focal point in viewport coords ──
  // Default: center of viewport
  const fx = (focalViewportX !== undefined) ? focalViewportX : vp.clientWidth  / 2;
  const fy = (focalViewportY !== undefined) ? focalViewportY : vp.clientHeight / 2;

  // ── 2. Capture canvas-space coords under focal point ──
  const canvasX = (fx + vp.scrollLeft - PAD) / oldZoom;
  const canvasY = (fy + vp.scrollTop  - PAD) / oldZoom;

  // ── 3. Apply new zoom to state ───────────────────
  S.zoom = newZoom;

  // ── 4. Resize surface ────────────────────────────
  const surfaceW = Math.round(cW * newZoom) + PAD * 2;
  const surfaceH = Math.round(cH * newZoom) + PAD * 2;
  surface.style.width  = surfaceW + 'px';
  surface.style.height = surfaceH + 'px';

  // ── 5. Position & scale wrapper ─────────────────
  // wrapper is always at (PAD, PAD) in surface coords
  // transform-origin: top left so scale expands rightward/downward
  wrapper.style.width  = cW + 'px';
  wrapper.style.height = cH + 'px';
  wrapper.style.left   = PAD + 'px';
  wrapper.style.top    = PAD + 'px';
  wrapper.style.transform = 'scale(' + newZoom + ')';

  // ── 6. Restore scroll so focal point stays fixed ─
  const newScrollLeft = Math.round(canvasX * newZoom + PAD - fx);
  const newScrollTop  = Math.round(canvasY * newZoom + PAD - fy);

  // Clamp to valid scroll range
  const maxScrollLeft = surfaceW - vp.clientWidth;
  const maxScrollTop  = surfaceH - vp.clientHeight;
  vp.scrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));
  vp.scrollTop  = Math.max(0, Math.min(maxScrollTop,  newScrollTop));

  // ── 7. Update zoom label ─────────────────────────
  if (label) label.textContent = Math.round(newZoom * 100) + '%';
}

/* ── centerCanvas ─────────────────────────────────
   Scrolls viewport so canvas is centered (used after fit/init). */
function centerCanvas() {
  const vp      = document.getElementById('workspace-viewport');
  const surface = document.getElementById('workspace-surface');
  if (!vp || !surface) return;

  const surfaceW = parseFloat(surface.style.width)  || surface.offsetWidth;
  const surfaceH = parseFloat(surface.style.height) || surface.offsetHeight;

  vp.scrollLeft = Math.max(0, (surfaceW - vp.clientWidth)  / 2);
  vp.scrollTop  = Math.max(0, (surfaceH - vp.clientHeight) / 2);
}

/* ── initWorkspaceEvents ──────────────────────────
   Wheel zoom, middle-mouse pan, spacebar pan. */
function initWorkspaceEvents() {
  const vp = document.getElementById('workspace-viewport');
  if (!vp) return;

  // ── Wheel: zoom with ctrl/cmd, scroll otherwise ──
  vp.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      applyZoom(S.zoom + delta, fx, fy);
    }
    // else: native scroll handles it — do nothing
  }, { passive: false });

  // ── Middle mouse pan ─────────────────────────────
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let panScrollX = 0, panScrollY = 0;

  vp.addEventListener('mousedown', function(e) {
    if (e.button === 1) { // middle mouse
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollX = vp.scrollLeft;
      panScrollY = vp.scrollTop;
      vp.classList.add('is-panning');
    }
  });

  window.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    vp.scrollLeft = panScrollX - dx;
    vp.scrollTop  = panScrollY - dy;
  });

  window.addEventListener('mouseup', function(e) {
    if (e.button === 1 && isPanning) {
      isPanning = false;
      vp.classList.remove('is-panning');
    }
  });

  // ── Spacebar pan ─────────────────────────────────
  let spaceDown = false;
  let spacePanning = false;
  let spacePanStartX = 0, spacePanStartY = 0;
  let spacePanScrollX = 0, spacePanScrollY = 0;

  window.addEventListener('keydown', function(e) {
    // Don't hijack spacebar when typing in an input or editable element
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable) return;
    if (e.code === 'Space' && !spaceDown) {
      e.preventDefault();
      spaceDown = true;
      vp.classList.add('pan-ready');
    }
  });

  window.addEventListener('keyup', function(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      spacePanning = false;
      vp.classList.remove('pan-ready', 'is-panning');
    }
  });

  vp.addEventListener('mousedown', function(e) {
    if (spaceDown && e.button === 0) {
      e.preventDefault();
      spacePanning = true;
      spacePanStartX = e.clientX;
      spacePanStartY = e.clientY;
      spacePanScrollX = vp.scrollLeft;
      spacePanScrollY = vp.scrollTop;
      vp.classList.add('is-panning');
    }
  });

  window.addEventListener('mousemove', function(e) {
    if (!spacePanning) return;
    const dx = e.clientX - spacePanStartX;
    const dy = e.clientY - spacePanStartY;
    vp.scrollLeft = spacePanScrollX - dx;
    vp.scrollTop  = spacePanScrollY - dy;
  });

  window.addEventListener('mouseup', function(e) {
    if (spacePanning && e.button === 0) {
      spacePanning = false;
      if (spaceDown) vp.classList.add('pan-ready');
      else vp.classList.remove('is-panning');
    }
  });
}

/* ── initPolotno ──────────────────────────────────
   Initializes the canvas and polotno store. */
function initPolotno() {
  const c = document.getElementById('polotno-container');
  c.style.width  = S.canvasW + 'px';
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
        window.polotno.Workspace({
          store: S.store,
          components: { Toolbar: null, ZoomButtons: null, PagesTimeline: null }
        }, w);
      }
      S.store.on('change', () => { updateLayers(); showElementProps(); });
    } else {
      fallbackCanvas();
    }
  } catch(e) {
    fallbackCanvas();
  }

  // Init workspace events
  initWorkspaceEvents();

  // Initial zoom fit after layout settles
  setTimeout(() => editorActions.zoomFit(), 200);
}

function fallbackCanvas() {
  const c = document.getElementById('polotno-container');
  c.style.cssText += ';display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;';
  c.innerHTML = '<div style="font-size:3rem;opacity:0.15">⬡</div>' +
    '<div style="font-family:\'DM Mono\',monospace;font-size:0.72rem;color:#999;text-align:center">' +
    'Canvas ready<br><span style="font-size:0.6rem;opacity:0.5">' +
    S.canvasW + ' × ' + S.canvasH + 'px</span></div>';
}


/* ══ EDITOR ACTIONS ══════════════════════════════════ */
const editorActions = {
  undo() { if (S.store) S.store.history.undo(); },
  redo() { if (S.store) S.store.history.redo(); },

  zoomIn()  { applyZoom(S.zoom + 0.1); },
  zoomOut() { applyZoom(S.zoom - 0.1); },

  zoomFit() {
    const vp = document.getElementById('workspace-viewport');
    if (!vp) return;

    const PAD  = WORKSPACE_PAD;
    const padW = 80, padH = 100; // breathing room inside viewport

    const scale = Math.min(
      (vp.clientWidth  - padW) / S.canvasW,
      (vp.clientHeight - padH) / S.canvasH,
      1.5
    );
    const fitZoom = Math.max(0.1, scale);

    // Apply zoom centered (no focal point = center of viewport)
    applyZoom(fitZoom);

    // After zoom, center the scroll
    setTimeout(() => centerCanvas(), 20);
  },

  save() {
    const name = document.getElementById('file-name').value || 'design';
    if (S.store) localStorage.setItem('qraivy_design_' + name, JSON.stringify(S.store.toJSON()));
    showToast('Saved: ' + name);
  },

  exportPNG() {
    if (S.store && S.store.toDataURL) {
      S.store.toDataURL({ pixelRatio: 2 }).then(url => {
        const a = document.createElement('a');
        a.href = url; a.download = 'qraivy-design.png'; a.click();
      });
    } else {
      showToast('Select elements first');
    }
  },

  exportPDF() { showToast('PDF export via Puppeteer — coming in Step 2'); }
};


/* ══ TAB SWITCHING ════════════════════════════════════ */
function switchRTab(id, btn) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const content = document.getElementById('rtab-' + id);
  if (content) content.classList.add('active');
}
