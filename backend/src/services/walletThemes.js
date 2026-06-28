// walletThemes.js
// Theme definitions for Apple/Google Wallet pass rendering. Pass generation
// code (passService.js, googleWalletService.js) should only ever read from
// a resolved theme object — never hardcode copy, colors, or layout directly —
// so adding a new theme later means adding an entry here, not touching the
// pass-building logic.

// ── Pure-JS hero/strip banner renderer (pngjs — no native deps) ───────────
const { PNG } = require('pngjs');

function hexToRgbTuple(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 90, 31];
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

// Deterministic per-pixel hash (no Math.random) so re-renders are stable.
function pseudoNoise(x, y) {
  let h = (x * 374761393 + y * 668265263) % 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) % 1000) / 1000; // 0..1
}

/**
 * Renders a premium gradient + subtle-texture banner as a PNG buffer.
 * Diagonal gradient between a darker and lighter shade of the accent color,
 * with a faint deterministic noise texture for a non-flat, "fabric/brushed"
 * feel. Intentionally subtle — no loud patterns.
 */
function renderHeroBanner(accentHex, { width = 1032, height = 336 } = {}) {
  const [r, g, b] = hexToRgbTuple(accentHex);
  const png = new PNG({ width, height });
  const darkFactor = 0.78;   // shadow end of gradient
  const lightFactor = 1.18;  // highlight end of gradient
  const textureStrength = 6; // max +/- brightness jitter (subtle)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width) * 0.6 + (y / height) * 0.4; // diagonal blend
      const factor = darkFactor + (lightFactor - darkFactor) * t;
      const noise = (pseudoNoise(x, y) - 0.5) * 2 * textureStrength;
      const idx = (width * y + x) << 2;
      png.data[idx]     = clamp(r * factor + noise);
      png.data[idx + 1] = clamp(g * factor + noise);
      png.data[idx + 2] = clamp(b * factor + noise);
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// ── Theme registry ──────────────────────────────────────────────────────
// Each theme controls: copy/labels, banner render params, and field layout
// hints. Only "premium" is fully implemented today; the others are present
// so future work can diverge without restructuring pass generation.
const THEMES = {
  premium: {
    name: 'premium',
    labels: {
      // Apple's headerField sits on the same row as the primary field (the
      // business name) — long text here collides with longer business names,
      // so this must stay very short.
      cardKicker: 'CARD',
      progressLabel: 'Loyalty Progress',
      stampsLabel: 'Current Stamps',
      rewardLabel: 'Reward',
      rewardReadyLabel: 'Available Reward',
      rewardReadyHeader: 'READY',
      backRewardLabel: 'YOUR REWARD',
      backWebsiteLabel: 'VISIT PAGE',
      backHowToLabel: 'HOW TO COLLECT STAMPS',
      backAddressLabel: 'ADDRESS',
      backPhoneLabel: 'PHONE',
      backHoursLabel: 'OPENING HOURS',
      backTermsLabel: 'TERMS',
      termsText: 'One stamp per visit. Rewards are non-transferable and have no cash value. The business reserves the right to change the loyalty program at any time.',
    },
    banner: { darkFactor: 0.78, lightFactor: 1.18, textureStrength: 6 },
  },
  // Stubs — alias to premium for now. Flesh out independently later.
  classic: null,
  minimal: null,
  luxury: null,
};
THEMES.classic = THEMES.premium;
THEMES.minimal = THEMES.premium;
THEMES.luxury = THEMES.premium;

function getTheme(name) {
  return THEMES[name] || THEMES.premium;
}

module.exports = { getTheme, renderHeroBanner, THEMES };
