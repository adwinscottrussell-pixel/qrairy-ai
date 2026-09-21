// ============================================================
// stadtpocketAiHeroImage.test.js — Phase 1H.4.3 (Business Image
// Selection in AI Review). Unit tests for the pure BILD-section helpers
// added to frontend/public/js/stadtpocket-ai-research.js, plus static
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
  selectHeroImageCandidate,
  selectUploadedHeroImage,
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
test('14. TopFit-style behavior is preserved: a found headerImageCandidate seeds BOTH the candidate list and the pre-selected image (no regression)', () => {
  const candidate = {
    headerImageCandidate: { value: { url: 'https://www.topfit.fitness/ulm/img/hero.jpg' }, sourceUrl: 'https://www.topfit.fitness/ulm/' },
  };
  const hero = seedHeroImageFromCandidate(candidate);
  assert.equal(hero.candidates.length, 1);
  assert.equal(hero.candidates[0].url, 'https://www.topfit.fitness/ulm/img/hero.jpg');
  assert.deepEqual(hero.selected, { source: 'website', url: 'https://www.topfit.fitness/ulm/img/hero.jpg', sourceUrl: 'https://www.topfit.fitness/ulm/' });
});
test('2b. Kieser-style behavior: no headerImageCandidate seeds an honest empty state, never a crash or fabricated image', () => {
  const hero = seedHeroImageFromCandidate({ fields: {} }); // no headerImageCandidate at all, like the real Kieser Ulm research result
  assert.deepEqual(hero, { candidates: [], selected: null, discovering: false });
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
test('3b. merging never touches an existing selection -- a newly discovered candidate is never auto-selected', () => {
  const hero = { candidates: [{ url: 'a.jpg', sourceUrl: 's' }], selected: { source: 'website', url: 'a.jpg', sourceUrl: 's' }, discovering: false };
  const mergedCandidates = mergeHeroImageCandidates(hero.candidates, [{ url: 'b.jpg', sourceUrl: 's' }]);
  const next = { ...hero, candidates: mergedCandidates };
  assert.equal(next.selected.url, 'a.jpg'); // unchanged
});
test('3c. the discovery trigger renders as "Bilder von Website suchen" with zero candidates, "Anderes Bild wählen" once some exist', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /'Anderes Bild wählen' : 'Bilder von Website suchen'/);
});

// ── 4. selecting candidate #2 changes the selected hero image ────────
test('4. selectHeroImageCandidate switches the selection to the clicked candidate, leaving the candidate list untouched', () => {
  const hero = {
    candidates: [{ url: 'a.jpg', sourceUrl: 's' }, { url: 'b.jpg', sourceUrl: 's' }, { url: 'c.jpg', sourceUrl: 's' }],
    selected: { source: 'website', url: 'a.jpg', sourceUrl: 's' },
    discovering: false,
  };
  const next = selectHeroImageCandidate(hero, 'c.jpg');
  assert.equal(next.selected.url, 'c.jpg');
  assert.equal(next.candidates.length, 3); // untouched
});
test('4b. selecting an unknown URL (not in the candidate list) is a safe no-op', () => {
  const hero = { candidates: [{ url: 'a.jpg', sourceUrl: 's' }], selected: null, discovering: false };
  const next = selectHeroImageCandidate(hero, 'not-a-real-candidate.jpg');
  assert.equal(next.selected, null);
});

// ── 5. manual upload can become the selected hero image ──────────────
test('5. selectUploadedHeroImage sets an upload-sourced selection with a local preview URL', () => {
  const fakeFile = { name: 'photo.jpg', type: 'image/jpeg', size: 1024 };
  const hero = { candidates: [], selected: null, discovering: false };
  const next = selectUploadedHeroImage(hero, fakeFile, 'blob:fake-preview-url');
  assert.deepEqual(next.selected, { source: 'upload', file: fakeFile, previewUrl: 'blob:fake-preview-url' });
});
test('5b. validateHeroImageUploadFile enforces the same type/size rules as the existing manual header-image upload', () => {
  assert.equal(validateHeroImageUploadFile(null).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/gif', size: 100 }).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/jpeg', size: HERO_IMAGE_MAX_BYTES + 1 }).valid, false);
  assert.equal(validateHeroImageUploadFile({ type: 'image/jpeg', size: 1024 }).valid, true);
  assert.deepEqual(HERO_IMAGE_ALLOWED_TYPES, ['image/png', 'image/jpeg', 'image/webp']);
});
test('5c. the upload input triggers handleAiHeroImageFileSelected, which stages the file WITHOUT uploading it immediately', () => {
  const fn = fnBody('handleAiHeroImageFileSelected');
  assert.match(fn, /selectUploadedHeroImage\(s\.heroImage, file, previewUrl\)/);
  assert.equal(/await api\(|await fetch\(/.test(fn), false); // no network call here -- upload is deferred to draft creation
});

// ── 6. "Bild löschen" clears the selected image ───────────────────────
test('6. clearHeroImageSelection clears ONLY the selection, keeping any discovered candidates for re-selection', () => {
  const hero = { candidates: [{ url: 'a.jpg', sourceUrl: 's' }, { url: 'b.jpg', sourceUrl: 's' }], selected: { source: 'website', url: 'a.jpg', sourceUrl: 's' }, discovering: false };
  const next = clearHeroImageSelection(hero);
  assert.equal(next.selected, null);
  assert.equal(next.candidates.length, 2);
});
test('6b. after clearing, "Bild löschen" is no longer rendered but "Bild hochladen" and the choose action still are', () => {
  const fn = fnBody('renderHeroImageSectionHtml');
  assert.match(fn, /\$\{sel \? '<button class="ghost" type="button" onclick="clearAiHeroImageSelection\(\)">Bild löschen<\/button>' : ''\}/);
});

// ── 7. removing an external candidate never deletes shared storage ───
test('7. clearAiHeroImageSelection makes no network/API call at all -- an external candidate was never copied into our storage, so there is nothing to delete', () => {
  const fn = fnBody('clearAiHeroImageSelection');
  assert.equal(/api\(|fetch\(/.test(fn), false);
});
test('7b. selecting a website candidate never uploads/copies anything until draft creation -- discoverAiHeroImageCandidates and selectAiHeroImageCandidate never call the copy-to-Cloudinary endpoint', () => {
  const discoverFn = fnBody('discoverAiHeroImageCandidates');
  const selectFn = fnBody('selectAiHeroImageCandidate');
  assert.equal(/header-image-from-url/.test(discoverFn), false);
  assert.equal(/header-image-from-url/.test(selectFn), false);
});

// ── 8/9. selected image is passed to existing draft creation; draft can still be created with none ──
test('8. createDraftFromAiResearch attaches the selected hero image via attachSelectedHeroImageToListing AFTER the draft itself is created', () => {
  const fn = fnBody('createDraftFromAiResearch', adminHtml);
  const draftPostIdx = fn.indexOf("/research/draft`, { method: 'POST'");
  const attachIdx = fn.indexOf('attachSelectedHeroImageToListing(');
  assert.ok(draftPostIdx > -1 && attachIdx > -1 && attachIdx > draftPostIdx, 'image attachment must happen strictly after the draft-creation call');
});
test('8b. attachSelectedHeroImageToListing commits via the EXISTING PUT .../draft with { headerImage }, same as the manual editor upload', () => {
  const fn = fnBody('attachSelectedHeroImageToListing');
  assert.match(fn, /\/draft`, \{\s*\n\s*method: 'PUT',\s*\n\s*body: \{ headerImage: uploadBody\.headerImage \}/);
});
test('9. draft creation is never gated on a hero image being selected -- the attach step is skipped entirely when nothing is selected', () => {
  const fn = fnBody('createDraftFromAiResearch', adminHtml);
  assert.match(fn, /if \(s\.heroImage && s\.heroImage\.selected\) \{/);
  // canCreateDraftFromCandidate (the actual create-button gate, in the
  // pure-logic file) never references heroImage -- a missing image is
  // never a reason the create button is disabled.
  const gate = pureLogicSrc.match(/function canCreateDraftFromCandidate[\s\S]{0,400}/);
  assert.ok(gate);
  assert.equal(/heroImage/.test(gate[0]), false);
});

// ── 10. website candidates remain restricted to the verified official domain ──
test('10. discoverAiHeroImageCandidates always targets the research-verified website field, never an arbitrary admin-typed string', () => {
  const fn = fnBody('discoverAiHeroImageCandidates');
  assert.match(fn, /const websiteUrl = \(s\.editable && s\.editable\.website\) \|\| s\.websiteUrl;/);
});

// ── 11/12. no automatic draft creation or publishing ──────────────────
test('11. nothing in the BILD section (discover/select/clear/upload) ever calls a draft-creation endpoint', () => {
  for (const name of ['renderHeroImageSectionHtml', 'discoverAiHeroImageCandidates', 'selectAiHeroImageCandidate', 'clearAiHeroImageSelection', 'handleAiHeroImageFileSelected']) {
    assert.equal(/\/research\/draft/.test(fnBody(name)), false, `${name} must never call a draft-creation endpoint`);
  }
});
test('12. nothing in the BILD section ever calls a publish endpoint', () => {
  for (const name of ['renderHeroImageSectionHtml', 'discoverAiHeroImageCandidates', 'selectAiHeroImageCandidate', 'clearAiHeroImageSelection', 'handleAiHeroImageFileSelected', 'attachSelectedHeroImageToListing']) {
    assert.equal(/\/publish/.test(fnBody(name)), false, `${name} must never call a publish endpoint`);
  }
});

// ── 13. Phase 1H.4.2 review queue remains unchanged (regression) ─────
test('13. the review-queue functions from Phase 1H.4.2 are untouched -- still present with their exact signatures', () => {
  assert.match(adminHtml, /function openPrepReviewForResult\(resultIndex\)/);
  assert.match(adminHtml, /function navigatePrepBatchToOverview\(\)/);
  assert.match(adminHtml, /function markCurrentBatchResultReviewed\(\)/);
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
