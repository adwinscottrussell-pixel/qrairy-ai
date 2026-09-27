// stadtpocket-pass-scanner.js — camera QR scanner for the StadtPocket
// Admin's Stempelkarte > Kunden-Pass workspace.
//
// IDENTIFICATION ONLY. A successful scan yields exactly one well-formed
// StadtPocket Pass.serialNumber and hands it to the caller, which feeds
// it into the EXISTING manual lookup (lookupCustomerPass() in
// stadtpocket-admin.html). Nothing in this file can stamp: it never calls
// the stamp endpoint, never calls any endpoint at all, and never touches
// authorization -- the existing authenticated lookup + explicit
// "+ 1 Stempel hinzufügen" click remain the only path to a stamp.
//
// Camera approach reuses the one already proven in stamp-scanner.html
// (getUserMedia rear camera + jsQR frame decoding), minus that page's
// auto-stamp behaviour. jsQR is loaded lazily -- only when staff click
// "QR-Code scannen" -- pinned to jsqr@1.4.0/dist/jsQR.js with an SRI
// integrity hash (the package file itself, byte-identical on jsDelivr).
//
// Decoded text is untrusted: only ^sp_[0-9a-f]{48}$ is accepted, it is
// never inserted as HTML, never opened as a URL, and never logged.
//
// Plain browser script (window.StadtPocketPassScanner) that is also
// require()-able from Node tests (module.exports below), matching
// stadtpocket-ai-research.js. Every browser API is injectable.

(function (root) {
  var PASS_SERIAL_PATTERN = /^sp_[0-9a-f]{48}$/;

  var JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  var JSQR_INTEGRITY = 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';

  var SCAN_INTERVAL_MS = 150;
  var MAX_DECODE_WIDTH = 640;
  var INVALID_HINT_INTERVAL_MS = 2500;

  function isPassSerial(text) {
    return typeof text === 'string' && PASS_SERIAL_PATTERN.test(text);
  }

  // German, staff-facing messages; every one points back to manual entry.
  function describeCameraError(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Kamera-Zugriff wurde nicht erlaubt. Bitte Pass-Code manuell eingeben.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'Keine Kamera gefunden. Bitte Pass-Code manuell eingeben.';
    }
    if (name === 'NotReadableError') {
      return 'Die Kamera wird gerade von einer anderen App verwendet. Bitte Pass-Code manuell eingeben.';
    }
    if (name === 'Unsupported') {
      return 'Dieser Browser unterstützt keinen Kamera-Scan. Bitte Pass-Code manuell eingeben.';
    }
    if (name === 'ScannerLoadError') {
      return 'Der Scanner konnte nicht geladen werden. Bitte Pass-Code manuell eingeben.';
    }
    return 'Der Scanner konnte nicht gestartet werden. Bitte Pass-Code manuell eingeben.';
  }

  // Lazily injects the pinned, SRI-checked jsQR script once.
  var jsQrPromise = null;
  function loadJsQr(doc, win) {
    if (win.jsQR) return Promise.resolve(win.jsQR);
    if (jsQrPromise) return jsQrPromise;
    jsQrPromise = new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = JSQR_SRC;
      s.integrity = JSQR_INTEGRITY;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = function () {
        if (win.jsQR) resolve(win.jsQR);
        else reject(Object.assign(new Error('jsQR missing'), { name: 'ScannerLoadError' }));
      };
      s.onerror = function () {
        jsQrPromise = null;
        reject(Object.assign(new Error('jsQR load failed'), { name: 'ScannerLoadError' }));
      };
      doc.head.appendChild(s);
    });
    return jsQrPromise;
  }

  // Browser frame decoder: draws the current video frame (downscaled for
  // phone CPUs) and returns jsQR's decoded text, or null.
  function createFrameDecoder(jsQR, doc) {
    var canvas = doc.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    return function decodeFrame(video) {
      if (!video.videoWidth || !video.videoHeight) return null;
      var scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      return code && typeof code.data === 'string' ? code.data : null;
    };
  }

  /**
   * One-shot scanner controller.
   *
   * @param {Object} o
   * @param {Function} o.getUserMedia  - (constraints) => Promise<MediaStream>
   * @param {Object}   o.video         - <video playsinline muted> element
   * @param {Function} o.getDecoder    - () => Promise<(video) => string|null>
   * @param {Function} o.onSerial      - called at most ONCE per start(), after the camera is already stopped
   * @param {Function} [o.onInvalid]   - throttled: a QR was seen that is not a StadtPocket Pass
   * @param {Function} [o.onError]     - (message) camera/scanner failure, camera already stopped
   * @param {Function} [o.setTimer]    - injectable setTimeout
   * @param {Function} [o.clearTimer]  - injectable clearTimeout
   * @param {Function} [o.now]         - injectable Date.now
   */
  function createPassScanner(o) {
    var setTimer = o.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = o.clearTimer || function (t) { clearTimeout(t); };
    var now = o.now || function () { return Date.now(); };

    var active = false;
    var stream = null;
    var timer = null;
    var session = 0;
    var lastInvalidHint = -Infinity;

    function releaseCamera() {
      if (timer !== null) { clearTimer(timer); timer = null; }
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }
      if (o.video) {
        try { o.video.pause(); } catch (_) { /* ignore */ }
        o.video.srcObject = null;
      }
    }

    function stop() {
      active = false;
      session += 1; // invalidates any start() still awaiting camera/decoder
      releaseCamera();
    }

    function fail(err) {
      stop();
      if (o.onError) o.onError(describeCameraError(err));
    }

    function tick(decode, mySession) {
      timer = null;
      if (!active || mySession !== session) return;
      var text = null;
      try { text = decode(o.video); } catch (_) { text = null; }
      if (text !== null && isPassSerial(text)) {
        // Stop FIRST, then hand over exactly once: later frames can never
        // reach onSerial because active is already false.
        stop();
        o.onSerial(text);
        return;
      }
      if (text !== null && o.onInvalid && now() - lastInvalidHint >= INVALID_HINT_INTERVAL_MS) {
        lastInvalidHint = now();
        o.onInvalid();
      }
      timer = setTimer(function () { tick(decode, mySession); }, SCAN_INTERVAL_MS);
    }

    function start() {
      if (active) return Promise.resolve(false);
      if (typeof o.getUserMedia !== 'function') {
        fail({ name: 'Unsupported' });
        return Promise.resolve(false);
      }
      active = true;
      session += 1;
      var mySession = session;
      var decoder;
      return Promise.resolve()
        .then(function () { return o.getDecoder(); })
        .then(function (d) {
          decoder = d;
          if (mySession !== session) return null;
          return o.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        })
        .then(function (s) {
          if (!s) return false;
          if (mySession !== session) {
            // cancelled while the permission prompt was open
            s.getTracks().forEach(function (t) { t.stop(); });
            return false;
          }
          stream = s;
          o.video.srcObject = s;
          return Promise.resolve(o.video.play ? o.video.play() : undefined).then(function () {
            if (mySession !== session) return false;
            tick(decoder, mySession);
            return true;
          });
        })
        .catch(function (err) {
          if (mySession === session) fail(err);
          return false;
        });
    }

    return {
      start: start,
      stop: stop,
      isActive: function () { return active; },
    };
  }

  var api = {
    PASS_SERIAL_PATTERN: PASS_SERIAL_PATTERN,
    JSQR_SRC: JSQR_SRC,
    JSQR_INTEGRITY: JSQR_INTEGRITY,
    SCAN_INTERVAL_MS: SCAN_INTERVAL_MS,
    isPassSerial: isPassSerial,
    describeCameraError: describeCameraError,
    loadJsQr: loadJsQr,
    createFrameDecoder: createFrameDecoder,
    createPassScanner: createPassScanner,
  };

  if (root) root.StadtPocketPassScanner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
