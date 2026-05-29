const { getUserFromToken } = require('./qrController');
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
  const bizName = page.businessName || 'My Business';
  const slug    = page.slug;
  const website = page.websiteUrl || 'https://qraivy.com';
  const domain  = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  function tmpl(s) {
    return (s || '').replace(/\{name\}/g, bizName).replace(/\{website\}/g, website).replace(/\{domain\}/g, domain);
  }

  // Parse stored sections FIRST so theme vars are available
  let storedButtons = [];
  let storedSections = {};
  if (page.sections) {
    try {
      storedSections = typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections;
      if (storedSections && Array.isArray(storedSections.buttons)) storedButtons = storedSections.buttons;
    } catch(_) {}
  }

  // Theme
  const st = storedSections.theme || {};
  const themeBg          = st.background   || 'dark';
  const themeButtonStyle = st.buttonStyle  || 'rounded';
  const themeFontStyle   = st.fontStyle    || 'modern';
  const themeLogoMode    = st.logoMode     || 'initials';

  // Accent (theme overrides brandColor)
  const accent = st.accentColor || page.brandColor || '#ff5a1f';

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

  // Pre-computed theme CSS vars
  const _bgColor    = themeBg === 'light' ? '#f5f0e8' : themeBg === 'gradient' ? '#0d0d14' : '#0a0a0a';
  const _textColor  = themeBg === 'light' ? '#1a1209' : '#f0ece0';
  const _fontFamily = themeFontStyle === 'elegant' ? 'Georgia,serif' : themeFontStyle === 'bold' ? 'Syne,sans-serif' : 'DM Mono,monospace';
  const _btnRadius  = themeButtonStyle === 'pill' ? '999px' : themeButtonStyle === 'square' ? '4px' : '12px';

  // Section order
  const DEFAULT_ORDER = ['hero','voice','ai','buttons','loop','footer'];
  const sectionOrder = (Array.isArray(storedSections.order) && storedSections.order.length)
    ? storedSections.order : DEFAULT_ORDER;

  const headline = tmpl(content.headline);
  const sub      = tmpl(content.sub);
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://api.qraivy.com/lp/' + slug)}&color=ffffff&bgcolor=111111&margin=2`;

  const sh = storedSections.hero   || {};
  const sv = storedSections.voice  || {};
  const sa = storedSections.ai     || {};
  const sl = storedSections.loop   || {};
  const sf = storedSections.footer || {};
  const buttonsHTML = storedButtons.filter(b => b.active !== false).map(b => {
    const cls = b.style === 'secondary' ? 'lp-btn lp-btn-secondary' : 'lp-btn lp-btn-primary';
    const url = (b.url || '#').startsWith('http') ? b.url : 'https://' + b.url;
    const bDom = b.url ? b.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : '';
    return '<a href="' + url + '" target="_blank" rel="noopener" class="' + cls + '"><span class="lp-btn-inner"><span class="lp-btn-label">' + (b.label || 'Learn More') + '</span>' + (bDom ? '<span class="lp-btn-sub">' + bDom + '</span>' : '') + '</span><span class="lp-btn-arr">&rarr;</span></a>';
  }).join('\n');

  // Only show legacy LP_CONTENT sections if page has no new editor sections
  const hasEditorSections = Object.keys(storedSections).some(k => ['hero','voice','ai','loop','footer'].includes(k));
  const sectionsHTML = hasEditorSections ? '' : content.sections.map(sec => {
    const items = (sec.items || []).map(item =>
      `<div class="lp-item"><span class="lp-dot" style="background:${accent}"></span><span>${tmpl(item)}</span></div>`
    ).join('');
    return `<section class="lp-section"><h2 class="lp-section-title">${sec.title}</h2><div class="lp-items">${items}</div></section>`;
  }).join('');

  const logoHTML = page.logoUrl
    ? `<img src="${page.logoUrl}" class="lp-logo-img" alt="${bizName}" />`
    : `<div class="lp-logo-letter" style="background:${accentDim};border-color:${accentBorder};color:${accent}">${bizName.charAt(0).toUpperCase()}</div>`;
  const logoHTMLFinal = themeLogoMode === 'hidden' ? ''
    : (themeLogoMode === 'image' && page.logoUrl) ? logoHTML
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
body{background:${_bgColor};color:${_textColor};font-family:${_fontFamily};max-width:560px;width:100%;margin:0 auto;overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
${themeBg === 'light' ? `/* ── QRAIVY PREMIUM LIGHT THEME (scoped) ──────────────────────── */
body.theme-light{background:#F7F5F2;color:#111111}
body.theme-light .lp-nav{background:rgba(255,255,255,0.98);border-bottom:1px solid #E8E3DC;box-shadow:none}
body.theme-light .lp-nav-name{color:#111111}
body.theme-light .lp-hero{background:linear-gradient(180deg,#FFFFFF 0%,#F7F5F2 100%);padding:52px 24px 44px}
body.theme-light .lp-hero-title{color:#111111;letter-spacing:-0.03em}
body.theme-light .lp-hero-sub{color:#5F5F5F;font-weight:400;line-height:1.75}
body.theme-light .lp-hero-eyebrow{color:#5F5F5F;border-color:#E8E3DC;background:rgba(255,255,255,0.9)}
body.theme-light .lp-voice-section{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 18px 50px rgba(0,0,0,.055);border-radius:22px;margin:0 16px}
body.theme-light .lp-voice-player{background:#F7F5F2;border:1px solid #E8E3DC;border-radius:12px}
body.theme-light .lp-voice-title{color:#111111;font-weight:600}
body.theme-light .lp-voice-name{color:#111111}
body.theme-light .lp-voice-sub{color:#8A8A8A}
body.theme-light .lp-chat-section{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 18px 50px rgba(0,0,0,.055);border-radius:22px;margin:0 16px}
body.theme-light .lp-chat-collapsed{background:transparent}
body.theme-light .lp-chat-collapsed-dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}
body.theme-light .lp-chat-collapsed-label{color:#111111;font-weight:600}
body.theme-light .lp-chat-collapsed-hint{color:#8A8A8A}
body.theme-light .lp-chat-widget{background:#F7F5F2;border:1px solid #E8E3DC;border-radius:12px}
body.theme-light .lp-chat-input{background:#FFFFFF;border:1px solid #E8E3DC;color:#111111;border-radius:10px}
body.theme-light .lp-chat-hname{color:#111111}
body.theme-light .lp-chat-status{color:#8A8A8A}
body.theme-light .lp-btn{background:#FFFFFF;border:1px solid #E8E3DC;border-radius:18px;box-shadow:0 12px 35px rgba(0,0,0,.045);color:#111111;font-weight:600;text-align:left;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;font-size:0.9rem;transition:transform 0.15s ease,box-shadow 0.15s ease}
body.theme-light .lp-btn::after{content:'→';color:#8A8A8A;font-size:1rem;flex-shrink:0}
body.theme-light .lp-btn:hover{transform:translateY(-2px);box-shadow:0 20px 50px rgba(0,0,0,.075)}
body.theme-light .lp-btn-primary{background:#FFFFFF;color:#111111;border-color:#E8E3DC}
body.theme-light .lp-btn-secondary{background:#FFFFFF;color:#111111;border-color:#E8E3DC}
body.theme-light .lp-subscribe-section{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 24px 70px rgba(0,0,0,.07);border-radius:28px;margin:0 16px;padding:32px 28px}
body.theme-light .lp-sub-title{color:#111111;font-weight:700;text-transform:none;font-size:1.1rem;letter-spacing:-0.01em}
body.theme-light .lp-sub-description{color:#5F5F5F}
body.theme-light .lp-sub-input{background:#FBFAF7;border:1px solid #E8E3DC;color:#111111;border-radius:12px}
body.theme-light .lp-wallet-card,body.theme-light .lp-wallet-pass{box-shadow:0 25px 60px rgba(0,0,0,.14)}
body.theme-light .lp-section{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 10px 30px rgba(0,0,0,.04);border-radius:16px}
body.theme-light .lp-section-title{color:#8A8A8A;text-transform:uppercase;letter-spacing:0.1em;font-size:0.6rem}
body.theme-light .lp-item{background:#F7F5F2;border:1px solid #E8E3DC;color:#111111;border-radius:10px}
body.theme-light .lp-qr-card{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 10px 30px rgba(0,0,0,.04)}
body.theme-light .lp-footer{border-top:1px solid #E8E3DC;background:#FFFFFF;padding:28px 24px}
body.theme-light .lp-footer-name{color:#111111}
body.theme-light .lp-footer-url{color:#8A8A8A}
body.theme-light .lp-footer-powered{color:#5F5F5F}
body.theme-light .lp-footer-Q{background:#F7F5F2;border:1px solid #E8E3DC;color:#111111}
body.theme-light .lp-footer-powered a{color:#111111;text-decoration:underline}
body.theme-light .lp-hero{padding:64px 24px 52px}
body.theme-light .lp-hero-title{font-size:clamp(2rem,7vw,2.8rem);letter-spacing:-0.04em;line-height:1.05}
body.theme-light .lp-hero-sub{font-size:0.92rem;line-height:1.8;max-width:380px;margin:0 auto 28px}
body.theme-light .lp-hero-cta-btn{display:inline-flex;align-items:center;gap:8px;background:${accent};color:#fff;padding:14px 28px;border-radius:50px;font-family:'Syne',sans-serif;font-weight:700;font-size:0.88rem;text-decoration:none;letter-spacing:.01em;transition:opacity .2s ease,transform .2s ease}
body.theme-light .lp-hero-cta-btn:hover{opacity:.88;transform:translateY(-1px)}
body.theme-light .lp-sub-title{font-size:1.3rem;letter-spacing:-0.02em;line-height:1.3;text-transform:none;font-weight:700}
body.theme-light .lp-voice-section{margin-bottom:16px}
body.theme-light .lp-chat-section{margin-bottom:16px}
body.theme-light .lp-section{margin-bottom:16px}
body.theme-light .lp-subscribe-section{margin-bottom:20px}
/* ── PASS 2: Buttons, Loop/Wallet, Footer ──────── */
body.theme-light .lp-btn::after{display:none}
body.theme-light .lp-btn{display:flex;align-items:center;padding:20px 24px;gap:16px;text-align:left}
body.theme-light .lp-btn-inner{display:flex;flex-direction:column;gap:3px;flex:1}
body.theme-light .lp-btn-label{font-size:0.95rem;font-weight:700;color:#111111;display:block}
body.theme-light .lp-btn-sub{display:block;font-size:0.72rem;color:#8A8A8A;font-weight:400}
body.theme-light .lp-btn-arr{display:block;font-size:1.1rem;color:#8A8A8A;flex-shrink:0}
body.theme-light .lp-buttons-section{background:transparent;border:none;box-shadow:none;padding:0 16px;margin-bottom:16px}
body.theme-light .lp-hero-ctas{display:flex;flex-direction:column;gap:10px}
body.theme-light .lp-hero-ctas .lp-btn{background:#FFFFFF;border:1px solid #E8E3DC;border-radius:18px;box-shadow:0 12px 35px rgba(0,0,0,.045)}
body.theme-light .lp-hero-ctas .lp-btn:hover{transform:translateY(-2px);box-shadow:0 20px 50px rgba(0,0,0,.075)}
body.theme-light .lp-subscribe-section{background:transparent;border:none;box-shadow:none;padding:0 16px;margin-bottom:20px}
body.theme-light .lp-subscribe-card{background:#FFFFFF;border:1px solid #E8E3DC;box-shadow:0 24px 70px rgba(0,0,0,.07);border-radius:28px;padding:32px 24px}
body.theme-light .lp-sub-glow{display:none}
body.theme-light .lp-wallet-card{box-shadow:0 28px 70px rgba(0,0,0,.16) !important;transform:scale(1.03)}
body.theme-light .lp-sub-text{color:#5F5F5F;font-size:0.88rem;line-height:1.65;margin-bottom:20px}
body.theme-light .lp-wallet-btn{background:#FFFFFF;border:1px solid #E8E3DC;color:#5F5F5F;border-radius:12px;font-size:0.76rem}
body.theme-light .lp-footer{background:#FFFFFF;border-top:1px solid #E8E3DC;padding:32px 24px;margin:0 16px 16px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.04)}
body.theme-light .lp-footer-url{display:none}
body.theme-light .lp-footer-name{font-size:1rem;font-weight:700;color:#111111}
body.theme-light .lp-footer-powered{font-size:0.82rem;color:#8A8A8A;margin-top:6px}
body.theme-light .lp-footer-powered a{color:${accent};font-weight:700;text-decoration:none;display:inline-block;margin-top:4px;font-size:0.88rem}` : ''}
.lp-btn-sub,.lp-btn-arr{display:none}
.lp-btn-inner{display:block}
/* Nav */
.lp-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(10,10,10,0.95);backdrop-filter:blur(16px);border-bottom:0.5px solid rgba(255,255,255,0.07)}
.lp-nav-brand{display:flex;align-items:center;gap:10px}
.lp-logo-img{width:32px;height:32px;border-radius:8px;object-fit:contain}
.lp-logo-letter{width:32px;height:32px;border-radius:8px;border:0.5px solid;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1rem;font-weight:800}
.lp-nav-name{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700}
.lp-nav-pill{display:flex;align-items:center;gap:5px;background:${accentDim};border:0.5px solid ${accentBorder};border-radius:99px;padding:4px 10px;font-size:0.58rem;color:${accent};letter-spacing:0.08em}
.lp-nav-dot{width:6px;height:6px;border-radius:50%;background:${accent};animation:lpDot 2s ease-in-out infinite}
@keyframes lpDot{0%,100%{opacity:1}50%{opacity:0.3}}
/* Hero */
.lp-hero{padding:36px 24px 28px;text-align:center;background:linear-gradient(160deg,${accentDim} 0%,transparent 55%)}
.lp-hero-eyebrow{display:inline-flex;align-items:center;gap:6px;border:0.5px solid ${accentBorder};border-radius:99px;padding:5px 14px;font-size:0.6rem;color:${accent};letter-spacing:0.1em;margin-bottom:18px}
.lp-hero-title{font-family:'Syne',sans-serif;font-size:clamp(1.7rem,6vw,2.2rem);font-weight:800;line-height:1.1;letter-spacing:-0.02em;margin-bottom:14px}
.lp-hero-sub{font-size:0.82rem;color:rgba(240,236,224,0.7);max-width:420px;margin:0 auto 28px;line-height:1.75}
.lp-hero-ctas{display:flex;flex-direction:column;gap:10px;align-items:center}
/* Buttons */
.lp-btn{display:block;width:100%;max-width:380px;padding:15px 24px;border-radius:${_btnRadius};font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;text-align:center;cursor:pointer;border:none;transition:transform 0.15s,opacity 0.15s;letter-spacing:0.02em}
.lp-btn:active{transform:scale(0.97)}
.lp-btn-primary{color:#fff;background:${accent};box-shadow:0 0 28px ${accentGlow}}
.lp-btn-secondary{background:rgba(255,255,255,0.06);color:rgba(240,236,224,0.7);border:0.5px solid rgba(255,255,255,0.14)}
/* QR section */
.lp-qr-section{padding:0 24px 24px}
.lp-qr-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px}
.lp-qr-img{width:72px;height:72px;border-radius:8px;flex-shrink:0;background:#fff}
.lp-qr-label{font-family:'Syne',sans-serif;font-size:0.82rem;font-weight:700;margin-bottom:3px}
.lp-qr-url{font-size:0.62rem;color:rgba(240,236,224,0.55);margin-bottom:8px;word-break:break-all}
.lp-qr-badge{display:inline-flex;align-items:center;gap:5px;border:0.5px solid ${accentBorder};border-radius:99px;padding:3px 9px;font-size:0.55rem;color:${accent};background:${accentDim}}
/* Sections */
.lp-section{padding:22px 24px;border-top:0.5px solid rgba(255,255,255,0.06)}
.lp-section-title{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:14px;color:#f0ece0}
.lp-items{display:flex;flex-direction:column;gap:8px}
.lp-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:9px;font-size:0.78rem;color:rgba(240,236,224,0.7)}
.lp-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
/* AI Chat */
.lp-chat-section{padding:28px 24px;border-top:0.5px solid rgba(255,255,255,0.06)}
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
.lp-voice-section{padding:28px 24px;border-top:0.5px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.01)}
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
.lp-subscribe-section{padding:28px 24px 32px;border-top:0.5px solid rgba(255,255,255,0.06)}
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
.lp-cta-section{padding:0 24px 28px;display:flex;flex-direction:column;align-items:center;gap:0}


/* ── Qraivy growth CTA ── */
.qraivy-growth-cta{padding:24px 24px 8px;text-align:center;}
.qraivy-growth-inner{display:inline-flex;flex-direction:column;align-items:center;gap:10px;}
.qraivy-growth-btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:11px 22px;
  background:rgba(255,255,255,0.04);
  border:0.5px solid rgba(255,90,31,0.22);
  border-radius:100px;
  color:rgba(240,236,224,0.75);
  font-family:'DM Mono',monospace;
  font-size:.72rem;
  letter-spacing:.02em;
  text-decoration:none;
  transition:all 0.22s ease;
  box-shadow:0 2px 16px rgba(255,90,31,0.06);
  animation:qrGrowthPulse 12s ease-in-out infinite;
  animation-delay:3s;
}
.qraivy-growth-btn:hover{
  background:rgba(255,90,31,0.08);
  border-color:rgba(255,90,31,0.4);
  color:rgba(240,236,224,0.95);
  transform:translateY(-1px);
  box-shadow:0 4px 24px rgba(255,90,31,0.14);
}
.qraivy-growth-icon{
  width:18px;height:18px;border-radius:5px;
  background:rgba(255,90,31,0.18);
  display:flex;align-items:center;justify-content:center;
  font-family:'Syne',sans-serif;font-weight:800;font-size:.65rem;
  color:rgba(255,90,31,0.9);flex-shrink:0;
}
.qraivy-growth-sub{
  font-size:.58rem;color:rgba(240,236,224,0.35);
  letter-spacing:.03em;
}
@keyframes qrGrowthPulse{
  0%,85%,100%{box-shadow:0 2px 16px rgba(255,90,31,0.06);}
  90%{box-shadow:0 2px 24px rgba(255,90,31,0.18);}
}
/* Footer */
.lp-footer{padding:24px 24px;border-top:0.5px solid rgba(255,255,255,0.06);text-align:center}
.lp-footer-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}
.lp-footer-Q{width:26px;height:26px;border-radius:6px;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:0.8rem}
.lp-footer-name{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700}
.lp-footer-url{font-size:0.58rem;color:rgba(240,236,224,0.65);margin-bottom:8px;word-break:break-all}
.lp-footer-powered{font-size:0.58rem;color:rgba(240,236,224,0.6)}
.lp-footer-powered a{color:${accent};text-decoration:none}
#qrGrowthModal{display:none;position:fixed;inset:0;z-index:9999;background:rgba(5,5,5,0.88);backdrop-filter:blur(16px) saturate(0.7);-webkit-backdrop-filter:blur(16px) saturate(0.7);align-items:center;justify-content:center;padding:16px;}
#qrGrowthModal.show{display:flex;animation:qrModalFadeIn 0.3s ease both;}
@keyframes qrModalFadeIn{from{opacity:0}to{opacity:1}}
.qrgm-wrap{background:#0f1015;border:0.5px solid rgba(255,90,31,0.2);border-radius:22px;padding:36px 28px 28px;width:100%;max-width:440px;position:relative;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.8);animation:qrModalSlideUp 0.35s cubic-bezier(0.22,1,0.36,1) both;}
@keyframes qrModalSlideUp{from{opacity:0;transform:translateY(20px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.qrgm-glow{position:absolute;top:-80px;left:50%;transform:translateX(-50%);width:360px;height:200px;background:radial-gradient(ellipse,rgba(255,90,31,0.1),transparent 70%);pointer-events:none;}
.qrgm-close{position:absolute;top:14px;right:16px;background:none;border:none;color:rgba(240,236,224,0.35);cursor:pointer;font-size:1.1rem;line-height:1;padding:4px;transition:color .18s;}
.qrgm-close:hover{color:rgba(240,236,224,0.7);}
.qrgm-preview{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px 14px;margin-bottom:22px;}
.qrgm-qr-pulse{width:36px;height:36px;border-radius:8px;background:#111;border:1.5px solid rgba(255,90,31,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;}
.qrgm-qr-inner{width:20px;height:20px;background:repeating-linear-gradient(0deg,rgba(240,236,224,0.8) 0px,rgba(240,236,224,0.8) 2px,transparent 2px,transparent 4px),repeating-linear-gradient(90deg,rgba(240,236,224,0.8) 0px,rgba(240,236,224,0.8) 2px,transparent 2px,transparent 4px);border-radius:2px;}
.qrgm-live-ring{position:absolute;inset:-4px;border-radius:11px;border:1px solid rgba(255,90,31,0.4);animation:qrLiveRing 2s ease-in-out infinite;}
@keyframes qrLiveRing{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
.qrgm-preview-info{flex:1;}
.qrgm-preview-title{font-family:'Syne',sans-serif;font-size:.78rem;font-weight:700;color:#f0ece0;margin-bottom:3px;}
.qrgm-preview-meta{display:flex;align-items:center;gap:6px;}
.qrgm-live-dot{width:5px;height:5px;border-radius:50%;background:#22d47e;animation:qrDot 1.8s ease infinite;}
.qrgm-preview-status{font-size:.6rem;color:rgba(240,236,224,0.5);}
.qrgm-feature-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;}
.qrgm-pill{font-size:.55rem;background:rgba(255,90,31,0.1);border:0.5px solid rgba(255,90,31,0.2);color:rgba(255,90,31,0.8);padding:2px 7px;border-radius:100px;}
.qrgm-title{font-family:'Syne',sans-serif;font-size:1.25rem;font-weight:800;color:#f0ece0;margin-bottom:7px;letter-spacing:-0.02em;line-height:1.2;}
.qrgm-sub{font-size:.78rem;color:rgba(240,236,224,0.55);line-height:1.65;margin-bottom:20px;}
.qrgm-features{display:flex;flex-direction:column;gap:5px;margin-bottom:22px;}
.qrgm-feat{font-size:.72rem;color:rgba(240,236,224,0.7);display:flex;align-items:center;gap:7px;}
.qrgm-feat::before{content:"\u2713";color:#22d47e;font-weight:700;font-size:.7rem;flex-shrink:0;}
.qrgm-input{width:100%;padding:12px 14px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:11px;color:#f0ece0;font-family:'DM Mono',monospace;font-size:.82rem;outline:none;transition:border-color .2s ease;box-sizing:border-box;margin-bottom:6px;}
.qrgm-input:focus{border-color:rgba(255,90,31,0.4);}
.qrgm-input::placeholder{color:rgba(240,236,224,0.3);}
.qrgm-url-preview{font-family:'DM Mono',monospace;font-size:.6rem;color:rgba(255,90,31,0.55);padding:0 4px 16px;letter-spacing:.02em;min-height:20px;}
.qrgm-cta{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#ff5a1f,#ff7a45);color:#fff;font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800;cursor:pointer;letter-spacing:.01em;transition:all .2s ease;box-shadow:0 4px 20px rgba(255,90,31,0.3);margin-bottom:10px;}
.qrgm-cta:hover{transform:translateY(-1px);box-shadow:0 6px 28px rgba(255,90,31,0.45);}
.qrgm-skip{width:100%;background:none;border:none;color:rgba(240,236,224,0.3);font-family:'DM Mono',monospace;font-size:.65rem;cursor:pointer;padding:4px;transition:color .18s;}
.qrgm-skip:hover{color:rgba(240,236,224,0.55);}
</style>
</head>
<body${themeBg === 'light' ? ' class="theme-light"' : ''}>

<nav class="lp-nav">
  <div class="lp-nav-brand">
    ${logoHTMLFinal}
    <span class="lp-nav-name">${bizName}</span>
  </div>
  <div class="lp-nav-pill"><span class="lp-nav-dot"></span>AI Powered</div>
</nav>
${(function() {
  const heroHTML = `<section class="lp-hero">
  <div class="lp-hero-eyebrow">&#10022; ${sh.badge || 'Qraivy Smart Page'}</div>
  <h1 class="lp-hero-title">${sh.title || headline}</h1>
  <p class="lp-hero-sub">${sh.subtitle || sub}</p>
  ${themeBg === 'light' ? '<a href="#aiSection" class="lp-hero-cta-btn">Start a Conversation &rarr;</a>' : ''}
</section>`;
  const voiceHTML = sv.enabled === false ? '' : `<section class="lp-voice-section">
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
</section>`;
  const aiHTML = sa.enabled === false ? '' : `<section class="lp-chat-section" id="aiSection">
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
        <input class="lp-chat-input" id="chatInput" type="text" placeholder="${sa.placeholder || 'Ask a question...'}" />
        <button class="lp-chat-send" id="chatSend">&#10148;</button>
      </div>
    </div>
  </div>
</section>`;
  const loopHTML = sl.enabled === false ? '' : `<section class="lp-subscribe-section lp-subscribe-prominent">
  <div class="lp-subscribe-card">
    <div class="lp-sub-glow"></div>
    <div class="lp-wallet-preview"><div class="lp-wallet-card"><div class="lp-wallet-top"><span class="lp-wallet-brand">${bizName}</span><span class="lp-wallet-type">SMART PASS</span></div><div class="lp-wallet-bottom"><span class="lp-wallet-id">QRAIVY MEMBER</span><span class="lp-wallet-circles">&#9711; &#9711;</span></div></div></div>
    <h3 class="lp-sub-title">${sl.title || 'Stay in the loop'}</h3>
    <p class="lp-sub-text">${sl.description || ('Subscribe for updates, exclusive offers and early access from ' + bizName + '.')}</p>
    <div class="lp-sub-form"><input class="lp-sub-input" type="email" placeholder="${sl.emailPlaceholder || 'your@email.com'}" /><button class="lp-sub-btn">${sl.buttonLabel || 'Subscribe →'}</button></div>
    <div class="lp-wallet-btns"><button class="lp-wallet-btn">&#9679; Add to Apple Wallet &mdash; coming soon</button><button class="lp-wallet-btn">&#9632; Add to Google Wallet &mdash; coming soon</button></div>
  </div>
</section>`;
  const buttonsBlock = buttonsHTML ? '<section class="lp-section lp-buttons-section"><div class="lp-hero-ctas">' + buttonsHTML + '</div></section>' : '';
  const footerBlock = sf.enabled === false ? '' : `<footer class="lp-footer">
  <div class="lp-footer-brand"><div class="lp-footer-Q">Q</div><span class="lp-footer-name">${sf.businessName || bizName}</span></div>
  <div class="lp-footer-url">${sf.footerText || ('api.qraivy.com/lp/' + slug)}</div>
  <div class="lp-footer-powered">Powered by <a href="${sf.footerLink || 'https://qraivy.com'}" target="_blank">Qraivy</a> &mdash; AI Smart Landing Pages</div>
</footer>`;
  const ctaHTML = hasEditorSections ? (sectionsHTML ? `<!-- Business Info -->${sectionsHTML}` : '') : `<section class="lp-cta-section">
  <a href="${website}" target="_blank" class="lp-btn lp-btn-primary">${content.cta} &rarr;</a>
  <a href="${website}" target="_blank" class="lp-btn lp-btn-secondary">${content.cta2}</a>
</section>
<!-- Business Info -->
${sectionsHTML}`;
  const sectionMap = { hero: heroHTML, voice: voiceHTML, ai: aiHTML, buttons: buttonsBlock, loop: loopHTML, footer: footerBlock };
  const orderedSections = sectionOrder.map(function(k){ return sectionMap[k] || ''; });
  const footerIdx = orderedSections.length - 1;
  orderedSections.splice(footerIdx, 0, ctaHTML);
  return orderedSections.join('\n');
})()}

<!-- Growth modal -->
<div id="qrGrowthModal">
  <div class="qrgm-wrap">
    <div class="qrgm-glow"></div>
    <button class="qrgm-close" id="qrgmClose">&#x2715;</button>
    <div class="qrgm-preview">
      <div class="qrgm-qr-pulse"><div class="qrgm-qr-inner"></div><div class="qrgm-live-ring"></div></div>
      <div class="qrgm-preview-info">
        <div class="qrgm-preview-title">AI Smart Page &mdash; Live</div>
        <div class="qrgm-preview-meta"><div class="qrgm-live-dot"></div><span class="qrgm-preview-status">Scanning active &bull; AI online</span></div>
        <div class="qrgm-feature-pills"><span class="qrgm-pill">AI Chat</span><span class="qrgm-pill">Wallet</span><span class="qrgm-pill">Analytics</span></div>
      </div>
    </div>
    <div class="qrgm-title">Launch Your Own AI Smart Page</div>
    <div class="qrgm-sub">You just experienced an AI-powered Smart QR. Create your own in under 60 seconds.</div>
    <div class="qrgm-features">
      <div class="qrgm-feat">Voice welcome message</div>
      <div class="qrgm-feat">AI assistant for visitors</div>
      <div class="qrgm-feat">Apple &amp; Google Wallet passes</div>
      <div class="qrgm-feat">Smart QR analytics</div>
      <div class="qrgm-feat">Live hosted landing page</div>
    </div>
    <input class="qrgm-input" id="qrgmName" type="text" placeholder="Your brand, event, or store name" maxlength="48" autocomplete="off"/>
    <div class="qrgm-url-preview" id="qrgmUrlPreview">qraivy.com/demo-yourbrand</div>
    <button class="qrgm-cta" id="qrgmCta">Generate My Smart QR &rarr;</button>
    <button class="qrgm-skip" id="qrgmSkip">Maybe later</button>
  </div>
</div>
<!-- Growth CTA -->
<div class="qraivy-growth-cta">
  <div class="qraivy-growth-inner">
    <button class="qraivy-growth-btn" id="qrGrowthBtn">
      <div class="qraivy-growth-icon">Q</div>
      Create Your Own Smart QR
    </button>
    <div class="qraivy-growth-sub">Launch an AI-powered landing page in under 60 seconds.</div>
  </div>
</div>

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
  // growth modal
  (function(){
    var modal=document.getElementById("qrGrowthModal");
    var openBtn=document.getElementById("qrGrowthBtn");
    var closeBtn=document.getElementById("qrgmClose");
    var skipBtn=document.getElementById("qrgmSkip");
    var nameIn=document.getElementById("qrgmName");
    var urlPrev=document.getElementById("qrgmUrlPreview");
    var ctaBtn=document.getElementById("qrgmCta");
    function slugify(s){return(s||"yourbrand").toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,28)||"yourbrand";}
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
    if (!req.query.preview) prisma.landingPage.update({ where: { slug }, data: { scanCount: { increment: 1 } } }).catch(() => {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    if (req.query.preview || req.query.t) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60');
    }
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


async function handleDeleteLP(req, res) {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ error: 'slug required' });
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Not found' });
    if (page.userId && page.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.landingPage.delete({ where: { slug } });
    return res.json({ ok: true, success: true });
  } catch (err) {
    console.error('[LP] delete error:', err);
    return res.status(500).json({ error: err.message });
  }
}
module.exports = { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs };




