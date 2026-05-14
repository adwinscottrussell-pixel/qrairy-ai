/* ─────────────────────────────────────────────────
   QRAIVY Editor — Interactive Canvas Element System
   Replaces flat HTML fallback with real draggable,
   resizable, editable elements.
   ───────────────────────────────────────────────── */

// ── ELEMENT STORE ─────────────────────────────────
// Tracks all live elements on the fallback canvas
const CE = {
  elements: [],       // Array of element objects
  selected: null,     // Currently selected element ID
  nextId: 1,
  dragging: false,
  resizing: false,
  dragOffX: 0,
  dragOffY: 0,
  resizeDir: '',
  history: [],        // Undo stack
  historyIdx: -1,
};

// ── PUSH HISTORY ──────────────────────────────────
function cePushHistory() {
  const snapshot = JSON.stringify(CE.elements.map(e => ({...e})));
  CE.history = CE.history.slice(0, CE.historyIdx + 1);
  CE.history.push(snapshot);
  CE.historyIdx++;
}

function ceUndo() {
  if (CE.historyIdx <= 0) return;
  CE.historyIdx--;
  CE.elements = JSON.parse(CE.history[CE.historyIdx]);
  ceRenderAll();
  showToast('Undo');
}

function ceRedo() {
  if (CE.historyIdx >= CE.history.length - 1) return;
  CE.historyIdx++;
  CE.elements = JSON.parse(CE.history[CE.historyIdx]);
  ceRenderAll();
  showToast('Redo');
}

// ── COORDINATE HELPERS ────────────────────────────
function ceGetCanvasScale() {
  const container = document.getElementById('polotno-container');
  if (!container) return 1;
  const wrapper = container.parentElement;
  if (!wrapper) return 1;
  const style = wrapper.style.transform || '';
  const match = style.match(/scale\(([\d.]+)\)/);
  return match ? parseFloat(match[1]) : (S.zoom || 1);
}

function ceClientToCanvas(clientX, clientY) {
  const container = document.getElementById('polotno-container');
  if (!container) return {x: clientX, y: clientY};
  const rect = container.getBoundingClientRect();
  const scale = ceGetCanvasScale();
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

// ── ADD ELEMENT ───────────────────────────────────
function ceAddElement(props) {
  const id = 'el_' + (CE.nextId++);
  const el = Object.assign({
    id, visible: true,
    x: 100, y: 100, width: 200, height: 60,
    rotation: 0,
  }, props);
  CE.elements.push(el);
  cePushHistory();
  ceRenderElement(el);
  ceSelect(id);
  updateLayers();
  return id;
}

// ── RENDER ALL ELEMENTS ───────────────────────────
function ceRenderAll() {
  const container = document.getElementById('polotno-container');
  if (!container) return;
  // Remove all existing CE elements
  container.querySelectorAll('.ce-el').forEach(n => n.remove());
  CE.elements.forEach(el => {
    if (el.visible !== false) ceRenderElement(el);
  });
  updateLayers();
}

// ── RENDER SINGLE ELEMENT ─────────────────────────
function ceRenderElement(el) {
  const container = document.getElementById('polotno-container');
  if (!container) return;

  // Remove existing node if present
  const existing = document.getElementById(el.id);
  if (existing) existing.remove();

  if (el.visible === false) return;

  const node = document.createElement('div');
  node.id = el.id;
  node.className = 'ce-el';
  node.dataset.elId = el.id;

  node.style.cssText = [
    'position:absolute',
    'left:' + el.x + 'px',
    'top:' + el.y + 'px',
    'width:' + el.width + 'px',
    'min-height:' + (el.height || 20) + 'px',
    'cursor:move',
    'user-select:none',
    'box-sizing:border-box',
    el.rotation ? 'transform:rotate(' + el.rotation + 'deg)' : '',
    'outline:none',
  ].filter(Boolean).join(';');

  // Type-specific content
  if (el.type === 'rect') {
    node.style.height = (el.height || 40) + 'px';
    node.style.background = el.fill || 'transparent';
    node.style.borderRadius = (el.cornerRadius || 0) + 'px';
    if (el.stroke) node.style.border = (el.strokeWidth||1) + 'px solid ' + el.stroke;
    if (el.opacity != null) node.style.opacity = el.opacity;

  } else if (el.type === 'text') {
    node.style.color = el.fill || '#000000';
    node.style.fontSize = (el.fontSize || 16) + 'px';
    node.style.fontWeight = el.fontWeight || 'normal';
    node.style.fontFamily = (el.fontFamily || 'Inter') + ', sans-serif';
    node.style.textAlign = el.align || 'left';
    node.style.lineHeight = el.lineHeight || 1.4;
    node.style.whiteSpace = 'pre-wrap';
    node.style.wordBreak = 'break-word';
    node.style.cursor = 'text';
    node.style.minHeight = (el.height || 30) + 'px';
    node.style.height = 'auto';
    node.style.background = 'transparent';
    node.contentEditable = 'true';
    node.textContent = el.text || '';
    node.addEventListener('input', function() {
      el.text = node.textContent;
      cePushHistory();
    });
    node.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { node.blur(); ceSelect(el.id); }
      e.stopPropagation();
    });
    node.addEventListener('focus', function() {
      node.style.outline = '2px solid rgba(255,90,31,0.6)';
      node.style.outlineOffset = '2px';
    });
    node.addEventListener('blur', function() {
      node.style.outline = 'none';
    });

  } else if (el.type === 'image') {
    node.style.height = (el.height || 150) + 'px';
    node.style.borderRadius = (el.cornerRadius || 0) + 'px';
    node.style.overflow = 'hidden';
    node.style.background = '#1a1a1a';
    const img = document.createElement('img');
    img.src = el.src || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
    img.onerror = function() { img.style.display = 'none'; };
    node.appendChild(img);
  }

  // Selection ring + resize handles (injected on select)
  node.addEventListener('mousedown', function(e) {
    if (el.type === 'text' && e.detail === 2) return; // allow double-click to edit
    e.preventDefault();
    e.stopPropagation();
    ceSelect(el.id);
    ceStartDrag(e, el);
  });

  node.addEventListener('touchstart', function(e) {
    e.preventDefault();
    ceSelect(el.id);
    ceStartDrag(e.touches[0], el);
  }, { passive: false });

  container.appendChild(node);

  // If this element is selected, add handles
  if (CE.selected === el.id) ceAddHandles(node, el);
}

// ── SELECT ELEMENT ────────────────────────────────
function ceSelect(id) {
  // Remove existing handles
  document.querySelectorAll('.ce-handles').forEach(h => h.remove());
  document.querySelectorAll('.ce-el').forEach(n => {
    n.style.outline = 'none';
  });

  CE.selected = id;

  if (!id) {
    showElementProps(null);
    return;
  }

  const el = CE.elements.find(e => e.id === id);
  if (!el) return;

  const node = document.getElementById(id);
  if (node) {
    if (el.type !== 'text') {
      node.style.outline = '2px solid rgba(255,90,31,0.8)';
      node.style.outlineOffset = '2px';
    }
    ceAddHandles(node, el);
  }

  // Update right panel
  showElementProps(el);
  // Highlight in layer list
  document.querySelectorAll('.layer-item').forEach(li => {
    li.classList.toggle('selected', li.dataset.elId === id);
  });
}

function ceDeselect() {
  ceSelect(null);
}

// ── RESIZE HANDLES ────────────────────────────────
function ceAddHandles(node, el) {
  // Remove old
  document.querySelectorAll('.ce-handles').forEach(h => h.remove());

  if (el.type === 'text') return; // text resizes by content

  const handles = document.createElement('div');
  handles.className = 'ce-handles';
  handles.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999';

  const dirs = ['nw','n','ne','e','se','s','sw','w'];
  const cursors = { nw:'nw-resize',n:'n-resize',ne:'ne-resize',e:'e-resize',se:'se-resize',s:'s-resize',sw:'sw-resize',w:'w-resize' };
  const positions = {
    nw: 'top:-5px;left:-5px', n: 'top:-5px;left:50%;transform:translateX(-50%)',
    ne: 'top:-5px;right:-5px', e: 'top:50%;right:-5px;transform:translateY(-50%)',
    se: 'bottom:-5px;right:-5px', s: 'bottom:-5px;left:50%;transform:translateX(-50%)',
    sw: 'bottom:-5px;left:-5px', w: 'top:50%;left:-5px;transform:translateY(-50%)',
  };

  dirs.forEach(dir => {
    const h = document.createElement('div');
    h.style.cssText = 'position:absolute;width:10px;height:10px;background:#ff5a1f;border:2px solid #fff;border-radius:2px;pointer-events:all;cursor:' + cursors[dir] + ';' + positions[dir];
    h.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      ceStartResize(e, el, dir);
    });
    handles.appendChild(h);
  });

  node.style.position = 'absolute';
  node.appendChild(handles);
}

// ── DRAG ──────────────────────────────────────────
function ceStartDrag(e, el) {
  const pos = ceClientToCanvas(e.clientX, e.clientY);
  CE.dragging = true;
  CE.dragOffX = pos.x - el.x;
  CE.dragOffY = pos.y - el.y;
  CE.dragEl = el;

  function onMove(ev) {
    if (!CE.dragging) return;
    const p = ceClientToCanvas(ev.clientX || ev.touches[0].clientX, ev.clientY || ev.touches[0].clientY);
    el.x = Math.round(p.x - CE.dragOffX);
    el.y = Math.round(p.y - CE.dragOffY);
    const node = document.getElementById(el.id);
    if (node) { node.style.left = el.x + 'px'; node.style.top = el.y + 'px'; }
  }

  function onUp() {
    CE.dragging = false;
    cePushHistory();
    updateLayers();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
}

// ── RESIZE ────────────────────────────────────────
function ceStartResize(e, el, dir) {
  e.preventDefault();
  e.stopPropagation();
  const startPos = ceClientToCanvas(e.clientX, e.clientY);
  const startX = el.x, startY = el.y, startW = el.width, startH = el.height || 60;

  function onMove(ev) {
    const p = ceClientToCanvas(ev.clientX, ev.clientY);
    const dx = p.x - startPos.x;
    const dy = p.y - startPos.y;

    if (dir.includes('e')) el.width = Math.max(20, startW + dx);
    if (dir.includes('s')) el.height = Math.max(10, startH + dy);
    if (dir.includes('w')) { el.x = startX + dx; el.width = Math.max(20, startW - dx); }
    if (dir.includes('n')) { el.y = startY + dy; el.height = Math.max(10, startH - dy); }

    const node = document.getElementById(el.id);
    if (node) {
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.width + 'px';
      if (el.type !== 'text') node.style.height = el.height + 'px';
    }
  }

  function onUp() {
    cePushHistory();
    ceAddHandles(document.getElementById(el.id), el);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── DELETE SELECTED ───────────────────────────────
function ceDeleteSelected() {
  if (!CE.selected) return;
  CE.elements = CE.elements.filter(e => e.id !== CE.selected);
  const node = document.getElementById(CE.selected);
  if (node) node.remove();
  document.querySelectorAll('.ce-handles').forEach(h => h.remove());
  CE.selected = null;
  cePushHistory();
  updateLayers();
  showToast('Element deleted');
}

// ── DUPLICATE SELECTED ────────────────────────────
function ceDuplicateSelected() {
  if (!CE.selected) return;
  const el = CE.elements.find(e => e.id === CE.selected);
  if (!el) return;
  const clone = Object.assign({}, el, { id: 'el_' + (CE.nextId++), x: el.x + 20, y: el.y + 20 });
  CE.elements.push(clone);
  cePushHistory();
  ceRenderElement(clone);
  ceSelect(clone.id);
  updateLayers();
}

// ── LAYER REORDER ─────────────────────────────────
function ceMoveUp(id) {
  const idx = CE.elements.findIndex(e => e.id === id);
  if (idx < CE.elements.length - 1) {
    [CE.elements[idx], CE.elements[idx+1]] = [CE.elements[idx+1], CE.elements[idx]];
    ceRenderAll();
    cePushHistory();
  }
}

function ceMoveDown(id) {
  const idx = CE.elements.findIndex(e => e.id === id);
  if (idx > 0) {
    [CE.elements[idx], CE.elements[idx-1]] = [CE.elements[idx-1], CE.elements[idx]];
    ceRenderAll();
    cePushHistory();
  }
}

// ── TOGGLE VISIBILITY ─────────────────────────────
function ceToggleVis(id) {
  const el = CE.elements.find(e => e.id === id);
  if (!el) return;
  el.visible = !el.visible;
  const node = document.getElementById(id);
  if (node) node.style.display = el.visible ? '' : 'none';
}

// ── UPDATE ELEMENT PROPERTY ───────────────────────
function ceUpdateProp(id, key, value) {
  const el = CE.elements.find(e => e.id === id);
  if (!el) return;
  el[key] = value;
  ceRenderElement(el);
  if (CE.selected === id) ceSelect(id);
  cePushHistory();
}

// ── CLEAR CANVAS ──────────────────────────────────
function ceClearCanvas() {
  CE.elements = [];
  CE.selected = null;
  CE.nextId = 1;
  const container = document.getElementById('polotno-container');
  if (container) container.querySelectorAll('.ce-el, .ce-handles').forEach(n => n.remove());
  updateLayers();
}

// ── CANVAS CLICK DESELECT ─────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('polotno-container');
  if (container) {
    container.addEventListener('mousedown', function(e) {
      if (e.target === container) ceDeselect();
    });
  }
});

// ── KEYBOARD: DELETE + ARROW NUDGE ────────────────
document.addEventListener('keydown', function(e) {
  if (!CE.selected) return;
  if (document.activeElement && document.activeElement.isContentEditable) return;
  const el = CE.elements.find(e2 => e2.id === CE.selected);
  if (!el) return;
  const step = e.shiftKey ? 10 : 1;
  if (e.key === 'Delete' || e.key === 'Backspace') { ceDeleteSelected(); return; }
  if (e.key === 'ArrowLeft')  { el.x -= step; }
  if (e.key === 'ArrowRight') { el.x += step; }
  if (e.key === 'ArrowUp')    { el.y -= step; }
  if (e.key === 'ArrowDown')  { el.y += step; }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const node = document.getElementById(el.id);
    if (node) { node.style.left = el.x + 'px'; node.style.top = el.y + 'px'; }
  }
});

// ── MAIN RENDER FUNCTION (replaces renderTemplateToFallback) ──
function renderElementsToCanvas(layout, qrSrc) {
  const container = document.getElementById('polotno-container');
  if (!container) return;

  // Set canvas background
  container.style.background = layout.canvas ? layout.canvas.background || '#ffffff' : '#ffffff';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  // Clear existing CE elements
  ceClearCanvas();

  // Add each element as an interactive CE element
  layout.elements.forEach(function(el) {
    const src = (el.isQR || el.src === '{{QR_URL}}') ? qrSrc : (el.src || '');

    const props = {
      type: el.type,
      x: el.x || 0,
      y: el.y || 0,
      width: el.width || 200,
      height: el.height || 60,
      name: el.name || el.type,
    };

    if (el.type === 'rect') {
      Object.assign(props, {
        fill: el.fill || '#cccccc',
        cornerRadius: el.cornerRadius || 0,
        stroke: el.stroke || null,
        strokeWidth: el.strokeWidth || 1,
      });
    } else if (el.type === 'text') {
      Object.assign(props, {
        text: el.text || '',
        fontSize: el.fontSize || 16,
        fontWeight: el.fontWeight || 'normal',
        fontFamily: el.fontFamily || 'Inter',
        fill: el.fill || '#000000',
        align: el.align || 'left',
        lineHeight: el.lineHeight || 1.4,
      });
    } else if (el.type === 'image') {
      Object.assign(props, {
        src: src,
        cornerRadius: el.cornerRadius || 0,
      });
    }

    ceAddElement(props);
  });

  cePushHistory();
  setTimeout(function() { editorActions.zoomFit(); }, 100);
}

// ── EXPORT CE ELEMENTS AS JSON ────────────────────
function ceExportJSON() {
  return {
    canvas: { width: S.canvasW, height: S.canvasH, background: document.getElementById('polotno-container').style.background || '#ffffff' },
    elements: CE.elements.map(function(el) { return Object.assign({}, el); })
  };
}

// ── UPDATE LAYERS PANEL (overrides canvas.js version) ─
function updateLayers() {
  const list = document.getElementById('layer-list');
  if (!list) return;

  // Use CE elements if Polotno not available
  const els = CE.elements;
  if (!els || els.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">⊹</div><p>No elements yet.</p></div>';
    return;
  }

  list.innerHTML = [...els].reverse().map(function(el) {
    const icon = el.type === 'text' ? 'T' : el.type === 'image' ? '🖼' : '▭';
    const name = el.name || el.type;
    return '<div class="layer-item' + (CE.selected === el.id ? ' selected' : '') + '" data-el-id="' + el.id + '" onclick="ceSelect(\'' + el.id + '\')">' +
      '<span class="layer-icon">' + icon + '</span>' +
      '<span class="layer-name">' + name + '</span>' +
      '<button class="layer-vis" onclick="event.stopPropagation();ceToggleVis(\'' + el.id + '\')">' + (el.visible !== false ? '👁' : '○') + '</button>' +
      '</div>';
  }).join('');
}

// ── SHOW ELEMENT PROPS (overrides canvas.js version) ──
function showElementProps(el) {
  const noSel = document.getElementById('no-selection');
  const textProps = document.getElementById('text-props');
  const imgProps = document.getElementById('image-props');

  if (!el) {
    if (noSel) noSel.style.display = '';
    if (textProps) textProps.style.display = 'none';
    if (imgProps) imgProps.style.display = 'none';
    return;
  }

  if (noSel) noSel.style.display = 'none';

  if (el.type === 'text') {
    if (textProps) textProps.style.display = '';
    if (imgProps) imgProps.style.display = 'none';
    const fontEl = document.getElementById('prop-font');
    const sizeEl = document.getElementById('prop-size');
    const weightEl = document.getElementById('prop-weight');
    if (fontEl) fontEl.value = el.fontFamily || 'Inter';
    if (sizeEl) sizeEl.value = el.fontSize || 16;
    if (weightEl) weightEl.value = el.fontWeight || '400';

    // Wire font controls
    if (fontEl) fontEl.onchange = function() { ceUpdateProp(el.id, 'fontFamily', fontEl.value); };
    if (sizeEl) sizeEl.onchange = function() { ceUpdateProp(el.id, 'fontSize', parseInt(sizeEl.value)); };
    if (weightEl) weightEl.onchange = function() { ceUpdateProp(el.id, 'fontWeight', weightEl.value); };

  } else if (el.type === 'image' || el.type === 'rect') {
    if (textProps) textProps.style.display = 'none';
    if (imgProps) imgProps.style.display = '';
    const xEl = document.getElementById('prop-x');
    const yEl = document.getElementById('prop-y');
    const wEl = document.getElementById('prop-w');
    const hEl = document.getElementById('prop-h');
    if (xEl) { xEl.value = Math.round(el.x); xEl.onchange = function() { ceUpdateProp(el.id, 'x', parseInt(xEl.value)); }; }
    if (yEl) { yEl.value = Math.round(el.y); yEl.onchange = function() { ceUpdateProp(el.id, 'y', parseInt(yEl.value)); }; }
    if (wEl) { wEl.value = Math.round(el.width); wEl.onchange = function() { ceUpdateProp(el.id, 'width', parseInt(wEl.value)); }; }
    if (hEl) { hEl.value = Math.round(el.height || 0); hEl.onchange = function() { ceUpdateProp(el.id, 'height', parseInt(hEl.value)); }; }
  }
}

// ── WIRE COLOR CONTROLS ───────────────────────────
function setTextColor(color) {
  if (CE.selected) {
    const el = CE.elements.find(e => e.id === CE.selected);
    if (el && el.type === 'text') {
      ceUpdateProp(el.id, 'fill', color);
    }
  }
  const preview = document.getElementById('text-color-preview');
  const hex = document.getElementById('text-color-hex');
  if (preview) preview.style.background = color;
  if (hex) hex.textContent = color;
}

function setBgColor(color) {
  const container = document.getElementById('polotno-container');
  if (container) container.style.background = color;
  const preview = document.getElementById('bg-color-preview');
  const hex = document.getElementById('bg-color-hex');
  const input = document.getElementById('bg-color-input');
  if (preview) preview.style.background = color;
  if (hex) hex.textContent = color;
  if (input) input.value = color;
}

// ── ADD ELEMENT HELPERS (for toolbar buttons) ─────
function addText() {
  ceAddElement({
    type: 'text', text: 'Click to edit', x: 100, y: 200,
    width: 300, fontSize: 24, fontWeight: 'normal',
    fontFamily: 'Inter', fill: '#0a0a0a',
  });
  showToast('Text added');
}

function addElement(type) {
  if (type === 'rect') {
    ceAddElement({ type:'rect', x:100, y:200, width:200, height:100, fill:'#ff5a1f', cornerRadius:8 });
  } else if (type === 'ellipse') {
    ceAddElement({ type:'rect', x:100, y:200, width:150, height:150, fill:'#ff5a1f', cornerRadius:75 });
  } else if (type === 'text') {
    addText();
  }
}

function addQR(url) {
  const qrUrl = url || (S.qrCodes.length > 0 ? S.qrCodes[0].redirectUrl : 'https://qraivy.com');
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrUrl);
  ceAddElement({ type:'image', src:qrSrc, x:100, y:200, width:200, height:200, name:'QR Code' });
  showToast('QR code added');
}
