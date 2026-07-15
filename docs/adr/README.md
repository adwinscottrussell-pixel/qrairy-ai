# Architecture Decision Records

One ADR per important architectural decision for QRAIVY.

- ADRs explain **why** a decision was made — not how to implement it.
  Implementation plans live in `docs/architecture/` or sprint docs, not
  here.
- ADRs are **not rewritten** after acceptance. If a decision changes,
  write a new ADR that supersedes the old one, and mark the old one's
  Status as `Superseded by ADR-00N`.
- Numbering is sequential and permanent; a superseded ADR keeps its
  number.

## Format

Each ADR contains:

- **Status** — Draft / Accepted / Superseded
- **Context** — what situation led to needing a decision
- **Decision** — the decision itself, stated plainly
- **Consequences** — what this makes easier, harder, or forecloses
- **Related documents/commits** — links to the docs or commits that
  ground this decision in actual repo history

## Index

| ADR | Decision |
|---|---|
| [001](001-native-web-push-over-onesignal.md) | Native VAPID Web Push over OneSignal |
| [002](002-operations-center-as-internal-platform.md) | Admin Panel evolves into the QRAIVY Operations Center |
| [003](003-universal-operations-search.md) | Universal Operations Search as the primary lookup mechanism |
| [004](004-multi-location-hierarchy.md) | Brand → Locations → Landing Pages long-term data model |
