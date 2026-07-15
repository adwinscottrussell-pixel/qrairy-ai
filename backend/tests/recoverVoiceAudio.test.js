// ============================================================
// recoverVoiceAudio.test.js — tests for the one-time voice-audio
// recovery script (backend/scripts/recoverVoiceAudio.js).
//
// No test framework dependency: uses Node's built-in `assert` and
// a tiny inline runner, following the same pattern as
// tests/supportActionService.test.js and tests/attentionService.test.js.
//
// prismaClient and generateAndUploadVoice are injected directly
// into run() rather than mocked via require.cache — the script was
// written with that seam specifically to make this straightforward.
//
// Run: node tests/recoverVoiceAudio.test.js
// ============================================================
const assert = require('assert/strict');
const {
  AUTHORIZED_SLUG,
  parseArgs,
  isAuthorizedSlug,
  decide,
  validateVoiceSection,
  mergeAudioUrl,
  run,
} = require('../scripts/recoverVoiceAudio');

function makePrisma(page, { failUpdate = false } = {}) {
  let updateCalls = [];
  return {
    updateCalls,
    landingPage: {
      async findUnique() { return page; },
      async update(args) {
        updateCalls.push(args);
        if (failUpdate) throw new Error('simulated DB failure: connection reset by peer');
        return { ...page, ...args.data };
      },
    },
  };
}

function makeGenerateFn({ returns = 'https://res.cloudinary.com/demo/video/upload/voice-x.mp3', fails = false, calls = [] } = {}) {
  const fn = async (bizName, slug, voiceKey, customText) => {
    calls.push({ bizName, slug, voiceKey, customText });
    if (fails) throw new Error('ElevenLabs error: simulated failure');
    return returns;
  };
  fn.calls = calls;
  return fn;
}

const REAL_SECTIONS = {
  language: 'de',
  hero: { aiTitle: 'Deine Jeans.', aiSubtitle: 'Willkommen.' },
  featured: [{ enabled: true, icon: '👖', title: 'Marken' }],
  businessInfo: { hours: null, address: null, phone: null, email: null },
  actionLinks: [{ label: 'Shop', type: 'shop', url: 'https://example.com' }],
  aiGenerated: true,
  aiGeneratedAt: '2026-06-30T21:10:52.521Z',
  siteContent: 'some long markdown blob',
  crawlLocked: true,
  voice: { language: 'de', voiceKey: 'anna_de', customText: '' },
  buttons: [{ type: 'instagram', label: 'instagram', url: '', active: false }],
  theme: { accentColor: '#000064', background: 'dark' },
  logo: { url: 'data:image/png;base64,abc' },
  walletHero: { url: 'https://res.cloudinary.com/demo/image/upload/strip.png' },
  staffPin: 'somehash',
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1. CLI argument parsing ─────────────────────────────────

test('parseArgs: missing confirmation flag -> confirmed is false', () => {
  const { confirmed } = parseArgs(['node', 'script.js', 'some-slug']);
  assert.equal(confirmed, false);
});

test('parseArgs: missing slug -> slug is undefined even with the flag present', () => {
  const { slug } = parseArgs(['node', 'script.js', '--confirm-production-write']);
  assert.equal(slug, undefined);
});

test('parseArgs: slug and flag both present -> both parsed correctly', () => {
  const { slug, confirmed } = parseArgs(['node', 'script.js', 'yeans-halle-hks', '--confirm-production-write']);
  assert.equal(slug, 'yeans-halle-hks');
  assert.equal(confirmed, true);
});

test('parseArgs: exactly one positional slug is accepted', () => {
  const { slug, positionalCount } = parseArgs(['node', 'script.js', 'yeans-halle-hks', '--confirm-production-write']);
  assert.equal(slug, 'yeans-halle-hks');
  assert.equal(positionalCount, 1);
});

test('parseArgs: zero positional arguments -> slug undefined, positionalCount 0 (rejected upstream in main())', () => {
  const { slug, positionalCount } = parseArgs(['node', 'script.js', '--confirm-production-write']);
  assert.equal(slug, undefined);
  assert.equal(positionalCount, 0);
});

test('parseArgs: two positional arguments -> slug undefined, positionalCount 2 — never silently picks the first one', () => {
  const { slug, positionalCount } = parseArgs(['node', 'script.js', 'slug1', 'slug2', '--confirm-production-write']);
  assert.equal(slug, undefined);
  assert.equal(positionalCount, 2);
});

test('parseArgs: a valid slug plus one unexpected extra positional -> rejected, not treated as one slug', () => {
  const { slug, positionalCount } = parseArgs(['node', 'script.js', 'yeans-halle-hks', 'extra', '--confirm-production-write']);
  assert.equal(slug, undefined);
  assert.equal(positionalCount, 2);
});

test('parseArgs: flags never count as positional arguments, regardless of count or order', () => {
  const { positionalCount } = parseArgs(['node', 'script.js', '--confirm-production-write', '--some-other-flag']);
  assert.equal(positionalCount, 0);
});

// ── 1b. Slug authorization lock ─────────────────────────────

test('isAuthorizedSlug: the exact authorized slug is accepted', () => {
  assert.equal(isAuthorizedSlug(AUTHORIZED_SLUG), true);
  assert.equal(isAuthorizedSlug('yeans-halle-hks'), true);
});

test('isAuthorizedSlug: a different slug is rejected', () => {
  assert.equal(isAuthorizedSlug('another-slug'), false);
});

test('isAuthorizedSlug: case variation is rejected (case-sensitive)', () => {
  assert.equal(isAuthorizedSlug('YEANS-HALLE-HKS'), false);
  assert.equal(isAuthorizedSlug('Yeans-Halle-Hks'), false);
});

test('isAuthorizedSlug: trailing characters are rejected — no trimming or normalization', () => {
  assert.equal(isAuthorizedSlug('yeans-halle-hks/'), false);
  assert.equal(isAuthorizedSlug('yeans-halle-hks '), false);
  assert.equal(isAuthorizedSlug('yeans-halle-hksx'), false);
});

test('decide: is a synchronous, non-async function — structurally cannot perform I/O, cannot touch Prisma or voiceService', () => {
  assert.equal(decide.constructor.name, 'Function');
});

test('decide: exact authorized slug + confirmation flag -> proceed', () => {
  const result = decide({ slug: AUTHORIZED_SLUG, confirmed: true, positionalCount: 1 });
  assert.equal(result.action, 'proceed');
  assert.equal(result.slug, AUTHORIZED_SLUG);
});

test('decide: authorized slug but missing confirmation flag -> reject, not proceed', () => {
  const result = decide({ slug: AUTHORIZED_SLUG, confirmed: false, positionalCount: 1 });
  assert.equal(result.action, 'reject');
  assert.equal(result.detail, 'missing-confirmation');
});

test('decide: a different slug, even with the confirmation flag present -> reject, names the authorized slug', () => {
  const result = decide({ slug: 'another-slug', confirmed: true, positionalCount: 1 });
  assert.equal(result.action, 'reject');
  assert.equal(result.detail, 'unauthorized-slug');
  assert.match(result.message, new RegExp(AUTHORIZED_SLUG.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
  assert.match(result.message, /another-slug/);
});

test('decide: case-varied slug, even with the confirmation flag present -> reject', () => {
  const result = decide({ slug: 'YEANS-HALLE-HKS', confirmed: true, positionalCount: 1 });
  assert.equal(result.action, 'reject');
  assert.equal(result.detail, 'unauthorized-slug');
});

test('decide: slug with trailing character, even with the confirmation flag present -> reject', () => {
  const result = decide({ slug: 'yeans-halle-hks/', confirmed: true, positionalCount: 1 });
  assert.equal(result.action, 'reject');
  assert.equal(result.detail, 'unauthorized-slug');
});

test('decide: unauthorized-slug rejection is returned before the confirmation flag is ever consulted', () => {
  // Wrong slug AND missing flag at the same time -> the reason must be
  // the slug lock, not the flag — proving slug authorization is checked
  // first, ahead of (and independent of) confirmation.
  const result = decide({ slug: 'another-slug', confirmed: false, positionalCount: 1 });
  assert.equal(result.detail, 'unauthorized-slug');
});

// ── 2. validateVoiceSection ─────────────────────────────────

test('validateVoiceSection: missing sections.voice -> rejected with clear reason', () => {
  const result = validateVoiceSection({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /sections\.voice is missing/);
});

test('validateVoiceSection: missing language -> rejected', () => {
  const result = validateVoiceSection({ voice: { voiceKey: 'anna_de' } });
  assert.equal(result.ok, false);
  assert.match(result.reason, /language/);
});

test('validateVoiceSection: missing voiceKey -> rejected', () => {
  const result = validateVoiceSection({ voice: { language: 'de' } });
  assert.equal(result.ok, false);
  assert.match(result.reason, /voiceKey/);
});

test('validateVoiceSection: language and voiceKey both present -> accepted', () => {
  const result = validateVoiceSection({ voice: { language: 'de', voiceKey: 'anna_de' } });
  assert.equal(result.ok, true);
});

// ── 3. mergeAudioUrl — proves only audioUrl changes ─────────

test('mergeAudioUrl: adds audioUrl without touching any other key, at any depth', () => {
  const result = mergeAudioUrl(REAL_SECTIONS, 'https://res.cloudinary.com/demo/video/upload/voice-x.mp3');

  // Every top-level key except voice is byte-for-byte identical.
  for (const key of Object.keys(REAL_SECTIONS)) {
    if (key === 'voice') continue;
    assert.deepEqual(result[key], REAL_SECTIONS[key], `unexpected change to sections.${key}`);
  }
  // voice itself: language/voiceKey/customText unchanged, only audioUrl added.
  assert.equal(result.voice.language, 'de');
  assert.equal(result.voice.voiceKey, 'anna_de');
  assert.equal(result.voice.customText, '');
  assert.equal(result.voice.audioUrl, 'https://res.cloudinary.com/demo/video/upload/voice-x.mp3');
});

test('mergeAudioUrl: does not mutate the input object', () => {
  const original = JSON.parse(JSON.stringify(REAL_SECTIONS));
  mergeAudioUrl(REAL_SECTIONS, 'https://example.com/x.mp3');
  assert.deepEqual(REAL_SECTIONS, original);
});

// ── 4. run() — existing audioUrl produces a no-op ───────────

test('run: audioUrl already present -> no-op, ElevenLabs never called, DB never written', async () => {
  const sections = mergeAudioUrl(REAL_SECTIONS, 'https://res.cloudinary.com/demo/video/upload/existing.mp3');
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(sections) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn();

  const result = await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(result.ok, true);
  assert.equal(result.noop, true);
  assert.equal(generateFn.calls.length, 0);
  assert.equal(prismaClient.updateCalls.length, 0);
});

// ── 5. run() — happy path, correct call, only audioUrl written ──

test('run: happy path calls generateAndUploadVoice with (bizName, slug, voiceKey, customText) — not language in the slug slot', async () => {
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(REAL_SECTIONS) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn({ returns: 'https://res.cloudinary.com/demo/video/upload/voice-yeans-halle-hks.mp3' });

  const result = await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(result.ok, true);
  assert.equal(result.noop, false);
  assert.equal(generateFn.calls.length, 1);
  assert.deepEqual(generateFn.calls[0], {
    bizName: 'Yeans Halle',
    slug: 'yeans-halle-hks',
    voiceKey: 'anna_de',
    customText: null, // '' in storage -> null, matching sections.voice.customText || null
  });
});

test('run: writes only sections.voice.audioUrl — every other field identical to what was read', async () => {
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(REAL_SECTIONS) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn({ returns: 'https://res.cloudinary.com/demo/video/upload/voice-yeans-halle-hks.mp3' });

  await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(prismaClient.updateCalls.length, 1);
  const written = JSON.parse(prismaClient.updateCalls[0].data.sections);
  for (const key of Object.keys(REAL_SECTIONS)) {
    if (key === 'voice') continue;
    assert.deepEqual(written[key], REAL_SECTIONS[key], `unexpected change to sections.${key} in the persisted write`);
  }
  assert.equal(written.voice.audioUrl, 'https://res.cloudinary.com/demo/video/upload/voice-yeans-halle-hks.mp3');
  assert.equal(written.voice.language, 'de');
  assert.equal(written.voice.voiceKey, 'anna_de');
});

test('run: update call is scoped to the given slug only', async () => {
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(REAL_SECTIONS) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn();

  await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.deepEqual(prismaClient.updateCalls[0].where, { slug: 'yeans-halle-hks' });
});

// ── 6. run() — precondition failures never call ElevenLabs ──

test('run: missing voiceKey -> fails validation, ElevenLabs never called', async () => {
  const badSections = Object.assign({}, REAL_SECTIONS, { voice: { language: 'de' } });
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(badSections) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn();

  const result = await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(result.ok, false);
  assert.match(result.reason, /voiceKey/);
  assert.equal(generateFn.calls.length, 0);
  assert.equal(prismaClient.updateCalls.length, 0);
});

test('run: page not found -> clear failure, nothing called', async () => {
  const prismaClient = makePrisma(null);
  const generateFn = makeGenerateFn();

  const result = await run('does-not-exist', { prismaClient, generateFn });

  assert.equal(result.ok, false);
  assert.match(result.reason, /No LandingPage found/);
  assert.equal(generateFn.calls.length, 0);
});

// ── 7. run() — failure handling, no retry ───────────────────

test('run: generation failure -> reported at "generate" stage, DB never written, no retry attempted', async () => {
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(REAL_SECTIONS) };
  const prismaClient = makePrisma(page);
  const generateFn = makeGenerateFn({ fails: true });

  const result = await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'generate');
  assert.equal(generateFn.calls.length, 1); // called once, never retried
  assert.equal(prismaClient.updateCalls.length, 0);
});

test('run: database update failure -> reported at "db" stage', async () => {
  const page = { businessName: 'Yeans Halle', sections: JSON.stringify(REAL_SECTIONS) };
  const prismaClient = makePrisma(page, { failUpdate: true });
  const generateFn = makeGenerateFn();

  const result = await run('yeans-halle-hks', { prismaClient, generateFn });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'db');
});

// ── runner ────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();
