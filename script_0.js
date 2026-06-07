
  (function() {
    var QR_STATE = { fg: '#000000', bg: '#ffffff', margin: 6, size: 300 };
    var PRESETS = {
      classic: { fg: '#000000', bg: '#ffffff' },
      brand:   { fg: '#ff5a1f', bg: '#ffffff' },
      dark:    { fg: '#f0f4f8', bg: '#0a0a0a' },
      orange:  { fg: '#ffffff', bg: '#ff5a1f' },
      mono:    { fg: '#333333', bg: '#f5f5f5' },
      invert:  { fg: '#ffffff', bg: '#000000' }
    };

    function getUrl() {
      var slug = new URLSearchParams(window.location.search).get('slug');
      var s = window.QRAIVY_EDITOR_STATE;
      return (s && s.hostedUrl) || window._sqd_hostedUrl || (slug ? 'https://api.qraivy.com/lp/' + slug : window.location.href);
    }
    window.QRAIVY_QR_READY = function(url) { renderQR(); };

    function renderQR() {
      var url = getUrl();
      var apiUrl = 'https://api.qrserver.com/v1/create-qr-code/?'
        + 'size=200x200'
        + '&data=' + encodeURIComponent(url)
        + '&color=' + QR_STATE.fg.replace('#','')
        + '&bgcolor=' + QR_STATE.bg.replace('#','')
        + '&margin=' + QR_STATE.margin;
      var canvas = document.getElementById('ov-qr-canvas');
      if (!canvas) return;
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 200);
        ctx.drawImage(img, 0, 0, 200, 200);
        updateDownload();
      };
      img.src = apiUrl;
    }

    function updateDownload() {
      var canvas = document.getElementById('ov-qr-canvas');
      var dl = document.getElementById('ov-qr-download');
      if (!canvas || !dl) return;
      try {
        var sz = QR_STATE.size;
        var url = getUrl();
        dl.href = 'https://api.qrserver.com/v1/create-qr-code/?'
          + 'size=' + sz + 'x' + sz
          + '&data=' + encodeURIComponent(url)
          + '&color=' + QR_STATE.fg.replace('#','')
          + '&bgcolor=' + QR_STATE.bg.replace('#','')
          + '&margin=' + QR_STATE.margin;
      } catch(e) {}
    }

    function setPreset(name) {
      var p = PRESETS[name]; if (!p) return;
      QR_STATE.fg = p.fg; QR_STATE.bg = p.bg;
      var fgPicker = document.getElementById('ov-qr-fg');
      var bgPicker = document.getElementById('ov-qr-bg');
      var fgHex = document.getElementById('ov-qr-fg-hex');
      var bgHex = document.getElementById('ov-qr-bg-hex');
      if (fgPicker) fgPicker.value = p.fg;
      if (bgPicker) bgPicker.value = p.bg;
      if (fgHex) fgHex.value = p.fg;
      if (bgHex) bgHex.value = p.bg;
      document.querySelectorAll('#ov-qr-preset-btns button').forEach(function(b) {
        var active = b.getAttribute('data-preset') === name;
        b.style.borderColor = active ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.1)';
        b.style.background  = active ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
        b.style.color       = active ? '#ff5a1f' : 'rgba(240,244,248,0.6)';
      });
      renderQR();
    }

    function setSize(sz) {
      QR_STATE.size = sz;
      document.querySelectorAll('#ov-qr-size-btns button').forEach(function(b) {
        var active = parseInt(b.getAttribute('data-sz')) === sz;
        b.style.borderColor = active ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.1)';
        b.style.background  = active ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
        b.style.color       = active ? '#ff5a1f' : 'rgba(240,244,248,0.6)';
      });
      updateDownload();
    }

    window.QRAIVY_OV_TABS = {
      show: function(tab) {
        ['qr','lp','analytics'].forEach(function(t) {
          var panel = document.getElementById('ov-panel-'+t);
          var btn   = document.getElementById('ov-tab-'+t);
          if (panel) panel.style.display = t === tab ? '' : 'none';
          if (btn) {
            btn.style.background = t === tab ? '#ff5a1f' : 'transparent';
            btn.style.color      = t === tab ? '#fff' : 'rgba(240,244,248,0.6)';
          }
        });
        if (tab === 'qr') setTimeout(renderQR, 50);
      }
    };

    document.addEventListener('DOMContentLoaded', function() {
      // Wire fg color
      var fgPicker = document.getElementById('ov-qr-fg');
      var fgHex    = document.getElementById('ov-qr-fg-hex');
      if (fgPicker) fgPicker.addEventListener('input', function() {
        QR_STATE.fg = this.value; if(fgHex) fgHex.value = this.value; renderQR();
      });
      if (fgHex) fgHex.addEventListener('change', function() {
        if (/^#[0-9a-fA-F]{6}$/.test(this.value)) { QR_STATE.fg = this.value; if(fgPicker) fgPicker.value = this.value; renderQR(); }
      });

      // Wire bg color
      var bgPicker = document.getElementById('ov-qr-bg');
      var bgHex    = document.getElementById('ov-qr-bg-hex');
      if (bgPicker) bgPicker.addEventListener('input', function() {
        QR_STATE.bg = this.value; if(bgHex) bgHex.value = this.value; renderQR();
      });
      if (bgHex) bgHex.addEventListener('change', function() {
        if (/^#[0-9a-fA-F]{6}$/.test(this.value)) { QR_STATE.bg = this.value; if(bgPicker) bgPicker.value = this.value; renderQR(); }
      });

      // Wire margin slider
      var marginSlider = document.getElementById('ov-qr-margin');
      if (marginSlider) marginSlider.addEventListener('input', function() {
        QR_STATE.margin = parseInt(this.value);
        var mv = document.getElementById('ov-qr-margin-val');
        if (mv) mv.textContent = this.value;
        renderQR();
      });

      // Wire size buttons
      document.querySelectorAll('#ov-qr-size-btns button').forEach(function(b) {
        b.addEventListener('click', function() { setSize(parseInt(this.getAttribute('data-sz'))); });
      });

      // Wire preset buttons
      document.querySelectorAll('#ov-qr-preset-btns button').forEach(function(b) {
        b.addEventListener('click', function() { setPreset(this.getAttribute('data-preset')); });
      });

      // Wire view live button
      setTimeout(function() {
        var vl = document.getElementById('ov-qr-view-live');
        var s = window.QRAIVY_EDITOR_STATE;
        if (vl && s && s.hostedUrl) vl.href = s.hostedUrl;
      }, 800);

      // Initial render
      setTimeout(renderQR, 1200);
    });
  })();
  
