/* ─────────────────────────────────────────────────
   QRAIVY Editor — Panels System
   ───────────────────────────────────────────────── */


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

