const https = require("https");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const VOICES = {
  sarah:   { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah - Warm & Professional", lang: "en" },
  laura:   { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura - Enthusiastic & Friendly", lang: "en" },
  charlie: { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie - Deep & Confident", lang: "en" },
  george:  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George - Captivating Storyteller", lang: "en" },
  river:   { id: "SAz9YHcvj6GT2YYXdXww", label: "River - Calm & Informative", lang: "en" },
  anna_de: { id: "EXAVITQu4vr4xnSDxMaL", label: "Anna - Warm & Professional (DE)", lang: "de" },
  max_de:  { id: "IKne3meq5aSn9XLyUdCD", label: "Max - Deep & Confident (DE)", lang: "de" },
};

const DEFAULT_TEXT = {
  en: (bizName) => "Welcome to " + bizName + "! Thanks for stopping by - we have got something special waiting for you. Explore our latest products and services, and chat with our AI assistant below for anything you need. And do not forget to allow notifications so you never miss our latest deals and drops. See you inside!",
  de: (bizName) => "Willkommen bei " + bizName + "! Schoen, dass Sie da sind - wir haben etwas Besonderes fuer Sie. Entdecken Sie unsere neuesten Produkte und Dienstleistungen und chatten Sie mit unserem KI-Assistenten. Vergessen Sie nicht, Benachrichtigungen zu erlauben, damit Sie keine Angebote verpassen. Bis gleich!",
};

async function generateAndUploadVoice(bizName, slug, voiceKey = "sarah", customText = null) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voice = VOICES[voiceKey] || VOICES.sarah;
  const lang = voice.lang || "en";
  const textFn = DEFAULT_TEXT[lang] || DEFAULT_TEXT.en;
  const cleanName = bizName.replace(/^Welcome to /i,"").replace(/^Welcome /i,"");
  const text = customText || textFn(cleanName);

  const body = JSON.stringify({
    text,
    model_id: "eleven_turbo_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  });

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

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder: "qraivy-voices", public_id: `voice-${slug}`, overwrite: true, format: "mp3" },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    uploadStream.end(audioBuffer);
  });

  return uploadResult.secure_url;
}

module.exports = { generateAndUploadVoice, VOICES };
