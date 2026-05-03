const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/', qrRoutes);

// Health check (optional but useful)
app.get('/', (req, res) => {
  res.send('QR API is running');
});

// 🔥 CRITICAL: Railway dynamic port
const PORT = process.env.PORT || 3000;

// 🔥 MUST bind to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});