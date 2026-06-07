const fs = require('fs');
let f = fs.readFileSync('frontend/public/smart-qr-detail.html', 'utf8');
f = f.replace('    }).catch(function(){});\n}', '    }).catch(function(){});\n  }).catch(function(e){ console.error(\'[Loyalty] load error:\', e); });\n}');
fs.writeFileSync('frontend/public/smart-qr-detail.html', f);
console.log('Done:', f.includes('}).catch(function(e){ console.error'));
