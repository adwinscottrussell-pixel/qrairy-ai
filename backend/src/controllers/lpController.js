const prisma = require('../prismaClient');

// ── LP content per use case ───────────────────────────────────────────────
const LP_CONTENT = {
  restaurant: {
    headline: 'Welcome to {name}',
    sub: 'Authentic flavours, unforgettable experiences. Reserve your table or browse our menu.',
    cta: 'Reserve a Table', cta2: 'View Menu',
    sections: [
      { title: 'Our Menu', items: ['Starters & Sharing Plates', 'Mains & Specials', 'Desserts', 'Drinks & Cocktails'] },
      { title: 'Opening Hours', items: ['Mon–Fri: 12:00 – 23:00', 'Saturday: 11:00 – 00:00', 'Sunday: 11:00 – 22:00'] },
      { title: 'Find Us', items: ['{website}', 'Reservations available online & by phone'] },
    ],
  },
  ecommerce: {
    headline: 'Shop {name}',
    sub: 'Premium products, exclusive deals, fast delivery. Discover our latest collection.',
    cta: 'Shop Now', cta2: 'View Offers',
    sections: [
      { title: 'Featured Products', items: ['New Arrivals', 'Best Sellers', 'Flash Sale — Limited Time', 'Gift Sets'] },
      { title: 'Why Shop With Us', items: ['Free delivery on orders over €50', 'Express 1-2 day delivery', '30-day returns', 'Secure checkout'] },
      { title: 'Our Store', items: ['{website}'] },
    ],
  },
  realestate: {
    headline: '{name} — Premium Properties',
    sub: 'Discover exceptional homes in prime locations. Schedule your private viewing today.',
    cta: 'Schedule a Viewing', cta2: 'Browse Listings',
    sections: [
      { title: 'Our Services', items: ['Residential Sales', 'Lettings & Property Management', 'Free Property Valuation', 'Investment Advice'] },
      { title: 'Why Choose Us', items: ['Expert local knowledge', 'Proven track record', 'Dedicated client support', 'Digital-first experience'] },
      { title: 'Contact', items: ['{website}'] },
    ],
  },
  gym: {
    headline: 'Transform at {name}',
    sub: 'Expert coaching, proven results, zero excuses. Claim your free trial today.',
    cta: 'Claim Free Trial', cta2: 'View Classes',
    sections: [
      { title: 'Classes', items: ['HIIT & Cardio', 'Strength & Conditioning', 'Yoga & Mindfulness', 'Boxing & Combat'] },
      { title: 'Membership Plans', items: ['Basic — Gym access + locker', 'Pro — All classes + 1 PT session', 'Elite — Unlimited PT + nutrition', 'Student — Discounted rate'] },
      { title: 'Find Us', items: ['{website}'] },
    ],
  },
  leadgen: {
    headline: 'Work with {name}',
    sub: 'Limited consultation slots available. Book your free strategy session today.',
    cta: 'Book Free Session', cta2: 'Learn More',
    sections: [
      { title: 'What You Get', items: ['60-minute strategy consultation (free)', 'Custom growth roadmap', 'Competitive analysis', 'Clear next steps — no pressure'] },
      { title: 'Who We Help', items: ['Growing SMEs & startups', 'Established businesses scaling up', 'Entrepreneurs & solopreneurs', 'Teams needing direction'] },
      { title: 'Get Started', items: ['{website}'] },
    ],
  },
  social: {
    headline: '{name}',
    sub: 'Follow for exclusive content, giveaways and behind-the-scenes access.',
    cta: 'Follow Now', cta2: 'Latest Content',
    sections: [
      { title: 'My Links', items: ['Instagram', 'TikTok', 'YouTube', 'Podcast'] },
      { title: 'Work With Me', items: ['Brand partnerships', 'Content creation & UGC', 'Affiliate & ambassador', 'Events & appearances'] },
      { title: 'Connect', items: ['{website}'] },
    ],
  },
  bizcard: {
    headline: "Hi, I'm {name}",
    sub: 'Professional. Trusted. Ready to connect. Save my contact details instantly.',
    cta: 'Save Contact', cta2: 'Book a Call',
    sections: [
      { title: 'Services', items: ['Strategy & Consulting', 'Brand Development', 'Digital Marketing', 'Partnerships & Growth'] },
      { title: 'Get in Touch', items: ['{website}', 'Response within 24hrs', 'Available worldwide'] },
    ],
  },
  event: {
    headline: '{name}',
    sub: "Don't miss out. Get your tickets before they sell out.",
    cta: 'Get Tickets', cta2: 'View Lineup',
    sections: [
      { title: 'Event Info', items: ['Doors Open: 18:00', 'Main Act: 21:00', 'Fully accessible venue', 'Food & drinks available'] },
      { title: 'Ticket Options', items: ['General Admission', 'Early Bird — Limited', 'VIP Package', 'Group Discount (6+)'] },
      { title: 'Venue', items: ['{website}'] },
    ],
  },
  'ai-support': {
    headline: '{name} Support',
    sub: 'Instant answers, 24/7. Our AI assistant is here to help.',
    cta: 'Chat Now', cta2: 'Browse FAQs',
    sections: [
      { title: 'How We Can Help', items: ['Product & service questions', 'Order tracking & returns', 'Account & billing support', 'Technical assistance'] },
      { title: 'Service Status', items: ['All systems operational', 'Average response time: < 2 min', '24/7 AI support', 'Human escalation available'] },
      { title: 'Contact', items: ['{website}'] },
    ],
  },
  portfolio: {
    headline: "{name}'s Portfolio",
    sub: "Strategy + design + results. Let's build something great together.",
    cta: 'View My Work', cta2: 'Get in Touch',
    sections: [
      { title: 'Services', items: ['Brand Identity', 'Web Design & Development', 'Campaign Strategy', 'UX/UI Design'] },
      { title: 'Experience', items: ['10+ years industry experience', 'International clients', 'Award-winning work', 'Results-driven approach'] },
      { title: 'Start a Project', items: ['{website}'] },
    ],
  },
  packaging: {
    headline: 'Welcome to {name}',
    sub: 'Scan to discover the full story behind your product.',
    cta: 'Explore Product', cta2: 'Reorder Now',
    sections: [
      { title: 'Our Promise', items: ['100% natural ingredients', 'Sustainably sourced', 'Ethically produced', 'Dermatologist tested'] },
      { title: 'How to Use', items: ['Simple daily routine', 'Suitable for all types', 'See results in 2–4 weeks', 'Money-back guarantee'] },
      { title: 'Shop Again', items: ['{website}'] },
    ],
  },
};

// ── HTML generator ────────────────────────────────────────────────────────
function renderLP(page) {
  const content = LP_CONTENT[page.useCase] || LP_CONTENT['restaurant'];
  const accent  = page.brandColor || '#ff5a1f';
  const bizName = page.businessName || 'My Business';
  const slug    = page.slug;
  const website = page.websiteUrl || 'https://qraivy.com';
  const domain  = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  function tmpl(s) {
    return (s || '').replace(/\{name\}/g, bizName).replace(/\{website\}/g, website).replace(/\{domain\}/g, domain);
  }

  const headline = tmpl(content.headline);
  const sub      = tmpl(content.sub);
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://api.qraivy.com/lp/' + slug)}&color=ffffff&bgcolor=111111&margin=2`;

  // Accent RGB for rgba usage
  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return `${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)}`;
  }
  const rgb = hexToRGB(accent);
  const accentDim    = `rgba(${rgb},0.12)`;
  const accentBorder = `rgba(${rgb},0.28)`;
  const accentGlow   = `rgba(${rgb},0.4)`;

  const sectionsHTML = content.sections.map(sec => {
    const items = (sec.items || []).map(item =>
      `<div class="lp-item"><span class="lp-dot" style="background:${accent}"></span><span>${tmpl(item)}</span></div>`
    ).join('');
    return `<section class="lp-section"><h2 class="lp-section-title">${sec.title}</h2><div class="lp-items">${items}</div></section>`;
  }).join('');

  const logoHTML = page.logoUrl
    ? `<img src="${page.logoUrl}" class="lp-logo-img" alt="${bizName}" />`
    : `<div class="lp-logo-letter" style="background:${accentDim};border-color:${accentBorder};color:${accent}">${bizName.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${bizName} — Smart Landing Page</title>
<meta name="description" content="${sub}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:#0a0a0a;color:#f0ece0;font-family:'DM Mono',monospace;max-width:480px;margin:0 auto;overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
/* Nav */
.lp-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:rgba(10,10,10,0.95);backdrop-filter:blur(16px);border-bottom:0.5px solid rgba(255,255,255,0.07)}
.lp-nav-brand{display:flex;align-items:center;gap:10px}
.lp-logo-img{width:32px;height:32px;border-radius:8px;object-fit:contain}
.lp-logo-letter{width:32px;height:32px;border-radius:8px;border:0.5px solid;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1rem;font-weight:800}
.lp-nav-name{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700}
.lp-nav-pill{display:flex;align-items:center;gap:5px;background:${accentDim};border:0.5px solid ${accentBorder};border-radius:99px;padding:4px 10px;font-size:0.58rem;color:${accent};letter-spacing:0.08em}
.lp-nav-dot{width:6px;height:6px;border-radius:50%;background:${accent};animation:lpDot 2s ease-in-out infinite}
@keyframes lpDot{0%,100%{opacity:1}50%{opacity:0.3}}
/* Hero */
.lp-hero{padding:36px 20px 28px;text-align:center;background:linear-gradient(160deg,${accentDim} 0%,transparent 55%)}
.lp-hero-eyebrow{display:inline-flex;align-items:center;gap:6px;border:0.5px solid ${accentBorder};border-radius:99px;padding:5px 14px;font-size:0.6rem;color:${accent};letter-spacing:0.1em;margin-bottom:18px}
.lp-hero-title{font-family:'Syne',sans-serif;font-size:clamp(1.7rem,6vw,2.2rem);font-weight:800;line-height:1.1;letter-spacing:-0.02em;margin-bottom:14px}
.lp-hero-sub{font-size:0.82rem;color:rgba(240,236,224,0.7);max-width:340px;margin:0 auto 28px;line-height:1.75}
.lp-hero-ctas{display:flex;flex-direction:column;gap:10px;align-items:center}
/* Buttons */
.lp-btn{display:block;width:100%;max-width:320px;padding:15px 24px;border-radius:12px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;text-align:center;cursor:pointer;border:none;transition:transform 0.15s,opacity 0.15s;letter-spacing:0.02em}
.lp-btn:active{transform:scale(0.97)}
.lp-btn-primary{color:#fff;background:${accent};box-shadow:0 0 28px ${accentGlow}}
.lp-btn-secondary{background:rgba(255,255,255,0.06);color:rgba(240,236,224,0.7);border:0.5px solid rgba(255,255,255,0.14)}
/* QR section */
.lp-qr-section{padding:0 20px 24px}
.lp-qr-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px}
.lp-qr-img{width:72px;height:72px;border-radius:8px;flex-shrink:0;background:#fff}
.lp-qr-label{font-family:'Syne',sans-serif;font-size:0.82rem;font-weight:700;margin-bottom:3px}
.lp-qr-url{font-size:0.62rem;color:rgba(240,236,224,0.55);margin-bottom:8px;word-break:break-all}
.lp-qr-badge{display:inline-flex;align-items:center;gap:5px;border:0.5px solid ${accentBorder};border-radius:99px;padding:3px 9px;font-size:0.55rem;color:${accent};background:${accentDim}}
/* Sections */
.lp-section{padding:22px 20px;border-top:0.5px solid rgba(255,255,255,0.06)}
.lp-section-title{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:14px;color:#f0ece0}
.lp-items{display:flex;flex-direction:column;gap:8px}
.lp-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:9px;font-size:0.78rem;color:rgba(240,236,224,0.7)}
.lp-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
/* AI Chat */
.lp-chat-section{padding:28px 20px;border-top:0.5px solid rgba(255,255,255,0.06)}
.lp-chat-title{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:14px}
.lp-chat-widget{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden}
.lp-chat-header{display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(255,255,255,0.03);border-bottom:0.5px solid rgba(255,255,255,0.07)}
.lp-chat-avatar{width:32px;height:32px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#fff;flex-shrink:0}
.lp-chat-hname{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700}
.lp-chat-status{display:flex;align-items:center;gap:5px;font-size:0.6rem;color:rgba(240,236,224,0.6)}
.lp-status-dot{width:5px;height:5px;border-radius:50%;background:#22c55e}
.lp-chat-msgs{min-height:80px;max-height:180px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none}
.lp-chat-msgs::-webkit-scrollbar{display:none}
.lp-msg{display:flex}
.lp-msg-ai{justify-content:flex-start}
.lp-msg-user{justify-content:flex-end}
.lp-bubble{max-width:82%;padding:9px 12px;border-radius:12px;font-size:0.75rem;line-height:1.5}
.lp-msg-ai .lp-bubble{background:rgba(255,255,255,0.05);border:0.5px solid ${accentBorder};color:rgba(240,236,224,0.7)}
.lp-msg-user .lp-bubble{background:${accentDim};border:0.5px solid ${accentBorder};color:rgba(240,236,224,0.85)}
.lp-chat-input-row{display:flex;gap:8px;padding:10px 12px;border-top:0.5px solid rgba(255,255,255,0.07)}
.lp-chat-input{flex:1;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:9px 12px;color:#f0ece0;font-family:'DM Mono',monospace;font-size:0.75rem;outline:none}
.lp-chat-input::placeholder{color:rgba(240,236,224,0.65)}
.lp-chat-send{width:36px;height:36px;border:none;border-radius:8px;background:${accent};color:#fff;cursor:pointer;font-size:0.9rem;flex-shrink:0}
/* Voice */
.lp-voice-section{padding:28px 20px;border-top:0.5px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01)}
.lp-voice-title{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:14px}
.lp-voice-player{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:8px}
.lp-voice-btn{width:40px;height:40px;border:none;border-radius:50%;background:${accent};color:#fff;cursor:pointer;font-size:0.9rem;flex-shrink:0;transition:transform 0.1s}
.lp-voice-btn:active{transform:scale(0.92)}
.lp-voice-info{flex:1}
.lp-voice-name{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700;margin-bottom:2px}
.lp-voice-sub{font-size:0.6rem;color:rgba(240,236,224,0.7)}
.lp-waveform{display:flex;align-items:center;gap:2px;height:30px}
.lp-bar{width:3px;background:rgba(255,255,255,0.15);border-radius:2px}
.lp-waveform-active .lp-bar{background:${accent};animation:lpWave 0.8s ease-in-out infinite alternate}
@keyframes lpWave{0%{transform:scaleY(0.3)}100%{transform:scaleY(1)}}
.lp-voice-note{font-size:0.58rem;color:rgba(240,236,224,0.6);text-align:center}
/* Subscribe */
.lp-subscribe-section{padding:28px 20px 32px;border-top:0.5px solid rgba(255,255,255,0.06)}
.lp-subscribe-card{position:relative;overflow:hidden;background:rgba(255,255,255,0.03);border:0.5px solid ${accentBorder};border-radius:18px;padding:24px 20px}
.lp-sub-glow{position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,${accentDim},transparent 70%);pointer-events:none;border-radius:50%}
.lp-wallet-preview{display:flex;justify-content:center;margin-bottom:20px;position:relative}
.lp-wallet-card{width:240px;border-radius:14px;padding:16px 20px;background:linear-gradient(135deg,${accent},${accent}aa)}
.lp-wallet-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.lp-wallet-brand{font-family:'Syne',sans-serif;font-size:0.85rem;font-weight:800;color:#fff}
.lp-wallet-type{font-size:0.55rem;color:rgba(255,255,255,0.6);letter-spacing:0.1em}
.lp-wallet-bottom{display:flex;justify-content:space-between;align-items:center}
.lp-wallet-id{font-size:0.52rem;color:rgba(255,255,255,0.5);letter-spacing:0.2em}
.lp-wallet-circles{font-size:1.2rem;opacity:0.6;letter-spacing:-4px}
.lp-sub-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:800;margin-bottom:6px;position:relative}
.lp-sub-text{font-size:0.72rem;color:rgba(240,236,224,0.65);margin-bottom:16px;line-height:1.65;position:relative}
.lp-sub-form{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;position:relative}
.lp-sub-input{padding:12px 14px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:10px;color:#f0ece0;font-family:'DM Mono',monospace;font-size:0.78rem;outline:none}
.lp-sub-input::placeholder{color:rgba(240,236,224,0.65)}
.lp-sub-btn{padding:12px;border:none;border-radius:10px;background:${accent};color:#fff;font-family:'Syne',sans-serif;font-size:0.85rem;font-weight:700;cursor:pointer}
.lp-wallet-btns{display:flex;flex-direction:column;gap:7px;position:relative}
.lp-wallet-btn{padding:11px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:9px;color:rgba(240,236,224,0.7);font-family:'DM Mono',monospace;font-size:0.68rem;cursor:pointer;width:100%}

/* Chat collapsed state */
.lp-chat-collapsed{display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;cursor:pointer;transition:border-color 0.2s,background 0.2s}
.lp-chat-collapsed:hover{border-color:rgba(255,78,0,0.3);background:rgba(255,78,0,0.04)}
.lp-chat-collapsed-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;box-shadow:0 0 8px rgba(34,197,94,0.6);animation:lpDot 2s ease-in-out infinite}
.lp-chat-collapsed-label{font-family:'Syne',sans-serif;font-size:0.82rem;font-weight:700;flex:1}
.lp-chat-collapsed-hint{font-size:0.6rem;color:rgba(240,236,224,0.7);white-space:nowrap}
/* Typing dots */
.lp-typing-dots{display:inline-flex;gap:4px;align-items:center;padding:2px 0}
.lp-typing-dots span{width:6px;height:6px;border-radius:50%;background:rgba(240,236,224,0.6);animation:lpTypeDot 1.2s ease-in-out infinite}
.lp-typing-dots span:nth-child(2){animation-delay:0.2s}
.lp-typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes lpTypeDot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
/* CTA section below subscribe */
.lp-cta-section{padding:0 20px 28px;display:flex;flex-direction:column;align-items:center;gap:0}

/* Footer */
.lp-footer{padding:24px 20px;border-top:0.5px solid rgba(255,255,255,0.06);text-align:center}
.lp-footer-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}
.lp-footer-Q{width:26px;height:26px;border-radius:6px;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:0.8rem}
.lp-footer-name{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700}
.lp-footer-url{font-size:0.58rem;color:rgba(240,236,224,0.65);margin-bottom:8px;word-break:break-all}
.lp-footer-powered{font-size:0.58rem;color:rgba(240,236,224,0.6)}
.lp-footer-powered a{color:${accent};text-decoration:none}
</style>
</head>
<body>

<nav class="lp-nav">
  <div class="lp-nav-brand">
    ${logoHTML}
    <span class="lp-nav-name">${bizName}</span>
  </div>
  <div class="lp-nav-pill"><span class="lp-nav-dot"></span>AI Powered</div>
</nav>
<section class="lp-hero">
  <div class="lp-hero-eyebrow">&#10022; Qraivy Smart Page</div>
  <h1 class="lp-hero-title">${headline}</h1>
  <p class="lp-hero-sub">${sub}</p>
</section>

<!-- AI Concierge Zone -->
<section class="lp-voice-section">
  <div class="lp-voice-title">&#9658; Welcome from ${bizName}</div>
  <div class="lp-voice-player" id="voicePlayer">
    <button class="lp-voice-btn" id="voiceBtn" aria-label="Play welcome message">&#9654;</button>
    <div class="lp-voice-info">
      <div class="lp-voice-name">Personal welcome message</div>
      <div class="lp-voice-sub" id="voiceSub">Tap to listen &mdash; unlocks AI assistant</div>
    </div>
    <div class="lp-waveform" id="waveform">
      ${Array.from({length:18},(_,i)=>`<div class="lp-bar" style="height:${Math.floor(Math.random()*22+6)}px;animation-delay:${(i*0.06).toFixed(2)}s"></div>`).join('')}
    </div>
  </div>
</section>

<section class="lp-chat-section" id="aiSection">
  <div class="lp-chat-collapsed" id="chatCollapsed">
    <div class="lp-chat-collapsed-dot"></div>
    <span class="lp-chat-collapsed-label">AI Assistant &mdash; Online</span>
    <span class="lp-chat-collapsed-hint">Tap welcome message to activate</span>
  </div>
  <div class="lp-chat-expanded" id="chatExpanded" style="display:none;opacity:0">
    <div class="lp-chat-title">AI Assistant</div>
    <div class="lp-chat-widget">
      <div class="lp-chat-header">
        <div class="lp-chat-avatar">&#10022;</div>
        <div>
          <div class="lp-chat-hname">AI Assistant</div>
          <div class="lp-chat-status"><span class="lp-status-dot"></span>Online now</div>
        </div>
      </div>
      <div class="lp-chat-msgs" id="chatMsgs"></div>
      <div class="lp-chat-input-row">
        <input class="lp-chat-input" id="chatInput" type="text" placeholder="Ask a question..." />
        <button class="lp-chat-send" id="chatSend">&#10148;</button>
      </div>
    </div>
  </div>
</section>

<section class="lp-subscribe-section lp-subscribe-prominent">
  <div class="lp-subscribe-card">
    <div class="lp-sub-glow"></div>
    <div class="lp-wallet-preview">
      <div class="lp-wallet-card">
        <div class="lp-wallet-top">
          <span class="lp-wallet-brand">${bizName}</span>
          <span class="lp-wallet-type">SMART PASS</span>
        </div>
        <div class="lp-wallet-bottom">
          <span class="lp-wallet-id">QRAIVY MEMBER</span>
          <span class="lp-wallet-circles">&#9711; &#9711;</span>
        </div>
      </div>
    </div>
    <h3 class="lp-sub-title">Stay in the loop</h3>
    <p class="lp-sub-text">Subscribe for updates, exclusive offers and early access from ${bizName}.</p>
    <div class="lp-sub-form">
      <input class="lp-sub-input" type="email" placeholder="your@email.com" />
      <button class="lp-sub-btn">Subscribe &rarr;</button>
    </div>
    <div class="lp-wallet-btns">
      <button class="lp-wallet-btn">&#9679; Add to Apple Wallet &mdash; coming soon</button>
      <button class="lp-wallet-btn">&#9632; Add to Google Wallet &mdash; coming soon</button>
    </div>
  </div>
</section>
<section class="lp-cta-section">
  <a href="${website}" target="_blank" class="lp-btn lp-btn-primary">${content.cta} &rarr;</a>
  <a href="${website}" target="_blank" class="lp-btn lp-btn-secondary">${content.cta2}</a>
</section>

<!-- Business Info -->
${sectionsHTML}

<footer class="lp-footer">
  <div class="lp-footer-brand">
    <div class="lp-footer-Q">Q</div>
    <span class="lp-footer-name">${bizName}</span>
  </div>
  <div class="lp-footer-url">api.qraivy.com/lp/${slug}</div>
  <div class="lp-footer-powered">Powered by <a href="https://qraivy.com" target="_blank">Qraivy</a> &mdash; AI Smart Landing Pages</div>
</footer>
<script>
(function(){
  var playing = false;
  var aiActivated = false;
  var bizName = '${bizName}';

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
      playing = true;
      voiceBtn.textContent = '\u23F8';
      if (waveform) waveform.classList.add('lp-waveform-active');
      if (voiceSub) voiceSub.textContent = 'Playing welcome message\u2026';

      // Simulate audio playback duration (3.5s)
      // Future: replace setTimeout with actual ElevenLabs audio.onended
      setTimeout(function() {
        voiceBtn.textContent = '\u25B6';
        if (waveform) waveform.classList.remove('lp-waveform-active');
        if (voiceSub) voiceSub.textContent = 'Welcome message played';
        playing = false;
        // Trigger AI expansion after voice ends
        if (!aiActivated) activateAI();
      }, 3500);
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

  // ── Chat ────────────────────────────────────────────────
  function addAIMsg(type) {
    if (!chatMsgs) return;
    var d = document.createElement('div');
    d.className = 'lp-msg lp-msg-ai';
    d.id = type === 'typing' ? 'typingMsg' : '';
    d.innerHTML = type === 'typing'
      ? '<div class="lp-bubble"><span class="lp-typing-dots"><span></span><span></span><span></span></span></div>'
      : '<div class="lp-bubble">' + type + '</div>';
    chatMsgs.appendChild(d);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  function replaceTyping(text) {
    var t = document.getElementById('typingMsg');
    if (t) t.querySelector('.lp-bubble').textContent = text;
    if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  function addUserMsg(txt) {
    if (!chatMsgs) return;
    var d = document.createElement('div');
    d.className = 'lp-msg lp-msg-user';
    d.innerHTML = '<div class="lp-bubble">' + txt + '</div>';
    chatMsgs.appendChild(d);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  function submitMsg() {
    if (!chatInput) return;
    var v = chatInput.value.trim();
    if (!v) return;
    addUserMsg(v);
    chatInput.value = '';
    addAIMsg('typing');
    setTimeout(function(){
      replaceTyping('Thanks for your message! Our team will get back to you soon. For immediate help please visit our website.');
    }, 1600);
  }

  if (chatSend) chatSend.addEventListener('click', submitMsg);
  if (chatInput) chatInput.addEventListener('keydown', function(e){ if(e.key==='Enter') submitMsg(); });

  // Also allow tapping the collapsed card to activate
  if (collapsed) {
    collapsed.style.cursor = 'pointer';
    collapsed.addEventListener('click', function() {
      if (!aiActivated) activateAI();
    });
  }
})();
</script>
`;
};

// ── 404 page ──────────────────────────────────────────────────────────────
function render404(slug) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Page Not Found — Qraivy</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0ece0;font-family:'DM Mono',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;max-width:480px;margin:0 auto}
.wrap{display:flex;flex-direction:column;align-items:center;gap:16px}
.logo{width:52px;height:52px;background:#FF4E00;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;color:#fff}
h1{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800}
p{font-size:0.78rem;color:rgba(240,236,224,0.6);line-height:1.7;max-width:300px}
.slug{font-size:0.65rem;color:rgba(240,236,224,0.7);margin-top:-4px}
a{display:inline-block;margin-top:8px;padding:12px 28px;background:#FF4E00;border-radius:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:0.85rem;color:#fff;text-decoration:none}
</style></head>
<body><div class="wrap">
<div class="logo">Q</div>
<h1>Page not found</h1>
<p>This smart landing page doesn't exist yet or may have been removed.</p>
<div class="slug">api.qraivy.com/lp/${slug}</div>
<a href="https://qraivy.com">Create your own AI page &rarr;</a>
</div></body></html>`;
}

// ── Controllers ───────────────────────────────────────────────────────────

async function handlePublishLP(req, res) {
  try {
    const { slug, businessName, websiteUrl, useCase, brandColor, logoUrl, sections, qrType } = req.body;
    let userId = req.body.userId || null;
    if (!userId && req.headers.authorization) {
      try { userId = await getUserFromToken(req.headers.authorization); } catch(_) {}
    }
    if (!slug || !businessName) return res.status(400).json({ error: 'slug and businessName are required' });
    const page = await prisma.landingPage.upsert({
      where: { slug },
      update: { businessName, websiteUrl, useCase, brandColor, logoUrl, userId, sections: sections ? JSON.stringify(sections) : null, status: 'live', updatedAt: new Date() },
      create: { slug, businessName, websiteUrl, useCase, brandColor, logoUrl, userId, qrType, sections: sections ? JSON.stringify(sections) : null, status: 'live' },
    });
    return res.json({ ok: true, url: `https://api.qraivy.com/lp/${slug}`, slug, id: page.id });
  } catch (err) {
    console.error('[LP] publish error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleServeLP(req, res) {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page || page.status === 'draft') return res.status(404).send(render404(slug));
    prisma.landingPage.update({ where: { slug }, data: { scanCount: { increment: 1 } } }).catch(() => {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(renderLP(page));
  } catch (err) {
    console.error('[LP] serve error:', err);
    return res.status(500).send(render404(req.params.slug));
  }
}

async function handleGetLP(req, res) {
  try {
    const page = await prisma.landingPage.findUnique({ where: { slug: req.params.slug } });
    if (!page) return res.status(404).json({ error: 'not found' });
    return res.json(page);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleListLPs(req, res) {
  try {
    const userId = req.query.userId;
    const where = userId ? { userId } : {};
    const pages = await prisma.landingPage.findMany({ where, orderBy: { createdAt: 'desc' }, select: { id:true, slug:true, businessName:true, useCase:true, brandColor:true, status:true, scanCount:true, createdAt:true } });
    return res.json(pages);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handlePublishLP, handleServeLP, handleGetLP, handleListLPs };


