const https = require("https");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const VOICES = {
  sarah:   { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah - Warm & Professional" },
  laura:   { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura - Enthusiastic & Friendly" },
  charlie: { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie - Deep & Confident" },
  george:  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George - Captivating Storyteller" },
  river:   { id: "SAz9YHcvj6GT2YYXdXww", label: "River - Calm & Informative" },
};

async function generateAndUploadVoice(bizName, slug, voiceKey = "sarah", customText = null) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const voice = VOICES[voiceKey] || VOICES.sarah;
  const text = customText || `Welcome to ${bizName}! We are so glad you are here. For further information, ask anything to our AI agent below. We look forward to serving you!`;

  const body = JSON.stringify({
    text,
    model_id: "eleven_turbo_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  });

  // Generate audio from ElevenLabs
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

  // Upload to Cloudinary
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
