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
const managerRoutes   = require('./routes/managerRoutes');
const businessClaimRoutes = require('./routes/businessClaimRoutes');
const stadtpocketPublicRoutes = require('./routes/stadtpocketPublicRoutes');
const managerStadtpocketListingRoutes = require('./routes/managerStadtpocketListingRoutes');
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
app.use('/manager',  managerRoutes);
app.use('/businesses', businessClaimRoutes);
app.use('/public/stadtpocket', stadtpocketPublicRoutes);
app.use('/manager/stadtpocket', managerStadtpocketListingRoutes);
app.use('/ops',      opsRoutes);

app.use('/', lpRoutes);
app.use('/tier', tierRoutes);
app.use('/loyalty', loyaltyAdminRoutes);
app.use('/customers', customerRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Qraivy API v2 running on port ${PORT}`);
});
