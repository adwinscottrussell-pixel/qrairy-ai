const { createQR, getQRById } = require('../services/qrService');
const { logScan } = require('../services/scanService');
const { decideRedirectUrl } = require('../agents/redirectAgent');

async function handleCreateQR(req, res) {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'A valid URL is required.' });
    }

    const qr = await createQR(url);
    const redirectUrl = `http://localhost:3000/r/${qr.id}`;

    return res.status(201).json({
      id: qr.id,
      redirectUrl,
    });
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

module.exports = { handleCreateQR, handleRedirect };
