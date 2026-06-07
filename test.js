
(function(){
  var playing = false;
  var aiActivated = false;
  var bizName = 'Joes Bar';
  var slug = 'joes-bar-odk';

  var voiceBtn  = document.getElementById('voiceBtn');
  var waveform  = document.getElementById('waveform');
  var voiceSub  = document.getElementById('voiceSub');
  var aiSection = document.getElementById('aiSection');
  var collapsed = document.getElementById('chatCollapsed');
  var expanded  = document.getElementById('chatExpanded');
  var chatMsgs  = document.getElementById('chatMsgs');
  var chatInput = document.getElementById('chatInput');
  var chatSend  = document.getElementById('chatSend');

  // ── Voice player ────────────────────────────────────────
  if (voiceBtn) {
    voiceBtn.addEventListener('click', function() {
      if (playing) return;
      var audioUrl = 'https://res.cloudinary.com/dwqc6n7rn/video/upload/v1780758691/qraivy-voices/voice-joes-bar-odk.mp3';
      playing = true;
      voiceBtn.textContent = '⏸';
      if (waveform) waveform.classList.add('lp-waveform-active');
      if (voiceSub) voiceSub.textContent = 'Playing welcome message…';
      function onVoiceEnd() {
        voiceBtn.textContent = '▶';
        if (waveform) waveform.classList.remove('lp-waveform-active');
        if (voiceSub) voiceSub.textContent = 'Welcome message played';
        playing = false;
        if (!aiActivated) activateAI();
      }
      if (audioUrl) {
        var audio = new Audio(audioUrl);
        audio.onended = onVoiceEnd;
        audio.onerror = onVoiceEnd;
        audio.play().catch(onVoiceEnd);
      } else {
        setTimeout(onVoiceEnd, 3500);
      }
    });
  }

  // ── AI expansion ────────────────────────────────────────
  function activateAI() {
    aiActivated = true;
    if (!collapsed || !expanded) return;

    // Hide collapsed pill
    collapsed.style.transition = 'opacity 0.3s';
    collapsed.style.opacity = '0';
    setTimeout(function() {
      collapsed.style.display = 'none';
      expanded.style.display = 'block';
      // Animate expansion
      expanded.style.transition = 'opacity 0.4s ease';
      setTimeout(function() {
        expanded.style.opacity = '1';
        // Show typing then greeting
        addAIMsg('typing');
        setTimeout(function() {
          replaceTyping('Hi! I can help answer questions about ' + bizName + '. What would you like to know?');
          if (chatInput) setTimeout(function(){ chatInput.focus(); }, 300);
        }, 1400);
      }, 50);
    }, 320);
  }

  // ── Chat (v2) ────────────────────────────────────────────────
  function addAIMsg(type) {
    var m = document.getElementById('chatMsgs');
    if (!m) return;
    var old = document.getElementById('typingMsg');
    if (old) old.parentNode.removeChild(old);
    var d = document.createElement('div');
    d.className = 'lp-msg lp-msg-ai';
    if (type === 'typing') {
      d.id = 'typingMsg';
      d.innerHTML = '<div class="lp-bubble lp-bubble-ai"><span class="lp-typing-dots"><span></span><span></span><span></span></span></div>';
    } else {
      d.innerHTML = '<div class="lp-bubble lp-bubble-ai">' + type + '</div>';
    }
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  function replaceTyping(text) {
    var m = document.getElementById('chatMsgs');
    var t = document.getElementById('typingMsg');
    if (t) t.parentNode.removeChild(t);
    if (!m) return;
    var d = document.createElement('div');
    d.className = 'lp-msg lp-msg-ai';
    d.style.cssText = 'display:flex;justify-content:flex-start';
    var b = document.createElement('div');
    b.style.cssText = 'max-width:82%;padding:10px 13px;border-radius:12px;font-size:0.88rem;line-height:1.6;background:rgba(255,255,255,0.12);color:#f0ece0;word-break:break-word';
    b.textContent = text;
    d.appendChild(b);
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  function addUserMsg(txt) {
    if (!chatMsgs) return;
    var d = document.createElement('div');
    d.className = 'lp-msg lp-msg-user';
    d.innerHTML = '<div class="lp-bubble">' + txt + '</div>';
    chatMsgs.appendChild(d);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  var chatHistory = [];
  function submitMsg() {
    if (!chatInput) return;
    var v = chatInput.value.trim();
    if (!v) return;
    addUserMsg(v);
    chatInput.value = '';
    addAIMsg('typing');
    chatHistory.push({role:'user',content:v});
    fetch('/lp/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,message:v,history:chatHistory.slice(-6)})})
    .then(function(r){return r.json();})
    .then(function(d){replaceTyping(d.reply||'Sorry, try again.');chatHistory.push({role:'assistant',content:d.reply||''});})
    .catch(function(){replaceTyping('Sorry, something went wrong.');});
  }

  if (chatSend) chatSend.addEventListener('click', submitMsg);
  if (chatInput) chatInput.addEventListener('keydown', function(e){ if(e.key==='Enter') submitMsg(); });
  // growth modal
  (function(){
    var modal=document.getElementById("qrGrowthModal");
    var openBtn=document.getElementById("qrGrowthBtn");
    var closeBtn=document.getElementById("qrgmClose");
    var skipBtn=document.getElementById("qrgmSkip");
    var nameIn=document.getElementById("qrgmName");
    var urlPrev=document.getElementById("qrgmUrlPreview");
    var ctaBtn=document.getElementById("qrgmCta");
    function slugify(s){return(s||"yourbrand").toLowerCase().replace(/[^a-z0-9s-]/g,"").trim().replace(/s+/g,"-").replace(/-+/g,"-").slice(0,28)||"yourbrand";}
    if(openBtn)openBtn.addEventListener("click",function(){if(modal)modal.classList.add("show");});
    function closeModal(){if(modal)modal.classList.remove("show");}
    if(closeBtn)closeBtn.addEventListener("click",closeModal);
    if(skipBtn)skipBtn.addEventListener("click",closeModal);
    if(modal)modal.addEventListener("click",function(e){if(e.target===modal)closeModal();});
    if(nameIn&&urlPrev){nameIn.addEventListener("input",function(){var sl=slugify(nameIn.value);urlPrev.textContent=nameIn.value.trim()?"qraivy.com/demo-"+sl:"qraivy.com/demo-yourbrand";});}
    if(ctaBtn){ctaBtn.addEventListener("click",function(){
      var name=nameIn?nameIn.value.trim():"";
      try{localStorage.setItem("qraivy_growth_source",JSON.stringify({sourceSlug:slug,sourceBiz:bizName,referredAt:new Date().toISOString()}));if(name)localStorage.setItem("qraivy_prefill_name",name);}catch(e){}
      var url="https://qraivy.com/smart-demo.html";
      url+=name?"?name="+encodeURIComponent(name)+"&src=lp":"?src=lp";
      window.location.href=url;
    });}
  })();

  // Also allow tapping the collapsed card to activate
  if (collapsed) {
    collapsed.style.cursor = 'pointer';
    collapsed.addEventListener('click', function() {
      if (!aiActivated) activateAI();
    });
  }
})();
(function(){if('serviceWorker'in navigator&&'PushManager'in window){navigator.serviceWorker.register('/sw.js').then(function(reg){window.__swReg=reg;});}var _s=window.location.pathname.split('/').pop();if(localStorage.getItem('wp_sub_'+_s))return;if(!('Notification'in window)||Notification.permission==='denied')return;if(Notification.permission==='granted'){(function tryAutoSub(){if(window.__swReg){fetch('https://api.qraivy.com/lp/webpush/vapid-key/'+_s).then(function(x){return x.json();}).then(function(d){var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));return window.__swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});}).then(function(s){var j=s.toJSON();return fetch('https://api.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});}).then(function(){localStorage.setItem('wp_sub_'+_s,'1');}).catch(function(){});}}else{setTimeout(tryAutoSub,500);}})();return;}var nb=document.createElement('div');nb.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#ff6b00;color:#fff;padding:12px 24px;border-radius:50px;font-size:.8rem;font-weight:700;cursor:pointer;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);white-space:nowrap;';nb.textContent='Get notified of new deals';nb.onclick=function(){nb.textContent='...';Notification.requestPermission().then(function(p){if(p==='granted'){var sub=function(r){fetch('https://api.qraivy.com/lp/webpush/vapid-key/'+_s).then(function(x){return x.json();}).then(function(d){var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));return r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});}).then(function(s){var j=s.toJSON();return fetch('https://api.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});}).then(function(){localStorage.setItem('wp_sub_'+_s,'1');nb.textContent='Notifications on!';setTimeout(function(){nb.remove();},2000);}).catch(function(){nb.remove();});};if(window.__swReg){sub(window.__swReg);}else{navigator.serviceWorker.register('/sw.js').then(sub);}}else{localStorage.setItem('wp_sub_'+_s,'denied');nb.remove();}});};document.body.appendChild(nb);})();
</script>

