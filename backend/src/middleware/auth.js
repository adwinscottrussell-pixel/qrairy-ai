// ─── Clerk JWT auth middleware ────────────────────────────────

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const token = authHeader.split(' ')[1];
    const base64Payload = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
    const userId = payload.sub;
    if (!userId) return res.status(401).json({ error: 'Invalid token.' });
    req.userId = userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

// Optional auth — sets userId if token present, continues either way
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const base64Payload = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
      req.userId = payload.sub || null;
    }
  } catch (_) {}
  next();
}

module.exports = { requireAuth, optionalAuth };
