const fs = require('fs');
const path = require('path');
const lpRoutesPath = path.join(__dirname, 'src/routes/lpRoutes.js');
let lr = fs.readFileSync(lpRoutesPath, 'utf8').replace(/\r\n/g,'\n');

// Add wallet route BEFORE /lp/:slug
const OLD = "// Serve live landing page (public — no auth)\nrouter.get('/lp/:slug', handleServeLP);";
const NEW = "// Apple Wallet pass download (must be before /lp/:slug)\nrouter.get('/lp/wallet/apple/:slug', handleGenerateAppleWalletPass);\n\n// Serve live landing page (public — no auth)\nrouter.get('/lp/:slug', handleServeLP);";
if(lr.includes(OLD)){lr=lr.replace(OLD,NEW);console.log('done: wallet route added');}
else console.log('FAIL: anchor not found\n'+lr.slice(0,400));
fs.writeFileSync(lpRoutesPath,lr,'utf8');
