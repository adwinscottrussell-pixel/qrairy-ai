const express = require('express');

const app = express();

// 🔥 ONLY THIS ROUTE
app.get('/', (req, res) => {
  console.log('ROOT HIT');
  res.send('OK');
});

// 🚨 CRITICAL: DO NOT CHANGE THIS
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});