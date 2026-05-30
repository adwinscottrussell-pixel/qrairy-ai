const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
const OLD='          // Scroll phone to section\n          var pf = document.querySelector(\'.sqd-phone-frame\');';
const NEW='          // Reset editor tab scroll to top on every tab switch\n          var tc=document.getElementById(\'sqd-tab-content\'); if(tc) tc.scrollTop=0;\n          // Scroll phone to section\n          var pf = document.querySelector(\'.sqd-phone-frame\');';
if(fe.includes(OLD)){fe=fe.replace(OLD,NEW);console.log('done: tab content scroll reset added');}
else console.log('FAIL: '+JSON.stringify(fe.slice(fe.indexOf('Scroll phone'),fe.indexOf('Scroll phone')+80)));
fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
