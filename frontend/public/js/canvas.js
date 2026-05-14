/* ─────────────────────────────────────────────────
   QRAIVY Editor — Canvas, Actions & Properties
   ───────────────────────────────────────────────── */


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

function switchRTab(id, btn) {
  document.querySelectorAll('.rtab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.rtab-content').forEach(function(c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var content = document.getElementById('rtab-' + id);
  if (content) content.classList.add('active');
}
