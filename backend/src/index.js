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
const lpRoutes   = require('./routes/lpRoutes');
const tierRoutes = require('./routes/tierRoutes');
const loyaltyAdminRoutes = require('./routes/loyaltyAdminRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(cors());
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

app.use('/', lpRoutes);
app.use('/tier', tierRoutes);
app.use('/loyalty', loyaltyAdminRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Qraivy API v2 running on port ${PORT}`);
});
