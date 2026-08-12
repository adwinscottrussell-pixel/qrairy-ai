// loyaltyAdminController.js
// Owner-scoped admin endpoints for loyalty programs.
// A "loyalty program" = LandingPage (owns userId + slug) + StampSettings (the config).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { buildCampaignPrompt, VALID_CAMPAIGN_TYPES } = require('../services/campaignPromptService');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Get the long-lived NFC/redeem token for a slug, creating one if needed.
// Physical NFC tags are static, so this must never return a short-lived
// token from the dashboard's separate daily-rotating QR code system — only
// reuse an existing token if it still has substantial remaining lifetime,
// otherwise create a fresh one with a genuine 1-year expiry. (Mirrors the
// fix applied to getNFCStampToken in lpController.js.)
async function getOrCreateStampToken(slug) {
  const now = new Date();
  const minLifetime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.stampToken.findFirst({
    where: { slug, expiresAt: { gt: minLifetime } },
    orderBy: { expiresAt: 'desc' }
  });
  if (existing) return existing.token;
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await prisma.stampToken.create({ data: { slug, token, expiresAt } });
  return token;
}

// Build the program response object from a LandingPage + (optional) StampSettings.
async function buildProgram(landingPage) {
  const [settings, pass, stampCount, rewardsEarned, rewardsRedeemed] = await Promise.all([
    prisma.stampSettings.findUnique({ where: { slug: landingPage.slug } }),
    prisma.pass.findUnique({ where: { serialNumber: 'sqr-' + landingPage.slug } }),
    prisma.stampEntry.count({ where: { slug: landingPage.slug } }),
    prisma.rewardEvent.count({ where: { slug: landingPage.slug, status: 'earned' } }),
    prisma.rewardEvent.count({ where: { slug: landingPage.slug, status: 'redeemed' } })
  ]);

  const token = await getOrCreateStampToken(landingPage.slug);
  const stampUrl = 'https://api.qraivy.com/stamp/' + landingPage.slug + '/' + token;
  const redeemUrl = 'https://api.qraivy.com/redeem/' + landingPage.slug + '/' + token;

  // Brand color comes from the Smart Landing Page only — single source of
  // truth shared with the actual Apple/Google Wallet pass. There is no
  // separate loyalty-specific color anymore.
  const sections = landingPage.sections
    ? JSON.parse(typeof landingPage.sections === 'string' ? landingPage.sections : JSON.stringify(landingPage.sections))
    : {};
  const brandColor = (sections.theme && sections.theme.accentColor) || '#ff5a1f';

  return {
    id: landingPage.id,
    slug: landingPage.slug,
    businessName: landingPage.businessName,
    rewardText: settings ? settings.rewardName : null,
    stampGoal: settings ? settings.goal : null,
    status: settings && settings.enabled ? 'active' : 'paused',
    hasLoyaltyConfig: !!settings,
    currentStamps: pass ? pass.stampCount : 0,
    customerCount: pass ? 1 : 0,
    totalStampsIssued: stampCount,
    rewardsEarned,
    rewardsRedeemed,
    color: brandColor,
    stampUrl,
    nfcUrl: stampUrl,
    redeemUrl,
    createdAt: landingPage.createdAt,
    updatedAt: (settings && settings.updatedAt) || landingPage.updatedAt
  };
}

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

// GET /loyalty/programs
async function listPrograms(req, res) {
  try {
    const userId = req.userId;
    const pages = await prisma.landingPage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    const programs = await Promise.all(pages.map(buildProgram));
    return res.json({ programs });
  } catch (e) {
    console.error('[LoyaltyAdmin] listPrograms error:', e.message);
    return res.status(500).json({ error: 'Failed to load programs' });
  }
}

// GET /loyalty/programs/:id
async function getProgram(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const lp = await prisma.landingPage.findUnique({ where: { id } });
    if (!lp) return res.status(404).json({ error: 'Program not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    const program = await buildProgram(lp);
    return res.json({ program });
  } catch (e) {
    console.error('[LoyaltyAdmin] getProgram error:', e.message);
    return res.status(500).json({ error: 'Failed to load program' });
  }
}

// POST /loyalty/programs
// Upserts StampSettings for an existing LandingPage.
// Body: { slug, goal?, rewardName?, enabled? }
async function createProgram(req, res) {
  try {
    const userId = req.userId;
    const { slug, goal, rewardName, enabled, color } = req.body || {};
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const lp = await prisma.landingPage.findUnique({ where: { slug } });
    if (!lp) return res.status(404).json({ error: 'Landing page with that slug not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.stampSettings.upsert({
      where: { slug },
      create: {
        slug,
        goal: typeof goal === 'number' ? goal : 10,
        rewardName: typeof rewardName === 'string' ? rewardName : 'Free item',
        enabled: enabled !== false,
        ...(typeof color === 'string' && color && { color })
      },
      update: {
        ...(typeof goal === 'number' && { goal }),
        ...(typeof rewardName === 'string' && { rewardName }),
        ...(typeof enabled === 'boolean' && { enabled }),
        ...(typeof color === 'string' && color && { color })
      }
    });

    const program = await buildProgram(lp);
    return res.json({ program });
  } catch (e) {
    console.error('[LoyaltyAdmin] createProgram error:', e.message);
    return res.status(500).json({ error: 'Failed to create program' });
  }
}

// PUT /loyalty/programs/:id
// Body: any of { goal, rewardName, enabled, businessName }
async function updateProgram(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { goal, rewardName, enabled, businessName } = req.body || {};

    const lp = await prisma.landingPage.findUnique({ where: { id } });
    if (!lp) return res.status(404).json({ error: 'Program not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    if (typeof goal === 'number' || typeof rewardName === 'string' || typeof enabled === 'boolean') {
      await prisma.stampSettings.upsert({
        where: { slug: lp.slug },
        create: {
          slug: lp.slug,
          goal: typeof goal === 'number' ? goal : 10,
          rewardName: typeof rewardName === 'string' ? rewardName : 'Free item',
          enabled: typeof enabled === 'boolean' ? enabled : true
        },
        update: {
          ...(typeof goal === 'number' && { goal }),
          ...(typeof rewardName === 'string' && { rewardName }),
          ...(typeof enabled === 'boolean' && { enabled })
        }
      });
    }

    if (typeof businessName === 'string' && businessName.trim()) {
      await prisma.landingPage.update({ where: { id }, data: { businessName: businessName.trim() } });
    }

    const updated = await prisma.landingPage.findUnique({ where: { id } });
    const program = await buildProgram(updated);
    return res.json({ program });
  } catch (e) {
    console.error('[LoyaltyAdmin] updateProgram error:', e.message);
    return res.status(500).json({ error: 'Failed to update program' });
  }
}

// PATCH /loyalty/programs/:id/status
// Body: { status: 'active' | 'paused' }
async function toggleStatus(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { status } = req.body || {};
    if (status !== 'active' && status !== 'paused') {
      return res.status(400).json({ error: 'status must be "active" or "paused"' });
    }

    const lp = await prisma.landingPage.findUnique({ where: { id } });
    if (!lp) return res.status(404).json({ error: 'Program not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.stampSettings.upsert({
      where: { slug: lp.slug },
      create: { slug: lp.slug, enabled: status === 'active' },
      update: { enabled: status === 'active' }
    });

    const program = await buildProgram(lp);
    return res.json({ program });
  } catch (e) {
    console.error('[LoyaltyAdmin] toggleStatus error:', e.message);
    return res.status(500).json({ error: 'Failed to update status' });
  }
}

// POST /loyalty/programs/:id/stamp
// Admin manually issues a stamp. Anonymous customer = the slug's single Pass.
async function adminStamp(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const lp = await prisma.landingPage.findUnique({ where: { id } });
    if (!lp) return res.status(404).json({ error: 'Program not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const serial = 'sqr-' + lp.slug;
    const pass = await prisma.pass.findUnique({ where: { serialNumber: serial } });
    if (!pass) return res.status(404).json({ error: 'No customer pass exists for this program yet' });

    const settings = await prisma.stampSettings.findUnique({ where: { slug: lp.slug } });
    const goal = settings ? settings.goal : 10;
    const previouslyReady = pass.rewardReady;
    const newCount = Math.min((pass.stampCount || 0) + 1, goal);
    const rewardReady = newCount >= goal;
    const now = new Date();

    await prisma.pass.update({
      where: { id: pass.id },
      data: {
        stampCount: newCount,
        rewardReady,
        totalStamps: { increment: 1 },
        lastStampAt: now,
        updatedAt: now
      }
    });

    await prisma.stampEntry.create({
      data: { slug: lp.slug, passId: pass.id, source: 'admin' }
    });

    if (rewardReady && !previouslyReady) {
      try {
        await prisma.rewardEvent.create({
          data: {
            slug: lp.slug,
            passId: pass.id,
            rewardText: (settings && settings.rewardName) || 'Free item',
            status: 'earned'
          }
        });
      } catch (e) { console.error('[LoyaltyAdmin] RewardEvent create error:', e.message); }
    }

    return res.json({
      ok: true,
      stampCount: newCount,
      goal,
      rewardReady,
      newlyEarned: rewardReady && !previouslyReady
    });
  } catch (e) {
    console.error('[LoyaltyAdmin] adminStamp error:', e.message);
    return res.status(500).json({ error: 'Failed to stamp' });
  }
}

// GET /loyalty/programs/:id/stats
async function getStats(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const lp = await prisma.landingPage.findUnique({ where: { id } });
    if (!lp) return res.status(404).json({ error: 'Program not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const slug = lp.slug;
    const [pass, totalStamps, rewardsEarned, rewardsRedeemed, recentStamps] = await Promise.all([
      prisma.pass.findUnique({ where: { serialNumber: 'sqr-' + slug } }),
      prisma.stampEntry.count({ where: { slug } }),
      prisma.rewardEvent.count({ where: { slug, status: 'earned' } }),
      prisma.rewardEvent.count({ where: { slug, status: 'redeemed' } }),
      prisma.stampEntry.findMany({
        where: { slug },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, source: true, createdAt: true }
      })
    ]);

    return res.json({
      stats: {
        customers: pass ? 1 : 0,
        currentStamps: pass ? pass.stampCount : 0,
        totalStampsIssued: totalStamps,
        rewardsEarned,
        rewardsRedeemed,
        rewardReady: pass ? pass.rewardReady : false,
        lastStampAt: pass ? pass.lastStampAt : null
      },
      recentStamps
    });
  } catch (e) {
    console.error('[LoyaltyAdmin] getStats error:', e.message);
    return res.status(500).json({ error: 'Failed to load stats' });
  }
}

// GET /loyalty/programs/:id/customers
async function getCustomers(req, res) {
  try {
    const userId = req.userId;
    const lp = await prisma.landingPage.findUnique({ where: { id: req.params.id } });
    if (!lp) return res.status(404).json({ error: 'Not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    const settings = await prisma.stampSettings.findUnique({ where: { slug: lp.slug } });
    const goal = settings ? settings.goal : 10;
    const rows = await prisma.loyaltyCustomer.findMany({
      where: { slug: lp.slug }, orderBy: { lastStampAt: 'desc' }, take: 200
    });
    return res.json({
      customers: rows.map(function(c) {
        return {
          maskedId: c.customerId.slice(0, 8) + '***',
          hasWallet: c.hasWallet,
          stampCount: c.stampCount,
          goal,
          rewardReady: c.rewardReady,
          rewardsEarned: c.rewardsEarned,
          lastStampAt: c.lastStampAt,
          createdAt: c.createdAt
        };
      }),
      total: rows.length
    });
  } catch(e) {
    console.error('[CustomerList] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// POST /loyalty/campaign/generate
async function generateCampaignMessage(req, res) {
  try {
    const { campaignType, goal, offer, tone, bizName, rewardName, language } = req.body || {};
    if (!campaignType) return res.status(400).json({ error: 'campaignType is required' });
    if (!VALID_CAMPAIGN_TYPES.includes(campaignType)) {
      return res.status(400).json({ error: 'Unsupported campaignType: ' + campaignType });
    }
    if (!goal) return res.status(400).json({ error: 'goal is required' });

    const { system: sys, user: usr } = buildCampaignPrompt({
      campaignType,
      businessContext: { bizName, offer, rewardName, tone },
      goal,
      language
    });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: sys,
        messages: [{ role: 'user', content: usr }]
      })
    });
    const d = await r.json();
    const raw = ((d.content || [])[0] || {}).text || '{}';
    const result = JSON.parse(raw.replace(/```[a-z]*/g,'').replace(/```/g,'').trim());
    return res.json({ ok: true, title: result.title || '', body: result.body || '', cta: result.cta || '' });
  } catch(e) {
    console.error('[Campaign] generate error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// GET /loyalty/subscribers/summary
async function getSubscriberSummary(req, res) {
  try {
    const userId = req.userId;

    // P0 SECURITY FIX (2026-08-12): this previously queried every table
    // completely unfiltered, aggregating subscriber counts and business
    // names across ALL businesses on the platform for any authenticated
    // caller. Fix scopes the owner's LandingPages first, then restricts
    // BOTH group-by queries to only those slugs -- filtering `pages`
    // alone would not have been sufficient, since webGroups/emailGroups
    // were still deriving `allSlugs` from every slug in the system.
    // BUGFIX (2026-08-12): this previously selected `name`, which does not
    // exist on LandingPage (only `businessName` does), throwing on every
    // call. The `.catch(() => [])` below silently turned that error into an
    // empty result, so this endpoint always returned `pages: []` for every
    // caller regardless of ownership. Removed here; the outer try/catch
    // (below) already returns a proper 500 for genuine failures, so a real
    // error is no longer indistinguishable from an authentic empty state.
    const pages = await prisma.landingPage.findMany({ where: { userId }, select: { slug: true, businessName: true } });
    const ownedSlugs = pages.map(function(p) { return p.slug; });

    const [webGroups, emailGroups] = await Promise.all([
      ownedSlugs.length
        ? prisma.webPushSubscription.groupBy({ by: ['slug'], where: { slug: { in: ownedSlugs } }, _count: { id: true } })
        : [],
      ownedSlugs.length
        ? prisma.subscriber.groupBy({ by: ['slug'], where: { slug: { in: ownedSlugs } }, _count: { id: true } })
        : []
    ]);

    const pageNameMap = {};
    pages.forEach(function(p) { pageNameMap[p.slug] = p.businessName || p.slug; });

    const webMap = {};
    webGroups.forEach(function(g) { webMap[g.slug] = g._count.id; });

    const emailMap = {};
    emailGroups.forEach(function(g) { emailMap[g.slug] = g._count.id; });

    const allSlugs = Array.from(new Set([
      ...Object.keys(webMap),
      ...Object.keys(emailMap),
      ...pages.map(function(p) { return p.slug; })
    ]));

    const rows = await Promise.all(allSlugs.map(async function(slug) {
      const passIds = await prisma.pass.findMany({
        where: { serialNumber: { startsWith: 'sqr-' + slug } },
        select: { id: true }
      });
      const walletCount = passIds.length > 0
        ? await prisma.passDevice.count({ where: { passId: { in: passIds.map(function(p) { return p.id; }) } } })
        : 0;

      const [lastWeb, lastEmail] = await Promise.all([
        prisma.webPushSubscription.findFirst({ where: { slug }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }).catch(() => null),
        prisma.subscriber.findFirst({ where: { slug }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }).catch(() => null)
      ]);
      const dates = [lastWeb && lastWeb.createdAt, lastEmail && lastEmail.createdAt].filter(Boolean);
      const lastSub = dates.length ? new Date(Math.max.apply(null, dates.map(function(d) { return new Date(d).getTime(); }))) : null;

      const emailCount = emailMap[slug] || 0;
      const webPushCount = webMap[slug] || 0;
      const total = emailCount + webPushCount + walletCount;

      return { slug, name: pageNameMap[slug] || slug, emailCount, webPushCount, walletCount, total, lastSub };
    }));

    const sorted = rows.filter(function(r) { return r.total > 0; }).sort(function(a, b) { return b.total - a.total; });

    const totals = sorted.reduce(function(acc, r) {
      return { email: acc.email + r.emailCount, webPush: acc.webPush + r.webPushCount, wallet: acc.wallet + r.walletCount, total: acc.total + r.total };
    }, { email: 0, webPush: 0, wallet: 0, total: 0 });

    return res.json({ ok: true, pages: sorted, totals });
  } catch(e) {
    console.error('[Subscribers] summary error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// GET /loyalty/subscribers/:slug/detail
async function getSubscriberDetail(req, res) {
  try {
    const { slug } = req.params;
    const userId = req.userId;

    // P0 SECURITY FIX (2026-08-12): ownership check. This endpoint was
    // authenticated and masked, but any logged-in user could view any
    // other business's masked subscriber activity by slug. Same
    // findUnique-then-compare convention used by every sibling handler in
    // this file (getProgram, createProgram, updateProgram, toggleStatus,
    // adminStamp, getStats, getCustomers).
    const lp = await prisma.landingPage.findUnique({ where: { slug } });
    if (!lp) return res.status(404).json({ error: 'Page not found' });
    if (lp.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const [webSubs, emailSubs, passIds] = await Promise.all([
      prisma.webPushSubscription.findMany({ where: { slug }, select: { endpoint: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.subscriber.findMany({ where: { slug, gdprConsent: true }, select: { email: true, createdAt: true }, orderBy: { createdAt: 'desc' } }).catch(() => []),
      prisma.pass.findMany({ where: { serialNumber: { startsWith: 'sqr-' + slug } }, select: { id: true } })
    ]);

    const walletDevices = passIds.length > 0
      ? await prisma.passDevice.findMany({ where: { passId: { in: passIds.map(function(p) { return p.id; }) } }, select: { deviceLibraryId: true, walletType: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
      : [];

    function maskEmail(email) {
      if (!email) return '—';
      var parts = email.split('@');
      return (parts[0] || '').slice(0, 2) + '***@' + (parts[1] || '');
    }
    function maskEndpoint(ep) {
      if (!ep) return '—';
      return '…' + ep.slice(-20);
    }

    var rows = [
      ...emailSubs.map(function(s) { return { type: 'email', masked: maskEmail(s.email), date: s.createdAt }; }),
      ...webSubs.map(function(s) { return { type: 'web_push', masked: maskEndpoint(s.endpoint), date: s.createdAt }; }),
      ...walletDevices.map(function(d) { return { type: 'wallet', masked: (d.deviceLibraryId || '').slice(0, 8) + '…', date: d.createdAt }; })
    ].sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    return res.json({ ok: true, slug, rows });
  } catch(e) {
    console.error('[Subscribers] detail error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

module.exports = {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  toggleStatus,
  adminStamp,
  getStats,
  getCustomers,
  generateCampaignMessage,
  getSubscriberSummary,
  getSubscriberDetail,
};
