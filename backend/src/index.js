const express = require('express');
const cors = require('cors');
const qrRoutes = require('./routes/qrRoutes');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use('/', qrRoutes);

app.listen(PORT, () => {
  console.log(`QR SaaS backend running on http://localhost:${PORT}`);
});
