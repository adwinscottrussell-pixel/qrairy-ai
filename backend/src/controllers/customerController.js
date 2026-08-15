// customerController.js — Canonical Customer Foundation, Phase 4.
//
// Thin HTTP layer only. All querying/aggregation/DTO-shaping lives in
// customerQueryService.js / customerDtoService.js — never duplicated here.
//
// Tenant scope: every handler reads req.userId (set by requireAuth from
// the verified Clerk JWT) and passes it as ownerUserId into the query
// service. No handler ever trusts a customer id, slug, or email supplied
// by the caller as proof of ownership.

const customerQueryService = require('../services/customerQueryService');

const ALLOWED_SEGMENTS = new Set(['email', 'push', 'wallet', 'loyalty', 'reward_ready', 'inactive']);
const ALLOWED_STATUSES = new Set(['active', 'merged', 'anonymized', 'deleted']);

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

async function getSummary(req, res) {
  try {
    const summary = await customerQueryService.getCustomerSummary({ ownerUserId: req.userId });
    return res.json(summary);
  } catch (e) {
    console.error('[CustomerAPI] summary error:', e.message);
    return res.status(500).json({ error: 'Failed to load customer summary' });
  }
}

async function listCustomers(req, res) {
  try {
    const { page, limit, search, segment, status } = req.query;

    if (segment && !ALLOWED_SEGMENTS.has(segment)) {
      return badRequest(res, 'Unsupported segment filter.');
    }
    if (status && !ALLOWED_STATUSES.has(status)) {
      return badRequest(res, 'Unsupported status filter.');
    }

    const result = await customerQueryService.listCustomers({
      ownerUserId: req.userId,
      page, limit, search, segment, status,
    });
    return res.json(result);
  } catch (e) {
    console.error('[CustomerAPI] list error:', e.message);
    return res.status(500).json({ error: 'Failed to load customers' });
  }
}

async function getCustomerDetail(req, res) {
  try {
    const detail = await customerQueryService.getCustomerDetail({ ownerUserId: req.userId, customerId: req.params.id });
    // Same 404 whether the id belongs to another tenant or does not exist
    // at all — never confirms existence of another tenant's Customer id.
    if (!detail) return res.status(404).json({ error: 'Customer not found' });
    return res.json(detail);
  } catch (e) {
    console.error('[CustomerAPI] detail error:', e.message);
    return res.status(500).json({ error: 'Failed to load customer' });
  }
}

async function getCustomerActivity(req, res) {
  try {
    const activity = await customerQueryService.getCustomerActivity({ ownerUserId: req.userId, customerId: req.params.id });
    if (!activity) return res.status(404).json({ error: 'Customer not found' });
    return res.json({ activity });
  } catch (e) {
    console.error('[CustomerAPI] activity error:', e.message);
    return res.status(500).json({ error: 'Failed to load customer activity' });
  }
}

module.exports = { getSummary, listCustomers, getCustomerDetail, getCustomerActivity };
