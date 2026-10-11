/**
 * QRAIVY Smart Editor — the greeting field of the Voice tab.
 * =====================================================
 * Used by smart-editor.js, which owns the tab, the page state
 * (window.SmartEditor.state) and publishing. This file only looks after
 * the "Spoken Greeting" field and what happens to the preview after a
 * publish.
 *
 * The field always shows the greeting that WILL be spoken for the
 * selected language: the owner's own text for that language if there is
 * one, otherwise the standard greeting for the page's industry
 * (js/voice-greetings.js). Each language keeps its own custom text
 * (state.voice.customGreeting = { en, de }), so switching language or
 * editing anything else never loses it. A text equal to the standard one
 * is not stored as custom, so it keeps following the business name.
 *
 * Below the field the owner can listen to that greeting: Play/Pause for
 * audio that matches the text shown, and a Generate/Update button that
 * asks the server for it (POST /lp/voice/preview/:slug). Preview audio is
 * separate from published audio; nothing visitors hear changes before
 * Publish.
 *
 * After a publish, the phone preview is the real published page. If the
 * server says new audio is being made, the preview is reloaded once more
 * when that audio is actually on the page.
 */
(function () {
  'use strict';

  var API = 'https://api.qraivy.com';
  var IDS = { field: 'se-voice-greeting', status: 'se-voice-greeting-status', count: 'se-voice-greeting-count', reset: 'se-voice-greeting-reset', audio: 'se-voice-audio-status', iframe: 'sqd-iframe' };
  var TXT = {
    en: { standard: 'Standard greeting for: ', custom: 'Your own greeting', industries: { restaurant: 'Restaurant', creator: 'Creator / Influencer', artist: 'Artist / Music', event: 'Event', ecommerce: 'Ecommerce', local_business: 'Local Business', fitness: 'Fitness', other: 'Other' }, pending: 'Welcome audio is being updated…', ready: 'Welcome audio updated ✓', slow: 'The welcome audio is taking longer than usual. It will appear on your page when it is ready.', off: 'Voice is switched off for this page, so no audio is generated.' },
    de: { standard: 'Standardbegrüßung für: ', custom: 'Ihre eigene Begrüßung', industries: { restaurant: 'Restaurant', creator: 'Creator / Influencer', artist: 'Künstler / Musik', event: 'Event', ecommerce: 'E-Commerce', local_business: 'Lokales Unternehmen', fitness: 'Fitness', other: 'Sonstiges' }, pending: 'Die Willkommens-Audiodatei wird aktualisiert …', ready: 'Willkommens-Audiodatei aktualisiert ✓', slow: 'Die Audiodatei braucht länger als üblich. Sie erscheint auf Ihrer Seite, sobald sie fertig ist.', off: 'Die Sprachausgabe ist für diese Seite ausgeschaltet, daher wird keine Audiodatei erzeugt.' }
  };

  function G() { return window.QRAIVY_VOICE_GREETINGS; }
  function $(id) { return document.getElementById(id); }
  function ui() { return TXT[window._qraivyLang === 'de' ? 'de' : 'en']; }
  function state() { return window.SmartEditor && window.SmartEditor.state; }
  function lang() { var s = state(); return s && s.voice && s.voice.language === 'de' ? 'de' : 'en'; }
  function useCase() { var s = state(); return s && s._db ? s._db.useCase : ''; }
  function bizName() { var s = state(); return (s && s._db && s._db.businessName) || (s && s.slug) || ''; }
  function standard(l) { return G().cleanGreeting(G().defaultGreeting(useCase(), l, bizName())); }
  function custom() {
    var v = state().voice;
    if (!v.customGreeting || typeof v.customGreeting !== 'object' || Array.isArray(v.customGreeting)) v.customGreeting = {};
    return v.customGreeting;
  }
  function ready() { return !!(G() && state() && state().voice && $(IDS.field)); }

  // Brings what is stored into the per-language shape. The older single
  // "custom welcome message" (voice.customText) belonged to no language in
  // particular; it becomes the custom greeting of the language the page is
  // in, so nothing an owner wrote is dropped.
  function adopt(storedVoice) {
    if (!G() || !state()) return;
    var v = state().voice, out = {}, src = storedVoice || {};
    ['en', 'de'].forEach(function (l) {
      var text = G().cleanGreeting(src.customGreeting && src.customGreeting[l]);
      if (text) out[l] = text;
    });
    var legacy = G().cleanGreeting(src.customText);
    if (legacy && !out[lang()]) out[lang()] = legacy;
    v.customGreeting = out;
    v.customText = '';
  }

  function paint() {
    var ta = $(IDS.field); if (!ta) return;
    var isCustom = !!custom()[lang()], u = ui();
    var count = $(IDS.count), status = $(IDS.status), reset = $(IDS.reset);
    if (count) count.textContent = ta.value.length + ' / ' + G().MAX_LENGTH;
    if (status) status.textContent = isCustom ? u.custom : u.standard + (u.industries[G().industryKey(useCase())] || '');
    if (reset) reset.style.display = isCustom ? 'inline-block' : 'none';
  }
  // Shows the greeting for the selected language.
  function sync() {
    if (!ready()) return;
    var l = lang();
    $(IDS.field).value = custom()[l] || standard(l);
    paint();
    refreshPreview(true);
  }
  // Takes what is in the field into the state for the selected language.
  function collect() {
    if (!ready()) return;
    var l = lang(), text = G().cleanGreeting($(IDS.field).value), c = custom();
    if (!text || text === standard(l)) delete c[l]; else c[l] = text;
    paint();
    refreshPreview(false);
  }
  function reset(onChange) { if (!ready()) return; delete custom()[lang()]; sync(); if (onChange) onChange(); }

  // Wires the field once. `onChange` is the editor's own "there are
  // unsaved changes" hook.
  function bind(onChange) {
    var ta = $(IDS.field); if (!ta || ta._greetingBound) return;
    ta._greetingBound = true;
    ta.addEventListener('input', function () { collect(); if (onChange) onChange(); });
    // An emptied field falls back to the standard greeting rather than staying blank.
    ta.addEventListener('blur', function () { if (ready() && !G().cleanGreeting(ta.value)) sync(); });
    var r = $(IDS.reset); if (r) r.addEventListener('click', function () { reset(onChange); });
    bindPreview();
  }

  // ── Enable Voice Welcome ─────────────────────────────────────
  // Whether the welcome is on for a stored page. Three switches can turn
  // it off -- voice.enabled (this tab), voice.active and
  // settings.voiceEnabled (earlier editors) -- and the published page
  // honours all three, so the toggle shows their combined result. A page
  // that has none of them set is ON, exactly as it is published today.
  function isVoiceOn(sections) {
    var s = sections && typeof sections === 'object' ? sections : {};
    var v = s.voice && typeof s.voice === 'object' ? s.voice : {};
    var st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    return v.enabled !== false && v.active !== false && st.voiceEnabled !== false;
  }
  // What publishing writes for the toggle. OFF only sets voice.enabled.
  // ON also lifts the two older switches IF they were off -- otherwise the
  // page would stay silent although this tab says On. Nothing else in
  // `sections` is touched; settings is returned only when it has to change.
  function applyVoiceToggle(voice, sections, enabled) {
    var out = { voice: voice };
    voice.enabled = !!enabled;
    if (!enabled) return out;
    if (voice.active === false) voice.active = true;
    var st = sections && sections.settings;
    if (st && typeof st === 'object' && st.voiceEnabled === false) {
      out.settings = {};
      for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) out.settings[k] = st[k];
      out.settings.voiceEnabled = true;
    }
    return out;
  }
  // Paints the switch and its hint from state.voice.enabled.
  function paintToggle() {
    var btn = $('se-voice-enabled'), hint = $('se-voice-enabled-hint'), s = state();
    if (!btn || !s || !s.voice) return;
    var on = s.voice.enabled !== false, de = window._qraivyLang === 'de';
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.textContent = on ? (de ? 'An' : 'On') : (de ? 'Aus' : 'Off');
    btn.style.background = on ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.04)';
    btn.style.borderColor = on ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.12)';
    btn.style.color = on ? '#ff5a1f' : 'rgba(240,244,248,0.5)';
    if (hint) {
      hint.textContent = on ? '' : (de
        ? 'Aus: Der Audio-Player wird auf Ihrer Seite ausgeblendet und es wird keine neue Audiodatei erzeugt. Ihr Text bleibt gespeichert.'
        : 'Off: the audio player is hidden on your page and no new audio is generated. Your text stays saved.');
      hint.style.display = on ? 'none' : 'block';
    }
    paintPreview();
  }

  // ── Audio preview ────────────────────────────────────────────
  // Lets the owner hear the greeting that is in the field, in the voice
  // of the selected language, before publishing. The audio is asked for
  // only when the owner presses the button -- never while typing -- and
  // the server returns an existing recording when there is one. Play is
  // only offered for audio that matches the text shown: after an edit the
  // earlier audio is marked outdated and cannot be played as if current.
  var PV = { known: {}, checked: {}, had: false, state: 'idle', message: '', url: '', busyKey: '', seq: 0, audio: null, playing: false };
  var PTXT = {
    en: { play: 'Play', pause: 'Pause', generate: 'Generate preview', update: 'Update preview', retry: 'Try again', checking: 'Checking audio…', ready: 'Audio matches this greeting.', outdated: 'The greeting has changed — the previous audio is outdated.', none: 'No audio for this greeting yet.', loading: 'Generating audio…', done: 'Preview ready ✓', off: 'Voice Welcome is off — no new audio is generated.', failed: 'The audio could not be generated. Please try again.', limit: 'Preview limit reached for now. Please try again later.', signin: 'Please sign in again to preview the audio.', playfail: 'The audio could not be played.' },
    de: { play: 'Abspielen', pause: 'Pause', generate: 'Vorschau erzeugen', update: 'Vorschau aktualisieren', retry: 'Erneut versuchen', checking: 'Audio wird geprüft …', ready: 'Die Audiodatei passt zu dieser Begrüßung.', outdated: 'Die Begrüßung wurde geändert — die bisherige Audiodatei ist veraltet.', none: 'Für diese Begrüßung gibt es noch keine Audiodatei.', loading: 'Audio wird erzeugt …', done: 'Vorschau bereit ✓', off: 'Voice Welcome ist aus — es wird keine neue Audiodatei erzeugt.', failed: 'Die Audiodatei konnte nicht erzeugt werden. Bitte versuchen Sie es erneut.', limit: 'Das Vorschau-Limit ist vorerst erreicht. Bitte versuchen Sie es später erneut.', signin: 'Bitte melden Sie sich erneut an, um die Audiodatei anzuhören.', playfail: 'Die Audiodatei konnte nicht abgespielt werden.' }
  };
  function ptxt() { return PTXT[window._qraivyLang === 'de' ? 'de' : 'en']; }
  function voiceOn() { var s = state(); return !(s && s.voice && s.voice.enabled === false); }
  // What would be spoken right now: the field's text, or the standard greeting.
  function spoken() { var l = lang(); return { lang: l, text: G().cleanGreeting($(IDS.field).value) || standard(l) }; }
  function keyOf(g) { return g.lang + '|' + g.text; }
  function stopAudio() { if (PV.audio) { try { PV.audio.pause(); } catch (e) {} } PV.playing = false; }
  function paintPreview() {
    var play = $('se-voice-preview-play'), gen = $('se-voice-preview-generate'), status = $('se-voice-preview-status'), t = ptxt();
    if (!play || !gen || !status) return;
    var ready = PV.state === 'ready', busy = PV.state === 'loading' || PV.state === 'checking', on = voiceOn();
    play.disabled = !ready;
    play.textContent = (PV.playing ? '❚❚ ' + t.pause : '▶ ' + t.play);
    play.setAttribute('aria-pressed', PV.playing ? 'true' : 'false');
    play.style.opacity = ready ? '1' : '0.4';
    play.style.cursor = ready ? 'pointer' : 'not-allowed';
    gen.style.display = ready ? 'none' : 'inline-block';
    gen.disabled = busy || !on;
    gen.textContent = PV.state === 'error' ? t.retry : (PV.had ? t.update : t.generate);
    gen.style.opacity = gen.disabled ? '0.4' : '1';
    gen.style.cursor = gen.disabled ? 'not-allowed' : 'pointer';
    var text = PV.message || ({ checking: t.checking, ready: t.ready, loading: t.loading, outdated: t.outdated, none: t.none }[PV.state] || '');
    if (!ready && !busy && !on) text = (PV.state === 'outdated' ? t.outdated + ' ' : '') + t.off;
    status.textContent = text;
    status.style.color = PV.state === 'error' ? '#f87171' : (PV.state === 'outdated' ? '#f59e0b' : (ready ? '#22d47e' : 'rgba(240,244,248,0.6)'));
  }
  function setPreview(st, message, url) {
    if (st !== 'ready' || url !== PV.url) stopAudio();
    PV.state = st; PV.message = message || ''; PV.url = st === 'ready' ? url : '';
    if (st === 'ready') PV.had = true;
    paintPreview();
  }
  function authToken() {
    try { if (window.Clerk && window.Clerk.session) return window.Clerk.session.getToken(); } catch (e) {}
    return Promise.resolve(null);
  }
  // Asks the server for the audio of `g`. generate=false only looks.
  function askPreview(g, generate) {
    var slug = state().slug, on = voiceOn();
    return Promise.resolve(authToken()).then(function (tok) {
      if (!tok) return { failed: 'signin' };
      return fetch(API + '/lp/voice/preview/' + encodeURIComponent(slug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ language: g.lang, text: g.text, generate: !!generate, enabled: on })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._http = r.status; return d; }); });
    }).catch(function () { return { failed: 'failed' }; });
  }
  // Brings the control in line with the greeting shown. With check=true an
  // unknown greeting is looked up once on the server (no recording made);
  // while typing (check=false) nothing is sent at all.
  function refreshPreview(check) {
    if (!ready() || !$('se-voice-preview-status')) return;
    var g = spoken(), k = keyOf(g);
    if (PV.state === 'loading' && PV.busyKey === k) { paintPreview(); return; }
    if (PV.known[k]) { setPreview('ready', '', PV.known[k]); return; }
    if (!check || PV.checked[k]) { setPreview(PV.had ? 'outdated' : 'none'); return; }
    PV.checked[k] = true;
    var seq = ++PV.seq;
    setPreview('checking');
    askPreview(g, false).then(function (d) {
      if (d && d.status === 'ready' && d.audioUrl) PV.known[k] = d.audioUrl;
      if (seq !== PV.seq) return;                 // the owner has moved on; cached above, not shown
      refreshPreview(false);
    });
  }
  function generatePreview() {
    if (!ready() || PV.state === 'loading' || PV.state === 'checking' || !voiceOn()) return;
    var g = spoken(), k = keyOf(g), seq = ++PV.seq, t = ptxt();
    PV.busyKey = k;
    setPreview('loading');
    askPreview(g, true).then(function (d) {
      var ok = d && d.status === 'ready' && d.audioUrl;
      if (ok) PV.known[k] = d.audioUrl;
      if (PV.busyKey === k) PV.busyKey = '';
      // A result for a greeting that is no longer the one shown is kept
      // for later but never presented as the current audio.
      if (seq !== PV.seq || keyOf(spoken()) !== k) { if (PV.state === 'loading') refreshPreview(false); return; }
      if (ok) { setPreview('ready', d.source === 'generated' ? t.done : '', d.audioUrl); return; }
      var code = d && d.code, http = d && d._http;
      var msg = d && d.failed === 'signin' || http === 401 ? t.signin : (http === 429 ? t.limit : (code === 'voice_off' ? t.off : t.failed));
      setPreview('error', msg);
    });
  }
  function togglePlay() {
    if (PV.state !== 'ready' || !PV.url) return;
    if (PV.playing) { stopAudio(); paintPreview(); return; }
    if (!PV.audio || PV.audio._url !== PV.url) {
      PV.audio = new window.Audio(PV.url); PV.audio._url = PV.url;
      var a = PV.audio;
      a.addEventListener('ended', function () { if (PV.audio === a) { PV.playing = false; paintPreview(); } });
      a.addEventListener('error', function () { if (PV.audio === a && PV.state === 'ready') { PV.playing = false; delete PV.known[keyOf(spoken())]; setPreview('error', ptxt().playfail); } });
    }
    PV.playing = true; paintPreview();
    var p; try { PV.audio.currentTime = 0; p = PV.audio.play(); } catch (e) { PV.playing = false; setPreview('error', ptxt().playfail); return; }
    if (p && p.catch) p.catch(function () { PV.playing = false; paintPreview(); });
  }
  function bindPreview() {
    var play = $('se-voice-preview-play'), gen = $('se-voice-preview-generate');
    if (!play || play._previewBound) return;
    play._previewBound = true;
    play.addEventListener('click', togglePlay);
    if (gen) gen.addEventListener('click', generatePreview);
  }
  // After Publish what is published may have changed: look again.
  function recheckPreview() { PV.checked = {}; refreshPreview(true); }

  // ── Preview and audio after publishing ───────────────────────
  var pollToken = 0;
  function showAudioStatus(text, color) {
    var el = $(IDS.audio); if (!el) return;
    el.textContent = text || ''; el.style.display = text ? 'block' : 'none'; el.style.color = color || 'rgba(240,244,248,0.6)';
  }
  function reloadPreview() {
    var iframe = $(IDS.iframe), slug = state() && state().slug;
    if (!iframe || !slug) return;
    iframe.src = window.QRAIVY_ROUTING.url(API + '/lp/' + encodeURIComponent(slug) + '?preview=1&t=' + Date.now());
  }
  // `data` is the answer of POST /lp. opts.skipReload: the caller has
  // already reloaded the preview itself.
  function afterSave(data, opts) {
    var token = ++pollToken;             // a newer publish replaces any wait still running
    if (!(opts && opts.skipReload)) reloadPreview();
    var info = data && data.voice;
    recheckPreview();
    if (!info) { showAudioStatus(''); return; }
    if (!info.enabled) { showAudioStatus(ui().off); return; }
    if (!info.pending) { showAudioStatus(''); return; }
    showAudioStatus(ui().pending);
    var slug = state().slug, tries = 0;
    function giveUp() { showAudioStatus(ui().slow, '#f59e0b'); }
    (function poll() {
      if (token !== pollToken) return;
      tries += 1;
      fetch(API + '/api/lp/' + encodeURIComponent(slug) + '?t=' + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (page) {
          if (token !== pollToken) return;
          var sections = null;
          try { sections = page && page.sections ? (typeof page.sections === 'string' ? JSON.parse(page.sections) : page.sections) : null; } catch (e) {}
          if (sections && sections.voice && sections.voice.audioUrl && sections.voice.audioFor === info.audioFor) {
            showAudioStatus(ui().ready, '#22d47e');
            reloadPreview();
            recheckPreview();
            return;
          }
          if (tries >= 20) { giveUp(); return; }
          setTimeout(poll, 3000);
        })
        .catch(function () { if (token !== pollToken) return; if (tries >= 20) { giveUp(); return; } setTimeout(poll, 3000); });
    })();
  }

  window.QRAIVY_VOICE_GREETING = { adopt: adopt, sync: sync, collect: collect, reset: reset, bind: bind, afterSave: afterSave, isVoiceOn: isVoiceOn, applyVoiceToggle: applyVoiceToggle, paintToggle: paintToggle };
})();
