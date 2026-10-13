/**
 * lpVoiceController.js — the editor's Voice Welcome audio preview.
 * ─────────────────────────────────────────────────────────────
 * POST /lp/voice/preview/:slug          (requireAuth, owner of the page)
 *   body: { language: 'en'|'de', text?: string, generate?: boolean,
 *           enabled?: boolean }
 *
 * Answers with the audio for the greeting the owner is looking at:
 *   - a recording of exactly that greeting already exists (published, or
 *     an earlier preview): its address, no text-to-speech call
 *   - none exists and generate is not true: status 'none' (check only)
 *   - none exists and generate is true: one recording is made, within the
 *     recording limits shared with Publish (voicePreviewLimiter), and
 *     remembered as the page's preview
 *
 * It never changes what visitors hear: published audio is only ever set
 * by Publish (lpVoiceService.ensureVoiceAudio).
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');
const { GREETING_MAX_LENGTH } = require('../data/voiceGreetings');
const voice = require('../services/lpVoiceService');
const { remainingForPage, PREVIEW_LIMITS } = require('../services/voicePreviewLimiter');

async function handleVoicePreview(req, res) {
  try {
    const slug = req.params && req.params.slug;
    const userId = req.userId;
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    if (!slug) return res.status(400).json({ error: 'Missing page.' });
    if (body.language !== 'en' && body.language !== 'de') return res.status(400).json({ error: 'language must be "en" or "de".', code: 'bad_language' });
    if (body.text !== undefined && typeof body.text !== 'string') return res.status(400).json({ error: 'text must be a string.', code: 'bad_text' });
    if (typeof body.text === 'string' && body.text.length > GREETING_MAX_LENGTH * 4) return res.status(400).json({ error: 'The greeting is too long.', code: 'bad_text' });

    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    // Same rule as saving a page: only its owner. A page without an owner
    // has nobody who can be authorized.
    if (!page.userId || page.userId !== userId) return res.status(403).json({ error: 'You do not have access to this page.' });

    const sections = voice.parseSections(page);
    const greeting = voice.previewGreeting(page, { language: body.language, text: body.text });
    // The Voice switch as the owner sees it in the editor right now, if
    // the editor says; otherwise as it is saved.
    const voiceEnabled = typeof body.enabled === 'boolean' ? body.enabled : voice.isVoiceEnabled(sections);
    const base = { ok: true, fingerprint: greeting.fingerprint, lang: greeting.lang, isCustom: greeting.isCustom, voiceEnabled, limit: { perHour: PREVIEW_LIMITS.perPagePerHour, remaining: remainingForPage(slug) } };

    const existing = voice.existingAudioFor(sections, greeting.fingerprint);
    if (existing) return res.json(Object.assign(base, { status: 'ready', audioUrl: existing.audioUrl, source: existing.source }));
    if (body.generate !== true) return res.json(Object.assign(base, { status: 'none' }));

    // Generation is off while Voice Welcome is off; audio that already
    // exists was returned above and can still be played.
    if (!voiceEnabled) return res.status(409).json({ error: 'Voice Welcome is switched off for this page.', code: 'voice_off' });

    // The recording limits are applied where the recording starts
    // (lpVoiceService.record), the same place Publish goes through, so a
    // preview and a Publish draw on the same allowance. Joining a recording
    // of the same greeting that is already being made costs nothing there.
    let audioUrl;
    try {
      audioUrl = await voice.recordPreview(slug, greeting, { userId: page.userId });
    } catch (err) {
      if (err && err.code === 'RECORDING_LIMIT') {
        res.setHeader && res.setHeader('Retry-After', String(err.retryAfter));
        return res.status(429).json({ error: 'Preview limit reached. Please try again later.', code: 'limit_' + err.scope, retryAfter: err.retryAfter });
      }
      // Staging only: the staging-wide recording ceiling, or its counter
      // could not be verified. Either way nothing was recorded.
      if (err && err.code === 'STAGING_CEILING') {
        return res.status(429).json({ error: 'Staging audio limit reached. No more audio is generated on staging.', code: 'staging_ceiling' });
      }
      console.error('[Voice] Preview failed for', slug + ':', err && err.message);
      return res.status(502).json({ error: 'The audio could not be generated. Please try again.', code: 'generation_failed' });
    }
    base.limit.remaining = remainingForPage(slug);
    return res.json(Object.assign(base, { status: 'ready', audioUrl, source: 'generated' }));
  } catch (err) {
    console.error('[Voice] Preview error:', err && err.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}

module.exports = { handleVoicePreview };
