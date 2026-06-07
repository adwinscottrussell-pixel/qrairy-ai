const fs = require('fs');
let f = fs.readFileSync('frontend/public/smart-qr-detail.html', 'utf8');
const old = `if (d.stampUrl) {
      _loyaltyStampUrl = d.stampUrl;
      var urlEl = document.getElementById('loyalty-stamp-url');
      if (urlEl) urlEl.textContent = d.stampUrl;
      var qrContainer = document.getElementById('loyalty-qr-container');
      if (qrContainer) qrContainer.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(d.stampUrl) + '" style="width:80px;height:80px;border-radius:6px;">';
    }`;
const newCode = `fetch('https://api.qraivy.com/lp/nfc-token/' + slug, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} }).then(function(r){ return r.json(); }).then(function(nd) {
      if (nd.nfcUrl) {
        _loyaltyStampUrl = nd.nfcUrl;
        var urlEl = document.getElementById('loyalty-stamp-url');
        if (urlEl) urlEl.textContent = nd.nfcUrl;
        var qrContainer = document.getElementById('loyalty-qr-container');
        if (qrContainer) qrContainer.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(nd.nfcUrl) + '" style="width:80px;height:80px;border-radius:6px;">';
      }
    }).catch(function(){});`;
if (f.includes(old)) { f = f.replace(old, newCode); console.log('Replaced OK'); } else { console.log('NOT FOUND - checking snippet...'); console.log(f.includes('d.stampUrl')); }
fs.writeFileSync('frontend/public/smart-qr-detail.html', f);
