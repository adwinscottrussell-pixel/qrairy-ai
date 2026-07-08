# QRAIVY — Core Principles

These govern how QRAIVY is built, not just what it does. They apply equally
to product decisions and engineering decisions.

## Product Principles

**One QR code, one page, one growing set of tools.** Everything hangs off a
single entry point. New capability extends that point; it doesn't introduce
a second one.

**Remove setup work, don't just add features.** A new capability earns its
place by making the business owner's job easier, not merely by being
possible to build.

**Converge on one working mechanism.** Where two approaches could solve the
same problem, prefer building one well over maintaining two partially.

**Mobile-first.** The customer's experience — scanning, viewing a page,
saving a pass — happens on a phone. Design and build for that first.

**Grow toward Brand → Locations → Landing Pages without breaking the single
business today.** Multi-location and agency capability should extend the
existing model, not require rebuilding it.

## AI Principles

**AI generates a starting point a human can edit.** It never has the final
word, and it's never presented as unchangeable or hidden from the business
owner.

**Move toward one consistent AI implementation, not many.** As AI is used
in more places across the product, converge toward a shared, well-built
pattern rather than adding another one-off integration.

**AI reduces setup complexity.** Its purpose in this product is specifically
to shorten the distance between "I have a business" and "I have a working
QRAIVY presence" — evaluate new AI capability against that purpose.

## Customer Experience Principles

**No account required for the core loop.** Scanning a code, viewing a page,
saving a pass, and opting in to hear from a business again should never
require the customer to create an account or log in.

**Consent is a commitment, not a formality.** Once given, it's enforced —
any new data collection point should meet the same bar already set.

**What the customer sees is always their real, current state.** Stamp
counts, reward status, and pass content should never be stale or wrong.

## Engineering Principles

**Check whether it already exists before building a new version.** Look for
prior attempts at the same problem before adding another one.

**Extend the existing data model unless a feature genuinely needs a new
one.** A real structural change — like the Brand → Locations hierarchy —
is a legitimate exception, not a shortcut to take lightly.

**Public-facing endpoints stay public; owner-facing endpoints require
authentication.** Keep this boundary consistent as the system grows.

**Read the reasoning left in the code before changing it.** Where a past
decision or fix is explained in a comment, that context exists to prevent
a regression — not as incidental narration to skip past.

## How to Use These Principles

When a product or engineering decision doesn't have an obvious answer,
these principles are the tiebreaker — not personal preference, not
whichever approach is fastest to ship. When a principle is knowingly set
aside for a specific reason, that should be recorded in
`company/04_DECISIONS.md`, not left unstated.
