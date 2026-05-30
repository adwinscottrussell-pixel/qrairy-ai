const fs = require('fs');
let fe = fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
const newIIFE = fs.readFileSync('btn_iife.tmp','utf8');

// 1. Inject new IIFE right after existing renderButtonsFn assignment
const MARKER = 'window.renderButtonsFn = renderButtons;\n';
const mIdx = fe.indexOf(MARKER);
if (mIdx !== -1) {
  fe = fe.slice(0, mIdx + MARKER.length) + '\n' + newIIFE + '\n' + fe.slice(mIdx + MARKER.length);
  console.log('1. New buttons IIFE: injected');
} else console.log('1. FAILED marker not found');

// 2. Update BUTTONS_EDITOR.init to pull AI-generated buttons from pending.sections.buttons
const OLD_INIT = "    init: function(pending) {\n      var slug = pending.slug || 'demo';\n      var uc = (pending.useCase || 'other').toLowerCase().replace(/\\s/g,'_');\n\n      // Check draft\n      try {\n        var raw = localStorage.getItem('qraivy_editor_draft_' + slug);\n        if (raw) {\n          var draft = JSON.parse(raw);\n          if (draft.buttons && draft.buttons.length) {\n            // Ensure all buttons have IDs\n            draft.buttons.forEach(function(b,i){ if(!b.id) b.id='b'+i; });\n            window.QRAIVY_EDITOR_STATE.buttons = draft.buttons;\n            setTimeout(renderButtons, 100);\n            return;\n          }\n        }\n      } catch(e) {}\n\n      // Use defaults\n      var defaults = DEFAULT_BUTTONS[uc] || DEFAULT_BUTTONS['other'];\n      window.QRAIVY_EDITOR_STATE.buttons = JSON.parse(JSON.stringify(defaults));\n      setTimeout(renderButtons, 100);\n    }";
const NEW_INIT = "    init: function(pending) {\n      var slug = pending.slug || 'demo';\n      var uc = (pending.useCase || 'other').toLowerCase().replace(/\\s/g,'_');\n      function migrate(b,i){ return { id:b.id||('b'+i), icon:b.icon||'globe', title:b.title||b.label||'Button', label:b.title||b.label||'Button', url:b.url||'', enabled:b.enabled!==false&&b.active!==false, active:b.active!==false, style:b.style||'primary' }; }\n      // 1. Check localStorage\n      try {\n        var raw = localStorage.getItem('qraivy_editor_draft_' + slug);\n        if (raw) {\n          var draft = JSON.parse(raw);\n          if (draft.buttons && draft.buttons.length) {\n            window.QRAIVY_EDITOR_STATE.buttons = draft.buttons.map(migrate);\n            setTimeout(renderButtons, 100);\n            return;\n          }\n        }\n      } catch(e) {}\n      // 2. Use AI-generated buttons from pending\n      var pendingBtns = (pending.sections&&pending.sections.buttons&&pending.sections.buttons.length) ? pending.sections.buttons : (pending.buttons&&pending.buttons.length ? pending.buttons : null);\n      if (pendingBtns) {\n        window.QRAIVY_EDITOR_STATE.buttons = pendingBtns.map(migrate);\n        setTimeout(renderButtons, 100);\n        return;\n      }\n      // 3. Defaults\n      var defaults = DEFAULT_BUTTONS[uc] || DEFAULT_BUTTONS['other'];\n      window.QRAIVY_EDITOR_STATE.buttons = JSON.parse(JSON.stringify(defaults)).map(migrate);\n      setTimeout(renderButtons, 100);\n    }";
if (fe.includes(OLD_INIT)) { fe = fe.replace(OLD_INIT, NEW_INIT); console.log('2. BUTTONS_EDITOR.init: updated'); }
else { console.log('2. init FAILED - trying shorter match'); const i2 = fe.indexOf("init: function(pending) {"); console.log('init at:', i2, JSON.stringify(fe.slice(i2,i2+80))); }

// 3. Update buildDraftHTML button rendering to use icon + title + domain
// Find the buttons filter in buildDraftHTML
const OLD_BTN_FILTER = "return b.active!==false;";
if (fe.includes(OLD_BTN_FILTER)) {
  fe = fe.replace(OLD_BTN_FILTER, "return b.enabled!==false&&b.active!==false;");
  console.log('3a. btn filter: updated');
}
// Update button label rendering in buildDraftHTML
const OLD_BTN_LABEL = "b.label||'Learn More'";
const ctx1 = fe.indexOf(OLD_BTN_LABEL);
if (ctx1 !== -1) {
  // Check context - only update the one in buildDraftHTML (near lp-btn-label)
  const ctx = fe.slice(Math.max(0,ctx1-300), ctx1+100);
  if (ctx.includes('lp-btn') || ctx.includes('buildDraftHTML') || ctx.includes('getMode')) {
    fe = fe.replace(OLD_BTN_LABEL, "(window._ICON_MAP_BTN&&b.icon?window._ICON_MAP_BTN[b.icon]+' ':'')+(b.title||b.label||'Button')");
    console.log('3b. btn label: updated in buildDraftHTML');
  }
}

fs.writeFileSync('frontend/public/smart-qr-detail.html', fe, 'utf8');
console.log('Done.');
console.log('New IIFE injected:', fe.includes('_listening'));
console.log('data-toggle present:', fe.includes('data-toggle'));
console.log('migrate fn present:', fe.includes('function migrate'));
