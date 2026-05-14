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
  const el = Object.assign({
    id, visible: true, x: 80, y: 80,
    width: 200, height: 60, rotation: 0,
  }, props);
  // Ensure height is set for rects/images
  if ((el.type === 'rect' || el.type === 'image') && !el.height) el.height = 80;
  CE.elements.push(el);
  cePushHistory();
  ceRenderElement(el);
  ceSelect(id);
  updateLayers();
  return id;
}

// ── RENDER ALL ────────────────────────────────────
function ceRenderAll() {
  const c = document.getElementById('polotno-container');
  if (!c) return;
  c.querySelectorAll('.ce-el, .ce-guide').forEach(n => n.remove());
  CE.elements.forEach(el => { if (el.visible !== false) ceRenderElement(el); });
  updateLayers();
  if (CE.selected) {
    const sel = CE.elements.find(e => e.id === CE.selected);
    if (sel) ceShowHandles(sel);
  }
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

  // ── TEXT ──────────────────────────────────────
  } else if (el.type === 'text') {
    node.style.height = 'auto';
    node.style.minHeight = (el.height || 24) + 'px';
    node.style.color = el.fill || '#000000';
    node.style.fontSize = (el.fontSize || 16) + 'px';
    node.style.fontWeight = el.fontWeight || 'normal';
    node.style.fontFamily = (el.fontFamily || 'Inter') + ',sans-serif';
    node.style.textAlign = el.align || 'left';
    node.style.lineHeight = el.lineHeight || 1.35;
    node.style.letterSpacing = el.letterSpacing || 'normal';
    node.style.whiteSpace = 'pre-wrap';
    node.style.wordBreak = 'break-word';
    node.style.overflowWrap = 'break-word';
    node.style.background = 'transparent';
    node.style.padding = '2px';
    node.style.cursor = 'text';
    node.contentEditable = 'true';
    node.spellcheck = false;
    node.textContent = el.text || '';

    node.addEventListener('input', function() {
      el.text = node.innerText;
      el.height = node.offsetHeight;
    });
    node.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { node.blur(); ceSelect(el.id); }
      e.stopPropagation();
    });
    node.addEventListener('focus', function() {
      node.style.outline = '2px solid rgba(255,90,31,0.7)';
      node.style.outlineOffset = '1px';
      CE.selected = el.id;
    });
    node.addEventListener('blur', function() {
      node.style.outline = 'none';
      el.text = node.innerText;
      el.height = node.offsetHeight;
      cePushHistory();
    });

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
  node.addEventListener('mousedown', function(e) {
    // Allow text cursor clicks on text elements
    if (el.type === 'text' && e.target.isContentEditable) return;
    e.preventDefault();
    e.stopPropagation();
    ceSelect(el.id);
    ceDrag(e, el);
  });

  c.appendChild(node);
}

// ── SELECTION + HANDLES ───────────────────────────
function ceSelect(id) {
  // Clear previous
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());
  document.querySelectorAll('.ce-el').forEach(n => {
    n.style.outline = 'none';
    n.style.outlineOffset = '0';
  });

  CE.selected = id || null;
  if (!id) { showElementProps(null); updateLayers(); return; }

  const el = CE.elements.find(e => e.id === id);
  if (!el) return;

  const node = document.getElementById(id);
  if (!node) return;

  if (el.type !== 'text') {
    node.style.outline = '2px solid rgba(255,90,31,0.85)';
    node.style.outlineOffset = '1px';
  }

  ceShowHandles(el);
  showElementProps(el);
  updateLayers();
}

function ceDeselect() {
  ceSelect(null);
}

function ceShowHandles(el) {
  // Remove existing
  document.querySelectorAll('.ce-handles-wrap').forEach(h => h.remove());

  const node = document.getElementById(el.id);
  if (!node) return;

  // Text elements don't have resize handles (they auto-size vertically)
  if (el.type === 'text') return;

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
  const i = CE.elements.findIndex(e => e.id === id);
  if (i < CE.elements.length - 1) {
    [CE.elements[i], CE.elements[i+1]] = [CE.elements[i+1], CE.elements[i]];
    ceRenderAll(); cePushHistory();
  }
}
function ceMoveDown(id) {
  const i = CE.elements.findIndex(e => e.id === id);
  if (i > 0) {
    [CE.elements[i], CE.elements[i-1]] = [CE.elements[i-1], CE.elements[i]];
    ceRenderAll(); cePushHistory();
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
      Object.assign(props, {
        text:          el.text || '',
        fontSize:      el.fontSize || 16,
        fontWeight:    el.fontWeight || 'normal',
        fontFamily:    el.fontFamily || 'Inter',
        fill:          el.fill || '#000000',
        align:         el.align || 'left',
        lineHeight:    el.lineHeight || 1.35,
        letterSpacing: el.letterSpacing || 'normal',
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
    CE.elements.push(newEl);
    ceRenderElement(newEl);
  });

  // One history snapshot for the whole layout
  cePushHistory();
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
  const list = document.getElementById('layer-list');
  if (!list) return;
  if (!CE.elements.length) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">⊹</div><p>No elements yet.</p></div>';
    return;
  }
  const icons = { text:'T', image:'🖼', rect:'▭' };
  list.innerHTML = [...CE.elements].reverse().map(function(el) {
    const icon = icons[el.type] || '·';
    const name = el.name || el.type;
    const sel = CE.selected === el.id;
    return '<div class="layer-item' + (sel ? ' selected' : '') + '" data-el-id="' + el.id + '" onclick="ceSelect(\'' + el.id + '\')" style="' + (sel ? 'border-color:rgba(255,90,31,0.5)' : '') + '">' +
      '<span class="layer-icon">' + icon + '</span>' +
      '<span class="layer-name">' + name + '</span>' +
      '<button class="layer-vis" onclick="event.stopPropagation();ceToggleVis(\'' + el.id + '\')">' + (el.visible !== false ? '👁' : '○') + '</button>' +
      '</div>';
  }).join('');
}

// ── SHOW ELEMENT PROPS ────────────────────────────
function showElementProps(el) {
  const noSel = document.getElementById('no-selection');
  const textP = document.getElementById('text-props');
  const imgP  = document.getElementById('image-props');

  if (!el) {
    if (noSel) noSel.style.display = '';
    if (textP) textP.style.display = 'none';
    if (imgP)  imgP.style.display  = 'none';
    return;
  }
  if (noSel) noSel.style.display = 'none';

  if (el.type === 'text') {
    if (textP) textP.style.display = '';
    if (imgP)  imgP.style.display  = 'none';
    const fEl = document.getElementById('prop-font');
    const sEl = document.getElementById('prop-size');
    const wEl = document.getElementById('prop-weight');
    if (fEl) { fEl.value = el.fontFamily || 'Inter'; fEl.onchange = function() { ceUpdateProp(el.id, 'fontFamily', fEl.value); }; }
    if (sEl) { sEl.value = el.fontSize || 16;       sEl.onchange = function() { ceUpdateProp(el.id, 'fontSize', parseInt(sEl.value)); }; }
    if (wEl) { wEl.value = el.fontWeight || '400';  wEl.onchange = function() { ceUpdateProp(el.id, 'fontWeight', wEl.value); }; }
  } else {
    if (textP) textP.style.display = 'none';
    if (imgP)  imgP.style.display  = '';
    const xEl = document.getElementById('prop-x');
    const yEl = document.getElementById('prop-y');
    const wEl = document.getElementById('prop-w');
    const hEl = document.getElementById('prop-h');
    if (xEl) { xEl.value = Math.round(el.x);          xEl.onchange = function() { ceUpdateProp(el.id, 'x',      parseInt(xEl.value)); }; }
    if (yEl) { yEl.value = Math.round(el.y);          yEl.onchange = function() { ceUpdateProp(el.id, 'y',      parseInt(yEl.value)); }; }
    if (wEl) { wEl.value = Math.round(el.width);      wEl.onchange = function() { ceUpdateProp(el.id, 'width',  parseInt(wEl.value)); }; }
    if (hEl) { hEl.value = Math.round(el.height || 0); hEl.onchange = function() { ceUpdateProp(el.id, 'height', parseInt(hEl.value)); }; }
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
  const qrUrl = url || (S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : 'https://qraivy.com');
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
      if (e.target === c) ceDeselect();
    });
  }
});
