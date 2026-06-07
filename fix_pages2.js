const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');
const old = "var pages = data && data.qrPages ? data.qrPages : (Array.isArray(data) ? data : []);";
const neo = "var allItems = Array.isArray(data) ? data : (data && data.qrPages ? data.qrPages : []); var pages = allItems.filter(function(p){ return !!p.slug; });";
if (f.includes(old)) { f = f.replace(old, neo); console.log('Fixed'); } else { console.log('NOT FOUND'); }
fs.writeFileSync('frontend/public/dashboard.html', f);
