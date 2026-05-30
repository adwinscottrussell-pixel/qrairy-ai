const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
// Remove the extra </div> that prematurely closes sqd-tab-content after the info panel
const OLD='      </div>\n      </div>\n\n      <!-- APPEARANCE -->';
const NEW='      </div>\n\n      <!-- APPEARANCE -->';
if(fe.includes(OLD)){fe=fe.replace(OLD,NEW);console.log('done: extra </div> removed');}
else console.log('FAIL. Context:'+JSON.stringify(fe.slice(fe.indexOf('<!-- APPEARANCE -->'),fe.indexOf('<!-- APPEARANCE -->')+50)));
fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
