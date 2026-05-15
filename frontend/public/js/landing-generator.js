/* ─────────────────────────────────────────────────────────────
   QRAIVY — AI Smart Landing Page Generator
   Generates mobile-first dark luxury HTML landing pages.
   ───────────────────────────────────────────────────────────── */

window.QRAivyLPGen = (function(){

  // ── Slug generator ────────────────────────────────
  function makeSlug(name){
    var base = (name||'qraivy').toLowerCase()
      .replace(/[äàáâ]/g,'a').replace(/[öòóô]/g,'o').replace(/[üùúû]/g,'u')
      .replace(/[ñ]/g,'n').replace(/[ß]/g,'ss')
      .replace(/[^a-z0-9\s-]/g,'')
      .trim().replace(/\s+/g,'-').replace(/-+/g,'-');
    var rand = Math.random().toString(36).slice(2,5);
    return base + '-' + rand;
  }

  // ── Use case content ──────────────────────────────
  var CONTENT = {
    restaurant:{
      headline:'Welcome to {name}',
      sub:'Authentic flavours, unforgettable experiences. Reserve your table or browse our menu.',
      ctas:[{label:'📋 View Menu',style:'primary'},{label:'📅 Reserve a Table',style:'secondary'}],
      aiTitle:'AI Food Assistant',
      aiGreeting:'Hi! I can tell you about our menu, allergens, and today\'s specials. What would you like to know?',
      voiceTitle:'A message from our chef',
      subscribeTitle:'Stay in the loop',
      subscribeSub:'Get notified about new menus, specials and events.',
      sections:[
        {id:'featured',title:'Featured Dishes',items:['Bruschetta al Pomodoro — €8.50','Pasta al Tartufo — €24.00','Branzino al Forno — €28.00','Tiramisu della Casa — €9.00']},
        {id:'hours',title:'Opening Hours',items:['Monday – Friday: 12:00 – 23:00','Saturday: 11:00 – 00:00','Sunday: 11:00 – 22:00','Kitchen closes 30 min before closing']},
        {id:'reservation',title:'Reserve Your Table',cta:{label:'📅 Book Now',type:'reserve'}},
      ]
    },
    ecommerce:{
      headline:'Shop {name}',
      sub:'Premium products, exclusive deals, delivered fast. Discover our latest collection.',
      ctas:[{label:'🛍 Shop Now',style:'primary'},{label:'🔥 View Offers',style:'secondary'}],
      aiTitle:'AI Shopping Assistant',
      aiGreeting:'Looking for something specific? I can help you find the right product and check availability.',
      voiceTitle:'Welcome from our team',
      subscribeTitle:'Get exclusive deals',
      subscribeSub:'Subscribe for early access to sales, new arrivals and member-only discounts.',
      sections:[
        {id:'featured',title:'Featured Products',items:['New Arrivals — Up to 30% off','Best Sellers — Shop the collection','Flash Sale — 24 hours only','Gift Sets — Perfect for any occasion']},
        {id:'reviews',title:'Customer Reviews',reviews:[{name:'Sarah M.',stars:5,text:'Incredible quality and fast delivery. Will definitely order again!'},{name:'James T.',stars:5,text:'Exactly as described. Premium product, great value.'},{name:'Emma R.',stars:4,text:'Love it! Packaging was beautiful too.'}]},
        {id:'delivery',title:'Delivery & Returns',items:['Free delivery on orders over €50','Express delivery: 1–2 business days','30-day hassle-free returns','Secure checkout — SSL protected']},
      ]
    },
    realestate:{
      headline:'{name} — Premium Properties',
      sub:'Discover exceptional homes in prime locations. Schedule your private viewing today.',
      ctas:[{label:'📅 Schedule Viewing',style:'primary'},{label:'🖼 View Gallery',style:'secondary'}],
      aiTitle:'AI Property Assistant',
      aiGreeting:'Hello! I can answer questions about any of our listings, neighbourhood info, or help you schedule a viewing.',
      voiceTitle:'A message from your agent',
      subscribeTitle:'Property alerts',
      subscribeSub:'Be first to know about new listings that match your criteria.',
      sections:[
        {id:'featured',title:'Featured Properties',items:['3-bed apartment — City Centre — €450,000','Modern villa — Suburbs — €680,000','Studio flat — Investment opportunity — €195,000','Penthouse — Sea views — €1.2M']},
        {id:'services',title:'Our Services',items:['Free property valuation','Mortgage guidance & calculator','Virtual & in-person tours','Dedicated buyer & seller support']},
        {id:'contact',title:'Contact Your Agent',cta:{label:'📞 Call Now',type:'call'}},
      ]
    },
    gym:{
      headline:'Transform at {name}',
      sub:'Expert coaching, proven results, zero excuses. Claim your free trial today.',
      ctas:[{label:'💪 Claim Free Trial',style:'primary'},{label:'📅 View Classes',style:'secondary'}],
      aiTitle:'AI Fitness Assistant',
      aiGreeting:'Ready to start your transformation? Ask me about classes, membership plans, or personal training.',
      voiceTitle:'Message from your head trainer',
      subscribeTitle:'Join the community',
      subscribeSub:'Get workout tips, class schedules and member-only promotions.',
      sections:[
        {id:'classes',title:'Class Schedule',items:['HIIT — Mon/Wed/Fri 6:30am','Yoga Flow — Tue/Thu 7:00pm','Strength & Conditioning — Daily 9:00am','Boxing Cardio — Sat 10:00am']},
        {id:'plans',title:'Membership Plans',items:['Basic — €29/month — Gym access + locker','Pro — €49/month — All classes + 1 PT session','Elite — €89/month — Unlimited PT + nutrition plan','Student — €19/month — Valid student ID required']},
        {id:'trainers',title:'Meet the Team',items:['Coach Mike — Strength & Conditioning','Coach Ana — Yoga & Mindfulness','Coach Leo — Boxing & HIIT','Coach Sarah — Nutrition & Wellness']},
      ]
    },
    leadgen:{
      headline:'Work with {name}',
      sub:'Limited consultation slots available. Book your free strategy session today.',
      ctas:[{label:'🎯 Book Free Session',style:'primary'},{label:'▶ See How It Works',style:'secondary'}],
      aiTitle:'AI Qualification Assistant',
      aiGreeting:'Hi! Tell me about your goals and I\'ll help match you with the right service package.',
      voiceTitle:'A personal message',
      subscribeTitle:'Get our free guide',
      subscribeSub:'Subscribe to receive our free strategy guide and exclusive content.',
      sections:[
        {id:'offer',title:'What You Get',items:['60-minute strategy consultation (free)','Custom growth roadmap','Competitive analysis','Clear next steps — no pressure']},
        {id:'proof',title:'Social Proof',reviews:[{name:'David K.',stars:5,text:'Best investment decision I\'ve made. ROI within the first month.'},{name:'Lisa P.',stars:5,text:'Professional, insightful, and genuinely cares about results.'},{name:'Mark S.',stars:5,text:'Transformed our approach completely. Highly recommended.'}]},
        {id:'cta',title:'Limited Slots Available',cta:{label:'📅 Book Now — It\'s Free',type:'book'}},
      ]
    },
    social:{
      headline:'{name}',
      sub:'Follow for exclusive content, giveaways and behind-the-scenes access.',
      ctas:[{label:'📱 Follow Now',style:'primary'},{label:'🎁 Latest Content',style:'secondary'}],
      aiTitle:'Chat with me',
      aiGreeting:"Hey! Ask me anything about collabs, content, or just say hi. I'll get back to you soon!",
      voiceTitle:'A message for you',
      subscribeTitle:'Join my inner circle',
      subscribeSub:'Exclusive content, early access and member-only giveaways.',
      sections:[
        {id:'links',title:'My Links',items:['📸 Instagram — @'+'{slug}','🎵 TikTok — @'+'{slug}','▶ YouTube — Subscribe now','🎙 Podcast — Listen now']},
        {id:'collab',title:'Work With Me',items:['Brand partnerships & sponsorships','Content creation & UGC','Affiliate & ambassador programs','Events & appearances']},
        {id:'giveaway',title:'Current Giveaway',cta:{label:'🎁 Enter Now',type:'giveaway'}},
      ]
    },
    bizcard:{
      headline:'Hi, I\'m {name}',
      sub:'Professional. Trusted. Ready to connect. Save my contact details instantly.',
      ctas:[{label:'📇 Save Contact',style:'primary'},{label:'🗓 Book a Call',style:'secondary'}],
      aiTitle:'Ask me anything',
      aiGreeting:"Hi! I can tell you more about my services, experience or help schedule a meeting. What would you like to know?",
      voiceTitle:'A personal introduction',
      subscribeTitle:'Stay in touch',
      subscribeSub:'Get occasional updates, insights and exclusive content.',
      sections:[
        {id:'services',title:'Services',items:['Strategy & Consulting','Brand Development','Digital Marketing','Partnerships & Growth']},
        {id:'contact',title:'Get in Touch',items:['📧 hello@{domain}','📞 +1 234 567 8900','📍 Available worldwide','🕐 Response within 24hrs']},
        {id:'booking',title:'Book a Discovery Call',cta:{label:'🗓 Schedule 30 Min Call',type:'book'}},
      ]
    },
    event:{
      headline:'{name}',
      sub:"Don't miss out. Get your tickets before they sell out.",
      ctas:[{label:'🎟 Get Tickets',style:'primary'},{label:'📋 View Lineup',style:'secondary'}],
      aiTitle:'Event Assistant',
      aiGreeting:"Hi! I can answer questions about the lineup, venue, tickets and what to expect. What would you like to know?",
      voiceTitle:'Message from the organiser',
      subscribeTitle:'Event updates',
      subscribeSub:'Be first to know about lineup changes, surprise guests and exclusive offers.',
      sections:[
        {id:'lineup',title:'Lineup',items:['Headline Act — 21:00','Support Act A — 19:30','Support Act B — 18:00','Doors Open — 17:00']},
        {id:'venue',title:'Venue & Info',items:['📍 City Arena, Main Street','🚇 5 min from Central Station','🅿 Parking available nearby','♿ Fully accessible venue']},
        {id:'tickets',title:'Ticket Options',items:['General Admission — €35','Early Bird — €25 (limited)','VIP Package — €95 (includes backstage)','Group (6+) — €25 each']},
      ]
    },
    'ai-support':{
      headline:'{name} Support',
      sub:'Instant answers, 24/7. Our AI assistant is here to help.',
      ctas:[{label:'🤖 Chat Now',style:'primary'},{label:'❓ Browse FAQs',style:'secondary'}],
      aiTitle:'AI Support Assistant',
      aiGreeting:"Hi! I'm here to help. Ask me anything about our products, services or account.",
      voiceTitle:'A message from our team',
      subscribeTitle:'Product updates',
      subscribeSub:'Get notified about new features, maintenance windows and service updates.',
      sections:[
        {id:'faq',title:'Frequently Asked Questions',items:['How do I reset my password?','Where can I track my order?','How do I cancel or modify a booking?','What are your support hours?']},
        {id:'status',title:'Service Status',items:['🟢 API — Operational','🟢 Dashboard — Operational','🟢 Notifications — Operational','🟢 Analytics — Operational']},
        {id:'contact',title:'Still Need Help?',cta:{label:'📧 Contact Support',type:'contact'}},
      ]
    },
    portfolio:{
      headline:"{name}'s Portfolio",
      sub:'Strategy + design + results. Let\'s build something great together.',
      ctas:[{label:'💼 View My Work',style:'primary'},{label:'📧 Get in Touch',style:'secondary'}],
      aiTitle:'Ask about my work',
      aiGreeting:"Hi! I can tell you about my projects, services and availability. What are you looking for?",
      voiceTitle:'A personal introduction',
      subscribeTitle:'Creative updates',
      subscribeSub:'Get occasional insights, case studies and creative inspiration.',
      sections:[
        {id:'work',title:'Featured Work',items:['Brand Identity — Luxury Retail Client','Web Design — SaaS Startup','Campaign — €2M ad spend managed','UX/UI — Mobile app, 50K+ downloads']},
        {id:'services',title:'Services & Rates',items:['Brand Identity — from €2,500','Website Design — from €3,500','Campaign Strategy — from €1,500','Monthly Retainer — from €2,000/mo']},
        {id:'booking',title:'Start a Project',cta:{label:'📅 Book Discovery Call',type:'book'}},
      ]
    },
    packaging:{
      headline:'Welcome to {name}',
      sub:'Scan to discover the full story behind your product.',
      ctas:[{label:'✨ Explore Product',style:'primary'},{label:'🔄 Reorder Now',style:'secondary'}],
      aiTitle:'Product Assistant',
      aiGreeting:"Hi! Ask me about ingredients, how to use this product, or anything else you'd like to know.",
      voiceTitle:'From our founder',
      subscribeTitle:'Loyalty rewards',
      subscribeSub:'Scan again to earn points, get exclusive offers and be first for new launches.',
      sections:[
        {id:'story',title:'Our Story',items:['Founded with a mission to create better products','Sustainably sourced ingredients & materials','Tested and approved by real customers','Family-owned and independently run']},
        {id:'ingredients',title:'What\'s Inside',items:['100% natural ingredients','No harmful additives or preservatives','Ethically & sustainably sourced','Dermatologist tested & approved']},
        {id:'reorder',title:'Order Again',cta:{label:'🔄 Reorder Now',type:'shop'}},
      ]
    },
  };

  // ── Main generator ────────────────────────────────
  function generate(opts){
    var useCase   = opts.useCase   || 'restaurant';
    var bizName   = opts.bizName   || 'My Business';
    var accent    = opts.accent    || '#ff5a1f';
    var logo      = opts.logo      || null;
    var slug      = opts.slug      || makeSlug(bizName);
    var websiteURL= opts.websiteURL|| '';
    var qrSrc     = opts.qrSrc    || ('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://qrairy.ai/lp/'+slug+'&color=ffffff&bgcolor=111111&margin=2');

    var c = CONTENT[useCase] || CONTENT['restaurant'];
    var domain = websiteURL.replace(/^https?:\/\//,'').replace(/\/.*$/,'') || 'qraivy.com';

    function tmpl(s){ return (s||'').replace(/\{name\}/g,bizName).replace(/\{slug\}/g,slug).replace(/\{domain\}/g,domain); }

    var headline = tmpl(c.headline);
    var sub      = tmpl(c.sub);
    var accentRGB= hexToRGB(accent);
    var accentDim= 'rgba('+accentRGB+',0.12)';
    var accentBorder= 'rgba('+accentRGB+',0.28)';
    var accentGlow = 'rgba('+accentRGB+',0.35)';

    // Generate custom sections HTML
    var sectionsHTML = c.sections.map(function(sec){
      if(sec.reviews){
        var rv = sec.reviews.map(function(r){
          return '<div class="lp-review-card">'+
            '<div class="lp-review-stars">'+'\u2605'.repeat(r.stars)+'</div>'+
            '<p class="lp-review-text">\u201c'+r.text+'\u201d</p>'+
            '<div class="lp-review-author">&mdash; '+r.name+'</div>'+
          '</div>';
        }).join('');
        return '<section class="lp-section"><div class="lp-section-label">'+sec.title+'</div><div class="lp-reviews-grid">'+rv+'</div></section>';
      }
      if(sec.cta){
        return '<section class="lp-section lp-cta-section">'+
          '<div class="lp-section-label">'+sec.title+'</div>'+
          '<a class="lp-btn lp-btn-primary" href="#" style="background:'+accent+';box-shadow:0 0 24px '+accentGlow+'">'+sec.cta.label+'</a>'+
        '</section>';
      }
      var items = (sec.items||[]).map(function(item){
        return '<div class="lp-list-item"><span class="lp-list-dot" style="background:'+accent+'"></span><span>'+tmpl(item)+'</span></div>';
      }).join('');
      return '<section class="lp-section"><div class="lp-section-label">'+sec.title+'</div><div class="lp-list">'+items+'</div></section>';
    }).join('');

    var logoHTML = logo
      ? '<img src="'+logo+'" class="lp-logo-img" alt="'+bizName+' logo" />'
      : '<div class="lp-logo-text" style="color:'+accent+'">'+bizName.charAt(0).toUpperCase()+'</div>';

    var ctaBtns = c.ctas.map(function(btn){
      if(btn.style==='primary') return '<a href="#" class="lp-btn lp-btn-primary" style="background:'+accent+';box-shadow:0 0 24px '+accentGlow+'">'+btn.label+'</a>';
      return '<a href="#" class="lp-btn lp-btn-secondary">'+btn.label+'</a>';
    }).join('');

    return '<!DOCTYPE html><html lang="en"><head>'+
      '<meta charset="UTF-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">'+
      '<title>'+bizName+' — Smart Landing Page</title>'+
      '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400&display=swap" rel="stylesheet">'+
      '<style>'+getLPStyles(accent,accentRGB,accentDim,accentBorder,accentGlow)+'</style>'+
    '</head><body>'+

    // Nav
    '<nav class="lp-nav">'+
      '<div class="lp-nav-logo">'+logoHTML+'<span class="lp-nav-name">'+bizName+'</span></div>'+
      '<div class="lp-nav-badge"><span class="lp-nav-dot"></span>AI Powered</div>'+
    '</nav>'+

    // Hero
    '<section class="lp-hero" style="background:linear-gradient(160deg,'+accentDim+' 0%,transparent 60%)">'+
      '<div class="lp-hero-badge" style="border-color:'+accentBorder+';color:'+accent+'">&#10022; Qraivy Smart Page</div>'+
      '<h1 class="lp-hero-title">'+headline+'</h1>'+
      '<p class="lp-hero-sub">'+sub+'</p>'+
      '<div class="lp-hero-ctas">'+ctaBtns+'</div>'+
    '</section>'+

    // QR section
    '<section class="lp-qr-section">'+
      '<div class="lp-qr-card">'+
        '<img src="'+qrSrc+'" class="lp-qr-img" alt="QR Code" />'+
        '<div class="lp-qr-info">'+
          '<div class="lp-qr-title">Your Smart QR</div>'+
          '<div class="lp-qr-url">qrairy.ai/lp/'+slug+'</div>'+
          '<div class="lp-qr-badge" style="background:'+accentDim+';border-color:'+accentBorder+';color:'+accent+'">&#10022; AI Smart Landing Page</div>'+
        '</div>'+
      '</div>'+
    '</section>'+

    // Custom sections
    sectionsHTML+

    // AI Chat section
    '<section class="lp-section lp-chat-section">'+
      '<div class="lp-section-label">'+c.aiTitle+'</div>'+
      '<div class="lp-chat-widget">'+
        '<div class="lp-chat-header">'+
          '<div class="lp-chat-avatar" style="background:'+accent+'">&#10022;</div>'+
          '<div class="lp-chat-header-info">'+
            '<div class="lp-chat-name">AI Assistant</div>'+
            '<div class="lp-chat-status"><span class="lp-status-dot"></span>Online</div>'+
          '</div>'+
        '</div>'+
        '<div class="lp-chat-messages" id="lp-chat-msgs">'+
          '<div class="lp-chat-msg lp-chat-msg-ai">'+
            '<div class="lp-chat-bubble" style="border-color:'+accentBorder+'">'+c.aiGreeting+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="lp-chat-input-row">'+
          '<input class="lp-chat-input" id="lp-chat-input" type="text" placeholder="Ask a question..." />'+
          '<button class="lp-chat-send" id="lp-chat-send" style="background:'+accent+'">&#10148;</button>'+
        '</div>'+
      '</div>'+
    '</section>'+

    // Voice welcome
    '<section class="lp-section lp-voice-section">'+
      '<div class="lp-section-label">'+c.voiceTitle+'</div>'+
      '<div class="lp-voice-player" id="lp-voice-player">'+
        '<button class="lp-voice-btn" id="lp-voice-play" style="background:'+accent+'">&#9654;</button>'+
        '<div class="lp-voice-info">'+
          '<div class="lp-voice-title">Welcome Message</div>'+
          '<div class="lp-voice-sub">Tap to listen</div>'+
        '</div>'+
        '<div class="lp-waveform" id="lp-waveform">'+
          Array.from({length:20},function(_,i){
            return '<div class="lp-wave-bar" style="height:'+(Math.random()*24+8)+'px;animation-delay:'+(i*0.06)+'s"></div>';
          }).join('')+
        '</div>'+
      '</div>'+
      '<p class="lp-voice-note">&#9679; AI voice powered by ElevenLabs &mdash; coming soon</p>'+
    '</section>'+

    // Subscribe / wallet
    '<section class="lp-section lp-subscribe-section">'+
      '<div class="lp-subscribe-card" style="border-color:'+accentBorder+'">'+
        '<div class="lp-subscribe-glow" style="background:radial-gradient(circle,'+accentDim+',transparent 70%)"></div>'+
        '<div class="lp-subscribe-wallet">'+
          '<div class="lp-wallet-card" style="background:linear-gradient(135deg,'+accent+','+accentDark(accent)+')">'+
            '<div class="lp-wallet-top">'+
              '<span class="lp-wallet-name">'+bizName+'</span>'+
              '<span class="lp-wallet-type">Smart Pass</span>'+
            '</div>'+
            '<div class="lp-wallet-bottom">'+
              '<span class="lp-wallet-id">QRAIVY MEMBER</span>'+
              '<span class="lp-wallet-icons">&#9711; &#9711;</span>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<h3 class="lp-subscribe-title">'+c.subscribeTitle+'</h3>'+
        '<p class="lp-subscribe-sub">'+c.subscribeSub+'</p>'+
        '<div class="lp-subscribe-form">'+
          '<input class="lp-subscribe-input" type="email" placeholder="your@email.com" />'+
          '<button class="lp-subscribe-btn" style="background:'+accent+'">Subscribe &rarr;</button>'+
        '</div>'+
        '<div class="lp-wallet-ctas">'+
          '<button class="lp-wallet-btn">&#9679; Add to Apple Wallet</button>'+
          '<button class="lp-wallet-btn">&#9632; Add to Google Wallet</button>'+
        '</div>'+
      '</div>'+
    '</section>'+

    // Footer
    '<footer class="lp-footer">'+
      '<div class="lp-footer-brand">'+
        '<div class="lp-footer-logo" style="color:'+accent+'">Q</div>'+
        '<div class="lp-footer-info">'+
          '<div class="lp-footer-name">'+bizName+'</div>'+
          '<div class="lp-footer-url">qrairy.ai/lp/'+slug+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="lp-footer-powered">Powered by <a href="https://qraivy.com" style="color:'+accent+'">Qraivy</a> &mdash; AI Smart Landing Pages</div>'+
    '</footer>'+

    // Chat script
    '<script>'+getChatScript()+'</'+'script>'+
    '</body></html>';
  }

  function hexToRGB(hex){
    hex=hex.replace('#','');
    if(hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r=parseInt(hex.slice(0,2),16);
    var g=parseInt(hex.slice(2,4),16);
    var b=parseInt(hex.slice(4,6),16);
    return r+','+g+','+b;
  }

  function accentDark(hex){
    hex=hex.replace('#','');
    if(hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r=Math.max(0,parseInt(hex.slice(0,2),16)-40);
    var g=Math.max(0,parseInt(hex.slice(2,4),16)-40);
    var b=Math.max(0,parseInt(hex.slice(4,6),16)-40);
    return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
  }

  function getChatScript(){
    return [
      "(function(){",
      "  var msgs=document.getElementById('lp-chat-msgs');",
      "  var input=document.getElementById('lp-chat-input');",
      "  var send=document.getElementById('lp-chat-send');",
      "  if(!msgs||!input||!send)return;",
      "  function addMsg(txt,isUser){",
      "    var d=document.createElement('div');",
      "    d.className='lp-chat-msg '+(isUser?'lp-chat-msg-user':'lp-chat-msg-ai');",
      "    d.innerHTML='<div class=\"lp-chat-bubble\">'+(isUser?txt:'<span class=\"lp-typing\"></span>')+'</div>';",
      "    msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;",
      "    if(!isUser){",
      "      setTimeout(function(){",
      "        d.querySelector('.lp-chat-bubble').textContent='Thanks for your message! Our AI assistant will respond shortly. For immediate help, please contact us directly.';",
      "        msgs.scrollTop=msgs.scrollHeight;",
      "      },1800);",
      "    }",
      "  }",
      "  function submit(){",
      "    var v=input.value.trim();if(!v)return;",
      "    addMsg(v,true);input.value='';",
      "    setTimeout(function(){addMsg('',false);},400);",
      "  }",
      "  send.addEventListener('click',submit);",
      "  input.addEventListener('keydown',function(e){if(e.key==='Enter')submit();});",
      "  var playBtn=document.getElementById('lp-voice-play');",
      "  var waveform=document.getElementById('lp-waveform');",
      "  var playing=false;",
      "  if(playBtn&&waveform){",
      "    playBtn.addEventListener('click',function(){",
      "      playing=!playing;",
      "      playBtn.textContent=playing?'\\u23F8':'\\u25B6';",
      "      waveform.classList.toggle('lp-waveform-active',playing);",
      "    });",
      "  }",
      "})();",
    ].join('\n');
  }

  function getLPStyles(accent,accentRGB,accentDim,accentBorder,accentGlow){
    return [
      '*{box-sizing:border-box;margin:0;padding:0;}',
      'html{scroll-behavior:smooth;}',
      'body{background:#0a0a0a;color:#f0ece0;font-family:\'DM Mono\',monospace;font-size:15px;line-height:1.6;overflow-x:hidden;max-width:480px;margin:0 auto;}',
      // Nav
      '.lp-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:rgba(10,10,10,0.92);backdrop-filter:blur(16px);border-bottom:0.5px solid rgba(255,255,255,0.07);}',
      '.lp-nav-logo{display:flex;align-items:center;gap:10px;}',
      '.lp-logo-img{width:32px;height:32px;border-radius:8px;object-fit:contain;}',
      '.lp-logo-text{width:32px;height:32px;border-radius:8px;background:'+accentDim+';border:0.5px solid '+accentBorder+';display:flex;align-items:center;justify-content:center;font-family:\'Syne\',sans-serif;font-size:1rem;font-weight:800;}',
      '.lp-nav-name{font-family:\'Syne\',sans-serif;font-size:0.88rem;font-weight:700;color:#f0ece0;}',
      '.lp-nav-badge{display:flex;align-items:center;gap:5px;background:'+accentDim+';border:0.5px solid '+accentBorder+';border-radius:99px;padding:4px 10px;font-size:0.6rem;color:'+accent+';letter-spacing:0.08em;}',
      '.lp-nav-dot{width:6px;height:6px;border-radius:50%;background:'+accent+';animation:lpPulse 2s ease-in-out infinite;}',
      '@keyframes lpPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}',
      // Hero
      '.lp-hero{padding:36px 20px 28px;text-align:center;}',
      '.lp-hero-badge{display:inline-flex;align-items:center;gap:6px;border:0.5px solid;border-radius:99px;padding:5px 14px;font-size:0.6rem;letter-spacing:0.1em;margin-bottom:18px;}',
      '.lp-hero-title{font-family:\'Syne\',sans-serif;font-size:clamp(1.6rem,6vw,2rem);font-weight:800;line-height:1.15;letter-spacing:-0.02em;margin-bottom:12px;}',
      '.lp-hero-sub{font-size:0.82rem;color:rgba(240,236,224,0.5);max-width:340px;margin:0 auto 24px;line-height:1.7;}',
      '.lp-hero-ctas{display:flex;flex-direction:column;gap:10px;align-items:center;}',
      // Buttons
      '.lp-btn{display:block;width:100%;max-width:320px;padding:14px 24px;border-radius:12px;font-family:\'Syne\',sans-serif;font-size:0.88rem;font-weight:700;text-align:center;text-decoration:none;cursor:pointer;border:none;transition:transform 0.15s,opacity 0.15s;letter-spacing:0.02em;}',
      '.lp-btn:active{transform:scale(0.97);}',
      '.lp-btn-primary{color:#fff;}',
      '.lp-btn-secondary{background:rgba(255,255,255,0.06);color:rgba(240,236,224,0.7);border:0.5px solid rgba(255,255,255,0.14);}',
      // QR section
      '.lp-qr-section{padding:0 20px 24px;}',
      '.lp-qr-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;}',
      '.lp-qr-img{width:72px;height:72px;border-radius:8px;flex-shrink:0;}',
      '.lp-qr-title{font-family:\'Syne\',sans-serif;font-size:0.82rem;font-weight:700;margin-bottom:3px;}',
      '.lp-qr-url{font-size:0.65rem;color:rgba(240,236,224,0.4);margin-bottom:8px;}',
      '.lp-qr-badge{display:inline-flex;align-items:center;gap:5px;border:0.5px solid;border-radius:99px;padding:3px 9px;font-size:0.55rem;letter-spacing:0.08em;}',
      // Sections
      '.lp-section{padding:20px 20px;border-top:0.5px solid rgba(255,255,255,0.06);}',
      '.lp-section-label{font-family:\'Syne\',sans-serif;font-size:0.82rem;font-weight:700;color:#f0ece0;margin-bottom:14px;}',
      // List items
      '.lp-list{display:flex;flex-direction:column;gap:8px;}',
      '.lp-list-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:9px;font-size:0.78rem;color:rgba(240,236,224,0.7);}',
      '.lp-list-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}',
      // Reviews
      '.lp-reviews-grid{display:flex;flex-direction:column;gap:10px;}',
      '.lp-review-card{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;}',
      '.lp-review-stars{color:'+accent+';font-size:0.75rem;letter-spacing:2px;margin-bottom:6px;}',
      '.lp-review-text{font-size:0.78rem;color:rgba(240,236,224,0.6);line-height:1.6;margin-bottom:8px;font-style:italic;}',
      '.lp-review-author{font-size:0.65rem;color:rgba(240,236,224,0.35);}',
      // CTA section
      '.lp-cta-section{text-align:center;}',
      '.lp-cta-section .lp-btn{margin:0 auto;}',
      // AI Chat
      '.lp-chat-section{}',
      '.lp-chat-widget{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;}',
      '.lp-chat-header{display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(255,255,255,0.03);border-bottom:0.5px solid rgba(255,255,255,0.07);}',
      '.lp-chat-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#fff;flex-shrink:0;}',
      '.lp-chat-name{font-family:\'Syne\',sans-serif;font-size:0.8rem;font-weight:700;}',
      '.lp-chat-status{display:flex;align-items:center;gap:5px;font-size:0.6rem;color:rgba(240,236,224,0.4);}',
      '.lp-status-dot{width:5px;height:5px;border-radius:50%;background:#22c55e;}',
      '.lp-chat-messages{min-height:100px;max-height:200px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none;}',
      '.lp-chat-messages::-webkit-scrollbar{display:none;}',
      '.lp-chat-msg{display:flex;}',
      '.lp-chat-msg-user{justify-content:flex-end;}',
      '.lp-chat-bubble{max-width:80%;padding:9px 12px;border-radius:12px;font-size:0.75rem;line-height:1.5;}',
      '.lp-chat-msg-ai .lp-chat-bubble{background:rgba(255,255,255,0.05);border:0.5px solid;color:rgba(240,236,224,0.7);}',
      '.lp-chat-msg-user .lp-chat-bubble{background:'+accentDim+';border:0.5px solid '+accentBorder+';color:rgba(240,236,224,0.85);}',
      '.lp-typing::after{content:"...";animation:lpTyping 1.2s infinite;}',
      '@keyframes lpTyping{0%{content:"."}33%{content:".."}66%{content:"..."}}',
      '.lp-chat-input-row{display:flex;gap:8px;padding:10px 12px;border-top:0.5px solid rgba(255,255,255,0.07);}',
      '.lp-chat-input{flex:1;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:9px 12px;color:#f0ece0;font-family:\'DM Mono\',monospace;font-size:0.75rem;outline:none;}',
      '.lp-chat-input::placeholder{color:rgba(240,236,224,0.25);}',
      '.lp-chat-send{width:36px;height:36px;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      // Voice
      '.lp-voice-player{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:8px;}',
      '.lp-voice-btn{width:40px;height:40px;border:none;border-radius:50%;color:#fff;cursor:pointer;font-size:0.9rem;flex-shrink:0;transition:transform 0.1s;}',
      '.lp-voice-btn:active{transform:scale(0.92);}',
      '.lp-voice-title{font-family:\'Syne\',sans-serif;font-size:0.82rem;font-weight:700;margin-bottom:2px;}',
      '.lp-voice-sub{font-size:0.62rem;color:rgba(240,236,224,0.35);}',
      '.lp-waveform{display:flex;align-items:center;gap:2px;height:32px;margin-left:auto;}',
      '.lp-wave-bar{width:3px;background:rgba(255,255,255,0.15);border-radius:2px;transition:background 0.3s;}',
      '.lp-waveform-active .lp-wave-bar{background:'+accent+';animation:lpWave 0.8s ease-in-out infinite alternate;}',
      '@keyframes lpWave{0%{transform:scaleY(0.4)}100%{transform:scaleY(1)}}',
      '.lp-voice-note{font-size:0.58rem;color:rgba(240,236,224,0.2);text-align:center;}',
      // Subscribe
      '.lp-subscribe-section{}',
      '.lp-subscribe-card{position:relative;overflow:hidden;background:rgba(255,255,255,0.03);border:0.5px solid;border-radius:18px;padding:24px 20px;}',
      '.lp-subscribe-glow{position:absolute;top:-40px;right:-40px;width:160px;height:160px;pointer-events:none;border-radius:50%;}',
      '.lp-subscribe-wallet{margin-bottom:20px;display:flex;justify-content:center;}',
      '.lp-wallet-card{width:240px;border-radius:14px;padding:16px 20px;position:relative;overflow:hidden;}',
      '.lp-wallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}',
      '.lp-wallet-name{font-family:\'Syne\',sans-serif;font-size:0.85rem;font-weight:800;color:#fff;}',
      '.lp-wallet-type{font-size:0.58rem;color:rgba(255,255,255,0.6);letter-spacing:0.1em;}',
      '.lp-wallet-bottom{display:flex;justify-content:space-between;align-items:center;}',
      '.lp-wallet-id{font-size:0.55rem;color:rgba(255,255,255,0.5);letter-spacing:0.2em;}',
      '.lp-wallet-icons{font-size:1.2rem;opacity:0.7;letter-spacing:-4px;}',
      '.lp-subscribe-title{font-family:\'Syne\',sans-serif;font-size:1.05rem;font-weight:800;margin-bottom:6px;position:relative;}',
      '.lp-subscribe-sub{font-size:0.72rem;color:rgba(240,236,224,0.45);margin-bottom:16px;position:relative;line-height:1.6;}',
      '.lp-subscribe-form{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;position:relative;}',
      '.lp-subscribe-input{padding:12px 14px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:10px;color:#f0ece0;font-family:\'DM Mono\',monospace;font-size:0.78rem;outline:none;}',
      '.lp-subscribe-input::placeholder{color:rgba(240,236,224,0.25);}',
      '.lp-subscribe-btn{padding:12px;border:none;border-radius:10px;color:#fff;font-family:\'Syne\',sans-serif;font-size:0.85rem;font-weight:700;cursor:pointer;}',
      '.lp-wallet-ctas{display:flex;flex-direction:column;gap:7px;position:relative;}',
      '.lp-wallet-btn{padding:11px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:9px;color:rgba(240,236,224,0.55);font-family:\'DM Mono\',monospace;font-size:0.7rem;cursor:pointer;width:100%;transition:background 0.15s;}',
      '.lp-wallet-btn:hover{background:rgba(255,255,255,0.09);}',
      // Footer
      '.lp-footer{padding:24px 20px;border-top:0.5px solid rgba(255,255,255,0.07);text-align:center;}',
      '.lp-footer-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;}',
      '.lp-footer-logo{width:28px;height:28px;border-radius:7px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-family:\'Syne\',sans-serif;font-weight:800;font-size:0.85rem;}',
      '.lp-footer-name{font-family:\'Syne\',sans-serif;font-size:0.82rem;font-weight:700;}',
      '.lp-footer-url{font-size:0.6rem;color:rgba(240,236,224,0.3);}',
      '.lp-footer-powered{font-size:0.6rem;color:rgba(240,236,224,0.2);}',
      '.lp-footer-powered a{text-decoration:none;}',
    ].join('\n');
  }

  return { generate:generate, makeSlug:makeSlug };
})();
