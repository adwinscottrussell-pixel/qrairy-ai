const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

// ==========================
// GLOBAL ERROR LOGGING (VERY IMPORTANT)
// ==========================
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors());
app.use(express.json());

// ==========================
// HEALTH CHECK (CRITICAL FOR RAILWAY)
// ==========================
app.get('/', (req, res) => {
  res.send('API is working ✅');
});

// ==========================
// ROUTES
// ==========================
app.use('/api/qr', qrRoutes);

// ==========================
// START SERVER (RAILWAY FIX)
// ==========================
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});