#!/usr/bin/env node
// ============================================================
// recoverVoiceAudio.js — one-time voice-audio recovery script.
//
// Generates and persists the missing sections.voice.audioUrl for
// exactly one LandingPage, by slug. Does NOT republish the page,
// does NOT trigger Firecrawl or AI regeneration, does NOT touch
// any sections field other than sections.voice.audioUrl.
//
// This is a standalone, one-off recovery tool — not a permanent
// API endpoint, not a batch/backfill job. It processes exactly
// one slug per invocation and never loops.
//
// Usage:
//   node scripts/recoverVoiceAudio.js <slug> --confirm-production-write
//
// AUTHORIZATION LOCK: this script is authorized for exactly one
// slug — see AUTHORIZED_SLUG below. Any other slug is refused,
// even with a valid single positional argument and the
// confirmation flag present. This is deliberately hard-coded, not
// configurable via a flag or environment variable — the founder
// approval behind this script names one specific page. Extending
// it to another page is a new authorization decision, requiring a
// new, separately-reviewed change to this constant — not a runtime
// option.
//
// Refuses to run unless: exactly one positional argument is given,
// that argument matches AUTHORIZED_SLUG exactly (case-sensitive, no
// trimming/normalization of any kind), and --confirm-production-write
// is present. Rejection happens before Prisma or the voice-generation
// service are ever required — see decide() and main() below.
// ============================================================

// One-time authorization lock. Deliberately not derived from argv,
// env, or any other runtime input — changing the target slug means
// editing this file, which is itself a reviewable, git-tracked change.
const AUTHORIZED_SLUG = 'yeans-halle-hks';

// ── Pure logic — exported for testing. No I/O, no require() calls. ──

function parseArgs(argv) {
  const args = argv.slice(2);
  const confirmed = args.includes('--confirm-production-write');
  const positional = args.filter(a => !a.startsWith('--'));
  const slug = positional.length === 1 ? positional[0] : undefined;
  return { slug, confirmed, positionalCount: positional.length };
}

// Exact, case-sensitive comparison only — no trim(), no toLowerCase(),
// no normalization of any kind. "yeans-halle-hks/" or "YEANS-HALLE-HKS"
// must both fail this check.
function isAuthorizedSlug(slug) {
  return typeof slug === 'string' && slug === AUTHORIZED_SLUG;
}

// Pure decision function: given parsed CLI args, decides whether to
// proceed or reject, and why. Deliberately synchronous and free of
// any reference to Prisma or voiceService — this is what proves
// rejection happens before any service or database operation: this
// function is structurally incapable of initializing either.
function decide(parsed) {
  const { slug, confirmed, positionalCount } = parsed;

  if (positionalCount > 1) {
    return {
      action: 'reject',
      detail: 'batch',
      message: `exactly one slug argument is required — received ${positionalCount}. This script processes exactly one landing page per invocation; it does not support batch mode.`,
    };
  }
  if (!slug) {
    return { action: 'reject', detail: 'missing-slug', message: 'a slug argument is required.' };
  }
  if (!isAuthorizedSlug(slug)) {
    return {
      action: 'reject',
      detail: 'unauthorized-slug',
      message: `this one-time recovery script is authorized only for slug "${AUTHORIZED_SLUG}". Received: "${slug}". No other slug will be processed.`,
    };
  }
  if (!confirmed) {
    return {
      action: 'reject',
      detail: 'missing-confirmation',
      message: 'refusing to run without --confirm-production-write. This script writes to whatever database DATABASE_URL points at. Re-run with the flag once you intend to proceed.',
    };
  }
  return { action: 'proceed', slug };
}

// Validates the stored sections object against the required
// preconditions before any generation is attempted. Never throws.
function validateVoiceSection(sections) {
  if (!sections || typeof sections !== 'object') {
    return { ok: false, reason: 'sections is missing or not an object' };
  }
  if (!sections.voice || typeof sections.voice !== 'object') {
    return { ok: false, reason: 'sections.voice is missing' };
  }
  if (!sections.voice.language) {
    return { ok: false, reason: 'sections.voice.language is missing' };
  }
  if (!sections.voice.voiceKey) {
    return { ok: false, reason: 'sections.voice.voiceKey is missing' };
  }
  return { ok: true };
}

// Merges a newly generated audioUrl into an existing sections
// object without touching anything else. Never mutates the input —
// returns a new object so "what changed" stays provable.
function mergeAudioUrl(sections, audioUrl) {
  return Object.assign({}, sections, {
    voice: Object.assign({}, sections.voice, { audioUrl }),
  });
}

// Host + path only — never the full URL verbatim, in case a query
// string or signed-URL token is ever added to Cloudinary delivery
// URLs in the future.
function summarizeUrl(audioUrl) {
  try {
    const u = new URL(audioUrl);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch (_) {
    return '(unparseable URL — not printed)';
  }
}

// ── Orchestration — the one thing this script does, once authorized ──
// prismaClient and generateFn are required parameters, not defaulted
// from a top-level require — see main() for why.

async function run(slug, { prismaClient, generateFn }) {
  const page = await prismaClient.landingPage.findUnique({ where: { slug } });
  if (!page) {
    return { ok: false, reason: `No LandingPage found for slug "${slug}"` };
  }

  let sections;
  try {
    sections = page.sections ? JSON.parse(page.sections) : {};
  } catch (e) {
    return { ok: false, reason: `sections is not valid JSON: ${e.message}` };
  }

  // Already has audio -> no-op, never call ElevenLabs, never write.
  // Checked before the stricter precondition validation below, since
  // a no-op doesn't need language/voiceKey validated.
  if (sections.voice && sections.voice.audioUrl) {
    return { ok: true, noop: true, reason: 'sections.voice.audioUrl already present — nothing to do' };
  }

  const validation = validateVoiceSection(sections);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  // NOTE ON ARGUMENTS: generateAndUploadVoice()'s real signature
  // (backend/src/services/voiceService.js) is
  //   (bizName, slug, voiceKey, customText)
  // — there is no separate "language" parameter. Language is
  // derived internally from voiceKey via voiceService's VOICES map
  // (each voice key already encodes one language). Passing
  // sections.voice.language positionally here would land in the
  // `slug` argument, which is used to build the Cloudinary
  // public_id (`voice-${slug}`) — that would corrupt the asset name
  // and could collide with another page. sections.voice.language is
  // still validated as a required precondition above; it just isn't
  // a call argument to this function.
  let audioUrl;
  try {
    audioUrl = await generateFn(
      page.businessName,
      slug,
      sections.voice.voiceKey,
      sections.voice.customText || null
    );
  } catch (e) {
    return { ok: false, reason: `Voice generation/upload failed: ${e.message}`, stage: 'generate' };
  }

  const updatedSections = mergeAudioUrl(sections, audioUrl);

  try {
    await prismaClient.landingPage.update({
      where: { slug },
      data: { sections: JSON.stringify(updatedSections) },
    });
  } catch (e) {
    return { ok: false, reason: `Database update failed: ${e.message}`, stage: 'db' };
  }

  return { ok: true, noop: false, audioUrl };
}

// ── CLI entry point ──────────────────────────────────────────

async function main() {
  const parsed = parseArgs(process.argv);
  const decision = decide(parsed);

  if (decision.action === 'reject') {
    console.error(`ERROR: ${decision.message}`);
    console.error('Usage: node scripts/recoverVoiceAudio.js <slug> --confirm-production-write');
    process.exitCode = 1;
    return;
  }

  // Only reached once the slug is exactly AUTHORIZED_SLUG and
  // --confirm-production-write was supplied. Prisma and the
  // voice-generation service (which configures Cloudinary) are
  // required here, lazily, and only now — specifically so that no
  // rejected invocation ever initializes either.
  const prisma = require('../src/utils/prismaClient');
  const { generateAndUploadVoice } = require('../src/services/voiceService');

  console.log(`slug: ${decision.slug}`);

  let result;
  try {
    result = await run(decision.slug, { prismaClient: prisma, generateFn: generateAndUploadVoice });
  } catch (e) {
    console.error(`FAILED: unexpected error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (!result.ok) {
    console.error(`FAILED (${result.stage || 'validation'}): ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log('generation started: no (audioUrl already present)');
    console.log('upload succeeded: n/a');
    console.log('database update succeeded: no (no write needed)');
    console.log('result: no-op, nothing changed');
    return;
  }

  console.log('generation started: yes');
  console.log('upload succeeded: yes');
  console.log('database update succeeded: yes');
  console.log(`resulting URL (host/path only): ${summarizeUrl(result.audioUrl)}`);
  console.log('');
  console.log('Note: this script cannot invalidate the running server\'s in-memory');
  console.log('page cache — it lives inside the Express process\'s own memory, not');
  console.log('reachable from a standalone script. The live page will pick up this');
  console.log('change once its cache entry naturally expires (existing ~60s TTL),');
  console.log('or immediately by requesting the page with the cache-busting query');
  console.log('params the serve route already supports, e.g. ?t=<any-value> or');
  console.log('?preview=1 — no new cache mechanism was added for this.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('UNEXPECTED ERROR:', err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  AUTHORIZED_SLUG,
  parseArgs,
  isAuthorizedSlug,
  decide,
  validateVoiceSection,
  mergeAudioUrl,
  summarizeUrl,
  run,
};
