
    (function() {
      var tabs = document.querySelectorAll('.sqd-tab');
      var panels = document.querySelectorAll('.sqd-tab-panel');
      var SECTION_SCROLL = {hero:0,voice:250,ai:450,loop:650,buttons:1050,featured:1300,info:1500,appearance:0,settings:0};
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          var target = this.getAttribute('data-tab');
          tabs.forEach(function(t) {
            t.style.background = 'rgba(255,255,255,0.03)';
            t.style.borderColor = 'rgba(255,255,255,0.08)';
            t.style.color = 'rgba(240,244,248,0.86)';
          });
          this.style.background = 'rgba(255,90,31,0.12)';
          this.style.borderColor = 'rgba(255,90,31,0.3)';
          this.style.color = '#ff5a1f';
          panels.forEach(function(p) {
            p.style.display = p.getAttribute('data-panel') === target ? 'block' : 'none';
          });
          // Reset editor tab scroll to top on every tab switch
          var tc=document.getElementById('sqd-tab-content'); if(tc) tc.scrollTop=0;
          // Scroll phone to section
          var pf = document.querySelector('.sqd-phone-frame');
          if (pf) pf.scrollTop = SECTION_SCROLL[target] || 0;
          // Load push device count when push tab opens
          if (target === 'push') { loadPushDeviceCount(); loadPushHistory(); }
          // Render buttons panel
          if (target === 'buttons') { setTimeout(function(){ if(window.renderButtonsFn) window.renderButtonsFn(); if(window.QRAIVY_PREVIEW) window.QRAIVY_PREVIEW.render(); }, 100); }
          if (target === 'featured') { setTimeout(function(){ if(window.renderFeaturedFn) window.renderFeaturedFn(); if(window.QRAIVY_PREVIEW) window.QRAIVY_PREVIEW.render(); }, 100); }
          if (target === 'featured') { setTimeout(function(){ if(window.renderFeaturedFn) window.renderFeaturedFn(); if(window.QRAIVY_PREVIEW) window.QRAIVY_PREVIEW.render(); }, 100); }
          if (target === 'loyalty') { document.dispatchEvent(new CustomEvent('sqd-tab-changed', {detail:{tab:'loyalty'}})); }
        });
      });
    })();
    
