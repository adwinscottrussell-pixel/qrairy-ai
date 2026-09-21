// stadtpocket-ai-research.js — Phase 1C (AI Business Onboarding).
// ─────────────────────────────────────────────────────────────
// Pure presentation-logic helpers for the "Mit KI hinzufügen" review
// screen in stadtpocket-admin.html. Split into its own plain script
// (same convention as the other files in frontend/public/js/) for one
// specific reason: this admin page has no bundler/build step and no
// existing frontend test framework, so the ONLY way to unit-test any of
// its logic without inventing new test infrastructure is to keep it in
// a plain script that is both:
//   - loaded as a normal <script> global in the browser (no `module`
//     there, so the export guard at the bottom is inert), and
//   - `require()`-able directly from a Node test script (matching this
//     repo's existing backend test convention: plain assert, no Jest).
//
// Nothing here touches the DOM, calls api()/fetch, or reads global admin
// state (cities/currentLocationId/etc.) -- those stay in
// stadtpocket-admin.html's own inline <script>, exactly like
// usePublishedBusiness.js's split between the pure function and its
// React hook wrapper in the other repo.
// ─────────────────────────────────────────────────────────────

const AI_CONFIDENCE_LABELS = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };

function translateConfidence(confidence) {
  return AI_CONFIDENCE_LABELS[confidence] || AI_CONFIDENCE_LABELS.low;
}

// Matches backend/src/services/stadtpocketResearchService.js's
// RESEARCH_STATUS values exactly -- see that file's own header comment.
// 'ok' has no message (the review screen simply has no warning banner).
const AI_RESEARCH_STATUS_MESSAGES = {
  partial: 'Einige Informationen konnten nicht verifiziert werden.',
  'no-source': 'Für diese Recherche wurde keine Website angegeben — es konnten keine öffentlichen Quellen geprüft werden.',
  'website-rejected': 'Diese Website kann aus Sicherheitsgründen nicht für die Recherche verwendet werden.',
  'website-unreachable': 'Die Website konnte nicht erreicht werden.',
  'provider-unavailable': 'Die KI-Recherche ist momentan nicht verfügbar. Bitte später erneut versuchen.',
  'malformed-output': 'Die Recherche konnte nicht ausgewertet werden. Bitte später erneut versuchen.',
};

function getResearchStatusMessage(researchStatus) {
  return AI_RESEARCH_STATUS_MESSAGES[researchStatus] || null;
}

// Matches stadtpocketDuplicateService.js's STATUS values exactly.
const AI_DUPLICATE_STATUS_UI = {
  NEW: { type: 'success', message: '✓ Kein vorhandener Eintrag gefunden' },
  POSSIBLE_MATCH: { type: 'error', message: 'Möglicher vorhandener Eintrag' },
  ALREADY_DRAFT: { type: 'error', message: 'Dieses Unternehmen scheint bereits als Entwurf vorhanden zu sein.' },
  ALREADY_PUBLISHED: { type: 'error', message: 'Dieses Unternehmen scheint bereits veröffentlicht zu sein.' },
};

function getDuplicateStatusUI(duplicateStatus) {
  return AI_DUPLICATE_STATUS_UI[duplicateStatus] || AI_DUPLICATE_STATUS_UI.POSSIBLE_MATCH;
}

// Fields a "create draft" action would eventually be allowed to
// proceed from -- ALREADY_DRAFT/ALREADY_PUBLISHED must disable it
// (see stadtpocket-admin.html's renderAiResearchReview).
function isDuplicateBlocking(duplicateStatus) {
  return duplicateStatus === 'ALREADY_DRAFT' || duplicateStatus === 'ALREADY_PUBLISHED';
}

// ── Phase 1D — AI research result → real StadtPocket draft ─────────
// Pure logic behind "Als Entwurf erstellen": what's allowed to create a
// draft, and exactly what gets sent to the EXISTING
// initializeDraft/saveDraft write path. Nothing here calls api()/fetch
// or touches the DOM -- see stadtpocket-admin.html's
// createDraftFromAiResearch() for the orchestration that calls these.

// Only a NEW candidate may create a draft -- POSSIBLE_MATCH/
// ALREADY_DRAFT/ALREADY_PUBLISHED all block it (§8 of the Phase 1D
// task). Never trusted from the DOM's disabled attribute alone --
// stadtpocket-admin.html re-checks this exact function again inside
// createDraftFromAiResearch() itself before ever calling the API.
function duplicateAllowsDraftCreation(duplicateStatus) {
  return duplicateStatus === 'NEW';
}

// The four fields initializeDraft() requires (see
// stadtpocketManagerService.js) -- a draft cannot be created at all
// without them, AI-assisted or manual.
const AI_REQUIRED_DRAFT_FIELDS = [
  ['name', 'Unternehmensname'],
  ['category', 'Kategorie'],
  ['shortDescription', 'Kurzbeschreibung'],
  ['address', 'Adresse'],
];

function getMissingRequiredFieldsForDraft(editable) {
  const e = editable || {};
  return AI_REQUIRED_DRAFT_FIELDS.filter(([key]) => !(e[key] && String(e[key]).trim())).map(([, label]) => label);
}

// The single source of truth for whether the SINGLE-location "Als
// Entwurf erstellen" button may run -- re-checked by
// createDraftFromAiResearch() itself before ever calling the API, same
// as every other gate in this file -- never trusted from the button's
// disabled attribute alone. Multi-location candidates use their own,
// separate gate -- canCreateMultiLocationDraft, further below -- since
// creating a multi-location draft is a different action entirely (see
// that function's own header comment for the Phase 1G.1 correction).
function canCreateDraftFromCandidate(candidate, editable) {
  const c = candidate || {};
  const duplicateStatus = c.duplicate ? c.duplicate.status : null;
  if (!duplicateAllowsDraftCreation(duplicateStatus)) return false;
  return getMissingRequiredFieldsForDraft(editable).length === 0;
}

// Exactly the payload initializeDraft's route accepts -- trimmed, and
// nothing else (that route rejects any unexpected key). Uses the
// Admin's EDITED values (aiResearchState.editable), never the original
// AI response directly -- the human-reviewed value always wins.
function buildInitializeDraftPayload(editable) {
  const e = editable || {};
  return {
    name: String(e.name || '').trim(),
    category: String(e.category || '').trim(),
    shortDescription: String(e.shortDescription || '').trim(),
    address: String(e.address || '').trim(),
  };
}

// Deterministic, lossless-enough parse of the comma-joined display
// string extractEditableFieldsFromCandidate() itself produces from a
// real tags array -- a plain split/trim, never an LLM, never
// ambiguous. Safe to apply whether the Admin edited the text or not.
function parseTagsInput(tagsString) {
  if (typeof tagsString !== 'string' || !tagsString.trim()) return [];
  return tagsString.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Builds the PUT .../draft payload for optional-field enrichment,
 * called only after initializeDraft has already succeeded. Only ever
 * includes a key when there is a genuine, safely-persistable value.
 *
 * hours/coordinates are the one real hazard here: their editable form
 * is a free-text display string (formatHoursForDisplay()'s joined
 * lines, or "lat, lng"), and there is no safe deterministic parser back
 * to the exact structured shape saveDraft's checkHours/checkLatitude/
 * checkLongitude validators expect once that text has been genuinely
 * edited -- and this file must never let an LLM "reinterpret" it either
 * (Phase 1D §5/§6). So: if the Admin left the field exactly as
 * originally researched (`editable[key] === originalEditable[key]`),
 * the untouched STRUCTURED value from the candidate is persisted
 * as-is; if it was edited, the field is skipped entirely and reported
 * back via `skipped` rather than silently saving a malformed or
 * invented value -- the Admin fills it in manually in the real editor
 * afterward.
 *
 * `originalEditable` must be a fresh call to
 * extractEditableFieldsFromCandidate(candidate) -- i.e. what the field
 * looked like immediately after research, before any Admin edit.
 */
function buildEnrichmentDraftPayload(editable, originalEditable, candidateFields) {
  const e = editable || {};
  const orig = originalEditable || {};
  const fields = candidateFields || {};
  const payload = {};
  const skipped = [];

  if (e.subCategory && e.subCategory.trim()) payload.subCategory = e.subCategory.trim();
  if (e.longDescription && e.longDescription.trim()) payload.longDescription = e.longDescription.trim();
  if (e.phone && e.phone.trim()) payload.phone = e.phone.trim();
  if (e.website && e.website.trim()) payload.website = e.website.trim();

  if (typeof e.tags === 'string' && e.tags.trim()) {
    const tags = parseTagsInput(e.tags);
    if (tags.length) payload.tags = tags;
  }

  if ('hours' in fields) {
    if (e.hours === orig.hours) payload.hours = fields.hours.value;
    else skipped.push('Öffnungszeiten');
  }
  if ('coordinates' in fields) {
    if (e.coordinates === orig.coordinates) {
      payload.latitude = fields.coordinates.value.lat;
      payload.longitude = fields.coordinates.value.lng;
    } else {
      skipped.push('Koordinaten');
    }
  }

  return { payload, skipped };
}

// Display order + German labels for every field the real StadtPocket
// listing contract supports (matches stadtpocketAiExtractionService.js's
// FIELD_VALIDATORS keys, minus headerImageCandidateUrl -- that one is
// rendered separately, never in this field list, see §9 of the task).
const AI_FIELD_DISPLAY_ORDER = [
  ['name', 'Unternehmensname'],
  ['category', 'Kategorie'],
  ['subCategory', 'Unterkategorie'],
  ['tags', 'Tags'],
  ['shortDescription', 'Kurzbeschreibung'],
  ['longDescription', 'Beschreibung'],
  ['address', 'Adresse'],
  ['phone', 'Telefon'],
  ['website', 'Website'],
  ['hours', 'Öffnungszeiten'],
  ['coordinates', 'Koordinaten'],
];

const AI_DAY_KEYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const AI_DAY_FULL = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };

/**
 * Turns the { day, closed? | intervals? }[] hours contract into
 * human-readable display lines, collapsing consecutive days that share
 * the exact same schedule into a range (e.g. "Dienstag–Freitag
 * 11:30–23:00"), and combining every closed day into one trailing
 * "Montag/Sonntag geschlossen" line regardless of adjacency (closed
 * days are rarely contiguous in real opening hours, and reading them
 * combined is clearer than several scattered single-day lines). A day
 * absent from the input is simply not rendered -- never guessed.
 */
function formatHoursForDisplay(hours) {
  if (!Array.isArray(hours) || !hours.length) return [];
  const byDay = {};
  hours.forEach((h) => { if (h && h.day) byDay[h.day] = h; });

  const closedDays = [];
  const segments = [];
  let i = 0;
  while (i < AI_DAY_KEYS.length) {
    const day = AI_DAY_KEYS[i];
    const entry = byDay[day];
    if (!entry) { i += 1; continue; }
    if (entry.closed) {
      closedDays.push(day);
      i += 1;
      continue;
    }
    const label = (entry.intervals || []).map((iv) => `${iv.open}–${iv.close}`).join(', ');
    let j = i + 1;
    while (j < AI_DAY_KEYS.length) {
      const next = byDay[AI_DAY_KEYS[j]];
      if (!next || next.closed) break;
      const nextLabel = (next.intervals || []).map((iv) => `${iv.open}–${iv.close}`).join(', ');
      if (nextLabel !== label) break;
      j += 1;
    }
    const span = AI_DAY_KEYS.slice(i, j);
    const dayRange = span.length === 1 ? AI_DAY_FULL[span[0]] : `${AI_DAY_FULL[span[0]]}–${AI_DAY_FULL[span[span.length - 1]]}`;
    segments.push(`${dayRange} ${label}`);
    i = j;
  }
  if (closedDays.length) segments.push(`${closedDays.map((d) => AI_DAY_FULL[d]).join('/')} geschlossen`);
  return segments;
}

/**
 * Validates the research form's own input before it is ever sent --
 * mirrors the backend's own StadtpocketResearchError rule (at least one
 * of businessName/websiteUrl) so the Admin gets an immediate, honest
 * message instead of a round-trip 400. The backend re-validates this
 * independently regardless -- this is a UX convenience only, never the
 * source of truth.
 */
function validateAiResearchInput(businessName, websiteUrl) {
  const name = String(businessName || '').trim();
  const url = String(websiteUrl || '').trim();
  if (!name && !url) {
    return { valid: false, error: 'Bitte Unternehmensname oder Website angeben.' };
  }
  return { valid: true, error: null };
}

/**
 * Builds the exact POST body stadtpocket-admin.html sends to
 * /manager/stadtpocket/listings/:locationId/research -- trimmed,
 * empty-string fields omitted entirely (never sent as ""), matching
 * stadtpocketResearchService.js's own validateRequest() expectations.
 * Never includes requestedBy -- that is always server-derived.
 */
function buildAiResearchRequestBody(businessName, websiteUrl) {
  const body = {};
  const name = String(businessName || '').trim();
  const url = String(websiteUrl || '').trim();
  if (name) body.businessName = name;
  if (url) body.websiteUrl = url;
  return body;
}

/**
 * Initializes the in-memory, editable copy of a returned candidate's
 * fields -- plain { fieldName: value } pairs the review screen's inputs
 * bind to. Pure data transform, never touches the DOM and never calls
 * initializeDraft/saveDraft -- see stadtpocket-admin.html's own
 * renderAiResearchReview for how this is used and re-emphasized as
 * in-memory-only.
 */
function extractEditableFieldsFromCandidate(candidate) {
  const editable = {};
  const fields = (candidate && candidate.fields) || {};
  for (const [key] of AI_FIELD_DISPLAY_ORDER) {
    if (!(key in fields)) continue;
    const value = fields[key].value;
    if (key === 'tags' && Array.isArray(value)) {
      editable[key] = value.join(', ');
    } else if (key === 'hours') {
      editable[key] = formatHoursForDisplay(value).join('\n');
    } else if (key === 'coordinates' && value && typeof value === 'object') {
      editable[key] = `${value.lat}, ${value.lng}`;
    } else {
      editable[key] = String(value);
    }
  }
  return editable;
}

// ── Phase 1G.1 — multi-location business model correction ───────────
// A multi-location result (e.g. the real Bäckerei Betz: 8 verified
// branches in Ulm) is ONE proposed business with several locations
// underneath it -- never a "pick one branch to BE the business" choice.
// The earlier Phase 1G single-select design (a picked location's
// address/phone/hours overwriting the parent business proposal) has
// been replaced: the business-level proposal (name/category/
// shortDescription/website/...) stays exactly as researched regardless
// of which locations are included, and every verified city-relevant
// location is INCLUDED BY DEFAULT -- the Admin may deselect a bad one,
// never has to hand-pick one true location out of several correct ones.

// All location indices included by default -- the Admin's job is to
// review and optionally EXCLUDE a bad one, never to pick exactly one.
function defaultIncludedLocationIndices(candidate) {
  const locations = (candidate && candidate.locations) || [];
  return new Set(locations.map((_, i) => i));
}

function getIncludedLocations(candidate, includedIndices) {
  const locations = (candidate && candidate.locations) || [];
  const included = includedIndices || new Set();
  return locations.filter((_, i) => included.has(i));
}

// Business-level required fields for a MULTI-location draft -- "address"
// is deliberately absent: address is a per-location fact now, never a
// single overwritten value on the parent business. The existing
// AI_REQUIRED_DRAFT_FIELDS (name/category/shortDescription/address) is
// untouched and still governs the single-location flow exactly as
// before.
const AI_REQUIRED_BRAND_FIELDS = [
  ['name', 'Unternehmensname'],
  ['category', 'Kategorie'],
  ['shortDescription', 'Kurzbeschreibung'],
];

function getMissingRequiredBrandFields(editable) {
  const e = editable || {};
  return AI_REQUIRED_BRAND_FIELDS.filter(([key]) => !(e[key] && String(e[key]).trim())).map(([, label]) => label);
}

/**
 * The single source of truth for whether "Entwurf mit N Standorten
 * erstellen" may run. Re-checked by createMultiLocationDraftFromAiResearch()
 * itself before ever calling the API, same as every other gate in this
 * file -- never trusted from the button's disabled attribute alone.
 */
function canCreateMultiLocationDraft(candidate, editable, includedIndices) {
  const c = candidate || {};
  const duplicateStatus = c.duplicate ? c.duplicate.status : null;
  if (!duplicateAllowsDraftCreation(duplicateStatus)) return false;
  if (getMissingRequiredBrandFields(editable).length) return false;
  return !!(includedIndices && includedIndices.size > 0);
}

/**
 * Builds the exact POST body for .../research/draft-multi: ONE business
 * (name/category/shortDescription, plus optional subCategory/tags/
 * longDescription when present) plus the INCLUDED locations only.
 * Never sends an excluded location. The brand's researched website (a
 * top-level candidate field, not part of any one location) is applied
 * to every included location, matching how website is already modeled
 * at the schema level (StadtPocketListingLocation.website, per-
 * storefront) -- exactly like an ordinary single-location draft already
 * carries its own website value.
 */
function buildMultiLocationInitPayload(editable, candidate, includedIndices) {
  const e = editable || {};
  const c = candidate || {};
  const brandWebsite = c.fields && c.fields.website && c.fields.website.value;

  const listing = {
    name: String(e.name || '').trim(),
    category: String(e.category || '').trim(),
    shortDescription: String(e.shortDescription || '').trim(),
  };
  if (e.subCategory && e.subCategory.trim()) listing.subCategory = e.subCategory.trim();
  if (e.longDescription && e.longDescription.trim()) listing.longDescription = e.longDescription.trim();
  if (typeof e.tags === 'string' && e.tags.trim()) {
    const tags = parseTagsInput(e.tags);
    if (tags.length) listing.tags = tags;
  }

  const locations = getIncludedLocations(c, includedIndices).map((loc) => {
    const entry = { address: loc.address };
    if (loc.phone) entry.phone = loc.phone;
    if (loc.hours) entry.hours = loc.hours;
    if (brandWebsite) entry.website = brandWebsite;
    return entry;
  });

  return { listing, locations };
}

// ── Phase 1E follow-up — research submission failure messages ──────
// Pure classification of a thrown fetch()/AbortController error into
// the exact honest German message to show. AbortError is what both a
// genuine user-triggered abort AND our own client-side research
// timeout look like (fetch's AbortController always throws this exact
// error name on abort, regardless of who called .abort()) -- there is
// no reliable way to distinguish them further, so both read as "took
// too long," which is accurate either way.
const AI_RESEARCH_TIMEOUT_MESSAGE = 'Die Recherche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
const AI_RESEARCH_NETWORK_ERROR_MESSAGE = 'Die Verbindung ist fehlgeschlagen. Bitte versuchen Sie es erneut.';

function getAiResearchFailureMessage(err) {
  if (err && err.name === 'AbortError') return AI_RESEARCH_TIMEOUT_MESSAGE;
  return AI_RESEARCH_NETWORK_ERROR_MESSAGE;
}

// ── Phase 1H.3 -- AI Business Discovery ("Unternehmen mit KI finden") ──
// Calls the Phase 1H.2 backend (POST .../discover), never Google
// directly and never Anthropic/Firecrawl. Kept separate from
// AI_DUPLICATE_STATUS_UI above -- that map is full-sentence status
// messages for the single-business research review screen; discovery
// needs short, per-candidate list labels with exact wording specified
// for this screen.
const AI_DISCOVERY_DUPLICATE_LABELS = {
  NEW: 'Neu',
  POSSIBLE_MATCH: 'Möglicher Treffer',
  ALREADY_DRAFT: 'Bereits als Entwurf vorhanden',
  ALREADY_PUBLISHED: 'Bereits in StadtPocket',
};

function getDiscoveryDuplicateLabel(duplicateStatus) {
  return AI_DISCOVERY_DUPLICATE_LABELS[duplicateStatus] || AI_DISCOVERY_DUPLICATE_LABELS.POSSIBLE_MATCH;
}

// Only a genuinely NEW candidate starts checked -- a possible or
// definite match against an existing StadtPocket record must never be
// pre-selected as if it were new.
function isDiscoveryCandidateSelectedByDefault(duplicateStatus) {
  return duplicateStatus === 'NEW';
}

const AI_DISCOVERY_DEFAULT_QUANTITY = 10;
const AI_DISCOVERY_MIN_QUANTITY = 1;
const AI_DISCOVERY_MAX_QUANTITY = 20;

// Matches stadtpocketDiscoveryService.js's own validateCategory/
// validateQuantity rules -- a client-side mirror so the Admin gets an
// immediate, honest error instead of a round-trip 400, but the backend
// remains the actual authority (never trusted to be bypassed).
function validateAiDiscoveryInput(category, quantity) {
  if (typeof category !== 'string' || !category.trim()) {
    return { valid: false, error: 'Bitte eine Kategorie angeben.' };
  }
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < AI_DISCOVERY_MIN_QUANTITY || q > AI_DISCOVERY_MAX_QUANTITY) {
    return { valid: false, error: `Die Anzahl muss zwischen ${AI_DISCOVERY_MIN_QUANTITY} und ${AI_DISCOVERY_MAX_QUANTITY} liegen.` };
  }
  return { valid: true };
}

function buildAiDiscoveryRequestBody(category, quantity) {
  return { category: category.trim(), quantity: Number(quantity) };
}

// Matches stadtpocketDiscoveryService.js's PROVIDER_STATUS values.
// 'ok' has no message (the results screen renders candidates/empty
// state directly, no warning banner needed).
const AI_DISCOVERY_PROVIDER_STATUS_MESSAGES = {
  'provider-not-configured': 'Die Unternehmenssuche ist derzeit nicht konfiguriert. Bitte den Administrator kontaktieren.',
  'provider-unavailable': 'Die Unternehmenssuche ist momentan nicht verfügbar. Bitte später erneut versuchen.',
};

function getAiDiscoveryProviderStatusMessage(status) {
  return AI_DISCOVERY_PROVIDER_STATUS_MESSAGES[status] || null;
}

// ── Phase 1H.4 -- Selected Businesses -> AI Preparation Pipeline ────
// Sequential batch orchestrator: takes the candidates the Admin
// selected on the discovery-results screen and runs the EXISTING
// single-business research call (via the injected `researchFn`) for
// each one, ONE AT A TIME -- never Promise.all, never concurrent
// Firecrawl/Anthropic calls. This is deliberately the ONLY place that
// "does" batch research; stadtpocket-admin.html's own
// prepResearchOneCandidate() is the sole I/O boundary it calls through
// (POST .../research, the exact endpoint the single-business "Mit KI
// hinzufügen" flow already uses) -- there is no second research engine
// here, only orchestration of the existing one.
//
// A failure on one candidate is caught here and recorded as that
// candidate's own 'failed' result; it is NEVER allowed to reject the
// overall promise or stop the remaining candidates from being
// processed -- see the try/catch inside the loop. `onProgress(results,
// index)` is called after every status transition so a DOM caller can
// re-render incrementally (the exact "1 von 5 -- wird recherchiert...,
// then ✓ bereit..." progress this phase's UI requires) -- purely
// optional and never required for correctness, so this function stays
// trivially testable with no DOM at all.
//
// Each result's `status` models the lifecycle this phase specifies
// (DISCOVERED -> PREPARING -> READY_FOR_REVIEW, or a controlled
// failure) as the lowercase values this codebase already uses
// elsewhere (e.g. publicationStatus): 'pending' -> 'preparing' ->
// 'ready' | 'failed'. Nothing here ever writes to a database or marks
// anything published -- researchCandidate is the exact same transient
// candidate object POST .../research already returns; a draft is only
// ever created later by the EXISTING, unmodified research/draft flow,
// via an explicit human action.
async function runSequentialPreparation(candidates, researchFn, onProgress) {
  const results = (candidates || []).map((c) => ({
    sourceId: c.sourceId,
    name: c.name,
    website: c.website || null,
    status: 'pending',
    researchCandidate: null,
    error: null,
    draftCreated: false,
  }));
  const notify = typeof onProgress === 'function' ? onProgress : () => {};
  notify(results, -1);
  for (let i = 0; i < results.length; i += 1) {
    results[i].status = 'preparing';
    results[i].error = null;
    notify(results, i);
    try {
      // eslint-disable-next-line no-await-in-loop -- intentional: one
      // candidate at a time is the explicit Phase 1H.4 requirement.
      results[i].researchCandidate = await researchFn(results[i]);
      results[i].status = 'ready';
    } catch (err) {
      results[i].status = 'failed';
      results[i].error = (err && err.message) || 'Recherche fehlgeschlagen.';
    }
    notify(results, i);
  }
  return results;
}

// A "ready" result that already produced a draft (draftCreated: true)
// is excluded -- once a human has acted on it, it no longer belongs in
// the review queue. Order-preserving: index N in the returned array is
// always a later-or-equal position in `results` than index N-1.
function getPrepReadyResultIndices(results) {
  const indices = [];
  (results || []).forEach((r, i) => {
    if (r.status === 'ready' && !r.draftCreated) indices.push(i);
  });
  return indices;
}

// Phase 1H.4.2 -- readyCount is unchanged (ready & not yet drafted);
// reviewedCount/toReviewCount split that same set by whether the Admin
// has actually opened and navigated away from that business's review
// (result.reviewed -- set only by markCurrentBatchResultReviewed(), see
// stadtpocket-admin.html, never merely because research finished).
// readyCount === reviewedCount + toReviewCount always holds.
function getPrepSummary(results) {
  const rows = results || [];
  const readyRows = rows.filter((r) => r.status === 'ready' && !r.draftCreated);
  return {
    total: rows.length,
    readyCount: readyRows.length,
    reviewedCount: readyRows.filter((r) => r.reviewed).length,
    toReviewCount: readyRows.filter((r) => !r.reviewed).length,
    draftedCount: rows.filter((r) => r.draftCreated).length,
    failedCount: rows.filter((r) => r.status === 'failed').length,
    pendingCount: rows.filter((r) => r.status === 'pending' || r.status === 'preparing').length,
  };
}

// Phase 1H.4.1 -- a prepared candidate whose research genuinely found
// no usable evidence (no website reachable/provided, provider outage,
// unparseable output, ...) completed WITHOUT throwing -- its own
// 'status' is correctly 'ready' (it IS reviewable, human review is
// still mandatory and still possible). But the progress list must
// never show that as a plain, undifferentiated "✓ Bereit zur Prüfung"
// success checkmark, which would misleadingly read as "a real business
// was researched" when nothing useful was actually found. Short labels
// here (distinct from AI_RESEARCH_STATUS_MESSAGES' longer sentences,
// which still show inside the review screen itself, unchanged) --
// used ONLY for this one-line progress row.
const AI_PREP_NO_EVIDENCE_STATUS_LABELS = {
  'no-source': 'Keine Quelle gefunden',
  'website-rejected': 'Website abgelehnt',
  'website-unreachable': 'Website nicht erreichbar',
  'provider-unavailable': 'Recherche nicht verfügbar',
  'malformed-output': 'Recherche fehlgeschlagen',
};

// Returns { text, tone } for one queue-row status. tone is one of
// 'success' | 'warning' | 'danger' | 'muted' -- a pure display decision,
// no DOM access, so the exact same logic renders correctly in a test
// and in the real page.
//
// Phase 1H.4.2 review-state model (READY / REVIEWED / DRAFT_CREATED,
// plus the pre-existing no-evidence/failed states): priority order is
// draftCreated > no-evidence-found > reviewed > plain ready. A
// no-evidence result keeps showing its honest label even after review
// -- that fact stays relevant and is never masked by "Geprüft" once
// the Admin has looked at it. 'reviewed' is only ever set by an
// explicit navigate-away-from-review action (see
// markCurrentBatchResultReviewed in stadtpocket-admin.html) -- it is
// NEVER set just because research completed.
function getPrepRowStatusLabel(result) {
  if (!result) return { text: '', tone: 'muted' };
  if (result.draftCreated) return { text: 'Entwurf erstellt', tone: 'success' };
  if (result.status === 'pending') return { text: 'Wartet…', tone: 'muted' };
  if (result.status === 'preparing') return { text: 'Wird recherchiert…', tone: 'muted' };
  if (result.status === 'failed') return { text: 'Recherche nicht abgeschlossen', tone: 'danger' };
  if (result.status === 'ready') {
    const researchStatus = result.researchCandidate && result.researchCandidate.researchStatus;
    const noEvidenceLabel = researchStatus && AI_PREP_NO_EVIDENCE_STATUS_LABELS[researchStatus];
    if (noEvidenceLabel) return { text: noEvidenceLabel, tone: 'warning' };
    if (result.reviewed) return { text: 'Geprüft', tone: 'success' };
    return { text: 'Bereit zur Prüfung', tone: 'success' };
  }
  return { text: '', tone: 'muted' };
}

// ── Phase 1H.4.3 -- BILD (hero/cover image) selection ───────────────
// This image is the StadtPocket business HERO/COVER image (the
// existing StadtPocketListing.headerImage field) -- explicitly NOT the
// business logo, a separate, untouched concept this phase does not
// introduce or change.
//
// heroImage shape: { candidates: [{url, sourceUrl}], selected: null |
// {source:'website', url, sourceUrl} | {source:'upload', file,
// previewUrl}, discovering: bool }. Every function below is pure
// (returns a new object, never mutates its input) so the exact same
// logic is directly testable and used by the real page.

// Seeds the initial BILD state from a Phase 1G research result.
// Preserves the EXISTING single-candidate behavior unchanged (a found
// headerImageCandidate starts pre-selected, exactly like before this
// phase -- e.g. TopFit) while also handling the case that exposed the
// bug (no candidate at all, e.g. Kieser Ulm) with an honest empty
// state instead of hiding the section.
function seedHeroImageFromCandidate(candidate) {
  const hic = candidate && candidate.headerImageCandidate;
  if (hic && hic.value && hic.value.url) {
    const entry = { url: hic.value.url, sourceUrl: hic.sourceUrl || null };
    return { candidates: [entry], selected: { source: 'website', ...entry }, discovering: false };
  }
  return { candidates: [], selected: null, discovering: false };
}

// Adds newly-discovered candidates to the existing list, deduped by
// URL -- never replaces or reorders what's already there, and never
// touches `selected` (a newly discovered candidate is never
// auto-selected; the Admin always chooses explicitly).
function mergeHeroImageCandidates(existingCandidates, newCandidates) {
  const existing = existingCandidates || [];
  const seen = new Set(existing.map((c) => c.url));
  const merged = existing.slice();
  for (const c of newCandidates || []) {
    if (!seen.has(c.url)) { seen.add(c.url); merged.push(c); }
  }
  return merged;
}

// Selecting a thumbnail changes ONLY the selected image -- the
// candidate list (and every other candidate in it) is untouched, so
// switching back and forth between candidates never loses any of them.
function selectHeroImageCandidate(heroImage, url) {
  const found = (heroImage.candidates || []).find((c) => c.url === url);
  if (!found) return heroImage;
  return { ...heroImage, selected: { source: 'website', url: found.url, sourceUrl: found.sourceUrl } };
}

function selectUploadedHeroImage(heroImage, file, previewUrl) {
  return { ...heroImage, selected: { source: 'upload', file, previewUrl } };
}

// "Bild löschen" -- clears the current selection only. The candidate
// list survives (an external website candidate that was never copied
// into our own storage has nothing to delete server-side; see this
// phase's own report for the uploaded-asset case, which is a real
// Cloudinary object created only once draft creation actually runs,
// never before). After this, heroImage.selected is null -- an honest
// "no image selected" state the Admin can pick a new image from.
function clearHeroImageSelection(heroImage) {
  return { ...heroImage, selected: null };
}

// Mirrors the existing HEADER_IMAGE_ALLOWED_TYPES/HEADER_IMAGE_MAX_BYTES
// constants already defined inline in stadtpocket-admin.html (used by
// the business editor's own header-image upload and by Aktuelles'
// update-image upload) -- duplicated here, not imported, since this
// file loads as a plain global <script> before that inline script
// defines them; the values themselves must stay in lockstep with the
// real upload route's own multer config
// (managerStadtpocketListingRoutes.js: HEADER_IMAGE_ALLOWED_MIMETYPES /
// HEADER_IMAGE_MAX_BYTES), which is the actual, authoritative
// server-side limit regardless of what this client-side pre-check says.
const HERO_IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function validateHeroImageUploadFile(file) {
  if (!file) return { valid: false, error: 'Keine Datei ausgewählt.' };
  if (!HERO_IMAGE_ALLOWED_TYPES.includes(file.type)) return { valid: false, error: 'Nur PNG, JPG oder WebP Bilder sind erlaubt.' };
  if (file.size > HERO_IMAGE_MAX_BYTES) return { valid: false, error: 'Die Datei ist zu groß (maximal 5 MB).' };
  return { valid: true };
}

// Isomorphic export: `module` does not exist in a browser <script> tag,
// so this is inert there -- only Node's require() sees it.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AI_CONFIDENCE_LABELS,
    translateConfidence,
    AI_RESEARCH_STATUS_MESSAGES,
    getResearchStatusMessage,
    AI_DUPLICATE_STATUS_UI,
    getDuplicateStatusUI,
    isDuplicateBlocking,
    AI_FIELD_DISPLAY_ORDER,
    formatHoursForDisplay,
    validateAiResearchInput,
    buildAiResearchRequestBody,
    extractEditableFieldsFromCandidate,
    duplicateAllowsDraftCreation,
    AI_REQUIRED_DRAFT_FIELDS,
    getMissingRequiredFieldsForDraft,
    buildInitializeDraftPayload,
    parseTagsInput,
    buildEnrichmentDraftPayload,
    AI_RESEARCH_TIMEOUT_MESSAGE,
    AI_RESEARCH_NETWORK_ERROR_MESSAGE,
    getAiResearchFailureMessage,
    canCreateDraftFromCandidate,
    defaultIncludedLocationIndices,
    getIncludedLocations,
    AI_REQUIRED_BRAND_FIELDS,
    getMissingRequiredBrandFields,
    canCreateMultiLocationDraft,
    buildMultiLocationInitPayload,
    AI_DISCOVERY_DUPLICATE_LABELS,
    getDiscoveryDuplicateLabel,
    isDiscoveryCandidateSelectedByDefault,
    AI_DISCOVERY_DEFAULT_QUANTITY,
    AI_DISCOVERY_MIN_QUANTITY,
    AI_DISCOVERY_MAX_QUANTITY,
    validateAiDiscoveryInput,
    buildAiDiscoveryRequestBody,
    AI_DISCOVERY_PROVIDER_STATUS_MESSAGES,
    getAiDiscoveryProviderStatusMessage,
    runSequentialPreparation,
    getPrepReadyResultIndices,
    getPrepSummary,
    AI_PREP_NO_EVIDENCE_STATUS_LABELS,
    getPrepRowStatusLabel,
    seedHeroImageFromCandidate,
    mergeHeroImageCandidates,
    selectHeroImageCandidate,
    selectUploadedHeroImage,
    clearHeroImageSelection,
    HERO_IMAGE_ALLOWED_TYPES,
    HERO_IMAGE_MAX_BYTES,
    validateHeroImageUploadFile,
  };
}
