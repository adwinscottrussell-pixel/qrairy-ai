(function(){
  var PUBLISH_PATH  = 'dashboard.html?publish=1';
  var FREE_PATH     = 'dashboard.html?create=static';
  var EDITOR_PATH   = 'editor.html';
  var UPGRADE_PATH  = 'pricing.html';
  var ASSETS_PATH   = 'editor.html?mode=assets';

  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}

  var S = { qrType:null, selectedUseCase:null, generatedTheme:null, progress:0 };

  // ── SVG assets ────────────────────────────────────
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
    { id:'restaurant', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6h4M21 22H3"/></svg>', title:'Restaurant', sub:'Menus, promos & reservations' },
    { id:'ecommerce',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>', title:'Ecommerce', sub:'Products, offers & sales' },
    { id:'realestate', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', title:'Real Estate', sub:'Listings, viewings & leads' },
    { id:'social',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 2H7a5 5 0 00-5 5v10a5 5 0 005 5h10a5 5 0 005-5V7a5 5 0 00-5-5z"/><circle cx="12" cy="12" r="3"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>', title:'Social Media', sub:'Bio link & follower growth' },
    { id:'leadgen',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>', title:'Lead Generation', sub:'Capture & qualify leads' },
    { id:'gym',        icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"/></svg>', title:'Gym / Fitness', sub:'Memberships & classes' },
    { id:'bizcard',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10h.01M2 10h2M16 10h4M8 14h8"/></svg>', title:'Business Card', sub:'Smart contact sharing' },
    { id:'event',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', title:'Event', sub:'Tickets & RSVP' },
    { id:'ai-support', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3" stroke-linecap="round"/></svg>', title:'AI Support', sub:'24/7 AI customer chat' },
    { id:'portfolio',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', title:'Portfolio', sub:'Showcase your work' },
    { id:'packaging',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', title:'Product / Packaging', sub:'Connect products digitally' },
  ];

  // ── Landing page kits ──────────────────────────────
  var LP_KITS = {
    restaurant: {
      label:'Restaurant', emoji:'🍽', accent:'#e8a020', bg:'#0f0a04',
      headline:'Welcome to Our Restaurant', tagline:'Authentic flavours, unforgettable experiences',
      cta:'Reserve Your Table', cta2:'View Full Menu',
      convGoal:'Table reservations & menu views',
      sections:[
        { icon:'🖼', name:'Hero Banner',        desc:'Full-width photo with headline & CTA' },
        { icon:'📋', name:'Digital Menu',       desc:'AI-generated menu sections' },
        { icon:'📅', name:'Reserve a Table',    desc:'One-tap booking CTA' },
        { icon:'💬', name:'WhatsApp CTA',       desc:'Instant message button' },
        { icon:'🤖', name:'AI Food Assistant',  desc:'Chat about dishes & allergens' },
        { icon:'⭐', name:'Reviews',            desc:'Google reviews widget' },
        { icon:'📍', name:'Map & Hours',        desc:'Location & opening times' },
        { icon:'🎁', name:'Promo Section',      desc:'Current offers & loyalty' },
      ]
    },
    ecommerce: {
      label:'Ecommerce', emoji:'🛒', accent:'#ff5a1f', bg:'#0a0a0a',
      headline:'Shop the Collection', tagline:'Premium products, exclusive deals, fast delivery',
      cta:'Shop Now', cta2:'View Offers',
      convGoal:'Product sales & basket adds',
      sections:[
        { icon:'🖼', name:'Product Hero',        desc:'Hero image with buy CTA' },
        { icon:'💰', name:'Discount Banner',     desc:'Active offer with countdown' },
        { icon:'🛍', name:'Product Carousel',    desc:'Top products with prices' },
        { icon:'⭐', name:'Reviews',             desc:'Social proof section' },
        { icon:'🤖', name:'AI Shopping Asst.',  desc:'Chat to find products' },
        { icon:'📦', name:'Delivery Info',       desc:'Shipping & returns' },
        { icon:'🔥', name:'Flash Sale',          desc:'Limited time urgency block' },
        { icon:'📲', name:'App Download',        desc:'Mobile app CTA' },
      ]
    },
    realestate: {
      label:'Real Estate', emoji:'🏠', accent:'#ff5a1f', bg:'#060810',
      headline:'Your Dream Property Awaits', tagline:'Discover exceptional homes in prime locations',
      cta:'Schedule a Viewing', cta2:'View Gallery',
      convGoal:'Viewing bookings & lead capture',
      sections:[
        { icon:'🖼', name:'Property Hero',       desc:'Gallery slideshow with key facts' },
        { icon:'📅', name:'Book a Viewing',      desc:'Calendar booking CTA' },
        { icon:'📋', name:'Property Details',    desc:'Beds, baths, size, price' },
        { icon:'🗺', name:'Neighbourhood Map',   desc:'Local amenities & transport' },
        { icon:'🤖', name:'AI Property Asst.',  desc:'Answer questions 24/7' },
        { icon:'📸', name:'Photo Gallery',       desc:'Full property gallery' },
        { icon:'💰', name:'Mortgage Guide',      desc:'Affordability calculator' },
        { icon:'📞', name:'Agent Contact',       desc:'Direct call & message' },
      ]
    },
    social: {
      label:'Social Media', emoji:'📱', accent:'#ff5a1f', bg:'#0a0a0a',
      headline:'Follow for Exclusive Content', tagline:'Behind-the-scenes, giveaways & early access',
      cta:'Follow Now', cta2:'Latest Content',
      convGoal:'Follower growth & engagement',
      sections:[
        { icon:'🖼', name:'Profile Hero',        desc:'Brand photo & bio' },
        { icon:'🔗', name:'Link in Bio',         desc:'All links in one place' },
        { icon:'📸', name:'Latest Posts',        desc:'Instagram feed embed' },
        { icon:'🎁', name:'Giveaway CTA',        desc:'Active contest section' },
        { icon:'🤖', name:'AI Chat',             desc:'Answer DMs automatically' },
        { icon:'🎵', name:'TikTok Feed',         desc:'Latest videos' },
        { icon:'📧', name:'Newsletter CTA',      desc:'Email list growth' },
        { icon:'💼', name:'Collab Enquiry',      desc:'Brand partnership form' },
      ]
    },
    leadgen: {
      label:'Lead Generation', emoji:'🎯', accent:'#ff5a1f', bg:'#0a0808',
      headline:'Get Your Free Consultation', tagline:'Limited slots available — book yours today',
      cta:'Book Free Session', cta2:'See How It Works',
      convGoal:'Lead form submissions',
      sections:[
        { icon:'🎯', name:'Offer Hero',          desc:'Bold headline + CTA above fold' },
        { icon:'📋', name:'Lead Capture Form',   desc:'Name, email, phone' },
        { icon:'✅', name:'Social Proof',        desc:'Testimonials & logos' },
        { icon:'📦', name:'What You Get',        desc:'Value proposition bullets' },
        { icon:'⏰', name:'Urgency Block',       desc:'Limited spots countdown' },
        { icon:'🤖', name:'AI Qualifier',        desc:'Chat to pre-qualify leads' },
        { icon:'📞', name:'Call CTA',            desc:'Direct phone button' },
        { icon:'🎁', name:'Bonus Offer',         desc:'Extra incentive section' },
      ]
    },
    gym: {
      label:'Gym / Fitness', emoji:'💪', accent:'#ff5a1f', bg:'#080808',
      headline:'Start Your Transformation', tagline:'Expert coaching, proven results, no excuses',
      cta:'Claim Free Trial', cta2:'View Classes',
      convGoal:'Free trial sign-ups & memberships',
      sections:[
        { icon:'🏋', name:'Hero Banner',         desc:'Bold transformation headline' },
        { icon:'🆓', name:'Free Trial CTA',      desc:'No-commitment offer' },
        { icon:'📅', name:'Class Timetable',     desc:'Weekly schedule' },
        { icon:'👤', name:'Trainer Profiles',    desc:'Meet your coaches' },
        { icon:'📸', name:'Results Gallery',     desc:'Before & after transformations' },
        { icon:'🤖', name:'AI Fitness Asst.',   desc:'Workout & nutrition advice' },
        { icon:'💳', name:'Membership Plans',    desc:'Pricing comparison' },
        { icon:'⭐', name:'Member Reviews',      desc:'Success story testimonials' },
      ]
    },
    bizcard: {
      label:'Business Card', emoji:'💼', accent:'#ff5a1f', bg:'#0a0a0a',
      headline:'Let\'s Connect', tagline:'Professional. Trusted. Ready to help.',
      cta:'Save My Contact', cta2:'Book a Call',
      convGoal:'Contact saves & meeting bookings',
      sections:[
        { icon:'👤', name:'Profile Hero',        desc:'Photo, name & title' },
        { icon:'📇', name:'Digital vCard',       desc:'One-tap contact save' },
        { icon:'🔗', name:'Social Links',        desc:'LinkedIn, Twitter, etc.' },
        { icon:'🗓', name:'Book a Meeting',       desc:'Calendly-style booking' },
        { icon:'🤖', name:'AI Assistant',        desc:'Answer intro questions' },
        { icon:'💼', name:'Services',            desc:'What you offer' },
        { icon:'⭐', name:'Testimonials',        desc:'Client reviews' },
        { icon:'📧', name:'Contact Form',        desc:'Direct message form' },
      ]
    },
    event: {
      label:'Event', emoji:'🎵', accent:'#7c3aed', bg:'#05082e',
      headline:'Don\'t Miss Out', tagline:'An experience you\'ll never forget',
      cta:'Get Tickets', cta2:'View Lineup',
      convGoal:'Ticket sales & RSVPs',
      sections:[
        { icon:'🎵', name:'Event Hero',          desc:'Date, venue, headline act' },
        { icon:'🎟', name:'Buy Tickets',         desc:'Ticket tiers & checkout' },
        { icon:'📋', name:'Full Lineup',         desc:'Artist / speaker schedule' },
        { icon:'📍', name:'Venue & Directions',  desc:'Map & travel info' },
        { icon:'🤖', name:'AI Event Asst.',     desc:'Answer attendee questions' },
        { icon:'📸', name:'Gallery',             desc:'Previous event highlights' },
        { icon:'📧', name:'RSVP / Waitlist',     desc:'Email capture for updates' },
        { icon:'🎁', name:'VIP Packages',        desc:'Upsell premium experience' },
      ]
    },
    'ai-support': {
      label:'AI Support', emoji:'🤖', accent:'#ff5a1f', bg:'#080b10',
      headline:'Instant Support, 24/7', tagline:'Scan to chat with our AI — answers in seconds',
      cta:'Chat Now', cta2:'Browse FAQs',
      convGoal:'Support deflection & satisfaction',
      sections:[
        { icon:'🤖', name:'AI Chat Widget',      desc:'Full-screen AI assistant' },
        { icon:'❓', name:'FAQ Section',          desc:'Top questions auto-answered' },
        { icon:'📋', name:'Knowledge Base',      desc:'Searchable help articles' },
        { icon:'🔗', name:'Quick Links',          desc:'Most-visited pages' },
        { icon:'📞', name:'Escalation CTA',       desc:'Talk to a human option' },
        { icon:'⭐', name:'CSAT Widget',          desc:'Satisfaction rating' },
        { icon:'📧', name:'Ticket Form',          desc:'Submit a support request' },
        { icon:'📊', name:'Status Page',          desc:'Live system status' },
      ]
    },
    portfolio: {
      label:'Portfolio', emoji:'🎨', accent:'#ff5a1f', bg:'#0a0a0a',
      headline:'Creative Work That Converts', tagline:'Strategy + design + results',
      cta:'View My Work', cta2:'Get in Touch',
      convGoal:'Enquiries & project bookings',
      sections:[
        { icon:'🖼', name:'Portfolio Hero',       desc:'Name, title & best work' },
        { icon:'💼', name:'Featured Projects',    desc:'Top 3 case studies' },
        { icon:'🛠', name:'Skills & Services',   desc:'What you offer' },
        { icon:'⭐', name:'Client Reviews',       desc:'Testimonial carousel' },
        { icon:'🤖', name:'AI Intro Asst.',      desc:'Answer project questions' },
        { icon:'📧', name:'Contact Form',         desc:'Project enquiry form' },
        { icon:'💰', name:'Pricing Guide',        desc:'Starting rates' },
        { icon:'📅', name:'Book a Discovery Call',desc:'Calendar booking' },
      ]
    },
    packaging: {
      label:'Product / Packaging', emoji:'📦', accent:'#ff5a1f', bg:'#111111',
      headline:'Scan to Discover More', tagline:'Your product, now with a digital soul',
      cta:'Explore Product', cta2:'Reorder Now',
      convGoal:'Repeat purchases & brand engagement',
      sections:[
        { icon:'✨', name:'Brand Hero',           desc:'Product story & origin' },
        { icon:'📖', name:'Usage Guide',          desc:'How-to instructions' },
        { icon:'🌿', name:'Ingredients / Materials',desc:'Transparency section' },
        { icon:'⭐', name:'Reviews',              desc:'Customer ratings' },
        { icon:'🤖', name:'AI Product Asst.',    desc:'Answer product questions' },
        { icon:'🔄', name:'Reorder CTA',          desc:'One-tap repurchase' },
        { icon:'🎁', name:'Loyalty Reward',       desc:'Scan-to-earn points' },
        { icon:'📲', name:'Social Share',          desc:'UGC encouragement' },
      ]
    },
  };

  var LOADING_STEPS = [
    'Analysing your business type',
    'Generating QR experience',
    'Creating landing page structure',
    'Optimising for mobile',
    'Applying branding & colours',
    'Preparing smart content',
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
  function step1HTML(){
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
          '<p class="qr-card-desc">A fast, free QR that links directly to any URL — website, PDF, menu, social page or contact info.</p>'+
          '<ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Custom colours',false)+fi('No account needed',false)+'</ul>'+
          '<button class="qr-btn-free" id="qr-free">Create Free QR</button>'+
        '</div>'+
        '<div class="qr-card qr-card-premium">'+
          '<div class="qr-card-glow"></div>'+
          '<span class="qr-badge-pro">&#10022; Recommended</span>'+
          '<div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div>'+
          '<div class="qr-card-title">AI Smart Landing Page</div>'+
          '<p class="qr-card-desc">AI builds a complete mobile landing page behind your QR — with your content, CTAs, AI chat, and analytics built in.</p>'+
          '<ul class="qr-feature-list">'+fi('AI-generated landing page',true)+fi('Mobile-first layout',true)+fi('AI chat assistant',true)+fi('QR + analytics',true)+fi('Push notifications',true)+fi('Editable anytime',true)+'</ul>'+
          '<button class="qr-btn-premium" id="qr-ai">&#10022; Build AI Landing Page</button>'+
        '</div>'+
      '</div>'+
      '<p class="qr-modal-footer">You can always upgrade later from <strong>Settings &rarr; Billing</strong></p>'+
    '</div>';
  }

  // ── Step 2 ────────────────────────────────────────
  function step2HTML(){
    var cards=USE_CASES.map(function(uc,i){
      return '<button class="qr-uc-card" data-uc="'+uc.id+'" style="animation-delay:'+(i*30)+'ms">'+
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
        '<h1 class="qr-modal-title">What\'s your primary goal?</h1>'+
        '<p class="qr-modal-subtitle">AI will personalise your landing page for your industry</p>'+
      '</div>'+
      '<div class="qr-uc-grid">'+cards+'</div>'+
      '<div class="qr-step2-footer">'+
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
        '<button class="qr-btn-continue" id="qr-continue" disabled>Generate My Page &rarr;</button>'+
      '</div>'+
    '</div>';
  }

  // ── Step 3: AI Loading ─────────────────────────────
  function step3HTML(){
    var kit=LP_KITS[S.selectedUseCase]||{label:'Your Page',emoji:'✦'};
    var steps=LOADING_STEPS.map(function(t,i){
      return '<div class="qr-ls-step" id="qr-ls-'+i+'">'+
        '<span class="qr-ls-icon">&#10003;</span>'+
        '<span class="qr-ls-text">'+t+'</span>'+
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
        '<div class="qr-s3-kit-label">'+kit.emoji+' '+kit.label+' Landing Page</div>'+
        '<h2 class="qr-s3-title">Generating your AI experience\u2026</h2>'+
        '<div class="qr-ls-steps">'+steps+'</div>'+
        '<div class="qr-s3-prog-wrap">'+
          '<div class="qr-s3-prog-track"><div class="qr-s3-prog-fill" id="qr-s3-fill"></div></div>'+
          '<span class="qr-s3-pct" id="qr-s3-pct">0%</span>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  // ── Step 4: AI Landing Page Preview ───────────────
  function step4HTML(){
    var kit=LP_KITS[S.selectedUseCase]||LP_KITS['restaurant'];
    S.generatedTheme=kit.label;

    // Mobile phone mockup with landing page sections inside
    var sectionsPreview=kit.sections.slice(0,5).map(function(sec,i){
      return '<div class="qr-phone-section" style="animation-delay:'+(i*80)+'ms">'+
        '<div class="qr-phone-sec-icon">'+sec.icon+'</div>'+
        '<div class="qr-phone-sec-info">'+
          '<div class="qr-phone-sec-name">'+sec.name+'</div>'+
          '<div class="qr-phone-sec-desc">'+sec.desc+'</div>'+
        '</div>'+
        '<div class="qr-phone-sec-live"></div>'+
      '</div>';
    }).join('');

    // Right panel sections list (all 8)
    var allSections=kit.sections.map(function(sec,i){
      return '<div class="qr-pw-section-item" style="animation-delay:'+(i*50)+'ms">'+
        '<span class="qr-pw-section-dot" style="background:'+kit.accent+'"></span>'+
        '<span class="qr-pw-section-name">'+sec.icon+' '+sec.name+'</span>'+
        '<span class="qr-pw-section-desc">'+sec.desc+'</span>'+
      '</div>';
    }).join('');

    var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=80x80&data='+encodeURIComponent('https://qraivy.com/preview')+'&color=ffffff&bgcolor=111111';

    return '<div class="qr-modal qr-preview-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5)+

      // Header
      '<div class="qr-pw-header">'+
        '<div>'+
          '<div class="qr-pw-ai-badge">&#10022; AI Generated</div>'+
          '<h2 class="qr-pw-title">Your landing page is ready</h2>'+
          '<p class="qr-pw-subtitle">Preview your AI-built page, then publish or customise</p>'+
        '</div>'+
        '<button class="qr-back-btn" id="qr-back" style="flex-shrink:0;margin-top:4px">&larr; Back</button>'+
      '</div>'+

      // Body: phone mockup + right panel
      '<div class="qr-pw-body">'+

        // LEFT: Mobile phone mockup
        '<div class="qr-phone-wrap">'+
          '<div class="qr-phone-frame">'+
            '<div class="qr-phone-notch"></div>'+
            '<div class="qr-phone-screen" style="background:'+kit.bg+'">'+
              // Hero
              '<div class="qr-phone-hero" style="background:linear-gradient(160deg,'+kit.accent+'22,'+kit.bg+' 70%)">'+
                '<div class="qr-phone-hero-badge">'+kit.emoji+' '+kit.label+'</div>'+
                '<div class="qr-phone-hero-title">'+kit.headline+'</div>'+
                '<div class="qr-phone-hero-sub">'+kit.tagline+'</div>'+
                '<button class="qr-phone-cta-btn" style="background:'+kit.accent+'">'+kit.cta+' &rarr;</button>'+
              '</div>'+
              // Sections preview
              '<div class="qr-phone-sections">'+sectionsPreview+'</div>'+
              // QR footer
              '<div class="qr-phone-footer">'+
                '<img src="'+qrSrc+'" class="qr-phone-qr" onerror="this.style.background=\'#333\'" />'+
                '<div>'+
                  '<div class="qr-phone-footer-label">Your QR Code</div>'+
                  '<div class="qr-phone-footer-sub">qraivy.com/your-page</div>'+
                '</div>'+
              '</div>'+
            '</div>'+
          '</div>'+
          // "Live" badge
          '<div class="qr-phone-live-badge">&#9679; Ready to publish</div>'+
        '</div>'+

        // RIGHT: AI summary
        '<div class="qr-pw-summary">'+
          '<div class="qr-pw-meta-grid">'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">USE CASE</span><span class="qr-pw-meta-val">'+kit.label+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">CONVERSION GOAL</span><span class="qr-pw-meta-val">'+kit.convGoal+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">PRIMARY CTA</span><span class="qr-pw-meta-val" style="color:'+kit.accent+'">'+kit.cta+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">SECONDARY CTA</span><span class="qr-pw-meta-val">'+kit.cta2+'</span></div>'+
          '</div>'+
          '<div class="qr-pw-sections-label">Generated Sections ('+kit.sections.length+')</div>'+
          '<div class="qr-pw-sections">'+allSections+'</div>'+
        '</div>'+
      '</div>'+

      // Action bar
      '<div class="qr-pw-actions">'+
        '<button class="qr-pw-btn-ghost" id="qr-regenerate">&#8635; Regenerate</button>'+
        '<button class="qr-pw-btn-secondary" id="qr-customize">&#9998; Customise Page</button>'+
        '<div style="flex:1"></div>'+
        '<button class="qr-pw-btn-assets" id="qr-assets">&#9881; Marketing Assets</button>'+
        '<button class="qr-pw-btn-primary" id="qr-publish">&#9654; Publish Landing Page</button>'+
      '</div>'+
    '</div>';
  }

  // ── Upgrade screen ────────────────────────────────
  function upgradeHTML(){
    return '<div class="qr-modal qr-modal-wide"><button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5)+
      '<p class="qr-upgrade-eyebrow">ONE STEP AWAY</p>'+
      '<h2 class="qr-upgrade-title">Unlock AI Smart Pages</h2>'+
      '<p class="qr-upgrade-subtitle">Upgrade to create complete AI landing page experiences connected to your QR code.</p>'+
      '<div class="qr-compare-grid">'+
        '<div class="qr-compare-col"><span class="qr-badge-free">Free</span><ul class="qr-compare-list">'+ci('Static QR codes',false,false)+ci('Direct URL links',false,false)+ci('Custom colours',false,false)+ci('Unlimited scans',false,false)+ci('AI landing pages',true,false)+ci('AI chat assistant',true,false)+ci('Mobile-first layouts',true,false)+ci('Push notifications',true,false)+ci('Analytics',true,false)+ci('Editable dashboard',true,false)+'</ul></div>'+
        '<div class="qr-compare-col qr-compare-col-pro"><div class="qr-compare-col-glow"></div><span class="qr-badge-pro">Pro &middot; Recommended</span><ul class="qr-compare-list">'+ci('Static QR codes',false,true)+ci('Direct URL links',false,true)+ci('Custom colours',false,true)+ci('Unlimited scans',false,true)+ci('AI landing pages',false,true)+ci('AI chat assistant',false,true)+ci('Mobile-first layouts',false,true)+ci('Push notifications',false,true)+ci('Analytics',false,true)+ci('Editable dashboard',false,true)+'</ul></div>'+
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
  function slideOut(el,dir,cb){
    var modal=el.querySelector('.qr-modal');
    if(!modal){cb();return;}
    var tx=dir==='back'?'28px':'-28px';
    modal.style.transition='opacity 0.18s ease,transform 0.18s ease';
    modal.style.opacity='0';modal.style.transform='translateX('+tx+') scale(0.98)';
    setTimeout(cb,190);
  }
  function render(step,u,dir){
    var el=getOrCreateOverlay();
    var hasPrev=!!el.querySelector('.qr-modal');
    function setHTML(html){el.innerHTML=html;bindStep(step,u);}
    if(hasPrev){slideOut(el,dir||'fwd',function(){setHTML(getHTML(step));});}
    else{setHTML(getHTML(step));}
  }
  function getHTML(step){
    if(step==='step1')   return step1HTML();
    if(step==='step2')   return step2HTML();
    if(step==='step3')   return step3HTML();
    if(step==='step4')   return step4HTML();
    if(step==='upgrade') return upgradeHTML();
    return step1HTML();
  }

  // ── Step 3 animation ──────────────────────────────
  function runStep3Animation(u){
    var DURATION=2800;
    var start=Date.now();
    var idx=0;
    var total=LOADING_STEPS.length;
    spawnParticles();

    var timer=setInterval(function(){
      var el=document.getElementById('qr-ls-'+idx);
      if(el) el.classList.add('qr-ls-step-active');
      idx++;
      if(idx>=total) clearInterval(timer);
    }, DURATION/(total+1));

    function tick(){
      var elapsed=Date.now()-start;
      var e=Math.round(100*(1-Math.pow(1-Math.min(elapsed/DURATION,1),2.4)));
      e=Math.min(99,e);
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill) fill.style.width=e+'%';
      if(pct)  pct.textContent=e+'%';
      if(elapsed<DURATION) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    setTimeout(function(){
      clearInterval(timer);
      for(var i=0;i<total;i++){var el=document.getElementById('qr-ls-'+i);if(el)el.classList.add('qr-ls-step-active');}
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill)fill.style.width='100%';
      if(pct)pct.textContent='100%';
      S.progress=3;
      setTimeout(function(){render('step4',u);},480);
    },DURATION);
  }

  function spawnParticles(){
    var c=document.getElementById('qr-s3-particles');
    if(!c)return;
    for(var i=0;i<16;i++){
      (function(n){
        setTimeout(function(){
          var p=document.createElement('div');
          p.style.cssText='position:absolute;bottom:0;left:'+(8+Math.random()*84)+'%;width:'+(2+Math.random()*3)+'px;height:'+(2+Math.random()*3)+'px;border-radius:50%;background:rgba(255,78,0,'+(0.3+Math.random()*0.5)+');animation:qrParticleRise '+(2.5+Math.random()*2)+'s ease-out '+(Math.random()*1)+'s both;pointer-events:none;';
          c.appendChild(p);
        },n*110);
      })(i);
    }
  }

  // ── Bind events ───────────────────────────────────
  function bindStep(step,u){
    var cb=document.getElementById('qr-close');
    if(cb) cb.onclick=function(){closeModal(u);};

    if(step==='step1'){
      document.getElementById('qr-free').onclick=function(){
        S.qrType='static';
        closeModal(u);
        window.location.href=FREE_PATH;
      };
      document.getElementById('qr-ai').onclick=function(){
        S.qrType='ai';
        render('step2',u);
      };
    }
    else if(step==='step2'){
      var cards=document.querySelectorAll('.qr-uc-card');
      var cont=document.getElementById('qr-continue');
      cards.forEach(function(card){
        card.addEventListener('click',function(){
          cards.forEach(function(c){c.classList.remove('qr-uc-card-selected');});
          card.classList.add('qr-uc-card-selected');
          S.selectedUseCase=card.getAttribute('data-uc');
          cont.disabled=false;
        });
      });
      cont.onclick=function(){if(!S.selectedUseCase)return;render('step3',u);};
      document.getElementById('qr-back').onclick=function(){render('step1',u,'back');};
    }
    else if(step==='step3'){
      setTimeout(function(){runStep3Animation(u);},80);
    }
    else if(step==='step4'){
      // PRIMARY: Publish
      document.getElementById('qr-publish').onclick=function(){
        closeModal(u);
        window.location.href=PUBLISH_PATH+'&usecase='+(S.selectedUseCase||'')+'&theme='+(S.generatedTheme||'');
      };
      // SECONDARY: Customise landing page → editor
      document.getElementById('qr-customize').onclick=function(){
        closeModal(u);
        var kit=LP_KITS[S.selectedUseCase];
        var isEditor=window.location.pathname.indexOf('editor')!==-1||document.getElementById('polotno-container')!==null;
        if(isEditor){
          if(typeof loadTemplate==='function') loadTemplate(kit?kit.templateId:'promo-flyer-dark');
          if(typeof showToast==='function') showToast('\u2726 '+(kit?kit.label:'Design')+' loaded — customise your page');
        } else {
          window.location.href=EDITOR_PATH+'?kit='+(kit?encodeURIComponent(kit.templateId):'')+'&usecase='+encodeURIComponent(S.selectedUseCase||'');
        }
      };
      // TERTIARY: Marketing assets → editor in asset mode
      document.getElementById('qr-assets').onclick=function(){
        closeModal(u);
        window.location.href=ASSETS_PATH+'&usecase='+encodeURIComponent(S.selectedUseCase||'');
      };
      // Regenerate → re-run loading
      document.getElementById('qr-regenerate').onclick=function(){render('step3',u);};
      document.getElementById('qr-back').onclick=function(){render('step2',u,'back');};
    }
    else if(step==='upgrade'){
      document.getElementById('qr-go-upgrade').onclick=function(){closeModal(u);window.location.href=UPGRADE_PATH;};
      document.getElementById('qr-cont-free').onclick=function(){closeModal(u);window.location.href=FREE_PATH;};
      document.getElementById('qr-back').onclick=function(){render('step2',u,'back');};
    }
  }

  // Handle ?kit= on editor load
  window.addEventListener('load',function(){
    var p=new URLSearchParams(window.location.search);
    var kit=p.get('kit');
    if(kit&&typeof loadTemplate==='function') setTimeout(function(){loadTemplate(kit);},500);
  });

  window.qrairyOnboarding={
    init:   function(u){if(!u||done(u))return;setTimeout(function(){render('step1',u);},450);},
    reopen: function(u){render('step1',u);}
  };
})();
