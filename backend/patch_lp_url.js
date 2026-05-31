const fs=require('fs');
const p=require('path').join(__dirname,'src/services/passService.js');
let f=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const OLD="WALLET_CONFIG.webServiceUrl.replace('/api','')";
const NEW="'https://qraivy.com'";
if(f.includes(OLD)){f=f.replace(OLD,NEW);console.log('done');}
else console.log('FAIL');
fs.writeFileSync(p,f,'utf8');
