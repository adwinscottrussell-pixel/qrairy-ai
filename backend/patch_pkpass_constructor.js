const fs=require('fs');
const p=require('path').join(__dirname,'src/services/passService.js');
let f=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');

const OLD=`  const pass = await PKPass.from({
    model: {
      'pass.json':  Buffer.from(JSON.stringify(passJson)),
      'icon.png':   getDefaultIcon(),
      'icon@2x.png':getDefaultIcon(),
    },
    certificates: {
      wwdr,
      signerCert: certPem,
      signerKey:  keyPem,
    }
  });

  return pass.getAsBuffer();`;

const NEW=`  const pass = new PKPass(
    {
      'pass.json':  Buffer.from(JSON.stringify(passJson)),
      'icon.png':   getDefaultIcon(),
      'icon@2x.png':getDefaultIcon(),
    },
    {
      wwdr,
      signerCert: certPem,
      signerKey:  keyPem,
    }
  );

  return pass.getAsBuffer();`;

if(f.includes(OLD)){f=f.replace(OLD,NEW);console.log('done');}
else console.log('FAIL');
fs.writeFileSync(p,f,'utf8');
