const https = require("https");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// One standard voice per language. Every welcome greeting is spoken by
// the voice of its language -- an English greeting is never read by the
// German voice or the other way round.
//
// Both ids are the ones this service has always used as its defaults
// ("sarah" for English, "anna_de" for German). `model` and `settings`
// are part of what makes a recording what it is, so they are included in
// the audio fingerprint (see lpVoiceService.voiceFingerprint): changing
// any of them here regenerates audio on each page's next save.
const STANDARD_VOICES = {
  en: {
    key: "sarah", id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah - Warm & Professional",
    model: "eleven_turbo_v2",
    settings: { stability: 0.5, similarity_boost: 0.75 },
  },
  de: {
    key: "anna_de", id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte - Natural German Female",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.65, similarity_boost: 0.80, style: 0.3, use_speaker_boost: true },
  },
};

function standardVoice(lang) {
  return lang === "de" ? STANDARD_VOICES.de : STANDARD_VOICES.en;
}

// Speaks `text` in the standard voice of `lang`, stores the MP3 and
// returns its address. Throws if speech or storage fails -- the caller
// decides what a failure means; nothing here returns a placeholder.
async function synthesizeAndUploadVoice({ slug, text, lang }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  if (typeof text !== "string" || !text.trim()) throw new Error("No greeting text to speak");

  const voice = standardVoice(lang);
  const body = JSON.stringify({ text, model_id: voice.model, voice_settings: voice.settings });

  const audioBuffer = await new Promise((resolve, reject) => {
    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${voice.id}`,
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode === 200) resolve(buf);
        else reject(new Error("ElevenLabs error: " + buf.toString().slice(0, 200)));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  // One file per page, replaced in place. Cloudinary's returned address
  // carries a new version number each time, so a regenerated greeting is
  // never served from a cached copy of the old one.
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder: "qraivy-voices", public_id: `voice-${slug}`, overwrite: true, format: "mp3" },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    uploadStream.end(audioBuffer);
  });

  return uploadResult.secure_url;
}

module.exports = { synthesizeAndUploadVoice, standardVoice, STANDARD_VOICES };
