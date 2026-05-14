(function(){
  var FREE_PATH='dashboard.html?create=static';
  var UPGRADE_PATH='pricing.html';
  var EDITOR_PATH='editor.html';

  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}

  var onboardingState = { qrType:null, selectedUseCase:null, generatedTheme:null, onboardingProgress:0 };

  // ── SVG icons ────────────────────────────────────
  var qrSVG='<svg width="26" height="26" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="2" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="21" y="5" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="2" y="18" width="12" height="12" rx="2" stroke="rgba(240,236,224,0.6)" stroke-width="1.5" fill="none"/><rect x="5" y="21" width="6" height="6" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="18" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="18" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/><rect x="26" y="26" width="4" height="4" rx="1" fill="rgba(240,236,224,0.6)"/></svg>';
  var aiSVG='<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M16 3 L17.5 13 L28 16 L17.5 19 L16 29 L14.5 19 L4 16 L14.5 13 Z" stroke="#FF7A35" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M26 5 L26.8 8 L30 9 L26.8 10 L26 13 L25.2 10 L22 9 L25.2 8 Z" fill="#FF7A35" opacity="0.6"/></svg>';

  function chk(a){return '<span class="qr-check'+(a?' qr-check-accent':'')+'">&#10003;</span>';}
  function fi(t,a){return '<li class="qr-feature-item'+(a?' qr-feature-item-accent':'')+'">'+chk(a)+t+'</li>';}
  function ci(t,locked,pro){
    if(locked)return '<li class="qr-compare-item qr-compare-item-locked"><span style="width:14px;text-align:center;color:rgba(240,236,224,0.2);font-family:monospace">&mdash;</span>'+t+'</li>';
    return '<li class="qr-compare-item'+(pro?' qr-compare-item-pro':'')+'"><span class="qr-check'+(pro?' qr-check-accent':'')+'">&#10003;</span>'+t+'</li>';
  }

  // ── Use cases ─────────────────────────────────────
  var USE_CASES = [
    { id:'restaurant',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6h4M21 22H3"/></svg>', title:'Restaurant', sub:'Menus, promos, and customer engagement' },
    { id:'bizcard',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10h.01M2 10h2M16 10h4M8 14h8"/></svg>', title:'Business Card', sub:'Modern networking with smart contact sharing' },
    { id:'packaging',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', title:'Product Packaging', sub:'Connect physical products to digital experiences' },
    { id:'event',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', title:'Event', sub:'Tickets, schedules, and attendee engagement' },
    { id:'social',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 2H7a5 5 0 00-5 5v10a5 5 0 005 5h10a5 5 0 005-5V7a5 5 0 00-5-5z"/><circle cx="12" cy="12" r="3"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>', title:'Social Media', sub:'Grow followers and drive engagement' },
    { id:'ai-support',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3" stroke-linecap="round"/></svg>', title:'AI Customer Support', sub:'Launch AI-powered customer interactions' },
    { id:'realestate',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', title:'Real Estate', sub:'Property showcases and lead capture' },
    { id:'ecommerce',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>', title:'Ecommerce', sub:'Drive traffic to products and offers' },
    { id:'leadgen',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>', title:'Lead Generation', sub:'Capture and qualify new leads' },
    { id:'gym',         icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg>', title:'Gym / Fitness', sub:'Memberships, classes, and promotions' },
    { id:'portfolio',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', title:'Portfolio', sub:'Showcase creative or professional work' },
  ];

  // ── Starter kits ──────────────────────────────────
  var STARTER_KITS = {
    restaurant: { templateId:'restaurant-menu',   label:'Restaurant Menu',   emoji:'🍽', headline:'20% Off Your Next Order',        sub:'Scan to view our full menu & reserve your table',          cta:'View Menu & Book',       sections:['Digital Menu','Reservation CTA','Loyalty Rewards','Chef Specials'],   style:'Dark Gold',    accent:'#c8860a', bg:'#1a1208' },
    bizcard:    { templateId:'business-card',     label:'Business Card',     emoji:'💼', headline:'Connect Instantly',              sub:'Tap or scan to save contact details & connect on LinkedIn', cta:'Save My Contact',        sections:['Digital vCard','Social Links','Portfolio Preview','Book a Call'],       style:'Minimal Dark', accent:'#ff5a1f', bg:'#0a0a0a' },
    packaging:  { templateId:'promo-flyer-dark',  label:'Product Packaging', emoji:'📦', headline:'Scan for Product Info',          sub:'Get care instructions, origin story, and exclusive offers', cta:'Explore Product',        sections:['Product Story','Usage Guide','Reorder CTA','Brand Experience'],         style:'Dark Orange',  accent:'#ff5a1f', bg:'#111111' },
    event:      { templateId:'event-poster',      label:'Event Poster',      emoji:'🎵', headline:'Limited Tickets Available',      sub:'Scan to buy tickets, view lineup and get venue directions', cta:'Get Tickets Now',        sections:['Event Lineup','Ticket CTA','Venue Map','Artist Profiles'],             style:'Dark Purple',  accent:'#7c3aed', bg:'#05082e' },
    social:     { templateId:'instagram-promo',   label:'Social Post',       emoji:'📱', headline:'Follow for Daily Updates',       sub:'Exclusive content, giveaways and behind-the-scenes',       cta:'Follow Now',             sections:['Link in Bio','Latest Posts','Giveaway CTA','Collab Enquiry'],           style:'Dark Orange',  accent:'#ff5a1f', bg:'#0a0a0a' },
    'ai-support':{ templateId:'promo-flyer-dark', label:'AI Support Page',   emoji:'🤖', headline:'AI Support, 24/7',              sub:'Scan to chat with our AI assistant — instant answers',      cta:'Chat Now',               sections:['AI Chat Widget','FAQ Section','Escalation CTA','Knowledge Base'],       style:'Dark Tech',    accent:'#ff5a1f', bg:'#080b10' },
    realestate: { templateId:'promo-flyer-light', label:'Property Showcase', emoji:'🏠', headline:'Schedule a Viewing Today',       sub:'Scan to explore photos, floorplan and book your visit',    cta:'Book a Viewing',         sections:['Property Gallery','Book Viewing','Agent Contact','Mortgage Guide'],     style:'Light Minimal',accent:'#ff5a1f', bg:'#f0ece0' },
    ecommerce:  { templateId:'promo-flyer-dark',  label:'Product Promo',     emoji:'🛒', headline:'30% Off — Today Only',           sub:'Scan to shop the collection and claim your discount',       cta:'Shop the Collection',    sections:['Product Showcase','Discount Banner','Buy Now CTA','Reviews Section'],  style:'Dark Orange',  accent:'#ff5a1f', bg:'#0a0a0a' },
    leadgen:    { templateId:'qr-landing-promo',  label:'Lead Capture',      emoji:'🎯', headline:'Claim Your Free Consultation',   sub:'Scan to book your free strategy session',                  cta:'Book Free Session',      sections:['Lead Form','Social Proof','Offer Details','Urgency CTA'],             style:'Dark Minimal', accent:'#ff5a1f', bg:'#111111' },
    gym:        { templateId:'promo-flyer-dark',  label:'Fitness Promo',     emoji:'💪', headline:'Start Your Transformation',      sub:'Scan to claim your free trial and meet your trainer',       cta:'Claim Free Trial',       sections:['Transformation Gallery','Free Trial CTA','Class Timetable','Trainers'],style:'Dark Orange',  accent:'#ff5a1f', bg:'#0d0d0d' },
    portfolio:  { templateId:'business-card',     label:'Portfolio Card',    emoji:'🎨', headline:'See My Work',                   sub:'Scan to explore my portfolio and get in touch',             cta:'View Portfolio',         sections:['Featured Work','About Me','Services','Contact CTA'],                   style:'Minimal Dark', accent:'#ff5a1f', bg:'#0a0a0a' },
  };

  var LOADING_STEPS = [
    { icon:'✓', text:'Analysing your business type' },
    { icon:'✓', text:'Generating QR experience' },
    { icon:'✓', text:'Creating landing page structure' },
    { icon:'✓', text:'Optimising layout' },
    { icon:'✓', text:'Applying branding' },
    { icon:'✓', text:'Preparing smart content' },
  ];

  // ── Progress bar ──────────────────────────────────
  function progressBar(step, total) {
    var pct=Math.round((step/total)*100);
    var dots='';
    for(var i=1;i<=total;i++) dots+='<span class="qr-prog-dot'+(i<=step?' qr-prog-dot-active':'')+'"></span>';
    return '<div class="qr-progress-wrap">'+
      '<div class="qr-progress-bar-track"><div class="qr-progress-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="qr-progress-meta"><span class="qr-progress-label">Step '+step+' of '+total+'</span><div class="qr-prog-dots">'+dots+'</div></div>'+
    '</div>';
  }

  // ── Step 1 ────────────────────────────────────────
  function welcomeHTML(){
    return '<div class="qr-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(1,5)+
      '<div class="qr-modal-header"><div class="qr-logo-mark">Q</div>'+
      '<h1 class="qr-modal-title">Welcome to Qraivy &#128075;</h1>'+
      '<p class="qr-modal-subtitle">What would you like to create today?</p></div>'+
      '<div class="qr-card-grid">'+
        '<div class="qr-card">'+
          '<span class="qr-badge-free">Free Plan</span>'+
          '<div class="qr-card-icon qr-card-icon-free">'+qrSVG+'</div>'+
          '<div class="qr-card-title">Static QR Code</div>'+
          '<p class="qr-card-desc">Create a fast, free QR code that links directly to websites, PDFs, menus, social pages, or contact info.</p>'+
          '<ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Basic customization',false)+fi('No AI required',false)+'</ul>'+
          '<button class="qr-btn-free" id="qr-free">Create Free QR</button>'+
        '</div>'+
        '<div class="qr-card qr-card-premium">'+
          '<div class="qr-card-glow"></div>'+
          '<span class="qr-badge-pro">&#10022; Most Popular</span>'+
          '<div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div>'+
          '<div class="qr-card-title">AI Smart QR Experience</div>'+
          '<p class="qr-card-desc">Build AI-powered QR landing pages with voice welcome, AI chat, wallet subscriptions, and customer engagement tools.</p>'+
          '<ul class="qr-feature-list">'+fi('AI chat assistant',true)+fi('Voice welcome',true)+fi('Smart landing pages',true)+fi('Wallet pass support',true)+fi('Push notifications',true)+fi('Analytics',true)+'</ul>'+
          '<button class="qr-btn-premium" id="qr-upgrade">&#10022; Upgrade &amp; Build AI QR</button>'+
        '</div>'+
      '</div>'+
      '<p class="qr-modal-footer">You can always change your plan later from <strong>Settings &rarr; Billing</strong></p>'+
    '</div>';
  }

  // ── Step 2 ────────────────────────────────────────
  function step2HTML(){
    var cards=USE_CASES.map(function(uc,i){
      return '<button class="qr-uc-card" data-uc="'+uc.id+'" style="animation-delay:'+(i*35)+'ms">'+
        '<div class="qr-uc-check"><svg viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#FF7A35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'+
        '<div class="qr-uc-icon">'+uc.icon+'</div>'+
        '<div class="qr-uc-title">'+uc.title+'</div>'+
        '<div class="qr-uc-sub">'+uc.sub+'</div>'+
      '</button>';
    }).join('');
    return '<div class="qr-modal qr-modal-wide qr-step2-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(2,5)+
      '<div class="qr-modal-header qr-modal-header-compact">'+
        '<h1 class="qr-modal-title">What are you using your QR for?</h1>'+
        '<p class="qr-modal-subtitle">Choose your primary use case to personalise your experience</p>'+
      '</div>'+
      '<div class="qr-uc-grid">'+cards+'</div>'+
      '<div class="qr-step2-footer">'+
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
        '<button class="qr-btn-continue" id="qr-continue" disabled>Continue &rarr;</button>'+
      '</div>'+
    '</div>';
  }

  // ── Step 3: Loading ───────────────────────────────
  function step3HTML(){
    var kit=STARTER_KITS[onboardingState.selectedUseCase]||{label:'Your Workspace',emoji:'✦'};
    var steps=LOADING_STEPS.map(function(s,i){
      return '<div class="qr-ls-step" id="qr-ls-'+i+'">'+
        '<span class="qr-ls-icon">'+s.icon+'</span>'+
        '<span class="qr-ls-text">'+s.text+'</span>'+
      '</div>';
    }).join('');
    return '<div class="qr-modal qr-step3-modal">'+
      '<div class="qr-s3-particles" id="qr-s3-particles"></div>'+
      '<div class="qr-s3-content">'+
        '<div class="qr-s3-orb-wrap">'+
          '<div class="qr-s3-ring qr-s3-ring-outer"></div>'+
          '<div class="qr-s3-ring qr-s3-ring-inner"></div>'+
          '<div class="qr-s3-orb"><div class="qr-logo-mark" style="margin:0;width:44px;height:44px;font-size:1.3rem;">Q</div></div>'+
        '</div>'+
        '<div class="qr-s3-kit-label">'+kit.emoji+' '+kit.label+'</div>'+
        '<h2 class="qr-s3-title">Generating your AI experience\u2026</h2>'+
        '<div class="qr-ls-steps" id="qr-ls-steps">'+steps+'</div>'+
        '<div class="qr-s3-prog-wrap">'+
          '<div class="qr-s3-prog-track"><div class="qr-s3-prog-fill" id="qr-s3-fill"></div></div>'+
          '<span class="qr-s3-pct" id="qr-s3-pct">0%</span>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  // ── Step 4: AI Preview Workspace ──────────────────
  function step4HTML(){
    var kit=STARTER_KITS[onboardingState.selectedUseCase]||{label:'Your Design',emoji:'✦',headline:'Your Headline',sub:'Your subtitle here',cta:'Get Started',sections:['Section 1','Section 2','Section 3','Section 4'],style:'Dark',accent:'#ff5a1f',bg:'#111'};
    onboardingState.generatedTheme=kit.style;

    var qrUrl='https://qraivy.com';
    var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=160x160&data='+encodeURIComponent(qrUrl)+'&color=ffffff&bgcolor='+encodeURIComponent(kit.bg.replace('#',''));
    var isLight=kit.bg==='#f0ece0';
    var textColor=isLight?'#0a0a0a':'#f0ece0';
    var textDim=isLight?'rgba(0,0,0,0.45)':'rgba(240,236,224,0.45)';
    var surfaceBg=isLight?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.05)';

    // Left: Flyer preview
    var flyerHTML='<div class="qr-pw-flyer" style="background:'+kit.bg+';border-color:'+kit.accent+'40">'+
      // Accent bar
      '<div style="height:6px;background:'+kit.accent+';border-radius:3px 3px 0 0;margin:-1px -1px 0;"></div>'+
      // Badge
      '<div style="display:inline-flex;align-items:center;gap:5px;background:'+kit.accent+'20;border:0.5px solid '+kit.accent+'50;border-radius:99px;padding:3px 10px;font-family:JetBrains Mono,monospace;font-size:0.55rem;color:'+kit.accent+';letter-spacing:0.1em;margin-bottom:10px;">'+kit.emoji+' AI GENERATED</div>'+
      // Headline
      '<div style="font-family:Playfair Display,Georgia,serif;font-size:1.3rem;font-weight:700;color:'+textColor+';line-height:1.2;margin-bottom:6px;">'+kit.headline+'</div>'+
      // Sub
      '<div style="font-family:JetBrains Mono,monospace;font-size:0.62rem;color:'+textDim+';line-height:1.6;margin-bottom:14px;">'+kit.sub+'</div>'+
      // Image placeholder
      '<div style="width:100%;height:90px;background:'+surfaceBg+';border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:14px;">🖼</div>'+
      // QR + CTA row
      '<div style="display:flex;align-items:center;gap:10px;">'+
        '<img src="'+qrSrc+'" style="width:56px;height:56px;border-radius:6px;background:#fff;" onerror="this.style.background=\'#333\'" />'+
        '<div>'+
          '<div style="font-family:JetBrains Mono,monospace;font-size:0.55rem;color:'+textDim+';margin-bottom:4px;">SCAN TO ACCESS</div>'+
          '<div style="background:'+kit.accent+';color:#fff;font-family:JetBrains Mono,monospace;font-size:0.62rem;font-weight:700;padding:6px 12px;border-radius:6px;letter-spacing:0.05em;">'+kit.cta+' &rarr;</div>'+
        '</div>'+
      '</div>'+
      // AI badge
      '<div style="margin-top:12px;padding-top:10px;border-top:0.5px solid '+surfaceBg+';font-family:JetBrains Mono,monospace;font-size:0.5rem;color:'+textDim+';display:flex;justify-content:space-between;">'+
        '<span>&#10022; AI Generated</span><span>qraivy.com</span>'+
      '</div>'+
    '</div>';

    // Right: AI summary panel
    var sectionsHTML=kit.sections.map(function(s,i){
      return '<div class="qr-pw-section-item" style="animation-delay:'+(i*60)+'ms">'+
        '<span class="qr-pw-section-dot" style="background:'+kit.accent+'"></span>'+
        '<span>'+s+'</span>'+
      '</div>';
    }).join('');

    var summaryHTML='<div class="qr-pw-summary">'+
      '<div class="qr-pw-summary-header">'+
        '<div class="qr-pw-ai-badge">&#10022; AI Generated</div>'+
        '<h3 class="qr-pw-summary-title">Your design is ready</h3>'+
        '<p class="qr-pw-summary-sub">Tailored for <strong>'+kit.label+'</strong></p>'+
      '</div>'+
      '<div class="qr-pw-meta-grid">'+
        '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">USE CASE</span><span class="qr-pw-meta-val">'+kit.label+'</span></div>'+
        '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">DESIGN STYLE</span><span class="qr-pw-meta-val">'+kit.style+'</span></div>'+
        '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">SUGGESTED CTA</span><span class="qr-pw-meta-val" style="color:'+kit.accent+'">'+kit.cta+'</span></div>'+
        '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">QR TYPE</span><span class="qr-pw-meta-val">AI Smart QR</span></div>'+
      '</div>'+
      '<div class="qr-pw-sections-label">Generated Sections</div>'+
      '<div class="qr-pw-sections">'+sectionsHTML+'</div>'+
    '</div>';

    return '<div class="qr-modal qr-preview-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5)+
      '<div class="qr-pw-header">'+
        '<div>'+
          '<h2 class="qr-pw-title">Your AI workspace is ready</h2>'+
          '<p class="qr-pw-subtitle">Review your generated design, then open the editor to customise</p>'+
        '</div>'+
        '<button class="qr-back-btn" id="qr-back" style="flex-shrink:0">&larr; Back</button>'+
      '</div>'+
      '<div class="qr-pw-body">'+
        flyerHTML+
        summaryHTML+
      '</div>'+
      '<div class="qr-pw-actions">'+
        '<button class="qr-pw-btn-secondary" id="qr-regenerate">&#8635; Regenerate</button>'+
        '<button class="qr-pw-btn-secondary" id="qr-publish">&#10003; Publish</button>'+
        '<button class="qr-pw-btn-primary" id="qr-edit-design">&#9998; Edit Design</button>'+
      '</div>'+
    '</div>';
  }

  // ── Upgrade screen ────────────────────────────────
  function upgradeHTML(){
    return '<div class="qr-modal qr-modal-wide"><button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5)+
      '<p class="qr-upgrade-eyebrow">ONE STEP AWAY</p>'+
      '<h2 class="qr-upgrade-title">Unlock AI Smart Pages</h2>'+
      '<p class="qr-upgrade-subtitle">Upgrade to create conversational QR experiences that engage, convert, and retain.</p>'+
      '<div class="qr-compare-grid">'+
        '<div class="qr-compare-col"><span class="qr-badge-free">Free</span><ul class="qr-compare-list">'+ci('Static QR codes',false,false)+ci('Direct links',false,false)+ci('Basic customization',false,false)+ci('Unlimited scans',false,false)+ci('AI smart pages',true,false)+ci('Voice welcome',true,false)+ci('AI chat assistant',true,false)+ci('Wallet subscriptions',true,false)+ci('Push notifications',true,false)+ci('Advanced analytics',true,false)+'</ul></div>'+
        '<div class="qr-compare-col qr-compare-col-pro"><div class="qr-compare-col-glow"></div><span class="qr-badge-pro">Pro &middot; Most Popular</span><ul class="qr-compare-list">'+ci('Static QR codes',false,true)+ci('Direct links',false,true)+ci('Basic customization',false,true)+ci('Unlimited scans',false,true)+ci('AI smart pages',false,true)+ci('Voice welcome',false,true)+ci('AI chat assistant',false,true)+ci('Wallet subscriptions',false,true)+ci('Push notifications',false,true)+ci('Advanced analytics',false,true)+'</ul></div>'+
      '</div>'+
      '<div class="qr-upgrade-actions">'+
        '<button class="qr-btn-upgrade" id="qr-go-upgrade">&#10022; Upgrade Now</button>'+
        '<button class="qr-btn-secondary" id="qr-cont-free">Continue with Free QR</button>'+
      '</div>'+
      '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
    '</div>';
  }

  // ── Overlay helpers ───────────────────────────────
  function getOrCreateOverlay(){
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el){el=document.createElement('div');el.id='qr-onboarding-overlay';document.body.appendChild(el);}
    el.classList.remove('qr-hidden');el.style.opacity='1';el.style.transition='';
    return el;
  }
  function closeModal(u){
    mark(u);
    var el=document.getElementById('qr-onboarding-overlay');
    if(!el)return;
    el.style.transition='opacity 0.25s';el.style.opacity='0';
    setTimeout(function(){el.classList.add('qr-hidden');},260);
  }
  function slideOut(el,cb){
    var modal=el.querySelector('.qr-modal');
    if(!modal){cb();return;}
    modal.style.transition='opacity 0.18s ease,transform 0.18s ease';
    modal.style.opacity='0';modal.style.transform='translateX(-28px) scale(0.98)';
    setTimeout(cb,190);
  }
  function render(step,u){
    var el=getOrCreateOverlay();
    var hasPrev=!!el.querySelector('.qr-modal');
    function setHTML(html){el.innerHTML=html;bindStep(step,u);}
    if(hasPrev){slideOut(el,function(){setHTML(getHTML(step));});}
    else{setHTML(getHTML(step));}
  }
  function getHTML(step){
    if(step==='welcome') return welcomeHTML();
    if(step==='step2')   return step2HTML();
    if(step==='step3')   return step3HTML();
    if(step==='step4')   return step4HTML();
    if(step==='upgrade') return upgradeHTML();
    return welcomeHTML();
  }

  // ── Step 3 animation ──────────────────────────────
  function runStep3Animation(u){
    var DURATION=2800;
    var start=Date.now();
    var stepIdx=0;
    var stepCount=LOADING_STEPS.length;

    spawnParticles();

    var stepTimer=setInterval(function(){
      var el=document.getElementById('qr-ls-'+stepIdx);
      if(el) el.classList.add('qr-ls-step-active');
      stepIdx++;
      if(stepIdx>=stepCount) clearInterval(stepTimer);
    }, DURATION/(stepCount+1));

    function tick(){
      var elapsed=Date.now()-start;
      var eased=Math.round(100*(1-Math.pow(1-Math.min(elapsed/DURATION,1),2.4)));
      eased=Math.min(99,eased);
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill) fill.style.width=eased+'%';
      if(pct)  pct.textContent=eased+'%';
      if(elapsed<DURATION) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    setTimeout(function(){
      clearInterval(stepTimer);
      for(var i=0;i<stepCount;i++){
        var el=document.getElementById('qr-ls-'+i);
        if(el) el.classList.add('qr-ls-step-active');
      }
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill) fill.style.width='100%';
      if(pct)  pct.textContent='100%';
      onboardingState.onboardingProgress=3;
      setTimeout(function(){ render('step4',u); },500);
    }, DURATION);
  }

  function spawnParticles(){
    var c=document.getElementById('qr-s3-particles');
    if(!c)return;
    for(var i=0;i<16;i++){
      (function(idx){
        setTimeout(function(){
          var p=document.createElement('div');
          p.style.cssText='position:absolute;bottom:0;left:'+(8+Math.random()*84)+'%;width:'+(2+Math.random()*3)+'px;height:'+(2+Math.random()*3)+'px;border-radius:50%;background:rgba(255,78,0,'+(0.3+Math.random()*0.5)+');animation:qrParticleRise '+(2.5+Math.random()*2)+'s ease-out '+(Math.random()*1.2)+'s both;pointer-events:none;';
          c.appendChild(p);
        },idx*130);
      })(i);
    }
  }

  // ── Launch editor ─────────────────────────────────
  function launchEditor(u){
    closeModal(u);
    var kit=STARTER_KITS[onboardingState.selectedUseCase];
    var isEditor=window.location.pathname.indexOf('editor')!==-1||document.getElementById('polotno-container')!==null;
    if(isEditor){
      setTimeout(function(){
        if(typeof loadTemplate==='function') loadTemplate(kit?kit.templateId:'promo-flyer-dark');
        if(typeof showToast==='function') showToast('\u2726 AI workspace ready \u2014 '+(kit?kit.label:'Design')+' loaded');
      },350);
    } else {
      window.location.href=EDITOR_PATH+'?kit='+encodeURIComponent(kit?kit.templateId:'')+'&usecase='+encodeURIComponent(onboardingState.selectedUseCase||'');
    }
  }

  // ── Bind events ───────────────────────────────────
  function bindStep(step,u){
    var closeBtn=document.getElementById('qr-close');
    if(closeBtn) closeBtn.onclick=function(){closeModal(u);};

    if(step==='welcome'){
      document.getElementById('qr-free').onclick=function(){
        onboardingState.qrType='static';
        closeModal(u);
        window.location.href=FREE_PATH;
      };
      document.getElementById('qr-upgrade').onclick=function(){
        onboardingState.qrType='ai';
        render('step2',u);
      };
    }
    else if(step==='step2'){
      var cards=document.querySelectorAll('.qr-uc-card');
      var contBtn=document.getElementById('qr-continue');
      cards.forEach(function(card){
        card.addEventListener('click',function(){
          cards.forEach(function(c){c.classList.remove('qr-uc-card-selected');});
          card.classList.add('qr-uc-card-selected');
          onboardingState.selectedUseCase=card.getAttribute('data-uc');
          contBtn.disabled=false;
        });
      });
      contBtn.onclick=function(){if(!onboardingState.selectedUseCase)return;render('step3',u);};
      document.getElementById('qr-back').onclick=function(){render('welcome',u);};
    }
    else if(step==='step3'){
      setTimeout(function(){runStep3Animation(u);},80);
    }
    else if(step==='step4'){
      document.getElementById('qr-edit-design').onclick=function(){launchEditor(u);};
      document.getElementById('qr-back').onclick=function(){render('step2',u);};
      document.getElementById('qr-regenerate').onclick=function(){
        // Re-run loading then re-show preview
        render('step3',u);
      };
      document.getElementById('qr-publish').onclick=function(){
        closeModal(u);
        window.location.href=FREE_PATH;
      };
    }
    else if(step==='upgrade'){
      document.getElementById('qr-go-upgrade').onclick=function(){closeModal(u);window.location.href=UPGRADE_PATH;};
      document.getElementById('qr-cont-free').onclick=function(){closeModal(u);window.location.href=FREE_PATH;};
      document.getElementById('qr-back').onclick=function(){render('step2',u);};
    }
  }

  // Handle ?kit= param on editor.html load
  window.addEventListener('load',function(){
    var params=new URLSearchParams(window.location.search);
    var kit=params.get('kit');
    if(kit&&typeof loadTemplate==='function') setTimeout(function(){loadTemplate(kit);},500);
  });

  window.qrairyOnboarding={
    init:   function(u){if(!u||done(u))return;setTimeout(function(){render('welcome',u);},450);},
    reopen: function(u){render('welcome',u);}
  };
})();
