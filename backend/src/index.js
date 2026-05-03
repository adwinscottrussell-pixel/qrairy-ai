const express = require('express');
const cors = require('cors');

const qrRoutes = require('./routes/qrRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/', qrRoutes);

// 🔥 CRITICAL FIX
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});