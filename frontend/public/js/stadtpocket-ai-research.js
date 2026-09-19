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
  };
}
