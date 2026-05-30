const fs=require('fs');
let lp=fs.readFileSync('backend/src/controllers/lpController.js','utf8').replace(/\r\n/g,'\n');
// Find and fix the broken hours regex (literal newline inside regex literal)
const idx=lp.indexOf('si.hours.replace(');
if(idx>-1){
  const end=lp.indexOf(",'<br>')",idx)+",'<br>')".length;
  lp=lp.slice(0,idx)+"si.hours.split('\\n').join('<br>')"+lp.slice(end);
  console.log('fixed hours regex');
  console.log('context:',JSON.stringify(lp.slice(idx-10,idx+50)));
}else console.log('FAIL: si.hours.replace not found');
fs.writeFileSync('backend/src/controllers/lpController.js',lp,'utf8');
