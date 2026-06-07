const fs = require('fs');
const f = fs.readFileSync('backend/src/services/passService.js', 'utf8');
const m = f.match(/storeCard[\s\S]{0,20}/);
console.log(JSON.stringify(m ? m[0] : 'NOT FOUND'));
console.log('Has storeCard:', f.includes('storeCard'));
console.log('CRLF:', f.includes('\r\n'));
