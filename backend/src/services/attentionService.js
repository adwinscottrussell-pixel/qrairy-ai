// ============================================================
// attentionService.js — Shared health/attention source of truth
// for GET /admin/health and GET /ops/attention.
//
// Mission Control MC-1 (Executive Brief + Founder Attention +
// Platform Health). This is the ONLY place platform health is
// checked — both routes call into this module rather than
// duplicating the checks, so they can never silently disagree.
//
// MC-1 scope only, per the founder-approved implementation plan:
//   - read-only, no persisted lifecycle state
//   - no correlation/grouping engine (a single check source has
//     nothing to correlate against yet)
// ============================================================
const prisma = require('../utils/prismaClient');

// Preserves the exact response shape and behavior of the original
// inline `/admin/health` handler — extraction only, no behavior change.
async function getHealthChecks() {
  try {
    await prisma.user.count();
    return {
      api: true,
      db: true,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      clerk: !!process.env.CLERK_SECRET_KEY,
      frontend: true,
    };
  } catch (err) {
    return {
      api: true, db: false, anthropic: false,
      stripe: false, clerk: false, frontend: true,
    };
  }
}

// Reachability checks vs configuration-presence checks are different
// claims — kept distinct, same distinction the existing Platform
// Status rendering already makes (Operational vs Configured).
const SUBSYSTEMS = [
  { key: 'api', label: 'QRAIVY API', kind: 'reachability', severity: 'critical', explanation: 'The core API is unreachable.' },
  { key: 'db', label: 'Database (PostgreSQL)', kind: 'reachability', severity: 'critical', explanation: 'The database could not be reached.' },
  { key: 'frontend', label: 'Frontend (Vercel)', kind: 'reachability', severity: 'critical', explanation: 'The frontend service is unreachable.' },
  { key: 'anthropic', label: 'Anthropic AI', kind: 'configuration', severity: 'warning', explanation: 'The Anthropic API key is not configured.' },
  { key: 'stripe', label: 'Stripe', kind: 'configuration', severity: 'warning', explanation: 'The Stripe API key is not configured.' },
  { key: 'clerk', label: 'Clerk', kind: 'configuration', severity: 'warning', explanation: 'The Clerk secret key is not configured.' },
];

// Derives read-only Founder Attention findings from deterministic
// health evidence. No persisted state, no correlation — MC-1 scope.
// A missing or non-boolean check result is itself a finding: an
// unverifiable check must never be silently treated as healthy.
function deriveFindings(checks) {
  const findings = [];
  for (const subsystem of SUBSYSTEMS) {
    const value = checks ? checks[subsystem.key] : undefined;
    if (value === true) continue;

    if (value === false) {
      findings.push({
        subsystem: subsystem.label,
        severity: subsystem.severity,
        explanation: subsystem.explanation,
        evidence: subsystem.kind === 'reachability'
          ? `Health check "${subsystem.key}" reported unreachable.`
          : `Health check "${subsystem.key}" reported not configured.`,
        scope: 'platform',
      });
      continue;
    }

    findings.push({
      subsystem: subsystem.label,
      severity: 'warning',
      explanation: `Result for "${subsystem.key}" could not be verified.`,
      evidence: `Health check "${subsystem.key}" did not return a valid result.`,
      scope: 'platform',
    });
  }
  return findings;
}

// One evidence-derived verdict sentence. No vanity metrics, no
// speculative interpretation, and no implementation detail (e.g. the
// exact number of checks performed) — outcome-focused, founder-facing
// copy only. Every word still traces to `checks` or `findings`.
function buildExecutiveBrief(checks, findings) {
  if (!checks) {
    return {
      verdict: 'unavailable',
      message: 'Platform status could not be fully verified right now.',
    };
  }

  if (findings.length === 0) {
    return {
      verdict: 'healthy',
      message: 'Platform operating normally. No founder attention required.',
    };
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;

  if (criticalCount > 0) {
    const noun = criticalCount === 1 ? 'finding' : 'findings';
    const verb = criticalCount === 1 ? 'requires' : 'require';
    return {
      verdict: 'critical',
      message: `Platform critical. ${criticalCount} critical ${noun} ${verb} immediate attention.`,
    };
  }

  const noun = findings.length === 1 ? 'finding' : 'findings';
  const verb = findings.length === 1 ? 'requires' : 'require';
  return {
    verdict: 'degraded',
    message: `Platform degraded. ${findings.length} ${noun} ${verb} your attention.`,
  };
}

// Single entry point for GET /ops/attention.
async function getAttentionSnapshot() {
  let checks = null;
  try {
    checks = await getHealthChecks();
  } catch (err) {
    checks = null;
  }
  const findings = checks ? deriveFindings(checks) : [];
  const executiveBrief = buildExecutiveBrief(checks, findings);
  return { checks, findings, executiveBrief };
}

module.exports = {
  getHealthChecks,
  deriveFindings,
  buildExecutiveBrief,
  getAttentionSnapshot,
};
