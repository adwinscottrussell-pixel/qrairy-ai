const express = require('express');
const cors = require('cors');
const qrRoutes = require('./routes/qrRoutes');

const app = express();

// ✅ CRITICAL: use Railway's port
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ health check route (important for testing)
app.get('/', (req, res) => {
  res.send('QR SaaS backend is running');
});

// ✅ your routes
app.use('/', qrRoutes);

// ✅ CRITICAL: listen on 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});