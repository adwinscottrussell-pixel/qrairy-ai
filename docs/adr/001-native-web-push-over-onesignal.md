# ADR-001: Native VAPID Web Push over OneSignal

## Status

Accepted

## Context

QRAIVY previously integrated OneSignal for push notifications
alongside `web-push` (VAPID-based native Web Push). Carrying both was
a maintenance and security liability: OneSignal touched controllers,
routes, docs, and frontend SDK/service-worker files, and represented a
third-party dependency for a capability the platform could own
natively.

## Decision

QRAIVY standardizes on native VAPID Web Push (`web-push`) as its push
notification mechanism. The legacy OneSignal integration was removed
end-to-end: backend controllers and routes, documentation, and
frontend SDK/service-worker files.

## Consequences

- One push mechanism to maintain and reason about, not two.
- No third-party push SDK loaded in customer-facing frontend code.
- One known follow-up: `Subscriber.oneSignalId` (`schema.prisma:53`)
  is a leftover column that needs a proper Prisma migration to drop —
  not yet done: hand-editing `schema.prisma` is disallowed per
  `CLAUDE.md` guardrail #5, so this requires an explicit migration.

## Related documents/commits

- Commit `dc1dc5a` — "security: remove legacy OneSignal integration"
- `CLAUDE.md` — confirms `web-push` (VAPID) as the intended mechanism
