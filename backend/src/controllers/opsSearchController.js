// ============================================================
// opsSearchController.js — GET /ops/search
// Per docs/architecture/QRAIVY_UNIVERSAL_OPERATIONS_SEARCH_v1.md §5/§6
// ============================================================
const searchService = require('../services/searchService');

async function handleSearch(req, res) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required.' });
    }

    const result = await searchService.search(q, req.query.limit);
    return res.json(result);
  } catch (err) {
    console.error('[ops/search]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { handleSearch };
