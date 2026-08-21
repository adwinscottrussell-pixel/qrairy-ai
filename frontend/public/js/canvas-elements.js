/* ─────────────────────────────────────────────────
   QRAIVY Editor — Interactive Canvas Element System v2
   Full editor mechanics: drag, resize, text edit,
   alignment guides, snapping, proper transforms.
   ───────────────────────────────────────────────── */

// ── ELEMENT STORE ─────────────────────────────────
const CE = {
  elements: [],
  selected: null,
  nextId: 1,
  history: [],
  historyIdx: -1,
  snapThreshold: 8,
  showGuides: true,
};

// ── HISTORY ───────────────────────────────────────
function cePushHistory() {
  const snap = JSON.stringify(CE.elements.map(e => Object.assign({}, e)));
  CE.history = CE.history.slice(0, CE.historyIdx + 1);
  CE.history.push(snap);
  if (CE.history.length > 50) { CE.history.shift(); } else { CE.historyIdx++; }
}
function ceUndo() {
  if (CE.historyIdx <= 0) return;
  CE.historyIdx--;
  CE.elements = JSON.parse(CE.history[CE.historyIdx]);
  ceRenderAll(); showToast('Undo');
}
function ceRedo() {
  if (CE.historyIdx >= CE.history.length - 1) return;
  CE.historyIdx++;
  CE.elements = JSON.parse(CE.history[CE.historyIdx]);
  ceRenderAll(); showToast('Redo');
}

// ── COORDINATE TRANSFORM ──────────────────────────
// Gets the actual scale factor of the canvas wrapper
function ceGetScale() {
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return 1;
  const t = wrapper.style.transform || '';
  const m = t.match(/scale\(([\d.]+)\)/);
  return m ? parseFloat(m[1]) : (S.zoom || 1);
}

// Converts browser client coords to canvas-space coords
function ceClientToCanvas(cx, cy) {
  const c = document.getElementById('polotno-container');
  if (!c) return { x: cx, y: cy };
  const rect = c.getBoundingClientRect();
  const scale = ceGetScale();
  return {
    x: (cx - rect.left) / scale,
    y: (cy - rect.top) / scale,
  };
}

// ── ADD ELEMENT ───────────────────────────────────
function ceAddElement(props) {
  const id = 'el_' + (CE.nextId++);
  // Smart default position: center of visible canvas area
  var defaultX = Math.round(S.canvasW * 0.1);
  var defaultY = Math.round(S.canvasH * 0.1 + (CE.elements.length * 30) % (S.canvasH * 0.6));
  const el = Object.assign({
    id, visible: true, x: defaultX, y: defaultY,
    width: 200, height: 60, rotation: 0,
  }, props);
  // Ensure height is set for rects/images
  if ((el.type === 'rect' || el.type === 'image') && !el.height) el.height = 80;
  CE.elements.push(el);
  cePushHistory();
  ceRenderElement(el);
  ceSelect(id);
  updateLayers();

  // Auto-enter edit mode for text
  if (el.type === 'text') {
    setTimeout(function() {
      var foundEl = CE.elements.find(function(e) { return e.id === id; });
      var node = document.getElementById(id);
      if (foundEl && node) ceEnterTextEdit(foundEl, node);
    }, 80);
  }

  // Subtle reveal animation
  setTimeout(function() {
    var node = document.getElementById(id);
    if (node) {
      node.style.animation = 'ceElReveal 0.2s ease';
      setTimeout(function() { node.style.animation = ''; }, 200);
    }
  }, 10);

  return id;
}

// ── RENDER ALL ────────────────────────────────────
function ceRenderAll() {
  const c = document.getElementById('polotno-container');
  if (!c) return;
  c.querySelectorAll('.ce-el, .ce-guide').forEach(n => n.remove());
  CE.elements.forEach(el => { if (el.visible !== false) ceRenderElement(el); });
  // Enforce z-index layering after all elements rendered
  ceEnforceLayerOrder();
  updateLayers();
  if (CE.selected) {
    const sel = CE.elements.find(e => e.id === CE.selected);
    if (sel) ceShowHandles(sel);
  }
}

function ceEnforceLayerOrder() {
  // Apply correct z-index: rects at bottom, images middle, text on top
  CE.elements.forEach(function(el, idx) {
    var node = document.getElementById(el.id);
    if (!node) return;
    var base = { rect: 1, image: 5, text: 20 }[el.type] || 5;
    node.style.zIndex = base + idx;
  });
}

// ── RENDER ONE ELEMENT ────────────────────────────
function ceRenderElement(el) {
  const c = document.getElementById('polotno-container');
  if (!c) return;

  const old = document.getElementById(el.id);
  if (old) old.remove();
  if (el.visible === false) return;

  const node = document.createElement('div');
  node.id = el.id;
  node.className = 'ce-el';
  node.dataset.elId = el.id;
  node.dataset.elType = el.type;

  // Base positioning styles
  node.style.position = 'absolute';
  node.style.left = el.x + 'px';
  node.style.top = el.y + 'px';
  node.style.width = el.width + 'px';
  node.style.boxSizing = 'border-box';
  node.style.userSelect = 'none';
  if (el.rotation) node.style.transform = 'rotate(' + el.rotation + 'deg)';
  // Z-index by type: text always above rects/images
  var typeZ = { rect: 1, image: 2, text: 10 };
  node.style.zIndex = (typeZ[el.type] || 5) + (CE.elements.indexOf(el) || 0);
node.style.pointerEvents = el.locked ? 'none' : 'all';

  // ── RECT ──────────────────────────────────────
  if (el.type === 'rect') {
    node.style.height = (el.height || 40) + 'px';
    node.style.background = el.fill || 'transparent';
    node.style.borderRadius = (el.cornerRadius || 0) + 'px';
    if (el.stroke) {
      node.style.border = (el.strokeWidth || 1) + 'px solid ' + el.stroke;
      node.style.background = (el.fill === 'none' || !el.fill) ? 'transparent' : (el.fill || 'transparent');
    }
    if (el.opacity != null) node.style.opacity = el.opacity;
    node.style.cursor = 'move';
    // Rects don't steal pointer events from text above them
    node.style.pointerEvents = 'all';

  // ── TEXT ──────────────────────────────────────
  } else if (el.type === 'text') {
    // ── Text element: select on single click, edit on double click ──
    node.style.height = 'auto';
    node.style.minHeight = Math.max(el.fontSize || 20, 20) + 'px';
    node.style.color = el.fill || '#000000';
    node.style.fontSize = (el.fontSize || 16) + 'px';
    node.style.fontWeight = el.fontWeight || 'normal';
    node.style.fontStyle = el.fontStyle || 'normal';
    node.style.fontFamily = (el.fontFamily || 'Inter') + ',sans-serif';
    node.style.textAlign = el.align || 'left';
    node.style.lineHeight = el.lineHeight || 1.35;
    node.style.letterSpacing = el.letterSpacing || 'normal';
    node.style.textTransform = el.textTransform || 'none';
    node.style.textDecoration = el.textDecoration || 'none';
    // Smart wrapping: use nowrap for short text, pre-wrap for longer
    var textLen = (el.text || '').length;
    var isShortLabel = textLen < 20 && (el.fontSize || 16) <= 20;
    node.style.whiteSpace = isShortLabel ? 'nowrap' : 'pre-wrap';
    node.style.wordBreak = 'break-word';
    node.style.overflowWrap = 'break-word';
    node.style.overflow = 'visible'; // let text be visible even if wider than box
    node.style.background = 'transparent';
    node.style.padding = '4px';
    node.style.cursor = 'default';
    node.style.outline = 'none';
    node.style.pointerEvents = 'all';
    node.contentEditable = 'false';
    node.spellcheck = false;
    node.dataset.editing = 'false';
    node.textContent = el.text || '';
    if (el.opacity != null) node.style.opacity = el.opacity;
    if (el.textShadow) node.style.textShadow = el.textShadow;

  // ── IMAGE / QR ────────────────────────────────
  } else if (el.type === 'image') {
    node.style.height = (el.height || 150) + 'px';
    node.style.borderRadius = (el.cornerRadius || 0) + 'px';
    node.style.overflow = 'hidden';
    node.style.background = el.src ? 'transparent' : 'rgba(255,255,255,0.08)';
    node.style.cursor = 'move';
    if (el.src) {
      const img = document.createElement('img');
      img.src = el.src;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none';
      img.onerror = function() { node.style.background = 'rgba(255,90,31,0.1)'; };
      node.appendChild(img);
    }
  }

  // ── MOUSE EVENTS ──────────────────────────────
  if (el.type === 'text') {
    // Text: click selects, drag moves, double-click edits
    node.addEventListener('mousedown', function(e) {
      if (node.dataset.editing === 'true') return;
      e.preventDefault();
      e.stopPropagation();

      ceSelect(el.id);

      // Use threshold drag: only drag if mouse moves >4px
      var startX = e.clientX, startY = e.clientY;
      var dragging = false;
      var clickTime = Date.now();

      function onMoveThreshold(mv) {
        if (CE._cancelDrag) {
          document.removeEventListener('mousemove', onMoveThreshold);
          document.removeEventListener('mouseup', onUpThreshold);
          return;
        }
        if (Math.abs(mv.clientX - startX) > 4 || Math.abs(mv.clientY - startY) > 4) {
          dragging = true;
          document.removeEventListener('mousemove', onMoveThreshold);
          document.removeEventListener('mouseup', onUpThreshold);
          ceDrag(e, el); // start real drag
        }
      }

      function onUpThreshold() {
        document.removeEventListener('mousemove', onMoveThreshold);
        document.removeEventListener('mouseup', onUpThreshold);
        // Pure click (no drag) - just keep selection
      }

      document.addEventListener('mousemove', onMoveThreshold);
      document.addEventListener('mouseup', onUpThreshold);
    });

    // Double click: enter edit mode
    // dblclick fires after 2 mousedowns - just enable editing directly
    node.addEventListener('dblclick', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Cancel any pending drag
      CE._cancelDrag = true;
      setTimeout(function() { CE._cancelDrag = false; }, 100);
      ceEnterTextEdit(el, node);
    });

    // Blur: exit edit mode
    node.addEventListener('blur', function() {
      ceExitTextEdit(el, node);
    });

    node.addEventListener('input', function() {
      el.text = node.innerText;
      el.height = node.offsetHeight;
      // Live update layer name
      updateLayers();
    });

    node.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { node.blur(); }
      e.stopPropagation(); // don't trigger global shortcuts while editing
    });

  } else {
    // Non-text: normal mousedown drag
    node.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      ceSelect(el.id);
      ceDrag(e, el);
    });
  }

  c.appendChild(node);
}

// ── SELECTION + HANDLES ───────────────────────────
function ceSelect(id) {
  // Clear previous
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());
  document.querySelectorAll('.ce-el').forEach(n => {
    n.style.outline = 'none';
    n.style.outlineOffset = '0';
    n.style.boxShadow = '';
  });

  CE.selected = id || null;
  if (!id) { showElementProps(null); updateLayers(); return; }

  const el = CE.elements.find(e => e.id === id);
  if (!el) return;

  // Never select locked elements (background fills covering full canvas)
  if (el.locked) {
    CE.selected = null;
    return;
  }

  const node = document.getElementById(id);
  if (!node) return;

  if (el.type !== 'text') {
    node.style.outline = '2px solid #ff5a1f';
    node.style.outlineOffset = '2px';
    node.style.boxShadow = '0 0 0 4px rgba(255,90,31,0.15)';
  }

  ceShowHandles(el);
  showElementProps(el);
  updateLayers();
  ceAutoSwitchPanel(el);

  // Bring selected element to top of its type group
  var node2 = document.getElementById(id);
  if (node2) {
    var base = { rect: 1, image: 5, text: 20 }[el.type] || 5;
    node2.style.zIndex = base + CE.elements.length + 10;
  }

  // Show floating toolbar for text
  ceHideFloatingToolbar();
  if (el.type === 'text') {
    setTimeout(function() { ceShowFloatingToolbar(el); }, 50);
  }
}

// ── AUTO-SWITCH RIGHT PANEL ON SELECTION ──────────
function ceAutoSwitchPanel(el) {
  if (!el) return;
  // Always switch right panel to PROPS tab when element selected
  var propsTab = document.querySelector('.rtab');
  if (propsTab) {
    switchRTab('properties', propsTab);
  }
  // DON'T auto-switch left panel - let user control left panel independently
  // This prevents the jarring panel switch that breaks text editing flow
}

function ceDeselect() {
  ceHideFloatingToolbar();
  ceSelect(null);
}

// ── TEXT EDIT MODE ────────────────────────────────
function ceEnterTextEdit(el, node) {
  if (!node) node = document.getElementById(el.id);
  if (!node) return;

  // Bring to absolute front while editing
  node.style.zIndex = '9999';
  node.style.pointerEvents = 'all';

  // Enable editing - always use pre-wrap so Enter key works
  node.style.whiteSpace = 'pre-wrap';
  node.contentEditable = 'true';
  node.dataset.editing = 'true';
  node.style.cursor = 'text';
  node.style.outline = '2px solid rgba(255,90,31,0.7)';
  node.style.outlineOffset = '2px';

  // Remove drag/resize handles while editing
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());

  node.focus();

  // Place cursor at end
  var range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  var sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }

  CE._editingId = el.id;
}

function ceExitTextEdit(el, node) {
  if (!node) node = document.getElementById(el.id);
  if (!node) return;

  node.contentEditable = 'false';
  node.dataset.editing = 'false';
  node.style.cursor = 'default';
  node.style.outline = 'none';

  el.text = node.innerText || node.textContent;
  el.height = node.offsetHeight;

  // Restore smart wrapping
  var textLen = (el.text || '').length;
  var isShortLabel = textLen < 20 && (el.fontSize || 16) <= 20;
  node.style.whiteSpace = isShortLabel ? 'nowrap' : 'pre-wrap';

  cePushHistory();
  CE._editingId = null;

  // Restore proper z-index
  ceEnforceLayerOrder();

  // Update text handles size to match new height
  var hw = document.querySelector('.ce-handles-wrap');
  if (hw) hw.style.height = (node.offsetHeight + 4) + 'px';

  // Re-show selection
  ceSelect(el.id);
}

// Click outside canvas during text edit exits edit mode
document.addEventListener('mousedown', function(e) {
  if (!CE._editingId) return;
  var node = document.getElementById(CE._editingId);
  if (node && !node.contains(e.target)) {
    node.blur();
  }
});

// ── FLOATING TEXT TOOLBAR ─────────────────────────
// Appears near selected text element - Canva-style
function ceShowFloatingToolbar(el) {
  ceHideFloatingToolbar();
  if (!el || el.type !== 'text') return;

  var node = document.getElementById(el.id);
  if (!node) return;

  var container = document.getElementById('polotno-container');
  if (!container) return;

  var toolbar = document.createElement('div');
  toolbar.id = '_floatingToolbar';
  toolbar.style.cssText = 'position:fixed;z-index:10000;background:rgba(14,14,14,0.97);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 8px;display:flex;align-items:center;gap:4px;box-shadow:0 8px 32px rgba(0,0,0,0.6),0 2px 8px rgba(0,0,0,0.4);backdrop-filter:blur(12px);pointer-events:all;';

  // Position above the element
  var rect = node.getBoundingClientRect();
  var scale = ceGetScale();
  var toolbarY = Math.max(60, rect.top - 52);

  toolbar.style.top = toolbarY + 'px';
  toolbar.style.left = Math.max(100, Math.min(window.innerWidth - 400, rect.left)) + 'px';

  var fonts = ['Inter','DM Mono','Georgia','Playfair Display','Arial'];
  var sizes = [10,12,14,16,18,20,24,28,32,36,40,48,56,64,72,96];

  // Build toolbar using DOM methods to avoid quote issues
  var ftFont = document.createElement('select');
  ftFont.id = 'ft-font';
  ftFont.style.cssText = 'height:28px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#f0ece0;font-family:monospace;font-size:0.65rem;padding:0 6px;cursor:pointer;outline:none;min-width:90px';
  ['Inter','DM Mono','Georgia','Playfair Display','Arial'].forEach(function(f) {
    var opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    if (el.fontFamily === f) opt.selected = true;
    ftFont.appendChild(opt);
  });
  toolbar.appendChild(ftFont);

  var ftSize = document.createElement('select');
  ftSize.id = 'ft-size';
  ftSize.style.cssText = 'height:28px;width:52px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#f0ece0;font-family:monospace;font-size:0.65rem;padding:0 4px;cursor:pointer;outline:none';
  [8,10,12,14,16,18,20,24,28,32,36,40,48,56,64,72,96].forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (el.fontSize === s) opt.selected = true;
    ftSize.appendChild(opt);
  });
  toolbar.appendChild(ftSize);

  function makeSep() { var s=document.createElement('div'); s.style.cssText='width:1px;height:20px;background:rgba(255,255,255,0.1);margin:0 2px;flex-shrink:0'; toolbar.appendChild(s); }
  function makeBtn(id, label, active, title) {
    var b=document.createElement('button'); b.id=id; b.title=title||label;
    b.style.cssText='width:28px;height:28px;background:'+(active?'rgba(255,90,31,0.2)':'rgba(255,255,255,0.06)')+';border:1px solid '+(active?'rgba(255,90,31,0.4)':'rgba(255,255,255,0.1)')+';border-radius:5px;color:#f0ece0;cursor:pointer;font-size:13px;flex-shrink:0';
    b.innerHTML = label; return b;
  }

  makeSep();
  var ftBold = makeBtn('ft-bold','<b>B</b>', el.fontWeight==='bold'||el.fontWeight==='700', 'Bold');
  toolbar.appendChild(ftBold);
  var ftItalic = makeBtn('ft-italic','<i>I</i>', el.fontStyle==='italic', 'Italic');
  toolbar.appendChild(ftItalic);
  makeSep();

  ['left','center','right'].forEach(function(a) {
    var icons = {left:'⬅',center:'≡',right:'➡'};
    var btn = makeBtn('ft-align-'+a, icons[a], el.align===a, 'Align '+a);
    btn.onclick = function() { ceTpUpdate(el.id, 'align', a); ceHideFloatingToolbar(); setTimeout(function(){ceShowFloatingToolbar(CE.elements.find(function(x){return x.id===el.id;}));},10); };
    toolbar.appendChild(btn);
  });
  makeSep();

  // Color swatch
  var colorSwatch = document.createElement('div');
  colorSwatch.style.cssText = 'width:24px;height:24px;border-radius:4px;border:2px solid rgba(255,255,255,0.2);background:'+(el.fill||'#333')+';cursor:pointer;flex-shrink:0';
  colorSwatch.title = 'Text color';
  var colorInput = document.createElement('input');
  colorInput.type = 'color'; colorInput.id = 'ft-color-input';
  colorInput.value = el.fill || '#ffffff';
  colorInput.style.display = 'none';
  colorInput.oninput = function() { ceTpUpdate(el.id,'fill',this.value); colorSwatch.style.background=this.value; };
  colorSwatch.onclick = function() { colorInput.click(); };
  toolbar.appendChild(colorSwatch);
  toolbar.appendChild(colorInput);
  makeSep();

  var editBtn = makeBtn('ft-edit','✎', false, 'Edit text');
  editBtn.style.background = 'rgba(255,90,31,0.1)';
  editBtn.style.borderColor = 'rgba(255,90,31,0.3)';
  editBtn.style.color = '#ff7848';
  toolbar.appendChild(editBtn);

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'width:20px;height:20px;background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:16px;margin-left:2px;flex-shrink:0';
  closeBtn.textContent = '×';
  closeBtn.onclick = ceHideFloatingToolbar;
  toolbar.appendChild(closeBtn);
  document.body.appendChild(toolbar);

  // Wire controls
  ftFont.onchange = function() { ceTpUpdate(el.id, 'fontFamily', this.value); };
  ftSize.onchange = function() { ceTpUpdate(el.id, 'fontSize', parseInt(this.value)); };
  ftBold.onclick = function() {
    var isBold = el.fontWeight === 'bold' || el.fontWeight === '700';
    ceTpUpdate(el.id, 'fontWeight', isBold ? '400' : 'bold');
    ceHideFloatingToolbar();
    var elNow = CE.elements.find(function(x) { return x.id === el.id; });
    if (elNow) setTimeout(function() { ceShowFloatingToolbar(elNow); }, 10);
  };
  ftItalic.onclick = function() {
    ceTpUpdate(el.id, 'fontStyle', el.fontStyle === 'italic' ? 'normal' : 'italic');
    ceHideFloatingToolbar();
    var elNow = CE.elements.find(function(x) { return x.id === el.id; });
    if (elNow) setTimeout(function() { ceShowFloatingToolbar(elNow); }, 10);
  };
  editBtn.onclick = function() {
    var node = document.getElementById(el.id);
    var elNow = CE.elements.find(function(x) { return x.id === el.id; });
    if (node && elNow) ceEnterTextEdit(elNow, node);
  };

  // Prevent toolbar from interfering with canvas clicks
  toolbar.addEventListener('mousedown', function(e) { e.stopPropagation(); });
}

function ceClickColorPicker() { var i = document.getElementById("ft-color-input"); if(i) i.click(); }
function ceHideFloatingToolbar() {
  var t = document.getElementById('_floatingToolbar');
  if (t) t.remove();
}


// ── FULL TYPOGRAPHY INSPECTOR ─────────────────────
// Called from showElementProps when text is selected
function ceRenderTypographyPanel(el) {
  var noSel = document.getElementById('no-selection');
  var textP = document.getElementById('text-props');
  var imgP  = document.getElementById('image-props');
  if (noSel) noSel.style.display = 'none';
  if (imgP)  imgP.style.display = 'none';

  if (!textP) {
    // Create typography panel dynamically
    var rtabContent = document.querySelector('.rtab-content#rtab-properties') ||
                      document.querySelector('.rtab-content') ||
                      document.querySelector('#right-panel');
    if (!rtabContent) return;

    var panel = document.createElement('div');
    panel.id = 'text-props';
    panel.style.cssText = 'display:block;padding:4px 0;';
    rtabContent.appendChild(panel);
    textP = panel;
  }

  textP.style.display = 'block';

  var fonts = ['Inter','DM Mono','Georgia','Playfair Display','Arial','Helvetica','Times New Roman','Courier New'];
  var weights = [['100','Thin'],['300','Light'],['400','Regular'],['500','Medium'],['600','SemiBold'],['700','Bold'],['800','ExtraBold'],['900','Black']];

  textP.innerHTML = [
    // Edit button
    '<div style="margin-bottom:12px">',
    '<button onclick="var n=document.getElementById(\''+el.id+'\');if(n)ceEnterTextEdit(CE.elements.find(e=>e.id===\''+el.id+'\'),n);" style="width:100%;padding:9px;background:rgba(255,90,31,0.1);border:1px solid rgba(255,90,31,0.3);border-radius:8px;color:#ff7848;font-family:var(--mono);font-size:0.7rem;cursor:pointer;letter-spacing:0.04em">✎ Double-click canvas to edit text</button>',
    '</div>',

    // Font family
    '<div class="prop-group">',
    '<span class="prop-label">Font Family</span>',
    '<select class="prop-select" id="tp-font" onchange="ceTpUpdate(\''+el.id+'\',\'fontFamily\',this.value)">',
    fonts.map(function(f) { return '<option value="'+f+'"'+(el.fontFamily===f?' selected':'')+'>'+f+'</option>'; }).join(''),
    '</select>',
    '</div>',

    // Size + Weight row
    '<div class="prop-row" style="gap:6px;margin-bottom:12px">',
    '<div style="flex:1"><span class="prop-label">Size</span><div style="display:flex;align-items:center;gap:4px">' +
    '<button onclick="ceTpStepSize(\''+el.id+'\', -1)" style="width:24px;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text-mid);cursor:pointer;font-size:14px">−</button>' +
    '<input class="prop-input" id="tp-size" type="number" min="6" max="400" value="'+(el.fontSize||16)+'" oninput="ceTpUpdate(\''+el.id+'\',\'fontSize\',parseInt(this.value)||16)" style="width:52px;text-align:center">' +
    '<button onclick="ceTpStepSize(\''+el.id+'\', 1)" style="width:24px;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text-mid);cursor:pointer;font-size:14px">+</button></div></div>',
    '<div style="flex:1"><span class="prop-label">Weight</span><select class="prop-select" id="tp-weight" onchange="ceTpUpdate(\''+el.id+'\',\'fontWeight\',this.value)">'+weights.map(function(w){return '<option value="'+w[0]+'"'+(String(el.fontWeight)===w[0]?' selected':'')+'>'+w[1]+'</option>';}).join('')+'</select></div>',
    '</div>',

    // Line height + Letter spacing
    '<div class="prop-row" style="gap:6px;margin-bottom:12px">',
    '<div style="flex:1"><span class="prop-label">Line Height</span><input class="prop-input" id="tp-lh" type="number" min="0.8" max="4" step="0.05" value="'+(el.lineHeight||1.35)+'" oninput="ceTpUpdate(\''+el.id+'\',\'lineHeight\',parseFloat(this.value)||1.35)" style="text-align:center"></div>',
    '<div style="flex:1"><span class="prop-label">Letter Spacing</span><input class="prop-input" id="tp-ls" type="number" min="-10" max="40" step="0.5" value="'+(parseFloat(el.letterSpacing)||0)+'" oninput="ceTpUpdateLS(\''+el.id+'\',this.value)" style="text-align:center"></div>',
    '</div>',

    // Alignment
    '<div class="prop-group">',
    '<span class="prop-label">Alignment</span>',
    '<div class="align-row">',
    ['left','center','right','justify'].map(function(a) {
      var icons = {left:'⬅',center:'≡',right:'➡',justify:'☰'};
      return '<button class="align-btn'+(el.align===a?' active':'')+'" onclick="ceTpUpdate(\''+el.id+'\',\'align\',\''+a+'\');document.querySelectorAll(\'#text-props .align-btn\').forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\')" style="'+(el.align===a?'border-color:var(--accent);color:var(--accent)':'')+'" title="'+a+'">'+icons[a]+'</button>';
    }).join(''),
    '</div></div>',

    // Text transforms
    '<div class="prop-group">',
    '<span class="prop-label">Style</span>',
    '<div style="display:flex;gap:6px;flex-wrap:wrap">',
    [
      ['B','fontWeight',el.fontWeight==='bold'?'normal':'bold','font-weight:bold'],
      ['I','fontStyle',el.fontStyle==='italic'?'normal':'italic','font-style:italic'],
      ['U','textDecoration',el.textDecoration==='underline'?'none':'underline','text-decoration:underline'],
      ['AA','textTransform',el.textTransform==='uppercase'?'none':'uppercase',''],
    ].map(function(s) {
      return '<button onclick="ceTpUpdate(\''+el.id+'\',\''+s[1]+'\',\''+s[2]+'\')" style="width:32px;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text-mid);cursor:pointer;'+s[3]+';transition:all 0.15s" onmouseover="this.style.borderColor=\'rgba(255,90,31,0.4)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'+s[0]+'</button>';
    }).join(''),
    '</div></div>',

    // Color
    '<div class="prop-group">',
    '<span class="prop-label">Text Color</span>',
    '<div class="color-picker-wrap">',
    '<div id="text-color-preview" style="width:32px;height:32px;border-radius:6px;border:1px solid var(--border2);cursor:pointer;background:'+(el.fill||'#000000')+'" onclick="document.getElementById(\'tp-color-input\').click()"></div>',
    '<input type="color" id="tp-color-input" value="'+(el.fill||'#000000')+'" style="display:none" oninput="ceTpUpdate(\''+el.id+'\',\'fill\',this.value);document.getElementById(\'text-color-preview\').style.background=this.value">',
    '<span id="text-color-hex" style="font-family:var(--mono);font-size:0.68rem;color:var(--text-mid)">'+(el.fill||'#000000')+'</span>',
    '</div>',
    '<div class="color-row" style="flex-wrap:wrap;gap:5px;margin-top:8px">',
    ['#ffffff','#0a0a0a','#ff5a1f','#f0ece0','#ff8c00','#c8860a','#7c3aed','#333333','#666666','#999999'].map(function(c) {
      return '<div style="width:22px;height:22px;border-radius:4px;background:'+c+';cursor:pointer;border:1px solid rgba(255,255,255,0.1)" onclick="ceTpUpdate(\''+el.id+'\',\'fill\',\''+c+'\');document.getElementById(\'text-color-preview\').style.background=\''+c+'\';document.getElementById(\'text-color-hex\').textContent=\''+c+'\'"></div>';
    }).join(''),
    '</div></div>',

    // Opacity
    '<div class="prop-group">',
    '<span class="prop-label">Opacity: <span id="tp-opacity-val">'+(el.opacity!=null?Math.round(el.opacity*100):100)+'%</span></span>',
    '<input type="range" min="0" max="100" value="'+(el.opacity!=null?Math.round(el.opacity*100):100)+'" style="width:100%;accent-color:var(--accent)" oninput="var v=parseInt(this.value)/100;ceTpUpdate(\''+el.id+'\',\'opacity\',v);document.getElementById(\'tp-opacity-val\').textContent=this.value+\'%\'">',
    '</div>',

    // Position + Size
    '<div class="section-label">Transform</div>',
    '<div class="prop-row">',
    '<div style="flex:1"><span class="prop-label">X</span><input class="prop-input" id="tp-x" type="number" value="'+Math.round(el.x)+'" oninput="ceTpUpdate(\''+el.id+'\',\'x\',parseInt(this.value))"></div>',
    '<div style="flex:1"><span class="prop-label">Y</span><input class="prop-input" id="tp-y" type="number" value="'+Math.round(el.y)+'" oninput="ceTpUpdate(\''+el.id+'\',\'y\',parseInt(this.value))"></div>',
    '</div>',
    '<div class="prop-row" style="margin-top:6px">',
    '<div style="flex:1"><span class="prop-label">Width</span><input class="prop-input" id="tp-w" type="number" value="'+Math.round(el.width)+'" oninput="ceTpUpdate(\''+el.id+'\',\'width\',parseInt(this.value))"></div>',
    '<div style="flex:1"><span class="prop-label">Rotation</span><input class="prop-input" id="tp-rot" type="number" value="'+(el.rotation||0)+'" oninput="ceTpUpdate(\''+el.id+'\',\'rotation\',parseInt(this.value))"></div>',
    '</div>',

    // Delete button
    '<div style="margin-top:16px;display:flex;gap:6px">',
    '<button onclick="ceDuplicateSelected()" style="flex:1;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text-mid);font-family:var(--mono);font-size:0.65rem;cursor:pointer">⊕ Duplicate</button>',
    '<button onclick="ceDeleteSelected()" style="flex:1;padding:8px;background:rgba(220,50,50,0.08);border:1px solid rgba(220,50,50,0.2);border-radius:8px;color:rgba(220,100,100,0.8);font-family:var(--mono);font-size:0.65rem;cursor:pointer">✕ Delete</button>',
    '</div>',

  ].join('');
}

// ── TYPOGRAPHY HELPERS ───────────────────────────
function ceTpStepSize(id, delta) {
  var inp = document.getElementById('tp-size');
  var current = parseInt(inp ? inp.value : 16) || 16;
  var next = Math.max(6, Math.min(400, current + delta));
  if (inp) inp.value = next;
  ceTpUpdate(id, 'fontSize', next);
}

// ── TYPOGRAPHY LIVE UPDATE ────────────────────────
function ceTpUpdate(id, key, value) {
  var el = CE.elements.find(function(e) { return e.id === id; });
  if (!el) return;
  el[key] = value;
  var node = document.getElementById(id);
  if (!node) return;

  var styleMap = {
    fontFamily:     function(v) { node.style.fontFamily = v + ',sans-serif'; },
    fontSize:       function(v) { node.style.fontSize = v + 'px'; },
    fontWeight:     function(v) { node.style.fontWeight = v; },
    fontStyle:      function(v) { node.style.fontStyle = v; },
    lineHeight:     function(v) { node.style.lineHeight = v; },
    letterSpacing:  function(v) { node.style.letterSpacing = v; },
    align:          function(v) { node.style.textAlign = v; },
    textTransform:  function(v) { node.style.textTransform = v; },
    textDecoration: function(v) { node.style.textDecoration = v; },
    fill:           function(v) { node.style.color = v; },
    opacity:        function(v) { node.style.opacity = v; },
    x:              function(v) { el.x = v; node.style.left = v + 'px'; ceShowHandles(el); },
    y:              function(v) { el.y = v; node.style.top = v + 'px'; ceShowHandles(el); },
    width:          function(v) { node.style.width = v + 'px'; },
    rotation:       function(v) { node.style.transform = 'rotate(' + v + 'deg)'; },
  };

  if (styleMap[key]) styleMap[key](value);
  // Don't push history on every keystroke - debounce
  clearTimeout(ceTpUpdate._t);
  ceTpUpdate._t = setTimeout(function() { cePushHistory(); }, 400);
}

function ceTpUpdateLS(id, val) {
  var v = parseFloat(val) || 0;
  ceTpUpdate(id, 'letterSpacing', v === 0 ? 'normal' : v + 'px');
}



function ceShowHandles(el) {
  // Remove existing
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());

  const node = document.getElementById(el.id);
  if (!node) return;

  // Text elements get width-only handles (left, right, corners)
  if (el.type === 'text') {
    ceShowTextHandles(el, node);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ce-handles-wrap';
  wrap.style.cssText = [
    'position:absolute',
    'left:' + (el.x - 2) + 'px',
    'top:' + (el.y - 2) + 'px',
    'width:' + (el.width + 4) + 'px',
    'height:' + ((el.height || 60) + 4) + 'px',
    'pointer-events:none',
    'z-index:1000',
  ].join(';');

  // 8 resize handles
  const dirs = [
    { d:'nw', s:'top:-5px;left:-5px;cursor:nw-resize' },
    { d:'n',  s:'top:-5px;left:50%;transform:translateX(-50%);cursor:n-resize' },
    { d:'ne', s:'top:-5px;right:-5px;cursor:ne-resize' },
    { d:'e',  s:'top:50%;right:-5px;transform:translateY(-50%);cursor:e-resize' },
    { d:'se', s:'bottom:-5px;right:-5px;cursor:se-resize' },
    { d:'s',  s:'bottom:-5px;left:50%;transform:translateX(-50%);cursor:s-resize' },
    { d:'sw', s:'bottom:-5px;left:-5px;cursor:sw-resize' },
    { d:'w',  s:'top:50%;left:-5px;transform:translateY(-50%);cursor:w-resize' },
  ];

  dirs.forEach(function(dir) {
    const h = document.createElement('div');
    h.className = 'ce-handle';
    h.dataset.dir = dir.d;
    h.style.cssText = 'position:absolute;width:10px;height:10px;background:#ff5a1f;border:2px solid #ffffff;border-radius:2px;pointer-events:all;box-shadow:0 1px 4px rgba(0,0,0,0.4);' + dir.s;
    h.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      ceResize(e, el, dir.d);
    });
    wrap.appendChild(h);
  });

  // Rotation handle
  const rot = document.createElement('div');
  rot.style.cssText = 'position:absolute;width:12px;height:12px;background:#7c3aed;border:2px solid #fff;border-radius:50%;pointer-events:all;top:-22px;left:50%;transform:translateX(-50%);cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,0.4)';
  rot.title = 'Rotate';
  rot.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    ceRotate(e, el);
  });
  wrap.appendChild(rot);

  const c = document.getElementById('polotno-container');
  if (c) c.appendChild(wrap);
}

// ── DRAG ──────────────────────────────────────────
function ceDrag(e, el) {
  const start = ceClientToCanvas(e.clientX, e.clientY);
  const startX = el.x, startY = el.y;
  let moved = false;

  function onMove(ev) {
    const pos = ceClientToCanvas(ev.clientX, ev.clientY);
    let nx = startX + (pos.x - start.x);
    let ny = startY + (pos.y - start.y);

    // Snap to canvas edges + center
    const snapPts = ceGetSnapPoints(el.id);
    const snapped = ceSnapPosition(nx, ny, el.width, el.height || 60, snapPts);
    nx = snapped.x; ny = snapped.y;

    // Clamp to canvas
    nx = Math.max(0, Math.min(nx, S.canvasW - el.width));
    ny = Math.max(0, Math.min(ny, S.canvasH - (el.height || 60)));

    el.x = Math.round(nx);
    el.y = Math.round(ny);

    const node = document.getElementById(el.id);
    if (node) { node.style.left = el.x + 'px'; node.style.top = el.y + 'px'; }

    // Update handles position live
    const hw = document.querySelector('.ce-handles-wrap');
    if (hw) {
      hw.style.left = (el.x - 2) + 'px';
      hw.style.top = (el.y - 2) + 'px';
    }

    ceDrawGuides(snapped.guides);
    moved = true;
    syncPropsPanel(el);
  }

  function onUp() {
    if (moved) cePushHistory();
    ceClearGuides();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── RESIZE ────────────────────────────────────────
function ceResize(e, el, dir) {
  const start = ceClientToCanvas(e.clientX, e.clientY);
  const ox = el.x, oy = el.y, ow = el.width, oh = el.height || 60;
  const isQR = el.name && el.name.toLowerCase().includes('qr');

  function onMove(ev) {
    const pos = ceClientToCanvas(ev.clientX, ev.clientY);
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;

    let nx = ox, ny = oy, nw = ow, nh = oh;

    if (dir.includes('e')) nw = Math.max(20, ow + dx);
    if (dir.includes('s')) nh = Math.max(20, oh + dy);
    if (dir.includes('w')) { nx = ox + dx; nw = Math.max(20, ow - dx); }
    if (dir.includes('n')) { ny = oy + dy; nh = Math.max(20, oh - dy); }

    // QR codes: maintain square aspect ratio
    if (isQR && dir.includes('s') && dir.includes('e')) {
      const sq = Math.max(nw, nh);
      nw = sq; nh = sq;
    }

    el.x = Math.round(nx); el.y = Math.round(ny);
    el.width = Math.round(nw); el.height = Math.round(nh);

    const node = document.getElementById(el.id);
    if (node) {
      node.style.left = el.x + 'px'; node.style.top = el.y + 'px';
      node.style.width = el.width + 'px'; node.style.height = el.height + 'px';
    }

    // Update handles wrap
    const hw = document.querySelector('.ce-handles-wrap');
    if (hw) {
      hw.style.left = (el.x - 2) + 'px'; hw.style.top = (el.y - 2) + 'px';
      hw.style.width = (el.width + 4) + 'px'; hw.style.height = (el.height + 4) + 'px';
    }

    syncPropsPanel(el);
  }

  function onUp() {
    cePushHistory();
    ceShowHandles(el);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── ROTATE ────────────────────────────────────────
function ceRotate(e, el) {
  const node = document.getElementById(el.id);
  if (!node) return;
  const rect = node.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  function onMove(ev) {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
    el.rotation = Math.round(angle);
    node.style.transform = 'rotate(' + el.rotation + 'deg)';
    const hw = document.querySelector('.ce-handles-wrap');
    if (hw) hw.style.transform = 'rotate(' + el.rotation + 'deg)';
  }

  function onUp() {
    cePushHistory();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── SNAPPING ──────────────────────────────────────
function ceGetSnapPoints(excludeId) {
  const pts = {
    x: [0, S.canvasW / 2, S.canvasW],
    y: [0, S.canvasH / 2, S.canvasH],
  };
  CE.elements.forEach(function(el) {
    if (el.id === excludeId) return;
    pts.x.push(el.x, el.x + el.width / 2, el.x + el.width);
    pts.y.push(el.y, el.y + (el.height || 60) / 2, el.y + (el.height || 60));
  });
  return pts;
}

function ceSnapPosition(x, y, w, h, pts) {
  const T = CE.snapThreshold;
  let sx = x, sy = y;
  const guides = [];

  // Snap left edge
  for (const px of pts.x) {
    if (Math.abs(x - px) < T) { sx = px; guides.push({ type:'v', x: px }); break; }
    if (Math.abs(x + w - px) < T) { sx = px - w; guides.push({ type:'v', x: px }); break; }
    if (Math.abs(x + w/2 - px) < T) { sx = px - w/2; guides.push({ type:'v', x: px }); break; }
  }
  for (const py of pts.y) {
    if (Math.abs(y - py) < T) { sy = py; guides.push({ type:'h', y: py }); break; }
    if (Math.abs(y + h - py) < T) { sy = py - h; guides.push({ type:'h', y: py }); break; }
    if (Math.abs(y + h/2 - py) < T) { sy = py - h/2; guides.push({ type:'h', y: py }); break; }
  }

  return { x: sx, y: sy, guides };
}

// ── GUIDES ────────────────────────────────────────
function ceDrawGuides(guides) {
  if (!CE.showGuides || !guides || !guides.length) return;
  ceClearGuides();
  const c = document.getElementById('polotno-container');
  if (!c) return;
  guides.forEach(function(g) {
    const line = document.createElement('div');
    line.className = 'ce-guide';
    if (g.type === 'v') {
      line.style.cssText = 'position:absolute;top:0;bottom:0;left:' + g.x + 'px;width:1px;background:rgba(255,90,31,0.6);pointer-events:none;z-index:9998;';
    } else {
      line.style.cssText = 'position:absolute;left:0;right:0;top:' + g.y + 'px;height:1px;background:rgba(255,90,31,0.6);pointer-events:none;z-index:9998;';
    }
    c.appendChild(line);
  });
}

function ceClearGuides() {
  document.querySelectorAll('.ce-guide').forEach(g => g.remove());
}

// ── DELETE / DUPLICATE ────────────────────────────
function ceDeleteSelected() {
  if (!CE.selected) return;
  const id = CE.selected;
  CE.elements = CE.elements.filter(e => e.id !== id);
  const node = document.getElementById(id);
  if (node) node.remove();
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());
  CE.selected = null;
  cePushHistory();
  updateLayers();
  showElementProps(null);
  showToast('Deleted');
}

function ceDuplicateSelected() {
  if (!CE.selected) return;
  const orig = CE.elements.find(e => e.id === CE.selected);
  if (!orig) return;
  const clone = Object.assign({}, orig, {
    id: 'el_' + (CE.nextId++), x: orig.x + 24, y: orig.y + 24,
  });
  CE.elements.push(clone);
  cePushHistory();
  ceRenderElement(clone);
  ceSelect(clone.id);
  updateLayers();
}

// ── LAYER OPERATIONS ──────────────────────────────
function ceMoveUp(id) {
  var i = CE.elements.findIndex(function(e) { return e.id === id; });
  if (i < CE.elements.length - 1) {
    var tmp = CE.elements[i];
    CE.elements[i] = CE.elements[i+1];
    CE.elements[i+1] = tmp;
    ceEnforceLayerOrder();
    cePushHistory();
    updateLayers();
    showToast('Layer moved up');
  }
}
function ceMoveDown(id) {
  var i = CE.elements.findIndex(function(e) { return e.id === id; });
  if (i > 0) {
    var tmp = CE.elements[i];
    CE.elements[i] = CE.elements[i-1];
    CE.elements[i-1] = tmp;
    ceEnforceLayerOrder();
    cePushHistory();
    updateLayers();
    showToast('Layer moved down');
  }
}
function ceBringToFront(id) {
  var i = CE.elements.findIndex(function(e) { return e.id === id; });
  if (i < CE.elements.length - 1) {
    var el = CE.elements.splice(i, 1)[0];
    CE.elements.push(el);
    ceEnforceLayerOrder();
    cePushHistory();
    updateLayers();
    showToast('Brought to front');
  }
}
function ceSendToBack(id) {
  var i = CE.elements.findIndex(function(e) { return e.id === id; });
  if (i > 0) {
    var el = CE.elements.splice(i, 1)[0];
    // Put after locked elements
    var firstUnlocked = CE.elements.findIndex(function(e) { return !e.locked; });
    CE.elements.splice(firstUnlocked >= 0 ? firstUnlocked : 0, 0, el);
    ceEnforceLayerOrder();
    cePushHistory();
    updateLayers();
    showToast('Sent to back');
  }
}
function ceToggleVis(id) {
  const el = CE.elements.find(e => e.id === id);
  if (!el) return;
  el.visible = !el.visible;
  const node = document.getElementById(id);
  if (node) node.style.display = el.visible ? '' : 'none';
  updateLayers();
}

// ── UPDATE ELEMENT PROP ───────────────────────────
function ceUpdateProp(id, key, value) {
  const el = CE.elements.find(e => e.id === id);
  if (!el) return;
  el[key] = value;
  ceRenderElement(el);
  ceSelect(id);
  cePushHistory();
}

// ── CLEAR ─────────────────────────────────────────
function ceClearCanvas() {
  CE.elements = [];
  CE.selected = null;
  CE.nextId = 1;
  const c = document.getElementById('polotno-container');
  if (c) c.querySelectorAll('.ce-el, .ce-handles-wrap, .ce-guide').forEach(n => n.remove());
  updateLayers();
}

// ── SYNC PROPS PANEL ──────────────────────────────
function syncPropsPanel(el) {
  const xEl = document.getElementById('prop-x');
  const yEl = document.getElementById('prop-y');
  const wEl = document.getElementById('prop-w');
  const hEl = document.getElementById('prop-h');
  if (xEl) xEl.value = Math.round(el.x);
  if (yEl) yEl.value = Math.round(el.y);
  if (wEl) wEl.value = Math.round(el.width);
  if (hEl) hEl.value = Math.round(el.height || 0);
}

// ── MAIN RENDER FROM LAYOUT JSON ──────────────────
function renderElementsToCanvas(layout, qrSrc) {
  const c = document.getElementById('polotno-container');
  if (!c) return;

  // Set canvas background + dimensions
  const bg = (layout.canvas && layout.canvas.background) ? layout.canvas.background : '#ffffff';
  c.style.background = bg;
  c.style.position = 'relative';
  c.style.overflow = 'hidden';

  // Clear canvas
  ceClearCanvas();

  // Add all elements
  layout.elements.forEach(function(el) {
    if (!el || !el.type) return;

    const resolvedSrc = (el.isQR || el.src === '{{QR_URL}}') ? qrSrc : (el.src || '');

    const props = {
      type:   el.type,
      name:   el.name || el.type,
      x:      el.x   || 0,
      y:      el.y   || 0,
      width:  el.width  || 200,
      height: el.height || (el.type === 'text' ? undefined : 80),
    };

    if (el.type === 'rect') {
      Object.assign(props, {
        fill:         el.fill || '#cccccc',
        cornerRadius: el.cornerRadius || 0,
        stroke:       el.stroke || null,
        strokeWidth:  el.strokeWidth || 1,
        opacity:      el.opacity != null ? el.opacity : 1,
      });
    } else if (el.type === 'text') {
      var tLen = (el.text || '').length;
      var tSize = el.fontSize || 16;
      Object.assign(props, {
        text:          el.text || '',
        fontSize:      tSize,
        fontWeight:    el.fontWeight || 'normal',
        fontFamily:    el.fontFamily || 'Inter',
        fill:          el.fill || '#000000',
        align:         el.align || 'left',
        lineHeight:    el.lineHeight || 1.35,
        letterSpacing: el.letterSpacing || 'normal',
        // Short labels get wider default width to prevent wrapping
        width:         el.width || (tLen < 10 && tSize <= 18 ? Math.max(el.width||200, tLen * tSize * 0.65) : el.width || 400),
      });
      delete props.height; // text height is auto
    } else if (el.type === 'image') {
      Object.assign(props, {
        src:          resolvedSrc,
        cornerRadius: el.cornerRadius || 0,
        height:       el.height || el.width || 150,
      });
    }

    // Use ceAddElement but skip auto-select + history during bulk load
    const id = 'el_' + (CE.nextId++);
    const newEl = Object.assign({ id, visible: true, rotation: 0 }, props);

    // Lock full-canvas background rects so they can't be accidentally selected
    if (newEl.type === 'rect' &&
        newEl.x === 0 && newEl.y === 0 &&
        newEl.width >= S.canvasW - 10 &&
        newEl.height >= S.canvasH - 10) {
      newEl.locked = true;
      // Background rects should not catch pointer events
    }

    CE.elements.push(newEl);
    ceRenderElement(newEl);
  });

  // One history snapshot for the whole layout
  cePushHistory();
  ceEnforceLayerOrder();
  updateLayers();
  setTimeout(function() { editorActions.zoomFit(); }, 80);
}

// ── EXPORT JSON ───────────────────────────────────
function ceExportJSON() {
  const c = document.getElementById('polotno-container');
  return {
    canvas: { width: S.canvasW, height: S.canvasH, background: c ? c.style.background : '#ffffff' },
    elements: CE.elements.map(function(el) { return Object.assign({}, el); }),
  };
}

// ── UPDATE LAYERS PANEL ───────────────────────────
function updateLayers() {
  var list = document.getElementById('layer-list');
  if (!list) return;

  if (!CE.elements.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px 12px;font-family:var(--mono);font-size:0.65rem;color:rgba(255,255,255,0.2)">No elements yet</div>';
    return;
  }

  var icons = { text:'T', image:'🖼', rect:'▭' };
  var typeColors = { text:'rgba(255,90,31,0.7)', image:'rgba(100,180,255,0.6)', rect:'rgba(180,180,180,0.5)' };
  var n = CE.elements.length;

  list.innerHTML = CE.elements.slice().reverse().map(function(el, revIdx) {
    var realIdx = n - 1 - revIdx;
    var icon = icons[el.type] || '·';
    var name = el.name || el.type;
    var sel = CE.selected === el.id;
    var color = typeColors[el.type] || 'rgba(255,255,255,0.4)';
    var isTop = realIdx === n - 1;
    var isBot = realIdx === 0;
    var locked = el.locked;

    var upBtn = '<button title="Up" onclick="event.stopPropagation();ceMoveUp(\'' + el.id + '\')" style="width:18px;height:18px;background:rgba(255,255,255,0.06);border:none;border-radius:3px;cursor:pointer;color:rgba(255,255,255,' + (isTop?'0.2':'0.6') + ');font-size:10px;' + (isTop?'pointer-events:none':'') + '">↑</button>';
    var dnBtn = '<button title="Down" onclick="event.stopPropagation();ceMoveDown(\'' + el.id + '\')" style="width:18px;height:18px;background:rgba(255,255,255,0.06);border:none;border-radius:3px;cursor:pointer;color:rgba(255,255,255,' + (isBot?'0.2':'0.6') + ');font-size:10px;' + (isBot?'pointer-events:none':'') + '">↓</button>';
    var visBtn = '<button title="' + (el.visible!==false?'Hide':'Show') + '" onclick="event.stopPropagation();ceToggleVis(\'' + el.id + '\')" style="width:18px;height:18px;background:rgba(255,255,255,0.06);border:none;border-radius:3px;cursor:pointer;color:rgba(255,255,255,0.5);font-size:10px">' + (el.visible!==false?'👁':'○') + '</button>';

    return '<div class="layer-item' + (sel?' selected':'') + '" data-el-id="' + el.id + '" onclick="ceSelect(\'' + el.id + '\')" style="' + (sel?'background:rgba(255,90,31,0.08);border-color:rgba(255,90,31,0.4);':'') + '">' +
      '<span style="width:16px;height:16px;border-radius:3px;background:' + color + ';display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;color:#fff;flex-shrink:0;margin-right:6px">' + icon + '</span>' +
      '<span class="layer-name" style="flex:1;' + (locked?'opacity:0.35;':'') + '">' + name + (locked?' 🔒':'') + '</span>' +
      (!locked ? '<div style="display:flex;gap:2px">' + upBtn + dnBtn + visBtn + '</div>' : '') +
      '</div>';
  }).join('');

  // Also update layers count badge if present
  var badge = document.getElementById('layers-count');
  if (badge) badge.textContent = n + ' layers';
}


// ── SHOW ELEMENT PROPS ────────────────────────────
function showElementProps(el) {
  var noSel = document.getElementById('no-selection');
  var textP = document.getElementById('text-props');
  var imgP  = document.getElementById('image-props');

  if (!el) {
    if (noSel) noSel.style.display = '';
    if (textP) textP.style.display = 'none';
    if (imgP)  imgP.style.display  = 'none';
    return;
  }
  if (noSel) noSel.style.display = 'none';

  if (el.type === 'text') {
    if (imgP) imgP.style.display = 'none';
    // Render full typography inspector
    ceRenderTypographyPanel(el);
  } else {
    if (textP) textP.style.display = 'none';
    if (imgP) imgP.style.display = '';
    var xEl = document.getElementById('prop-x');
    var yEl = document.getElementById('prop-y');
    var wEl = document.getElementById('prop-w');
    var hEl = document.getElementById('prop-h');
    if (xEl) { xEl.value = Math.round(el.x);           xEl.onchange = function() { ceUpdateProp(el.id,'x',parseInt(xEl.value)); }; }
    if (yEl) { yEl.value = Math.round(el.y);           yEl.onchange = function() { ceUpdateProp(el.id,'y',parseInt(yEl.value)); }; }
    if (wEl) { wEl.value = Math.round(el.width);       wEl.onchange = function() { ceUpdateProp(el.id,'width',parseInt(wEl.value)); }; }
    if (hEl) { hEl.value = Math.round(el.height || 0); hEl.onchange = function() { ceUpdateProp(el.id,'height',parseInt(hEl.value)); }; }
    // Duplicate + Delete for non-text
    var acts = document.getElementById('el-actions');
    if (!acts) {
      acts = document.createElement('div');
      acts.id = 'el-actions';
      acts.style.cssText = 'display:flex;gap:6px;margin-top:16px';
      if (imgP) imgP.appendChild(acts);
    }
    acts.innerHTML = '<button onclick="ceDuplicateSelected()" style="flex:1;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text-mid);font-family:var(--mono);font-size:0.65rem;cursor:pointer">⊕ Duplicate</button>' +
      '<button onclick="ceDeleteSelected()" style="flex:1;padding:8px;background:rgba(220,50,50,0.08);border:1px solid rgba(220,50,50,0.2);border-radius:8px;color:rgba(220,100,100,0.8);font-family:var(--mono);font-size:0.65rem;cursor:pointer">✕ Delete</button>';
  }
}

// ── COLOR CONTROLS ────────────────────────────────
function setTextColor(color) {
  if (CE.selected) {
    const el = CE.elements.find(e => e.id === CE.selected);
    if (el && el.type === 'text') ceUpdateProp(el.id, 'fill', color);
  }
  const p = document.getElementById('text-color-preview');
  const h = document.getElementById('text-color-hex');
  if (p) p.style.background = color;
  if (h) h.textContent = color;
}

function setBgColor(color) {
  const c = document.getElementById('polotno-container');
  if (c) c.style.background = color;
  const p = document.getElementById('bg-color-preview');
  const h = document.getElementById('bg-color-hex');
  const i = document.getElementById('bg-color-input');
  if (p) p.style.background = color;
  if (h) h.textContent = color;
  if (i) i.value = color;
}

// ── ALIGN HELPERS ─────────────────────────────────
function applyAlign(direction) {
  if (!CE.selected) return;
  const el = CE.elements.find(e => e.id === CE.selected);
  if (!el) return;
  if (el.type === 'text') {
    ceUpdateProp(el.id, 'align', direction === 'left' ? 'left' : direction === 'center' ? 'center' : 'right');
    return;
  }
  // Positional alignment to canvas
  if (direction === 'center') { el.x = Math.round((S.canvasW - el.width) / 2); }
  if (direction === 'left')   { el.x = 0; }
  if (direction === 'right')  { el.x = S.canvasW - el.width; }
  const node = document.getElementById(el.id);
  if (node) node.style.left = el.x + 'px';
  ceShowHandles(el);
  cePushHistory();
  showToast('Aligned ' + direction);
}


// ── TEXT STYLE PRESETS ────────────────────────────
var CE_TEXT_STYLES = {
  heading:    { text:'Heading',         fontSize:52, fontWeight:'bold',   fontFamily:'Inter',           fill:'#0a0a0a', align:'left' },
  subheading: { text:'Subheading',      fontSize:28, fontWeight:'600',    fontFamily:'Inter',           fill:'#333333', align:'left' },
  body:       { text:'Body text here',  fontSize:16, fontWeight:'normal', fontFamily:'Inter',           fill:'#555555', align:'left' },
  caption:    { text:'Caption text',    fontSize:12, fontWeight:'normal', fontFamily:'DM Mono',         fill:'#888888', align:'left' },
  cta:        { text:'CLICK HERE →',   fontSize:18, fontWeight:'bold',   fontFamily:'Inter',           fill:'#ffffff', align:'center' },
};

function ceAddTextStyle(styleKey) {
  var s = CE_TEXT_STYLES[styleKey] || CE_TEXT_STYLES.body;
  ceAddElement({
    type: 'text',
    text: s.text,
    x: 60,
    y: Math.max(60, (CE.elements.length * 40) % (S.canvasH - 100)),
    width: Math.round(S.canvasW * 0.75),
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontFamily: s.fontFamily,
    fill: s.fill,
    align: s.align,
    name: styleKey.charAt(0).toUpperCase() + styleKey.slice(1),
  });
  showToast(styleKey.charAt(0).toUpperCase() + styleKey.slice(1) + ' added');
}

// ── FIX setBgGradient ─────────────────────────────
function setBgGradient(grad) {
  // Decode %27 back to quotes if needed
  var decoded = grad.replace(/%27/g, "'");
  var c = document.getElementById('polotno-container');
  if (c) c.style.background = decoded;
  showToast('Background updated');
}

// ── ADD ELEMENT HELPERS ───────────────────────────
function addText() {
  ceAddElement({ type:'text', text:'Click to edit text', x:80, y:200, width:400, fontSize:24, fontFamily:'Inter', fill:'#0a0a0a', align:'left' });
  showToast('Text added — double-click to edit');
}
function addTextWithFont(font, size) {
  ceAddElement({ type:'text', text:'Click to edit', x:80, y:200, width:400, fontSize: size||24, fontFamily: font||'Inter', fill:'#0a0a0a', align:'left' });
}
function addElement(type) {
  if (type === 'rect')    { ceAddElement({ type:'rect', x:100, y:200, width:200, height:100, fill:'#ff5a1f', cornerRadius:8 }); }
  else if (type === 'ellipse') { ceAddElement({ type:'rect', x:100, y:200, width:150, height:150, fill:'#ff5a1f', cornerRadius:75 }); }
  else if (type === 'text') { addText(); }
  else if (type === 'line') { ceAddElement({ type:'rect', x:100, y:200, width:300, height:3, fill:'#ff5a1f' }); }
  else { showToast('Adding: ' + type); }
}
function addQR(url) {
  const qrUrl = url || (S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : window.PUBLIC_APP_ORIGIN);
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qrUrl);
  ceAddElement({ type:'image', src:qrSrc, x:100, y:200, width:200, height:200, name:'QR Code', cornerRadius:4 });
  showToast('QR code added');
}
function addImageToCanvas(src) {
  ceAddElement({ type:'image', src:src, x:80, y:200, width:300, height:200, name:'Image' });
}

// ── KEYBOARD SHORTCUTS ────────────────────────────
document.addEventListener('keydown', function(e) {
  if (!CE.selected) return;
  const active = document.activeElement;
  if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

  const el = CE.elements.find(e2 => e2.id === CE.selected);
  if (!el) return;
  const step = e.shiftKey ? 10 : 1;

  switch (e.key) {
    case 'Delete': case 'Backspace': ceDeleteSelected(); break;
    case 'ArrowLeft':  e.preventDefault(); el.x -= step; break;
    case 'ArrowRight': e.preventDefault(); el.x += step; break;
    case 'ArrowUp':    e.preventDefault(); el.y -= step; break;
    case 'ArrowDown':  e.preventDefault(); el.y += step; break;
    case 'd': if (e.metaKey || e.ctrlKey) { e.preventDefault(); ceDuplicateSelected(); } break;
    case 'Escape': ceDeselect(); break;
  }

  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const node = document.getElementById(el.id);
    if (node) { node.style.left = el.x + 'px'; node.style.top = el.y + 'px'; }
    const hw = document.querySelector('.ce-handles-wrap');
    if (hw) { hw.style.left = (el.x - 2) + 'px'; hw.style.top = (el.y - 2) + 'px'; }
    syncPropsPanel(el);
  }
});

// ── CANVAS CLICK TO DESELECT ──────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const c = document.getElementById('polotno-container');
  if (c) {
    c.addEventListener('mousedown', function(e) {
      // Only deselect if clicking directly on the container background
      if (e.target === c || e.target.id === 'polotno-container') {
        ceDeselect();
      }
    });
  }
});
// ── TEXT RESIZE HANDLES ───────────────────────────
// Text elements get left/right/corner handles for width control
function ceShowTextHandles(el, node) {
  if (!node) node = document.getElementById(el.id);
  if (!node) return;

  var container = document.getElementById('polotno-container');
  if (!container) return;

  var wrap = document.createElement('div');
  wrap.className = 'ce-handles-wrap';
  wrap.style.cssText = [
    'position:absolute',
    'left:' + (el.x - 2) + 'px',
    'top:' + (el.y - 2) + 'px',
    'width:' + (el.width + 4) + 'px',
    'height:' + (node.offsetHeight + 4) + 'px',
    'pointer-events:none',
    'z-index:1001',
    'border:1.5px solid rgba(255,90,31,0.6)',
    'border-radius:2px',
  ].join(';');

  // Text handles: only sides and corners (no top/bottom = height is auto)
  var textDirs = [
    { d:'w',  s:'top:50%;left:-5px;transform:translateY(-50%);cursor:w-resize' },
    { d:'e',  s:'top:50%;right:-5px;transform:translateY(-50%);cursor:e-resize' },
    { d:'nw', s:'top:-5px;left:-5px;cursor:nw-resize' },
    { d:'ne', s:'top:-5px;right:-5px;cursor:ne-resize' },
    { d:'sw', s:'bottom:-5px;left:-5px;cursor:sw-resize' },
    { d:'se', s:'bottom:-5px;right:-5px;cursor:se-resize' },
  ];

  textDirs.forEach(function(dir) {
    var h = document.createElement('div');
    h.className = 'ce-handle';
    h.dataset.dir = dir.d;
    h.style.cssText = 'position:absolute;width:10px;height:10px;background:#ff5a1f;border:2px solid #fff;border-radius:2px;pointer-events:all;box-shadow:0 1px 4px rgba(0,0,0,0.4);' + dir.s;
    h.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      ceResizeText(e, el, dir.d);
    });
    wrap.appendChild(h);
  });

  // Auto-width toggle button
  var autoBtn = document.createElement('div');
  autoBtn.title = el.autoWidth ? 'Switch to fixed width' : 'Switch to auto width';
  autoBtn.style.cssText = 'position:absolute;top:-20px;right:0;height:16px;padding:0 5px;background:rgba(255,90,31,0.15);border:1px solid rgba(255,90,31,0.3);border-radius:3px;font-family:monospace;font-size:9px;color:rgba(255,130,60,0.8);pointer-events:all;cursor:pointer;display:flex;align-items:center;white-space:nowrap;';
  autoBtn.textContent = el.autoWidth ? 'AUTO' : 'FIXED';
  autoBtn.addEventListener('mousedown', function(e) {
    e.stopPropagation();
    e.preventDefault();
  });
  autoBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    ceToggleTextAutoWidth(el);
  });
  wrap.appendChild(autoBtn);

  // Rotation handle
  var rot = document.createElement('div');
  rot.style.cssText = 'position:absolute;width:12px;height:12px;background:#7c3aed;border:2px solid #fff;border-radius:50%;pointer-events:all;top:-22px;left:50%;transform:translateX(-50%);cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,0.4)';
  rot.title = 'Rotate';
  rot.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    ceRotate(e, el);
  });
  wrap.appendChild(rot);

  container.appendChild(wrap);
}

// ── TEXT AUTO-WIDTH TOGGLE ────────────────────────
function ceToggleTextAutoWidth(el) {
  var node = document.getElementById(el.id);
  if (!node) return;
  el.autoWidth = !el.autoWidth;
  if (el.autoWidth) {
    // Expand to fit content
    node.style.whiteSpace = 'nowrap';
    node.style.width = 'auto';
    node.style.minWidth = '20px';
    node.style.maxWidth = S.canvasW + 'px';
    // Measure and set width
    setTimeout(function() {
      el.width = Math.min(node.scrollWidth + 8, S.canvasW - el.x);
      node.style.width = el.width + 'px';
      node.style.whiteSpace = 'pre-wrap';
      el.autoWidth = false;
      ceShowTextHandles(el, node);
      cePushHistory();
    }, 20);
  } else {
    node.style.whiteSpace = 'pre-wrap';
    ceShowTextHandles(el, node);
  }
  showToast(el.autoWidth ? 'Auto width' : 'Width fitted to text');
}

// ── TEXT RESIZE ───────────────────────────────────
function ceResizeText(e, el, dir) {
  var start = ceClientToCanvas(e.clientX, e.clientY);
  var startX = el.x, startW = el.width;
  var node = document.getElementById(el.id);

  function onMove(ev) {
    var pos = ceClientToCanvas(ev.clientX, ev.clientY);
    var dx = pos.x - start.x;
    var nw = startW, nx = startX;

    if (dir.includes('e')) {
      nw = Math.max(40, startW + dx);
    }
    if (dir.includes('w')) {
      nx = startX + dx;
      nw = Math.max(40, startW - dx);
    }

    el.x = Math.round(nx);
    el.width = Math.round(nw);

    if (node) {
      node.style.left = el.x + 'px';
      node.style.width = el.width + 'px';
      // Force text reflow
      el.height = node.offsetHeight;
    }

    // Update handle wrap live
    var hw = document.querySelector('.ce-handles-wrap');
    if (hw) {
      hw.style.left = (el.x - 2) + 'px';
      hw.style.width = (el.width + 4) + 'px';
      hw.style.height = (node ? node.offsetHeight + 4 : 60) + 'px';
    }

    // Corner handles also resize font proportionally
    if ((dir === 'nw' || dir === 'ne' || dir === 'sw' || dir === 'se') && el.fontSize) {
      var scale = nw / startW;
      var newSize = Math.max(8, Math.round(el.fontSize * scale));
      // Only scale font if significant change
      if (Math.abs(newSize - el.fontSize) > 1) {
        el.fontSize = newSize;
        if (node) node.style.fontSize = newSize + 'px';
        // Update floating toolbar size selector
        var ftSize = document.getElementById('ft-size');
        if (ftSize) ftSize.value = newSize;
        var tpSize = document.getElementById('tp-size');
        if (tpSize) tpSize.value = newSize;
      }
    }

    syncPropsPanel(el);
  }

  function onUp() {
    el.height = node ? node.offsetHeight : el.height;
    cePushHistory();
    ceShowTextHandles(el, node);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}



// ── WORKSPACE NAVIGATION ──────────────────────────
(function() {
  var isPanning = false;
  var spaceDown = false;
  var panStart = null;
  var panScrollStart = null;

  // ── MOUSE WHEEL: Ctrl+wheel = zoom, plain wheel = scroll ──
  document.addEventListener('wheel', function(e) {
    var vp = document.getElementById('workspace-viewport');
    if (!vp || !vp.contains(e.target)) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.08 : 0.08;
      // Zoom toward mouse position
      applyZoom(S.zoom + delta * S.zoom);
    }
    // Plain wheel - let browser scroll naturally (workspace-viewport handles it)
  }, { passive: false });

  // ── SPACEBAR PAN ──────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !e.target.isContentEditable &&
        e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      if (!spaceDown) {
        spaceDown = true;
        var vp = document.getElementById('workspace-viewport');
        if (vp) vp.style.cursor = 'grab';
        e.preventDefault();
      }
    }
  });

  document.addEventListener('keyup', function(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      var vp = document.getElementById('workspace-viewport');
      if (vp) vp.style.cursor = '';
      isPanning = false;
    }
  });

  // ── MIDDLE MOUSE + SPACEBAR DRAG TO PAN ──────────
  document.addEventListener('mousedown', function(e) {
    var vp = document.getElementById('workspace-viewport');
    if (!vp) return;

    // Middle mouse button OR space+left click
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      if (!vp.contains(e.target)) return;
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panScrollStart = { x: vp.scrollLeft, y: vp.scrollTop };
      vp.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (!isPanning || !panStart) return;
    var vp = document.getElementById('workspace-viewport');
    if (!vp) return;
    var dx = e.clientX - panStart.x;
    var dy = e.clientY - panStart.y;
    vp.scrollLeft = panScrollStart.x - dx;
    vp.scrollTop  = panScrollStart.y - dy;
  });

  document.addEventListener('mouseup', function(e) {
    if (isPanning) {
      isPanning = false;
      panStart = null;
      var vp = document.getElementById('workspace-viewport');
      if (vp) vp.style.cursor = spaceDown ? 'grab' : '';
    }
  });

  // ── INIT: set workspace surface size on load ──────
  window.addEventListener('load', function() {
    setTimeout(function() {
      var surface = document.getElementById('workspace-surface');
      if (surface && S) {
        surface.style.minWidth = (S.canvasW + 240) + 'px';
        surface.style.minHeight = (S.canvasH + 320) + 'px';
      }
    }, 300);
  });
})();
