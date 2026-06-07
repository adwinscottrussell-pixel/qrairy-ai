const fs = require('fs');
let f = fs.readFileSync('frontend/public/dashboard.html', 'utf8');

// 1. Add sb-loyalty to the nav click handler array
f = f.replace(
  "['sb-campaigns','sb-subscribers','sb-wallet','sb-settings'].forEach(function(id){",
  "['sb-campaigns','sb-subscribers','sb-wallet','sb-settings'].forEach(function(id){"
);

// 2. Add loyalty nav handler before the forEach
const navInsert = `
  var sbLoyalty = document.getElementById('sb-loyalty');
  if (sbLoyalty) sbLoyalty.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.dash-section').forEach(function(s){ s.style.display='none'; });
    var lp = document.getElementById('section-loyalty');
    if (lp) { lp.style.display='block'; loadLoyaltyDashboard(); }
    document.querySelectorAll('.sb-item').forEach(function(i){ i.classList.remove('active'); });
    sbLoyalty.classList.add('active');
  });
`;

f = f.replace(
  "  var btnCreate=document.getElementById('btn-create-sqr');",
  navInsert + "  var btnCreate=document.getElementById('btn-create-sqr');"
);

// 3. Add loyalty panel + JS before </body>
const loyaltyPanel = `
<div id="section-loyalty" class="dash-section" style="display:none;padding:24px;">
  <div style="font-size:1.2rem;font-weight:800;color:#f0f4f8;margin-bottom:4px;">🎟 Loyalty Program</div>
  <div style="font-size:.75rem;color:rgba(240,244,248,0.5);margin-bottom:20px;">Anonymous stamp tracking — GDPR compliant</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
    <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(240,244,248,0.4);margin-bottom:6px;">Active Passes</div>
      <div id="ly-active-passes" style="font-size:1.6rem;font-weight:800;color:#ff5a1f;">—</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(240,244,248,0.4);margin-bottom:6px;">Stamps Today</div>
      <div id="ly-stamps-today" style="font-size:1.6rem;font-weight:800;color:#f0f4f8;">—</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(240,244,248,0.4);margin-bottom:6px;">Total Stamps</div>
      <div id="ly-stamps-total" style="font-size:1.6rem;font-weight:800;color:#f0f4f8;">—</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(240,244,248,0.4);margin-bottom:6px;">Rewards Redeemed</div>
      <div id="ly-redeemed" style="font-size:1.6rem;font-weight:800;color:#22c55e;">—</div>
    </div>
  </div>
  <div id="ly-pages-list" style="display:grid;gap:12px;"></div>
</div>

<script>
function loadLoyaltyDashboard() {
  var token = localStorage.getItem('sqd_token');
  var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  // Load all QR pages then fetch loyalty data for each
  fetch('https://api.qraivy.com/qr', { headers: headers })
    .then(function(r){ return r.json(); })
    .then(function(pages) {
      if (!pages || !pages.length) {
        document.getElementById('ly-pages-list').innerHTML = '<div style="color:rgba(240,244,248,0.4);font-size:.85rem;text-align:center;padding:40px;">No Smart QR pages found. Create one first.</div>';
        return;
      }
      var totalPasses = 0, totalToday = 0, totalStamps = 0, totalRedeemed = 0;
      var pending = pages.length;
      var cards = {};
      pages.forEach(function(page) {
        fetch('https://api.qraivy.com/lp/stamp/settings/' + page.slug, { headers: headers })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            totalPasses += d.activePasses || 0;
            totalToday += d.stampsToday || 0;
            totalStamps += d.totalStamps || 0;
            totalRedeemed += d.totalRedeemed || 0;
            cards[page.slug] = { page: page, d: d };
            pending--;
            if (pending === 0) renderLoyaltyDashboard(cards, totalPasses, totalToday, totalStamps, totalRedeemed, headers);
          }).catch(function(){ pending--; if(pending===0) renderLoyaltyDashboard(cards, totalPasses, totalToday, totalStamps, totalRedeemed, headers); });
      });
    }).catch(function(e){ console.error('Loyalty dashboard error:', e); });
}

function renderLoyaltyDashboard(cards, totalPasses, totalToday, totalStamps, totalRedeemed, headers) {
  document.getElementById('ly-active-passes').textContent = totalPasses || 0;
  document.getElementById('ly-stamps-today').textContent = totalToday || 0;
  document.getElementById('ly-stamps-total').textContent = totalStamps || 0;
  document.getElementById('ly-redeemed').textContent = totalRedeemed || 0;
  var list = document.getElementById('ly-pages-list');
  list.innerHTML = '';
  Object.values(cards).forEach(function(item) {
    var page = item.page, d = item.d;
    var goal = (d.settings && d.settings.goal) || 10;
    var rewardName = (d.settings && d.settings.rewardName) || 'Free item';
    var current = d.stampCount || 0;
    var rewardReady = d.rewardReady;
    var card = document.createElement('div');
    card.style.cssText = 'background:rgba(255,255,255,0.03);border:0.5px solid ' + (rewardReady ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)') + ';border-radius:12px;padding:16px;';
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div>' +
          '<div style="font-size:.9rem;font-weight:700;color:#f0f4f8;">' + (page.businessName || page.slug) + '</div>' +
          '<div style="font-size:.65rem;color:rgba(240,244,248,0.4);">' + rewardName + ' after ' + goal + ' stamps</div>' +
        '</div>' +
        (rewardReady ? '<span style="background:rgba(34,197,94,0.15);color:#22c55e;border:0.5px solid rgba(34,197,94,0.3);border-radius:20px;padding:3px 10px;font-size:.65rem;font-weight:700;">🎁 Reward ready</span>' : '<span style="color:rgba(240,244,248,0.4);font-size:.7rem;">' + current + ' / ' + goal + ' stamps</span>') +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<div id="ly-qr-' + page.slug + '" style="width:64px;height:64px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.5rem;">⬛</div>' +
        '<div style="flex:1;">' +
          '<div id="ly-url-' + page.slug + '" style="font-size:.55rem;color:rgba(240,244,248,0.5);font-family:monospace;word-break:break-all;margin-bottom:6px;">Loading NFC URL...</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button onclick="window.copyLoyaltyUrl(\'' + page.slug + '\')" style="flex:1;padding:6px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;color:#f0f4f8;font-size:.62rem;cursor:pointer;">Copy NFC URL</button>' +
            (rewardReady ? '<button onclick="window.redeemLoyaltyDash(\'' + page.slug + '\')" style="flex:1;padding:6px;background:#22c55e;border:none;border-radius:6px;color:#fff;font-size:.62rem;font-weight:700;cursor:pointer;">Redeem reward</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    list.appendChild(card);
    // Fetch NFC URL
    fetch('https://api.qraivy.com/lp/nfc-token/' + page.slug, { headers: headers })
      .then(function(r){ return r.json(); })
      .then(function(nd) {
        if (nd.nfcUrl) {
          var urlEl = document.getElementById('ly-url-' + page.slug);
          if (urlEl) urlEl.textContent = nd.nfcUrl;
          var qrEl = document.getElementById('ly-qr-' + page.slug);
          if (qrEl) qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=' + encodeURIComponent(nd.nfcUrl) + '" style="width:64px;height:64px;border-radius:6px;">';
          window['_lyUrl_' + page.slug] = nd.nfcUrl;
        }
      }).catch(function(){});
  });
}

window.copyLoyaltyUrl = function(slug) {
  var url = window['_lyUrl_' + slug];
  if (url) navigator.clipboard.writeText(url).then(function(){ alert('NFC URL copied!'); });
};

window.redeemLoyaltyDash = function(slug) {
  if (!confirm('Mark reward as redeemed and reset stamps to 0?')) return;
  var token = localStorage.getItem('sqd_token');
  fetch('https://api.qraivy.com/lp/stamp/redeem/' + slug, {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.ok) { alert('Reward redeemed!'); loadLoyaltyDashboard(); }
  }).catch(function(e){ alert('Error: ' + e.message); });
};
</script>
`;

f = f.replace('</body>', loyaltyPanel + '</body>');
fs.writeFileSync('frontend/public/dashboard.html', f);
console.log('Done');
