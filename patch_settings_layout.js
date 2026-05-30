const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');

// 1. Add padding:0 4px to settings panel (matches Order/other tabs horizontal alignment)
const OLD1='<div class="sqd-tab-panel" data-panel="settings" style="display:none;">';
const NEW1='<div class="sqd-tab-panel" data-panel="settings" style="display:none;padding:0 4px;">';
if(fe.includes(OLD1)){fe=fe.replace(OLD1,NEW1);console.log('1. panel padding: done');}else console.log('1. FAIL');

// 2. Tighten subtitle margin-bottom (14px -> 10px) to pull cards up
const OLD2='color:rgba(240,244,248,0.65);margin-bottom:14px;">Control how your page behaves.';
const NEW2='color:rgba(240,244,248,0.65);margin-bottom:10px;">Control how your page behaves.';
if(fe.includes(OLD2)){fe=fe.replace(OLD2,NEW2);console.log('2. subtitle margin: done');}else console.log('2. FAIL');

// 3. Tighten the info block bottom margin (14px -> 8px) to move cards higher
const OLD3='border-radius:9px;padding:10px;margin-bottom:14px;">';
const NEW3='border-radius:9px;padding:10px;margin-bottom:8px;">';
if(fe.includes(OLD3)){fe=fe.replace(OLD3,NEW3);console.log('3. url block margin: done');}else console.log('3. FAIL');

fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
