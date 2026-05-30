const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
const OLD='<div class="sqd-tab-panel" data-panel="appearance" style="display:none;">';
const NEW='<div class="sqd-tab-panel" data-panel="appearance" style="display:none;padding:0 8px;">';
if(fe.includes(OLD)){fe=fe.replace(OLD,NEW);console.log('done');}else console.log('FAIL');
fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
