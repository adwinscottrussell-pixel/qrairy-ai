const prisma = require('../utils/prismaClient');
const { PLANS, WALLET_CONFIG } = require('../config/constants');
const passService = require('../services/passService');
const storageService = require('../services/storageService');

// ─── POST /pass/create ────────────────────────────────────────
async function handleCreatePass(req, res) {
  try {
    const userId = req.userId;
    const plan = req.userPlan; // set by planGate middleware

    const {
      type = 'business_card',
      walletType = 'apple',
      templateId,
      name, company, title,
      website, phoneNumber, email, aiUrl,
      socialLinks, membershipId, customFields,
      biography, contactData, aiInstructions, dynamicLinks,
      qrDestination,
      backgroundColor = '#000000',
      foregroundColor = '#ffffff',
      labelColor = '#ffffff',
    } = req.body;

    // Check pass limit
    const passCount = await prisma.pass.count({
      where: { userId, deletedAt: null },
    });
    const limit = PLANS[plan].passLimit;
    if (limit !== Infinity && passCount >= limit) {
      return res.status(403).json({
        error: `You've reached your pass limit. Upgrade to create more.`,
        upgrade: true,
      });
    }

    const pass = await prisma.pass.create({
      data: {
        userId,
        templateId: templateId || null,
        type,
        walletType,
        name, company, title,
        website, phoneNumber, email, aiUrl,
        socialLinks: socialLinks || null,
        membershipId: membershipId || null,
        customFields: customFields || null,
        biography: biography || null,
        contactData: contactData || null,
        aiInstructions: aiInstructions || null,
        dynamicLinks: dynamicLinks || null,
        qrDestination: qrDestination || null,
        backgroundColor,
        foregroundColor,
        labelColor,
        passTypeId: WALLET_CONFIG.passTypeId,
        teamId: WALLET_CONFIG.teamId,
        webServiceUrl: WALLET_CONFIG.webServiceUrl,
      },
    });

    return res.status(201).json({
      success: true,
      pass: sanitizePass(pass),
    });
  } catch (err) {
    console.error('handleCreatePass error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── PUT /pass/:id ────────────────────────────────────────────
async function handleUpdatePass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const existing = await prisma.pass.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Pass not found.' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not your pass.' });

    const allowedFields = [
      'name', 'company', 'title', 'website', 'phoneNumber', 'email', 'aiUrl',
      'socialLinks', 'membershipId', 'customFields', 'biography', 'contactData',
      'aiInstructions', 'dynamicLinks', 'qrDestination',
      'backgroundColor', 'foregroundColor', 'labelColor',
      'logoUrl', 'thumbnailUrl', 'stripUrl', 'iconUrl', 'status',
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updated = await prisma.pass.update({
      where: { id },
      data: updates,
    });

    // Trigger push update to all registered devices
    passService.triggerPassUpdate(id).catch(err =>
      console.error('Background push update error:', err)
    );

    return res.status(200).json({
      success: true,
      pass: sanitizePass(updated),
    });
  } catch (err) {
    console.error('handleUpdatePass error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /pass/download/:id ───────────────────────────────────
async function handleDownloadPass(req, res) {
  try {
    const { id } = req.params;

    const pass = await prisma.pass.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!pass) return res.status(404).json({ error: 'Pass not found.' });
    if (pass.status === 'suspended') return res.status(403).json({ error: 'Pass is suspended.' });

    // Generate .pkpass file
    const pkpassBuffer = await passService.generatePkpass(pass);

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="qraivy-pass-${id}.pkpass"`,
      'Content-Length': pkpassBuffer.length,
    });

    return res.send(pkpassBuffer);
  } catch (err) {
    console.error('handleDownloadPass error:', err);
    return res.status(500).json({ error: 'Could not generate pass.' });
  }
}

// ─── GET /pass/list ───────────────────────────────────────────
async function handleListPasses(req, res) {
  try {
    const userId = req.userId;
    const passes = await prisma.pass.findMany({
      where: { userId, deletedAt: null },
      include: {
        _count: { select: { scanAnalytics: true, devices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      passes: passes.map(p => ({
        ...sanitizePass(p),
        totalScans: p._count.scanAnalytics,
        totalDevices: p._count.devices,
      })),
    });
  } catch (err) {
    console.error('handleListPasses error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── GET /pass/:id ────────────────────────────────────────────
async function handleGetPass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const pass = await prisma.pass.findUnique({
      where: { id },
      include: {
        _count: { select: { scanAnalytics: true, devices: true } },
      },
    });

    if (!pass || pass.deletedAt) return res.status(404).json({ error: 'Pass not found.' });
    if (pass.userId !== userId) return res.status(403).json({ error: 'Not your pass.' });

    return res.status(200).json({
      pass: {
        ...sanitizePass(pass),
        totalScans: pass._count.scanAnalytics,
        totalDevices: pass._count.devices,
      },
    });
  } catch (err) {
    console.error('handleGetPass error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── DELETE /pass/:id ─────────────────────────────────────────
async function handleDeletePass(req, res) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const pass = await prisma.pass.findUnique({ where: { id } });
    if (!pass) return res.status(404).json({ error: 'Pass not found.' });
    if (pass.userId !== userId) return res.status(403).json({ error: 'Not your pass.' });

    // Soft delete
    await prisma.pass.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('handleDeletePass error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── Upload logo/image ────────────────────────────────────────
async function handleUploadAsset(req, res) {
  try {
    const { id } = req.params;
    const { assetType } = req.body; // logo, thumbnail, strip, icon
    const userId = req.userId;

    const pass = await prisma.pass.findUnique({ where: { id } });
    if (!pass) return res.status(404).json({ error: 'Pass not found.' });
    if (pass.userId !== userId) return res.status(403).json({ error: 'Not your pass.' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const url = await storageService.uploadPassAsset(
      req.file.buffer,
      req.file.mimetype,
      `${userId}/${id}/${assetType}`
    );

    const fieldMap = {
      logo: 'logoUrl',
      thumbnail: 'thumbnailUrl',
      strip: 'stripUrl',
      icon: 'iconUrl',
    };

    const field = fieldMap[assetType];
    if (!field) return res.status(400).json({ error: 'Invalid asset type.' });

    await prisma.pass.update({ where: { id }, data: { [field]: url } });

    return res.status(200).json({ success: true, url });
  } catch (err) {
    console.error('handleUploadAsset error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── Helper ───────────────────────────────────────────────────
function sanitizePass(pass) {
  const { authToken, p12Data, ...safe } = pass;
  return safe;
}

module.exports = {
  handleCreatePass,
  handleUpdatePass,
  handleDownloadPass,
  handleListPasses,
  handleGetPass,
  handleDeletePass,
  handleUploadAsset,
};
