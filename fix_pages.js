const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');
f = f.replace(
  "var pages = data && data.qrPages ? data.qrPages : (Array.isArray(data) ? data : []); if (!pages || !pages.length)",
  "var allItems = Array.isArray(data) ? data : (data && data.qrPages ? data.qrPages : []); var pages = allItems.filter(function(p){ return !!p.slug; }); if (!pages || !pages.length)"
);
fs.writeFileSync('frontend/public/dashboard.html', f);
console.log('Done:', f.includes("filter(function(p)"));
