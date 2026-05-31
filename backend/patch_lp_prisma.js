const fs=require('fs');
const path=require('path');
const p=path.join(__dirname,'src/controllers/lpController.js');
let f=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');

// Fix prisma import path in the new handler
const OLD="const { generateSmartQRPass } = require('../services/passService');\n\n    // Load the Smart QR page\n    const page = await prisma.smartQRPage.findUnique({ where: { slug } });";
const NEW="const { generateSmartQRPass } = require('../services/passService');\n    const _prisma = require('../prismaClient');\n\n    // Load the Smart QR page\n    const page = await _prisma.landingPage.findUnique({ where: { slug } });";
if(f.includes(OLD)){f=f.replace(OLD,NEW);console.log('done');}
else console.log('FAIL - searching for fragments...\n'+f.includes('smartQRPage')+' '+f.includes('prismaClient'));
fs.writeFileSync(p,f,'utf8');
