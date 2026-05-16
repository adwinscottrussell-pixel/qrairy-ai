const fs = require('fs'), path = require('path');
const root = __dirname;

// Remove designRoutes from index.js
const idxPath = path.join(root, 'backend/src/index.js');
let idx = fs.readFileSync(idxPath, 'utf8');
idx = idx.replace(/const designRoutes = require\('\.\/routes\/designRoutes'\);\n?/g, '');
idx = idx.replace(/app\.use\('\/design',\s*designRoutes\);\n?/g, '');
fs.writeFileSync(idxPath, idx, 'utf8');
console.log('index.js: designRoutes removed =', !idx.includes('designRoutes'));

// Remove designer.html from frontend/public (rename to _removed)
const dFile = path.join(root, 'frontend/public/designer.html');
if (fs.existsSync(dFile)) {
  fs.unlinkSync(dFile);
  console.log('designer.html: deleted');
} else {
  console.log('designer.html: already gone');
}