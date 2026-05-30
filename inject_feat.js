const fs = require('fs');
let fe = fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
let lp = fs.readFileSync('backend/src/controllers/lpController.js','utf8').replace(/\r\n/g,'\n');
const featIIFE = fs.readFileSync('feat_iife.tmp','utf8');
const featDraft = fs.readFileSync('feat_draft_code.txt','utf8');

// 1. Replace Featured tab placeholder HTML
const OLD_TAB = `      <div class="sqd-tab-panel" data-panel="featured" style="display:none;">
        <div style="font-size:.82rem;font-weight:700;color:#f0f4f8;margin-bottom:4px;">⭐ Featured Section</div>
        <div style="font-size:.65rem;color:rgba(240,244,248,0.76);margin-bottom:16px;">Products, events, offers</div>
        <div style="background:rgba(255,255,255,0.03);border:0.5px dashed rgba(255,255,255,0.1);border-radius:9px;padding:24px;text-align:center;">
          <div style="font-size:1.4rem;margin-bottom:8px;">⭐</div>
          <div style="font-size:.75rem;color:rgba(240,244,248,0.82);font-family:'Inter',sans-serif;margin-bottom:4px;">Featured cards editing</div>
          <div style="font-size:.65rem;color:rgba(240,244,248,0.65);">Coming in next step</div>
        </div>
      </div>`;
const NEW_TAB = `      <div class="sqd-tab-panel" data-panel="featured" style="display:none;">
        <div style="font-weight:700;color:#f0f4f8;margin-bottom:4px;font-size:.82rem;">⭐ Featured Section</div>
        <div style="font-size:.65rem;color:rgba(240,244,248,0.65);margin-bottom:14px;">Manage the feature cards shown on your page.</div>
        <div id="feat-list" style="display:flex;flex-direction:column;gap:8px;"></div>
        <button id="feat-add" style="width:100%;margin-top:10px;padding:10px;background:transparent;border:0.5px dashed rgba(255,90,31,0.4);border-radius:8px;color:rgba(255,90,31,0.9);font-size:.75rem;cursor:pointer;font-weight:600;transition:all .15s;">+ Add Feature</button>
        <div id="feat-save-status" style="margin-top:8px;font-size:.62rem;color:rgba(240,244,248,0.45);text-align:center;">No changes</div>
      </div>`;
if (fe.includes(OLD_TAB)) { fe = fe.replace(OLD_TAB, NEW_TAB); console.log('1. Featured tab HTML: done'); }
else console.log('1. FAILED - tab HTML not found');

// 2. Inject Featured IIFE after the buttons IIFE ends
const FI_MARKER = 'window._ICON_MAP_BTN = ICON_MAP;\n\n})();';
if (fe.includes(FI_MARKER)) {
  fe = fe.replace(FI_MARKER, FI_MARKER + '\n\n' + featIIFE);
  console.log('2. Featured IIFE: injected');
} else console.log('2. FAILED - _ICON_MAP_BTN marker not found');

// 3. Tab switch handler for 'featured'
const OLD_TH = "if (target === 'buttons') { setTimeout(function(){ if(window.renderButtonsFn) window.renderButtonsFn(); }, 50); }";
const NEW_TH = "if (target === 'buttons') { setTimeout(function(){ if(window.renderButtonsFn) window.renderButtonsFn(); }, 50); }\n          if (target === 'featured') { setTimeout(function(){ if(window.renderFeaturedFn) window.renderFeaturedFn(); }, 50); }";
if (fe.includes(OLD_TH)) { fe = fe.replace(OLD_TH, NEW_TH); console.log('3. Tab handler: done'); }
else console.log('3. FAILED - tab handler not found');

// 4a. Add featCards variable to buildDraftHTML
const OLD_FOOTER_VAR = 'var footer = sec.footer || {};';
const NEW_FOOTER_VAR = 'var footer = sec.footer || {};\n    var featCards = Array.isArray(sec.featured) ? sec.featured : [];';
if (fe.includes(OLD_FOOTER_VAR)) { fe = fe.replace(OLD_FOOTER_VAR, NEW_FOOTER_VAR); console.log('4a. featCards var: done'); }
else console.log('4a. FAILED - footer var not found');

// 4b. Insert featured section before 'loop:' in sectionsObj
const OLD_LOOP_SEC = "      loop: loop.enabled !== false ? `";
if (fe.includes(OLD_LOOP_SEC)) {
  fe = fe.replace(OLD_LOOP_SEC, featDraft + OLD_LOOP_SEC);
  console.log('4b. buildDraftHTML featured: done');
} else console.log('4b. FAILED - loop section not found');

// 4c. Inject featured between buttons and loop in section order rendering
const OLD_ORDER = "    return sectionOrder.map(function(k){ return sections[k] || ''; }).join('');";
const NEW_ORDER = "    var _ord = sectionOrder.map(function(k){ return sections[k] || ''; });\n    if (!sectionOrder.includes('featured')) { var _fbi=sectionOrder.indexOf('buttons'); _ord.splice(_fbi!==-1?_fbi+1:_ord.length-1,0,sections.featured||''); }\n    return _ord.join('');";
if (fe.includes(OLD_ORDER)) { fe = fe.replace(OLD_ORDER, NEW_ORDER); console.log('4c. Section order: done'); }
else {
  // Try alternative pattern
  const alt = fe.indexOf("sectionOrder.map(function(k){");
  console.log('4c. FAILED. sectionOrder.map at:', alt, alt!==-1 ? JSON.stringify(fe.slice(alt,alt+80)) : 'not found');
}

fs.writeFileSync('frontend/public/smart-qr-detail.html', fe, 'utf8');

// 5. Update lpController.js featuredHTML to use sections.featured array
const sfeatStart = lp.indexOf('  const sfeat = storedSections.featured || {};');
const sfeatEnd = lp.indexOf("    '</div></section>';", sfeatStart);
if (sfeatStart !== -1 && sfeatEnd !== -1) {
  const endStr = "    '</div></section>';";
  const fullEnd = sfeatEnd + endStr.length;
  const newFeat =
    "  const sfeatArr = Array.isArray(storedSections.featured) ? storedSections.featured : null;\n" +
    "  const sfeat = sfeatArr ? {} : (storedSections.featured || {});\n" +
    "  const _dfc = [{icon:'&#x2728;',title:'AI Concierge',description:'Customers get instant answers.'},{icon:'&#x1F39F;',title:'Digital Wallet',description:'One-tap membership and rewards.'},{icon:'&#x1F514;',title:'Smart Updates',description:'Reconnect with every scan.'}];\n" +
    "  const _fc = sfeatArr ? sfeatArr.filter(f => f.enabled !== false) : _dfc;\n" +
    "  const featuredHTML = (!sfeatArr && sfeat.enabled === false) || _fc.length === 0 ? '' :\n" +
    "    '<section class=\"lp-featured-section\">'+\n" +
    "    '<div class=\"lp-featured-header\"><h2 class=\"lp-featured-title\">'+(sfeat.title||'Why Choose Us')+'</h2></div>'+\n" +
    "    '<div class=\"lp-featured-cards\">'+\n" +
    "    _fc.map(f => '<div class=\"lp-featured-card\"><div class=\"lp-featured-icon\">'+(f.icon||'&#x2728;')+'</div><div class=\"lp-featured-card-title\">'+(f.title||'')+'</div><div class=\"lp-featured-card-desc\">'+(f.description||'')+'</div></div>').join('')+\n" +
    "    '</div></section>';";
  lp = lp.slice(0, sfeatStart) + newFeat + lp.slice(fullEnd);
  console.log('5. lpController featuredHTML: done');
} else {
  console.log('5. FAILED sfeatStart:', sfeatStart, 'sfeatEnd:', sfeatEnd);
  const di = lp.indexOf('const sfeat');
  if (di !== -1) console.log('sfeat context:', JSON.stringify(lp.slice(di, di+100)));
}

fs.writeFileSync('backend/src/controllers/lpController.js', lp, 'utf8');
console.log('All done.');
console.log('feat-list in HTML:', fe.includes('id="feat-list"'));
console.log('renderFeaturedFn:', fe.includes('window.renderFeaturedFn'));
console.log('featCards in HTML:', fe.includes('var featCards'));
console.log('sfeatArr in LP:', lp.includes('sfeatArr'));
