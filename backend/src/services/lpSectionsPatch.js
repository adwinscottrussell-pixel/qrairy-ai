/**
 * lpSectionsPatch.js — change ONE thing in a landing page's `sections`
 * without overwriting anything saved in the meantime.
 * ─────────────────────────────────────────────────────────────
 * LandingPage.sections is a single JSON string holding everything the
 * owner edits (hero, voice, buttons, theme, ...). Background jobs that
 * take seconds -- generating the welcome audio is the case this was
 * written for -- used to read that string, wait for the external call,
 * and then write their old copy back with one field added. Any edit the
 * owner saved while the job was waiting was silently lost.
 *
 * patchLandingPageSections() reads the row fresh, applies a small
 * change to what is there NOW, and writes only if the row has not been
 * touched since that read (compare-and-swap on updatedAt). If it has,
 * it starts over from the newer state. The caller's change is therefore
 * always applied on top of the latest saved edits, never instead of
 * them.
 * ─────────────────────────────────────────────────────────────
 */

const prisma = require('../utils/prismaClient');

// `change(sections, page)` receives the current sections object and may
// modify and return it. Returning null/undefined/false means "nothing to
// do" and nothing is written.
//
// Resolves to { applied: true, sections } once written, or
// { applied: false, reason } when there was nothing to write to or the
// page kept changing for every attempt -- in which case the page is left
// exactly as its owner last saved it.
async function patchLandingPageSections(slug, change, { attempts = 5 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) return { applied: false, reason: 'not_found' };

    let sections = {};
    if (page.sections) {
      // Unreadable sections are left alone rather than replaced by a
      // near-empty object carrying only this patch.
      try { sections = JSON.parse(page.sections); } catch (_) { return { applied: false, reason: 'unreadable_sections' }; }
      if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return { applied: false, reason: 'unreadable_sections' };
    }

    const next = change(sections, page);
    if (!next) return { applied: false, reason: 'no_change' };

    // Only this exact version of the row is replaced. Every Prisma write to
    // a LandingPage moves updatedAt, so a save (or anything else) that
    // landed after the read above makes this match nothing.
    const result = await prisma.landingPage.updateMany({
      where: { slug, updatedAt: page.updatedAt },
      data: { sections: JSON.stringify(next) },
    });
    if (result && result.count === 1) return { applied: true, sections: next };
  }
  return { applied: false, reason: 'conflict' };
}

// Records a freshly generated welcome-audio URL. Touches voice.audioUrl
// and nothing else.
function setVoiceAudioUrl(slug, audioUrl) {
  return patchLandingPageSections(slug, (sections) => {
    sections.voice = Object.assign({}, sections.voice || {}, { audioUrl });
    return sections;
  });
}

module.exports = { patchLandingPageSections, setVoiceAudioUrl };
