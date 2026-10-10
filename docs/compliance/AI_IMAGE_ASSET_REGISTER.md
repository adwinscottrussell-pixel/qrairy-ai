# AI Image Asset Register — QRAIVY

Permanent inventory of the image files shipped by the QRAIVY frontend, their
AI origin, their machine-readable provenance, and their provisional
disclosure classification under Article 50 of the EU AI Act.

| | |
|---|---|
| Register created | 2026-10-10 |
| Baseline audited | `origin/main` @ `6b23e2f` (production) |
| Scope | every image file under `frontend/public/` (41 files) |
| Out of scope | customer-uploaded images (logos, wallet strips, gallery images), `docs/approved-designs/` |
| Status | **Documentation only.** No visible label, image or code change has been made. |

> **Not legal advice.** The classifications below are an engineering
> assessment made to prepare a legal review. No entry in this register is a
> legal conclusion. Statements about the AI Act are summaries and must be
> checked against the official text and current Commission guidance before
> anyone relies on them.

## 1. Summary

| Count | What |
|---|---|
| 41 | image files under `frontend/public/` |
| 34 | AI marketing images shown on the homepage (31 under `images/` + 3 under `img/hero-v3/`) |
| 21 | of those 34 still carry an embedded OpenAI C2PA manifest |
| 13 | of those 34 carry no C2PA manifest (12 `images/features/*` + the demo QR code) |
| 1 | further file with a C2PA manifest: `favicon.png` (22 in total) |
| 4 | small icon files derived from the logo, no manifest |
| 2 | files not referenced by any page (`img/hero-mockup.png`, `img/qr-orb.png`) |

Provisional classification of the 41 files:

| Class | Meaning | Files |
|---|---|---|
| A | Visible disclosure legally required | **0 confirmed** |
| B | Needs legal review | 26 (12 B1 + 14 B2) |
| C | Recommended voluntary disclosure | 4 |
| D | No visible disclosure expected | 11 |

Class A is empty on purpose: nothing in this register has been confirmed by
counsel as legally requiring a visible label. The files most likely to move
into class A after review are the eight marked B1 with a frontal face.

Where the images appear:

- `frontend/public/index.html` — the homepage, and the only page that shows
  marketing images.
- `frontend/public/hero-v3-concept.html` and
  `frontend/public/homepage-approved-2026-08-22.html` — two further pages
  that reference the same 33 images (everything except the demo QR code).
- No other public or customer-facing page ships a stock, template or starter
  image. Smart Landing Pages render only what the customer uploads.
- On the homepage every marketing image has `alt=""` and
  `aria-hidden="true"`, and no disclosure text exists anywhere on the site.

## 2. Keys used in the register

**AI-generated status**

| Key | Meaning |
|---|---|
| Confirmed + C2PA | Founder statement of 2026-10-10 ("all images currently used on QRAIVY are AI-generated") and an embedded manifest that says so |
| Confirmed | Founder statement only; the file carries no embedded proof |
| Unconfirmed | Covered by the founder statement only in general terms; origin of this specific file should be confirmed |

**C2PA status**

| Key | Meaning |
|---|---|
| Intact | PNG contains a `caBX` chunk (JUMBF/C2PA manifest store) that references OpenAI, `gpt-image` and the IPTC digital source type `trainedAlgorithmicMedia` |
| None | No `caBX` chunk in the file |

Presence of the manifest was detected by reading the PNG chunks. The
signatures were **not** cryptographically validated.

**Disclosure classification**

| Key | Meaning |
|---|---|
| A | Visible disclosure legally required (confirmed by counsel) |
| B1 | Legal review: possible "deep fake" under Art. 50(4) — photorealistic scene with a person |
| B2 | Legal review under advertising law (UWG), not primarily the AI Act — invented product UI and metrics presented as the product |
| C | Recommended voluntary disclosure — photorealistic elements inside an obvious mockup |
| D | No visible disclosure expected — decorative, logo, or functional graphic that nobody would take for a real scene |

**Recommended German wording** (not yet implemented anywhere)

| Key | German | English |
|---|---|---|
| W1 | Bilder mit KI erstellt. Personen, Unternehmen und Zahlen sind fiktiv. | Images created with AI. People, businesses and figures are fictional. |
| W2 | Beispielhafte Darstellung, mit KI erstellt. Oberfläche und Zahlen können vom Produkt abweichen. | Illustrative example, created with AI. Interface and figures may differ from the product. |
| W3 | Alle Bilder auf dieser Website wurden mit KI erstellt und zeigen keine realen Personen oder Unternehmen. | All images on this website were created with AI and do not show real people or businesses. |
| W0 | KI-generiert | AI-generated |
| — | No wording recommended | |

W1 and W2 are section-level notes, W3 is a site-wide note (footer or legal
page), W0 is the short per-image label to use only if counsel requires
labelling on the image itself. "W3 only" means the file is covered by the
site-wide note and needs nothing of its own.

**Reviewed** — "Yes" means the file was opened and looked at for this
register. "Pair" means it was classified from its reviewed DE counterpart
and its file name, and should be looked at before a final decision.

## 3. Register

Paths are relative to `frontend/public/`. SHA-256 is the first 12 hex
characters of the file hash at the baseline commit.

### 3.1 Customer journey scenes — `images/section4/` (12 files)

Homepage section "Keep customers coming back", six step cards, one DE and
one EN file per step. All are photorealistic café scenes for the fictional
"Sunrise Bakery". The same fictional woman recurs across four of the six
steps.

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `images/section4/customer-loop-visit-de.png` | Step 1 (DE) | Confirmed + C2PA | Intact | Photorealistic; woman seen from behind / in profile at a shopfront | B1 | W1 | Yes | Yes | `59efad144a80` |
| `images/section4/customer-loop-visit-en.png` | Step 1 (EN) | Confirmed + C2PA | Intact | Photorealistic; woman seen from behind / in profile at a shopfront | B1 | W1 | Yes | Yes | `411bf2bee629` |
| `images/section4/customer-loop-join-de.png` | Step 2 (DE) | Confirmed + C2PA | Intact | Photorealistic; hands and partial figure, no face | B1 | W1 | Yes | Yes | `196d1a66598a` |
| `images/section4/customer-loop-join-en.png` | Step 2 (EN) | Confirmed + C2PA | Intact | Photorealistic; hands and partial figure, no face | B1 | W1 | Yes | Yes | `cedc17400d05` |
| `images/section4/customer-loop-wallet-de.png` | Step 3 (DE) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `baf828f4a19f` |
| `images/section4/customer-loop-wallet-en.png` | Step 3 (EN) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `4088892ae5c4` |
| `images/section4/customer-loop-return-de.png` | Step 4 (DE) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `8348a427787c` |
| `images/section4/customer-loop-return-en.png` | Step 4 (EN) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `c524e816818b` |
| `images/section4/customer-loop-reward-de.png` | Step 5 (DE) | Confirmed + C2PA | Intact | Photorealistic; **frontal face**, second person partly visible | B1 | W1 | Yes | Yes | `fce4b8157612` |
| `images/section4/customer-loop-reward-en.png` | Step 5 (EN) | Confirmed + C2PA | Intact | Photorealistic; **frontal face**, second person partly visible | B1 | W1 | Yes | Yes | `ecd2b6fac336` |
| `images/section4/customer-loop-return-again-de.png` | Step 6 (DE) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `16b1bd6491e5` |
| `images/section4/customer-loop-return-again-en.png` | Step 6 (EN) | Confirmed + C2PA | Intact | Photorealistic; **frontal face** | B1 | W1 | Yes | Yes | `e78dbf21b28c` |

### 3.2 "How it works" cards — `images/section3/` (6 files)

Homepage three-step explainer.

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `images/section3/website-de.png` | Step 1 (DE) | Confirmed + C2PA | Intact | Illustrative website mockup with photorealistic food | C | W3 only | No | Yes | `07a7de9bc7a3` |
| `images/section3/website-en.png` | Step 1 (EN) | Confirmed + C2PA | Intact | Illustrative website mockup with photorealistic food | C | W3 only | No | Pair | `ccf22d9df9cf` |
| `images/section3/qraivy-ai-de.png` | Step 2 (DE) | Confirmed + C2PA | Intact | Illustrative; glowing logo graphic with a text list | D | — | No | Yes | `d9e36c3ff6ff` |
| `images/section3/qraivy-ai-en.png` | Step 2 (EN) | Confirmed + C2PA | Intact | Illustrative; glowing logo graphic with a text list | D | — | No | Pair | `273a34c3ac61` |
| `images/section3/platform-de.png` | Step 3 (DE) | Confirmed + C2PA | Intact | Illustrative mockup of a QRAIVY-branded dashboard with invented metrics | B2 | W2 | Yes | Yes | `54c797d09630` |
| `images/section3/platform-en.png` | Step 3 (EN) | Confirmed + C2PA | Intact | Illustrative mockup of a QRAIVY-branded dashboard with invented metrics | B2 | W2 | Yes | Pair | `7c1b61cee3ce` |

### 3.3 Capability cards — `images/features/` (12 files)

Homepage feature grid. All twelve are UI mockups for a fictional bakery.
**None carries a C2PA manifest** — it was lost when these files were
cropped or re-exported after generation.

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `images/features/smart-landing-pages-de.png` | Smart Landing Pages (DE) | Confirmed | None | Illustrative editor mockup with photorealistic food | B2 | W2 | Yes | Yes | `7ed3cdd94cba` |
| `images/features/smart-landing-pages-en.png` | Smart Landing Pages (EN) | Confirmed | None | Illustrative editor mockup with photorealistic food | B2 | W2 | Yes | Pair | `e418cc5e5ec7` |
| `images/features/wallet-passes-de.png` | Wallet Passes (DE) | Confirmed | None | Illustrative pass mockups; Apple Wallet and Google Wallet marks | B2 | W2 | Yes | Yes | `fda37764a3e2` |
| `images/features/wallet-passes-en.png` | Wallet Passes (EN) | Confirmed | None | Illustrative pass mockups; Apple Wallet and Google Wallet marks | B2 | W2 | Yes | Pair | `fb0505d8dbb7` |
| `images/features/loyalty-programs-de.png` | Loyalty Programs (DE) | Confirmed | None | Illustrative dashboard and pass mockup with invented metrics; wallet marks | B2 | W2 | Yes | Yes | `732dcae23170` |
| `images/features/loyalty-programs-en.png` | Loyalty Programs (EN) | Confirmed | None | Illustrative dashboard and pass mockup with invented metrics; wallet marks | B2 | W2 | Yes | Pair | `73d222f405a6` |
| `images/features/deals-promotions-de.png` | Deals & Promotions (DE) | Confirmed | None | Illustrative dashboard mockup with invented metrics | B2 | W2 | Yes | Yes | `ea70abe37f9a` |
| `images/features/deals-promotions-en.png` | Deals & Promotions (EN) | Confirmed | None | Illustrative dashboard mockup with invented metrics | B2 | W2 | Yes | Pair | `9640459ff274` |
| `images/features/ai-campaigns-de.png` | AI Campaigns (DE) | Confirmed | None | Illustrative campaign mockup with invented metrics | B2 | W2 | Yes | Yes | `fbbbdf7c1b1f` |
| `images/features/ai-campaigns-en.png` | AI Campaigns (EN) | Confirmed | None | Illustrative campaign mockup with invented metrics | B2 | W2 | Yes | Pair | `c44a02ae3ac8` |
| `images/features/analytics-de.png` | Analytics (DE) | Confirmed | None | Illustrative analytics mockup with invented metrics | B2 | W2 | Yes | Yes | `a121e3c89792` |
| `images/features/analytics-en.png` | Analytics (EN) | Confirmed | None | Illustrative analytics mockup with invented metrics | B2 | W2 | Yes | Pair | `7460326fec07` |

### 3.4 Hero — `img/hero-v3/` (3 files)

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `img/hero-v3/hero-laptop-iphone-combined-asset-v1.png` | Hero device image (EN) | Confirmed + C2PA | Intact | Illustrative render of a laptop and phone showing a fictional bakery site; photorealistic food | C | W3 only | No | Pair | `b2dc534c098f` |
| `img/hero-v3/hero-laptop-iphone-combined-asset-de-v1.png` | Hero device image (DE) | Confirmed + C2PA | Intact | Illustrative render of a laptop and phone showing a fictional bakery site; photorealistic food | C | W3 only | No | Yes | `3238730fc303` |
| `img/hero-v3/hero-energy-glow-asset-v1.png` | Hero background glow | Confirmed + C2PA | Intact | Decorative abstract light effect | D | — | No | Yes | `47f14d25a736` |

### 3.5 Demo QR code — `images/demo/` (1 file)

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `images/demo/qr-live-demo.png` | Homepage live demo section | Unconfirmed | None | Functional black-and-white QR code | D | — | No | Yes | `2730b8951c55` |

This file is counted among the 34 homepage images, but a QR code that scans
correctly is normally produced by a QR encoder, not an image model. Its
origin should be confirmed (section 5, question 8).

### 3.6 Logo and icons — `frontend/public/` root (5 files)

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `favicon.png` | QRAIVY logo; referenced by `backend/src/services/googleWalletService.js` | Confirmed + C2PA | Intact | Illustrative logo | D | — | No | Yes | `a6ba4da136f7` |
| `favicon.ico` | Browser tab icon | Unconfirmed | None | Illustrative logo, small size | D | — | No | No | `68dd09b947f0` |
| `favicon-32x32.png` | Browser tab icon | Unconfirmed | None | Illustrative logo, small size | D | — | No | No | `651b86401444` |
| `favicon-16x16.png` | Browser tab icon | Unconfirmed | None | Illustrative logo, small size | D | — | No | No | `c2c1eb5d9ff7` |
| `apple-touch-icon.png` | Home-screen icon | Unconfirmed | None | Illustrative logo, small size | D | — | No | No | `9e49c770f9b3` |

The four small icons are presumed to be resized copies of `favicon.png`.

### 3.7 Not referenced by any page (2 files)

| File | Appears | AI status | C2PA | Type | Class | Wording | Legal review | Reviewed | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `img/hero-mockup.png` | Nowhere | Unconfirmed | None | Illustrative UI mockup with photorealistic food | D while unused | — | No | Yes | `97f55d123312` |
| `img/qr-orb.png` | Nowhere | Unconfirmed | None | Decorative glowing QR tile | D | — | No | Yes | `9c78c7f584f3` |

If `img/hero-mockup.png` is ever put on a page it should be re-classified
(C or B2).

## 4. Legal and technical background

### 4.1 EU AI Act, Article 50 (summary, to be verified)

Regulation (EU) 2024/1689. Summary of the parts relevant to images:

- **Art. 50(2) — providers.** A provider of an AI system that generates
  synthetic image content must ensure the output is marked in a
  machine-readable format and detectable as artificially generated. For the
  images in this register the provider is OpenAI, not QRAIVY.
- **Art. 50(4) — deployers.** A deployer of an AI system that generates or
  manipulates image content **constituting a deep fake** must disclose that
  the content has been artificially generated or manipulated. Where the
  content is part of an evidently artistic, creative, satirical or fictional
  work, the duty is limited to disclosing its existence in a way that does
  not hamper the display of the work. QRAIVY is the deployer for these
  images.
- **Art. 3(60) — "deep fake".** AI-generated or manipulated image, audio or
  video content that resembles existing persons, objects, places, entities
  or events and would falsely appear to a person to be authentic or
  truthful.
- **Art. 50(5) — how.** The information must be clear and distinguishable,
  given at the latest at the time of the first interaction or exposure, and
  must meet accessibility requirements.
- **Application date.** Under Art. 113 the Article 50 obligations were
  scheduled to apply from 2 August 2026. Whether that date or its scope was
  later changed has **not** been verified for this register.

Consequence for this register: the AI Act does not attach a visible-label
duty to every AI-generated image. The duty in Art. 50(4) depends on whether
an image is a "deep fake". That is why only the photorealistic scenes with
people are flagged B1, and why nothing is placed in class A without counsel.

### 4.2 Machine-readable provenance

- 22 files carry an OpenAI C2PA manifest (`caBX` PNG chunk) naming
  `gpt-image` and the source type `trainedAlgorithmicMedia`. This is the
  provider's Art. 50(2) marking and it is already being served to visitors,
  because the files are static and delivered unmodified.
- 12 files (`images/features/*`) lost the manifest during cropping or
  re-export. It can only be restored by re-exporting from the original
  generated files with a tool that preserves C2PA. That would change image
  files and is not part of this documentation step.
- Any resize, crop, format conversion (PNG to WebP/JPEG/AVIF), compression
  pass or image CDN transformation is likely to remove the manifest. Adding
  an image optimisation step to the build or hosting would silently strip
  provenance from all 22 files.
- A C2PA manifest is not a substitute for a visible disclosure where one is
  required, and a visible disclosure is not a substitute for the manifest.

### 4.3 Visible disclosure considerations

- No visible disclosure exists on the site today.
- All homepage marketing images are marked `alt=""` / `aria-hidden="true"`.
  A disclosure therefore cannot be carried by alt text; it has to be visible
  text that assistive technology can also read.
- The proposed approach (not implemented) keeps the approved design intact:
  one section note under the customer-journey heading (W1), one site-wide
  note in the footer or on a legal page (W3), and no badges on the images.
  Whether a section note and a footer note satisfy the "first exposure"
  wording of Art. 50(5), or whether a label on or directly beside each B1
  image is needed (W0), is an open legal question.
- The homepage switches language with `data-i18n` keys and swaps images with
  `data-src-en` / `data-src-de`. Any disclosure must be provided in both
  languages through the same mechanism.
- The site has no Impressum or privacy page in this repository, so the
  site-wide note currently has no legal page to live on.
- The two duplicate homepage files listed in section 1 serve the same
  images and would need the same treatment, or to be retired.

### 4.4 Observations outside the AI Act

Recorded here because they came up during the image review. Each needs its
own decision.

- **Invented product UI and metrics (class B2).** The capability cards and
  the platform card show interfaces and numbers that are not screenshots of
  the product. This is a misleading-advertising question under German
  unfair competition law (UWG).
- **Third-party marks.** Several images contain AI-rendered Apple Wallet and
  Google Wallet names, logos or "Add to Wallet" buttons
  (`images/features/wallet-passes-*`, `images/features/loyalty-programs-*`,
  `images/section4/customer-loop-wallet-*`, both hero device images). Both
  companies publish brand rules for these badges.
- **QR codes drawn inside images** are part of the generated picture and are
  not expected to scan.

### 4.5 Workflow for future images

1. Keep the original file exactly as downloaded from the generator, outside
   the web directory, before any editing.
2. Add a row to this register in the same commit that adds the image: path,
   where it appears, generator, date, C2PA status, type, class, wording.
3. Prefer publishing the file unmodified. If it must be cropped or
   converted, use a tool that preserves or re-signs C2PA and record the
   result in the register.
4. Check the published file for the `caBX` chunk before merging and record
   "Intact" or "None".
5. Do not add build-time or CDN image optimisation to pages that serve these
   files without first checking its effect on the manifests.
6. A new photorealistic image showing a person is class B1 until reviewed.
7. Never generate an image that depicts a real person, a real business or a
   real place as if it were a photograph of it.
8. When an image file is replaced or removed, update its row; do not delete
   the history of what was published.

## 5. Outstanding legal questions

1. **Application date.** Is Article 50 in force as scheduled (2 August
   2026), and has any later amendment or transition period changed it?
2. **Deep-fake scope.** Do photorealistic images of fictional people in a
   fictional business "resemble existing persons, objects, places" within
   Art. 3(60)? This decides whether the twelve B1 files move to class A.
3. **Fictional-work exception.** If they are deep fakes, does the
   "evidently fictional" limb of Art. 50(4) apply to advertising imagery,
   allowing the lighter form of disclosure?
4. **Placement.** Does a section note plus a site-wide note meet Art. 50(5),
   or is a label on or next to each image required?
5. **Guidance.** What do the Commission's guidelines and the code of
   practice on marking and labelling AI-generated content say about
   marketing imagery? Neither was consulted for this register.
6. **Product mockups.** Are the B2 images acceptable under the UWG with a
   note such as W2, or should they be replaced by real screenshots?
7. **Third-party marks.** Is the use of AI-rendered Apple Wallet and Google
   Wallet marks compatible with those companies' brand rules?
8. **Unconfirmed origins.** Confirm how `images/demo/qr-live-demo.png`, the
   four small icon files and the two unreferenced files were produced.
9. **Stripped provenance.** Is there any duty to restore the manifests on
   the twelve `images/features/*` files, or is the provider's original
   marking sufficient?
10. **Customer uploads.** Customers can upload their own AI-generated
    images to Smart Landing Pages. Who carries which duty, and should
    QRAIVY offer an "AI-generated" flag for uploads?
11. **Other AI output.** QRAIVY also produces AI-written landing-page text,
    an AI chat on landing pages and synthetic voice. These fall under other
    parts of Article 50 and are not covered by this image register.
12. **Legal pages.** The missing Impressum and privacy page are a separate
    German-law matter that also affects where the site-wide note can go.

## 6. Maintaining this register

- Update it in the same commit as any change to an image under
  `frontend/public/`.
- Re-check the C2PA status whenever a file's hash changes.
- Record the outcome of the legal review here: move files between classes
  and replace "0 confirmed" in section 1 with the confirmed list.
- At baseline `6b23e2f` the image files are identical on `main` and on the
  preview branches `preview/admin-nav-standardization`,
  `preview/plan-consolidation`, `preview/billing-step2`,
  `preview/qraivy-admin` and `preview/stadtpocket-phase6d-admin`.
