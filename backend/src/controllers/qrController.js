const { createQR, getQRById } = require('../services/qrService');
const { logScan } = require('../services/scanService');
const { decideRedirectUrl } = require('../agents/redirectAgent');
const prisma = require('../utils/prismaClient');
const Clerk = require('@clerk/backend');

const PLAN_LIMITS = { free: 2, starter: 10, pro: Infinity };

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const sdk = Clerk.createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const payload = await sdk.verifyToken(token);
    return payload.sub;
  } catch (err) {
    console.error('Token verification error:', err.message);
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

async function scrapeBusinessSite(url) {
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
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

async function handleCreateQR(req, res) {
  try {
    const { url, businessName } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'A valid URL is required.' });
    }

    const userId = await getUserFromToken(req.headers.authorization);
    if (userId) {
      const user = await upsertUser(userId);
      const limit = PLAN_LIMITS[user.plan] || 2;
      if (user.qrs.length >= limit) {
        return res.status(403).json({
          error: `You have reached your ${user.plan} plan limit of ${limit} QR codes. Please upgrade to create more.`,
          upgrade: true,
          plan: user.plan,
          limit,
        });
      }
    }

    const qr = await prisma.qR.create({
      data: {
        originalUrl: url,
        businessName: businessName || null,
        userId: userId || null,
      },
    });

    const redirectUrl = `https://api.qraivy.com/r/${qr.id}`;

    if (businessName) {
      scrapeBusinessSite(url).then(async (siteContent) => {
        if (siteContent) {
          await prisma.qR.update({
            where: { id: qr.id },
            data: { siteContent },
          });
          console.log(`Scraped site content for QR ${qr.id}`);
        }
      }).catch(err => console.error('Background scrape error:', err));
    }

    return res.status(201).json({ id: qr.id, redirectUrl });
  } catch (err) {
    console.error('handleCreateQR error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleGetUserPlan(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await upsertUser(userId);
    const limit = PLAN_LIMITS[user.plan] || 2;

    return res.status(200).json({
      plan: user.plan,
      qrCount: user.qrs.length,
      limit,
      canCreate: user.qrs.length < limit,
    });
  } catch (err) {
    console.error('handleGetUserPlan error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleRedirect(req, res) {
  try {
    const { id } = req.params;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const qr = await getQRById(id);
    if (!qr) {
      return res.status(404).json({ error: 'QR not found.' });
    }
    await logScan(qr.id, userAgent);
    if (qr.businessName) {
      return res.redirect(302, `https://www.qraivy.com/visit.html?id=${qr.id}`);
    }
    const context = { userAgent };
    const targetUrl = decideRedirectUrl(qr, context);
    return res.redirect(302, targetUrl);
  } catch (err) {
    console.error('handleRedirect error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleVisit(req, res) {
  try {
    const { id } = req.params;
    const qr = await prisma.qR.findUnique({ where: { id } });
    if (!qr) {
      return res.status(404).json({ error: 'QR not found.' });
    }
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

async function handleChat(req, res) {
  try {
    const { qrId, message, history } = req.body;
    if (!qrId || !message) {
      return res.status(400).json({ error: 'qrId and message are required.' });
    }
    const qr = await prisma.qR.findUnique({ where: { id: qrId } });
    if (!qr) {
      return res.status(404).json({ error: 'QR not found.' });
    }

    const messages = [
      ...(history || []),
      { role: 'user', content: message },
    ];

    let systemPrompt;
    if (qr.siteContent) {
      systemPrompt = `You are a friendly helpful assistant for ${qr.businessName}.
Here is the actual content from their website:

${qr.siteContent}

Use this real information to answer customer questions accurately and specifically.
Keep responses under 3 sentences. Be friendly and helpful.
Always encourage the customer to subscribe for special offers at the end.`;
    } else {
      systemPrompt = `You are a friendly helpful assistant for ${qr.businessName}.
The business website is ${qr.originalUrl}.
Answer questions about this business in a friendly, concise way.
Keep responses under 3 sentences.
If you don't know something specific, be honest but stay helpful.
Always encourage the customer to subscribe for special offers.`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await response.json();
    const reply = data.content[0].text.trim();
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('handleChat error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleAnalytics(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    const where = userId ? { userId } : {};
    const data = await prisma.qR.findMany({
      where,
      include: { scans: true },
      orderBy: { createdAt: 'desc' },
    });
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

async function handleDashboard(req, res) {
  try {
    const userId = await getUserFromToken(req.headers.authorization);
    const where = userId ? { userId } : {};
    const data = await prisma.qR.findMany({
      where,
      include: { scans: true, subscribers: true },
      orderBy: { createdAt: 'desc' },
    });
    const dashboard = data.map(qr => ({
      id: qr.id,
      originalUrl: qr.originalUrl,
      businessName: qr.businessName || 'Unnamed Business',
      redirectUrl: `https://api.qraivy.com/r/${qr.id}`,
      totalScans: qr.scans.length,
      totalSubscribers: qr.subscribers.length,
      hasSiteContent: !!qr.siteContent,
      createdAt: qr.createdAt,
    }));

    let planInfo = null;
    if (userId) {
      const user = await upsertUser(userId);
      const limit = PLAN_LIMITS[user.plan] === Infinity ? null : PLAN_LIMITS[user.plan];
      planInfo = {
        plan: user.plan,
        qrCount: user.qrs.length,
        limit,
        canCreate: limit === null || user.qrs.length < limit,
      };
    }

    return res.status(200).json({ dashboard, planInfo });
  } catch (err) {
    console.error('handleDashboard error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleSubscribe(req, res) {
  try {
    const { qrId, oneSignalId } = req.body;
    if (!qrId || !oneSignalId) {
      return res.status(400).json({ error: 'qrId and oneSignalId are required.' });
    }
    const existing = await prisma.subscriber.findFirst({
      where: { qrId, oneSignalId },
    });
    if (existing) {
      return res.status(200).json({ message: 'Already subscribed.' });
    }
    await prisma.subscriber.create({
      data: { qrId, oneSignalId },
    });
    return res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (err) {
    console.error('handleSubscribe error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleSendSpecial(req, res) {
  try {
    const { qrId, message, title } = req.body;
    if (!qrId || !message || !title) {
      return res.status(400).json({ error: 'qrId, title and message are required.' });
    }
    const subscribers = await prisma.subscriber.findMany({ where: { qrId } });
    if (subscribers.length === 0) {
      return res.status(400).json({ error: 'No subscribers for this QR code.' });
    }
    const playerIds = subscribers.map(s => s.oneSignalId);
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ztq2jat32ejr5tqnuyksl5oz4`,
      },
      body: JSON.stringify({
        app_id: 'afd98e11-f616-40fe-a1c6-251f15861b54',
        include_player_ids: playerIds,
        headings: { en: title },
        contents: { en: message },
      }),
    });
    const result = await response.json();
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('handleSendSpecial error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleGenerateSpecial(req, res) {
  try {
    const { businessName, originalUrl } = req.body;
    if (!businessName || !originalUrl) {
      return res.status(400).json({ error: 'businessName and originalUrl are required.' });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are a marketing expert. Write a short punchy push notification special offer for a business.
Business URL: ${originalUrl}
Business Name: ${businessName}

Write ONLY the notification message (max 100 characters). Make it exciting with an emoji. No quotes, no explanation.`
        }]
      })
    });
    const data = await response.json();
    const message = data.content[0].text.trim();
    return res.status(200).json({ message });
  } catch (err) {
    console.error('handleGenerateSpecial error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = {
  handleCreateQR,
  handleGetUserPlan,
  handleRedirect,
  handleVisit,
  handleChat,
  handleAnalytics,
  handleDashboard,
  handleSubscribe,
  handleSendSpecial,
  handleGenerateSpecial,
};