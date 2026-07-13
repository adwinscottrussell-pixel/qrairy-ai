# ADR-004: Brand → Locations → Landing Pages long-term data model

## Status

Accepted (long-term direction; not yet implemented)

## Context

QRAIVY's current data model is single-business: one `LandingPage` per
QR code, owned directly by a `User`. As the platform grows to serve
multi-location brands and agencies, a flat single-business model
doesn't represent "one brand, many storefronts/locations" without
either duplicating data per location or forcing separate, disconnected
accounts per location.

## Decision

The long-term product and data model is a hierarchy:

```
Brand → Locations → Landing Pages
```

One Brand can contain many Locations; each Location expresses its
presence through the same Landing Page mechanism the current
single-business product already uses. This is one corporate dashboard
with reusable location data — not separate, independent dashboards per
location.

## Consequences

- Any future multi-location or agency work (dashboards, permissions,
  billing, branding/theming, white-label) should be designed against
  this hierarchy from the start, even before it is fully built, so
  early structural choices don't have to be undone later.
- Account-structure and branding decisions made along the way should
  keep a future white-label/agency layer plausible — avoid hardcoding
  a single-location assumption into new schema or routes.
- This is not yet implemented: today's schema is still single-business
  (`User` → `LandingPage` directly, no `Brand` or `Location` model).
  Treat this ADR as the target shape to design compatibly with, not as
  current schema.

## Related documents/commits

- `docs/company/04_DECISIONS.md` §"Brand → Locations → Landing Pages
  is the long-term enterprise model" — original decision record
- `docs/company/02_PRODUCT_VISION.md` — long-term vision this decision
  supports
