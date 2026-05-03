const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// 🔥 VERY IMPORTANT HEALTH ROUTE
app.get('/', (req, res) => {
  console.log('✅ Root route hit');
  res.status(200).send('API is working 🚀');
});

// routes
app.use('/api/qr', qrRoutes);

// 🔥 ERROR HANDLER (YOU DIDN'T HAVE THIS)
app.use((err, req, res, next) => {
  console.error('🔥 ERROR:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});