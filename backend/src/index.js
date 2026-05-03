const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 IMPORTANT: test route
app.get('/', (req, res) => {
  res.send('API is working ✅');
});

app.use('/api/qr', qrRoutes);

// 🔥 CRITICAL FIX
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});