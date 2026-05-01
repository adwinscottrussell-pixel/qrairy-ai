const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

// 🔥 YOUR CLEAN DOMAIN
const BASE_URL = 'https://api.qraivy.com';

// CREATE QR
exports.createQR = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Generate unique ID
    const id = uuidv4();

    // Save to database
    await prisma.qR.create({
      data: {
        id,
        url,
      },
    });

    // Build redirect URL
    const redirectUrl = `${BASE_URL}/r/${id}`;

    return res.status(200).json({ redirectUrl });

  } catch (error) {
    console.error('Create QR Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// HANDLE REDIRECT
exports.handleRedirect = async (req, res) => {
  try {
    const { id } = req.params;

    const qr = await prisma.qR.findUnique({
      where: { id },
    });

    if (!qr) {
      return res.status(404).send('QR not found');
    }

    // Optional: log scan (future feature)
    // await prisma.scan.create({ data: { qrId: id } });

    return res.redirect(qr.url);

  } catch (error) {
    console.error('Redirect Error:', error);
    return res.status(500).send('Internal server error');
  }
};