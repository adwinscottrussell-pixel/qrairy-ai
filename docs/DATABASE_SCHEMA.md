# QRAIVY — Database Schema (overview)

> **Not verified against `backend/prisma/schema.prisma` contents.** Everything
> below is inferred from migration filenames only. Treat as a hypothesis to
> confirm, not a source of truth.

## Migration History (chronological, from filenames)

1. `20240101000000_init` — initial schema
2. `20240102000000_add_subscribers` — likely a `Subscriber` model added
3. `20240103000000_add_site_content` — likely a `SiteContent` model added
4. `20240104000000_add_user_id` — likely a `userId` foreign key added to an existing model
5. `20260508175107_add_user_id` — another `userId` addition (note the large date gap from #4 — possibly a different table, or a fix/re-run — **needs verification**)
6. `20260509063048_add_user_plan` — likely a `plan` field added to `User`
7. `20260509085548_add_user_phone` — likely a `phone` field added to `User`
8. `20260509122715_add_dynamic_qr` — likely a `QRCode`/`DynamicQR` model or field added
9. `20260509214635_add_stripe_fields_to_user` — likely Stripe customer/subscription IDs added to `User`
10. `20260628150205_add_pass_slug` — likely a `slug` field added to a wallet `Pass` model

## Flagged Items (not part of normal migration history)

- `backend/prisma/lp_migration.sql` — sits outside `migrations/`, not part of the standard Prisma migration flow. Purpose unknown — do not run without understanding what it does first.
- `backend/prisma/schema.prisma.bak` — backup file tracked alongside the live schema. Should be reviewed (and likely removed once confirmed stale), not touched in this phase.

## Likely Entities (inferred, unconfirmed)

Based on migration names and route files: `User` (with plan, phone, Stripe fields), `Subscriber`, `SiteContent`, a dynamic `QRCode`/QR entity, and a wallet `Pass` entity (with a slug). Relationships between them are **not inferred here** — this would require reading `schema.prisma` directly.

## Next Step

Paste or share `backend/prisma/schema.prisma` contents to replace this
inference-based draft with a verified model list and relationship diagram.
