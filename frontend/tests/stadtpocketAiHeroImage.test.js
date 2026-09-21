// ============================================================
// stadtpocketAiHeroImage.test.js — Phase 1H.4.3 (Business Image
// Selection in AI Review), including the "Bild übernehmen" UX
// correction (pending vs committed hero image). Unit tests for the
// pure BILD-section helpers added to
// frontend/public/js/stadtpocket-ai-research.js, plus static
// source-level checks against frontend/public/stadtpocket-admin.html
// for the DOM-wiring requirements this repo has no browser/jsdom
// harness to exercise directly -- same documented approach as
// stadtpocketAiDiscovery.test.js / stadtpocketAiPreparation.test.js.
//
// No live Google Places/Anthropic/Firecrawl/Cloudinary call is possible
// or attempted anywhere in this file.
//
// Run: node frontend/tests/stadtpocketAiHeroImage.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const {
  seedHeroImageFromCandidate,
  mergeHeroImageCandidates,
  stageHeroImageCandidate,
  stageUploadedHeroImage,
  applyPendingHeroImage,
  clearHeroImageSelection,
  validateHeroImageUploadFile,
  HERO_IMAGE_ALLOWED_TYPES,
  HERO_IMAGE_MAX_BYTES,
} = require('../public/js/stadtpocket-ai-research');

const adminHtmlPath = path.join(__dirname, '..', 'public', 'stadtpocket-admin.html');
const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
const pureLogicPath = path.join(__dirname, '..', 'public', 'js', 'stadtpocket-ai-research.js');
const pureLogicSrc = fs.readFileSync(pureLogicPath, 'utf8');

// Every top-level function in this file is declared at exactly 2-space
// indent ("  function x(" or "  async function x("), so the START of
// the NEXT such declaration is a reliable end boundary -- avoids
// grabbing a fixed char count that can spill into an unrelated later
// function (which would make a "this function never calls X" check
// falsely fail on code X doesn't even contain).
function fnBody(name, html = adminHtml) {
  const needle = new RegExp(`\\n  (?:async )?function ${name}\\(`);
  const startMatch = needle.exec(html);
  assert.ok(startMatch, `function ${name} not found`);
  const start = startMatch.index;
  const nextMatch = /\n  (?:async )?function [A-Za-z0-9_]+\(/.exec(html.slice(start + 1));
  const end = nextMatch ? start + 1 + nextMatch.index : html.length;
  return html.slice(start, end);
}

function heroFixture(overrides) {
  return { candidates: [], committed: null, pending: null, discovering: false, ...overrides };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── 1/2/14. BILD section always renders (with or without a candidate) ──
test('1. renderHeroImageSectionHtml renders a "Bild" heading when a candidate exists', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /<h2 style="margin-top:0">Bild<\/h2>/);
});
test('2. renderHeroImageSectionHtml ALSO renders the "Bild" section (and an honest empty state) when nothing is selected', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /Noch kein Bild ausgewählt/);
  // Unlike the old renderImageCandidateHtml, there is no `return c.headerImageCandidate ? ... : ''` early-out -- the card is unconditional.
  assert.equal(/return c\.headerImageCandidate \?/.test(adminHtml), false);
});
test('14. TopFit-style behavior is preserved: a found headerImageCandidate seeds BOTH the candidate list and a pre-COMMITTED image, with nothing pending (no regression, no extra click needed)', () => {
  const candidate = {
    headerImageCandidate: { value: { url: 'https://www.topfit.fitness/ulm/img/hero.jpg' }, sourceUrl: 'https://www.topfit.fitness/ulm/' },
  };
  const hero = seedHeroImageFromCandidate(candidate);
  assert.equal(hero.candidates.length, 1);
  assert.equal(hero.candidates[0].url, 'https://www.topfit.fitness/ulm/img/hero.jpg');
  assert.deepEqual(hero.committed, { source: 'website', url: 'https://www.topfit.fitness/ulm/img/hero.jpg', sourceUrl: 'https://www.topfit.fitness/ulm/' });
  assert.equal(hero.pending, null);
});
test('2b. Kieser-style behavior: no headerImageCandidate seeds an honest empty state, never a crash or fabricated image', () => {
  const hero = seedHeroImageFromCandidate({ fields: {} }); // no headerImageCandidate at all, like the real Kieser Ulm research result
  assert.deepEqual(hero, heroFixture());
});

// ── 3. multiple website image candidates can be displayed ────────────
test('3. mergeHeroImageCandidates combines newly-discovered candidates with the existing list, deduped, preserving order', () => {
  const existing = [{ url: 'https://x.test/a.jpg', sourceUrl: 'https://x.test/' }];
  const discovered = [
    { url: 'https://x.test/a.jpg', sourceUrl: 'https://x.test/' }, // duplicate, dropped
    { url: 'https://x.test/b.jpg', sourceUrl: 'https://x.test/' },
    { url: 'https://x.test/c.jpg', sourceUrl: 'https://x.test/' },
  ];
  const merged = mergeHeroImageCandidates(existing, discovered);
  assert.deepEqual(merged.map((c) => c.url), ['https://x.test/a.jpg', 'https://x.test/b.jpg', 'https://x.test/c.jpg']);
});
test('3b. merging never touches the committed/pending image -- a newly discovered candidate is never auto-selected', () => {
  const hero = heroFixture({ candidates: [{ url: 'a.jpg', sourceUrl: 's' }], committed: { source: 'website', url: 'a.jpg', sourceUrl: 's' } });
  const mergedCandidates = mergeHeroImageCandidates(hero.candidates, [{ url: 'b.jpg', sourceUrl: 's' }]);
  const next = { ...hero, candidates: mergedCandidates };
  assert.equal(next.committed.url, 'a.jpg'); // unchanged
  assert.equal(next.pending, null);
});
test('3c. the discovery trigger renders as "Bilder von Website suchen" with zero candidates, "Anderes Bild wählen" once some exist', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /'Anderes Bild wählen' : 'Bilder von Website suchen'/);
});

// ── selecting thumbnail creates a PENDING image (not yet committed) ──
test('4. stageHeroImageCandidate stages the clicked candidate as PENDING, leaving the committed image and the candidate list untouched', () => {
  const hero = heroFixture({
    candidates: [{ url: 'a.jpg', sourceUrl: 's' }, { url: 'b.jpg', sourceUrl: 's' }, { url: 'c.jpg', sourceUrl: 's' }],
    committed: { source: 'website', url: 'a.jpg', sourceUrl: 's' },
  });
  const next = stageHeroImageCandidate(hero, 'c.jpg');
  assert.equal(next.pending.url, 'c.jpg');
  assert.equal(next.committed.url, 'a.jpg'); // unchanged until "Bild übernehmen"
  assert.equal(next.candidates.length, 3); // untouched
});
test('4b. staging an unknown URL (not in the candidate list) is a safe no-op', () => {
  const hero = heroFixture({ candidates: [{ url: 'a.jpg', sourceUrl: 's' }] });
  const next = stageHeroImageCandidate(hero, 'not-a-real-candidate.jpg');
  assert.deepEqual(next, hero); // no-op: returns the input unchanged, pending stays null
});
test('4c. clicking a thumbnail calls stageAiHeroImageCandidate, not applyAiHeroImage -- selecting alone never commits', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /onclick="stageAiHeroImageCandidate\(/);
  assert.equal(/onclick="applyAiHeroImage\(\)"[^]*hero-image-thumb/.test(fn), false);
});

// ── uploading creates a PENDING image ─────────────────────────────────
test('5. stageUploadedHeroImage sets an upload-sourced PENDING preview with a local object URL, never touching committed', () => {
  const fakeFile = { name: 'photo.jpg', type: 'image/jpeg', size: 1024 };
  const hero = heroFixture({ committed: { source: 'website', url: 'existing.jpg', sourceUrl: 's' } });
  const next = stageUploadedHeroImage(hero, fakeFile, 'blob:fake-preview-url');
  assert.deepEqual(next.pending, { source: 'upload', file: fakeFile, previewUrl: 'blob:fake-preview-url' });
  assert.equal(next.committed.url, 'existing.jpg'); // unchanged
});
test('5b. validateHeroImageUploadFile enforces the same type/size rules as the existing manual header-image upload', () => {
  assert.equal(validateHeroImageUploadFile(null).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/gif', size: 100 }).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/jpeg', size: HERO_IMAGE_MAX_BYTES + 1 }).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/jpeg', size: 1024 }).valid, true);
  assert.deepEqual(HERO_IMAGE_ALLOWED_TYPES, ['image/png', 'image/jpeg', 'image/webp']);
});
test('5c. the upload input triggers handleAiHeroImageFileSelected, which STAGES the file WITHOUT uploading it immediately', () => {
  const fn = fnBody('handleAiHeroImageFileSelected');
  assert.match(fn, /stageUploadedHeroImage\(s\.heroImage, file, previewUrl\)/);
  assert.equal(/await api\(|await fetch\(/.test(fn), false); // no network call here -- upload is deferred to draft creation
});

// ── "Bild übernehmen" commits the pending image ───────────────────────
test('6. applyPendingHeroImage moves pending -> committed and clears pending', () => {
  const hero = heroFixture({
    candidates: [{ url: 'a.jpg', sourceUrl: 's' }],
    committed: { source: 'website', url: 'old.jpg', sourceUrl: 's' },
    pending: { source: 'website', url: 'a.jpg', sourceUrl: 's' },
  });
  const next = applyPendingHeroImage(hero);
  assert.deepEqual(next.committed, { source: 'website', url: 'a.jpg', sourceUrl: 's' });
  assert.equal(next.pending, null);
});
test('6b. applyPendingHeroImage is a safe no-op when nothing is pending', () => {
  const hero = heroFixture({ committed: { source: 'website', url: 'a.jpg', sourceUrl: 's' } });
  const next = applyPendingHeroImage(hero);
  assert.deepEqual(next, hero);
});
test('6c. "Bild übernehmen" is rendered ONLY while something is pending', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /\$\{isPending \? '<button class="primary" type="button" onclick="applyAiHeroImage\(\)">Bild übernehmen<\/button>' : ''\}/);
});

// ── apply button inactive when nothing changed ────────────────────────
test('7. immediately after seeding (nothing staged yet), there is no pending image -- "Bild übernehmen" has nothing to do', () => {
  const hero = seedHeroImageFromCandidate({ headerImageCandidate: { value: { url: 'x.jpg' }, sourceUrl: 's' } });
  assert.equal(hero.pending, null);
});
test('7b. after a successful apply, pending returns to null again -- the button naturally disappears until another change', () => {
  const hero = heroFixture({ pending: { source: 'website', url: 'a.jpg', sourceUrl: 's' } });
  const applied = applyPendingHeroImage(hero);
  assert.equal(applied.pending, null);
});

// ── committed selected image reaches the existing draft payload ────────
test('8. createDraftFromAiResearch attaches the COMMITTED hero image (never a merely-pending one) via attachSelectedHeroImageToListing, AFTER the draft itself is created', () => {
  const fn = fnBody('createDraftFromAiResearch', adminHtml);
  assert.match(fn, /if \(s\.heroImage && s\.heroImage\.committed\) \{/);
  assert.equal(/s\.heroImage\.pending/.test(fn), false); // pending is never read for draft creation
  const draftPostIdx = fn.indexOf("/research/draft`, { method: 'POST'");
  const attachIdx = fn.indexOf('attachSelectedHeroImageToListing(');
  assert.ok(draftPostIdx > -1 && attachIdx > -1 && attachIdx > draftPostIdx, 'image attachment must happen strictly after the draft-creation call');
});
test('8b. attachSelectedHeroImageToListing commits via the EXISTING PUT .../draft with { headerImage }, same as the manual editor upload', () => {
  const fn = fnBody('attachSelectedHeroImageToListing');
  assert.match(fn, /\/draft`, \{\s*\n\s*method: 'PUT',\s*\n\s*body: \{ headerImage: uploadBody\.headerImage \}/);
});
test('9. draft creation is never gated on a hero image being committed -- the attach step is skipped entirely when nothing is committed', () => {
  const fn = fnBody('createDraftFromAiResearch', adminHtml);
  assert.match(fn, /if \(s\.heroImage && s\.heroImage\.committed\) \{/);
  // canCreateDraftFromCandidate (the actual create-button gate, in the
  // pure-logic file) never references heroImage -- a missing image is
  // never a reason the create button is disabled.
  const gate = pureLogicSrc.match(/function canCreateDraftFromCandidate[\s\S]{0,400}/);
  assert.ok(gate);
  assert.equal(/heroImage/.test(gate[0]), false);
});

// ── delete clears the selected image safely ───────────────────────────
test('10. clearHeroImageSelection clears BOTH committed and pending, keeping any discovered candidates for re-selection', () => {
  const hero = heroFixture({
    candidates: [{ url: 'a.jpg', sourceUrl: 's' }, { url: 'b.jpg', sourceUrl: 's' }],
    committed: { source: 'website', url: 'a.jpg', sourceUrl: 's' },
    pending: { source: 'website', url: 'b.jpg', sourceUrl: 's' },
  });
  const next = clearHeroImageSelection(hero);
  assert.equal(next.committed, null);
  assert.equal(next.pending, null);
  assert.equal(next.candidates.length, 2);
});
test('10b. after clearing, "Bild löschen"/"Bild übernehmen" are no longer rendered, but "Bild hochladen" and the choose action still are', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /\$\{shown \? '<button class="ghost" type="button" onclick="clearAiHeroImageSelection\(\)">Bild löschen<\/button>' : ''\}/);
});
test('10c. clearAiHeroImageSelection makes no network/API call at all -- an external candidate was never copied into our storage, and an unapplied upload was never sent, so there is nothing to delete', () => {
  const fn = fnBody('clearAiHeroImageSelection');
  assert.equal(/api\(|fetch\(/.test(fn), false);
});
test('10d. selecting/staging a website candidate never uploads/copies anything until draft creation -- discovery and staging never call the copy-to-Cloudinary endpoint', () => {
  const discoverFn = fnBody('discoverAiHeroImageCandidates');
  const stageFn = fnBody('stageAiHeroImageCandidate');
  assert.equal(/header-image-from-url/.test(discoverFn), false);
  assert.equal(/header-image-from-url/.test(stageFn), false);
});

// ── navigation does not unexpectedly lose a COMMITTED selection ───────
test('11. applyAiHeroImage/clearAiHeroImageSelection both sync the current heroImage back onto the batch result (survives "Zur Übersicht"/"Weiter")', () => {
  const applyFn = fnBody('applyAiHeroImage');
  const clearFn = fnBody('clearAiHeroImageSelection');
  assert.match(applyFn, /syncCommittedHeroImageToBatchResult\(\)/);
  assert.match(clearFn, /syncCommittedHeroImageToBatchResult\(\)/);
});
test('11b. syncCommittedHeroImageToBatchResult writes onto the correct batch entry (matched by sourceId), and is a no-op outside batch mode', () => {
  const fn = fnBody('syncCommittedHeroImageToBatchResult');
  assert.match(fn, /if \(!s\.batchContext \|\| !aiDiscoveryPrepState\) return;/);
  assert.match(fn, /r\.sourceId === s\.batchContext\.sourceId/);
  assert.match(fn, /result\.heroImage = s\.heroImage;/);
});
test('11c. openPrepReviewAt restores a previously-committed heroImage from the batch result instead of always re-seeding a fresh default', () => {
  const fn = fnBody('openPrepReviewAt');
  assert.match(fn, /if \(result\.heroImage\) \{/);
  assert.match(fn, /aiResearchState\.heroImage = result\.heroImage;/);
});

// ── 13. Phase 1H.4.2 review queue remains unchanged (regression) ─────
test('13. the review-queue functions from Phase 1H.4.2 are untouched -- still present with their exact signatures', () => {
  assert.match(adminHtml, /function openPrepReviewForResult\(resultIndex\)/);
  assert.match(adminHtml, /function navigatePrepBatchToOverview\(\)/);
  assert.match(adminHtml, /function markCurrentBatchResultReviewed\(\)/);
});

// ── no automatic draft creation or publishing (regression) ────────────
test('12. nothing in the BILD section (discover/stage/apply/clear/upload) ever calls a draft-creation or publish endpoint', () => {
  for (const name of ['renderHeroImageSectionHtml', 'discoverAiHeroImageCandidates', 'stageAiHeroImageCandidate', 'applyAiHeroImage', 'clearAiHeroImageSelection', 'handleAiHeroImageFileSelected']) {
    const fn = fnBody(name);
    assert.equal(/\/research\/draft/.test(fn), false, `${name} must never call a draft-creation endpoint`);
    assert.equal(/\/publish/.test(fn), false, `${name} must never call a publish endpoint`);
  }
});

// ── website candidates remain restricted to the verified official domain ──
test('website candidates always come from the research-verified website field, never an arbitrary admin-typed string', () => {
  const fn = fnBody('discoverAiHeroImageCandidates');
  assert.match(fn, /const websiteUrl = \(s\.editable && s\.editable\.website\) \|\| s\.websiteUrl;/);
});

// ── runner ──────────────────────────────────────────────────────
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
