const express = require('express');
const cors = require('cors');

const qrRoutes        = require('./routes/qrRoutes');
const passRoutes      = require('./routes/passRoutes');
const walletRoutes    = require('./routes/walletRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes        = require('./routes/aiRoutes');
const userRoutes      = require('./routes/userRoutes');
const apiKeyRoutes    = require('./routes/apiKeyRoutes');
const stripeRoutes    = require('./routes/stripeRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const opsRoutes       = require('./routes/opsRoutes');
const lpRoutes   = require('./routes/lpRoutes');
const tierRoutes = require('./routes/tierRoutes');
const loyaltyAdminRoutes = require('./routes/loyaltyAdminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/stripe/webhook', express.raw({ type: 'application/json' }));

// CORS is transport-origin permission only — it decides whose responses a
// browser is allowed to read, never who is authenticated. Every admin route
// still requires a valid Clerk token + publicMetadata.role === 'admin' via
// requireAdmin regardless of origin (see middleware/adminMiddleware.js).
// Matching logic lives in utils/corsOriginPolicy.js so it can be unit-tested
// without booting the full app.
const { isAllowedOrigin } = require('./utils/corsOriginPolicy');
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// TEMP — read-only Pass-row inspector for diagnosing the wallet/stamp sync
// bug. Gated on a query secret, not on any session, since this is purely
// for live debugging. Remove once the bug is confirmed fixed.
app.get('/debug/pass/:serialNumber', async (req, res) => {
  if (req.query.key !== (process.env.DEBUG_KEY || 'qraivy-temp-debug-2026')) return res.status(403).send();
  try {
    const prisma = require('./utils/prismaClient');
    const pass = await prisma.pass.findUnique({ where: { serialNumber: req.params.serialNumber } });
    if (!pass) return res.status(404).json({ error: 'not found' });
    const devices = await prisma.passDevice.findMany({ where: { passId: pass.id } });
    const settings = pass.slug ? await prisma.stampSettings.findUnique({ where: { slug: pass.slug } }) : null;
    res.json({
      serialNumber: pass.serialNumber,
      slug: pass.slug,
      stampCount: pass.stampCount,
      stampGoal: settings ? settings.goal : null,
      rewardReady: pass.rewardReady,
      lastStampAt: pass.lastStampAt,
      updatedAt: pass.updatedAt,
      createdAt: pass.createdAt,
      deviceCount: devices.length,
      devices: devices.map(d => ({ deviceLibraryId: d.deviceLibraryId, walletType: d.walletType, createdAt: d.createdAt })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TEMP — list recent Pass rows for a slug, newest first. Same purpose/gate
// as /debug/pass above — avoids needing the exact serialNumber.
app.get('/debug/passes-for/:slug', async (req, res) => {
  if (req.query.key !== (process.env.DEBUG_KEY || 'qraivy-temp-debug-2026')) return res.status(403).send();
  try {
    const prisma = require('./utils/prismaClient');
    const passes = await prisma.pass.findMany({
      where: { slug: req.params.slug },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    const results = await Promise.all(passes.map(async p => {
      const devices = await prisma.passDevice.findMany({ where: { passId: p.id } });
      return {
        serialNumber: p.serialNumber,
        stampCount: p.stampCount,
        rewardReady: p.rewardReady,
        lastStampAt: p.lastStampAt,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        deviceCount: devices.length,
      };
    }));
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/sw.js', (req, res) => { res.setHeader('Content-Type','application/javascript'); res.setHeader('Service-Worker-Allowed','/'); res.sendFile(require('path').join(__dirname,'../public/sw.js')); });

app.use('/',         qrRoutes);
app.use('/pass',     passRoutes);
app.use('/wallet',   walletRoutes);
app.use('/analytics',analyticsRoutes);
app.use('/ai',       aiRoutes);
app.use('/user',     userRoutes);
app.use('/api',      apiKeyRoutes);
app.use('/stripe',   stripeRoutes);
app.use('/admin',    adminRoutes);
app.use('/ops',      opsRoutes);

app.use('/', lpRoutes);
app.use('/tier', tierRoutes);
app.use('/loyalty', loyaltyAdminRoutes);
app.use('/customers', customerRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Qraivy API v2 running on port ${PORT}`);
});
