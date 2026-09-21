/**
 * stadtpocketImageDiscoveryService.js — Phase 1H.4.3 (Business Hero
 * Image Selection in AI Review).
 * ─────────────────────────────────────────────────────────────
 * Answers two separate questions, both explicitly triggered by a human
 * action from the AI research review screen -- NEVER run automatically
 * as part of Phase 1G's own research call, and NEVER touching that
 * pipeline's code:
 *
 *   1. discoverWebsiteImageCandidates(websiteUrl) -- "what images exist
 *      on this already-verified official website that could be a hero
 *      image?" Reuses stadtpocketWebResearchService.js's EXACT same
 *      Firecrawl fetch helper (fetchBusinessWebsiteContent), which
 *      itself reuses stadtpocketResearchUrlSafety.js's URL-safety gate
 *      -- the SAME bounded, single-page, official-domain-only fetch
 *      Phase 1G's own research already relies on. No AI/Anthropic call
 *      here at all: image URLs are extracted from the returned
 *      markdown with plain string parsing, then filtered with
 *      stadtpocketAiExtractionService.js's EXISTING
 *      looksLikeUselessImageCandidate() heuristic (favicons/sprites/
 *      tracking pixels/dimension-suffixed thumbnails) -- reused
 *      directly, not reimplemented. Capped to a small gallery
 *      (MAX_CANDIDATES), never every image on the page. Never uses
 *      Google Image Search or any other provider.
 *
 *   2. copyWebsiteImageToCloudinary(imageUrl, listingId) -- once the
 *      Admin has EXPLICITLY selected one of those candidates (never
 *      automatic), turns it into a real, trusted StadtPocket-owned
 *      image: re-validates the specific image URL (never trusts it
 *      just because it appeared in already-validated page content),
 *      fetches the image bytes directly (bounded size/timeout, image
 *      content-type only), and uploads them via
 *      stadtPocketHeaderImageService.js's EXISTING
 *      uploadStadtPocketHeaderImage() -- the exact same Cloudinary
 *      account/folder/trust-boundary a manual browser upload already
 *      uses. This is the ONLY place an external website image ever
 *      becomes a real headerImage; before this call it is just a
 *      candidate URL, never presented as StadtPocket's own asset.
 *
 * Both are called from NEW routes only (see
 * managerStadtpocketListingRoutes.js) -- Phase 1G's researchBusiness()
 * itself is never modified and never calls either of these.
 * ─────────────────────────────────────────────────────────────
 */

const { fetchBusinessWebsiteContent, STATUS: WEB_STATUS } = require('./stadtpocketWebResearchService');
const { validateResearchUrl } = require('./stadtpocketResearchUrlSafety');
const { looksLikeUselessImageCandidate } = require('./stadtpocketAiExtractionService');
const { uploadStadtPocketHeaderImage } = require('./stadtPocketHeaderImageService');

class StadtpocketImageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DISCOVERY_STATUS = {
  OK: 'ok',
  INVALID_URL: 'invalid-url',
  UNREACHABLE: 'unreachable',
  PROVIDER_UNAVAILABLE: 'provider-unavailable',
  EMPTY: 'empty',
};

// Maps the reused fetchBusinessWebsiteContent's own STATUS vocabulary
// onto this service's smaller, image-specific one -- an explicit table,
// same discipline stadtpocketWebResearchService.js itself uses for the
// URL-safety layer below it, so a future rename in one module can never
// silently leak into this one.
const WEB_STATUS_TO_DISCOVERY_STATUS = {
  [WEB_STATUS.INVALID_URL]: DISCOVERY_STATUS.INVALID_URL,
  [WEB_STATUS.UNSUPPORTED_PROTOCOL]: DISCOVERY_STATUS.INVALID_URL,
  [WEB_STATUS.PRIVATE_TARGET]: DISCOVERY_STATUS.INVALID_URL,
  [WEB_STATUS.DNS_FAILURE]: DISCOVERY_STATUS.UNREACHABLE,
  [WEB_STATUS.PROVIDER_UNAVAILABLE]: DISCOVERY_STATUS.PROVIDER_UNAVAILABLE,
  [WEB_STATUS.UNREACHABLE]: DISCOVERY_STATUS.UNREACHABLE,
  [WEB_STATUS.EMPTY]: DISCOVERY_STATUS.EMPTY,
};

const MAX_CANDIDATES = 6;
// Only real photo formats -- SVG (UI icons/logos) and other non-raster
// formats are never surfaced as a hero-image candidate.
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)(\?|#|$)/i;

// Markdown image syntax (![alt](url)) is what Firecrawl's markdown
// conversion produces for <img> tags; a raw <img src="..."> fallback
// covers content that arrives as literal HTML inside the markdown
// (Firecrawl's conversion is not always exhaustive). Both are read-only
// regex scans over already-fetched text -- no second fetch, no AI call.
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)/g;
const HTML_IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;

function extractRawImageUrls(content) {
  const urls = [];
  let m;
  MARKDOWN_IMAGE_RE.lastIndex = 0;
  while ((m = MARKDOWN_IMAGE_RE.exec(content))) urls.push(m[1]);
  HTML_IMG_SRC_RE.lastIndex = 0;
  while ((m = HTML_IMG_SRC_RE.exec(content))) urls.push(m[1]);
  return urls;
}

// Resolves a possibly-relative image URL against the page it was found
// on, and rejects anything that isn't a genuine http(s) raster-image
// path once resolved -- never a guess, always a real URL parse.
function resolveAndFilterImageUrl(rawUrl, baseUrl) {
  let resolved;
  try {
    resolved = new URL(rawUrl, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
  if (!ALLOWED_IMAGE_EXTENSIONS.test(resolved.pathname)) return null;
  if (looksLikeUselessImageCandidate(resolved.toString())) return null;
  return resolved.toString();
}

/**
 * discoverWebsiteImageCandidates(websiteUrl, { fetchImpl }) -> Promise<
 *   { status, candidates: [{ url, sourceUrl }] }>
 * Never throws. candidates is always [] when status !== 'ok'; a genuine
 * zero-image page also legitimately returns status 'ok', candidates: []
 * -- never fabricated. Bounded to MAX_CANDIDATES, deduped by URL.
 */
async function discoverWebsiteImageCandidates(websiteUrl, { fetchImpl = fetch } = {}) {
  const webResult = await fetchBusinessWebsiteContent(websiteUrl, { fetchImpl, onlyMainContent: false });
  if (webResult.status !== WEB_STATUS.OK) {
    return { status: WEB_STATUS_TO_DISCOVERY_STATUS[webResult.status] || DISCOVERY_STATUS.UNREACHABLE, candidates: [] };
  }

  const baseUrl = webResult.sourceUrl || websiteUrl;
  const seen = new Set();
  const candidates = [];
  for (const rawUrl of extractRawImageUrls(webResult.content)) {
    const resolved = resolveAndFilterImageUrl(rawUrl, baseUrl);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    candidates.push({ url: resolved, sourceUrl: baseUrl });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  return { status: DISCOVERY_STATUS.OK, candidates };
}

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const IMAGE_FETCH_MAX_BYTES = 5 * 1024 * 1024; // matches the manual-upload limit (HEADER_IMAGE_MAX_BYTES)

/**
 * copyWebsiteImageToCloudinary(imageUrl, listingId, { fetchImpl }) ->
 * Promise<{ url, publicId, width, height }>. Throws StadtpocketImageError
 * (safe, user-facing message, no internals) on any failure -- invalid/
 * unsafe URL, unreachable, wrong content-type, oversized, or a
 * Cloudinary error. Never silently falls back to a fabricated image.
 */
async function copyWebsiteImageToCloudinary(imageUrl, listingId, { fetchImpl = fetch } = {}) {
  const validation = await validateResearchUrl(imageUrl);
  if (!validation.ok) {
    throw new StadtpocketImageError('This image URL is not from a safe, reachable location.', 400);
  }

  let res;
  try {
    res = await fetchImpl(validation.url.toString(), { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch {
    throw new StadtpocketImageError('The image could not be downloaded.', 502);
  }
  if (!res || !res.ok) {
    throw new StadtpocketImageError('The image could not be downloaded.', 502);
  }

  const contentType = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : null;
  if (!contentType || !contentType.startsWith('image/')) {
    throw new StadtpocketImageError('The selected URL is not an image.', 400);
  }

  let arrayBuffer;
  try {
    arrayBuffer = await res.arrayBuffer();
  } catch {
    throw new StadtpocketImageError('The image could not be downloaded.', 502);
  }
  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > IMAGE_FETCH_MAX_BYTES) {
    throw new StadtpocketImageError('The image is too large or empty.', 400);
  }

  const buffer = Buffer.from(arrayBuffer);
  let uploadResult;
  try {
    uploadResult = await uploadStadtPocketHeaderImage(buffer, listingId);
  } catch {
    throw new StadtpocketImageError('The image could not be saved.', 502);
  }

  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    width: uploadResult.width,
    height: uploadResult.height,
  };
}

module.exports = {
  StadtpocketImageError,
  DISCOVERY_STATUS,
  MAX_CANDIDATES,
  discoverWebsiteImageCandidates,
  copyWebsiteImageToCloudinary,
  // exported for direct unit testing only
  extractRawImageUrls,
  resolveAndFilterImageUrl,
};
