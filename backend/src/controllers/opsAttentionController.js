// ============================================================
// opsAttentionController.js — GET /ops/attention
// Mission Control MC-1: Founder Attention + Executive Brief.
// Read-only. No persisted lifecycle state, no correlation engine —
// see attentionService.js and the founder-approved MC-1 plan.
// ============================================================
const { getAttentionSnapshot } = require('../services/attentionService');

async function handleGetAttention(req, res) {
  try {
    const { findings, executiveBrief } = await getAttentionSnapshot();
    return res.json({ executiveBrief, findings });
  } catch (err) {
    console.error('[ops/attention]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { handleGetAttention };
