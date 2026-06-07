// loyaltyAdminController.js
// Owner-scoped admin endpoints for loyalty programs.
// A "loyalty program" = LandingPage (owns userId + slug) + StampSettings (the config).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Get the current valid stamp token for a slug, creating one if needed.
async function getOrCreateStampToken(slug) {
  const now = new Date();
  const existing = await prisma.stampToken.findFirst({
    where: { slug, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' }
  });
  if (existing) return existing.token;
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
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
    stampUrl,
    nfcUrl: stampUrl,
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
    const { slug, goal, rewardName, enabled } = req.body || {};
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
        enabled: enabled !== false
      },
      update: {
        ...(typeof goal === 'number' && { goal }),
        ...(typeof rewardName === 'string' && { rewardName }),
        ...(typeof enabled === 'boolean' && { enabled })
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

module.exports = {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  toggleStatus,
  adminStamp,
  getStats
};
