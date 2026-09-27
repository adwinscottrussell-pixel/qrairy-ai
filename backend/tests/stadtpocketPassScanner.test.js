// ============================================================
// stadtpocketPassScanner.test.js — StadtPocket Admin camera QR scanner
// (frontend/public/js/stadtpocket-pass-scanner.js) and its integration
// into stadtpocket-admin.html's Kunden-Pass workspace.
//
// The scanner module is require()d directly with a fake camera
// (getUserMedia + MediaStream tracks), a fake frame decoder and manual
// timers -- no browser needed. The HTML integration is checked at source
// level, the same convention as walletStudio*/stadtpocketOffer tests.
//
// Guarantees under test: camera only after an explicit start(), one
// decoded Pass -> exactly one hand-over, camera stopped BEFORE the
// hand-over, cancel/error always release the camera, and the scan path
// can only fill the manual input + run the existing lookup (never stamp).
//
// Run: node tests/stadtpocketPassScanner.test.js
// ============================================================
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const scannerPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'stadtpocket-pass-scanner.js');
const adminPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'stadtpocket-admin.html');
const S = require(scannerPath);
const scannerSrc = fs.readFileSync(scannerPath, 'utf8');
const adminSrc = fs.readFileSync(adminPath, 'utf8');

const SERIAL = `sp_${'0123456789abcdef'.repeat(3)}`;

// ── fakes ─────────────────────────────────────────────────────

function fakeHarness({ frames = [], mediaError = null, decoderError = null } = {}) {
  const timers = [];
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks };
  const events = { serials: [], invalid: 0, errors: [] };
  let frameIndex = 0;
  const gum = { calls: [], resolve: null };
  const video = { srcObject: null, played: 0, paused: 0, play() { this.played += 1; return Promise.resolve(); }, pause() { this.paused += 1; } };

  const getUserMedia = (constraints) => {
    gum.calls.push(constraints);
    if (mediaError) return Promise.reject(mediaError);
    return new Promise((resolve) => { gum.resolve = () => resolve(stream); });
  };

  const scanner = S.createPassScanner({
    video,
    getUserMedia,
    getDecoder: () => (decoderError ? Promise.reject(decoderError) : Promise.resolve(() => {
      const f = frames[Math.min(frameIndex, frames.length - 1)];
      frameIndex += 1;
      return f === undefined ? null : f;
    })),
    onSerial: (s) => events.serials.push({ serial: s, tracksStoppedAtHandOver: tracks[0].stopped }),
    onInvalid: () => { events.invalid += 1; },
    onError: (m) => events.errors.push(m),
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    now: () => 0,
  });

  async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
  async function runFrames(n) {
    for (let i = 0; i < n; i++) {
      const fn = timers.shift();
      if (!fn) break;
      fn();
      await settle();
    }
  }
  return { scanner, gum, tracks, video, events, timers, settle, runFrames };
}

async function startWithCamera(h) {
  const started = h.scanner.start();
  await h.settle();
  h.gum.resolve();
  await h.settle();
  return started;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── serial validation ─────────────────────────────────────────

test('only a well-formed StadtPocket Pass serial is accepted', () => {
  assert.equal(S.isPassSerial(SERIAL), true);
  for (const bad of ['', null, undefined, 'sp_123', SERIAL.toUpperCase(), `${SERIAL} `, `spd_${'a'.repeat(48)}`,
    `https://qraivy.com/lp/x?serial=${SERIAL}`, `sp_${'g'.repeat(48)}`, 42]) {
    assert.equal(S.isPassSerial(bad), false, String(bad));
  }
});

// ── explicit start ────────────────────────────────────────────

test('1. creating the scanner does NOT touch the camera; start() requests the rear camera without audio', async () => {
  const h = fakeHarness({ frames: [null] });
  assert.equal(h.gum.calls.length, 0);
  await startWithCamera(h);
  assert.equal(h.gum.calls.length, 1);
  assert.deepEqual(h.gum.calls[0], { video: { facingMode: { ideal: 'environment' } }, audio: false });
  assert.equal(h.video.srcObject !== null, true);
  h.scanner.stop();
});

// ── one-shot decode ───────────────────────────────────────────

test('2+5. a valid Pass QR is handed over exactly once, and the camera is stopped BEFORE the hand-over', async () => {
  const h = fakeHarness({ frames: [null, null, SERIAL] });
  await startWithCamera(h);
  await h.runFrames(5);
  assert.equal(h.events.serials.length, 1);
  assert.equal(h.events.serials[0].serial, SERIAL);
  assert.equal(h.events.serials[0].tracksStoppedAtHandOver, true);
  assert.equal(h.scanner.isActive(), false);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.timers.length, 0, 'no further frames scheduled');
});

test('4. many consecutive frames with the same QR still produce only ONE hand-over', async () => {
  const h = fakeHarness({ frames: [SERIAL, SERIAL, SERIAL, SERIAL] });
  await startWithCamera(h);
  await h.runFrames(10);
  assert.equal(h.events.serials.length, 1);
});

test('4b. a second start() while scanning is ignored (one camera, one loop)', async () => {
  const h = fakeHarness({ frames: [null] });
  const first = h.scanner.start();
  const second = await h.scanner.start();
  assert.equal(second, false);
  await h.settle();
  h.gum.resolve();
  await first;
  assert.equal(h.gum.calls.length, 1);
  h.scanner.stop();
});

test('a non-Pass QR (e.g. a URL) is never handed over; the scan continues with a hint', async () => {
  const h = fakeHarness({ frames: ['https://qraivy.com/lp/some-shop', 'https://qraivy.com/lp/some-shop', null] });
  await startWithCamera(h);
  await h.runFrames(3);
  assert.equal(h.events.serials.length, 0);
  assert.equal(h.events.invalid, 1, 'hint is throttled');
  assert.equal(h.scanner.isActive(), true);
  h.scanner.stop();
});

// ── cancel / cleanup ──────────────────────────────────────────

test('6. cancel (stop) releases the camera and nothing is handed over afterwards', async () => {
  const h = fakeHarness({ frames: [null, SERIAL] });
  await startWithCamera(h);
  h.scanner.stop();
  assert.equal(h.tracks[0].stopped, true);
  assert.equal(h.video.srcObject, null);
  await h.runFrames(5);
  assert.equal(h.events.serials.length, 0);
});

test('6b. cancelling while the permission prompt is still open stops the stream as soon as it arrives', async () => {
  const h = fakeHarness({ frames: [SERIAL] });
  const started = h.scanner.start();
  await h.settle();
  h.scanner.stop();
  h.gum.resolve();
  assert.equal(await started, false);
  assert.equal(h.tracks[0].stopped, true);
  await h.runFrames(3);
  assert.equal(h.events.serials.length, 0);
});

// ── errors -> manual fallback ─────────────────────────────────

test('7. permission denied -> clear message pointing to manual entry, camera not active', async () => {
  const h = fakeHarness({ mediaError: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
  await h.scanner.start();
  await h.settle();
  assert.equal(h.events.errors.length, 1);
  assert.match(h.events.errors[0], /nicht erlaubt.*Pass-Code manuell/);
  assert.equal(h.scanner.isActive(), false);
});

test('7b. no camera / unsupported browser / scanner load failure all fall back to manual entry', async () => {
  for (const [err, re] of [
    [{ name: 'NotFoundError' }, /Keine Kamera/],
    [{ name: 'NotReadableError' }, /andere[n]? App/],
    [{ name: 'Weird' }, /nicht gestartet/],
  ]) {
    const h = fakeHarness({ mediaError: Object.assign(new Error('x'), err) });
    await h.scanner.start();
    await h.settle();
    assert.match(h.events.errors[0], re);
    assert.match(h.events.errors[0], /Pass-Code manuell eingeben/);
  }
  const noCam = S.createPassScanner({ video: {}, getUserMedia: null, getDecoder: () => Promise.resolve(() => null), onSerial() {}, onError: (m) => noCam.msg = m });
  await noCam.start();
  assert.match(noCam.msg, /unterstützt keinen Kamera-Scan/);
  const h = fakeHarness({ decoderError: Object.assign(new Error('cdn'), { name: 'ScannerLoadError' }) });
  await h.scanner.start();
  await h.settle();
  assert.match(h.events.errors[0], /Scanner konnte nicht geladen/);
  assert.equal(h.gum.calls.length, 0, 'camera never requested if the decoder is unavailable');
});

// ── scanner module can never stamp / leak ─────────────────────

test('3. the scanner module makes no network calls at all (cannot stamp), and never logs', () => {
  assert.doesNotMatch(scannerSrc, /\bfetch\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(scannerSrc, /loyalty\/stamp|loyalty\/lookup/);
  assert.doesNotMatch(scannerSrc, /console\.(log|info|debug|warn|error)/);
  assert.doesNotMatch(scannerSrc, /location\.href|window\.open|innerHTML/);
});

test('jsQR is loaded lazily from an exact pinned version with SRI + anonymous CORS', () => {
  assert.equal(S.JSQR_SRC, 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  assert.match(S.JSQR_INTEGRITY, /^sha384-[A-Za-z0-9+/]{64}$/);
  assert.match(scannerSrc, /s\.integrity = JSQR_INTEGRITY/);
  assert.match(scannerSrc, /s\.crossOrigin = 'anonymous'/);
  assert.doesNotMatch(adminSrc, /jsqr@[^"']*\.js/, 'admin page does not load jsQR eagerly');
});

// ── admin page integration (source level) ─────────────────────

function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

test('Kunden-Pass shows "QR-Code scannen", "oder", and the unchanged manual Pass-Code + "Kunde prüfen"', () => {
  const ws = fnBody(adminSrc, 'renderStampWorkspace');
  assert.match(ws, /id="stamp-scan-btn" onclick="startPassScan\(\)">QR-Code scannen</);
  assert.match(ws, />oder</);
  assert.match(ws, /id="stamp-pass-input" placeholder="Pass-Code eingeben"/);
  assert.match(ws, /id="stamp-lookup-btn" onclick="lookupCustomerPass\(\)">Kunde prüfen</);
  assert.match(ws, /<video id="stamp-scan-video" playsinline muted/);
  assert.match(ws, /id="stamp-scan-cancel" onclick="cancelPassScan\(\)">Abbrechen</);
  assert.match(adminSrc, /<script src="js\/stadtpocket-pass-scanner\.js"><\/script>/);
});

test('2. a scan feeds the EXISTING lookup: fills the manual input and calls lookupCustomerPass()', () => {
  const start = fnBody(adminSrc, 'startPassScan');
  assert.match(start, /onSerial\(serial\) \{[\s\S]*input\.value = serial;[\s\S]*lookupCustomerPass\(\);/);
});

test('3. the scan path never stamps: no stamp call or stamp endpoint anywhere in the scan functions', () => {
  for (const name of ['startPassScan', 'stopPassScan', 'cancelPassScan', 'setScanUi']) {
    const body = fnBody(adminSrc, name);
    assert.doesNotMatch(body, /addStampForCurrentCustomer|loyalty\/stamp|\bapi\(/, name);
  }
});

test('camera is only requested from the explicit click handler (no getUserMedia at page load)', () => {
  const occurrences = adminSrc.match(/getUserMedia/g) || [];
  const inStart = fnBody(adminSrc, 'startPassScan').match(/getUserMedia/g) || [];
  assert.equal(occurrences.length, inStart.length);
  assert.ok(inStart.length > 0);
});

test('6. camera is released when the workspace re-renders, on cancel, and when the page is left', () => {
  assert.match(fnBody(adminSrc, 'renderStampWorkspace'), /stopPassScan\(\);/);
  assert.match(fnBody(adminSrc, 'renderLoyaltyWorkspace'), /stopPassScan\(\);/);
  assert.match(fnBody(adminSrc, 'cancelPassScan'), /stopPassScan\(\);/);
  assert.match(adminSrc, /window\.addEventListener\('pagehide', stopPassScan\)/);
});

test('7. on camera error the manual input is focused (workflow never stranded)', () => {
  assert.match(fnBody(adminSrc, 'startPassScan'), /onError\(message\) \{[\s\S]*banner\('stamp-banner', 'error', message\);[\s\S]*input\.focus\(\)/);
});

test('8. manual lookup unchanged: reads the input and POSTs the serial in the body to the protected lookup route', () => {
  const body = fnBody(adminSrc, 'lookupCustomerPass');
  assert.match(body, /document\.getElementById\('stamp-pass-input'\)/);
  assert.match(body, /\/loyalty\/lookup`, \{\s*method: 'POST',\s*body: \{ passSerialNumber \},/);
});

test('9. explicit "+ 1 Stempel hinzufügen" still uses the existing protected stamp route, only from its own button', () => {
  const body = fnBody(adminSrc, 'addStampForCurrentCustomer');
  assert.match(body, /\/loyalty\/stamp`, \{\s*method: 'POST',\s*body: \{ passSerialNumber: currentStampCustomerSerial \},/);
  const callers = adminSrc.match(/(?<!function )addStampForCurrentCustomer\(\)/g) || [];
  assert.equal(callers.length, 1, 'only the button onclick invokes it');
  assert.match(adminSrc, /onclick="addStampForCurrentCustomer\(\)">\+ 1 Stempel hinzufügen</);
});

test('decoded values are never logged by the admin scan code', () => {
  for (const name of ['startPassScan', 'stopPassScan', 'cancelPassScan']) {
    assert.doesNotMatch(fnBody(adminSrc, name), /console\./);
  }
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
