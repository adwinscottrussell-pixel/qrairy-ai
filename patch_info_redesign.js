const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
let lp=fs.readFileSync('backend/src/controllers/lpController.js','utf8').replace(/\r\n/g,'\n');
const feNew=fs.readFileSync('info_fe_new.txt','utf8').trimEnd();
const lpNew=fs.readFileSync('info_lp_new.txt','utf8').trimEnd();

// 1. Replace info IIFE in buildDraftHTML (line-based)
const feLines=fe.split('\n');
const fsi=feLines.findIndex(l=>l.includes('info: (function(){'));
let fei=-1;
for(let i=fsi+1;i<feLines.length;i++){if(feLines[i].trim()==='})(),'){fei=i;break;}}
if(fsi>-1&&fei>-1){feLines.splice(fsi,fei-fsi+1,...feNew.split('\n'));fe=feLines.join('\n');console.log('1. FE info IIFE: done (lines '+fsi+'-'+fei+')');}
else console.log('1. FAIL fsi='+fsi+' fei='+fei);

// 2. Update LP CSS - replace old lp-info-* base CSS block
const oldCssStart='.lp-info-section{margin-bottom:16px}';
const oldCssEnd='.lp-info-link{font-size:.82rem;text-decoration:none}';
const cs=lp.indexOf(oldCssStart), ce=lp.indexOf(oldCssEnd);
if(cs>-1&&ce>-1){
  const newCss='.lp-info-section{margin:0 0 20px}\n.lp-info-card{padding:20px;margin:0 16px}\n.lp-info-hdr{margin-bottom:16px}\n.lp-info-hdr-title{font-family:\'Syne\',sans-serif;font-size:1.05rem;font-weight:800;color:#f0ece0;margin-bottom:4px;letter-spacing:-.01em}\n.lp-info-hdr-sub{font-size:.7rem;color:rgba(240,236,224,0.5)}\n.lp-info-rows{display:flex;flex-direction:column;gap:9px}\n.lp-info-row{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 14px}\n.lp-info-icw{width:32px;height:32px;border-radius:10px;background:rgba(255,90,31,0.1);border:0.5px solid rgba(255,90,31,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}\n.lp-info-icw svg{width:14px;height:14px;display:block}\n.lp-info-body{min-width:0;flex:1}\n.lp-info-label{font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:rgba(240,236,224,0.45);margin-bottom:2px}\n.lp-info-val{font-size:.82rem;font-weight:500;line-height:1.3;word-break:break-all}\n.lp-info-text{color:#f0ece0}\n.lp-info-link{color:#f0ece0;text-decoration:none}';
  lp=lp.slice(0,cs)+newCss+lp.slice(ce+oldCssEnd.length);
  console.log('2. LP base CSS: done');
}else console.log('2. FAIL css cs='+cs+' ce='+ce);

// 3. Update LP light theme CSS for info
const oldLightStart='body.theme-light .lp-info-card{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 10px 30px rgba(0,0,0,.04)}';
const oldLightEnd='body.theme-light .lp-info-link{color:#111111}';
const ls=lp.indexOf(oldLightStart), le=lp.indexOf(oldLightEnd);
if(ls>-1&&le>-1){
  const newLight='body.theme-light .lp-info-row{background:#FFFFFF;border:1px solid #E8E3DC}\nbody.theme-light .lp-info-hdr-title{color:#111111}\nbody.theme-light .lp-info-hdr-sub{color:rgba(26,18,9,0.45)}\nbody.theme-light .lp-info-label{color:rgba(26,18,9,0.45)}\nbody.theme-light .lp-info-text{color:#111111}\nbody.theme-light .lp-info-link{color:#111111}';
  lp=lp.slice(0,ls)+newLight+lp.slice(le+oldLightEnd.length);
  console.log('3. LP light CSS: done');
}else console.log('3. FAIL light css ls='+ls+' le='+le);

// 4. Replace old infoHTML building block (line-based)
const lpLines=lp.split('\n');
const lsi=lpLines.findIndex(l=>l.includes('const si=storedSections.info||{}'));
let lei=-1;
for(let i=lsi+1;i<lpLines.length;i++){if(lpLines[i].includes('const infoHTML=_ir.length===0')){lei=i;break;}}
if(lsi>-1&&lei>-1){lpLines.splice(lsi,lei-lsi+1,...lpNew.split('\n'));lp=lpLines.join('\n');console.log('4. LP infoHTML block: done (lines '+lsi+'-'+lei+')');}
else console.log('4. FAIL lsi='+lsi+' lei='+lei);

fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
fs.writeFileSync('backend/src/controllers/lpController.js',lp,'utf8');
console.log('FE icons:'+fe.includes('Visit &amp; Contact'+ ' '+'Contact'||fe.includes('Visit & Contact'))+' lp-info-hdr:'+lp.includes('lp-info-hdr'));
