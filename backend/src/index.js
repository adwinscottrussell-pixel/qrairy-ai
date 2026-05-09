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
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

app.use('/',         qrRoutes);
app.use('/pass',     passRoutes);
app.use('/wallet',   walletRoutes);
app.use('/analytics',analyticsRoutes);
app.use('/ai',       aiRoutes);
app.use('/user',     userRoutes);
app.use('/api',      apiKeyRoutes);
app.use('/stripe',   stripeRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Qraivy API v2 running on port ${PORT}`);
});