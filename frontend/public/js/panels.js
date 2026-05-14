/* ─────────────────────────────────────────────────
   QRAIVY Editor — Panels System
   ───────────────────────────────────────────────── */

const PANELS = {

  // ── TEMPLATES ─────────────────────────────────
  templates: { title: 'Templates', render: function() {
    var cats = Object.keys(TEMPLATES);
    var html = cats.map(function(cat) {
      var items = TEMPLATES[cat];
      return '<div class="section-label">' + cat + '</div>' +
        '<div class="template-grid">' +
        items.map(function(t) {
          var bg = t.canvas.background || '#ffffff';
          var isDark = bg === '#0a0a0a' || bg === '#1a1a18' || bg === '#05082e';
          var tc = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
          var ac = t.preview.accent || '#ff5a1f';
          var svg = '<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
            '<rect width="60" height="80" fill="' + bg + '"/>' +
            (t.preview.hasHeader  ? '<rect x="4" y="6" width="52" height="10" rx="2" fill="' + ac + '" opacity="0.9"/>' : '') +
            (t.preview.hasTitle   ? '<rect x="4" y="20" width="38" height="5" rx="1" fill="' + tc + '" opacity="0.8"/>' : '') +
            (t.preview.hasSubtitle? '<rect x="4" y="28" width="28" height="3" rx="1" fill="' + tc + '" opacity="0.4"/>' : '') +
            (t.preview.hasImage   ? '<rect x="4" y="34" width="52" height="22" rx="2" fill="' + tc + '" opacity="0.08"/>' : '') +
            (t.preview.hasQR      ? '<rect x="38" y="56" width="18" height="18" rx="2" fill="' + tc + '" opacity="0.12"/><rect x="40" y="58" width="14" height="14" rx="1" fill="none" stroke="' + tc + '" stroke-width="1" opacity="0.3"/>' : '') +
            (t.preview.hasBody    ? '<rect x="4" y="58" width="30" height="2" rx="1" fill="' + tc + '" opacity="0.3"/><rect x="4" y="63" width="24" height="2" rx="1" fill="' + tc + '" opacity="0.2"/>' : '') +
            (t.preview.hasCTA     ? '<rect x="4" y="70" width="52" height="8" rx="3" fill="' + ac + '"/>' : '') +
            '</svg>';
          return '<div class="template-card" data-tid="' + t.id + '" onclick="loadTemplate(\'' + t.id + '\')">' +
            '<div class="tc-preview" style="padding:0;overflow:hidden">' + svg + '</div>' +
            '<div class="tc-label">' + t.name + '</div></div>';
        }).join('') + '</div>';
    }).join('') +
    '<div class="section-label">Blank</div><div class="template-grid">' +
    '<div class="template-card" onclick="loadBlank(&quot;#ffffff&quot;)"><div class="tc-preview" style="background:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:rgba(0,0,0,0.15)">+</div><div class="tc-label">White</div></div>' +
    '<div class="template-card" onclick="loadBlank(&quot;#0a0a0a&quot;)"><div class="tc-preview" style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:rgba(255,255,255,0.15)">+</div><div class="tc-label">Dark</div></div>' +
    '</div>';
    return html;
  }},

  // ── ELEMENTS ──────────────────────────────────
  elements: { title: 'Elements', render: function() {
    var shapes = [
      { icon:'&#9633;', label:'Rectangle', type:'rect' },
      { icon:'&#11053;', label:'Ellipse',   type:'ellipse' },
      { icon:'&#9651;',  label:'Triangle',  type:'triangle' },
      { icon:'&#9733;',  label:'Star',      type:'star' },
      { icon:'&#9135;',  label:'Line',      type:'line' },
      { icon:'&#10148;', label:'Arrow',     type:'arrow' },
    ];
    var deco = [
      { icon:'&#9135;', label:'Divider', type:'divider' },
      { icon:'&#11042;', label:'Badge',  type:'badge' },
      { icon:'&#127991;',label:'Label',  type:'label' },
      { icon:'&#9638;',  label:'Grid',   type:'grid' },
    ];
    var shapeGrid = '<div class="section-label">Shapes</div><div class="element-grid">' +
      shapes.map(function(s) {
        return '<div class="element-btn" onclick="addElement(\'' + s.type + '\')">' +
          '<span class="ei">' + s.icon + '</span><span class="el">' + s.label + '</span></div>';
      }).join('') + '</div>';
    var decoGrid = '<div class="section-label">Decorative</div><div class="element-grid">' +
      deco.map(function(d) {
        return '<div class="element-btn" onclick="addElement(\'' + d.type + '\')">' +
          '<span class="ei">' + d.icon + '</span><span class="el">' + d.label + '</span></div>';
      }).join('') + '</div>';
    return shapeGrid + decoGrid;
  }},

  // ── TEXT ──────────────────────────────────────
  text: { title: 'Text', render: function() {
    var styles = [
      { icon:'H',  label:'Heading',    key:'heading',    size:52, weight:'bold',   font:'Inter' },
      { icon:'H2', label:'Subheading', key:'subheading', size:28, weight:'600',    font:'Inter' },
      { icon:'p',  label:'Body Text',  key:'body',       size:16, weight:'normal', font:'Inter' },
      { icon:'ab', label:'Caption',    key:'caption',    size:12, weight:'normal', font:'DM Mono' },
      { icon:'CTA',label:'CTA Button', key:'cta',        size:18, weight:'bold',   font:'Inter' },
    ];
    var fonts = ['Inter','DM Mono','Georgia','Playfair Display'];
    return '<div class="section-label">Text Styles</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
      styles.map(function(s) {
        return '<div class="element-btn" style="flex-direction:row;justify-content:space-between;align-items:center" onclick="ceAddTextStyle(\'' + s.key + '\')">' +
          '<span style="font-family:\'' + s.font + '\',sans-serif;font-size:' + Math.min(s.size*0.55,20) + 'px;font-weight:' + s.weight + ';color:var(--text);line-height:1.2">' + s.label + '</span>' +
          '<span class="el" style="background:rgba(255,90,31,0.1);color:rgba(255,130,60,0.8);padding:2px 6px;border-radius:4px">+ Add</span>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="section-label">Font Presets</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
      fonts.map(function(f) {
        return '<div class="element-btn" style="flex-direction:row;justify-content:space-between" onclick="addTextWithFont(\'' + f + '\', 20)">' +
          '<span style="font-family:\'' + f + '\',serif;font-size:0.85rem;color:var(--text)">' + f + '</span>' +
          '<span class="el">+ Add</span></div>';
      }).join('') + '</div>';
  }},

  // ── IMAGES ────────────────────────────────────
  images: { title: 'Images', render: function() {
    var grid = S.uploadedImages.length ?
      '<div class="section-label">Uploaded</div><div class="uploaded-grid">' +
      S.uploadedImages.map(function(img) {
        return '<div class="uploaded-img" onclick="addImageToCanvas(\'' + img + '\')">' +
          '<img src="' + img + '" alt=""></div>';
      }).join('') + '</div>' : '';
    return '<div class="upload-zone" onclick="document.getElementById(&quot;img-upload-input&quot;).click()">' +
      '<div class="uz-icon">&#11014;</div>' +
      '<div class="uz-text">Click to upload image<br><span style="opacity:0.5">PNG, JPG, SVG, WebP</span></div>' +
      '</div>' +
      '<input type="file" id="img-upload-input" accept="image/*" multiple onchange="handleUpload(event)" style="display:none">' +
      grid;
  }},

  // ── QR CODES ──────────────────────────────────
  qrcodes: { title: 'QR Codes', render: function() {
    if (!S.qrCodes.length) {
      return '<div class="empty-state"><div class="es-icon">&#11042;</div>' +
        '<p>No QR codes yet.<br>Create one in the Dashboard.</p></div>' +
        '<a href="dashboard.html" class="tb-btn primary" style="width:100%;justify-content:center;text-decoration:none;display:flex;margin-top:12px">Go to Dashboard</a>' +
        '<div class="section-label" style="margin-top:16px">Quick Insert</div>' +
        '<div class="element-btn" onclick="addQR()" style="flex-direction:row;gap:10px;justify-content:flex-start">' +
        '<span style="font-size:1.2rem">&#11042;</span><span class="el">Demo QR Code</span></div>';
    }
    return '<div class="section-label">Your QR Codes</div><div class="qr-list">' +
      S.qrCodes.map(function(q) {
        var url = encodeURIComponent(q.redirectUrl);
        return '<div class="qr-item" onclick="addQR(\'' + q.redirectUrl + '\')">' +
          '<div class="qr-item-thumb"><img src="https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=' + url + '" alt="QR"></div>' +
          '<div class="qr-item-info">' +
          '<div class="qr-item-name">' + (q.businessName || 'QR Code') + '</div>' +
          '<div class="qr-item-url">' + q.redirectUrl + '</div></div></div>';
      }).join('') + '</div>';
  }},

  // ── BACKGROUND ────────────────────────────────
  background: { title: 'Background', render: function() {
    var colors = ['#ffffff','#0a0a0a','#ff5a1f','#1a1a18','#f0ece0','#05082e','#ff8c00','#2d2d2d','#c8860a','#7c3aed'];
    var grads = [
      ['Sunset','linear-gradient(135deg,#ff5a1f,#ff8c00)'],
      ['Night','linear-gradient(135deg,#0a0a0a,#2d2d2d)'],
      ['Ocean','linear-gradient(135deg,#0f0c29,#302b63)'],
      ['Warm','linear-gradient(135deg,#f0ece0,#e8d5b0)'],
      ['Gold','linear-gradient(135deg,#1a1208,#c8860a)'],
      ['Neon','linear-gradient(135deg,#05082e,#7c3aed)'],
    ];
    var swatches = colors.map(function(c) {
      return '<div class="color-swatch" style="background:' + c + ';width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" onclick="setBgColor(\'' + c + '\')"></div>';
    }).join('');
    var gradCards = grads.map(function(g) {
      var safeVal = g[1].replace(/'/g, '%27');
      return '<div style="height:48px;border-radius:8px;background:' + g[1] + ';cursor:pointer;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:flex-end;padding:4px 8px" onclick="setBgGradient(\'' + safeVal + '\')">' +
        '<span style="font-family:var(--mono);font-size:0.55rem;color:rgba(255,255,255,0.8)">' + g[0] + '</span></div>';
    }).join('');
    return '<div class="section-label">Solid Colors</div>' +
      '<div class="color-row" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">' + swatches + '</div>' +
      '<div class="prop-group"><span class="prop-label">Custom Color</span>' +
      '<div class="color-picker-wrap">' +
      '<div class="color-picker-preview" id="bg-color-preview" style="background:#ffffff" onclick="document.getElementById(\'bg-color-input\').click()"></div>' +
      '<input type="color" id="bg-color-input" value="#ffffff" style="display:none" oninput="setBgColor(this.value)">' +
      '<span id="bg-color-hex" style="font-family:var(--mono);font-size:0.68rem;color:var(--text-mid)">#ffffff</span>' +
      '</div></div>' +
      '<div class="section-label">Gradients</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + gradCards + '</div>';
  }}

};

// ── RENDER PANEL ──────────────────────────────────
function renderPanel(id) {
  const p = PANELS[id];
  if (!p) return;
  var title = document.getElementById('panel-title');
  var body = document.getElementById('panel-body');
  if (title) title.textContent = p.title;
  if (body) body.innerHTML = p.render();
}

// ── TOGGLE PANEL ──────────────────────────────────
function togglePanel(id, btn) {
  const panel = document.getElementById('left-panel');
  if (!panel) return;
  document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });

  if (S.activePanelId === id && panel.classList.contains('open')) {
    panel.classList.remove('open');
    S.activePanelId = null;
    hideIndicator();
  } else {
    panel.classList.add('open');
    S.activePanelId = id;
    if (btn) { btn.classList.add('active'); moveIndicator(btn); }
    renderPanel(id);
  }
}

// ── INDICATOR ─────────────────────────────────────
function moveIndicator(btn) {
  const ind = document.getElementById('toolbar-indicator');
  if (!ind || !btn) return;
  const tbRect = document.getElementById('left-toolbar').getBoundingClientRect();
  const bRect = btn.getBoundingClientRect();
  ind.style.top = (bRect.top - tbRect.top + bRect.height * 0.18) + 'px';
  ind.style.height = (bRect.height * 0.64) + 'px';
  ind.style.opacity = '1';
}
function hideIndicator() {
  const ind = document.getElementById('toolbar-indicator');
  if (ind) ind.style.opacity = '0';
}
