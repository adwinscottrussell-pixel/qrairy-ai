const fs = require('fs');
// Write the full correct editor
const b64 =  + data + ;
const html = Buffer.from(b64, 'base64').toString('utf8');
fs.writeFileSync('frontend/public/editor.html', html, 'utf8');
console.log('Written', fs.statSync('frontend/public/editor.html').size, 'bytes');

// Now patch: add event delegation for generate button
let c = fs.readFileSync('frontend/public/editor.html', 'utf8');
const target = 'function triggerAIGenerate() {';
const patch = 'document.addEventListener("click",function(e){if(e.target&&e.target.id==="_aiGenerateBtn")triggerAIGenerate();});
' + target;
c = c.replace(target, patch);
fs.writeFileSync('frontend/public/editor.html', c, 'utf8');
const lines = c.split('
');
const idx = lines.findIndex(l => l.includes('triggerAIGenerate'));
console.log('Patched line', idx+1, ':', lines[idx].substring(0,80));
console.log('showAIModal present:', c.includes('showAIModal'));
