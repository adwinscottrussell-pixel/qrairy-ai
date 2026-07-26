const { getUserFromToken } = require('./qrController');
const { pageCache } = require('../utils/pageCache');
const prisma = require('../utils/prismaClient');
const https = require('https');
const { sendWelcomeEmail } = require('../services/emailService');

// Slug-scoped cid resolver (Identity Continuity: welcome/enrollment gap
// close). Single canonical resolution order, used by every page in the
// landing->welcome->wallet->stamp chain so no two pages can independently
// disagree about which cid is authoritative for this slug:
//   1. A valid incoming ?cid= for THIS request always wins (bridges a
//      storage-partition boundary -- Safari tab vs Home Screen, or a
//      wallet barcode/return link -- that localStorage alone can't cross).
//   2. Else a previously-resolved cid already stored under this slug's own
//      key (qraivy_cid_<slug>) -- set once, authoritative for this slug
//      from then on, deliberately NOT re-derived from global cTok every visit.
//   3. Else the legacy global cTok, purely as a backward-compatible
//      fallback for customers who already had one before this slug-scoped
//      key existed -- immediately backfilled into the slug-scoped key so
//      step 2 is what answers on every subsequent visit.
//   4. Else mint a new one.
// Every branch persists to BOTH the slug-scoped key and legacy cTok, and a
// resolved value is never silently replaced by a later, lower-priority
// source within the same call.
const SLUG_CID_HELPER_JS = 'function resolveSlugCid(slug){try{'
  + 'var key="qraivy_cid_"+slug;'
  + 'var qp=null;try{qp=new URLSearchParams(window.location.search).get("cid");}catch(e){}'
  + 'if(qp&&/^[A-Za-z0-9-]{8,64}$/.test(qp)){try{localStorage.setItem(key,qp);}catch(e){}try{localStorage.setItem("cTok",qp);}catch(e){}return qp;}'
  + 'var sc=null;try{sc=localStorage.getItem(key);}catch(e){}'
  + 'if(sc&&/^[A-Za-z0-9-]{8,64}$/.test(sc))return sc;'
  + 'var g=null;try{g=localStorage.getItem("cTok");}catch(e){}'
  + 'if(g&&/^[A-Za-z0-9-]{8,64}$/.test(g)){try{localStorage.setItem(key,g);}catch(e){}return g;}'
  + 'var n=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));'
  + 'try{localStorage.setItem(key,n);}catch(e){}try{localStorage.setItem("cTok",n);}catch(e){}return n;'
  + '}catch(e){return null;}}';

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
    const prompt = 'Based on this scraped website content, generate a JSON object with these exact fields: headline (hero headline), sub (1-2 sentence description), badge (2-4 word short tagline describing the business type e.g. Family Bakery, Fitness Studio, Local Getraenkehandel - match the language of the website), cta (primary button text), cta2 (secondary button text), features (array of exactly 3 objects each with icon (emoji), title, description pulled from real content), hours (opening hours string or null), address (physical address or null), phone (phone number or null), email (contact email address found on the site or null - must contain @ symbol), brandColor (the primary hex brand color of the business e.g. #DA291C for McDonalds, #006241 for Starbucks - make your best guess from the brand), useCase (one of: restaurant, ecommerce, gym, realestate, event, leadgen, portfolio, ai-support), actionLinks (array of action link objects found on the site - only include if a real URL exists - each object has: label (short button label e.g. Menu, Reserve a Table, Order Online, Book a Session, Shop Now, Directions, Contact, Events, Opening Hours), type (one of: menu, booking, order, shop, directions, contact, events, hours, social, other), url (the full absolute URL), description (one short sentence describing what happens when tapped), icon (a single relevant emoji)). Extract actionLinks for: menu/food ordering pages, booking/reservation systems, online shop, directions/maps links, contact pages, events pages, social media profiles. Return ONLY valid JSON, no markdown fences. Generate headline, sub, cta, cta2, and features in the same language as the website content. For German sites generate German text. Always use English for field names/keys.\n\nBusiness: ' + businessName + '\nWebsite: ' + websiteUrl + '\nScraped content:\n' + siteContent;
    const body = JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
    return await new Promise((resolve) => {
      const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); if (!j.content || !j.content[0]) { console.error('[Firecrawl] AI bad response:', JSON.stringify(j).substring(0,200)); resolve(null); return; } const text = j.content[0].text; resolve(JSON.parse(text.replace(/```json|```/g,'').trim())); } catch(e) { console.error('[Firecrawl] AI parse error:', e.message); resolve(null); } });
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
  // ── Template switch ── added by patch-premium-lp ──
  // Safe section parse for template check
  let _tplSections = {};
  try { _tplSections = typeof page.sections === 'string' ? JSON.parse(page.sections) : (page.sections || {}); } catch(_) {}
  if (page.template === 'premium' || _tplSections.template === 'premium') return renderPremiumLP(page);
  // ── End template switch ──
  const content = LP_CONTENT[page.useCase] || LP_CONTENT['restaurant'];
  const bizName = (page.businessName || 'My Business').replace(/\s+[a-z0-9]{3}$/, '').replace(/'/g, '').trim() || (page.businessName || 'My Business');
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
  const _bgColor    = themeBg === 'light' ? (st.lightBackgroundColor || '#ffffff') : themeBg === 'gradient' ? '#0d0d14' : '#0a0a0a';
  const _textColor  = themeBg === 'light' ? '#1a1209' : '#f0ece0';
  const _fontFamily = themeFontStyle === 'elegant' ? 'Georgia,serif' : themeFontStyle === 'bold' ? 'Syne,sans-serif' : 'DM Mono,monospace';
  const _btnRadius  = themeButtonStyle === 'pill' ? '999px' : themeButtonStyle === 'square' ? '4px' : '12px';

  // Section order
  const DEFAULT_ORDER = ['hero','voice','ai','buttons','loop','footer'];
  const sectionOrder = (Array.isArray(storedSections.order) && storedSections.order.length)
    ? storedSections.order : DEFAULT_ORDER;

  const headline = tmpl(content.headline);
  const sub      = tmpl(content.sub);
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://www.qraivy.com/lp/' + slug + '?src=qr')}&color=ffffff&bgcolor=111111&margin=2`;

  const sh = storedSections.hero   || {};
  // Use AI-generated hero text if available and hero title is generic
  if (storedSections.aiGenerated && storedSections.hero) {
    if (storedSections.hero.aiTitle) { sh.title = storedSections.hero.aiTitle; sh.subtitle = storedSections.hero.aiSubtitle || sh.subtitle; }
  }
  const sv = storedSections.voice  || {};
  const sa = storedSections.ai     || {};
  const sl = storedSections.loop   || {};
  const sf = storedSections.footer || {};
  const sg = storedSections.gallery || {};
  const _SK=['instagram','facebook','tiktok','whatsapp','youtube','twitter','linkedin','website','maps','phone','email'];const buttonsHTML = storedButtons.filter(b => b.active !== false && !_SK.includes(b.type)).map(b => {
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

  // Business logo — sections.logo.url (Brand Center) is the single source of
  // truth, with the legacy page.logoUrl column as a fallback for older pages.
  const brandLogoUrl = (storedSections.logo && storedSections.logo.url) || page.logoUrl || '';
  const logoHTML = brandLogoUrl
    ? `<img src="${brandLogoUrl}" class="lp-logo-img" alt="${bizName}" />`
    : `<div class="lp-logo-letter" style="background:${accentDim};border-color:${accentBorder};color:${accent}">${bizName.charAt(0).toUpperCase()}</div>`;
  const logoHTMLFinal = themeLogoMode === 'hidden' ? ''
    : (themeLogoMode === 'image' && brandLogoUrl) ? logoHTML
    : `<div class="lp-logo-letter" style="background:${accentDim};border-color:${accentBorder};color:${accent}">${bizName.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="${page.businessName||bizName||'Qraivy'}"><link rel="apple-touch-icon" href="${brandLogoUrl || 'https://qraivy.com/icon-192.png'}"><link rel="manifest" href="/manifest/${slug}">
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
body.theme-light{background:${_bgColor};color:#111111}
body.theme-light .lp-nav{background:rgba(255,255,255,0.98);border-bottom:1px solid #E8E3DC;box-shadow:none}
body.theme-light .lp-nav-name{color:#111111}
body.theme-light .lp-hero{background:linear-gradient(180deg,#FFFFFF 0%,${_bgColor} 100%);padding:52px 24px 44px}
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
.lp-featured-card-title{font-family:'Syne',sans-serif;font-size:.92rem;font-weight:800;color:#f0ece0;margin-bottom:6px;line-height:1.3}
.lp-featured-card-desc{font-size:.82rem;color:rgba(240,236,224,0.52);line-height:1.55}
.lp-btn-sub,.lp-btn-arr{display:none}
.lp-btn-inner{display:block}
/* Nav */
.lp-nav{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(10,10,10,0.95);backdrop-filter:blur(16px);border-bottom:0.5px solid rgba(255,255,255,0.07)}
.lp-nav-brand{display:flex;align-items:center;gap:10px}
.lp-logo-img{width:32px;height:32px;border-radius:8px;object-fit:contain}
.lp-logo-letter{width:32px;height:32px;border-radius:8px;border:0.5px solid;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1rem;font-weight:800}
.lp-nav-name{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700}
.lp-nav-pill{display:flex;align-items:center;gap:5px;background:${accentDim};border:0.5px solid ${accentBorder};border-radius:99px;padding:4px 10px;font-size:0.68rem;color:${accent};letter-spacing:0.08em}
.lp-nav-dot{width:6px;height:6px;border-radius:50%;background:${accent};animation:lpDot 2s ease-in-out infinite}
@keyframes lpDot{0%,100%{opacity:1}50%{opacity:0.3}}
/* Hero */
.lp-hero{padding:36px 28px 28px;text-align:center;background:linear-gradient(160deg,${accentDim} 0%,transparent 55%)}
.lp-hero-eyebrow{display:inline-flex;align-items:center;gap:6px;border:0.5px solid ${accentBorder};border-radius:99px;padding:5px 14px;font-size:0.6rem;color:${accent};letter-spacing:0.1em;margin-bottom:18px}
.lp-hero-title{font-family:'Inter',sans-serif;font-size:clamp(0.95rem,4vw,1.9rem);font-weight:800;word-break:break-word;overflow-wrap:break-word;hyphens:none;line-height:1.15;letter-spacing:-0.02em;margin-bottom:14px}
.lp-hero-sub{font-size:0.92rem;color:rgba(240,236,224,0.7);max-width:420px;margin:0 auto 28px;line-height:1.75;font-family:'Inter',sans-serif}
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
.lp-chat-msg{display:flex;}.lp-chat-msg-user{justify-content:flex-end;}.lp-chat-bubble{max-width:80%;padding:9px 12px;border-radius:12px;font-size:0.75rem;line-height:1.5;}.lp-chat-msg-ai .lp-chat-bubble{background:rgba(20,20,30,0.85);border:0.5px solid rgba(255,255,255,0.15);color:rgba(240,236,224,0.9);}
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
.lp-voice-info{flex:1;min-width:0}
.lp-voice-name{font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;margin-bottom:2px}
.lp-voice-sub{font-size:0.72rem;color:rgba(240,236,224,0.7)}
.lp-waveform{display:flex;align-items:center;gap:2px;height:28px;overflow:hidden;flex-shrink:0}
.lp-bar{width:3px;background:rgba(255,255,255,0.15);border-radius:2px;transition:height 0.2s}
@keyframes lpBarBounce{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1)}}
.lp-waveform-active .lp-bar{background:rgba(255,255,255,0.85);animation:lpBarBounce 0.8s ease-in-out infinite;transform-origin:bottom}
/* Subscribe */
.lp-subscribe-section{padding:32px 24px 36px;border-top:0.5px solid rgba(255,255,255,0.06)}
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
/* Photo Gallery */
.lp-gallery-section{padding:0 16px 28px}
.lp-gallery-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:800;color:#f0ece0;margin-bottom:14px;letter-spacing:-.01em;text-align:center}
.lp-gallery-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lp-gallery-grid.g1{grid-template-columns:1fr}
.lp-gallery-grid.g3 .lp-gallery-item:first-child,.lp-gallery-grid.g5 .lp-gallery-item:first-child{grid-column:1/-1}
.lp-gallery-item{border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07)}
.lp-gallery-img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.lp-gallery-item.g1 .lp-gallery-img{aspect-ratio:16/9}
.lp-gallery-cap{padding:8px 10px}
.lp-gallery-cap-title{font-size:.75rem;font-weight:700;color:#f0ece0;margin-bottom:2px}
.lp-gallery-cap-desc{font-size:.65rem;color:rgba(240,236,224,0.55);line-height:1.5}
.lp-sub-title{font-family:'Syne',sans-serif;font-size:1.25rem;font-weight:800;margin-bottom:8px;position:relative;z-index:1}
.lp-sub-text{font-size:0.88rem;color:rgba(240,236,224,0.65);margin-bottom:16px;line-height:1.65;position:relative;z-index:1}
.lp-sub-form{display:flex;flex-direction:column;gap:12px;margin-bottom:16px;position:relative}
.lp-sub-input{padding:12px 14px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.12);border-radius:10px;color:#f0ece0;font-family:'DM Mono',monospace;font-size:0.78rem;outline:none}
.lp-sub-input::placeholder{color:rgba(240,236,224,0.65)}
.lp-sub-btn{padding:12px;border:none;border-radius:10px;background:${accent};color:#fff;font-family:'Syne',sans-serif;font-size:0.85rem;font-weight:700;cursor:pointer}
.lp-sub-btn{padding:14px;border:none;border-radius:10px;background:${accent};color:#fff;font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700;cursor:pointer;transition:opacity 0.15s;width:100%}
.lp-wallet-btns{display:flex;flex-direction:column;gap:12px;position:relative;margin-top:8px}
.lp-wallet-btn{padding:14px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;text-align:center;width:100%;transition:opacity 0.15s}
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
.lp-footer-name{font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700}
.lp-footer-url{font-size:0.72rem;color:rgba(240,236,224,0.65);margin-bottom:8px;word-break:break-all}
.lp-footer-powered{font-size:0.72rem;color:rgba(240,236,224,0.6)}
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
  <div class="lp-nav-pill"><span class="lp-nav-dot"></span>${t.aiPowered}</div>
</nav>
${(function() {
  const _socialIcons={instagram:{color:'#E1306C',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>'},facebook:{color:'#1877F2',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'},tiktok:{color:'#000000',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>'},whatsapp:{color:'#25D366',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'},youtube:{color:'#FF0000',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>'},twitter:{color:'#1DA1F2',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>'},linkedin:{color:'#0A66C2',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'},website:{color:'#6366f1',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>'},maps:{color:'#34A853',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'},phone:{color:'#22d47e',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>'},email:{color:'#f59e0b',svg:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>'}};
  const _SOCIAL_KEYS = ['instagram','facebook','tiktok','whatsapp','youtube','twitter','linkedin','website','maps','phone','email'];
  const _activeSocials = (Array.isArray(storedSections.buttons) ? storedSections.buttons : []).filter(b => b.active !== false && b.url && _SOCIAL_KEYS.includes(b.type));
  const _socialIconsHTML = _activeSocials.length > 0 ? '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin:8px 0 4px;">' + _activeSocials.map(b => { const _si = _socialIcons[b.type] || _socialIcons.website; return '<a href="' + b.url + '" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:' + _si.color + ';color:#fff;text-decoration:none;flex-shrink:0;">' + _si.svg + '</a>'; }).join('') + '</div>' : (sh.ctaUrl ? '<a href="' + sh.ctaUrl + '" class="lp-hero-cta-btn">' + (sh.ctaText || t.visitWebsite) + '</a>' : '');
  const heroHTML = `<section class="lp-hero">
  <div class="lp-hero-eyebrow">&#10022; ${sh.badge || 'Qraivy Smart Page'}</div>
  <h1 class="lp-hero-title">${sh.title || headline}</h1>
  <p class="lp-hero-sub">${sh.subtitle || sub}</p>
  ${_socialIconsHTML}
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
    <div class="lp-sub-form"><input class="lp-sub-input" id="lp-email-${slug}" type="email" placeholder="${sl.emailPlaceholder || 'your@email.com'}" /><button class="lp-sub-btn" onclick="lpSubscribe('${slug}')">${sl.buttonLabel || 'Subscribe →'}</button></div>

    <div style="margin-top:16px;display:flex;align-items:flex-start;gap:10px;">
      <input type="checkbox" id="lp-gdpr-${slug}" style="margin-top:3px;accent-color:${accent};width:16px;height:16px;flex-shrink:0;" />
      <label for="lp-gdpr-${slug}" style="font-size:.82rem;color:rgba(255,255,255,0.75);line-height:1.5;cursor:pointer;">${t.gdpr}${bizName}${t.gdprSuffix}</label>
    </div>
    <script>function lpSubscribe(s){var e=document.getElementById('lp-email-'+s),g=document.getElementById('lp-gdpr-'+s),r=document.getElementById('lp-sub-result-'+s);if(!r){r=document.createElement('div');r.id='lp-sub-result-'+s;r.style.cssText='margin-top:8px;padding:6px 10px;border-radius:8px;font-size:.78rem;';var _pi=document.getElementById('lp-email-'+s);if(_pi&&_pi.parentNode)_pi.parentNode.appendChild(r);}if(!e||!e.value||!e.value.includes('@')){r.style.display='block';r.style.color='#f87171';r.textContent='Please enter a valid email.';return;}if(!g||!g.checked){r.style.display='block';r.style.color='#f87171';r.textContent='Please tick the consent box first.';return;}fetch('https://api.qraivy.com/lp/subscribe/'+s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value,gdprConsent:true})}).then(function(x){return x.json();}).then(function(d){r.style.display='block';r.style.color='#4ade80';r.textContent='✅ '+(d.message||'Subscribed!');e.value='';g.checked=false;}).catch(function(){r.style.display='block';r.style.color='#f87171';r.textContent='Something went wrong.';});}</script>
    ${(sl.appleEnabled!==false||sl.googleEnabled!==false)?'<div class="lp-wallet-btns">'+(sl.appleEnabled!==false?`<div class="lp-wallet-cta-wrap"><p class="lp-wallet-cta-hint">👇 Tap to save your pass</p><a href="/lp/wallet/apple/${slug}" class="lp-wallet-btn lp-wallet-btn--apple lp-btn-apple-only" style="text-decoration:none;display:block;">&#9679; Add to Apple Wallet</a></div>`:(''))+(sl.googleEnabled!==false?'<a href="/lp/wallet/google/' + slug + '" class="lp-wallet-btn lp-wallet-btn--google lp-btn-google-only" style="text-decoration:none;display:block;">&#9632; Add to Google Wallet</a>':'')+'<button id="lp-notif-btn" onclick="lpEnableNotifications()" style="display:none;width:100%;margin-top:10px;padding:14px;background:rgba(255,255,255,0.1);border:1.5px solid rgba(255,255,255,0.3);border-radius:12px;color:#fff;font-size:.92rem;font-weight:600;cursor:pointer;">&#128276; Enable Notifications</button></div>':''}
    <script>(function(){try{var c=localStorage.getItem("cTok");if(!c)return;document.querySelectorAll(".lp-wallet-btn--apple, .lp-wallet-btn--google").forEach(function(a){var sep=a.href.indexOf("?")===-1?"?":"&";a.href=a.href+sep+"cid="+encodeURIComponent(c);});}catch(e){}})();</script>
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
  <div class="lp-footer-url">${sf.footerText || ('qraivy.com/lp/' + slug)}</div>
  <div class="lp-footer-powered">Built with <a href="${sf.footerLink || 'https://qraivy.com'}" target="_blank">Qraivy</a><br>AI-powered customer engagement.</div>
</footer>`;
  const ctaHTML = hasEditorSections ? (sectionsHTML ? `<!-- Business Info -->${sectionsHTML}` : '') : `<section class="lp-cta-section">
  <a href="${website}" target="_blank" class="lp-btn lp-btn-primary">${content.cta} &rarr;</a>
  <a href="${website}" target="_blank" class="lp-btn lp-btn-secondary">${content.cta2}</a>
</section>
<!-- Business Info -->
${sectionsHTML}`;
  // Photo Gallery
  const galleryHTML = (sg.enabled === false || !sg.items || !sg.items.filter(function(i){return i.imageUrl&&i.imageUrl.match(/^https?:\/\//)}).length) ? '' : (function(){
    var _valid = (sg.items||[]).filter(function(i){return i.imageUrl&&i.imageUrl.match(/^https?:\/\//)}).slice(0,8);
    var _gc = 'g'+_valid.length;
    var _gt = sg.title || 'Gallery';
    var _cards = _valid.map(function(item){
      var _cap = (item.title||item.description) ? '<div class="lp-gallery-cap">'+(item.title?'<div class="lp-gallery-cap-title">'+item.title+'</div>':'')+(item.description?'<div class="lp-gallery-cap-desc">'+item.description+'</div>':'')+'</div>' : '';
      return '<div class="lp-gallery-item'+(_valid.length===1?' g1':'')+'">'
        +'<img class="lp-gallery-img" src="'+item.imageUrl+'" alt="'+(item.title||_gt)+'" loading="lazy" onerror="this.parentElement.style.display=\'none\'">'
        +_cap+'</div>';
    }).join('');
    return '<section class="lp-gallery-section"><div class="lp-gallery-title">'+_gt+'</div><div class="lp-gallery-grid '+_gc+'">'+_cards+'</div></section>';
  })();
    const sectionMap = { hero: heroHTML, voice: voiceHTML, ai: aiHTML, buttons: buttonsBlock, featured: featuredHTML, loop: loopHTML, info: infoHTML, footer: footerBlock, gallery: galleryHTML };
  const orderedSections = sectionOrder.map(function(k){ return sectionMap[k] || ''; });
  const footerIdx = orderedSections.length - 1;
  var _fi3=-1;if(!sectionOrder.includes('featured')){const _bi=sectionOrder.indexOf('loop');_fi3=_bi!==-1?_bi+1:orderedSections.length-1;orderedSections.splice(_fi3,0,featuredHTML);}else{_fi3=sectionOrder.indexOf('featured');}
  if(!sectionOrder.includes('info')){orderedSections.splice(_fi3+1,0,infoHTML);}
  if(!sectionOrder.includes('gallery')&&galleryHTML){orderedSections.splice(orderedSections.length-1,0,galleryHTML);}
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
        if (voiceSub) voiceSub.textContent = 'Voice generating — refresh in a moment…';
        playing = false;
        voiceBtn.textContent = '▶';
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
(function(){
  var _s=window.location.pathname.split('/').pop();
  if(!('serviceWorker' in navigator&&'PushManager' in window)){return;}
  navigator.serviceWorker.register('/sw.js').then(function(reg){window.__swReg=reg;});
  if(localStorage.getItem('wp_sub_'+_s)){
    if('Notification' in window&&Notification.permission==='granted'){
      (function tryAS(){
        if(window.__swReg){
          fetch('https://www.qraivy.com/lp/webpush/vapid-key/'+_s)
            .then(function(x){return x.json();})
            .then(function(d){
              var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));
              return window.__swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});
            })
            .then(function(s){var j=s.toJSON();return fetch('https://www.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});})
            .then(function(){localStorage.setItem('wp_sub_'+_s,'1');})
            .catch(function(){});
        }else{setTimeout(tryAS,500);}
      })();
    }
    return;
  }
  if(!('Notification' in window)||Notification.permission==='denied'){
    console.log('[Push] Blocked: Notification permission denied or not available');
    return;
  }
  console.log('[Push] Bottom sheet eligible, showing in 600ms');
  var AC='#ff6b00';
  var ICONS={
    bell:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    check:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    spin:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
    alert:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    muted:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
  };
  var STATES={
    idle:{icon:'bell',bg:'linear-gradient(135deg,#fff5f0,#ffe4d6)',ic:AC,title:'Stay updated instantly',desc:'Get special offers, loyalty rewards, and updates from this business.',btn:'Enable Updates',trust:'You can turn this off anytime in your browser settings.'},
    asking:{icon:'spin',bg:'linear-gradient(135deg,#fff5f0,#ffe4d6)',ic:AC,title:'Setting things up…',desc:'',btn:'',trust:''},
    ok:{icon:'check',bg:'linear-gradient(135deg,#f0fdf4,#dcfce7)',ic:'#16a34a',title:"You’re subscribed!",desc:"We’ll notify you about special offers and rewards.",btn:'',trust:''},
    blocked:{icon:'alert',bg:'linear-gradient(135deg,#fef2f2,#fee2e2)',ic:'#dc2626',title:'Notifications are blocked',desc:'Allow notifications in your browser settings to receive updates.',btn:'',trust:''},
    na:{icon:'muted',bg:'linear-gradient(135deg,#f9fafb,#f3f4f6)',ic:'#9ca3af',title:'Notifications unavailable',desc:'Push notifications are not supported on this device or browser.',btn:'',trust:''}
  };
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9990;display:flex;justify-content:center;pointer-events:none;';
  var card=document.createElement('div');
  card.style.cssText='pointer-events:all;position:relative;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -6px 40px rgba(0,0,0,.14);padding:22px 22px 30px;width:100%;max-width:480px;box-sizing:border-box;transform:translateY(110%);transition:transform .38s cubic-bezier(.32,0,.67,0);';
  var xBtn=document.createElement('button');
  xBtn.style.cssText='position:absolute;top:14px;right:14px;background:rgba(0,0,0,.06);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#888;font-size:16px;line-height:1;padding:0;';
  xBtn.innerHTML='&times;';
  xBtn.onclick=function(){localStorage.setItem('wp_sub_'+_s,'dismissed');wrap.style.display='none';};
  var iWrap=document.createElement('div');
  iWrap.style.cssText='width:50px;height:50px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;';
  var iEl=document.createElement('div');
  iEl.style.cssText='width:26px;height:26px;';
  var ttl=document.createElement('div');
  ttl.style.cssText='font-size:1rem;font-weight:700;color:#1a1a1a;margin-bottom:6px;';
  var dsc=document.createElement('div');
  dsc.style.cssText='font-size:.86rem;color:#666;line-height:1.5;margin-bottom:14px;';
  var btn=document.createElement('button');
  btn.style.cssText='width:100%;padding:14px;background:'+AC+';color:#fff;border:none;border-radius:12px;font-size:.94rem;font-weight:700;cursor:pointer;transition:background .13s;';
  btn.onmouseenter=function(){btn.style.background='#e0491a';};
  btn.onmouseleave=function(){btn.style.background=AC;};
  var tst=document.createElement('div');
  tst.style.cssText='font-size:.73rem;color:#aaa;text-align:center;margin-top:10px;';
  function setState(s){
    var c=STATES[s]||STATES.idle;
    iWrap.style.background=c.bg;
    iEl.style.color=c.ic; iEl.innerHTML=ICONS[c.icon]||'';
    ttl.textContent=c.title;
    dsc.textContent=c.desc; dsc.style.display=c.desc?'block':'none';
    btn.textContent=c.btn; btn.style.display=c.btn?'block':'none';
    tst.textContent=c.trust; tst.style.display=c.trust?'block':'none';
    if(s==='ok'||s==='na'){setTimeout(function(){wrap.style.display='none';},2800);}
  }
  iWrap.appendChild(iEl);
  card.appendChild(xBtn); card.appendChild(iWrap); card.appendChild(ttl);
  card.appendChild(dsc); card.appendChild(btn); card.appendChild(tst);
  wrap.appendChild(card); document.body.appendChild(wrap);
  setTimeout(function(){card.style.transform='translateY(0)';},600);
  setState('idle');
  function doSub(){
    setState('asking');
    function sub(reg){
      fetch('https://www.qraivy.com/lp/webpush/vapid-key/'+_s)
        .then(function(x){return x.json();})
        .then(function(d){
          var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));
          return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});
        })
        .then(function(s){var j=s.toJSON();return fetch('https://www.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});})
        .then(function(){localStorage.setItem('wp_sub_'+_s,'1');setState('ok');})
        .catch(function(){wrap.style.display='none';});
    }
    if(window.__swReg){sub(window.__swReg);}else{navigator.serviceWorker.register('/sw.js').then(sub);}
  }
  btn.onclick=function(){
    Notification.requestPermission().then(function(p){
      if(p==='granted'){doSub();}
      else if(p==='denied'){setState('blocked');localStorage.setItem('wp_sub_'+_s,'denied');}
      else{wrap.style.display='none';}
    });
  };
})()
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
<div class="slug">qraivy.com/lp/${slug}</div>
<a href="https://qraivy.com">Create your own AI page &rarr;</a>
</div><script>
(function(){var p=new URLSearchParams(window.location.search);var v=p.get('voice');if(v&&'speechSynthesis'in window){var s=function(){var u=new SpeechSynthesisUtterance(decodeURIComponent(v));u.rate=0.95;u.pitch=1;u.volume=1;window.speechSynthesis.speak(u);};if(document.readyState==='complete'){setTimeout(s,800);}else{window.addEventListener('load',function(){setTimeout(s,800);});}}})();</script></body></html>`;
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
    const bizName = (page.businessName || slug).replace(/-[a-z0-9]{3}$/, '').replace(/-/g, ' ').replace(/w/g, c => c.toUpperCase());
    const businessInfo = sections.businessInfo || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const voiceLang = (sections.voice && sections.voice.voiceLanguage) || 'en';
    const langInstruction = voiceLang === 'de' ? ' You must respond in German (Deutsch) only, regardless of what language the customer writes in.' : '';
    if (!apiKey) return res.json({ reply: 'AI not configured.' });
        const sys = 'You are a friendly AI assistant for ' + bizName + '. Answer customer questions based on the info below. Be very concise - max 3 sentences. No markdown, no bullet points, no headers. Plain conversational text only. If listing options, use commas not bullets.' + langInstruction + (siteContent ? ' Website content: ' + siteContent.slice(0,6000) : '') + (businessInfo.hours ? ' Hours: ' + businessInfo.hours : '') + (businessInfo.address ? ' Address: ' + businessInfo.address : '') + (businessInfo.phone ? ' Phone: ' + businessInfo.phone : '');
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
    const { slug, websiteUrl, useCase, brandColor, logoUrl, sections, qrType, template } = req.body;
    const businessName = ((req.body.businessName||'').replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/\.(de|com|net|org|io)$/i,'').replace(/\s+[a-z0-9]{3}$/,'').trim())||req.body.businessName||'';
    let userId = req.body.userId || null;
    if (!userId && req.headers.authorization) {
      try { userId = await getUserFromToken(req.headers.authorization); } catch(_) {}
    }
    if (!slug || !businessName) return res.status(400).json({ error: 'slug and businessName are required' });

    // ── Plan limit check ──────────────────────────────────────────
    if (userId) {
      const existingPage = await prisma.landingPage.findUnique({ where: { slug } });
      if (!existingPage) {
        // This is a NEW page — check plan limits
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const plan = user ? user.plan : 'free';
        const LIMITS = { free: 1, trial: 1, pro: 10, business: 50, enterprise: 999 };
        const limit = LIMITS[plan] ?? 1;
        const pageCount = await prisma.landingPage.count({ where: { userId } });
        if (pageCount >= limit) {
          return res.status(402).json({
            error: 'plan_limit',
            message: `Your ${plan} plan allows ${limit} Smart QR page${limit === 1 ? '' : 's'}. Upgrade to create more.`,
            limit,
            current: pageCount,
            upgrade: true
          });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────

    // Merge incoming sections with existing DB sections to preserve AI-generated fields
    let mergedSections = sections || {};
    const existing = await prisma.landingPage.findUnique({ where: { slug } });
    if (existing && existing.sections) {
      try {
        const existingS = JSON.parse(existing.sections);
        const preserve = ['aiGenerated','aiGeneratedAt','siteContent','crawlLocked','businessInfo','featured','actionLinks'];
        mergedSections = Object.assign({}, mergedSections);
        preserve.forEach(function(k){ if (existingS[k] !== undefined && mergedSections[k] === undefined) mergedSections[k] = existingS[k]; });
        if (existingS.hero && existingS.hero.aiTitle && mergedSections.hero) {
          mergedSections.hero = Object.assign({ aiTitle: existingS.hero.aiTitle, aiSubtitle: existingS.hero.aiSubtitle }, mergedSections.hero);
          if (mergedSections.hero.badge !== undefined) { /* badge from payload kept */ } else if (existingS.hero.badge) { mergedSections.hero.badge = existingS.hero.badge; }
        }
        if (existingS.voice && existingS.voice.audioUrl && mergedSections.voice) {
          mergedSections.voice = Object.assign({ audioUrl: existingS.voice.audioUrl }, mergedSections.voice);
        }
      } catch(_) {}
    }


    // Detect language from URL on publish
    const _pubIsDeUrl = websiteUrl && (websiteUrl.endsWith('.de') || websiteUrl.includes('.de/'));
    if (_pubIsDeUrl && !mergedSections.language) mergedSections.language = 'de';
    if (!mergedSections.language) mergedSections.language = 'en';
    pageCache.delByPrefix('lp:' + slug);
    pageCache.delByPrefix('stamp:' + slug);
    const page = await prisma.landingPage.upsert({
      where: { slug },
      update: { businessName, websiteUrl, useCase, ...(brandColor ? { brandColor } : {}), ...(logoUrl ? { logoUrl } : {}), userId, sections: JSON.stringify(mergedSections), status: 'live', updatedAt: new Date(), template: template || null },
      create: { slug, businessName, websiteUrl, useCase, brandColor, logoUrl, userId, qrType, sections: JSON.stringify(mergedSections), status: 'live', template: template || null },
    });
    if (websiteUrl && websiteUrl.startsWith('http')) {




      setImmediate(async () => {
        try {
          console.log('[Firecrawl] Starting scrape for', websiteUrl);
          const siteContent = await scrapeWithFirecrawl(websiteUrl);
          // Detect language from URL and content
          const _isDeUrl = websiteUrl && (websiteUrl.endsWith('.de') || websiteUrl.includes('.de/'));
          const _isDeContent = siteContent && (siteContent.match(/\b(und|der|die|das|ist|mit|für|von|auf|ich|wir|sie|nicht|auch|bei|nach|werden|haben)\b/gi) || []).length > 20;
          const _detectedLang = (_isDeUrl || _isDeContent) ? 'de' : 'en';
          console.log('[Firecrawl] scrape result:', siteContent ? 'got ' + siteContent.length + ' chars' : 'null/empty');
          if (siteContent) {
            const aiData = await generateLPFromSite(businessName, websiteUrl, siteContent);
            if (aiData) {
              const cur = await prisma.landingPage.findUnique({ where: { slug } });
              const existing = cur && cur.sections ? JSON.parse(cur.sections) : {};
              const merged = Object.assign({}, existing, {
                hero: Object.assign({}, existing.hero||{}, aiData.headline ? { aiTitle: aiData.headline, aiSubtitle: aiData.sub||'', badge: aiData.badge || aiData.useCase || 'Smart Page' } : {}),
                featured: aiData.features ? aiData.features.map(feat=>({ enabled:true, icon:feat.icon, title:feat.title, description:feat.description })) : existing.featured,
                businessInfo: { hours: aiData.hours||null, address: aiData.address||null, phone: aiData.phone||null, email: (aiData.email && aiData.email.includes('@')) ? aiData.email : null },
                actionLinks: (Array.isArray(aiData.actionLinks) && aiData.actionLinks.length > 0) ? aiData.actionLinks : (existing.actionLinks || null),
                language: existing.language || _detectedLang || 'en',
                aiGenerated: true, aiGeneratedAt: new Date().toISOString(), siteContent, crawlLocked: true
              });
              await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(merged) } });
              pageCache.delByPrefix('lp:' + slug);
              pageCache.delByPrefix('stamp:' + slug);
              console.log('[Firecrawl] Auto-generated LP for', slug);

              // Generate voice welcome message
              try {
                const { generateAndUploadVoice } = require('../services/voiceService');
                const _lang = merged.language || 'en';
                const vs = (merged.voice && merged.voice.voiceKey) || (_lang === 'de' ? 'anna_de' : 'sarah');
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
        // Only generate voice if not already present
        if (cs.voice && cs.voice.audioUrl) { console.log('[Voice] Already exists, skipping'); return; }
        const { generateAndUploadVoice } = require('../services/voiceService');
        const _csLang = cs.language || 'en';
        const vs = (cs.voice && cs.voice.voiceKey) || (_csLang === 'de' ? 'anna_de' : 'sarah');
        const ct = (cs.voice && cs.voice.customText) || null;
        const bizName = currentPage.businessName || slug;
        const audioUrl = await generateAndUploadVoice(bizName, slug, vs, ct);
        cs.voice = Object.assign({}, cs.voice || {}, { audioUrl });
        await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(cs) } });
        console.log('[Voice] Generated on publish for', slug, audioUrl);
      } catch(ve) { console.error('[Voice] Publish error:', ve.message); }
    });
    return res.json({ ok: true, url: 'https://www.qraivy.com/lp/' + slug, slug, id: page.id });
  } catch (err) {
    console.error('[LP] publish error:', err);
    return res.status(500).json({ error: err.message });
  }
}
// ── POST /lp/subscribe/:slug ──
async function handleSubscribe(req, res) {
  try {
    const { slug } = req.params;
    const { email, gdprConsent } = req.body || {};

    // Validate email
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Valid email required' });
    const emailNorm = email.toLowerCase().trim();
    if (!emailNorm.includes('@') || emailNorm.length < 5) return res.status(400).json({ error: 'Valid email required' });
    if (!gdprConsent) return res.status(400).json({ error: 'GDPR consent required' });

    // Get landing page for userId and bizName
    const lpPage = await prisma.landingPage.findUnique({ where: { slug } });
    const userId = lpPage ? lpPage.userId : null;
    const bizName = lpPage ? (lpPage.businessName || slug) : slug;

    // Check for existing subscriber
    const existing = await prisma.subscriber.findFirst({
      where: { email: emailNorm, slug, source: 'email' }
    });

    let subscriber;
    let sendWelcome = false;

    if (existing) {
      if (existing.status === 'unsubscribed') {
        subscriber = await prisma.subscriber.update({
          where: { id: existing.id },
          data: { status: 'subscribed', unsubscribedAt: null, subscribedAt: new Date(), updatedAt: new Date() }
        });
        sendWelcome = true;
        console.log('[Subscribe] Reactivated:', emailNorm, slug);
      } else {
        return res.json({ ok: true, message: '${t.alreadySubscribed}' });
      }
    } else {
      subscriber = await prisma.subscriber.create({
        data: { email: emailNorm, slug, gdprConsent: true, userId, source: 'email', status: 'subscribed', subscribedAt: new Date() }
      });
      sendWelcome = true;
      console.log('[Subscribe] New subscriber:', emailNorm, slug);
    }

    if (sendWelcome) {
      sendWelcomeEmail(emailNorm, { bizName, slug }).catch(e => console.error('[Welcome Email]', e.message));
    }

    // Resend contact sync — async, non-blocking, non-fatal
    if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
      syncResendContact(emailNorm, process.env.RESEND_AUDIENCE_ID)
        .then(function(contactId) {
          if (contactId && subscriber) {
            prisma.subscriber.update({ where: { id: subscriber.id }, data: { resendContactId: contactId } })
              .catch(e => console.error('[Resend] Store contactId failed:', e.message));
          }
        })
        .catch(e => console.error('[Resend] Sync failed (non-fatal):', e.message));
    }

    return res.json({ ok: true, message: 'Subscribed successfully' });
  } catch(e) {
    console.error('[Subscribe] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function syncResendContact(email, audienceId) {
  try {
    const { Resend } = require('resend');
    const client = new Resend(process.env.RESEND_API_KEY);
    const result = await client.contacts.create({ audienceId, email, unsubscribed: false });
    return (result && result.data && result.data.id) || null;
  } catch(e) {
    console.error('[Resend] Contact sync error:', e.message);
    return null;
  }
}
// ── GET /lp/subscribers/:slug ──
async function handleGetSubscribers(req, res) {
  try {
    const { slug } = req.params;
    const subscribers = await prisma.subscriber.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ ok: true, count: subscribers.length, subscribers });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── POST /lp/push/:slug — send push to all wallet pass holders ──
async function handleWebPushSubscribe(req, res) {
  try {
    const { slug } = req.params;
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys) return res.status(400).json({ error: 'missing subscription data' });
    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      update: { slug, p256dh: keys.p256dh, auth: keys.auth },
      create: { slug, endpoint, p256dh: keys.p256dh, auth: keys.auth }
    });
    return res.json({ ok: true });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

async function handleWebPushVapidKey(req, res) {
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}

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
    // No Apple devices is fine — still send web push and email below
    let results = { success: 0, failed: 0 };
    if (devices.length) {
      // Update pass updatedAt so Apple fetches latest
      await prisma.pass.updateMany({ where: { serialNumber: serial }, data: { updatedAt: new Date() } });
      const { pushUpdateToDevices } = require('../services/apnsService');
      results = await pushUpdateToDevices(devices);
      // Save message to Pass record so it appears on pass back
      await prisma.pass.updateMany({ where: { serialNumber: serial }, data: { lastMsgTitle: title, lastMsg: message, lastMsgLink: linkUrl || null } });
      // Save campaign to history
      await prisma.pushCampaign.create({ data: { slug, title, message, linkUrl: linkUrl || null, sent: results.success } });
    }
    // Also send email to all subscribers
    const emailSubs = await prisma.subscriber.findMany({ where: { slug, gdprConsent: true }, select: { id: true, email: true } });
    let emailResults = { success: 0, failed: 0 };


    if (emailSubs.length > 0) {
      const { sendCampaignEmail, sendWelcomeEmail } = require('../services/emailService');
      const page = await prisma.landingPage.findUnique({ where: { slug } });
      emailResults = await sendCampaignEmail(emailSubs, { title, message, linkUrl, bizName: page?.businessName || slug, slug });
    }
    // Also send web push to browser subscribers
    const webSubs = await prisma.webPushSubscription.findMany({ where: { slug } });
    let webPushSent = 0;
    if (webSubs.length > 0) {
      const { sendWebPush } = require('../services/webPushService');
      for (const sub of webSubs) {
        const r = await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title, body: message, url: linkUrl || ('https://www.qraivy.com/lp/' + slug), icon: 'https://qraivy.com/icon-192.png' });
        if (r.ok) webPushSent++;
      }
    }
    console.log('[Push] Sent to', devices.length, 'Apple devices +', webPushSent, 'web push for', slug, results);
    console.log('[Email] Sent to', emailSubs?.length || 0, 'subscribers', emailResults);

    // Per-channel breakdown — the accurate report this endpoint was missing.
    const walletReport  = { attempted: devices.length, sent: results.success, failed: results.failed };
    const emailReport   = { attempted: emailSubs.length, sent: emailResults.success, failed: emailResults.failed };
    const webPushFailed = webSubs.length - webPushSent;
    const webPushReport = { attempted: webSubs.length, sent: webPushSent, failed: webPushFailed };

    return res.json({
      ok: true,
      // Legacy scalar fields, preserved unchanged for existing clients.
      // `sent`/`failed`/`total` are wallet-channel only, exactly as before
      // this change — `total` remains a number (devices.length), never an
      // object. `emailSent`/`emailFailed` already existed and are unchanged.
      sent: results.success,
      failed: results.failed,
      total: devices.length,
      emailSent: emailResults.success,
      emailFailed: emailResults.failed,
      // New, accurate per-channel breakdown.
      wallet: walletReport,
      email: emailReport,
      webPush: webPushReport,
      // Combined totals across all channels — a new field, distinct from
      // the legacy wallet-only `total` above.
      deliveryTotal: {
        attempted: walletReport.attempted + emailReport.attempted + webPushReport.attempted,
        sent: walletReport.sent + emailReport.sent + webPushReport.sent,
        failed: walletReport.failed + emailReport.failed + webPushReport.failed,
      },
    });
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
    const _cacheKey = 'lp:' + slug;
    let page = pageCache.get(_cacheKey);
    if (!page) {
      page = await prisma.landingPage.findUnique({ where: { slug } });
      if (page && page.status !== 'draft') pageCache.set(_cacheKey, page);
    }
    if (!page || page.status === 'draft') return res.status(404).send(render404(slug));
    // Scan tracking — one increment per real (non-preview) request. Fire-and-forget
    // and never allowed to block or break the page response, matching the QR-redirect
    // system's existing scan-tracking philosophy in scanTracker.js. Preview/cache-bust
    // requests (?preview= or ?t=, already used above for Cache-Control) are excluded
    // so editor previews and forced-refresh admin views don't inflate the count.
    if (!req.query.preview && !req.query.t) {
      setImmediate(() => {
        prisma.landingPage.update({
          where: { slug },
          data: { scanCount: { increment: 1 } },
        }).catch(err => console.error('[LP] scan count increment error:', err.message));
      });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    if (req.query.preview || req.query.t) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60');
    }
    // Premium is the only template actually in use — go straight there
    // instead of through renderLP's legacy template switch, which has its
    // own undefined-variable bugs (t.tagline, t.aiPowered, ...) left over
    // from being a separate, no-longer-maintained code path.
    const _lpHtml = renderPremiumLP(page);
    if (!req.query.preview && !req.query.t && _lpHtml.includes('<head>')) {
      try {
        const _stampKey = 'stamp:' + slug;
        let _lset = pageCache.get(_stampKey);
        if (_lset === null) {
          _lset = await prisma.stampSettings.findUnique({ where: { slug } });
          pageCache.set(_stampKey, _lset || false); // cache null as false
        }
        if (_lset === false) _lset = null;
        if (_lset && _lset.enabled) {
          const _es = '<scr' + 'ipt>' + SLUG_CID_HELPER_JS + '(function(){try{var s="' + slug + '";var c=resolveSlugCid(s);if(!localStorage.getItem("wEnr_"+s)){var u=new URL("/lp/welcome/"+s,window.location.origin);if(c)u.searchParams.set("cid",c);window.location.replace(u.toString());}}catch(_e){}})();<\/scr' + 'ipt>';
          return res.send(_lpHtml.replace('<head>', '<head>' + _es));
        }
      } catch(_eg) {}
    }
    return res.send(_lpHtml);
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
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const pages = await prisma.landingPage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { id:true, slug:true, businessName:true, useCase:true, brandColor:true, status:true, scanCount:true, createdAt:true } });
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
    pageCache.delByPrefix('lp:' + slug);
    pageCache.delByPrefix('stamp:' + slug);
    // Fix 3: StampToken has no Prisma relation to LandingPage — it's joined
    // only by the plain `slug` string, the same convention already used by
    // StampSettings/Pass/LoyaltyCustomer/WebPushSubscription (see schema
    // comment above the Deal model). Confirmed no FK exists, so this is
    // safe with no schema or migration change. Deleting it here closes the
    // physical-tag reactivation gap — a deleted page's old NFC/QR link can
    // no longer pass the token-validity check at all. Pass, PassDevice,
    // PassRegistration, StampEntry, RewardEvent, and LoyaltyCustomer are
    // deliberately left untouched — historical records, never deleted here.
    await prisma.$transaction([
      prisma.stampToken.deleteMany({ where: { slug } }),
      prisma.landingPage.delete({ where: { slug } }),
    ]);
    return res.json({ ok: true, success: true });
  } catch (err) {
    console.error('[LP] delete error:', err);
    return res.status(500).json({ error: err.message });
  }
}


// ── GET /lp/card/:slug — loyalty card download page ──
async function handleLoyaltyCardPage(req, res) {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).send('Not found');
    const sections = page.sections ? JSON.parse(page.sections) : {};
    // Brand color comes from the Smart Landing Page only — single source of
    // truth shared with the actual Apple/Google Wallet pass.
    const color = (sections.theme && sections.theme.accentColor) || '#ff5a1f';
    const bizName = (page.businessName || slug).replace(/s+[a-z0-9]{3}$/, '').trim();
    // Business logo — sections.logo.url (Brand Center) is the single source
    // of truth, with the legacy page.logoUrl column as a fallback.
    const logoUrl = (sections.logo && sections.logo.url) || page.logoUrl || '';
    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    const goal = settings ? settings.goal : 10;
    const rewardName = settings ? settings.rewardName : 'Free item';
    // Identity Continuity: read the SAME per-customer serial
    // handleStampConfirm writes to, never the legacy shared "sqr-{slug}"
    // bucket, when a cid is known. Read-only lookup -- never creates/
    // upserts a Pass. Missing cid falls back to the shared bucket exactly
    // like before this fix, so behavior for a customer with no cid at all
    // is unchanged.
    const cid = (req.query && req.query.cid) ? String(req.query.cid).slice(0, 64) : null;
    const serial = cid ? `sqr-${slug}-${cid}` : 'sqr-' + slug;
    const pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
    const stampCount = pass ? (pass.stampCount || 0) : 0;
    const logoHtml = logoUrl ? '<div class="logo"><img src="' + logoUrl + '" alt="logo"></div>' : '<div class="logo">' + bizName.charAt(0) + '</div>';
    const dots = Array.from({length: goal}, (_, i) => i < stampCount ? '<div class="dot filled">✓</div>' : '<div class="dot"></div>').join('');
    // No valid cid in the URL yet -- resolve one (URL > slug-scoped storage
    // > legacy cTok > mint) and redirect to this same page with it attached,
    // before any stamp-count markup is ever painted.
    const cidBootstrapScript = cid ? '' : ('<script>' + SLUG_CID_HELPER_JS + '(function(){try{var s="' + slug + '";var c=resolveSlugCid(s);if(!c){console.error("[LoyaltyCard] customer id unavailable");return;}var u=new URL(window.location.href);u.searchParams.set("cid",c);window.location.replace(u.toString());}catch(e){console.error("[LoyaltyCard] cid redirect failed");}})();</script>');
    const html = '<!DOCTYPE html><html lang="en"><head>' + cidBootstrapScript + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + bizName + ' Loyalty Card</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0ece0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}.card{background:' + color + ';border-radius:20px;padding:32px 24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.logo{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:#fff;overflow:hidden}.logo img{width:100%;height:100%;object-fit:cover;border-radius:50%}.biz-name{font-size:1.4rem;font-weight:800;color:#fff;margin-bottom:4px}.reward-sub{font-size:.85rem;color:rgba(255,255,255,0.75);margin-bottom:24px}.dots{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:24px}.dot{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4)}.dot.filled{background:rgba(255,255,255,0.92);border-color:#fff;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;color:rgba(0,0,0,0.5)}.stamp-count{font-size:.78rem;color:rgba(255,255,255,0.7);margin-bottom:16px;margin-top:-10px}.wallet-btn{display:block;background:#000;color:#fff;border-radius:12px;padding:16px 28px;font-size:1rem;font-weight:700;text-decoration:none;width:100%;margin-bottom:12px}.powered{margin-top:20px;font-size:.7rem;color:rgba(255,255,255,0.3)}.powered a{color:rgba(255,255,255,0.4);text-decoration:none}</style></head><body><div class="card">' + logoHtml + '<div class="biz-name">' + bizName + '</div><div class="reward-sub">Sammle ' + goal + ' Stempel — erhalte ' + rewardName + '</div><div class="dots">' + dots + '</div><div class="stamp-count">' + stampCount + ' von ' + goal + ' Stempeln gesammelt</div><a class="wallet-btn" id="walletBtn" href="/lp/wallet/apple/' + slug + '" id="appleWalletBtn">+ Zu Apple Wallet hinzuf&#252;gen</a><a class="wallet-btn" id="googleWalletBtn" href="/lp/wallet/google/' + slug + '" style="background:#4285F4;color:#fff;margin-top:10px;">Zu Google Wallet hinzuf&#252;gen</a></div><div class="powered">Powered by <a href="https://qraivy.com">Qraivy</a></div><script>(function(){try{var CID=' + JSON.stringify(cid) + ';var ab2=document.getElementById("walletBtn"),gb2=document.getElementById("googleWalletBtn");if(CID){if(ab2)ab2.href=ab2.href+(ab2.href.indexOf("?")===-1?"?":"&")+"cid="+encodeURIComponent(CID);if(gb2)gb2.href=gb2.href+(gb2.href.indexOf("?")===-1?"?":"&")+"cid="+encodeURIComponent(CID);}}catch(e){}})();document.getElementById("walletBtn").addEventListener("click",function(){setTimeout(function(){window.location.href="/lp/' + slug + (cid ? '?cid=' + encodeURIComponent(cid) : '') + '";},3500);});(function(){var ua=navigator.userAgent;var isIOS=/iPhone|iPad|iPod/i.test(ua);var isAndroid=/Android/i.test(ua);var ab=document.getElementById("walletBtn");var gb=document.getElementById("googleWalletBtn");if(isIOS){if(gb)gb.style.display="none";}else if(isAndroid){if(ab)ab.style.display="none";}else{if(ab)ab.style.display="none";if(gb)gb.style.display="none";}})();</script></body></html>';
    return res.send(html);
  } catch(e) { console.error('[LoyaltyCard] Error:', e.message); return res.status(500).send('Error'); }
}

// ── GET /lp/wallet/apple/:slug — generate .pkpass for Smart QR LP ──
async function handleGenerateAppleWalletPass(req, res) {
  try {
    const { slug } = req.params;
    const { generateSmartQRPass } = require('../services/passService');
    const _prisma = require('../utils/prismaClient');

    // Load the Smart QR page
    const page = await _prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });

    const sections = Object.assign({}, page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {}, { businessName: page.businessName, websiteUrl: page.websiteUrl });

    // Compute the per-customer serial/auth token ONCE and use the SAME values
    // both inside the embedded pass.json and in the DB upsert below. Apple's
    // device-registration callback looks up the Pass row by exactly the
    // serialNumber + authToken that were embedded in the file the device
    // installed — if either value were computed differently in two places
    // (as they previously were), every registration would silently fail to
    // match, and that customer would never receive push updates again.
    const _cid = req.query.cid || null;
    const serialNumber = _cid ? 'sqr-' + slug + '-' + _cid : 'sqr-' + slug;
    const crypto = require('crypto');
    const authToken = crypto.createHash('sha256').update(serialNumber + (process.env.PASS_AUTH_SECRET || 'qraivy-fallback-change-me')).digest('hex').slice(0,32);

    const pkpassBuffer = await generateSmartQRPass(slug, sections, { cid: _cid, serialNumber, authToken });

    // Ensure Pass record exists in DB for device registration
    await _prisma.pass.upsert({
      where: { serialNumber },
      update: { updatedAt: new Date(), authToken, slug },
      create: { serialNumber, passTypeId: process.env.APPLE_PASS_TYPE_ID || 'pass.com.qraivy.wallet', authToken, slug }
    });
    if (_cid) { // mark customer as wallet holder in LoyaltyCustomer table
      try {
        await _prisma.loyaltyCustomer.upsert({
          where: { slug_customerId: { slug, customerId: _cid } },
          create: { slug, customerId: _cid, hasWallet: true },
          update: { hasWallet: true }
        });
      } catch(_we) { console.error('[Wallet] LoyaltyCustomer upsert error:', _we.message); }
    }
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

// ── POST /lp/upload-logo/:slug — business logo upload (Brand Center) ──
// Returns a Cloudinary URL. The editor stores it as sections.logo.url and
// includes it in the next Publish, same as every other branding field —
// this endpoint does not write to the live page itself.
async function handleUploadLogo(req, res) {
  try {
    const { slug } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    if (page.userId && req.userId && page.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { uploadLogo } = require('../services/logoUploadService');
    const result = await uploadLogo(req.file.buffer, slug);
    return res.json({ url: result.secure_url });
  } catch (err) {
    console.error('[UploadLogo] Error:', err.message);
    return res.status(500).json({ error: 'Logo upload failed: ' + err.message });
  }
}

// ── POST /lp/upload-strip/:slug — wallet hero/strip photo upload ──────
// Optional photo shown as the banner inside the Apple Wallet pass, in
// place of the generated gradient. Returns a Cloudinary URL; the editor
// stores it as sections.walletHero.url and includes it in the next Publish.
async function handleUploadStrip(req, res) {
  try {
    const { slug } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    if (page.userId && req.userId && page.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { uploadStrip } = require('../services/stripUploadService');
    const result = await uploadStrip(req.file.buffer, slug);
    return res.json({ url: result.secure_url });
  } catch (err) {
    console.error('[UploadStrip] Error:', err.message);
    return res.status(500).json({ error: 'Wallet banner upload failed: ' + err.message });
  }
}


// ── LOYALTY STAMP SYSTEM ─────────────────────────────────────────────────────

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

async function getOrCreateStampToken(slug) {
  const now = new Date();
  const existing = await prisma.stampToken.findFirst({
    where: { slug, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) return existing.token;
  const token = generateToken();
  const expiresAt = new Date(now);
  expiresAt.setHours(23, 59, 59, 999);
  await prisma.stampToken.create({ data: { slug, token, expiresAt } });
  return token;
}

async function getNFCStampToken(slug) {
  const now = new Date();
  // NFC tags are physically static, so their token must stay valid for a long
  // time. getOrCreateStampToken (the dashboard's daily-rotating QR code) writes
  // into this same table with a same-day expiry — only reuse an existing token
  // here if it has substantial remaining lifetime, so we never inherit one of
  // those short-lived QR tokens and silently break a physical NFC tag the next day.
  const minLifetime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.stampToken.findFirst({
    where: { slug, expiresAt: { gt: minLifetime } },
    orderBy: { expiresAt: 'desc' }
  });
  if (existing) return existing.token;
  const token = generateToken();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await prisma.stampToken.create({ data: { slug, token, expiresAt } });
  return token;
}

async function handleGetNFCToken(req, res) {
  try {
    const { slug } = req.params;
    const token = await getNFCStampToken(slug);
    const stampUrl = `https://www.qraivy.com/stamp/${slug}/${token}`;
    return res.json({ token, stampUrl, nfcUrl: stampUrl });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

// GET /stamp/:slug/:token — renders a page only. Performs NO database writes
// and sets NO cookie, because Android's NFC "tap to open" flow silently
// prefetches this URL in the background (to build the notification preview)
// before the user ever sees a page. If this handler had side effects, that
// background prefetch alone would consume the stamp and lock out the real
// visit. The actual stamp only happens via the JS-triggered POST below,
// which a background prefetch (HTML-only, no script execution) never runs.
async function handleStamp(req, res) {
  try {
    const { slug, token } = req.params;
    const now = new Date();
    const validToken = await prisma.stampToken.findFirst({
      where: { slug, token, expiresAt: { gt: now } }
    });
    if (!validToken) {
      return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid</title><style>body{background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}</style></head><body><div><div style="font-size:3rem">❌</div><h2>Invalid stamp token</h2><p style="color:rgba(255,255,255,0.5);margin-top:8px">This QR code has expired. Ask staff for the latest code.</p></div></body></html>`);
    }
    // Fix 1: a deleted LandingPage must not silently keep accepting stamps.
    // The physical NFC tag/QR is a fixed real-world object that outlives
    // whatever page it was originally created for — this check makes that
    // explicit rather than relying only on StampToken cleanup elsewhere.
    // Read-only: never creates or updates a Pass, never reaches confirm.
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) {
      return res.status(410).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inactive</title><style>body{background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}</style></head><body><div><div style="font-size:3rem">🚫</div><h2>This loyalty program is no longer active.</h2></div></body></html>`);
    }
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stamping…</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;overflow:hidden}.wrap{position:relative;z-index:1}.emoji{font-size:4rem;animation:pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)}h1{font-size:1.8rem;margin:12px 0 8px;font-weight:800}p{color:rgba(255,255,255,0.6);font-size:.9rem;margin:6px 0}.dots{margin:20px 0;line-height:2}.confetti-piece{position:fixed;width:10px;height:10px;border-radius:2px;animation:fall linear forwards}@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}@keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}</style></head><body><div class="wrap" id="wrap"><div class="emoji">⏳</div><h1>Stamping…</h1></div><script>(function(){\n'
      + 'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}\n'
      + 'function spawnConfetti(burst){var colors=["#ff5a1f","#22c55e","#3b82f6","#f59e0b","#ec4899","#8b5cf6","#06b6d4"];for(var i=0;i<80;i++){var c=document.createElement("div");c.className="confetti-piece";c.style.cssText="left:"+Math.random()*100+"vw;top:-20px;background:"+colors[Math.floor(Math.random()*colors.length)]+";width:"+(6+Math.random()*8)+"px;height:"+(6+Math.random()*8)+"px;border-radius:"+(Math.random()>0.5?"50%":"2px")+";animation-duration:"+(1.5+Math.random()*2)+"s;animation-delay:"+(Math.random()*0.8)+"s;";document.body.appendChild(c);}if(burst){var BC=["#fbbf24","#fcd34d","#fff","#22c55e","#ef4444","#3b82f6","#ec4899"];for(var b=0;b<160;b++){var p=document.createElement("div");p.className="burst-piece";var a=(b/160)*Math.PI*2;var d=120+Math.random()*320;var ex=Math.cos(a)*d;var ey=Math.sin(a)*d-80;var sz=4+Math.random()*8;p.style.cssText="position:fixed;left:50%;top:50%;width:"+sz+"px;height:"+sz+"px;background:"+BC[Math.floor(Math.random()*BC.length)]+";border-radius:"+(Math.random()>0.5?"50%":"2px")+";z-index:10;pointer-events:none;transform:translate(-50%,-50%);transition:transform 1.4s cubic-bezier(0.15,0.7,0.3,1),opacity 1.6s ease-out;opacity:1;box-shadow:0 0 8px rgba(255,200,50,0.4);";document.body.appendChild(p);(function(el,dx,dy){setTimeout(function(){el.style.transform="translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px)) rotate("+(Math.random()*720)+"deg)";el.style.opacity="0";},10);})(p,ex,ey);}setTimeout(function(){document.querySelectorAll(".burst-piece").forEach(function(el){el.remove();});},2500);}setTimeout(function(){document.querySelectorAll(".confetti-piece").forEach(function(el){el.remove();});},4000);}\n'
      + 'function render(d){var wrap=document.getElementById("wrap");\n'
      + 'if(d.status==="invalid"){wrap.innerHTML=\'<div class="emoji">❌</div><h1>Invalid stamp token</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">This QR code has expired. Ask staff for the latest code.</p>\';return;}\n'
      + 'if(d.status==="already"){wrap.innerHTML=\'<div class="emoji">⏱️</div><h1>Already stamped</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">You already got a stamp in the last hour. Come back next time!</p>\';return;}\n'
      + 'if(d.status==="error"){wrap.innerHTML=\'<div class="emoji">⚠️</div><h1>Something went wrong</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">Please try tapping again.</p>\';return;}\n'
      // Fix 4: the confirm endpoint's inactive-program response uses
      // {ok:false, error:...} (not the status:"invalid"/"already"/"error"
      // shape above) — without this explicit check the code below would
      // fall through and render an endless/garbage "success" state instead
      // of stopping cleanly. No retry, no success shown.
      + 'if(d.ok===false){wrap.innerHTML=\'<div class="emoji">🚫</div><h1>This loyalty program is no longer active.</h1>\';return;}\n'
      + 'var goal=d.goal,newCount=d.newCount,rewardReady=d.rewardReady,rewardName=esc(d.rewardName),slug=d.slug;\n'
      + 'var dots="";for(var i=0;i<goal;i++){dots+=\'<span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:\'+(i<newCount?(rewardReady?"#22c55e":"#ff5a1f"):"rgba(255,255,255,0.15)")+\';margin:3px"></span>\';}\n'
      + 'wrap.innerHTML=\'<div class="emoji">\'+(rewardReady?"🎉":"✅")+\'</div><h1>\'+(rewardReady?"Belohnung bereit!":"Stempel hinzugefügt!")+\'</h1><p>\'+(rewardReady?"Zeige deinen Pass für: "+rewardName:newCount+" von "+goal+" Stempeln gesammelt")+\'</p><div class="dots">\'+dots+\'</div>\'+(rewardReady?\'<p style="color:#22c55e;font-weight:700;font-size:1.1rem;margin-top:12px">Show your wallet pass to redeem</p>\':\'<p style="color:rgba(255,255,255,0.4);font-size:.8rem;margin-top:8px">\'+(goal-newCount)+\' Stempel noch bis zu deinem \'+rewardName+\'</p>\')+\'<a href="/lp/\'+slug+\'" style="display:inline-block;margin-top:20px;padding:10px 24px;background:rgba(255,255,255,0.1);color:#fff;border-radius:10px;text-decoration:none;font-size:.85rem">View your pass</a>\';\n'
      + 'spawnConfetti(rewardReady);\n'
      + 'try{fetch("/stamp/"+slug+"/customer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cid:window.__cid})}).catch(function(){});}catch(e){}}\n'
      + SLUG_CID_HELPER_JS
      // Identity Continuity: resolveSlugCid() implements the shared 4-step
      // resolution order (URL cid > slug-scoped storage > legacy global
      // cTok > mint new) -- a cid supplied via the URL (e.g. from the
      // customer's own already-installed Wallet pass barcode, or carried
      // over from the welcome/enrollment redirect) takes priority over a
      // fresh storage read, so a stamp can never silently create or target
      // a second Pass the installed wallet pass isn't registered to.
      + 'try{window.__cid=resolveSlugCid(' + JSON.stringify(slug) + ');}catch(e){window.__cid=null;}\n'
      + 'fetch(window.location.pathname+"/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cid:window.__cid})}).then(function(r){return r.json();}).then(render).catch(function(){render({status:"error"});});\n'
      + '})();</script></body></html>';
    return res.status(200).send(html);
  } catch(e) {
    console.error('[Stamp] Error:', e.message);
    return res.status(500).send('Error processing stamp');
  }
}

// POST /stamp/:slug/:token/confirm — performs the actual stamp. Only ever
// invoked by real JS execution in handleStamp's rendered page, never by a
// background prefetch (which only fetches HTML and never runs scripts).
async function handleStampConfirm(req, res) {
  try {
    const { slug, token } = req.params;
    const cid = (req.body && req.body.cid) ? String(req.body.cid).slice(0, 64) : null;
    const now = new Date();
    const validToken = await prisma.stampToken.findFirst({
      where: { slug, token, expiresAt: { gt: now } }
    });
    if (!validToken) return res.json({ status: 'invalid' });

    // Fix 2: independently re-check LandingPage existence — never rely
    // solely on the GET route's check, since this endpoint can be called
    // directly. Deliberately placed before cid/serial resolution, Pass
    // lookup/creation/update, StampEntry creation, reward logic, and both
    // wallet updates, so a deleted page's old link can never touch any of
    // that or fire a push notification.
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) {
      return res.status(410).json({ ok: false, error: 'This loyalty program is no longer active.' });
    }

    // Each customer gets their OWN Pass record (and therefore their own stamp
    // count, on their own wallet pass) when we know their cid. Without a cid
    // (e.g. JS/localStorage unavailable) we fall back to one shared pass for
    // the business, same as before this customer-tracking existed.
    const serial = cid ? `sqr-${slug}-${cid}` : 'sqr-' + slug;
    let pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
    if (!pass) { // auto-create so customers can stamp on first tap without having added a wallet yet
      const _cr = require('crypto');
      const _at = _cr.createHash('sha256').update(serial + 'qraivy').digest('hex').slice(0, 32);
      try {
        pass = await prisma.pass.create({
          data: { serialNumber: serial, passTypeId: process.env.APPLE_PASS_TYPE_ID || 'pass.com.qraivy.wallet', authToken: _at, stampCount: 0, slug }
        });
      } catch(_ce) {
        pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
        if (!pass) return res.json({ status: 'error' });
      }
    }
    // Anti-abuse cooldown is scoped PER CUSTOMER (this pass's own lastStampAt),
    // not per-business — a physical NFC tag has no identity of its own, so a
    // shared cooldown would block different people tapping the same card.
    if (pass.lastStampAt && now.getTime() - new Date(pass.lastStampAt).getTime() < 60 * 60 * 1000) {
      return res.json({ status: 'already' });
    }

    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    const goal = settings ? settings.goal : 10;
    const newCount = Math.min((pass.stampCount || 0) + 1, goal);
    const rewardReady = newCount >= goal;
    const previouslyReady = pass.rewardReady;
    await prisma.pass.update({ where: { id: pass.id }, data: { stampCount: newCount, rewardReady, totalStamps: { increment: 1 }, lastStampAt: now, updatedAt: now, slug } });
    await prisma.stampEntry.create({ data: { slug, passId: pass.id, source: 'qr' } });
    if (rewardReady && !previouslyReady) {
      try {
        await prisma.rewardEvent.create({ data: { slug, passId: pass.id, rewardText: settings ? settings.rewardName : 'Free item', status: 'earned' } });
      } catch(e) { console.error('[Stamp] RewardEvent create error:', e.message); }
    }
    const rewardName = settings ? settings.rewardName : 'Free item';
    const devices = await prisma.passDevice.findMany({ where: { passId: pass.id }, select: { pushToken: true } });
    if (devices.length) {
      try {
        const { pushUpdateToDevices } = require('../services/apnsService');
        const _pushResult = await pushUpdateToDevices(devices);
        console.log('[Stamp] APNs push for', pass.serialNumber, '—', _pushResult.success, 'sent,', _pushResult.failed, 'failed', _pushResult.errors.length ? JSON.stringify(_pushResult.errors) : '');
      } catch(e) { console.error('[Stamp] Push error:', e.message); }
    } else {
      console.log('[Stamp] No devices registered for', pass.serialNumber, '— push skipped');
    }
    try {
      const { updateGoogleWalletStamps } = require('../services/googleWalletService');
      await updateGoogleWalletStamps(slug, newCount, cid);
    } catch(e) { console.error('[Stamp] Google Wallet update error:', e.message); }
    // Web Push: deep link customer to their loyalty card
    try {
      const webSubs = await prisma.webPushSubscription.findMany({ where: { slug } });
      if (webSubs.length > 0) {
        const { sendWebPush } = require('../services/webPushService');
        const title = rewardReady ? '🎉 Reward ready!' : '✅ Stamp collected!';
        const body = rewardReady
          ? 'Show your pass to claim your ' + rewardName
          : newCount + ' of ' + goal + ' stamps - tap to see your card';
        const url = 'https://api.qraivy.com/lp/card/' + slug;
        for (const sub of webSubs) {
          await sendWebPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            { title, body, url, icon: 'https://qraivy.com/icon-192.png' }
          );
        }
        console.log('[Stamp] Web push sent to', webSubs.length, 'subscribers for', slug);
      }
    } catch(e) { console.error('[Stamp] WebPush error:', e.message); }
    return res.json({ status: 'ok', goal, newCount, rewardReady, rewardName, slug });
  } catch(e) {
    console.error('[Stamp] Confirm error:', e.message);
    return res.json({ status: 'error' });
  }
}

// GET /redeem/:slug/:token — a second physical NFC tag staff use to redeem a
// customer's earned reward. Uses the SAME long-lived token as the stamp tag
// (no separate token system needed) on a different route. Mirrors handleStamp's
// prefetch-safe split: this GET has no side effects, the actual redeem only
// happens via the JS-triggered confirm POST below.
async function handleRedeemTap(req, res) {
  try {
    const { slug, token } = req.params;
    const now = new Date();
    const validToken = await prisma.stampToken.findFirst({
      where: { slug, token, expiresAt: { gt: now } }
    });
    if (!validToken) {
      return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid</title><style>body{background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}</style></head><body><div><div style="font-size:3rem">❌</div><h2>Invalid redeem code</h2><p style="color:rgba(255,255,255,0.5);margin-top:8px">This code has expired. Ask staff for a new one.</p></div></body></html>`);
    }
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redeeming…</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;overflow:hidden}.wrap{position:relative;z-index:1}.emoji{font-size:4rem;animation:pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)}h1{font-size:1.8rem;margin:12px 0 8px;font-weight:800}p{color:rgba(255,255,255,0.6);font-size:.9rem;margin:6px 0}.confetti-piece{position:fixed;width:10px;height:10px;border-radius:2px;animation:fall linear forwards}@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}@keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}</style></head><body><div class="wrap" id="wrap"><div class="emoji">⏳</div><h1>Redeeming…</h1></div><script>(function(){\n'
      + 'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}\n'
      + 'function spawnConfetti(){var colors=["#ff5a1f","#22c55e","#3b82f6","#f59e0b","#ec4899","#8b5cf6","#06b6d4"];for(var i=0;i<80;i++){var c=document.createElement("div");c.className="confetti-piece";c.style.cssText="left:"+Math.random()*100+"vw;top:-20px;background:"+colors[Math.floor(Math.random()*colors.length)]+";width:"+(6+Math.random()*8)+"px;height:"+(6+Math.random()*8)+"px;border-radius:"+(Math.random()>0.5?"50%":"2px")+";animation-duration:"+(1.5+Math.random()*2)+"s;animation-delay:"+(Math.random()*0.8)+"s;";document.body.appendChild(c);}setTimeout(function(){document.querySelectorAll(".confetti-piece").forEach(function(el){el.remove();});},4000);}\n'
      + 'function render(d){var wrap=document.getElementById("wrap");\n'
      + 'if(d.status==="invalid"){wrap.innerHTML=\'<div class="emoji">❌</div><h1>Invalid redeem code</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">This code has expired. Ask staff for a new one.</p>\';return;}\n'
      + 'if(d.status==="not_ready"){wrap.innerHTML=\'<div class="emoji">🙈</div><h1>Not ready yet</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">Keep collecting stamps — you don\\\'t have a reward to redeem yet.</p>\';return;}\n'
      + 'if(d.status==="error"){wrap.innerHTML=\'<div class="emoji">⚠️</div><h1>Something went wrong</h1><p style="color:rgba(255,255,255,0.5);margin-top:8px">Please try again.</p>\';return;}\n'
      + 'wrap.innerHTML=\'<div class="emoji">🎁</div><h1>Reward redeemed!</h1><p>Enjoy your \'+esc(d.rewardName)+\'</p><p style="color:rgba(255,255,255,0.4);font-size:.8rem;margin-top:8px">Start collecting stamps again on your next visit</p>\';\n'
      + 'spawnConfetti();}\n'
      // Identity Continuity: a cid supplied via the URL must win over the
      // plain localStorage read below. No new creation path introduced --
      // with no URL cid, this remains the exact original read-only lookup
      // (redeem never mints a cid).
      + 'var cid=null;try{var qp=new URLSearchParams(window.location.search).get("cid");if(qp&&/^[A-Za-z0-9-]{8,64}$/.test(qp)){cid=qp;try{localStorage.setItem("cTok",qp);}catch(e){}}else{cid=localStorage.getItem("cTok");}}catch(e){}\n'
      + 'fetch(window.location.pathname+"/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cid:cid})}).then(function(r){return r.json();}).then(render).catch(function(){render({status:"error"});});\n'
      + '})();</script></body></html>';
    return res.status(200).send(html);
  } catch(e) {
    console.error('[RedeemTap] Error:', e.message);
    return res.status(500).send('Error processing redeem');
  }
}

// POST /redeem/:slug/:token/confirm — performs the actual redeem. A customer
// can only ever redeem THEIR OWN reward, because cid comes from their own
// browser's localStorage — there is no way for this to target another
// customer's pass, and it's a safe no-op unless that pass is rewardReady.
async function handleRedeemTapConfirm(req, res) {
  try {
    const { slug, token } = req.params;
    const cid = (req.body && req.body.cid) ? String(req.body.cid).slice(0, 64) : null;
    const now = new Date();
    const validToken = await prisma.stampToken.findFirst({
      where: { slug, token, expiresAt: { gt: now } }
    });
    if (!validToken) return res.json({ status: 'invalid' });

    const serial = cid ? `sqr-${slug}-${cid}` : 'sqr-' + slug;
    const pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
    if (!pass || !pass.rewardReady) return res.json({ status: 'not_ready' });

    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    const rewardName = settings ? settings.rewardName : 'Free item';
    const redeemAt = now;
    await prisma.pass.update({ where: { id: pass.id }, data: { stampCount: 0, rewardReady: false, rewardsEarned: { increment: 1 }, updatedAt: redeemAt } });
    try {
      await prisma.rewardEvent.updateMany({ where: { passId: pass.id, status: 'earned' }, data: { status: 'redeemed', redeemedAt: redeemAt } });
    } catch(e) { console.error('[RedeemTap] RewardEvent update error:', e.message); }
    const devices = await prisma.passDevice.findMany({ where: { passId: pass.id }, select: { pushToken: true } });
    if (devices.length) {
      try { const { pushUpdateToDevices } = require('../services/apnsService'); await pushUpdateToDevices(devices); } catch(e) {}
    }
    try {
      const { updateGoogleWalletStamps } = require('../services/googleWalletService');
      await updateGoogleWalletStamps(slug, 0, cid);
    } catch(e) { console.error('[RedeemTap] Google Wallet update error:', e.message); }
    return res.json({ status: 'ok', rewardName, slug });
  } catch(e) {
    console.error('[RedeemTap] Confirm error:', e.message);
    return res.json({ status: 'error' });
  }
}

async function handleGetStampToken(req, res) {
  try {
    const { slug } = req.params;
    const token = await getOrCreateStampToken(slug);
    const stampUrl = `https://www.qraivy.com/stamp/${slug}/${token}`;
    return res.json({ token, stampUrl });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

async function handleStampSettings(req, res) {
  try {
    const { slug } = req.params;
    const { goal, rewardName, enabled } = req.body;
    const settings = await prisma.stampSettings.upsert({
      where: { slug },
      update: { goal: goal || 10, rewardName: rewardName || 'Free item', enabled: enabled !== false },
      create: { slug, goal: goal || 10, rewardName: rewardName || 'Free item', enabled: enabled !== false }
    });
    return res.json({ ok: true, settings });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

async function handleGetStampSettings(req, res) {
  try {
    const { slug } = req.params;
    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    const serial = 'sqr-' + slug;
    const pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
    const totalStamps = await prisma.stampEntry.count({ where: { slug } });
    const rewardReady = pass ? pass.rewardReady : false;
    const stampCount = pass ? pass.stampCount : 0;
    const token = await getOrCreateStampToken(slug);
    return res.json({ settings, stampCount, rewardReady, totalStamps, stampUrl: `https://www.qraivy.com/stamp/${slug}/${token}`, token });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}

// POST /stamp/:slug/customer — per-customer stamp recording
async function handleCustomerStamp(req, res) {
  try {
    const { slug } = req.params;
    const cid = (req.body && req.body.cid) ? String(req.body.cid).slice(0, 64) : null;
    if (!cid) return res.json({ ok: false, error: 'No customer ID' });
    const settings = await prisma.stampSettings.findUnique({ where: { slug } });
    if (!settings || !settings.enabled) return res.json({ ok: false, error: 'Loyalty not active' });
    const goal = settings.goal || 10;
    let lc = null;
    try { lc = await prisma.loyaltyCustomer.findUnique({ where: { slug_customerId: { slug, customerId: cid } } }); } catch(_) {}
    if (!lc) {
      lc = await prisma.loyaltyCustomer.create({
        data: { slug, customerId: cid, stampCount: 1, totalStamps: 1, rewardReady: goal <= 1, lastStampAt: new Date() }
      });
    } else if (lc.stampCount < goal) {
      const nc = lc.stampCount + 1;
      const rr = nc >= goal;
      const re = (rr && !lc.rewardReady) ? lc.rewardsEarned + 1 : lc.rewardsEarned;
      lc = await prisma.loyaltyCustomer.update({
        where: { slug_customerId: { slug, customerId: cid } },
        data: { stampCount: nc, totalStamps: { increment: 1 }, rewardReady: rr, rewardsEarned: re, lastStampAt: new Date() }
      });
    } else {
      lc = await prisma.loyaltyCustomer.update({
        where: { slug_customerId: { slug, customerId: cid } },
        data: { totalStamps: { increment: 1 }, lastStampAt: new Date() }
      });
    }
    return res.json({ ok: true, stampCount: lc.stampCount, goal, rewardReady: lc.rewardReady, hasWallet: lc.hasWallet });
  } catch(e) {
    console.error('[CustomerStamp]', e.message);
    return res.json({ ok: false, error: e.message });
  }
}

// GET /lp/manifest/:slug — dynamic PWA manifest for each landing page
async function handleLPManifest(req, res) {
  try {
    const { slug } = req.params;
    const lp = await prisma.landingPage.findUnique({ where: { slug } });
    const name = (lp && lp.businessName) || 'Qraivy';
    let sec = lp && lp.sections;
    if (typeof sec === 'string') { try { sec = JSON.parse(sec); } catch(_) { sec = {}; } }
    sec = sec || {};
    const color = (lp && lp.brandColor) || (sec.theme && sec.theme.accentColor) || '#ff5a1f';
    // Business logo (Brand Center) as the home-screen icon — falls back to
    // the generic Qraivy icon for pages with no logo uploaded.
    const manifestLogoUrl = (sec.logo && sec.logo.url) || (lp && lp.logoUrl) || '';
    const manifest = {
      name: name,
      short_name: name.slice(0, 12),
      start_url: '/lp/' + slug,
      scope: '/lp/' + slug,
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: color,
      // 'any' instead of 'portrait' — a hard portrait lock fights the OS's
      // own rotation handling on some devices, clipping the rendered page
      // when the phone is turned sideways.
      orientation: 'any',
      icons: manifestLogoUrl ? [
        { src: manifestLogoUrl, sizes: '192x192', type: 'image/png' },
        { src: manifestLogoUrl, sizes: '512x512', type: 'image/png' }
      ] : [
        { src: 'https://qraivy.com/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'https://qraivy.com/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    };
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(manifest);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}


// ── PREMIUM TEMPLATE RENDERER ────────────────────────────────────────────
// Added by patch-premium-lp — does not modify renderLP()
// Activate by setting page.template = 'premium' in the LandingPage record.
//
// Business-section map by useCase:
//   restaurant  → Menu, Reserve Table, Opening Hours, Directions, Gallery, Loyalty, Events
//   gym         → Classes, Timetable, Membership, Directions, Gallery, Loyalty, Events
//   ecommerce   → Products, Offers, Gallery, Directions, Reviews, Contact
//   default     → Services, Offers, Gallery, Directions, Reviews, Contact, Loyalty, Events
//
function renderPremiumLP(page) {
  const bizName = (page.businessName || 'My Business').trim();
  // ── Translation dictionary ──
  const lang = (function(){ try { const s = typeof page.sections === 'string' ? JSON.parse(page.sections) : (page.sections||{}); return s.language || 'en'; } catch(_){ return 'en'; }})();
  const T = {
    en: {
      tagline: 'Smart Landing Page', visitWebsite: 'Visit Website', learnMore: 'Learn More',
      whatCanIDo: 'What can I do here?', stayInLoop: 'Stay in the loop',
      subscribeBtn: 'Subscribe →',
      personalWelcome: 'Personal welcome message', tapToListen: 'Tap to listen — unlocks AI assistant',
      aiAssistant: 'AI Assistant', askAnything: 'Ask anything…',
      tapWelcome: 'Tap welcome to activate', subscribeDesc: 'Subscribe for updates, exclusive offers and early access from ',
      gdpr: 'I agree to receive marketing messages from ', gdprSuffix: '. I can unsubscribe at any time.',
      alreadySubscribed: 'Already subscribed', subscribedOk: '✓ Subscribed successfully',
      aiPowered: 'AI Powered', autoFill: 'Auto-fill from your URL →',
      whatCanIDo: 'What can I do here?', stayInLoop: 'Stay in the loop'
    },
    de: {
      tagline: 'Smarte Landingpage', visitWebsite: 'Website besuchen', learnMore: 'Mehr erfahren',
      whatCanIDo: 'Was kann ich hier tun?', stayInLoop: 'Bleiben Sie informiert',
      subscribeBtn: 'Abonnieren →',
      personalWelcome: 'Persönliche Willkommensnachricht', tapToListen: 'Tippen zum Anhören — aktiviert KI-Assistent',
      aiAssistant: 'KI-Assistent', askAnything: 'Fragen Sie etwas…',
      tapWelcome: 'Willkommensnachricht antippen', subscribeDesc: 'Abonnieren Sie für Updates, exklusive Angebote und Frühzugang von ',
      gdpr: 'Ich erkläre mich einverstanden, Marketingmitteilungen von ', gdprSuffix: ' zu erhalten. Ich kann mich jederzeit abmelden.',
      alreadySubscribed: 'Bereits abonniert', subscribedOk: '✓ Erfolgreich abonniert',
      aiPowered: 'KI-Powered', autoFill: 'Auto-Ausfüllen von Ihrer URL →',
      whatCanIDo: 'Was kann ich hier tun?', stayInLoop: 'Bleiben Sie informiert'
    }
  };
  const t = T[lang] || T.en;
  const CARD_LABELS = {
    de: {
      menu: { label: 'Speisekarte', sub: 'Unser vollständiges Menü' },
      reserve: { label: 'Tisch reservieren', sub: 'Online buchen' },
      special: { label: 'Tagesangebot', sub: 'Was gibt es heute?' },
      location: { label: 'Wegbeschreibung', sub: 'Uns finden & Parken' },
      loyalty: { label: 'Treuekarte', sub: 'Stempel sammeln, Prämien erhalten' },
      happyhour: { label: 'Happy Hour', sub: 'Angebote & Getränke' },
      events: { label: 'Veranstaltungen', sub: 'Kommende Events & Angebote' },
      hours: { label: 'Öffnungszeiten', sub: 'Wann wir geöffnet haben' },
      membership: { label: 'Mitgliedschaft', sub: 'Pläne & Preise' },
      classes: { label: 'Kurse', sub: 'Alle Sessions & Zeitpläne' },
      timetable: { label: 'Stundenplan', sub: 'Wöchentlicher Zeitplan' },
      book: { label: 'Session buchen', sub: 'Platz reservieren' },
      rewards: { label: 'Prämien', sub: 'Punkte sammeln, Vorteile erhalten' },
      trainers: { label: 'Trainer', sub: 'Unser Team kennenlernen' },
      contact: { label: 'Kontakt', sub: 'Kontakt aufnehmen' },
      shop: { label: 'Produkte kaufen', sub: 'Unser Sortiment' },
      new: { label: 'Neuheiten', sub: 'Gerade eingetroffen' },
      offers: { label: 'Tagesangebote', sub: 'Zeitlich begrenzte Deals' },
    }
  };
  const slug    = page.slug || '';
  const website = page.websiteUrl || '#';
  const accent  = page.brandColor || '#0a0a0a';
  const useCase = page.useCase || 'restaurant';

  let storedSections = {};
  let storedButtons  = [];
  if (page.sections) {
    try {
      storedSections = typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections;
      if (Array.isArray(storedSections.buttons)) storedButtons = storedSections.buttons;
    } catch(_) {}
  }
  // Business logo — sections.logo.url (Brand Center) is the single source of
  // truth, with the legacy page.logoUrl column as a fallback for older pages.
  const logoUrl = (storedSections.logo && storedSections.logo.url) || page.logoUrl || '';
  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" style="width:30px;height:30px;border-radius:6px;object-fit:contain;" alt="${bizName}">`
    : `<div style="width:30px;height:30px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;">${bizName.charAt(0).toUpperCase()}</div>`;
  const sh = storedSections.hero  || {};
  const sv = storedSections.voice || {};
  const sa = storedSections.ai    || {};
  const sl = storedSections.loop  || {};

  const headline = sh.aiTitle  || sh.title    || ('Welcome to ' + bizName);
  const sub      = sh.aiSubtitle || sh.subtitle || 'Visit us, explore what we offer, and stay connected.';

  // ── CTA buttons ──
  const ctaBtns = storedButtons.filter(b => b.active !== false).map(b => {
    const url = (b.url || '#').startsWith('http') ? b.url : 'https://' + b.url;
    const isPrimary = b.style !== 'secondary';
    return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;font-family:inherit;text-decoration:none;cursor:pointer;${isPrimary ? `background:${accent};color:#fff;border:none;` : 'background:transparent;color:#0a0a0a;border:1.5px solid #d0d0d0;'}transition:opacity .15s;">${b.title || b.label || 'Button'}</a>`;
  }).join('');

  // ── Business sections by useCase ──
  // Future expansion: plug AI recommendations, custom ordering, or CMS overrides per useCase here.
  const SECTIONS = {
    restaurant: [
      { id:'menu',      icon:'🍽️', label:'Menu',            sub:'View our full menu' },
      { id:'reserve',   icon:'📅', label:'Reserve a table',  sub:'Book online instantly' },
      { id:'special',   icon:'⚡', label:"Today's special",  sub:"What's on today" },
      { id:'location',  icon:'📍', label:'Directions',       sub:'Find us & parking' },
      { id:'loyalty',   icon:'⭐', label:'Loyalty card',     sub:'Earn stamps, get rewards' },
      { id:'happyhour', icon:'🍹', label:'Happy hour',       sub:'Deals & drink offers' },
      { id:'events',    icon:'🎉', label:'Events',           sub:'Upcoming events & offers' },
      { id:'hours',     icon:'🕐', label:'Opening hours',    sub:'When we are open' },
    ],
    fitness: [
      { id:'membership', icon:'🏷️', label:'Membership',      sub:'Plans & pricing' },
      { id:'classes',    icon:'💪', label:'Classes',          sub:'All sessions & schedules' },
      { id:'timetable',  icon:'📅', label:'Timetable',        sub:'Weekly schedule' },
      { id:'book',       icon:'📲', label:'Book a session',   sub:'Reserve your spot' },
      { id:'location',   icon:'📍', label:'Directions',       sub:'Find us & parking' },
      { id:'rewards',    icon:'⭐', label:'Rewards',           sub:'Earn points, get perks' },
      { id:'trainers',   icon:'🧑', label:'Trainers',         sub:'Meet our team' },
      { id:'contact',    icon:'📞', label:'Contact',          sub:'Get in touch' },
    ],
    gym: [
      { id:'membership', icon:'🏷️', label:'Membership',      sub:'Plans & pricing' },
      { id:'classes',    icon:'💪', label:'Classes',          sub:'All sessions & schedules' },
      { id:'timetable',  icon:'📅', label:'Timetable',        sub:'Weekly schedule' },
      { id:'book',       icon:'📲', label:'Book a session',   sub:'Reserve your spot' },
      { id:'location',   icon:'📍', label:'Directions',       sub:'Find us & parking' },
      { id:'rewards',    icon:'⭐', label:'Rewards',           sub:'Earn points, get perks' },
      { id:'trainers',   icon:'🧑', label:'Trainers',         sub:'Meet our team' },
      { id:'contact',    icon:'📞', label:'Contact',          sub:'Get in touch' },
    ],
    ecommerce: [
      { id:'shop',        icon:'🛍️', label:'Shop products',   sub:'Browse our range' },
      { id:'new',         icon:'✨', label:'New arrivals',     sub:'Just landed' },
      { id:'offers',      icon:'🏷️', label:"Today's offers",  sub:'Limited time deals' },
      { id:'loyalty',     icon:'⭐', label:'Loyalty rewards',  sub:'Earn points, get perks' },
      { id:'track',       icon:'📦', label:'Track order',      sub:'Where is my order' },
      { id:'contact',     icon:'📞', label:'Contact',          sub:'Get in touch' },
      { id:'bestsellers', icon:'🔥', label:'Best sellers',     sub:'Most popular picks' },
      { id:'subscribe',   icon:'📧', label:'Subscribe',        sub:'Get exclusive offers' },
    ],
    creator: [
      { id:'content',    icon:'▶️', label:'Latest content',   sub:'Watch & read' },
      { id:'youtube',    icon:'📺', label:'YouTube',          sub:'Subscribe to my channel' },
      { id:'instagram',  icon:'📸', label:'Instagram',        sub:'Follow for daily updates' },
      { id:'tiktok',     icon:'🎵', label:'TikTok',           sub:'Watch my videos' },
      { id:'newsletter', icon:'📧', label:'Newsletter',       sub:'Join my email list' },
      { id:'community',  icon:'💬', label:'Community',        sub:'Join the conversation' },
      { id:'deals',      icon:'🤝', label:'Brand deals',      sub:'Work with me' },
      { id:'contact',    icon:'📞', label:'Contact',          sub:'Get in touch' },
    ],
    artist: [
      { id:'release',   icon:'🎵', label:'Latest release',   sub:'Stream now' },
      { id:'streaming', icon:'🎧', label:'Streaming links',  sub:'Listen on all platforms' },
      { id:'tour',      icon:'🗺️', label:'Tour dates',       sub:'Live shows near you' },
      { id:'tickets',   icon:'🎟️', label:'Tickets',          sub:'Get your tickets' },
      { id:'merch',     icon:'👕', label:'Merch',            sub:'Official store' },
      { id:'fanclub',   icon:'⭐', label:'Fan club',         sub:'Join the community' },
      { id:'videos',    icon:'▶️', label:'Videos',           sub:'Watch music videos' },
      { id:'subscribe', icon:'📧', label:'Subscribe',        sub:'Stay updated' },
    ],
    event: [
      { id:'tickets',  icon:'🎟️', label:'Buy tickets',      sub:'Secure your spot' },
      { id:'rsvp',     icon:'✅', label:'RSVP',             sub:"Let us know you're coming" },
      { id:'schedule', icon:'📅', label:'Schedule',         sub:'Full event programme' },
      { id:'speakers', icon:'🎤', label:'Speakers',         sub:'Who is performing' },
      { id:'location', icon:'📍', label:'Directions',       sub:'Venue & transport' },
      { id:'updates',  icon:'🔔', label:'Updates',          sub:'Stay in the loop' },
      { id:'vip',      icon:'💎', label:'VIP pass',         sub:'Exclusive access' },
      { id:'contact',  icon:'📞', label:'Contact',          sub:'Get in touch' },
    ],
    local_business: [
      { id:'services', icon:'✦',  label:'Services',         sub:'What we offer' },
      { id:'book',     icon:'📅', label:'Book appointment', sub:'Reserve your slot' },
      { id:'reviews',  icon:'⭐', label:'Reviews',          sub:'What customers say' },
      { id:'location', icon:'📍', label:'Directions',       sub:'Find us & parking' },
      { id:'call',     icon:'📞', label:'Call us',          sub:'Speak to the team' },
      { id:'offers',   icon:'🏷️', label:'Offers',           sub:'Current deals' },
      { id:'loyalty',  icon:'🎁', label:'Loyalty',          sub:'Earn stamps, get rewards' },
      { id:'contact',  icon:'💬', label:'Contact',          sub:'Send us a message' },
    ],
    other: [
      { id:'website',   icon:'🌐', label:'Website',         sub:'Visit our site' },
      { id:'contact',   icon:'📞', label:'Contact',         sub:'Get in touch' },
      { id:'gallery',   icon:'📸', label:'Gallery',         sub:'See our work' },
      { id:'offers',    icon:'🏷️', label:'Offers',          sub:'Current deals' },
      { id:'subscribe', icon:'📧', label:'Subscribe',       sub:'Stay updated' },
      { id:'location',  icon:'📍', label:'Directions',      sub:'Find us' },
    ],
  };
  // useCase aliases — maps onboarding values to SECTIONS keys
  // Future: add AI-driven overrides or user-customised ordering here
  const _uc = (useCase || '').toLowerCase();
  const _ucKey = {
    'restaurant': 'restaurant',
    'fitness': 'fitness', 'gym': 'fitness',
    'ecommerce': 'ecommerce', 'shop': 'ecommerce',
    'creator': 'creator', 'influencer': 'creator',
    'artist': 'artist', 'music': 'artist',
    'event': 'event', 'events': 'event',
    'local_business': 'local_business', 'local': 'local_business', 'leadgen': 'local_business',
    'other': 'other', 'portfolio': 'other', 'ai-support': 'other', 'realestate': 'other',
  }[_uc] || null;
  const defaultSections = SECTIONS.other;
  const bizSections = SECTIONS[_ucKey] || defaultSections;

  // ── actionLinks: use real crawled links if available, else fall back to static cards ──
  const _aiLinks = Array.isArray(storedSections.actionLinks) && storedSections.actionLinks.length > 0 ? storedSections.actionLinks : null;
  const _cardSource = _aiLinks
    ? _aiLinks.map(l => { const _lbl = l.label||''; const _de = {Menu:'Speisekarte','Reserve a Table':'Tisch reservieren','Order Online':'Online bestellen','Book a Session':'Session buchen','Shop Now':'Jetzt einkaufen',Directions:'Wegbeschreibung',Contact:'Kontakt',Events:'Veranstaltungen','Opening Hours':'Öffnungszeiten','Book a Table':'Tisch reservieren','Order Food':'Essen bestellen','View Menu':'Speisekarte','Find Us':'Uns finden','Bakery Products':'Backwaren','Confectionery':'Konditorei','Lunch Menu':'Mittagsmenü','Daily Offers':'Tagesangebote',Locations:'Filialen','Allergen Info':'Allergeninformationen','Aroma Card':'Aroma-Karte','BrotBar & Daily Bread':'BrotBar & Tägliches Brot'}; return { icon: l.icon||'🔗', label: (lang==='de' && _de[_lbl]) ? _de[_lbl] : _lbl, sub: l.description||'', url: l.url||'#' }; })
    : bizSections.map(s => { const tr = (CARD_LABELS[lang] && CARD_LABELS[lang][s.id]) || {}; return { icon: s.icon, label: tr.label || s.label, sub: tr.sub || s.sub, url: '#' }; });

  const actionCardsHTML = _cardSource.map(s =>
    `<div onclick="openCard('${s.url}','${s.label.replace(/'/g,"\\'")}'  )" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border:1.5px solid ${accent};border-radius:14px;cursor:pointer;transition:box-shadow .2s,transform .2s,background .15s;box-shadow:0 2px 12px rgba(0,0,0,0.06);" class="card" onmouseover="this.style.transform='scale(1.02)';this.style.boxShadow='0 8px 28px rgba(0,0,0,.12)'" onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 12px rgba(0,0,0,0.06)'">
      <div style="width:40px;height:40px;border-radius:10px;border:1.5px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${s.icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:#0a0a0a;margin-bottom:2px;">${s.label}</div>
        <div style="font-size:12px;color:#555;">${s.sub}</div>
      </div>
      <div style="font-size:16px;color:#bbb;">›</div>
    </div>`
  ).join('');

  // ── Audio waveform bars ──
  const waveBars = Array.from({length:12}, (_,i) => {
    const h = [6,14,20,10,18,24,12,20,8,16,22,10][i];
    return '<span class="wave-bar" style="display:block;width:2px;height:' + h + 'px;border-radius:2px;background:#d0d0d0;transform-origin:bottom;transition:background .3s;"></span>';
  }).join('');

  // ── Smart pass card ──
  const passCard = `
    <div style="background:#0a0a0a;border-radius:16px;padding:20px 24px;margin-bottom:10px;">
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Smart Pass</div>
      <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:24px;">${bizName}</div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;">
        <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:.1em;text-transform:uppercase;">· Tap to save</span>
        <div style="display:flex;gap:6px;">
          <div style="width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.2);"></div>
          <div style="width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.2);"></div>
        </div>
      </div>
    </div>`;

  const lpUrl = 'https://www.qraivy.com/lp/' + slug;
  const apiBase = 'https://api.qraivy.com';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${bizName}">
<link rel="apple-touch-icon" href="${logoUrl || 'https://qraivy.com/icon-192.png'}">
<link rel="manifest" href="/manifest/${slug}">
<title>${bizName} — ${t.tagline}</title>
<meta name="description" content="${sub}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
@keyframes waveBar{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1)}}
body{font-family:'Outfit',system-ui,sans-serif;background:${storedSections.theme && storedSections.theme.lightBackgroundColor ? storedSections.theme.lightBackgroundColor : (storedSections.theme && storedSections.theme.bg ? storedSections.theme.bg : '#f8f8f8')};color:#0a0a0a;max-width:600px;margin:0 auto;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
a{color:inherit;text-decoration:none}
input,textarea,button{font-family:inherit}
.section{padding:0 20px;margin-bottom:16px}
.card{background:#fff;border:1.5px solid ${accent};border-radius:16px;overflow:hidden}
.dark-mode .card{background:#0a0a0a !important;border-color:#222 !important;}
.dark-mode .card *{color:#f0f0f0 !important;} .dark-mode .card:hover{background:#0a0a0a !important;} .dark-mode [style*="background:#fff"]:hover{background:#0a0a0a !important;}
.dark-mode h1,.dark-mode h2,.dark-mode h3{color:#fff !important;}
.dark-mode p,.dark-mode span,.dark-mode div{color:#ccc;}
.dark-mode nav{background:rgba(17,17,17,0.95) !important;border-bottom-color:#333 !important;}
.dark-mode nav span,.dark-mode nav a{color:#f0f0f0 !important;}
.dark-mode .section{background:transparent !important;}
.dark-mode input[type=email]{background:#0a0a0a !important;border-color:#333 !important;color:#f0f0f0 !important;}
.dark-mode input[type=email]::placeholder{color:#666 !important;}
.dark-mode #chat-input{color:#f0f0f0 !important;}
.dark-mode #chat-input::placeholder{color:#666 !important;}
.dark-mode .card[style*="background:#f2f2f2"]{background:#111 !important;}
.dark-mode [style*="background:#fff"]{background:#0a0a0a !important;}
.dark-mode [style*="color:#0a0a0a"]{color:#f0f0f0 !important;}
.dark-mode [style*="color:#555"]{color:#ccc !important;}
.dark-mode [style*="color:#999"]{color:#aaa !important;}
.dark-mode [style*="border:1px solid #e8e8e8"]{border-color:#333 !important;}
.dark-mode [style*="background:#f2f2f2"]{background:#222 !important;color:#f0ece0 !important;}
.divider{height:1px;background:#e8e8e8;margin:0 20px}
</style>
</head>
<body>

<!-- NAV -->
<nav style="position:sticky;top:0;z-index:50;background:rgba(255,255,255,0.95);backdrop-filter:blur(12px);border-bottom:1px solid #e8e8e8;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:10px;">
    ${logoHTML}
    <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${bizName}</span>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:10px;font-weight:600;color:#666;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:5px;">
      <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
      AI Powered
    </span>
    <button onclick="toggleTheme()" style="display:flex;align-items:center;width:44px;height:24px;border-radius:999px;border:1.5px solid #d0d0d0;background:#f2f2f2;padding:2px;cursor:pointer;">
      <div id="theme-knob" style="width:18px;height:18px;border-radius:50%;background:#0a0a0a;transition:transform .2s;"></div>
    </button>
  </div>
</nav>

<!-- HERO -->
<div style="background:#fff;text-align:center;padding:56px 24px 48px;">
  ${logoUrl ? `<div style="margin-bottom:20px;"><img src="${logoUrl}" style="width:72px;height:72px;border-radius:16px;object-fit:contain;box-shadow:0 4px 16px rgba(0,0,0,0.08);" alt="${bizName}"></div>` : `<div style="margin-bottom:20px;"><div style="width:72px;height:72px;border-radius:16px;background:${accent};display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.12);">${bizName.charAt(0).toUpperCase()}</div></div>`}
  <div style="display:inline-flex;align-items:center;gap:7px;border:1px solid #d0d0d0;border-radius:999px;padding:5px 14px;font-size:11px;font-weight:600;color:#555;letter-spacing:.06em;text-transform:uppercase;margin-bottom:24px;">
    ${sh.badge || t.tagline}

  </div>
  <h1 style="font-size:clamp(30px,7vw,48px);font-weight:800;color:#0a0a0a;letter-spacing:-1.2px;line-height:1.05;margin-bottom:16px;">${headline}</h1>
  <p style="font-size:15px;color:#555;line-height:1.7;max-width:380px;margin:0 auto 28px;">${sub}</p>
  <div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
    ${ctaBtns || `
      <a href="${website}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:999px;font-size:14px;font-weight:600;background:${accent};color:#fff;text-decoration:none;">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M2.5 8h11M8 2.5a10 10 0 010 11"/></svg>
        ${t.visitWebsite}
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 13L13 3M7 3h6v6"/></svg>
      </a>
      <a href="#subscribe" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;background:transparent;color:#0a0a0a;border:1.5px solid #d0d0d0;text-decoration:none;">${t.learnMore}</a>
    `}
  </div>
  <p style="font-size:11px;font-weight:600;color:#aaa;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;" onclick="window.location.href='${website}'">${t.autoFill}</p>
</div>

<!-- AUDIO -->
${sv.active !== false ? `
<div class="section">
  <div style="font-size:10px;font-weight:600;color:#999;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5v6M6 3v10M9 6v4M12 4v8"/></svg>
    Welcome from ${bizName}
  </div>
  <div class="card" style="display:flex;align-items:center;gap:14px;padding:16px 20px;cursor:pointer;border:1.5px solid ${accent};border-radius:16px;" onclick="playAudio(this)">
    <div id="audio-play-btn" style="width:40px;height:40px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .1s;">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="#fff"><path d="M5 3l9 5-9 5V3z"/></svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:14px;font-weight:600;color:#0a0a0a;margin-bottom:3px;">${sv.playerTitle || t.personalWelcome}</div>
      <div style="font-size:12px;color:#555;">${sv.playerSubtitle || t.tapToListen}</div>
    </div>
    <div style="display:flex;align-items:center;gap:2px;height:28px;">${waveBars}</div>
  </div>
</div>
` : ''}

<!-- AI CHAT -->
${sa.active !== false ? `
<div class="section">
  <div class="card" style="overflow:hidden;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid #e8e8e8;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
        <span style="font-size:13px;font-weight:600;color:#0a0a0a;">${t.aiAssistant}</span>
        <span style="font-size:12px;color:#555;">— Online</span>
      </div>
      <span style="font-size:10px;font-weight:600;color:#666;letter-spacing:.05em;text-transform:uppercase;">${t.tapWelcome}</span>
    </div>
    <div id="chat-msgs" style="padding:16px;min-height:80px;display:flex;flex-direction:column;gap:8px;">
      <div style="background:#f2f2f2;border-radius:0 12px 12px 12px;padding:11px 14px;font-size:13px;color:#0a0a0a;line-height:1.55;display:inline-block;max-width:88%;">${lang === 'de' ? '✦ Hallo 👋 Ich bin der KI-Assistent für ' + bizName + '. Fragen Sie mich nach Öffnungszeiten, Angeboten oder anderen Infos.' : '✦ Hi 👋 I\'m the AI concierge for ' + bizName + '. Ask me about hours, menu, or anything else.'}</div>
    </div>
    <div id="chat-input-area" style="display:flex;align-items:center;border-top:1px solid #e8e8e8;opacity:0.4;pointer-events:none;" title="Play welcome message to activate">
      <input id="chat-input" placeholder="${t.askAnything}" style="flex:1;border:none;outline:none;padding:13px 16px;font-size:14px;color:#0a0a0a;background:transparent;" onkeydown="if(event.key==='Enter')sendChat()">
      <button onclick="sendChat()" style="width:36px;height:36px;border-radius:50%;background:#f2f2f2;border:none;cursor:pointer;margin-right:8px;display:flex;align-items:center;justify-content:center;transition:background .15s;" onmouseover="this.style.background='#e8e8e8'" onmouseout="this.style.background='#f2f2f2'">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round"><path d="M14 2L2 8l5 2 2 5 5-13z"/></svg>
      </button>
    </div>
  </div>
</div>
` : ''}

<!-- SMART PASS -->
<div class="section">
  ${passCard}
</div>

<!-- ACTION CARDS (business sections) -->
<div class="section">
  <div style="font-size:10px;font-weight:600;color:#999;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px;">${t.whatCanIDo}</div>
  <div style="display:flex;flex-direction:column;gap:8px;">
    ${actionCardsHTML}
  </div>
</div>

<!-- SUBSCRIBE -->
<div class="section" id="subscribe">
  <div class="card" style="padding:28px 24px;">
    <h2 style="font-size:22px;font-weight:700;color:#0a0a0a;letter-spacing:-.3px;margin-bottom:8px;">${t.stayInLoop}</h2>
    <p style="font-size:14px;color:#555;line-height:1.65;margin-bottom:20px;">${t.subscribeDesc}${bizName}.</p>
    <input id="sub-email" type="email" placeholder="your@email.com" style="width:100%;border:1px solid #e8e8e8;border-radius:10px;padding:12px 14px;font-size:14px;color:#0a0a0a;outline:none;margin-bottom:10px;background:#fff;transition:border-color .15s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='#e8e8e8'">
    <button onclick="handleSubscribe()" style="width:100%;padding:14px;background:${accent};color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:14px;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${t.subscribeBtn}</button>
    <div style="display:flex;align-items:flex-start;gap:9px;font-size:12px;color:#555;line-height:1.55;margin-bottom:18px;">
      <input type="checkbox" id="gdpr" style="width:16px;height:16px;border-radius:4px;border:1.5px solid #d0d0d0;margin-top:1px;cursor:pointer;flex-shrink:0;accent-color:${accent};">
      <label for="gdpr">${t.gdpr}${bizName}${t.gdprSuffix}</label>
    </div>
    <div id="wallet-btns" style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
      <button id="btn-apple" onclick="addAppleWallet()" style="display:none;width:100%;align-items:center;justify-content:center;gap:10px;border:none;border-radius:12px;padding:16px;background:#000;font-size:15px;font-weight:600;color:#fff;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        🍎 Add to Apple Wallet
      </button>
      <button id="btn-google" onclick="addGoogleWallet()" style="display:none;width:100%;align-items:center;justify-content:center;gap:10px;border:none;border-radius:12px;padding:16px;background:#4285F4;font-size:15px;font-weight:600;color:#fff;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        💳 Add to Google Wallet
      </button>
    </div>
    <script>(function(){var ua=navigator.userAgent;var isIOS=/iPhone|iPad|iPod/i.test(ua);var isAndroid=/Android/i.test(ua);var ab=document.getElementById('btn-apple');var gb=document.getElementById('btn-google');if(ab&&gb){if(isIOS){ab.style.display='flex';}else if(isAndroid){gb.style.display='flex';}else{ab.style.display='flex';gb.style.display='flex';}}})();</script>
  </div>
</div>

<!-- DIVIDER -->
<div class="divider" style="margin-bottom:40px;"></div>

<!-- FOOTER -->
<footer style="padding:28px 20px 40px;text-align:center;">
  <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:6px;">
    ${logoHTML}
    <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${bizName}</span>
  </div>
  <p style="font-size:12px;color:#aaa;margin-bottom:6px;">${website.replace(/^https?:\/\//, '')}</p>
  <p style="font-size:11px;color:#bbb;margin-bottom:24px;">Built with <a href="https://qraivy.com" style="color:#888;font-weight:600;text-decoration:none;">Smart Page</a> · AI-powered customer engagement.</p>
  <a href="https://qraivy.com" style="display:inline-flex;align-items:center;gap:9px;background:#0a0a0a;color:#fff;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:600;text-decoration:none;margin-bottom:10px;">
    <span style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:11px;">✦</span>
    Create Your Own Smart QR
  </a>
  <p style="font-size:10px;font-weight:600;color:#666;letter-spacing:.06em;text-transform:uppercase;">Launch an AI-powered landing page in under 60 seconds.</p>
</footer>

<!-- TOAST -->
<!-- BOTTOM SHEET MODAL -->
<div id="card-sheet" style="position:fixed;inset:0;z-index:200;display:none;" onclick="if(event.target===this)closeCard()">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);"></div>
  <div id="card-sheet-inner" style="position:absolute;bottom:0;left:0;right:0;max-width:600px;margin:0 auto;background:#fff;border-radius:24px 24px 0 0;height:88vh;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .35s cubic-bezier(0.32,0.72,0,1);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid #e8e8e8;flex-shrink:0;">
      <div id="card-sheet-title" style="font-size:15px;font-weight:600;color:#0a0a0a;"></div>
      <div style="display:flex;gap:8px;">
        <button onclick="openExternal()" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;border:1.5px solid #e8e8e8;background:#fff;font-size:12px;font-weight:600;color:#555;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 13L13 3M7 3h6v6"/></svg>
          Open
        </button>
        <button onclick="closeCard()" style="width:32px;height:32px;border-radius:50%;border:1.5px solid #e8e8e8;background:#fff;font-size:18px;line-height:1;color:#555;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>
    <iframe id="card-sheet-frame" src="" style="flex:1;border:none;width:100%;" loading="lazy"></iframe>
  </div>
</div>

<div id="toast" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#0a0a0a;color:#fff;border-radius:999px;padding:11px 20px;font-size:13px;font-weight:500;white-space:nowrap;z-index:100;transition:transform .3s cubic-bezier(0.34,1.56,0.64,1);pointer-events:none;"></div>

<script>
${SLUG_CID_HELPER_JS}
(function(){
  var SLUG = '${slug}';
  var API  = '${apiBase}';

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(function(){ t.style.transform = 'translateX(-50%) translateY(80px)'; }, 2800);
  }

  var dark = false;
  var _lightBg = '${storedSections.theme && storedSections.theme.lightBackgroundColor ? storedSections.theme.lightBackgroundColor : (storedSections.theme && storedSections.theme.bg ? storedSections.theme.bg : '#f8f8f8')}';
  window.toggleTheme = function() {
    dark = !dark;
    document.getElementById('theme-knob').style.transform = dark ? 'translateX(20px)' : 'none';
    document.getElementById('theme-knob').style.background = dark ? '#f0f0f0' : '#0a0a0a';
    if (dark) {
      document.body.classList.add('dark-mode');
      document.body.style.background = '#111';
    } else {
      document.body.classList.remove('dark-mode');
      document.body.style.background = _lightBg;
    }
  };

  var _currentCardUrl = '';
  window.openCard = function(url, title) {
    if (!url || url === '#') { toast('No link available'); return; }
    _currentCardUrl = url;
    var sheet = document.getElementById('card-sheet');
    var inner = document.getElementById('card-sheet-inner');
    var frame = document.getElementById('card-sheet-frame');
    var titleEl = document.getElementById('card-sheet-title');
    if (titleEl) titleEl.textContent = title || '';
    if (frame) frame.src = url;
    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
    setTimeout(function() { if (inner) inner.style.transform = 'translateY(0)'; }, 10);
  };
  window.closeCard = function() {
    var sheet = document.getElementById('card-sheet');
    var inner = document.getElementById('card-sheet-inner');
    var frame = document.getElementById('card-sheet-frame');
    if (inner) inner.style.transform = 'translateY(100%)';
    document.body.style.overflow = '';
    setTimeout(function() {
      sheet.style.display = 'none';
      if (frame) frame.src = '';
    }, 350);
  };
  window.openExternal = function() {
    if (_currentCardUrl) window.open(_currentCardUrl, '_blank');
  };
  window.playAudio = function(el) {
    var audioUrl = '${sv.audioUrl || ""}';
    if (!audioUrl) { toast('No audio available yet'); return; }
    if (window._premiumAudio) { window._premiumAudio.pause(); window._premiumAudio = null; }
    var audio = new Audio(audioUrl);
    window._premiumAudio = audio;
    var subEl = el.querySelector('div > div:last-child');
    if (subEl) subEl.textContent = 'Playing…';
    audio.play().then(function() {
      toast('▶ Playing welcome message…');
      // Unlock chat
      var chatArea = document.getElementById('chat-input-area');
      if (chatArea) { chatArea.style.opacity='1'; chatArea.style.pointerEvents='auto'; chatArea.removeAttribute('title'); }
      // Animate wave bars
      document.querySelectorAll('.wave-bar').forEach(function(b, i) {
        b.style.background = '#0a0a0a';
        b.style.animation = 'waveBar ' + (0.6 + (i%3)*0.15).toFixed(2) + 's ease-in-out ' + (i*0.05).toFixed(2) + 's infinite';
      });
    }).catch(function() {
      toast('Tap again to play');
    });
    audio.onended = function() {
      if (subEl) subEl.textContent = 'Welcome message played ✓';
      document.querySelectorAll('.wave-bar').forEach(function(b) { b.style.animation='none'; b.style.background='#d0d0d0'; });
      window._premiumAudio = null;
    };
  };

  // ── AI Chat ──
  window.sendChat = function() {
    var inp = document.getElementById('chat-input');
    var val = inp.value.trim();
    if (!val) return;
    var msgs = document.getElementById('chat-msgs');
    var uBubble = document.createElement('div');
    uBubble.style.cssText = 'background:${accent};color:#fff;border-radius:12px 0 12px 12px;padding:10px 14px;font-size:13px;line-height:1.55;align-self:flex-end;max-width:82%;margin-left:auto;';
    uBubble.textContent = val;
    msgs.appendChild(uBubble);
    inp.value = '';
    msgs.scrollTop = msgs.scrollHeight;

    var typing = document.createElement('div');
    typing.style.cssText = 'background:#2a2a2a;border-radius:0 12px 12px 12px;padding:10px 14px;font-size:13px;color:#f0ece0;display:inline-block;max-width:82%;';
    typing.textContent = '…';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    var body = JSON.stringify({message: val, slug: SLUG});
    fetch(API + '/lp/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:body})
      .then(function(r){ return r.json(); })
      .then(function(d) {
        typing.textContent = d.reply || d.message || 'I can help with that!';
        typing.style.color = '#f0ece0'; typing.style.background = '#2a2a2a';
        msgs.scrollTop = msgs.scrollHeight;
      })
      .catch(function() {
        typing.textContent = lang === 'de' ? 'Fragen Sie mich nach Öffnungszeiten, Angeboten oder anderen Infos.' : 'Ask me about our menu, hours, or anything else.';
        typing.style.color = '#0a0a0a';
      });
  };

  // ── Subscribe ──
  window.handleSubscribe = function() {
    var email = (document.getElementById('sub-email').value || '').trim();
    var gdpr  = document.getElementById('gdpr').checked;
    if (!email || !email.includes('@')) { toast('Please enter a valid email'); return; }
    if (!gdpr) { toast('Please accept to continue'); return; }
    fetch(API + '/lp/subscribe/' + SLUG, {
      method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email: email, gdprConsent: true, source:'email'})
    }).then(function(r){ return r.json(); })
      .then(function(d) {
        var msg = d.message || '';
        var isAlready = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('bereits');
        if (isAlready) {
          toast('${t.alreadySubscribed} 👍');
        } else {
          toast('${t.subscribedOk}');
          document.getElementById('sub-email').value = '';
          document.getElementById('gdpr').checked = false;
        }
      })
      .catch(function() { toast('Something went wrong'); });
  };

  // ── Wallet ──
  // Identity Continuity: resolveSlugCid() prioritizes an incoming ?cid=
  // (e.g. a returning customer opening "Go to Page" from their already-
  // installed wallet pass, or arriving via the welcome-page redirect) over
  // both slug-scoped and legacy stored values, so this never silently
  // mints a second identity for someone who already has one.
  window.addAppleWallet = function() {
    var c = resolveSlugCid(SLUG);
    window.location.href = API + '/lp/wallet/apple/' + SLUG + (c ? '?cid=' + encodeURIComponent(c) : '');
  };
  window.addGoogleWallet = function() {
    var c = resolveSlugCid(SLUG);
    window.location.href = 'https://api.qraivy.com/lp/wallet/google/' + SLUG + (c ? '?cid=' + encodeURIComponent(c) : '');
  };
  // OS detection — show only relevant wallet button
  (function() {
    var ua = navigator.userAgent;
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var isAndroid = /Android/i.test(ua);
    var appleBtn = document.querySelector('.lp-btn-apple-only');
    var googleBtn = document.querySelector('.lp-btn-google-only');
    var appleWrap = document.querySelector('.lp-wallet-cta-wrap');
    if (isIOS) {
      if (googleBtn) googleBtn.style.display = 'none';
    } else if (isAndroid) {
      if (appleWrap) appleWrap.style.display = 'none';
      else if (appleBtn) appleBtn.style.display = 'none';
    } else {
      // Desktop — hide both wallet buttons
      if (appleWrap) appleWrap.style.display = 'none';
      else if (appleBtn) appleBtn.style.display = 'none';
      if (googleBtn) googleBtn.style.display = 'none';
    }
  })();
  window.lpEnableNotifications = function() {
    var btn = document.getElementById('lp-notif-btn');
    if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
    Notification.requestPermission().then(function(p) {
      if (p === 'granted') {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
          fetch('/lp/webpush/vapid-key/' + SLUG).then(function(x){ return x.json(); }).then(function(d) {
            var arr = new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){ return c.charCodeAt(0); }));
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
          }).then(function(s) {
            var j = s.toJSON();
            return fetch('/lp/webpush/subscribe/' + SLUG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
          }).then(function() {
            if (btn) { btn.textContent = '\u2713 Notifications enabled!'; btn.style.background = 'rgba(34,197,94,0.2)'; btn.style.borderColor = 'rgba(34,197,94,0.5)'; btn.disabled = true; }
            localStorage.setItem('wp_sub_' + SLUG, '1');
          }).catch(function(e) { console.error('[Push] subscribe error', e); });
        });
      } else if (p === 'denied') {
        if (btn) btn.textContent = '\u26d4 Notifications blocked in browser settings';
      }
    });
  };
  // Show notif button if not already subscribed
  if (!localStorage.getItem('wp_sub_' + SLUG) && 'Notification' in window && Notification.permission !== 'denied') {
    var nb = document.getElementById('lp-notif-btn');
    if (nb) nb.style.display = 'block';
  }
})();
(function(){var _s=window.location.pathname.split('/').pop();console.log('[Push] Premium LP loaded, slug:',_s);var isStandalone=(window.navigator.standalone===true||window.matchMedia('(display-mode:standalone)').matches);if(!('serviceWorker' in navigator&&'PushManager' in window)){console.log('[Push] Blocked: not PWA or unsupported');var isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);var isSafari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);if(isIOS&&isSafari&&!isStandalone){setTimeout(function(){var hint=document.createElement('div');hint.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:14px 20px 28px;font-size:13px;line-height:1.5;z-index:9999;text-align:center;';hint.innerHTML='<div style="font-size:15px;font-weight:700;margin-bottom:6px;">\uD83D\uDCF2 Benachrichtigungen aktivieren<\/div><div style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;">Tippe auf <b>Teilen<\/b> \u2192 <b>Zum Home-Bildschirm<\/b>, dann \u00f6ffne die App vom Home-Bildschirm, um Benachrichtigungen zu aktivieren.<\/div><button onclick="this.parentNode.remove()" style="margin-top:14px;padding:10px 24px;background:#ff6b00;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Verstanden<\/button>';document.body.appendChild(hint);},2000);}return;}navigator.serviceWorker.register('/sw.js').then(function(reg){window.__swReg=reg;});if(localStorage.getItem('wp_sub_'+_s)){if('Notification' in window&&Notification.permission==='granted'){(function tryAS(){if(window.__swReg){fetch('https://www.qraivy.com/lp/webpush/vapid-key/'+_s).then(function(x){return x.json();}).then(function(d){var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));return window.__swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});}).then(function(s){var j=s.toJSON();return fetch('https://www.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});}).then(function(){localStorage.setItem('wp_sub_'+_s,'1');}).catch(function(){});}else{setTimeout(tryAS,500);}})();}return;}if(!('Notification' in window)||Notification.permission==='denied'){return;}var AC='#ff6b00';var ICONS={bell:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><\/svg>',check:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/><\/svg>',spin:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><\/svg>'};var STATES={idle:{icon:'bell',bg:'linear-gradient(135deg,#fff5f0,#ffe4d6)',ic:AC,title:'Stay updated instantly',desc:'Get special offers and updates from this business.',btn:'Enable Updates',trust:'You can turn this off anytime.'},asking:{icon:'spin',bg:'linear-gradient(135deg,#fff5f0,#ffe4d6)',ic:AC,title:'Setting things up…',desc:'',btn:'',trust:''},ok:{icon:'check',bg:'linear-gradient(135deg,#f0fdf4,#dcfce7)',ic:'#16a34a',title:"You're subscribed!",desc:"We'll notify you about special offers.",btn:'',trust:''}};var wrap=document.createElement('div');wrap.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9990;display:flex;justify-content:center;pointer-events:none;';var card=document.createElement('div');card.style.cssText='pointer-events:all;position:relative;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -6px 40px rgba(0,0,0,.14);padding:22px 22px 30px;width:100%;max-width:480px;box-sizing:border-box;transform:translateY(110%);transition:transform .38s cubic-bezier(.32,0,.67,0);';var xBtn=document.createElement('button');xBtn.style.cssText='position:absolute;top:14px;right:14px;background:rgba(0,0,0,.06);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;color:#888;font-size:16px;';xBtn.innerHTML='&times;';xBtn.onclick=function(){localStorage.setItem('wp_sub_'+_s,'dismissed');wrap.style.display='none';};var iWrap=document.createElement('div');iWrap.style.cssText='width:50px;height:50px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;';var iEl=document.createElement('div');iEl.style.cssText='width:26px;height:26px;';var ttl=document.createElement('div');ttl.style.cssText='font-size:1rem;font-weight:700;color:#1a1a1a;margin-bottom:6px;';var dsc=document.createElement('div');dsc.style.cssText='font-size:.86rem;color:#666;line-height:1.5;margin-bottom:14px;';var btn=document.createElement('button');btn.style.cssText='width:100%;padding:14px;background:'+AC+';color:#fff;border:none;border-radius:12px;font-size:.94rem;font-weight:700;cursor:pointer;';var tst=document.createElement('div');tst.style.cssText='font-size:.73rem;color:#aaa;text-align:center;margin-top:10px;';function setState(s){var c=STATES[s]||STATES.idle;iWrap.style.background=c.bg;iEl.style.color=c.ic;iEl.innerHTML=ICONS[c.icon]||'';ttl.textContent=c.title;dsc.textContent=c.desc;dsc.style.display=c.desc?'block':'none';btn.textContent=c.btn;btn.style.display=c.btn?'block':'none';tst.textContent=c.trust;tst.style.display=c.trust?'block':'none';if(s==='ok'){setTimeout(function(){wrap.style.display='none';},2800);}}iWrap.appendChild(iEl);card.appendChild(xBtn);card.appendChild(iWrap);card.appendChild(ttl);card.appendChild(dsc);card.appendChild(btn);card.appendChild(tst);wrap.appendChild(card);document.body.appendChild(wrap);setTimeout(function(){card.style.transform='translateY(0)';},600);setState('idle');function doSub(){setState('asking');function sub(reg){fetch('https://www.qraivy.com/lp/webpush/vapid-key/'+_s).then(function(x){return x.json();}).then(function(d){var arr=new Uint8Array(atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/')).split('').map(function(c){return c.charCodeAt(0);}));return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:arr});}).then(function(s){var j=s.toJSON();return fetch('https://www.qraivy.com/lp/webpush/subscribe/'+_s,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})});}).then(function(){localStorage.setItem('wp_sub_'+_s,'1');setState('ok');}).catch(function(){wrap.style.display='none';});}if(window.__swReg){sub(window.__swReg);}else{navigator.serviceWorker.register('/sw.js').then(sub);}}btn.onclick=function(){Notification.requestPermission().then(function(p){if(p==='granted'){doSub();}else if(p==='denied'){setState('ok');localStorage.setItem('wp_sub_'+_s,'denied');}else{wrap.style.display='none';}});};})()
<\/script>
</body>
</html>`;
}

// ── GET /lp/welcome/:slug — First-visit wallet enrollment page ──
async function handleLoyaltyWelcome(req, res) {
  try {
    const { slug } = req.params;
    const lang = req.query.lang || 'de';
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).send('Not found');
    const sections = page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {};
    const bizName = page.businessName || slug;
    const color = (sections.theme && sections.theme.accentColor) || '#e8a020';
    const logoUrl = sections.logo && sections.logo.url;
    // sections.stamp is never actually populated — StampSettings (the same
    // table handleStampConfirm/generateSmartQRPass read from) is the real
    // source of truth for goal/rewardName. Reading the wrong place here
    // silently fell back to a hardcoded goal of 10 regardless of what the
    // business actually configured.
    const stampCfg = await prisma.stampSettings.findUnique({ where: { slug } });
    const goal = stampCfg ? stampCfg.goal : 10;
    const rewardName = (stampCfg && stampCfg.rewardName) || (lang === 'de' ? 'Gratisprodukt' : 'Free Item');
    const logoHtml = logoUrl
      ? '<div class="logo"><img src="' + logoUrl + '" alt="logo"></div>'
      : '<div class="logo">' + bizName.charAt(0) + '</div>';
    const isDE = lang === 'de';
    const t = {
      badge: isDE ? '&#127873; Treueprämien' : '&#127873; Loyalty Rewards',
      reward: isDE ? ('Sammle ' + goal + ' Stempel \u2014 erhalte ' + rewardName) : ('Sammle ' + goal + ' Stempel \u2014 get ' + rewardName),
      explain: isDE ? 'Keine App erforderlich. Füge deine Treuekarte zu deinem Wallet hinzu und sammle Prämien automatisch.' : 'No app required. Add your loyalty card to your wallet and collect rewards automatically.',
      apple: isDE ? '&#127822; Zu Apple Wallet hinzufügen' : '&#127822; Add to Apple Wallet',
      google: isDE ? '&#128241; Zu Google Wallet hinzufügen' : '&#128241; Add to Google Wallet',
      skip: isDE ? 'Ohne Wallet fortfahren' : 'Continue without wallet',
      powered: isDE ? 'Unterstützt von' : 'Powered by',
    };
    const html = '<!DOCTYPE html><html lang="' + lang + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><title>Welcome - ' + bizName + '</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}.wrap{max-width:340px;width:100%;text-align:center}.card{background:' + color + ';border-radius:24px;padding:32px 24px 28px;box-shadow:0 24px 64px rgba(0,0,0,0.6)}.logo{width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:1.9rem;font-weight:800;color:#fff}.logo img{width:100%;height:100%;object-fit:cover;border-radius:50%}.biz{font-size:1.3rem;font-weight:800;color:#fff;margin-bottom:14px}.badge{display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:.7rem;font-weight:700;letter-spacing:.08em;padding:4px 13px;border-radius:999px;margin-bottom:14px}.reward{font-size:.95rem;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.4}.explain{font-size:.78rem;color:rgba(255,255,255,0.92);margin-bottom:22px;line-height:1.6;padding:0 4px}.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:15px;border:none;border-radius:14px;font-size:.92rem;font-weight:700;cursor:pointer;margin-bottom:10px;-webkit-tap-highlight-color:transparent}.btn-apple{background:#000;color:#fff}.btn-google{background:#fff;color:#222;border:1px solid #e5e5e5}.btn-skip{display:block;width:100%;padding:13px;background:rgba(0,0,0,0.15);color:#fff;border:1.5px solid rgba(255,255,255,0.6);border-radius:14px;font-size:.84rem;font-weight:600;cursor:pointer;margin-top:4px}.powered{margin-top:18px;font-size:.62rem;color:rgba(255,255,255,0.22)}.powered a{color:rgba(255,255,255,0.28);text-decoration:none}</style></head><body><div class="wrap"><div class="card">' + logoHtml + '<div class="biz">' + bizName + '</div><div class="badge">' + t.badge + '</div><div class="reward">' + t.reward + '</div><div class="explain">' + t.explain + '</div><button class="btn btn-apple" onclick="addAppleWallet()">' + t.apple + '</button><button class="btn btn-google" onclick="addGoogleWallet()">' + t.google + '</button><button class="btn-skip" onclick="continueWithout()">' + t.skip + '</button></div><div class="powered">' + t.powered + ' <a href="https://qraivy.com">Qraivy</a></div></div><script>' + SLUG_CID_HELPER_JS + '(function(){var s="' + slug + '";var RESOLVED_CID=null;try{RESOLVED_CID=resolveSlugCid(s);}catch(ex){}function mE(){try{localStorage.setItem("wEnr_"+s,"1");}catch(ex){}}function backToLP(){return "/lp/"+s+(RESOLVED_CID?"?cid="+encodeURIComponent(RESOLVED_CID):"");}function addAppleWallet(){mE();window.location.href="/lp/wallet/apple/"+s+(RESOLVED_CID?"?cid="+encodeURIComponent(RESOLVED_CID):"");setTimeout(function(){window.location.href=backToLP();},4000);}function addGoogleWallet(){mE();window.location.href="/lp/wallet/google/"+s+(RESOLVED_CID?"?cid="+encodeURIComponent(RESOLVED_CID):"");setTimeout(function(){window.location.href=backToLP();},4000);}function continueWithout(){mE();window.location.href=backToLP();}window.addAppleWallet=addAppleWallet;window.addGoogleWallet=addGoogleWallet;window.continueWithout=continueWithout;(function(){var ua=navigator.userAgent;var isIOS=/iPhone|iPad|iPod/i.test(ua);var isAndroid=/Android/i.test(ua);var ab=document.querySelector(".btn-apple");var gb=document.querySelector(".btn-google");if(isIOS){if(gb)gb.style.display="none";}else if(isAndroid){if(ab)ab.style.display="none";}else{if(ab)ab.style.display="none";if(gb)gb.style.display="none";}})();})();<\/script></body></html>';
    return res.send(html);
  } catch(e) {
    console.error('[LoyaltyWelcome] Error:', e.message);
    return res.status(500).send('Error');
  }
}

// ── Staff PIN — set (auth required), status (no auth), verify (no auth) ──
// PIN is hashed with sha256 and stored in LandingPage.sections.staffPin.
// Not high-security — this is a lightweight barrier so staff don't need
// the business owner's Clerk account, not an access-control boundary.

const _pinHash = (pin) => require('crypto').createHash('sha256').update(String(pin).trim() + 'qraivy-pin-salt').digest('hex');

async function handleSetStaffPin(req, res) {
  try {
    const { slug } = req.params;
    const { pin } = req.body || {};
    if (!pin || String(pin).trim().length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits.' });
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    if (page.userId && req.userId && page.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    let sec = page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {};
    sec.staffPin = _pinHash(pin);
    await prisma.landingPage.update({ where: { slug }, data: { sections: JSON.stringify(sec) } });
    pageCache.delByPrefix('lp:' + slug);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

// GET /lp/staff-pin/:slug/status — existence check only, no auth, no PIN
// guess involved. Lets the scanner ask "is a PIN configured at all" without
// going through PIN validation, so a business with no PIN configured can be
// detected directly instead of via the shape of a rejected guess. Never
// returns the hash itself — only a boolean.
async function handleGetStaffPinStatus(req, res) {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    let sec;
    try {
      sec = page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {};
    } catch (parseErr) {
      // Malformed sections JSON (legacy/corrupt data) can't be proven to
      // contain a configured PIN — treat as "not configured" rather than
      // 500ing. The PIN gate is documented above as a lightweight
      // staff-friction barrier, not an access-control boundary, so this
      // default costs nothing security-wise and avoids a permanent scanner
      // lockout for any business whose sections data happens to be corrupt.
      return res.json({ configured: false });
    }
    return res.json({ configured: !!sec.staffPin });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

// POST /lp/staff-pin/:slug/verify — validates an entered PIN only. Assumes
// the caller already knows a PIN is configured (via the status endpoint
// above); a missing/empty pin here is a bad request, not a signal to check
// whether one exists.
async function handleVerifyStaffPin(req, res) {
  try {
    const { slug } = req.params;
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN required.' });
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    let sec = page.sections ? JSON.parse(typeof page.sections === 'string' ? page.sections : JSON.stringify(page.sections)) : {};
    if (!sec.staffPin) return res.status(404).json({ error: 'No PIN set for this page.' });
    if (sec.staffPin !== _pinHash(pin)) return res.status(401).json({ error: 'Incorrect PIN.' });
    return res.json({ ok: true, slug });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}

// ── END PREMIUM TEMPLATE RENDERER ────────────────────────────────────────

module.exports = { handlePublishLP, handleDeleteLP, handleServeLP, handleGetLP, handleListLPs,
  handleGenerateAppleWalletPass, handleUploadLogo, handleUploadStrip, handleChatLP, handleSendPush, handleWebPushSubscribe, handleWebPushVapidKey, handlePushCount, handlePushHistory, handleSubscribe, handleGetSubscribers,
  handleLoyaltyCardPage, handleLoyaltyWelcome, handleGetNFCToken, handleCustomerStamp, handleStamp, handleStampConfirm, handleRedeemTap, handleRedeemTapConfirm, handleGetStampToken, handleStampSettings, handleGetStampSettings,
  handleLPManifest,
  handleSetStaffPin, handleGetStaffPinStatus, handleVerifyStaffPin,
};






