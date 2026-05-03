// /src/controllers/qrController.js

const prisma = require('../prismaClient');

// 🔥 YOUR DOMAIN
const BASE_URL = 'https://api.qraivy.com';

// ==========================
// CREATE QR
// ==========================
exports.createQR = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const qr = await prisma.qR.create({
      data: {
        originalUrl: url,
      },
    });

    const redirectUrl = `${BASE_URL}/r/${qr.id}`;

    return res.status(200).json({ redirectUrl });

  } catch (error) {
    console.error('Create QR Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================
// HANDLE REDIRECT
// ==========================
exports.handleRedirect = async (req, res) => {
  try {
    const { id } = req.params;

    const qr = await prisma.qR.findUnique({
      where: { id },
    });

    if (!qr) {
      return res.status(404).send('QR not found');
    }

    await prisma.scan.create({
      data: {
        qrId: id,
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    });

    return res.redirect(qr.originalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);
    return res.status(500).send('Internal server error');
  }
};