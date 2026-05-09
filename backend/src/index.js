const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const qrRoutes       = require('./routes/qrRoutes');
const passRoutes     = require('./routes/passRoutes');
const walletRoutes   = require('./routes/walletRoutes');
const analyticsRoutes= require('./routes/analyticsRoutes');
const aiRoutes       = require('./routes/aiRoutes');
const userRoutes     = require('./routes/userRoutes');
const apiKeyRoutes   = require('./routes/apiKeyRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Health ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// ─── Routes ───────────────────────────────────────────────────
app.use('/',         qrRoutes);       // QR codes (existing)
app.use('/pass',     passRoutes);     // Wallet pass CRUD
app.use('/wallet',   walletRoutes);   // Apple/Google Wallet endpoints
app.use('/analytics',analyticsRoutes);// Analytics
app.use('/ai',       aiRoutes);       // AI chat + specials
app.use('/user',     userRoutes);     // User profile + plan
app.use('/api',      apiKeyRoutes);   // GHL API key management

// ─── Error handler ────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Qraivy API v2 running on port ${PORT}`);
});
