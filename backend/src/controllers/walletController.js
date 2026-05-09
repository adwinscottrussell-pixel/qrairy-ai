const prisma = require('../utils/prismaClient');
const passService = require('../services/passService');
const apnsService = require('../services/apnsService');
const analyticsService = require('../services/analyticsService');

// ============================================================
// APPLE WALLET WEB SERVICE ENDPOINTS
// These are called by Apple directly — not by your frontend
// Apple docs: https://developer.apple.com/documentation/walletpasses
// ============================================================

// ─── GET /wallet/v1/devices/:deviceId/registrations/:passTypeId
// Apple asks: what passes does this device have?
async function handleGetPasses(req, res) {
  try {
    const { deviceLibraryIdentifier, passTypeIdentifier } = req.params;
    const { passesUpdatedSince } = req.query;

    const where = {
      deviceLibraryId: deviceLibraryIdentifier,
      pass: { passTypeId: passTypeIdentifier, deletedAt: null },
    };

    if (passesUpdatedSince) {
      where.pass = {
        ...where.pass,
        updatedAt: { gt: new Date(parseInt(passesUpdatedSince) * 1000) },
      };
    }

    const registrations = await prisma.passRegistration.findMany({
      where,
      include: { pass: true },
    });

    if (registrations.length === 0) return res.status(204).send();

    const serialNumbers = registrations.map(r => r.serialNumber);
    const lastUpdated = Math.max(
      ...registrations.map(r => Math.floor(new Date(r.pass.updatedAt).getTime() / 1000))
    );

    return res.status(200).json({ serialNumbers, lastUpdated: String(lastUpdated) });
  } catch (err) {
    console.error('handleGetPasses error:', err);
    return res.status(500).send();
  }
}

// ─── POST /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
// Apple registers a device for push updates
async function handleRegisterDevice(req, res) {
  try {
    const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = req.params;
    const { pushToken } = req.body;
    const authToken = req.headers.authorization?.replace('ApplePass ', '');

    if (!pushToken) return res.status(400).send();

    // Verify auth token matches pass
    const pass = await prisma.pass.findFirst({
      where: { serialNumber, passTypeId: passTypeIdentifier, authToken },
    });

    if (!pass) return res.status(401).send();

    // Check if already registered
    const existing = await prisma.passDevice.findUnique({
      where: { passId_deviceLibraryId: { passId: pass.id, deviceLibraryId: deviceLibraryIdentifier } },
    });

    if (existing) {
      // Update push token if changed
      await prisma.passDevice.update({
        where: { id: existing.id },
        data: { pushToken },
      });
      return res.status(200).send();
    }

    // Register new device
    await prisma.passDevice.create({
      data: {
        passId: pass.id,
        deviceLibraryId: deviceLibraryIdentifier,
        pushToken,
        walletType: 'apple',
      },
    });

    await prisma.passRegistration.create({
      data: {
        passId: pass.id,
        deviceLibraryId: deviceLibraryIdentifier,
        serialNumber,
      },
    });

    return res.status(201).send();
  } catch (err) {
    console.error('handleRegisterDevice error:', err);
    return res.status(500).send();
  }
}

// ─── DELETE /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
// Apple unregisters a device (user removed pass from Wallet)
async function handleUnregisterDevice(req, res) {
  try {
    const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = req.params;
    const authToken = req.headers.authorization?.replace('ApplePass ', '');

    const pass = await prisma.pass.findFirst({
      where: { serialNumber, passTypeId: passTypeIdentifier, authToken },
    });

    if (!pass) return res.status(401).send();

    await prisma.passDevice.deleteMany({
      where: { passId: pass.id, deviceLibraryId: deviceLibraryIdentifier },
    });

    await prisma.passRegistration.deleteMany({
      where: { passId: pass.id, deviceLibraryId: deviceLibraryIdentifier },
    });

    return res.status(200).send();
  } catch (err) {
    console.error('handleUnregisterDevice error:', err);
    return res.status(500).send();
  }
}

// ─── GET /wallet/v1/passes/:passTypeId/:serialNumber
// Apple fetches the latest .pkpass when update is triggered
async function handleGetLatestPass(req, res) {
  try {
    const { passTypeIdentifier, serialNumber } = req.params;
    const authToken = req.headers.authorization?.replace('ApplePass ', '');
    const modifiedSince = req.headers['if-modified-since'];

    const pass = await prisma.pass.findFirst({
      where: { serialNumber, passTypeId: passTypeIdentifier, authToken },
      include: { user: true },
    });

    if (!pass) return res.status(401).send();

    // Check if modified since last fetch
    if (modifiedSince) {
      const modifiedSinceDate = new Date(modifiedSince);
      if (pass.updatedAt <= modifiedSinceDate) {
        return res.status(304).send();
      }
    }

    const pkpassBuffer = await passService.generatePkpass(pass);

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': pass.updatedAt.toUTCString(),
      'Content-Length': pkpassBuffer.length,
    });

    return res.send(pkpassBuffer);
  } catch (err) {
    console.error('handleGetLatestPass error:', err);
    return res.status(500).send();
  }
}

// ─── POST /wallet/v1/log
// Apple sends error logs — capture them
async function handleLog(req, res) {
  try {
    const { logs } = req.body;
    if (logs) {
      logs.forEach(log => console.warn('[Apple Wallet Log]', log));
    }
    return res.status(200).send();
  } catch (err) {
    return res.status(200).send(); // Always return 200 to Apple
  }
}

// ─── POST /wallet/push/:passId  (internal — triggered by your dashboard)
// Manually trigger a push update to all devices with this pass
async function handleManualPush(req, res) {
  try {
    const { passId } = req.params;
    const userId = req.userId;

    const pass = await prisma.pass.findUnique({
      where: { id: passId },
      include: { devices: true },
    });

    if (!pass) return res.status(404).json({ error: 'Pass not found.' });
    if (pass.userId !== userId) return res.status(403).json({ error: 'Not your pass.' });

    const results = await apnsService.pushUpdateToDevices(pass.devices);

    return res.status(200).json({
      success: true,
      pushed: results.success,
      failed: results.failed,
    });
  } catch (err) {
    console.error('handleManualPush error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// ─── QR scan tracking for passes ─────────────────────────────
async function handlePassScan(req, res) {
  try {
    const { passId } = req.params;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    await analyticsService.logPassScan({ passId, userAgent, ip });

    const pass = await prisma.pass.findUnique({ where: { id: passId } });
    if (!pass) return res.status(404).json({ error: 'Pass not found.' });

    // Redirect to destination
    const destination = pass.qrDestination || pass.website || `https://qraivy.com`;
    return res.redirect(302, destination);
  } catch (err) {
    console.error('handlePassScan error:', err);
    return res.status(500).send();
  }
}

module.exports = {
  handleGetPasses,
  handleRegisterDevice,
  handleUnregisterDevice,
  handleGetLatestPass,
  handleLog,
  handleManualPush,
  handlePassScan,
};
