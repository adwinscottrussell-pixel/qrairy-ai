# QRAIVY Homepage Architecture

**Status:** Approved baseline
**File:** `frontend/public/hero-v3-concept.html`
**Approved by:** Founder, visual review at `http://localhost:5500/hero-v3-concept.html`

## APPROVED DESIGN GUARDRAIL

**Never redesign, replace, substantially restructure, or remove an approved QRAIVY
homepage section without explicit founder approval.**

Before modifying this homepage, inspect this architecture document and the current
approved implementation (`frontend/public/hero-v3-concept.html`) first. Existing
working functionality must be preserved unless the task explicitly requires
changing it.

## Section order (as implemented)

1. **Hero** — QRAIVY nav bar, EN/DE language toggle, headline
   ("Turn your website into an AI-powered customer engagement platform."),
   website URL input (`#hero-url-input`), "Generate My Platform" CTA,
   Sunrise Bakery laptop + phone composite visual
   (`img/hero-v3/hero-laptop-iphone-combined-asset-v1.png`, with a
   dedicated German variant `-de-v1.png`), ambient energy-glow asset,
   and a five-item feature pillar strip (`feat1`–`feat5`: AI Does the
   Work, Engage Everywhere, and three more — **five pillars, not six**;
   verified directly against the file, no sixth pillar exists).
2. **Deal automation ("Create a Deal")** — one headline
   ("Create a Deal. Everything else happens automatically.") followed by
   four automation steps: Landing Page updated, Wallet updated, Push
   Notification ready, Analytics tracking enabled.
3. **Six product capability cards** ("Platform Capabilities") — Smart
   Landing Pages, Wallet Passes, Loyalty Programs, Deals & Promotions,
   AI Campaigns, Analytics & Insights (`cap1`–`cap6`), each with a
   dedicated EN/DE product illustration under `images/features/`.
4. **AI platform creation ("Give us your website. QRAIVY builds the
   rest.")** — a three-step visual: Your Website → QRAIVY AI → Your
   Platform (`s3_step1`–`s3_step3`), illustrated under
   `images/section3/`. **Note:** a "Review. Customize. Publish." step
   does not currently exist in the implementation — searched directly,
   not present. Do not assume it's there without adding it as a real,
   approved change.
5. **Customer retention loop ("Turn one visit into the next.")** — six
   steps: Visit, Join, Wallet, Return, Reward, Return Again
   (`s4_step1`–`s4_step6`), illustrated under `images/section4/`.
6. **Closing CTA** — repeats the website URL input and "Generate My
   Platform" CTA.

## Approved design language

- Dark, near-black hero background with the QRAIVY orange accent
  (`#ff5a1f` family) used for CTAs, headline emphasis spans, and active
  states.
- Cream/light content sections beneath the hero for the product/story
  sections (contrast shift from the dark hero, not a uniform dark page).
- Sunrise Bakery used as the running demonstration business throughout
  every section's illustrations (hero device visual, product cards,
  AI-platform-creation steps, retention-loop steps).
- Full English/German localization: a `lang-toggle` control switching a
  complete bilingual copy dictionary (`en`/`de` objects), plus
  per-image `data-src-en`/`data-src-de` attributes swapping every
  product/story/retention illustration to a dedicated German asset —
  verified as real, translated content, not a stub.

## Responsive requirements

Not independently re-verified in this pass (out of scope for this
checkpoint — this document records structure/content, not a new
responsive audit). Treat any responsive-behavior claim as unverified
until a dedicated pass confirms it against the real file at mobile/
tablet/desktop widths.

## Required runtime assets

- `frontend/public/js/qraivy-lang.js` — language toggle/dictionary logic
- `frontend/public/qds/qds.css` — shared input/button component styles
- `frontend/public/img/hero-v3/hero-energy-glow-asset-v1.png`
- `frontend/public/img/hero-v3/hero-laptop-iphone-combined-asset-v1.png`
- `frontend/public/img/hero-v3/hero-laptop-iphone-combined-asset-de-v1.png`
- `frontend/public/images/features/{smart-landing-pages,wallet-passes,loyalty-programs,deals-promotions,ai-campaigns,analytics}-{en,de}.png`
- `frontend/public/images/section3/{website,qraivy-ai,platform}-{en,de}.png`
- `frontend/public/images/section4/customer-loop-{visit,join,wallet,return,reward,return-again}-{en,de}.png`

Not required by the current implementation (present in the working tree
but unreferenced — not part of this checkpoint): `images/features/originals/*`,
`img/hero-v3/hero-iphone-loyalty-asset-v1.png`, `img/hero-v3/hero-laptop-asset-v1.png`.

## Change history

- **v1** — Initial approved baseline recorded, matching
  `frontend/public/hero-v3-concept.html` as committed in
  `checkpoint: approved QRAIVY homepage baseline` / tag `homepage-approved-v1`.
