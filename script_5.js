
// Load Clerk token for authenticated actions
(async function() {
  try {
    if (window.Clerk) {
      await window.Clerk.load();
      if (window.Clerk.session) {
        window._clerkToken = await window.Clerk.session.getToken();
      }
    }
  } catch(e) { console.warn('[clerk] token load failed', e); }
})();

// ── QRAIVY MANAGE CONTROLLER ─────────────────────────────────────────────
(function() {
  var API_BASE = 'https://api.qraivy.com';

  function getSlug() {
    var p = new URLSearchParams(window.location.search);
    return p.get('slug') || '';
  }

  function getToken() {
    return window.Clerk ? window.Clerk.session && window.Clerk.session.lastActiveToken && window.Clerk.session.lastActiveToken.getRawString() : null;
  }

  function showManage() {
    var mp = document.getElementById('sqd-manage-panel');
    var ew = document.getElementById('sqd-editor-layout-wrap');
    var tb = document.getElementById('sqd-topbar-mode');
    if (mp) mp.style.display = 'block';
    if (ew) ew.style.display = 'none';
    if (tb) tb.textContent = 'Smart QR';
  }

  function showEditor() {
    var mp = document.getElementById('sqd-manage-panel');
    var ew = document.getElementById('sqd-editor-layout-wrap');
    var tb = document.getElementById('sqd-topbar-mode');
    if (mp) mp.style.display = 'none';
    if (ew) ew.style.display = '';
    if (tb) tb.textContent = 'Smart QR Editor';
  }

  function populateOverview() {
    var slug = getSlug();
    if (!slug) return;
    var lpUrl = 'https://api.qraivy.com/lp/' + slug;

    // Set view button immediately
    var lpUrl2 = 'https://api.qraivy.com/lp/' + slug;
    var vb = document.getElementById('sqd-ov-view-btn');
    if (vb) vb.href = lpUrl2;
    var tvb = document.getElementById('sqd-view-btn');
    if (tvb) tvb.href = lpUrl2;
    var vb2 = document.getElementById('sqd-view-btn2');
    if (vb2) vb2.href = lpUrl2;
    var ovvl = document.getElementById('ov-qr-view-live');
    if (ovvl) ovvl.href = lpUrl2;

    // Wait for Clerk then fetch dashboard to get correct QR id + stats
    var attempts = 0;
    var timer = setInterval(function() {
      attempts++;
      if (!window.Clerk || !window.Clerk.session) {
        if (attempts > 50) { clearInterval(timer); fallbackFromLP(slug, lpUrl); }
        return;
      }
      clearInterval(timer);
      window.Clerk.session.getToken().then(function(tok) {
        var headers = { 'Content-Type': 'application/json' };
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        fetch('https://api.qraivy.com/dashboard', { headers: headers })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var cards = data.dashboard || [];
            var card = cards.find(function(c) { return c.slug === slug; });
            if (!card) { fallbackFromLP(slug, lpUrl); return; }

            var nameEl  = document.getElementById('sqd-ov-name');
            var urlEl   = document.getElementById('sqd-ov-url');
            var scansEl = document.getElementById('sqd-ov-scans');
            var subsEl  = document.getElementById('sqd-ov-subs');
            var cvrEl   = document.getElementById('sqd-ov-cvr');

            var scans = card.totalScans || 0;
            var subs  = card.totalSubscribers || 0;
            var cvr   = scans > 0 ? ((subs/scans)*100).toFixed(1) : '0.0';

            if (nameEl)  nameEl.textContent  = card.businessName || slug;
            // Trigger QR render now that data is ready
            window._sqd_hostedUrl = 'https://api.qraivy.com/lp/' + slug;
            if (window.QRAIVY_QR_READY) window.QRAIVY_QR_READY(window._sqd_hostedUrl);
            if (urlEl)   urlEl.textContent   = 'qraivy.com/lp/' + slug;
            if (scansEl) scansEl.textContent = scans;
            if (subsEl)  subsEl.textContent  = subs;
            if (cvrEl)   cvrEl.textContent   = cvr + '%';

            // Store the REAL QR id from dashboard (not LP id)
            window._sqd_qrId = card.id;
             window._sqd_source = card.source || 'qr';
          })
          .catch(function() { fallbackFromLP(slug, lpUrl); });
      });
    }, 100);
  }

  function fallbackFromLP(slug, lpUrl) {
    fetch('https://api.qraivy.com/lp/' + slug)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var nameEl  = document.getElementById('sqd-ov-name');
        var urlEl   = document.getElementById('sqd-ov-url');
        var scansEl = document.getElementById('sqd-ov-scans');
        if (nameEl) nameEl.textContent = data.businessName || slug;
        if (urlEl)  urlEl.textContent  = 'qraivy.com/lp/' + slug;
        if (scansEl) scansEl.textContent = data.scanCount || 0;
      }).catch(function() {});
  }

  window.QRAIVY_MANAGE = {
    openEditor: function() {
      showEditor();
      // Init editor if not already done
      var editBtn = document.getElementById('sqd-edit-btn');
      if (editBtn && typeof initEditor === 'function') {
        initEditor();
      }
    },
    confirmDelete: function() {
      var name = (document.getElementById('sqd-ov-name') || {}).textContent || 'this QR';
      var qrId = window._sqd_qrId;
      var slug = getSlug();
      if (!slug) { console.warn('No slug'); return; }
      var panel = document.getElementById('sqd-manage-panel');
      var old = document.getElementById('sqd-del-box');
      if (old) { old.remove(); return; }
      var box = document.createElement('div');
      box.id = 'sqd-del-box';
      box.style.cssText = 'margin:16px 0;padding:16px;background:rgba(255,50,50,0.08);border:0.5px solid rgba(255,80,80,0.4);border-radius:10px;font-family:Inter,sans-serif;';
      box.innerHTML = '<div style="font-size:.75rem;color:#f0f4f8;margin-bottom:10px;">Delete <strong>' + name + '</strong>? This removes the QR code, all scan data and subscribers permanently.</div>'
        + '<div style="display:flex;gap:8px;">'
        + '<button id="sqd-del-yes" style="padding:7px 16px;background:#e53e3e;border:none;border-radius:7px;color:#fff;font-size:.72rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">Yes, Delete</button>'
        + '<button id="sqd-del-no" style="padding:7px 16px;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.15);border-radius:7px;color:#f0f4f8;font-size:.72rem;cursor:pointer;font-family:Inter,sans-serif;">Cancel</button>'
        + '</div>';
      panel.appendChild(box);
      document.getElementById('sqd-del-no').onclick = function() { box.remove(); };
      document.getElementById('sqd-del-yes').onclick = function() {
        box.remove();
        var btn = document.getElementById('sqd-ov-delete-btn');
        if (btn) { btn.textContent = 'Deleting…'; btn.disabled = true; }
        var headers = { 'Content-Type': 'application/json' };
        var doIt = function(h) {
          var deleteUrl = window._sqd_source === 'lp'
            ? 'https://api.qraivy.com/lp/' + getSlug()
            : 'https://api.qraivy.com/qr/' + qrId;
          fetch(deleteUrl, { method: 'DELETE', headers: h })
            .then(function(r) {
              if (r.ok) { window.location.href = 'dashboard.html'; }
              else { return r.json().then(function(d) { throw new Error(d.error || 'Delete failed'); }); }
            })
            .catch(function(e) {
              var errBox = document.createElement('div');
              errBox.style.cssText = 'margin:8px 0;padding:10px;background:rgba(255,50,50,0.1);border:0.5px solid rgba(255,80,80,0.4);border-radius:8px;color:#ff5050;font-size:.72rem;font-family:Inter,sans-serif;';
              errBox.textContent = 'Delete failed: ' + e.message;
              panel.appendChild(errBox);
              if (btn) { btn.textContent = '🗑 Delete QR'; btn.disabled = false; }
            });
        };
        if (window.Clerk && window.Clerk.session) {
          window.Clerk.session.getToken().then(function(tok) {
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
            doIt(headers);
          });
        } else if (window._clerkToken) {
          headers['Authorization'] = 'Bearer ' + window._clerkToken;
          doIt(headers);
        } else { doIt(headers); }
      };
    }
  };

  function doDelete(qrId, headers) {
    var btn = document.getElementById('sqd-ov-delete-btn');
    if (btn) { btn.textContent = 'Deleting…'; btn.disabled = true; }

    fetch(API_BASE + '/qr/' + qrId, { method: 'DELETE', headers: headers })
      .then(function(r) {
        if (r.ok) {
          alert('QR code deleted successfully.');
          window.location.href = 'dashboard.html';
        } else {
          return r.json().then(function(d) { throw new Error(d.error || 'Delete failed'); });
        }
      })
      .catch(function(e) {
        alert('Delete failed: ' + e.message);
        if (btn) { btn.textContent = '🗑 Delete QR'; btn.disabled = false; }
      });
  }

  // On load: decide manage vs editor mode
  document.addEventListener('DOMContentLoaded', function() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('manage') === 'true') {
      showManage();
      populateOverview();
    } else {
      showEditor();
    }
  });
})();


function loadPushDeviceCount() {
  var slug = window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.slug;
  if (!slug) return;
  var el = document.getElementById('push-device-count');
  if (el) el.textContent = 'Loading devices...';
  fetch('https://api.qraivy.com/lp/push/' + slug + '/count')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (el) el.textContent = d.count > 0
        ? '📱 ' + d.count + ' device(s) have added this pass to Apple Wallet'
        : 'No devices have added this pass yet.';
    }).catch(function(e){
      if (el) el.textContent = 'Could not load device count.';
    });
}
function loadPushHistory() {
  var slug = window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.slug;
  if (!slug) return;
  var el = document.getElementById('push-history');
  fetch('https://api.qraivy.com/lp/push/' + slug + '/history')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!el) return;
      if (!d.campaigns || !d.campaigns.length) { el.textContent = 'No campaigns sent yet.'; return; }
      el.innerHTML = d.campaigns.map(function(c){
        var date = new Date(c.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        return '<div style="padding:8px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:6px;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">' +
          '<span style="color:#f0f4f8;font-weight:600;">'+c.title+'</span>' +
          '<span style="color:rgba(240,244,248,0.4);">'+date+'</span></div>' +
          '<div style="color:rgba(240,244,248,0.6);">'+c.message+'</div>' +
          '<div style="color:#4ade80;margin-top:2px;">✅ Sent to '+c.sent+' device(s)</div>' +
          '</div>';
      }).join('');
    }).catch(function(){ if(el) el.textContent = 'Could not load history.'; });
}

function sendWalletPush() {
  var slug = window.QRAIVY_EDITOR_STATE && window.QRAIVY_EDITOR_STATE.slug;
  if (!slug) { alert('No page loaded'); return; }
  var title = (document.getElementById('push-title')||{}).value || '';
  var message = (document.getElementById('push-message')||{}).value || '';
  var linkUrl = (document.getElementById('push-link')||{}).value || '';
  var voiceMsg = (document.getElementById('push-voice')||{}).value || '';
  if (voiceMsg) {
    var baseUrl = linkUrl || 'https://api.qraivy.com/lp/' + slug;
    linkUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'push=1&voice=' + encodeURIComponent(voiceMsg);
  }
  if (!title.trim()) { alert('Please enter a notification title'); return; }
  if (!message.trim()) { alert('Please enter a message'); return; }
  var btn = document.getElementById('push-send-btn');
  var result = document.getElementById('push-result');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  result.style.display = 'none';
  fetch('https://api.qraivy.com/lp/push/' + slug, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, message: message, linkUrl: linkUrl }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      btn.disabled = false;
      btn.textContent = 'Send Push to All Pass Holders';
      result.style.display = 'block';
      if (d.ok) {
        result.style.color = '#4ade80';
        result.textContent = d.sent > 0 ? 'Push sent to ' + d.sent + ' device(s)!' : 'No devices have added this pass yet.';
        if (d.sent > 0) { document.getElementById('push-title').value=''; document.getElementById('push-message').value=''; document.getElementById('push-msg-count').textContent='0/90'; loadPushHistory(); }
      } else {
        result.style.color = '#f87171';
        result.textContent = 'Error: ' + (d.error || 'Unknown error');
      }
    })
    .catch(function(e){
      btn.disabled = false;
      btn.textContent = 'Send Push to All Pass Holders';
      result.style.display = 'block';
      result.style.color = '#f87171';
      result.textContent = 'Error: ' + e.message;
    });
}

// ── LOYALTY STAMP FUNCTIONS ──────────────────────────────────────────────────
var _loyaltyEnabled = false;
var _loyaltyStampUrl = '';

function loadLoyaltyTab() {
  var slug = window._sqd_slug || (window.location.search.match(/slug=([^&]+)/) || [])[1];
  if (!slug) return;
  var token = localStorage.getItem('sqd_token');
  fetch('https://api.qraivy.com/lp/stamp/settings/' + slug, {
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.settings) {
      _loyaltyEnabled = d.settings.enabled;
      document.getElementById('loyalty-goal').value = d.settings.goal || 10;
      document.getElementById('loyalty-reward-name').value = d.settings.rewardName || '';
      var btn = document.getElementById('loyalty-enable-toggle');
      if (btn) { btn.textContent = _loyaltyEnabled ? 'On' : 'Off'; btn.style.background = _loyaltyEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,90,31,0.12)'; btn.style.borderColor = _loyaltyEnabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,90,31,0.4)'; btn.style.color = _loyaltyEnabled ? '#22c55e' : '#ff5a1f'; }
    }
    var total = document.getElementById('loyalty-total-stamps');
    var current = document.getElementById('loyalty-current-stamps');
    var rewardStatus = document.getElementById('loyalty-reward-status');
    var redeemSection = document.getElementById('loyalty-redeem-section');
    if (total) total.textContent = d.totalStamps || 0;
    if (current) current.textContent = (d.stampCount || 0) + '/' + ((d.settings && d.settings.goal) || 10);
    if (rewardStatus) { rewardStatus.textContent = d.rewardReady ? 'Ready!' : 'Not yet'; rewardStatus.style.color = d.rewardReady ? '#22c55e' : 'rgba(240,244,248,0.4)'; }
    if (redeemSection) redeemSection.style.display = d.rewardReady ? 'block' : 'none';
    fetch('https://api.qraivy.com/lp/nfc-token/' + slug, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} }).then(function(r){ return r.json(); }).then(function(nd) {
      if (nd.nfcUrl) {
        _loyaltyStampUrl = nd.nfcUrl;
        var urlEl = document.getElementById('loyalty-stamp-url');
        if (urlEl) urlEl.textContent = nd.nfcUrl;
        var qrContainer = document.getElementById('loyalty-qr-container');
        if (qrContainer) qrContainer.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(nd.nfcUrl) + '" style="width:80px;height:80px;border-radius:6px;">';
      }
    }).catch(function(){});
}

window.toggleLoyalty = function() {
  _loyaltyEnabled = !_loyaltyEnabled;
  var btn = document.getElementById('loyalty-enable-toggle');
  if (btn) { btn.textContent = _loyaltyEnabled ? 'On' : 'Off'; btn.style.background = _loyaltyEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,90,31,0.12)'; btn.style.borderColor = _loyaltyEnabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,90,31,0.4)'; btn.style.color = _loyaltyEnabled ? '#22c55e' : '#ff5a1f'; }
};

window.saveLoyaltySettings = function() {
  var slug = window._sqd_slug || (window.location.search.match(/slug=([^&]+)/) || [])[1];
  if (!slug) return;
  var goal = parseInt(document.getElementById('loyalty-goal').value) || 10;
  var rewardName = document.getElementById('loyalty-reward-name').value || 'Free item';
  var token = localStorage.getItem('sqd_token');
  fetch('https://api.qraivy.com/lp/stamp/settings/' + slug, {
    method: 'POST',
    headers: Object.assign({'Content-Type':'application/json'}, token ? {'Authorization':'Bearer '+token} : {}),
    body: JSON.stringify({ goal: goal, rewardName: rewardName, enabled: _loyaltyEnabled })
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.ok) { alert('Loyalty settings saved!'); loadLoyaltyTab(); }
  }).catch(function(e){ alert('Error saving: ' + e.message); });
};

window.copyStampUrl = function() {
  if (_loyaltyStampUrl) { navigator.clipboard.writeText(_loyaltyStampUrl).then(function(){ alert('NFC URL copied!'); }); }
};

window.redeemLoyalty = function() {
  var slug = window._sqd_slug || (window.location.search.match(/slug=([^&]+)/) || [])[1];
  if (!slug) return;
  if (!confirm('Mark reward as redeemed and reset stamp count to 0?')) return;
  var token = localStorage.getItem('sqd_token');
  fetch('https://api.qraivy.com/lp/stamp/redeem/' + slug, {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.ok) { alert('Reward redeemed! Stamps reset to 0.'); loadLoyaltyTab(); }
  }).catch(function(e){ alert('Error: ' + e.message); });
};

document.addEventListener('sqd-tab-changed', function(e) {
  if (e.detail && e.detail.tab === 'loyalty') loadLoyaltyTab();
});

