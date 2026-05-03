const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

// 🔥 GLOBAL ERROR LOGGING
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

// middleware
app.use(cors());
app.use(express.json());

// 🔥 SAFE ROOT ROUTE
app.get('/', (req, res) => {
  try {
    res.send('API is working ✅');
  } catch (err) {
    console.error('Root route error:', err);
    res.status(500).send('Root error');
  }
});

// routes
app.use('/api/qr', qrRoutes);

// 🔥 EXPRESS ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// start server
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});