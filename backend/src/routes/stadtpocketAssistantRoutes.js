// ============================================================
// stadtpocketAssistantRoutes.js — StadtPocket City Assistant, Phase
// 2B.1a. Public, unauthenticated -- same "no requireAuth/requireAdmin/
// requireManagerScope" convention as stadtpocketPublicRoutes.js -- but
// mounted as its own route file (not added to that one) because this
// route, unlike every existing /public/stadtpocket/* route, triggers a
// real paid provider call (Anthropic) per request and therefore needs
// its own dedicated rate limiter on top of the app-wide one -- exactly
// the same reason managerStadtpocketResearchRoutes.js is its own file
// separate from the other /manager/stadtpocket/* route files. Mounted
// at the same /public/stadtpocket prefix as stadtpocketPublicRoutes.js
// in index.js (Express already mounts several route files at the same
// prefix, e.g. every /manager/stadtpocket/* file) -- so the full path
// is POST /public/stadtpocket/cities/:citySlug/assistant, a direct
// sibling of the existing businesses/events routes.
// ============================================================

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { answerAssistantQuestion, AssistantError } = require('../services/stadtpocketAssistantService');

// Keyed purely by IP -- unlike researchRateLimiter's userId-preferring
// key (a City Manager's own resolved scope), this route has no
// authenticated identity at all, so IP is the only signal available.
// ipKeyGenerator normalizes IPv6 the same safe way the library's own
// default keyGenerator does, matching every other rate limiter in this
// codebase that keys on req.ip.
//
// 20 requests / 15 minutes / IP: this endpoint costs a real Anthropic
// call on every request even with zero tools (Phase 2B.1a). Roughly
// one question every ~45 seconds sustained is comfortable for one
// genuinely exploratory visitor, while bounding the worst case a single
// IP can cost. Deliberately double researchRateLimiter's own 10/15min
// ceiling: that route pays for Firecrawl + an 8000-token Sonnet
// extraction per call (a heavier, City-Manager-only operation), this
// one pays for a single short (600-token) conversational reply with no
// tool calls yet -- a materially cheaper per-request cost justifies a
// higher ceiling, not the same one. Still one order of magnitude below
// the app-wide 200/15min/IP limiter, so it is always the binding
// constraint for this route specifically, never overridden by it.
const assistantRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

async function handleAssistant(req, res) {
  try {
    const result = await answerAssistantQuestion(req.params.citySlug, req.body);
    return res.json(result);
  } catch (err) {
    if (err instanceof AssistantError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Never leaks a stack trace, an API key, or any provider-internal
    // detail to the caller -- same convention as every other
    // StadtPocket route's catch block (see stadtpocketPublicRoutes.js's
    // own handleListCityEvents, managerStadtpocketResearchRoutes.js's
    // handleServiceError).
    console.error('[public/stadtpocket/cities/:citySlug/assistant POST]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

router.post('/cities/:citySlug/assistant', assistantRateLimiter, handleAssistant);

module.exports = router;
module.exports.handleAssistant = handleAssistant; // exported for direct unit testing only
module.exports.assistantRateLimiter = assistantRateLimiter; // exported for direct unit testing only
