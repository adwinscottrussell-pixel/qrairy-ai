const {buildPlanInfo,resolveEffectivePlan,PLAN_CAPS}=require('../utils/tierSystem');
const { createQR, getQRById } = require('../services/qrService');
const { logScan } = require('../services/scanService');
const { decideRedirectUrl } = require('../agents/redirectAgent');
const prisma = require('../utils/prismaClient');
const { getCustomerCountsBySlug, getCustomerGrowthSeries, getCustomerSummary } = require('../services/customerQueryService');

// ─── Tier definitions ────────────────────────────────────────────────────────
const PLAN_LIMITS = { free: Infinity, starter: 10, pro: Infinity };
const PLAN_AI_LIMITS = { free: 0, starter: 10, pro: null, pro_annual: null, business: null, business_annual: null }; // null = unlimited
const PLAN_DYNAMIC = { free: false, starter: false, starter_annual: false, pro: true, pro_annual: true, business: true, business_annual: true };

// ─── Auth helper ─────────────────────────────────────────────────────────────
const { verifyToken } = require('@clerk/backend');

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return payload.sub || null;
  } catch (err) {
    console.error('Token verify error:', err.message);
    return null;
  }
}

async function upsertUser(userId) {
  return prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
    include: { qrs: true },
  });
}

// ─── Firecrawl scraper ───────────────────────────────────────────────────────
async function scrapeBusinessSite(url) {
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    const data = await response.json();
    if (data.success && data.data?.markdown) {
      return data.data.markdown.slice(0, 3000);
    }
    return null;
  } catch (err) {
    console.error('Firecrawl scrape error:', err);
    return null;
  }
}

// ─── POST /qr ────────────────────────────────────────────────────────────────
async function handleCreateQR(req, res) {
  try {
    const { url, businessName, isDynamic } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'A valid URL is required.' });
    }

    const userId = await getUserFromToken(req.headers.authorization);
    let userPlan = 'free';
    let userQrCount = 0;

    if (userId) {
      const user = await upsertUser(userId);
      userPlan = user.plan || 'free';
      userQrCount = user.qrs.length;

      // Check basic QR limit (free is now unlimited, so this mainly guards starter at 10)
      const basicLimit = PLAN_LIMITS[userPlan];
      if (basicLimit !== Infinity && userQrCount >= basicLimit) {
        return res.status(403).json({
          error: `You have reached your ${userPlan} plan limit of ${basicLimit} QR codes. Please upgrade to create more.`,
          upgrade: true,
          plan: userPlan,
          limit: basicLimit,
        });
      }
    }

    // ── Gate: businessName requires Starter or Pro ──────────────────────────
    if (businessName) {
      const aiLimit = PLAN_AI_LIMITS[userPlan];
      if (aiLimit === 0) {
        return res.status(403).json({
          error: 'AI landing pages require a Starter or Pro plan. Basic QR codes are always free.',
          upgrade: true,
          plan: userPlan,
          upgradeFeature: 'ai_landing_page',
        });
      }
      // Starter: count how many AI QRs they already have
      if (aiLimit !== Infinity) {
        const aiQrCount = await prisma.qR.count({
          where: { userId, businessName: { not: null } },
        });
        if (aiQrCount >= aiLimit) {
          return res.status(403).json({
            error: `You've used all ${aiLimit} AI landing pages on your Starter plan. Upgrade to Pro for unlimited.`,
            upgrade: true,
            plan: userPlan,
            upgradeFeature: 'ai_landing_page_limit',
          });
        }
      }
    }

    // ── Gate: Dynamic QR requires Pro ──────────────────────────────────────
    if (isDynamic && !PLAN_DYNAMIC[userPlan]) {
      return res.status(403).json({
        error: 'Dynamic QR codes are a Pro feature. Upgrade to Pro to print once and update the destination forever.',
        upgrade: true,
        plan: userPlan,
        upgradeFeature: 'dynamic_qr',
      });
    }

    const qr = await prisma.qR.create({
      data: {
        originalUrl: url,
        businessName: businessName || null,
        userId: userId || null,
        isDynamic: isDynamic === true,
        destinationUrl: isDynamic ? url : null, // dynamic QRs track current destination separately
      },
    });

    const redirectUrl = `https://api.qraivy.com/r/${qr.id}`;

    // Fire-and-forget site scrape for AI landing pages
    if (businessName) {
      scrapeBusinessSite(url).then(async (siteContent) => {
        if (siteContent) {
          await prisma.qR.update({ where: { id: qr.id }, data: { siteContent } });
          console.log(`Scraped site content for QR ${qr.id}`);
        }
      }).catch(err => console.error('Background scrape error:', err));
    }

    return res.status(201).json({ id: qr.id, redirectUrl, isDynamic: qr.isDynamic });
  } catch (err) {
    console.error('handleCreateQR error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── PUT /qr/:id/destination  (Pro: update dynamic QR destination) ───────────
async function handleUpdateDestination(req, res) {
  try {
    const { id } = req.params;
    const { destinationUrl } = req.body;

    if (!destinationUrl || !destinationUrl.startsWith('http')) {
      return res.status(400).json({ error: 'A valid destination URL is required.' });
    }

    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

    const user = await upsertUser(userId);
    if (!PLAN_DYNAMIC[user.plan]) {
      return res.status(403).json({
        error: 'Dynamic QR destination editing requires a Pro plan.',
        upgrade: true,
        upgradeFeature: 'dynamic_qr',
      });
    }

    const qr = await prisma.qR.findUnique({ where: { id } });
    if (!qr) return res.status(404).json({ error: 'QR not found.' });
    if (qr.userId !== userId) return res.status(403).json({ error: 'Not your QR code.' });
    if (!qr.isDynamic) return res.status(400).json({ error: 'This QR code is not dynamic.' });

    const updated = await prisma.qR.update({
      where: { id },
      data: { destinationUrl },
    });

    return res.status(200).json({ success: true, destinationUrl: updated.destinationUrl });
  } catch (err) {
    console.error('handleUpdateDestination error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /r/:id  (redirect — uses destinationUrl for dynamic QRs) ────────────
async function handleRedirect(req, res) {
  try {
    const { id } = req.params;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const qr = await getQRById(id);
    if (!qr) return res.status(404).json({ error: 'QR not found.' });

    await logScan(qr.id, userAgent);

    if (qr.businessName) {
      return res.redirect(302, `https://www.qraivy.com/visit.html?id=${qr.id}`);
    }

    // Dynamic QR: redirect to current destinationUrl if set
    if (qr.isDynamic && qr.destinationUrl) {
      return res.redirect(302, qr.destinationUrl);
    }

    const context = { userAgent };
    const targetUrl = decideRedirectUrl(qr, context);
    return res.redirect(302, targetUrl);
  } catch (err) {
    console.error('handleRedirect error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /user/plan ──────────────────────────────────────────────────────────
async function handleGetUserPlan(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await upsertUser(userId);
    const { buildPlanInfo } = require('./utils/tierSystem');
    const aiQrCount = await prisma.qR.count({ where: { userId, businessName: { not: null } } });
    const planInfo = buildPlanInfo(user, aiQrCount);
    return res.status(200).json(planInfo);

    return res.status(200).json({
      plan,
      qrCount: user.qrs.length,
      limit: basicLimit,
      aiQrCount,
      aiLimit,
      canCreate: basicLimit === null || user.qrs.length < basicLimit,
      canCreateAI: aiLimit === null || aiQrCount < aiLimit,
      canUseDynamic: PLAN_DYNAMIC[plan],
      hasPhone: !!user.phone,
    });
  } catch (err) {
    console.error('handleGetUserPlan error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── POST /user/phone ────────────────────────────────────────────────────────
async function handleUpdateUserPhone(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    await prisma.user.upsert({
      where: { id: userId },
      update: { phone },
      create: { id: userId, phone },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('handleUpdateUserPhone error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /visit/:id ──────────────────────────────────────────────────────────
async function handleVisit(req, res) {
  try {
    const { id } = req.params;
    const qr = await prisma.qR.findUnique({ where: { id } });
    if (!qr) return res.status(404).json({ error: 'QR not found.' });
    return res.status(200).json({
      id: qr.id,
      businessName: qr.businessName,
      originalUrl: qr.originalUrl,
      hasSiteContent: !!qr.siteContent,
    });
  } catch (err) {
    console.error('handleVisit error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── POST /chat ──────────────────────────────────────────────────────────────
async function handleChat(req, res) {
  try {
    const { qrId, message, history } = req.body;
    if (!qrId || !message) return res.status(400).json({ error: 'qrId and message are required.' });

    const qr = await prisma.qR.findUnique({ where: { id: qrId } });
    if (!qr) return res.status(404).json({ error: 'QR not found.' });

    const messages = [...(history || []), { role: 'user', content: message }];

    const systemPrompt = qr.siteContent
      ? `You are a friendly helpful assistant for ${qr.businessName}.\nHere is the actual content from their website:\n\n${qr.siteContent}\n\nUse this real information to answer customer questions accurately. Keep responses under 3 sentences. Always encourage the customer to subscribe for special offers at the end.`
      : `You are a friendly helpful assistant for ${qr.businessName}.\nThe business website is ${qr.originalUrl}.\nAnswer questions in a friendly, concise way (under 3 sentences). Always encourage the customer to subscribe for special offers.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system: systemPrompt, messages }),
    });
    const data = await response.json();
    const reply = data.content[0].text.trim();
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('handleChat error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /analytics ──────────────────────────────────────────────────────────
async function handleAnalytics(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const data = await prisma.qR.findMany({ where: { userId }, include: { scans: true }, orderBy: { createdAt: 'desc' } });
    const analytics = data.map(qr => ({
      id: qr.id,
      originalUrl: qr.originalUrl,
      businessName: qr.businessName,
      redirectUrl: `https://api.qraivy.com/r/${qr.id}`,
      totalScans: qr.scans.length,
      createdAt: qr.createdAt,
    }));
    return res.status(200).json({ analytics });
  } catch (err) {
    console.error('handleAnalytics error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /dashboard ──────────────────────────────────────────────────────────
async function handleDashboard(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    const where = userId ? { userId } : null;
    if (!where) return res.json({ dashboard: [] });
    const data = await prisma.qR.findMany({
      where,
      include: { scans: true, subscribers: true },
      orderBy: { createdAt: 'desc' },
    });

    const dashboard = data.map(qr => ({
      id: qr.id,
      originalUrl: qr.originalUrl,
      businessName: qr.businessName || null,
      redirectUrl: `https://api.qraivy.com/r/${qr.id}`,
      totalScans: qr.scans.length,
      totalSubscribers: qr.subscribers.length,
      hasSiteContent: !!qr.siteContent,
      isDynamic: qr.isDynamic || false,
      destinationUrl: qr.destinationUrl || null,
      createdAt: qr.createdAt,
      source: 'qr',
    }));

    // Also include LandingPage records
    const lpWhere = userId ? { userId } : {};
    const lpData = await prisma.landingPage.findMany({
      where: lpWhere,
      orderBy: { createdAt: 'desc' },
    });
    // Get LP subscriber counts in one query
    const lpSlugs = lpData.map(lp => lp.slug);
    const lpSubCounts = await prisma.subscriber.groupBy({
      by: ['slug'],
      where: { slug: { in: lpSlugs }, status: 'subscribed' },
      _count: { id: true },
    });
    const lpSubMap = Object.fromEntries(lpSubCounts.map(r => [r.slug, r._count.id]));

    // Canonical Customer Foundation counts, additive to the legacy Subscriber
    // counts above — never replaces them. Only LandingPage-backed (source:'lp')
    // items have a slug, which is the only thing Customer Foundation's
    // dual-write hooks (all rooted in lpController.js) ever attach an identity
    // to; bare QR items below have no slug and therefore no possible canonical
    // attribution yet — their totalCustomers stays undefined, not 0, so the
    // Analytics UI can distinguish "not attributable" from "genuinely zero".
    const customerCountsBySlug = userId
      ? await getCustomerCountsBySlug({ ownerUserId: userId, slugs: lpSlugs })
      : new Map();

    const lpCards = lpData.map(lp => ({
      id: lp.id,
      originalUrl: lp.websiteUrl || '',
      businessName: lp.businessName || null,
      redirectUrl: `https://api.qraivy.com/lp/${lp.slug}`,
      slug: lp.slug,
      // Landing Page visits (GET /lp/:slug page loads), not QR redirect
      // scans — never exposed as totalScans. See docs on Scans vs Visits.
      totalVisits: lp.scanCount || 0,
      totalSubscribers: lpSubMap[lp.slug] || 0,
      totalCustomers: customerCountsBySlug.get(lp.slug) ?? 0,
      hasSiteContent: true,
      isDynamic: true,
      destinationUrl: lp.websiteUrl || null,
      createdAt: lp.createdAt,
      source: 'lp',
    }));
    const allCards = [...dashboard, ...lpCards].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let planInfo = null;
    if (userId) {
      const user = await upsertUser(userId);
      const plan = user.plan || 'free';
      const basicLimit = PLAN_LIMITS[plan] === Infinity ? null : PLAN_LIMITS[plan];
      const aiLimit = PLAN_AI_LIMITS[plan] === Infinity ? null : PLAN_AI_LIMITS[plan];
      const aiQrCount = await prisma.qR.count({ where: { userId, businessName: { not: null } } });

      planInfo = {
        plan,
        qrCount: user.qrs.length,
        limit: basicLimit,
        aiQrCount,
        aiLimit,
        canCreate: basicLimit === null || user.qrs.length < basicLimit,
        canCreateAI: aiLimit === null || aiQrCount < aiLimit,
        canUseDynamic: PLAN_DYNAMIC[plan],
        hasPhone: !!user.phone,
      };
    }

    // Canonical Customer Foundation, additive to the response — the top-level
    // KPI card and the growth chart. totalCustomers here is the SAME
    // all-time, tenant-scoped count getCustomerSummary already exposes on
    // /customers/summary, reused rather than recomputed. 90 days is the
    // largest window Analytics' date-range filter supports; the frontend
    // slices the trailing N days it needs from this one fetched series,
    // matching how the rest of this endpoint's payload is fetched once and
    // re-rendered client-side on range change, not re-fetched per range.
    let customerSummary = null;
    let customerGrowth = [];
    if (userId) {
      const [summary, growth] = await Promise.all([
        getCustomerSummary({ ownerUserId: userId }),
        getCustomerGrowthSeries({ ownerUserId: userId, days: 90 }),
      ]);
      customerSummary = summary;
      customerGrowth = growth;
    }

    return res.status(200).json({ dashboard: allCards, planInfo, customerSummary, customerGrowth });
  } catch (err) {
    console.error('handleDashboard error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleDeleteQR(req, res) {
  try {
    const { id } = req.params;
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const qr = await prisma.qR.findUnique({ where: { id } });
    if (!qr) return res.status(404).json({ error: 'QR not found.' });
    if (qr.userId !== userId) return res.status(403).json({ error: 'Forbidden.' });
    // Delete related records first
    await prisma.scan.deleteMany({ where: { qrId: id } });
    await prisma.subscriber.deleteMany({ where: { qrId: id } });
    await prisma.qR.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('handleDeleteQR error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = {
  getUserFromToken,
  handleCreateQR,
  handleDeleteQR,
  handleUpdateDestination,
  handleGetUserPlan,
  handleUpdateUserPhone,
  handleRedirect,
  handleVisit,
  handleChat,
  handleAnalytics,
  handleDashboard,
};





