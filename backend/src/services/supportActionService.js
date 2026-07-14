// ============================================================
// supportActionService.js — SupportAction audit log (SP3.1)
// Per docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md §11/§12
// ============================================================
const prisma = require('../utils/prismaClient');

const ALLOWED_ACTOR_TYPES = ['human', 'ai-suggested'];

const MAX_IDENTIFIER_LENGTH = 255;
// Generous for a support-action note (a few paragraphs plus structured
// fields), small enough to keep an append-only audit table lean and
// fast to query. Independent of the app-wide 10mb JSON body limit,
// which is sized for unrelated endpoints (AI generation, uploads).
const MAX_METADATA_BYTES = 10 * 1024;

// Exact key names (case-insensitive), not fragments — broad substrings
// like "card" or "payment" false-positive on legitimate fields
// (cardinality, discardReason, businessCardLabel, paymentDueDate).
// Includes __proto__/constructor/prototype: rejecting these outright
// is simpler and safer than trying to "safely allow" them, and means
// this code never needs to write an attacker-controlled key onto a
// plain object literal (the actual mechanism by which a prototype
// could be reassigned).
const PROHIBITED_KEYS = new Set([
  'password', 'accesstoken', 'refreshtoken', 'apikey', 'api_key',
  'authorization', 'bearer', 'cookie', 'sessionid', 'sessiontoken',
  'secret', 'clientsecret', 'cardnumber', 'cardno', 'cvv', 'cvc',
  '__proto__', 'constructor', 'prototype',
]);

function isProhibitedKey(key) {
  return PROHIBITED_KEYS.has(key.toLowerCase());
}

// Read-only recursive scan — never rebuilds or mutates the input, so
// there is no bracket-assignment step onto a plain object that could
// trigger the `__proto__` accessor. `ancestors` tracks the current
// path only (added on entry, removed on exit) so a value referenced
// twice in a non-cyclic DAG isn't mistaken for a real cycle.
function scanMetadata(value, ancestors) {
  if (value === null || value === undefined) return { ok: true };
  if (value instanceof Date) return { ok: true };

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return { ok: true };
  if (t !== 'object') {
    return { ok: false, reason: `Unsupported metadata value type: ${t}.` };
  }

  if (ancestors.has(value)) {
    return { ok: false, reason: 'metadata must not contain circular references.' };
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = scanMetadata(item, ancestors);
        if (!result.ok) return result;
      }
      return { ok: true };
    }
    for (const key of Object.keys(value)) {
      if (isProhibitedKey(key)) {
        return { ok: false, reason: `Prohibited metadata key detected: "${key}".` };
      }
      const result = scanMetadata(value[key], ancestors);
      if (!result.ok) return result;
    }
    return { ok: true };
  } finally {
    ancestors.delete(value);
  }
}

// Validates metadata is free of prohibited keys, circular references,
// and unsupported value shapes, and within the size limit. Records are
// accepted intact or rejected — never partially stripped and stored.
function validateMetadata(metadata) {
  if (metadata == null) return { ok: true };

  const structural = scanMetadata(metadata, new Set());
  if (!structural.ok) return structural;

  const byteLength = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  if (byteLength > MAX_METADATA_BYTES) {
    return { ok: false, reason: `metadata exceeds the maximum size of ${MAX_METADATA_BYTES} bytes.` };
  }
  return { ok: true };
}

async function createSupportAction({ actorId, actorType, actionType, targetType, targetId, metadata }) {
  return prisma.supportAction.create({
    data: {
      actorId,
      actorType,
      actionType,
      targetType,
      targetId: targetId ?? null,
      metadata: metadata ?? null,
    },
  });
}

module.exports = {
  createSupportAction,
  validateMetadata,
  ALLOWED_ACTOR_TYPES,
  MAX_IDENTIFIER_LENGTH,
  MAX_METADATA_BYTES,
};
