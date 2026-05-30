const fs=require('fs');
let fe=fs.readFileSync('frontend/public/smart-qr-detail.html','utf8').replace(/\r\n/g,'\n');
const stTab=fs.readFileSync('settings_tab.txt','utf8').trimEnd();
const stIIFE=fs.readFileSync('settings_iife.tmp','utf8');

// 1. Replace settings tab (depth-tracked)
const lines=fe.split('\n');
const ssi=lines.findIndex(l=>l.includes('data-panel="settings"'));
let sei=-1,depth=0;
for(let i=ssi;i<lines.length;i++){
  depth+=(lines[i].match(/<div/g)||[]).length-(lines[i].match(/<\/div>/g)||[]).length;
  if(i>ssi&&depth<=0){sei=i;break;}
}
if(ssi>-1&&sei>-1){lines.splice(ssi,sei-ssi+1,...stTab.split('\n'));fe=lines.join('\n');console.log('1. settings tab: done lines '+ssi+'-'+sei);}
else console.log('1. FAIL ssi='+ssi+' sei='+sei);

// 2. Inject settings IIFE after info IIFE
const M2='window.ensureInfoSection = ensureInfo;\n})();';
if(fe.includes(M2)){fe=fe.replace(M2,M2+'\n\n'+stIIFE);console.log('2. settings IIFE: done');}
else console.log('2. FAIL iife marker');

// 3. STEP25 hydration for settings toggles (after footer-input-link hydrate)
const OLD3="      hydrate('footer-input-link',";
const HYDRATE_ST=
"      // Settings toggles hydration\n"+
"      (function(){\n"+
"        var ss=(S.sections.settings&&typeof S.sections.settings==='object')?S.sections.settings:{};\n"+
"        var _d={pageActive:true,voiceEnabled:true,aiEnabled:true,subscribersEnabled:true,walletEnabled:true,brandingEnabled:true,analyticsEnabled:true};\n"+
"        var _ids={pageActive:'settings-pageActive-toggle',voiceEnabled:'settings-voice-toggle',aiEnabled:'settings-ai-toggle',subscribersEnabled:'settings-subscribers-toggle',walletEnabled:'settings-wallet-toggle',brandingEnabled:'settings-branding-toggle',analyticsEnabled:'settings-analytics-toggle'};\n"+
"        Object.keys(_ids).forEach(function(f){\n"+
"          var btn=document.getElementById(_ids[f]); if(!btn) return;\n"+
"          var on=(ss[f]!==undefined?ss[f]:_d[f])!==false;\n"+
"          btn.textContent=on?'On':'Off';\n"+
"          btn.style.background=on?'rgba(255,90,31,0.12)':'rgba(255,255,255,0.04)';\n"+
"          btn.style.color=on?'#ff5a1f':'rgba(240,244,248,0.5)';\n"+
"          btn.style.border=on?'0.5px solid rgba(255,90,31,0.4)':'0.5px solid rgba(255,255,255,0.15)';\n"+
"        });\n"+
"      })();\n"+
"      hydrate('footer-input-link',";
if(fe.includes(OLD3)){fe=fe.replace(OLD3,HYDRATE_ST);console.log('3. STEP25 settings: done');}
else console.log('3. FAIL STEP25');

// 4. collectEditorStateFromInputs - ensure settings object
const OLD4="    S.sections.footer.businessName = val('footer-input-bizname');";
const NEW4="    if(!S.sections.settings||typeof S.sections.settings!=='object')S.sections.settings={pageActive:true,voiceEnabled:true,aiEnabled:true,subscribersEnabled:true,walletEnabled:true,brandingEnabled:true,analyticsEnabled:true};\n    S.sections.footer.businessName = val('footer-input-bizname');";
if(fe.includes(OLD4)){fe=fe.replace(OLD4,NEW4);console.log('4. collect: done');}
else console.log('4. FAIL collect');

fs.writeFileSync('frontend/public/smart-qr-detail.html',fe,'utf8');
console.log('tab:'+fe.includes('settings-pageActive-toggle')+' iife:'+fe.includes('ensureSettingsSection')+' hydrate:'+fe.includes('settings-voice-toggle')+' collect:'+fe.includes("S.sections.settings={page"));
