(function(){
  var PUBLISH_PATH = 'dashboard.html?publish=1';
  var FREE_PATH    = 'dashboard.html?create=static';
  var EDITOR_PATH  = 'editor.html';

  function key(u){return 'qraivy_onboarded_'+u;}
  function done(u){return !!localStorage.getItem(key(u));}
  function mark(u){localStorage.setItem(key(u),'true');}

  // ── State ─────────────────────────────────────────
  var S = {
    qrType:null, selectedUseCase:null,
    businessName:'', websiteURL:'', logo:null, brandColor:'#ff5a1f',
    generatedQR:null, progress:0
  };

  // ── SVG icons ─────────────────────────────────────
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
    restaurant: { label:'Restaurant',emoji:'🍽',accent:'#e8a020',bg:'#0f0a04',headline:'Welcome to Our Restaurant',tagline:'Authentic flavours, unforgettable experiences',cta:'Reserve Your Table',cta2:'View Full Menu',convGoal:'Table reservations & menu views',sections:[{icon:'🖼',name:'Hero Banner',desc:'Full-width photo with headline & CTA'},{icon:'📋',name:'Digital Menu',desc:'AI-generated menu sections'},{icon:'📅',name:'Reserve a Table',desc:'One-tap booking CTA'},{icon:'💬',name:'WhatsApp CTA',desc:'Instant message button'},{icon:'🤖',name:'AI Food Assistant',desc:'Chat about dishes & allergens'},{icon:'⭐',name:'Reviews',desc:'Google reviews widget'},{icon:'📍',name:'Map & Hours',desc:'Location & opening times'},{icon:'🎁',name:'Promo Section',desc:'Current offers & loyalty'}]},
    ecommerce:  { label:'Ecommerce',emoji:'🛒',accent:'#ff5a1f',bg:'#0a0a0a',headline:'Shop the Collection',tagline:'Premium products, exclusive deals, fast delivery',cta:'Shop Now',cta2:'View Offers',convGoal:'Product sales & basket adds',sections:[{icon:'🖼',name:'Product Hero',desc:'Hero image with buy CTA'},{icon:'💰',name:'Discount Banner',desc:'Active offer with countdown'},{icon:'🛍',name:'Product Carousel',desc:'Top products with prices'},{icon:'⭐',name:'Reviews',desc:'Social proof section'},{icon:'🤖',name:'AI Shopping Asst.',desc:'Chat to find products'},{icon:'📦',name:'Delivery Info',desc:'Shipping & returns'},{icon:'🔥',name:'Flash Sale',desc:'Limited time urgency block'},{icon:'📲',name:'App Download',desc:'Mobile app CTA'}]},
    realestate: { label:'Real Estate',emoji:'🏠',accent:'#ff5a1f',bg:'#060810',headline:'Your Dream Property Awaits',tagline:'Discover exceptional homes in prime locations',cta:'Schedule a Viewing',cta2:'View Gallery',convGoal:'Viewing bookings & lead capture',sections:[{icon:'🖼',name:'Property Hero',desc:'Gallery slideshow with key facts'},{icon:'📅',name:'Book a Viewing',desc:'Calendar booking CTA'},{icon:'📋',name:'Property Details',desc:'Beds, baths, size, price'},{icon:'🗺',name:'Neighbourhood Map',desc:'Local amenities & transport'},{icon:'🤖',name:'AI Property Asst.',desc:'Answer questions 24/7'},{icon:'📸',name:'Photo Gallery',desc:'Full property gallery'},{icon:'💰',name:'Mortgage Guide',desc:'Affordability calculator'},{icon:'📞',name:'Agent Contact',desc:'Direct call & message'}]},
    social:     { label:'Social Media',emoji:'📱',accent:'#ff5a1f',bg:'#0a0a0a',headline:'Follow for Exclusive Content',tagline:'Behind-the-scenes, giveaways & early access',cta:'Follow Now',cta2:'Latest Content',convGoal:'Follower growth & engagement',sections:[{icon:'🖼',name:'Profile Hero',desc:'Brand photo & bio'},{icon:'🔗',name:'Link in Bio',desc:'All links in one place'},{icon:'📸',name:'Latest Posts',desc:'Instagram feed embed'},{icon:'🎁',name:'Giveaway CTA',desc:'Active contest section'},{icon:'🤖',name:'AI Chat',desc:'Answer DMs automatically'},{icon:'🎵',name:'TikTok Feed',desc:'Latest videos'},{icon:'📧',name:'Newsletter CTA',desc:'Email list growth'},{icon:'💼',name:'Collab Enquiry',desc:'Brand partnership form'}]},
    leadgen:    { label:'Lead Generation',emoji:'🎯',accent:'#ff5a1f',bg:'#0a0808',headline:'Get Your Free Consultation',tagline:'Limited slots available — book yours today',cta:'Book Free Session',cta2:'See How It Works',convGoal:'Lead form submissions',sections:[{icon:'🎯',name:'Offer Hero',desc:'Bold headline + CTA above fold'},{icon:'📋',name:'Lead Capture Form',desc:'Name, email, phone'},{icon:'✅',name:'Social Proof',desc:'Testimonials & logos'},{icon:'📦',name:'What You Get',desc:'Value proposition bullets'},{icon:'⏰',name:'Urgency Block',desc:'Limited spots countdown'},{icon:'🤖',name:'AI Qualifier',desc:'Chat to pre-qualify leads'},{icon:'📞',name:'Call CTA',desc:'Direct phone button'},{icon:'🎁',name:'Bonus Offer',desc:'Extra incentive section'}]},
    gym:        { label:'Gym / Fitness',emoji:'💪',accent:'#ff5a1f',bg:'#080808',headline:'Start Your Transformation',tagline:'Expert coaching, proven results, no excuses',cta:'Claim Free Trial',cta2:'View Classes',convGoal:'Free trial sign-ups & memberships',sections:[{icon:'🏋',name:'Hero Banner',desc:'Bold transformation headline'},{icon:'🆓',name:'Free Trial CTA',desc:'No-commitment offer'},{icon:'📅',name:'Class Timetable',desc:'Weekly schedule'},{icon:'👤',name:'Trainer Profiles',desc:'Meet your coaches'},{icon:'📸',name:'Results Gallery',desc:'Before & after transformations'},{icon:'🤖',name:'AI Fitness Asst.',desc:'Workout & nutrition advice'},{icon:'💳',name:'Membership Plans',desc:'Pricing comparison'},{icon:'⭐',name:'Member Reviews',desc:'Success story testimonials'}]},
    bizcard:    { label:'Business Card',emoji:'💼',accent:'#ff5a1f',bg:'#0a0a0a',headline:"Let's Connect",tagline:'Professional. Trusted. Ready to help.',cta:'Save My Contact',cta2:'Book a Call',convGoal:'Contact saves & meeting bookings',sections:[{icon:'👤',name:'Profile Hero',desc:'Photo, name & title'},{icon:'📇',name:'Digital vCard',desc:'One-tap contact save'},{icon:'🔗',name:'Social Links',desc:'LinkedIn, Twitter, etc.'},{icon:'🗓',name:'Book a Meeting',desc:'Calendly-style booking'},{icon:'🤖',name:'AI Assistant',desc:'Answer intro questions'},{icon:'💼',name:'Services',desc:'What you offer'},{icon:'⭐',name:'Testimonials',desc:'Client reviews'},{icon:'📧',name:'Contact Form',desc:'Direct message form'}]},
    event:      { label:'Event',emoji:'🎵',accent:'#7c3aed',bg:'#05082e',headline:"Don't Miss Out",tagline:"An experience you'll never forget",cta:'Get Tickets',cta2:'View Lineup',convGoal:'Ticket sales & RSVPs',sections:[{icon:'🎵',name:'Event Hero',desc:'Date, venue, headline act'},{icon:'🎟',name:'Buy Tickets',desc:'Ticket tiers & checkout'},{icon:'📋',name:'Full Lineup',desc:'Artist / speaker schedule'},{icon:'📍',name:'Venue & Directions',desc:'Map & travel info'},{icon:'🤖',name:'AI Event Asst.',desc:'Answer attendee questions'},{icon:'📸',name:'Gallery',desc:'Previous event highlights'},{icon:'📧',name:'RSVP / Waitlist',desc:'Email capture for updates'},{icon:'🎁',name:'VIP Packages',desc:'Upsell premium experience'}]},
    'ai-support':{ label:'AI Support',emoji:'🤖',accent:'#ff5a1f',bg:'#080b10',headline:'Instant Support, 24/7',tagline:'Scan to chat with our AI — answers in seconds',cta:'Chat Now',cta2:'Browse FAQs',convGoal:'Support deflection & satisfaction',sections:[{icon:'🤖',name:'AI Chat Widget',desc:'Full-screen AI assistant'},{icon:'❓',name:'FAQ Section',desc:'Top questions auto-answered'},{icon:'📋',name:'Knowledge Base',desc:'Searchable help articles'},{icon:'🔗',name:'Quick Links',desc:'Most-visited pages'},{icon:'📞',name:'Escalation CTA',desc:'Talk to a human option'},{icon:'⭐',name:'CSAT Widget',desc:'Satisfaction rating'},{icon:'📧',name:'Ticket Form',desc:'Submit a support request'},{icon:'📊',name:'Status Page',desc:'Live system status'}]},
    portfolio:  { label:'Portfolio',emoji:'🎨',accent:'#ff5a1f',bg:'#0a0a0a',headline:'Creative Work That Converts',tagline:'Strategy + design + results',cta:'View My Work',cta2:'Get in Touch',convGoal:'Enquiries & project bookings',sections:[{icon:'🖼',name:'Portfolio Hero',desc:'Name, title & best work'},{icon:'💼',name:'Featured Projects',desc:'Top 3 case studies'},{icon:'🛠',name:'Skills & Services',desc:'What you offer'},{icon:'⭐',name:'Client Reviews',desc:'Testimonial carousel'},{icon:'🤖',name:'AI Intro Asst.',desc:'Answer project questions'},{icon:'📧',name:'Contact Form',desc:'Project enquiry form'},{icon:'💰',name:'Pricing Guide',desc:'Starting rates'},{icon:'📅',name:'Book Discovery Call',desc:'Calendar booking'}]},
    packaging:  { label:'Product / Packaging',emoji:'📦',accent:'#ff5a1f',bg:'#111111',headline:'Scan to Discover More',tagline:'Your product, now with a digital soul',cta:'Explore Product',cta2:'Reorder Now',convGoal:'Repeat purchases & brand engagement',sections:[{icon:'✨',name:'Brand Hero',desc:'Product story & origin'},{icon:'📖',name:'Usage Guide',desc:'How-to instructions'},{icon:'🌿',name:'Ingredients',desc:'Transparency section'},{icon:'⭐',name:'Reviews',desc:'Customer ratings'},{icon:'🤖',name:'AI Product Asst.',desc:'Answer product questions'},{icon:'🔄',name:'Reorder CTA',desc:'One-tap repurchase'},{icon:'🎁',name:'Loyalty Reward',desc:'Scan-to-earn points'},{icon:'📲',name:'Social Share',desc:'UGC encouragement'}]},
  };

  // ── Progress bar ──────────────────────────────────
  function progressBar(step, total, label) {
    var pct=Math.round((step/total)*100);
    var dots='';
    for(var i=1;i<=total;i++) dots+='<span class="qr-prog-dot'+(i<=step?' qr-prog-dot-active':'')+'"></span>';
    return '<div class="qr-progress-wrap">'+
      '<div class="qr-progress-bar-track"><div class="qr-progress-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="qr-progress-meta">'+
        '<span class="qr-progress-label">Step '+step+' of '+total+(label?' &mdash; '+label:'')+'</span>'+
        '<div class="qr-prog-dots">'+dots+'</div>'+
      '</div>'+
    '</div>';
  }

  // ══════════════════════════════════════════════════
  // STEP 1 — QR TYPE
  // ══════════════════════════════════════════════════
  function step1HTML(){
    return '<div class="qr-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(1,5,'QR Type')+
      '<div class="qr-modal-header"><div class="qr-logo-mark">Q</div>'+
      '<h1 class="qr-modal-title">Welcome to Qraivy &#128075;</h1>'+
      '<p class="qr-modal-subtitle">What would you like to create today?</p></div>'+
      '<div class="qr-card-grid">'+
        '<div class="qr-card">'+
          '<span class="qr-badge-free">Free</span>'+
          '<div class="qr-card-icon qr-card-icon-free">'+qrSVG+'</div>'+
          '<div class="qr-card-title">Static QR Code</div>'+
          '<p class="qr-card-desc">A fast, free QR that links directly to any URL.</p>'+
          '<ul class="qr-feature-list">'+fi('Unlimited scans',false)+fi('Instant generation',false)+fi('Custom colours',false)+fi('No account needed',false)+'</ul>'+
          '<button class="qr-btn-free" id="qr-free">Create Free QR</button>'+
        '</div>'+
        '<div class="qr-card qr-card-premium">'+
          '<div class="qr-card-glow"></div>'+
          '<span class="qr-badge-pro">&#10022; Recommended</span>'+
          '<div class="qr-card-icon qr-card-icon-ai">'+aiSVG+'</div>'+
          '<div class="qr-card-title">AI Smart Landing Page</div>'+
          '<p class="qr-card-desc">AI builds a complete mobile landing page behind your QR — content, CTAs, AI chat and analytics built in.</p>'+
          '<ul class="qr-feature-list">'+fi('AI-generated landing page',true)+fi('Mobile-first layout',true)+fi('AI chat assistant',true)+fi('QR + analytics',true)+fi('Push notifications',true)+fi('Editable anytime',true)+'</ul>'+
          '<button class="qr-btn-premium" id="qr-ai">&#10022; Build AI Landing Page</button>'+
        '</div>'+
      '</div>'+
      '<p class="qr-modal-footer">Upgrade anytime from <strong>Settings &rarr; Billing</strong></p>'+
    '</div>';
  }

  // ══════════════════════════════════════════════════
  // STEP 2 — USE CASE
  // ══════════════════════════════════════════════════
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
      progressBar(2,5,'Industry')+
      '<div class="qr-modal-header qr-modal-header-compact">'+
        '<h1 class="qr-modal-title">What\'s your primary goal?</h1>'+
        '<p class="qr-modal-subtitle">AI will personalise your landing page for your industry</p>'+
      '</div>'+
      '<div class="qr-uc-grid">'+cards+'</div>'+
      '<div class="qr-step2-footer">'+
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
        '<button class="qr-btn-continue" id="qr-continue" disabled>Continue &rarr;</button>'+
      '</div>'+
    '</div>';
  }

  // ══════════════════════════════════════════════════
  // STEP 3 — BUSINESS SETUP
  // ══════════════════════════════════════════════════
  function step3HTML(){
    var kit=LP_KITS[S.selectedUseCase]||{label:'Business',emoji:'✦'};
    return '<div class="qr-modal qr-setup-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(3,5,'Business Setup')+
      '<div class="qr-modal-header qr-modal-header-compact">'+
        '<h1 class="qr-modal-title">Tell us about your business</h1>'+
        '<p class="qr-modal-subtitle">Qraivy will generate a personalised AI smart landing page for your customers</p>'+
      '</div>'+
      '<div class="qr-setup-body">'+
        // Business name
        '<div class="qr-field-group">'+
          '<label class="qr-field-label" for="qr-biz-name">Business Name <span class="qr-field-required">*</span></label>'+
          '<input class="qr-field-input" id="qr-biz-name" type="text" placeholder="e.g. The Italian Kitchen" autocomplete="organization" value="'+(S.businessName||'')+'">'+
        '</div>'+
        // Website URL
        '<div class="qr-field-group">'+
          '<label class="qr-field-label" for="qr-biz-url">Website URL <span class="qr-field-required">*</span></label>'+
          '<div class="qr-input-prefix-wrap">'+
            '<span class="qr-input-prefix">https://</span>'+
            '<input class="qr-field-input qr-field-input-prefixed" id="qr-biz-url" type="text" placeholder="yourwebsite.com" autocomplete="url" value="'+(S.websiteURL||'')+'">'+
          '</div>'+
        '</div>'+
        // Logo + color row
        '<div class="qr-setup-row">'+
          // Logo upload
          '<div class="qr-field-group" style="flex:1">'+
            '<label class="qr-field-label">Logo <span class="qr-field-opt">Optional</span></label>'+
            '<label class="qr-logo-upload" id="qr-logo-label" for="qr-logo-input">'+
              '<div class="qr-logo-preview" id="qr-logo-preview">'+
                (S.logo
                  ? '<img src="'+S.logo+'" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">'
                  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>')+
              '</div>'+
              '<div class="qr-logo-upload-text">'+
                '<span class="qr-logo-upload-main">Upload logo</span>'+
                '<span class="qr-logo-upload-sub">PNG, SVG, JPG</span>'+
              '</div>'+
              '<input type="file" id="qr-logo-input" accept="image/*" style="display:none">'+
            '</label>'+
          '</div>'+
          // Brand color
          '<div class="qr-field-group" style="flex:1">'+
            '<label class="qr-field-label">Brand Colour <span class="qr-field-opt">Optional</span></label>'+
            '<div class="qr-color-wrap">'+
              '<div class="qr-color-swatch" id="qr-color-swatch" style="background:'+(S.brandColor||'#ff5a1f')+'" onclick="document.getElementById(\'qr-color-input\').click()"></div>'+
              '<input type="color" id="qr-color-input" value="'+(S.brandColor||'#ff5a1f')+'" style="display:none">'+
              '<span class="qr-color-hex" id="qr-color-hex">'+(S.brandColor||'#ff5a1f')+'</span>'+
              '<div class="qr-color-presets">'+
                ['#ff5a1f','#e8a020','#7c3aed','#0ea5e9','#22c55e','#f43f5e','#0a0a0a','#f0ece0'].map(function(c){
                  return '<div class="qr-color-preset'+(S.brandColor===c?' active':'')+'" style="background:'+c+'" data-color="'+c+'"></div>';
                }).join('')+
              '</div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        // Use case summary
        '<div class="qr-setup-summary">'+
          '<span class="qr-setup-summary-icon">'+kit.emoji+'</span>'+
          '<span class="qr-setup-summary-text">Building a <strong>'+kit.label+'</strong> landing page</span>'+
        '</div>'+
      '</div>'+
      '<div class="qr-setup-footer">'+
        '<button class="qr-back-btn" id="qr-back">&larr; Back</button>'+
        '<button class="qr-btn-continue" id="qr-continue" disabled>Generate My Page &rarr;</button>'+
      '</div>'+
    '</div>';
  }

  // ══════════════════════════════════════════════════
  // STEP 4 — QR GENERATION
  // ══════════════════════════════════════════════════
  var QR_STEPS = [
    'Building your QR experience',
    'Creating smart destination',
    'Applying business branding',
    'Preparing mobile experience',
    'Connecting AI assistant',
    'Finalising your setup',
  ];

  function step4HTML(){
    var kit=LP_KITS[S.selectedUseCase]||{label:'Your Page',emoji:'✦',accent:'#ff5a1f'};
    var bizName=S.businessName||'Your Business';
    var slug=bizName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    var shortURL='qraivy.com/'+slug;
    S._shortURL=shortURL;

    var steps=QR_STEPS.map(function(t,i){
      return '<div class="qr-ls-step" id="qr-ls-'+i+'">'+
        '<span class="qr-ls-icon">&#10003;</span>'+
        '<span class="qr-ls-text">'+t+'</span>'+
      '</div>';
    }).join('');

    return '<div class="qr-modal qr-step4-modal">'+
      '<div class="qr-s3-particles" id="qr-s3-particles"></div>'+
      '<button class="qr-close-btn" id="qr-close" style="z-index:2">&#215;</button>'+
      progressBar(4,5,'QR Generation')+
      '<div class="qr-s4-content">'+
        '<div class="qr-s4-left">'+
          // Orb
          '<div class="qr-s3-orb-wrap" style="margin-bottom:1rem">'+
            '<div class="qr-s3-ring qr-s3-ring-outer"></div>'+
            '<div class="qr-s3-ring qr-s3-ring-inner"></div>'+
            '<div class="qr-s3-orb"><div class="qr-logo-mark" style="margin:0;width:44px;height:44px;font-size:1.3rem;">Q</div></div>'+
          '</div>'+
          '<div class="qr-s3-kit-label">'+kit.emoji+' '+bizName+'</div>'+
          '<h2 class="qr-s3-title" style="font-size:1.2rem">Generating your smart QR\u2026</h2>'+
          '<div class="qr-ls-steps">'+steps+'</div>'+
          '<div class="qr-s3-prog-wrap">'+
            '<div class="qr-s3-prog-track"><div class="qr-s3-prog-fill" id="qr-s3-fill"></div></div>'+
            '<span class="qr-s3-pct" id="qr-s3-pct">0%</span>'+
          '</div>'+
        '</div>'+
        // QR preview (revealed after loading)
        '<div class="qr-s4-right" id="qr-s4-preview" style="opacity:0;transition:opacity 0.5s ease">'+
          '<div class="qr-s4-qr-card">'+
            '<div class="qr-s4-ai-badge">&#10022; AI Smart QR</div>'+
            '<div class="qr-s4-qr-frame" id="qr-s4-frame">'+
              '<div class="qr-s4-qr-loading" id="qr-s4-loading">'+
                '<div class="qr-s4-qr-shimmer"></div>'+
              '</div>'+
              '<img id="qr-s4-img" style="display:none;width:120px;height:120px;border-radius:8px;" />'+
            '</div>'+
            '<div class="qr-s4-biz-name">'+bizName+'</div>'+
            '<div class="qr-s4-url">'+shortURL+'</div>'+
            '<div class="qr-s4-lp-badge">'+kit.emoji+' '+kit.label+' Landing Page</div>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  // ══════════════════════════════════════════════════
  // STEP 5 — AI LANDING PAGE PREVIEW
  // ══════════════════════════════════════════════════
  function step5HTML(){
    var kit=LP_KITS[S.selectedUseCase]||LP_KITS['restaurant'];
    var bizName=S.businessName||'Your Business';
    var accent=S.brandColor||kit.accent;
    var bg=kit.bg;

    // Phone: hero + first 5 sections + footer
    var sectionsPreview=kit.sections.slice(0,5).map(function(sec,i){
      return '<div class="qr-phone-section" style="animation-delay:'+(i*70)+'ms">'+
        '<div class="qr-phone-sec-icon">'+sec.icon+'</div>'+
        '<div class="qr-phone-sec-info">'+
          '<div class="qr-phone-sec-name">'+sec.name+'</div>'+
          '<div class="qr-phone-sec-desc">'+sec.desc+'</div>'+
        '</div>'+
        '<div class="qr-phone-sec-live"></div>'+
      '</div>';
    }).join('');

    var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=80x80&data='+encodeURIComponent('https://'+( S._shortURL||'qraivy.com'))+'&color=ffffff&bgcolor=111111';

    // Right panel: all sections
    var allSections=kit.sections.map(function(sec,i){
      return '<div class="qr-pw-section-item" style="animation-delay:'+(i*40)+'ms">'+
        '<span class="qr-pw-section-name">'+sec.icon+' '+sec.name+'</span>'+
        '<span class="qr-pw-section-desc">'+sec.desc+'</span>'+
      '</div>';
    }).join('');

    return '<div class="qr-modal qr-preview-modal">'+
      '<button class="qr-close-btn" id="qr-close">&#215;</button>'+
      progressBar(5,5,'Preview')+

      '<div class="qr-pw-header">'+
        '<div>'+
          '<div class="qr-pw-ai-badge">&#10022; AI Generated &mdash; '+bizName+'</div>'+
          '<h2 class="qr-pw-title">Your landing page is ready</h2>'+
          '<p class="qr-pw-subtitle">Review, then publish or customise</p>'+
        '</div>'+
        '<button class="qr-back-btn" id="qr-back" style="flex-shrink:0;margin-top:4px">&larr; Back</button>'+
      '</div>'+

      '<div class="qr-pw-body">'+
        // Phone mockup
        '<div class="qr-phone-wrap">'+
          '<div class="qr-phone-frame">'+
            '<div class="qr-phone-notch"></div>'+
            '<div class="qr-phone-screen" style="background:'+bg+'">'+
              '<div class="qr-phone-hero" style="background:linear-gradient(160deg,'+accent+'22,'+bg+' 70%)">'+
                '<div class="qr-phone-hero-badge" style="color:'+accent+'">'+kit.emoji+' '+bizName+'</div>'+
                '<div class="qr-phone-hero-title">'+kit.headline+'</div>'+
                '<div class="qr-phone-hero-sub">'+kit.tagline+'</div>'+
                '<button class="qr-phone-cta-btn" style="background:'+accent+'">'+kit.cta+' &rarr;</button>'+
              '</div>'+
              '<div class="qr-phone-sections">'+sectionsPreview+'</div>'+
              '<div class="qr-phone-footer">'+
                '<img src="'+qrSrc+'" class="qr-phone-qr" />'+
                '<div>'+
                  '<div class="qr-phone-footer-label">Your Smart QR</div>'+
                  '<div class="qr-phone-footer-sub">'+(S._shortURL||'qraivy.com/your-page')+'</div>'+
                '</div>'+
              '</div>'+
            '</div>'+
          '</div>'+
          '<div class="qr-phone-live-badge">&#9679; Ready to publish</div>'+
        '</div>'+

        // Summary
        '<div class="qr-pw-summary">'+
          '<div class="qr-pw-meta-grid">'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">BUSINESS</span><span class="qr-pw-meta-val">'+bizName+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">USE CASE</span><span class="qr-pw-meta-val">'+kit.label+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">PRIMARY CTA</span><span class="qr-pw-meta-val" style="color:'+accent+'">'+kit.cta+'</span></div>'+
            '<div class="qr-pw-meta-item"><span class="qr-pw-meta-label">SMART URL</span><span class="qr-pw-meta-val">'+(S._shortURL||'qraivy.com/...')+'</span></div>'+
          '</div>'+
          '<div class="qr-pw-sections-label">Generated Sections ('+kit.sections.length+')</div>'+
          '<div class="qr-pw-sections">'+allSections+'</div>'+
        '</div>'+
      '</div>'+

      '<div class="qr-pw-actions">'+
        '<button class="qr-pw-btn-ghost" id="qr-regenerate">&#8635; Regenerate</button>'+
        '<button class="qr-pw-btn-secondary" id="qr-customize">&#9998; Customise Later</button>'+
        '<div style="flex:1"></div>'+
        '<button class="qr-pw-btn-assets" id="qr-assets">&#9881; Marketing Assets</button>'+
        '<button class="qr-pw-btn-primary" id="qr-publish">&#9654; Publish Landing Page</button>'+
      '</div>'+
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
    if(step==='step1') return step1HTML();
    if(step==='step2') return step2HTML();
    if(step==='step3') return step3HTML();
    if(step==='step4') return step4HTML();
    if(step==='step5') return step5HTML();
    return step1HTML();
  }

  // ── Step 4 animation ──────────────────────────────
  function runStep4Animation(u){
    var DURATION=2600;
    var start=Date.now();
    var idx=0; var total=QR_STEPS.length;
    spawnParticles();

    var timer=setInterval(function(){
      var el=document.getElementById('qr-ls-'+idx);
      if(el)el.classList.add('qr-ls-step-active');
      idx++;
      if(idx>=total)clearInterval(timer);
    },DURATION/(total+1));

    function tick(){
      var elapsed=Date.now()-start;
      var e=Math.round(100*(1-Math.pow(1-Math.min(elapsed/DURATION,1),2.4)));
      e=Math.min(99,e);
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill)fill.style.width=e+'%';
      if(pct)pct.textContent=e+'%';
      if(elapsed<DURATION)requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    setTimeout(function(){
      // Complete progress
      clearInterval(timer);
      for(var i=0;i<total;i++){var el=document.getElementById('qr-ls-'+i);if(el)el.classList.add('qr-ls-step-active');}
      var fill=document.getElementById('qr-s3-fill');
      var pct=document.getElementById('qr-s3-pct');
      if(fill)fill.style.width='100%';
      if(pct)pct.textContent='100%';

      // Show QR preview
      var preview=document.getElementById('qr-s4-preview');
      if(preview){
        preview.style.opacity='1';
        // Load QR image
        var slug=(S.businessName||'qraivy').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        var qrData='https://qraivy.com/'+slug;
        var qrSrc='https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='+encodeURIComponent(qrData)+'&color=ffffff&bgcolor=111111&margin=2';
        var img=document.getElementById('qr-s4-img');
        var loader=document.getElementById('qr-s4-loading');
        if(img){
          img.onload=function(){
            if(loader)loader.style.display='none';
            img.style.display='block';
          };
          img.src=qrSrc;
          S.generatedQR=qrSrc;
        }
      }

      S.progress=4;
      // Continue to step 5 after showing QR for a moment
      setTimeout(function(){render('step5',u);},1800);
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

  // ── Step 3 bind: business setup ───────────────────
  function bindStep3(u){
    var nameInput=document.getElementById('qr-biz-name');
    var urlInput=document.getElementById('qr-biz-url');
    var cont=document.getElementById('qr-continue');
    var logoInput=document.getElementById('qr-logo-input');
    var colorInput=document.getElementById('qr-color-input');
    var colorSwatch=document.getElementById('qr-color-swatch');
    var colorHex=document.getElementById('qr-color-hex');
    var logoPreview=document.getElementById('qr-logo-preview');

    function validate(){
      var name=(nameInput&&nameInput.value.trim())||'';
      var url=(urlInput&&urlInput.value.trim())||'';
      cont.disabled=!(name.length>0 && url.length>0);
    }
    if(nameInput){nameInput.addEventListener('input',function(){S.businessName=nameInput.value.trim();validate();});}
    if(urlInput){urlInput.addEventListener('input',function(){S.websiteURL=urlInput.value.trim();validate();});}
    validate();

    // Logo upload
    if(logoInput){
      logoInput.addEventListener('change',function(){
        var file=logoInput.files[0];
        if(!file)return;
        var reader=new FileReader();
        reader.onload=function(e){
          S.logo=e.target.result;
          if(logoPreview) logoPreview.innerHTML='<img src="'+S.logo+'" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">';
        };
        reader.readAsDataURL(file);
      });
    }

    // Color picker
    if(colorInput){
      colorInput.addEventListener('input',function(){
        S.brandColor=colorInput.value;
        if(colorSwatch) colorSwatch.style.background=colorInput.value;
        if(colorHex) colorHex.textContent=colorInput.value;
        document.querySelectorAll('.qr-color-preset').forEach(function(p){p.classList.remove('active');});
      });
    }

    // Color presets
    document.querySelectorAll('.qr-color-preset').forEach(function(p){
      p.addEventListener('click',function(){
        var c=p.getAttribute('data-color');
        S.brandColor=c;
        if(colorInput) colorInput.value=c;
        if(colorSwatch) colorSwatch.style.background=c;
        if(colorHex) colorHex.textContent=c;
        document.querySelectorAll('.qr-color-preset').forEach(function(x){x.classList.remove('active');});
        p.classList.add('active');
      });
    });

    cont.onclick=function(){
      S.businessName=(nameInput&&nameInput.value.trim())||'';
      S.websiteURL=(urlInput&&urlInput.value.trim())||'';
      if(!S.businessName||!S.websiteURL)return;
      render('step4',u);
    };
    document.getElementById('qr-back').onclick=function(){render('step2',u,'back');};
  }

  // ── Bind events ───────────────────────────────────
  function bindStep(step,u){
    var cb=document.getElementById('qr-close');
    if(cb)cb.onclick=function(){closeModal(u);};

    if(step==='step1'){
      document.getElementById('qr-free').onclick=function(){
        S.qrType='static';closeModal(u);window.location.href=FREE_PATH;
      };
      document.getElementById('qr-ai').onclick=function(){
        S.qrType='ai';render('step2',u);
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
        // Re-select if returning
        if(S.selectedUseCase===card.getAttribute('data-uc')) card.classList.add('qr-uc-card-selected');
      });
      if(S.selectedUseCase) cont.disabled=false;
      cont.onclick=function(){if(!S.selectedUseCase)return;render('step3',u);};
      document.getElementById('qr-back').onclick=function(){render('step1',u,'back');};
    }
    else if(step==='step3'){
      bindStep3(u);
    }
    else if(step==='step4'){
      setTimeout(function(){runStep4Animation(u);},80);
    }
    else if(step==='step5'){
      document.getElementById('qr-publish').onclick=function(){
        closeModal(u);
        window.location.href=PUBLISH_PATH+'&biz='+encodeURIComponent(S.businessName||'')+'&usecase='+encodeURIComponent(S.selectedUseCase||'');
      };
      document.getElementById('qr-customize').onclick=function(){
        closeModal(u);
        var kit=LP_KITS[S.selectedUseCase];
        var isEditor=window.location.pathname.indexOf('editor')!==-1||document.getElementById('polotno-container')!==null;
        if(isEditor){
          if(typeof loadTemplate==='function')loadTemplate(kit?kit.templateId:'promo-flyer-dark');
          if(typeof showToast==='function')showToast('\u2726 '+(kit?kit.label:'Design')+' loaded');
        } else {
          window.location.href=EDITOR_PATH+'?kit='+(kit?encodeURIComponent(kit.templateId||''):'')+'&usecase='+encodeURIComponent(S.selectedUseCase||'');
        }
      };
      document.getElementById('qr-assets').onclick=function(){
        closeModal(u);
        window.location.href=EDITOR_PATH+'?mode=assets&usecase='+encodeURIComponent(S.selectedUseCase||'');
      };
      document.getElementById('qr-regenerate').onclick=function(){render('step4',u);};
      document.getElementById('qr-back').onclick=function(){render('step3',u,'back');};
    }
  }

  // Handle ?kit= on editor load
  window.addEventListener('load',function(){
    var p=new URLSearchParams(window.location.search);
    var kit=p.get('kit');
    if(kit&&typeof loadTemplate==='function')setTimeout(function(){loadTemplate(kit);},500);
  });

  window.qrairyOnboarding={
    init:   function(u){if(!u||done(u))return;setTimeout(function(){render('step1',u);},450);},
    reopen: function(u){render('step1',u);}
  };
})();
