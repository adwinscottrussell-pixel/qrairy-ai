// ============================================================
// opsSupportActionController.js — POST /ops/support-actions
// Per docs/architecture/QRAIVY_SUPPORT_PLAYBOOK_v1.md §11/§12
// ============================================================
const {
  createSupportAction,
  validateMetadata,
  ALLOWED_ACTOR_TYPES,
  MAX_IDENTIFIER_LENGTH,
} = require('../services/supportActionService');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isWithinIdentifierLength(v) {
  return v.length <= MAX_IDENTIFIER_LENGTH;
}

async function handleCreateSupportAction(req, res) {
  try {
    const { actorType, actionType, targetType, targetId, metadata } = req.body || {};

    if (!isNonEmptyString(actorType) || !ALLOWED_ACTOR_TYPES.includes(actorType)) {
      return res.status(400).json({ error: `actorType must be one of: ${ALLOWED_ACTOR_TYPES.join(', ')}.` });
    }
    if (!isNonEmptyString(actionType)) {
      return res.status(400).json({ error: 'actionType is required.' });
    }
    if (!isWithinIdentifierLength(actionType)) {
      return res.status(400).json({ error: `actionType must be at most ${MAX_IDENTIFIER_LENGTH} characters.` });
    }
    if (!isNonEmptyString(targetType)) {
      return res.status(400).json({ error: 'targetType is required.' });
    }
    if (!isWithinIdentifierLength(targetType)) {
      return res.status(400).json({ error: `targetType must be at most ${MAX_IDENTIFIER_LENGTH} characters.` });
    }
    if (targetId !== undefined && targetId !== null) {
      if (!isNonEmptyString(targetId)) {
        return res.status(400).json({ error: 'targetId must be a non-empty string when provided.' });
      }
      if (!isWithinIdentifierLength(targetId)) {
        return res.status(400).json({ error: `targetId must be at most ${MAX_IDENTIFIER_LENGTH} characters.` });
      }
    }
    if (metadata !== undefined && metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
      return res.status(400).json({ error: 'metadata must be a JSON object when provided.' });
    }

    const metadataCheck = validateMetadata(metadata ?? null);
    if (!metadataCheck.ok) {
      return res.status(400).json({ error: `Invalid metadata: ${metadataCheck.reason}` });
    }

    // actorId is always the verified admin identity from requireAdmin,
    // never a client-supplied value — an audit log whose "who" a caller
    // could spoof would not be trustworthy (Support Playbook Principle 2).
    const actorId = req.adminUser.clerkId;

    const action = await createSupportAction({
      actorId,
      actorType,
      actionType,
      targetType,
      targetId: targetId ?? null,
      metadata: metadata ?? null,
    });

    return res.status(201).json({
      id: action.id,
      actorId: action.actorId,
      actorType: action.actorType,
      actionType: action.actionType,
      targetType: action.targetType,
      targetId: action.targetId,
      createdAt: action.createdAt,
    });
  } catch (err) {
    console.error('[ops/support-actions]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { handleCreateSupportAction };
