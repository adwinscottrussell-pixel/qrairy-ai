const { createQR, getQRById } = require('../services/qrService');
const { logScan } = require('../services/scanService');
const { decideRedirectUrl } = require('../agents/redirectAgent');
const prisma = require('../utils/prismaClient');

async function handleCreateQR(req, res) {
  try {
    const { url, businessName } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'A valid URL is required.' });
    }
    const qr = await prisma.qR.create({
      data: { originalUrl: url, businessName: businessName || null },
    });
    const redirectUrl = `https://api.qraivy.com/r/${qr.id}`;
    return res.status(201).json({ id: qr.id, redirectUrl });
  } catch (err) {
    console.error('handleCreateQR error:', err);
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
    const context = { userAgent };
    const targetUrl = decideRedirectUrl(qr, context);
    return res.redirect(302, targetUrl);
  } catch (err) {
    console.error('handleRedirect error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

async function handleAnalytics(req, res) {
  try {
    const data = await prisma.qR.findMany({
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
    const data = await prisma.qR.findMany({
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
      createdAt: qr.createdAt,
    }));
    return res.status(200).json({ dashboard });
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
    const subscribers = await prisma.subscriber.findMany({
      where: { qrId },
    });
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

module.exports = { handleCreateQR, handleRedirect, handleAnalytics, handleDashboard, handleSubscribe, handleSendSpecial, handleGenerateSpecial };