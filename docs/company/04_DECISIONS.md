# QRAIVY — Decisions Log

This is the permanent record of major product and architecture decisions
for QRAIVY, and why they were made. When you're unsure whether something
has already been decided, check here before re-opening the question.

## How to Add a Decision

```markdown
## [Decision Title]

**Decision**: what was decided, stated plainly.
**Reason**: why, in terms of the mission and principles in `company/`.
**Impact**: what this changes or constrains going forward.
```

Add new decisions to the top of the log, below this section, so the most
recent thinking is easiest to find.

---

## Foundational Decisions (Version 1)

## Smart Landing Pages are the center of the platform

**Decision**: The Smart Landing Page — one page per QR code, identified by
a slug — is the central object the rest of the platform is built around,
not one feature among equals.

**Reason**: Every other pillar (wallet, loyalty, push, deals) needs
something to attach to. Making the landing page that anchor keeps the
product coherent as it grows, instead of becoming a set of separately
rooted tools.

**Impact**: New features should be evaluated by how they attach to a
landing page, not by whether they need their own independent entry point.
If a proposed feature doesn't have a natural relationship to a page, that's
a reason to question its shape before building it.

## AI Business Generation is the preferred onboarding

**Decision**: Generating a business's first landing page from their
existing website, using AI, is the preferred way a new business gets
started on QRAIVY — not one onboarding option among several equally
weighted.

**Reason**: This is the clearest expression of the mission — removing
setup work — at the single moment (onboarding) where a business owner is
most likely to give up if the work feels like too much.

**Impact**: Onboarding flows that don't lead with AI generation should be
treated as secondary paths, not the default experience being designed for.

## Brand → Locations → Landing Pages is the long-term enterprise model

**Decision**: As QRAIVY grows to serve multi-location brands and agencies,
the long-term data and product model is a hierarchy: one Brand, containing
many Locations, each expressing its presence through the same Landing Page
mechanism the single-business product already uses.

**Reason**: This lets multi-location and agency capability grow on top of
the existing single-business model, rather than requiring a second,
parallel product for larger customers.

**Impact**: Any future multi-location or agency work should be designed
against this hierarchy from the start, even before it's fully built, so
early structural choices don't have to be undone later.

## Wallet is preferred before building a native mobile app

**Decision**: Apple and Google Wallet integration is the platform's answer
to "customers need this on their phone" — a native QRAIVY mobile app is not
the near-term path to that same goal.

**Reason**: Wallet passes give customers an on-phone presence (lock screen,
notifications) without requiring an app install, which matches the "no
account, no app install" customer experience principle. A native app would
add a distribution and maintenance burden a wallet pass avoids.

**Impact**: Requests for "a QRAIVY app" from the customer side should be
evaluated against whether wallet passes already solve the underlying need
before a native app is considered.

## AI should reduce setup complexity

**Decision**: The purpose of AI in this product is specifically to shorten
the distance between "I have a business" and "I have a working QRAIVY
presence" — not to add AI capability for its own sake.

**Reason**: This keeps AI investment focused on the mission rather than on
chasing AI capability that doesn't serve a real setup-complexity problem.

**Impact**: New AI features should be justified by what setup work they
remove, not just by what they're capable of generating.

## Mobile-first UX

**Decision**: The customer-facing experience — scanning a code, viewing a
page, saving a pass — is designed for a phone first.

**Reason**: This is where and how the actual customer interaction happens;
designing for desktop first and adapting down would optimize for the wrong
default case.

**Impact**: New customer-facing UI should be evaluated on a phone screen
before it's evaluated anywhere else.

## White-label and agency readiness

**Decision**: The platform's long-term direction includes being usable by
agencies managing many client businesses under their own brand, not
QRAIVY's.

**Reason**: This is part of how QRAIVY grows beyond individual businesses,
consistent with the long-term vision in `company/02_PRODUCT_VISION.md`.

**Impact**: Branding, theming, and account-structure decisions made along
the way should keep a future white-label/agency layer plausible, even
before it's built — for example, avoiding assumptions that hardcode a
single business owning a single account with no possibility of a
managing-agency layer above it.
