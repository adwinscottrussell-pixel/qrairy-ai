const { getUserFromToken } = require('./qrController');
const prisma = require('../prismaClient');
const https = require('https');

async function scrapeWithFirecrawl(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || !url) return null;
  try {
    const body = JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true });
    return await new Promise((resolve) => {
      const req = https.request({ hostname: 'api.firecrawl.dev', path: '/v1/scrape', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); resolve(j.data && j.data.markdown ? j.data.markdown.slice(0, 8000) : null); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null)); req.write(body); req.end();
    });
  } catch(e) { return null; }
}

async function generateLPFromSite(businessName, websiteUrl, siteContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !siteContent) return null;
  try {
    const prompt = 'Based on this scraped website content, generate a JSON object with these exact fields: headline (hero headline), sub (1-2 sentence description), cta (primary button text), cta2 (secondary button text), features (array of exactly 3 objects each with icon (emoji), title, description pulled from real content), hours (opening hours string or null), address (physical address or null), phone (phone number or null), brandColor (the primary hex brand color of the business e.g. #DA291C for McDonalds, #006241 for Starbucks - make your best guess from the brand), useCase (one of: restaurant, ecommerce, gym, realestate, event, leadgen, portfolio, ai-support). Return ONLY valid JSON, no markdown fences.\n\nBusiness: ' + businessName + '\nWebsite: ' + websiteUrl + '\nScraped content:\n' + siteContent;
    const body = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] });
    return await new Promise((resolve) => {
      const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); const text = j.content[0].text; resolve(JSON.parse(text.replace(/```json|```/g,'').trim())); } catch(e) { console.error('[Firecrawl] AI parse error:', e.message); resolve(null); } });
      });
      req.on('error', () => resolve(null)); req.write(body); req.end();
    });
  } catch(e) { return null; }
}

// ── LP content per use case ───────────────────────────────────────────────
const LP_CONTENT = {
  local_business: {
    headline: 'Welcome to {name}',
    sub: 'Your local experts. Visit us today or get in touch — we are here to help.',
    cta: 'Contact Us', cta2: 'Learn More',
    sections: [
      { title: 'Our Services', items: ['Professional Service', 'Expert Advice', 'Local Knowledge', 'Customer Support'] },
      { title: 'Opening Hours', items: ['Mon–Fri: 09:00 – 18:00', 'Saturday: 10:00 – 16:00', 'Sunday: Closed'] },
      { title: 'Find Us', items: ['{website}'] },
    ],
  },
  event: {
    headline: '{name}',
    sub: 'Join us for an unforgettable experience. Get your tickets before they sell out.',
    cta: 'Get Tickets', cta2: 'Learn More',
    sections: [
      { title: 'Event Details', items: ['Date & Time TBC', 'Venue & Location', 'What to Expect', 'Special Guests'] },
      { title: 'Tickets', items: ['Early Bird — Limited availability', 'General Admission', 'VIP Experience', 'Group Bookings'] },
      { title: 'More Info', items: ['{website}'] },
    ],
  },
  fitness: {
    headline: 'Train with {name}',
    sub: 'Expert coaching, real results. Start your fitness journey today.',
    cta: 'Book a Session', cta2: 'View Programs',
    sections: [
      { title: 'Programs', items: ['Personal Training', 'Group Classes', 'Online Coaching', 'Nutrition Plans'] },
      { title: 'Why Choose Us', items: ['Certified coaches', 'Proven results', 'Flexible scheduling', 'Community support'] },
      { title: 'Get Started', items: ['{website}'] },
    ],
  },
  creator: {
    headline: '{name}',
    sub: 'Follow for exclusive content, behind the scenes and special offers.',
    cta: 'Follow Me', cta2: 'My Content',
    sections: [
      { title: 'My Links', items: ['Instagram', 'TikTok', 'YouTube', 'Newsletter'] },
      { title: 'Work With Me', items: ['Brand partnerships', 'Sponsored content', 'Events & appearances', 'Affiliate programs'] },
      { title: 'Connect', items: ['{website}'] },
    ],
  },
  artist: {
    headline: '{name}',
    sub: 'Music, art, and soul. Stream, follow and catch me live.',
    cta: 'Stream Now', cta2: 'Tour Dates',
    sections: [
      { title: 'Latest Releases', items: ['New Single', 'Latest Album', 'Music Videos', 'Remixes & Collabs'] },
      { title: 'Live Shows', items: ['Upcoming Tour Dates', 'Festival Appearances', 'Private Events', 'Ticket Links'] },
      { title: 'Connect', items: ['{website}'] },
    ],
  },
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
  // Use AI-generated hero text if available and hero title is generic
  if (storedSections.aiGenerated && storedSections.hero) {
    if (storedSections.hero.aiTitle) { sh.title = storedSections.hero.aiTitle; sh.subtitle = storedSections.hero.aiSubtitle || sh.subtitle; }
  }
  const sv = storedSections.voice  || {};
  const sa = storedSections.ai     || {};
  const sl = storedSections.loop   || {};
  const sf = storedSections.footer || {};
  const buttonsHTML = storedButtons.filter(b => b.active !== false).map(b => {
    const cls = b.style === 'secondary' ? 'lp-btn lp-btn-secondary' : 'lp-btn lp-btn-primary';
    const url = (b.url || '#').startsWith('http') ? b.url : 'https://' + b.url;
    const bDom = b.url ? b.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : '';
var _ICON_MAP={globe:'🌐',phone:'📞',email:'📧',location:'📍',booking:'📅',shop:'🛒',instagram:'📸',tiktok:'🎵',facebook:'📘',youtube:'▶',custom:'🔗'};
        var _ico=b.icon&&_ICON_MAP[b.icon]?_ICON_MAP[b.icon]+' ':'';
    return '<a href="' + url + '" target="_blank" rel="noopener" class="' + cls + '"><span class="lp-btn-inner"><span class="lp-btn-label">' + (_ico+(b.title||b.label||'Button')) + '</span>' + (bDom ? '<span class="lp-btn-sub">' + bDom + '</span>' : '') + '</span><span class="lp-btn-arr">&rarr;</span></a>';
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
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Inter:wght@700;800;900&display=swap" rel="stylesheet">
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
body.theme-light .lp-hero{padding:48px 28px 40px}
body.theme-light .lp-hero-title{font-size:clamp(1.1rem,4.5vw,2rem);letter-spacing:-0.03em;line-height:1.1}
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
body.theme-light .lp-footer-powered a{color:${accent};font-weight:700;text-decoration:none;display:inline-block;margin-top:4px;font-size:0.88rem}
/* ── PASS 3: Featured + Wallet reduction ───────── */
body.theme-light .lp-featured-section{padding:0 0 28px}
body.theme-light .lp-featured-header{padding:8px 20px 20px;text-align:center}
body.theme-light .lp-featured-title{color:#111111;font-size:1.2rem;font-weight:800;letter-spacing:-.02em;line-height:1.2;text-transform:none;margin-bottom:6px}
body.theme-light .lp-featured-subtitle{color:rgba(26,18,9,0.45);font-size:.74rem}
body.theme-light .lp-featured-cards{display:grid;grid-template-columns:1fr;gap:10px;padding:0 16px}
body.theme-light .lp-featured-card{background:#FFFFFF;border:1px solid rgba(0,0,0,.06);border-radius:20px;padding:20px 12px 18px;box-shadow:0 14px 40px rgba(0,0,0,.08);text-align:center}
body.theme-light .lp-featured-icon{font-size:1.8rem;display:block;margin-bottom:10px}
body.theme-light .lp-featured-card-title{color:#111111;font-size:.78rem;font-weight:800;margin-bottom:6px;line-height:1.3}
body.theme-light .lp-featured-card-desc{color:rgba(26,18,9,0.52);font-size:.67rem;line-height:1.55}
body.theme-light .qraivy-growth-btn{color:#fff !important;background:${accent} !important;border:none;box-shadow:0 8px 24px rgba(0,0,0,.15)}
body.theme-light .qraivy-growth-icon{color:#fff !important}
body.theme-light .lp-info-row{background:#FFFFFF;border:1px solid #E8E3DC}
body.theme-light .lp-info-hdr-title{color:#111111}
body.theme-light .lp-info-hdr-sub{color:rgba(26,18,9,0.45)}
body.theme-light .lp-info-label{color:rgba(26,18,9,0.45)}
body.theme-light .lp-info-text{color:#111111}
body.theme-light .lp-info-link{color:#111111}` : ''}
.lp-info-section{margin:0 0 20px}
.lp-info-card{padding:20px;margin:0 16px}
.lp-info-hdr{margin-bottom:16px}
.lp-info-hdr-title{font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:800;color:#f0ece0;margin-bottom:4px;letter-spacing:-.01em}
.lp-info-hdr-sub{font-size:.7rem;color:rgba(240,236,224,0.5)}
.lp-info-rows{display:flex;flex-direction:column;gap:9px}
.lp-info-row{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 14px}
.lp-info-icw{width:32px;height:32px;border-radius:10px;background:rgba(255,90,31,0.1);border:0.5px solid rgba(255,90,31,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lp-info-icw svg{width:14px;height:14px;display:block}
.lp-info-body{min-width:0;flex:1}
.lp-info-label{font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:rgba(240,236,224,0.45);margin-bottom:2px}
.lp-info-val{font-size:.82rem;font-weight:500;line-height:1.3;word-break:break-all}
.lp-info-text{color:#f0ece0}
.lp-info-link{color:#f0ece0;text-decoration:none}
.lp-featured-section{padding:0 0 28px}
.lp-featured-header{text-align:center;padding:8px 20px 20px}
.lp-featured-title{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:#f0ece0;margin-bottom:6px;letter-spacing:-.02em;line-height:1.2;text-transform:none}
.lp-featured-subtitle{font-size:.74rem;color:rgba(240,236,224,0.5);margin-top:3px}
.lp-featured-cards{display:grid;grid-template-columns:1fr;gap:10px;padding:0 16px}
.lp-featured-card{background:rgba(255,255,255,.03);border:0.5px solid rgba(255,255,255,.07);border-radius:20px;padding:20px 12px 18px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.lp-featured-icon{font-size:1.8rem;margin-bottom:10px;display:block}
.lp-featured-card-title{font-family:'Syne',sans-serif;font-size:.78rem;font-weight:800;color:#f0ece0;margin-bottom:6px;line-height:1.3}
.lp-featured-card-desc{font-size:.67rem;color:rgba(240,236,224,0.52);line-height:1.55}
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
.lp-hero{padding:36px 28px 28px;text-align:center;background:linear-gradient(160deg,${accentDim} 0%,transparent 55%)}
.lp-hero-eyebrow{display:inline-flex;align-items:center;gap:6px;border:0.5px solid ${accentBorder};border-radius:99px;padding:5px 14px;font-size:0.6rem;color:${accent};letter-spacing:0.1em;margin-bottom:18px}
.lp-hero-title{font-family:'Inter',sans-serif;font-size:clamp(1.1rem,4.5vw,2rem);font-weight:800;word-break:break-word;overflow-wrap:break-word;hyphens:auto;line-height:1.1;letter-spacing:-0.02em;margin-bottom:14px}
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
.lp-chat-msgs{min-height:120px;max-height:320px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none}
.lp-chat-msgs::-webkit-scrollbar{display:none}
.lp-msg{display:flex}
.lp-msg-ai{justify-content:flex-start}
.lp-msg-user{justify-content:flex-end}
.lp-bubble{max-width:82%;padding:10px 13px;border-radius:12px;font-size:0.88rem;line-height:1.6}.lp-bubble-ai{background:rgba(255,255,255,0.08);color:#f0ece0}
.lp-msg-ai .lp-bubble{background:rgba(255,255,255,0.05);border:0.5px solid ${accentBorder};color:rgba(240,236,224,0.7)}
.lp-msg-user .lp-bubble{background:${accentDim};border:0.5px solid ${accentBorder};color:rgba(240,236,224,0.85)}
.lp-chat-input-row{display:flex;gap:8px;padding:10px 12px;border-top:0.5px solid rgba(255,255,255,0.07)}
.lp-chat-input{flex:1;font-size:0.88rem;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:9px 12px;color:#f0ece0;font-family:'DM Mono',monospace;font-size:0.75rem;outline:none}
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
.lp-wallet-btn--google{background:#1a47a0;border:1.5px solid #4285f4;color:#fff;font-size:0.82rem;font-weight:700;text-align:center;border-radius:12px;cursor:pointer;animation:walletPulse 2.5s ease-in-out infinite;animation-delay:0.5s}.lp-wallet-btn--apple{background:#1a6e3a;border:1.5px solid #22c55e;color:#fff;font-size:0.82rem;font-weight:700;border-radius:12px;padding:14px;letter-spacing:0.04em;box-shadow:0 0 0 0 rgba(34,197,94,0.7);animation:walletPulse 2s ease-in-out infinite}
.lp-wallet-cta-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}
.lp-wallet-cta-hint{font-family:'Syne',sans-serif;font-size:0.72rem;color:rgba(34,197,94,0.9);margin:0;animation:walletHintFade 2s ease-in-out infinite;text-align:center}
@keyframes walletPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.7)}70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@keyframes walletHintFade{0%,100%{opacity:0.6}50%{opacity:1}}

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
  <div class="lp-voice-title">&#9658; Welcome from ${(page.businessName || bizName).replace(/^Welcome to /i,'').replace(/^Welcome /i,'')}</div>
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
    <div class="lp-wallet-preview"><div class="lp-wallet-card"><div class="lp-wallet-top"><span class="lp-wallet-brand">${sl.walletTitle || bizName}</span><span class="lp-wallet-type">SMART PASS</span></div><div class="lp-wallet-bottom"><span class="lp-wallet-id">${sl.walletSubtitle || 'QRAIVY MEMBER'}</span><span class="lp-wallet-circles">&#9711; &#9711;</span></div></div></div>
    <h3 class="lp-sub-title">${themeBg === 'light' && sl.title && sl.title.length > 40 ? 'Stay in the Loop' : (sl.title || 'Stay in the Loop')}</h3>
    <p class="lp-sub-text">${sl.description || (themeBg === 'light' ? 'Get exclusive updates, offers and early access.' : 'Subscribe for updates, exclusive offers and early access from ' + bizName + '.')}</p>
    <div class="lp-sub-form"><input class="lp-sub-input" type="email" placeholder="${sl.emailPlaceholder || 'your@email.com'}" /><button class="lp-sub-btn">${sl.buttonLabel || 'Subscribe →'}</button></div>
    ${(sl.appleEnabled!==false||sl.googleEnabled!==false)?'<div class="lp-wallet-btns">'+(sl.appleEnabled!==false?`<div class="lp-wallet-cta-wrap"><p class="lp-wallet-cta-hint">👇 Tap to save your pass</p><a href="/lp/wallet/apple/${slug}" class="lp-wallet-btn lp-wallet-btn--apple lp-btn-apple-only" style="text-decoration:none;display:block;">&#9679; Add to Apple Wallet</a></div>`:(''))+(sl.googleEnabled!==false?'<a href="/lp/wallet/google/' + slug + '" class="lp-wallet-btn lp-wallet-btn--google lp-btn-google-only" style="text-decoration:none;display:block;">&#9632; Add to Google Wallet</a>':'')+'</div>':''}
  </div>
</section>`;
  const buttonsBlock = buttonsHTML ? '<section class="lp-section lp-buttons-section"><div class="lp-hero-ctas">' + buttonsHTML + '</div></section>' : '';
  const sfeatArr = Array.isArray(storedSections.featured) ? storedSections.featured : null;
  const sfeat = sfeatArr ? {} : (storedSections.featured || {});
  const _dfc = [{icon:'&#x2728;',title:'AI Concierge',description:'Customers get instant answers.'},{icon:'&#x1F39F;',title:'Digital Wallet',description:'One-tap membership and rewards.'},{icon:'&#x1F514;',title:'Smart Updates',description:'Reconnect with every scan.'}];
  const _fc = sfeatArr ? sfeatArr.filter(f => f.enabled !== false) : _dfc;
  const featuredHTML = (!sfeatArr && sfeat.enabled === false) || _fc.length === 0 ? '' :
    '<section class="lp-featured-section">'+
    '<div class="lp-featured-header"><h2 class="lp-featured-title">'+(sfeat.title||'Why Choose Us')+'</h2><p class="lp-featured-subtitle">Discover what makes us different.</p></div>'+
    '<div class="lp-featured-cards">'+
    _fc.map(f => '<div class="lp-featured-card"><div class="lp-featured-icon">'+(f.icon||'&#x2728;')+'</div><div class="lp-featured-card-title">'+(f.title||'')+'</div><div class="lp-featured-card-desc">'+(f.description||'')+'</div></div>').join('')+
    '</div></section>';
  const si=storedSections.info||{};
  const _iac=(storedSections.theme&&storedSections.theme.accentColor)||'#ff5a1f';
  const _ic='width:14px;height:14px;display:block;';
  const _pinS='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+_iac+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const _phS='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+_iac+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12 12 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.79-1.79a2 2 0 0 1 2.11-.45 12 12 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const _glS='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+_iac+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  const _clS='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+_iac+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const _emS='<svg style="'+_ic+'" viewBox="0 0 24 24" fill="none" stroke="'+_iac+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>';
  const _mkIR=function(ico,lbl,val,href){
    const v=href?'<a href="'+href+'" class="lp-info-val lp-info-link">'+val+'</a>':'<div class="lp-info-val lp-info-text">'+val+'</div>';
    return '<div class="lp-info-row"><div class="lp-info-icw">'+ico+'</div><div class="lp-info-body"><div class="lp-info-label">'+lbl+'</div>'+v+'</div></div>';
  };
  const _ir=[];
  if(si.address&&si.addressEnabled!==false)_ir.push(_mkIR(_pinS,'Address',si.address,''));
  if(si.phone&&si.phoneEnabled!==false)_ir.push(_mkIR(_phS,'Phone',si.phone,'tel:'+si.phone));
  if(si.website&&si.websiteEnabled!==false){const _wu=si.website.startsWith('http')?si.website:'https://'+si.website;_ir.push(_mkIR(_glS,'Website',si.website,_wu));}
  if(si.hours&&si.hoursEnabled!==false)_ir.push(_mkIR(_clS,'Opening Hours',si.hours.split('\n').join('<br>'),''));
  if(si.email&&si.emailEnabled!==false)_ir.push(_mkIR(_emS,'Email',si.email,'mailto:'+si.email));
  const infoHTML=_ir.length===0?'':'<section class="lp-info-section"><div class="lp-info-card"><div class="lp-info-hdr"><div class="lp-info-hdr-title">Visit &amp; Contact</div><div class="lp-info-hdr-sub">Everything you need to reach us.</div></div><div class="lp-info-rows">'+_ir.join('')+'</div></div></section>';
  const footerBlock = sf.enabled === false ? '' : `<footer class="lp-footer">
  <div class="lp-footer-brand"><div class="lp-footer-Q">Q</div><span class="lp-footer-name">${sf.businessName || bizName}</span></div>
  <div class="lp-footer-url">${sf.footerText || ('api.qraivy.com/lp/' + slug)}</div>
  <div class="lp-footer-powered">Built with <a href="${sf.footerLink || 'https://qraivy.com'}" target="_blank">Qraivy</a><br>AI-powered customer engagement.</div>
</footer>`;
  const ctaHTML = hasEditorSections ? (sectionsHTML ? `<!-- Business Info -->${sectionsHTML}` : '') : `<section class="lp-cta-section">
  <a href="${website}" target="_blank" class="lp-btn lp-btn-primary">${content.cta} &rarr;</a>
  <a href="${website}" target="_blank" class="lp-btn lp-btn-secondary">${content.cta2}</a>
</section>
<!-- Business Info -->
${sectionsHTML}`;
  const sectionMap = { hero: heroHTML, voice: voiceHTML, ai: aiHTML, buttons: buttonsBlock, featured: featuredHTML, loop: loopHTML, info: infoHTML, footer: footerBlock };
  const orderedSections = sectionOrder.map(function(k){ return sectionMap[k] || ''; });
  const footerIdx = orderedSections.length - 1;
  var _fi3=-1;if(!sectionOrder.includes('featured')){const _bi=sectionOrder.indexOf('loop');_fi3=_bi!==-1?_bi+1:orderedSections.length-1;orderedSections.splice(_fi3,0,featuredHTML);}else{_fi3=sectionOrder.indexOf('featured');}
  if(!sectionOrder.includes('info')){orderedSections.splice(_fi3+1,0,infoHTML);}
  orderedSections.splice(footerIdx,0,ctaHTML);
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
  var slug = '${slug}';

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
      var audioUrl = '${sv.audioUrl || ""}';
      playing = true;
      voiceBtn.textContent = '\u23F8';
      if (waveform) waveform.classList.add('lp-waveform-active');
      if (voiceSub) voiceSub.textContent = 'Playing welcome message\u2026';
      function onVoiceEnd() {
        voiceBtn.textContent = '\u25B6';
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

async function handleChatLP(req, res) {
  try {
    const { slug, message, history } = req.body;
    if (!slug || !message) return res.status(400).json({ error: 'missing params' });
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ reply: 'Business not found.' });
    const sections = page.sections ? JSON.parse(page.sections) : {};
    const siteContent = sections.siteContent || '';
    const bizName = page.businessName || slug;
    const businessInfo = sections.businessInfo || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ reply: 'AI not configured.' });
        const sys = 'You are a friendly AI assistant for ' + bizName + '. Answer customer questions based on the info below. Be very concise - max 3 sentences. No markdown, no bullet points, no headers. Plain conversational text only. If listing options, use commas not bullets.' + (siteContent ? ' Website content: ' + siteContent.slice(0,6000) : '') + (businessInfo.hours ? ' Hours: ' + businessInfo.hours : '') + (businessInfo.address ? ' Address: ' + businessInfo.address : '') + (businessInfo.phone ? ' Phone: ' + businessInfo.phone : '');
    const msgs = (history||[]).slice(-6).concat([{role:'user',content:message}]);
    const body = JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:300,system:sys,messages:msgs});
    const https = require('https');
    const reply = await new Promise((resolve) => {
      const r = https.request({hostname:'api.anthropic.com',path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body)}},(res2)=>{
        let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{try{resolve(JSON.parse(d).content[0].text);}catch{resolve('Sorry, I could not process that.');}});
      });
      r.on('error',()=>resolve('Sorry, something went wrong.')); r.write(body); r.end();
    });
    return res.json({ reply });
  } catch(e) { return res.status(500).json({ reply: 'Sorry, something went wrong.' }); }
}

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
    if (websiteUrl && websiteUrl.startsWith('http')) {
      setImmediate(async () => {
        try {
          console.log('[Firecrawl] Starting scrape for', websiteUrl);
          const siteContent = await scrapeWithFirecrawl(websiteUrl);
          console.log('[Firecrawl] scrape result:', siteContent ? 'got ' + siteContent.length + ' chars' : 'null/empty');
          if (siteContent) {
            const aiData = await generateLPFromSite(businessName, websiteUrl, siteContent);
            if (aiData) {
              const cur = await prisma.landingPage.findUnique({ where: { slug } });
              const existing = cur && cur.sections ? JSON.parse(cur.sections) : {};
              const merged = Object.assign({}, existing, {
                hero: Object.assign({}, existing.hero||{}, aiData.headline ? { aiTitle: aiData.headline, aiSubtitle: aiData.sub||'' } : {}),
                featured: aiData.features ? aiData.features.map(feat=>({ enabled:true, icon:feat.icon, title:feat.title, description:feat.description })) : existing.featured,
                businessInfo: { hours: aiData.hours||null, address: aiData.address||null, phone: aiData.phone||null },
                aiGenerated: true, aiGeneratedAt: new Date().toISOString(), siteContent,
                theme: Object.assign({}, existing.theme||{}, aiData.brandColor ? { accentColor: aiData.brandColor } : {})
              });
              await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(merged) } });
              console.log('[Firecrawl] Auto-generated LP for', slug);

              // Generate voice welcome message
              try {
                const { generateAndUploadVoice } = require('../services/voiceService');
                const vs = (merged.voice && merged.voice.voiceKey) || 'sarah';
                const ct = (merged.voice && merged.voice.customText) || null;
                const audioUrl = await generateAndUploadVoice(businessName, slug, vs, ct);
                merged.voice = Object.assign({}, merged.voice || {}, { audioUrl });
                await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(merged) } });
                console.log('[Voice] Generated for', slug, audioUrl);
              } catch(ve) { console.error('[Voice] Error:', ve.message); }
            }
          }
        } catch(e) { console.error('[Firecrawl] Error:', e.message); }
      });
    }
    // Generate voice if not already generated
    setImmediate(async () => {
      try {
        const currentPage = await prisma.landingPage.findUnique({ where: { slug } });
        if (!currentPage) return;
        const cs = currentPage.sections ? JSON.parse(currentPage.sections) : {};
        if (cs.voice && cs.voice.audioUrl) return; // already has audio
        const { generateAndUploadVoice } = require('../services/voiceService');
        const vs = (cs.voice && cs.voice.voiceKey) || 'sarah';
        const ct = (cs.voice && cs.voice.customText) || null;
        const bizName = currentPage.businessName || slug;
        const audioUrl = await generateAndUploadVoice(bizName, slug, vs, ct);
        cs.voice = Object.assign({}, cs.voice || {}, { audioUrl });
        await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(cs) } });
        console.log('[Voice] Generated on publish for', slug, audioUrl);
      } catch(ve) { console.error('[Voice] Publish error:', ve.message); }
    });
    return res.json({ ok: true, url: `https://api.qraivy.com/lp/${slug}`, slug, id: page.id });
  } catch (err) {
    console.error('[LP] publish error:', err);
    return res.status(500).json({ error: err.message });
  }
}


// ── POST /lp/push/:slug — send push to all wallet pass holders ──
async function handleSendPush(req, res) {
  try {
    const { slug } = req.params;
    const { title, message, linkUrl } = req.body || {};
    if (!slug) return res.status(400).json({ error: 'missing slug' });
    if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
    const serial = 'sqr-' + slug;
    const devices = await prisma.passDevice.findMany({
      where: { pass: { serialNumber: serial } },
      select: { pushToken: true }
    });
    if (!devices.length) return res.json({ ok: true, sent: 0, message: 'No devices registered yet' });
    // Update pass updatedAt so Apple fetches latest
    await prisma.pass.updateMany({ where: { serialNumber: serial }, data: { updatedAt: new Date() } });
    const { pushUpdateToDevices } = require('../services/apnsService');
    const results = await pushUpdateToDevices(devices);
    // Save message to Pass record so it appears on pass back
    await prisma.pass.updateMany({
      where: { serialNumber: serial },
      data: { lastMsgTitle: title, lastMsg: message, lastMsgLink: linkUrl || null }
    });
    // Save campaign to history
    await prisma.pushCampaign.create({
      data: { slug, title, message, linkUrl: linkUrl || null, sent: results.success }
    });
    console.log('[Push] Sent to', devices.length, 'devices for', slug, results);
    return res.json({ ok: true, sent: results.success, failed: results.failed, total: devices.length });
  } catch(e) {
    console.error('[Push] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── GET /lp/push/:slug/history — get campaign history ──
async function handlePushHistory(req, res) {
  try {
    const { slug } = req.params;
    const campaigns = await prisma.pushCampaign.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return res.json({ ok: true, campaigns });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}


// ── GET /lp/push/:slug/count — get number of devices with pass ──
async function handlePushCount(req, res) {
  try {
    const { slug } = req.params;
    const serial = 'sqr-' + slug;
    const count = await prisma.passDevice.count({
      where: { pass: { serialNumber: serial } }
    });
    return res.json({ ok: true, count });
  } catch(e) {
    return res.status(500).json({ error: e.message });
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

// ── GET /lp/wallet/apple/:slug — generate .pkpass for Smart QR LP ──
async function handleGenerateAppleWalletPass(req, res) {
  try {
    const { slug } = req.params;
    const { generateSmartQRPass } = require('../services/passService');
    const _prisma = require('../prismaClient');

    // Load the Smart QR page
    const page = await _prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });

    const sections = Object.assign({}, page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {}, { businessName: page.businessName });
    const pkpassBuffer = await generateSmartQRPass(slug, sections);

    // Ensure Pass record exists in DB for device registration
    const serialNumber = 'sqr-' + slug;
    const crypto = require('crypto');
    const authToken = crypto.createHash('sha256').update(slug + 'qraivy').digest('hex').slice(0,32);
    await _prisma.pass.upsert({
      where: { serialNumber },
      update: { updatedAt: new Date() },
      create: { serialNumber, passTypeId: process.env.APPLE_PASS_TYPE_ID || 'pass.com.qraivy.wallet', authToken }
    });

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="qraivy-${slug}.pkpass"`,
      'Content-Length': pkpassBuffer.length,
    });
    return res.send(pkpassBuffer);
  } catch (err) {
    console.error('handleGenerateAppleWalletPass error:', err);
    return res.status(500).json({ error: 'Could not generate wallet pass: ' + err.message });
  }
}

module.exports = { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleGenerateAppleWalletPass, handleChatLP, handleSendPush, handlePushCount, handlePushHistory,
};




