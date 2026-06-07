const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');

const oldPanel = f.match(/<div id="section-loyalty"[\s\S]*?<\/script>\s*<\/body>/)?.[0];
if (!oldPanel) { console.log('Panel not found'); process.exit(1); }

const newPanel = `<div id="section-loyalty" class="dash-section" style="display:none;padding:24px;margin-left:var(--sidebar-width,240px);">
  <div style="font-size:1.2rem;font-weight:800;color:#f0f4f8;margin-bottom:4px;">🎟 Loyalty Program</div>
  <div style="font-size:.75rem;color:rgba(240,244,248,0.5);margin-bottom:20px;">Anonymous stamp tracking — GDPR compliant</div>
  <div id="ly-pages-list" style="display:grid;gap:16px;"></div>
</div>

<script>
function loadLoyaltyDashboard() {
  var token = localStorage.getItem('sqd_token');
  var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  var list = document.getElementById('ly-pages-list');
  list.innerHTML = '<div style="color:rgba(240,244,248,0.4);font-size:.85rem;padding:20px;">Loading...</div>';
  fetch('https://api.qraivy.com/dashboard', { headers: headers })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var pages = data && data.qrPages ? data.qrPages : (Array.isArray(data) ? data : []);
      if (!pages || !pages.length) {
        list.innerHTML = '<div style="color:rgba(240,244,248,0.4);font-size:.85rem;text-align:center;padding:40px;">No Smart QR pages found.</div>';
        return;
      }
      list.innerHTML = '';
      pages.forEach(function(page) {
        var slug = page.slug;
        var bizName = (page.businessName || slug).replace(/Welcome to /i,'').replace(/\s+[a-z0-9]{3}$/,'').trim();
        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px;';
        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">' +
            '<div>' +
              '<div style="font-size:1rem;font-weight:700;color:#f0f4f8;">' + bizName + '</div>' +
              '<div id="ly-sub-'+slug+'" style="font-size:.7rem;color:rgba(240,244,248,0.4);margin-top:2px;">Loading...</div>' +
            '</div>' +
            '<span id="ly-badge-'+slug+'"></span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">' +
            '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px;text-align:center;">' +
              '<div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.07em;color:rgba(240,244,248,0.4);margin-bottom:4px;">Current Stamps</div>' +
              '<div id="ly-current-'+slug+'" style="font-size:1.4rem;font-weight:800;color:#ff5a1f;">—</div>' +
            '</div>' +
            '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px;text-align:center;">' +
              '<div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.07em;color:rgba(240,244,248,0.4);margin-bottom:4px;">Total Stamps</div>' +
              '<div id="ly-total-'+slug+'" style="font-size:1.4rem;font-weight:800;color:#f0f4f8;">—</div>' +
            '</div>' +
            '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px;text-align:center;">' +
              '<div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.07em;color:rgba(240,244,248,0.4);margin-bottom:4px;">Goal</div>' +
              '<div id="ly-goal-'+slug+'" style="font-size:1.4rem;font-weight:800;color:#f0f4f8;">—</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;align-items:center;">' +
            '<div id="ly-qr-'+slug+'" style="width:72px;height:72px;background:rgba(255,255,255,0.06);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.8rem;">⬛</div>' +
            '<div style="flex:1;">' +
              '<div id="ly-url-'+slug+'" style="font-size:.55rem;color:rgba(240,244,248,0.4);font-family:monospace;word-break:break-all;margin-bottom:8px;">Loading NFC URL...</div>' +
              '<div style="display:flex;gap:8px;">' +
                '<button onclick="window.copyLoyaltyUrl(\''+slug+'\')" style="flex:1;padding:8px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;color:#f0f4f8;font-size:.7rem;cursor:pointer;">Copy NFC URL</button>' +
                '<button id="ly-redeem-'+slug+'" onclick="window.redeemLoyaltyDash(\''+slug+'\')" style="flex:1;padding:8px;background:rgba(34,197,94,0.15);border:0.5px solid rgba(34,197,94,0.3);border-radius:8px;color:#22c55e;font-size:.7rem;font-weight:700;cursor:pointer;display:none;">🎁 Redeem Reward</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        list.appendChild(card);

        // Fetch stamp settings for this page
        fetch('https://api.qraivy.com/lp/stamp/settings/' + slug, { headers: headers })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            var goal = (d.settings && d.settings.goal) || 10;
            var rewardName = (d.settings && d.settings.rewardName) || 'Free item';
            var current = d.stampCount || 0;
            var total = d.totalStamps || 0;
            document.getElementById('ly-current-'+slug).textContent = current;
            document.getElementById('ly-total-'+slug).textContent = total;
            document.getElementById('ly-goal-'+slug).textContent = goal;
            document.getElementById('ly-sub-'+slug).textContent = rewardName + ' after ' + goal + ' stamps';
            if (d.rewardReady) {
              document.getElementById('ly-badge-'+slug).innerHTML = '<span style="background:rgba(34,197,94,0.15);color:#22c55e;border:0.5px solid rgba(34,197,94,0.3);border-radius:20px;padding:4px 12px;font-size:.65rem;font-weight:700;">🎁 Reward ready!</span>';
              var rb = document.getElementById('ly-redeem-'+slug);
              if (rb) rb.style.display = 'block';
            }
          }).catch(function(){});

        // Fetch NFC URL
        fetch('https://api.qraivy.com/lp/nfc-token/' + slug, { headers: headers })
          .then(function(r){ return r.json(); })
          .then(function(nd) {
            if (nd.nfcUrl) {
              document.getElementById('ly-url-'+slug).textContent = nd.nfcUrl;
              document.getElementById('ly-qr-'+slug).innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=' + encodeURIComponent(nd.nfcUrl) + '" style="width:72px;height:72px;border-radius:8px;">';
              window['_lyUrl_'+slug] = nd.nfcUrl;
            }
          }).catch(function(){});
      });
    }).catch(function(e){ list.innerHTML = '<div style="color:rgba(240,244,248,0.4);padding:20px;">Error loading loyalty data.</div>'; });
}

window.copyLoyaltyUrl = function(slug) {
  var url = window['_lyUrl_'+slug];
  if (url) navigator.clipboard.writeText(url).then(function(){ alert('NFC URL copied!'); });
};

window.redeemLoyaltyDash = function(slug) {
  if (!confirm('Mark reward as redeemed and reset stamps to 0?')) return;
  var token = localStorage.getItem('sqd_token');
  fetch('https://api.qraivy.com/lp/stamp/redeem/' + slug, {
    method: 'POST', headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.ok) { alert('Reward redeemed!'); loadLoyaltyDashboard(); }
  }).catch(function(e){ alert('Error: ' + e.message); });
};
</script>
</body>`;

f = f.replace(oldPanel, newPanel);
fs.writeFileSync('frontend/public/dashboard.html', f);
console.log('Done - panel rebuilt');
