const express = require('express');
const cors = require('cors');
const qrRoutes = require('./routes/qrRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/', qrRoutes);

app.listen(PORT, () => {
  console.log(`QR SaaS backend running on http://localhost:${PORT}`);
});
