const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
let lp=fs.readFileSync('backend/src/controllers/lpController.js','utf8').replace(/\r\n/g,'\n');
const feNew=fs.readFileSync('feat_fe_new.txt','utf8').trimEnd();

// 1. FE buildDraftHTML: replace featured section (line-based)
const feLines=fe.split('\n');
const fsi=feLines.findIndex(l=>l.includes("featured: Array.isArray(featCards)"));
let fei=-1;
for(let i=fsi+1;i<feLines.length;i++){if(feLines[i].includes("'</div></div>' : ','") || feLines[i].trim()==="'</div></div>' : '',"){fei=i;break;}}
if(fsi>-1&&fei>-1){feLines.splice(fsi,fei-fsi+1,...feNew.split('\n'));fe=feLines.join('\n');console.log('1. FE featured: done '+fsi+'-'+fei);}
else console.log('1. FAIL fsi='+fsi+' fei='+fei);
fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');

// 2. LP: Replace display:none with full dark theme CSS block
const OLD_NONE='.lp-featured-section{display:none}';
const NEW_DARK='.lp-featured-section{padding:0 0 28px}\n.lp-featured-header{text-align:center;padding:8px 20px 20px}\n.lp-featured-title{font-family:\'Syne\',sans-serif;font-size:1.2rem;font-weight:800;color:#f0ece0;margin-bottom:6px;letter-spacing:-.02em;line-height:1.2;text-transform:none}\n.lp-featured-subtitle{font-size:.74rem;color:rgba(240,236,224,0.5);margin-top:3px}\n.lp-featured-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 16px}\n.lp-featured-card{background:rgba(255,255,255,.03);border:0.5px solid rgba(255,255,255,.07);border-radius:20px;padding:20px 12px 18px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25)}\n.lp-featured-icon{font-size:1.8rem;margin-bottom:10px;display:block}\n.lp-featured-card-title{font-family:\'Syne\',sans-serif;font-size:.78rem;font-weight:800;color:#f0ece0;margin-bottom:6px;line-height:1.3}\n.lp-featured-card-desc{font-size:.67rem;color:rgba(240,236,224,0.52);line-height:1.55}';
if(lp.includes(OLD_NONE)){lp=lp.replace(OLD_NONE,NEW_DARK);console.log('2. LP dark CSS: done');}
else console.log('2. FAIL dark none');

// 3. LP: Replace ALL body.theme-light .lp-featured-* lines with new light theme CSS
const lpLines=lp.split('\n');
const newLT=[
  'body.theme-light .lp-featured-section{padding:0 0 28px}',
  'body.theme-light .lp-featured-header{padding:8px 20px 20px;text-align:center}',
  'body.theme-light .lp-featured-title{color:#111111;font-size:1.2rem;font-weight:800;letter-spacing:-.02em;line-height:1.2;text-transform:none;margin-bottom:6px}',
  'body.theme-light .lp-featured-subtitle{color:rgba(26,18,9,0.45);font-size:.74rem}',
  'body.theme-light .lp-featured-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 16px}',
  'body.theme-light .lp-featured-card{background:#FFFFFF;border:1px solid rgba(0,0,0,.06);border-radius:20px;padding:20px 12px 18px;box-shadow:0 14px 40px rgba(0,0,0,.08);text-align:center}',
  'body.theme-light .lp-featured-icon{font-size:1.8rem;display:block;margin-bottom:10px}',
  'body.theme-light .lp-featured-card-title{color:#111111;font-size:.78rem;font-weight:800;margin-bottom:6px;line-height:1.3}',
  'body.theme-light .lp-featured-card-desc{color:rgba(26,18,9,0.52);font-size:.67rem;line-height:1.55}'
];
let firstLT=-1,lastLT=-1;
for(let i=0;i<lpLines.length;i++){if(lpLines[i].startsWith('body.theme-light .lp-featured-')){if(firstLT===-1)firstLT=i;lastLT=i;}}
if(firstLT>-1){lpLines.splice(firstLT,lastLT-firstLT+1,...newLT);lp=lpLines.join('\n');console.log('3. LP light CSS: done replaced '+(lastLT-firstLT+1)+' lines');}
else console.log('3. FAIL light');

// 4. LP HTML: add subtitle after featured title h2
const OLD_H2="+(sfeat.title||'Why Choose Us')+'</h2>";
const NEW_H2="+(sfeat.title||'Why Choose Us')+'</h2><p class=\"lp-featured-subtitle\">Discover what makes us different.</p>";
if(lp.includes(OLD_H2)){lp=lp.replace(OLD_H2,NEW_H2);console.log('4. LP subtitle: done');}
else console.log('4. FAIL subtitle ctx:'+JSON.stringify(lp.slice(lp.indexOf('lp-featured-title'),lp.indexOf('lp-featured-title')+80)));

fs.writeFileSync('backend/src/controllers/lpController.js',lp,'utf8');
console.log('FE featured:'+fe.includes('Why Choose Us')+' LP dark:'+lp.includes('lp-featured-section{padding')+' LP sub:'+lp.includes('lp-featured-subtitle'));
