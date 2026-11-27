/**
 * Colour-grading engine for booth photos (browser only, pixel math — works on
 * older iPad Safari, and the review preview is exactly what gets printed).
 *
 * Every filter preset is just a set of grading parameters; guests' manual
 * adjustments are added on top of the preset. One pass per pixel + an
 * optional sharpen pass.
 */

export interface Grade {
  /** −100…100 ≈ −1.5…+1.5 stops */
  exposure?: number;
  /** −100…100 */
  contrast?: number;
  /** −100…100: recover (−) or boost (+) the bright tones */
  highlights?: number;
  /** −100…100: deepen (−) or lift (+) the dark tones */
  shadows?: number;
  /** −100…100 (−100 = black & white) */
  saturation?: number;
  /** −100…100: boosts muted colours more than vivid ones */
  vibrance?: number;
  /** −100 (cool/blue)…100 (warm/amber) */
  warmth?: number;
  /** −100 (green)…100 (magenta) */
  tint?: number;
  /** 0…100: lifted, matte blacks */
  fade?: number;
  /** 0…100 film grain */
  grain?: number;
  /** 0…100 darkened corners */
  vignette?: number;
  /** 0…100 */
  sharpness?: number;
  /** Look-only (presets): monochrome, sepia toning, split toning. */
  mono?: boolean;
  sepia?: number;
  splitShadow?: [string, number];
  splitHighlight?: [string, number];
}

export type Adjustments = Required<Pick<Grade, 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'saturation' | 'vibrance' | 'warmth' | 'tint' | 'fade' | 'grain' | 'vignette' | 'sharpness'>>;

export const NO_ADJUST: Adjustments = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, warmth: 0, tint: 0, fade: 0, grain: 0, vignette: 0, sharpness: 0 };

/** Guest-facing sliders (Indonesian labels, ranges). */
export const ADJUST_SLIDERS: Array<{ key: keyof Adjustments; label: string; min: number; max: number; group: 'cahaya' | 'warna' | 'efek' }> = [
  { key: 'exposure', label: 'Kecerahan', min: -100, max: 100, group: 'cahaya' },
  { key: 'contrast', label: 'Kontras', min: -100, max: 100, group: 'cahaya' },
  { key: 'highlights', label: 'Bagian terang', min: -100, max: 100, group: 'cahaya' },
  { key: 'shadows', label: 'Bagian gelap', min: -100, max: 100, group: 'cahaya' },
  { key: 'saturation', label: 'Saturasi', min: -100, max: 100, group: 'warna' },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, group: 'warna' },
  { key: 'warmth', label: 'Suhu (dingin ↔ hangat)', min: -100, max: 100, group: 'warna' },
  { key: 'tint', label: 'Tint (hijau ↔ magenta)', min: -100, max: 100, group: 'warna' },
  { key: 'fade', label: 'Pudar / matte', min: 0, max: 100, group: 'efek' },
  { key: 'grain', label: 'Grain film', min: 0, max: 100, group: 'efek' },
  { key: 'vignette', label: 'Vignet', min: 0, max: 100, group: 'efek' },
  { key: 'sharpness', label: 'Ketajaman', min: 0, max: 100, group: 'efek' },
];

export function isNeutral(a: Partial<Adjustments> | null | undefined): boolean {
  return !a || Object.values(a).every((v) => !v);
}

export function sanitizeAdjust(a: Partial<Adjustments> | null | undefined): Adjustments {
  const out = { ...NO_ADJUST };
  for (const s of ADJUST_SLIDERS) {
    const v = Number(a?.[s.key]);
    out[s.key] = Number.isFinite(v) ? Math.max(s.min, Math.min(s.max, Math.round(v))) : 0;
  }
  return out;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Preset + adjustments → one grade (numeric fields add up, looks are kept). */
export function combine(preset: Grade, adjust?: Partial<Adjustments> | null): Grade {
  if (!adjust) return preset;
  const out: Grade = { ...preset };
  for (const s of ADJUST_SLIDERS) {
    const v = (preset[s.key] ?? 0) + (adjust[s.key] ?? 0);
    out[s.key] = Math.max(s.min === 0 ? 0 : -150, Math.min(150, v));
  }
  return out;
}

/** Applies a grade to a canvas in place. */
export function applyGrade(canvas: HTMLCanvasElement, g: Grade) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  const expo = Math.pow(2, (g.exposure ?? 0) / 66);
  const con = 1 + (g.contrast ?? 0) / 100;
  const hi = (g.highlights ?? 0) * 0.55;
  const sh = (g.shadows ?? 0) * 0.55;
  const sat = 1 + (g.saturation ?? 0) / 100;
  const vib = (g.vibrance ?? 0) / 100;
  const warm = (g.warmth ?? 0) * 0.32;
  const tint = (g.tint ?? 0) * 0.28;
  const fade = (g.fade ?? 0) * 0.55;
  const sepia = g.sepia ?? 0;
  const ss = g.splitShadow ? hex(g.splitShadow[0]) : null;
  const ssA = g.splitShadow?.[1] ?? 0;
  const shl = g.splitHighlight ? hex(g.splitHighlight[0]) : null;
  const shlA = g.splitHighlight?.[1] ?? 0;
  // Grain/vignette scale with the image so a 300 px GIF frame and a 2000 px still match.
  const grainAmt = (g.grain ?? 0) * 0.42 * Math.min(1.4, Math.max(0.6, W / 1000));
  const vig = (g.vignette ?? 0) / 100;
  const cx = W / 2;
  const cy = H / 2;
  const maxD2 = cx * cx + cy * cy;
  let seed = 1234567;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * expo;
    let gg = d[i + 1] * expo;
    let b = d[i + 2] * expo;
    // white balance
    r += warm + tint * 0.4;
    gg -= tint;
    b += -warm + tint * 0.4;
    // contrast (around mid-grey)
    r = (r - 128) * con + 128;
    gg = (gg - 128) * con + 128;
    b = (b - 128) * con + 128;
    // highlights / shadows by luminance
    let L = 0.299 * r + 0.587 * gg + 0.114 * b;
    const ln = L / 255;
    if (hi || sh) {
      const delta = hi * smooth(0.45, 1, ln) + sh * (1 - smooth(0, 0.55, ln));
      r += delta;
      gg += delta;
      b += delta;
      L += delta;
    }
    // saturation + vibrance
    if (g.mono) {
      r = gg = b = L;
    } else if (sat !== 1 || vib) {
      const mx = Math.max(r, gg, b);
      const mn = Math.min(r, gg, b);
      const cur = mx > 0 ? (mx - mn) / Math.max(1, mx) : 0;
      const k = sat * (1 + vib * (1 - cur));
      r = L + (r - L) * k;
      gg = L + (gg - L) * k;
      b = L + (b - L) * k;
    }
    if (sepia) {
      r = r + (L * 1.07 + 8 - r) * sepia;
      gg = gg + (L * 0.95 + 2 - gg) * sepia;
      b = b + (L * 0.78 - 6 - b) * sepia;
    }
    // split toning
    const l2 = Math.max(0, Math.min(1, L / 255));
    if (ss && ssA) {
      const w = (1 - l2) * (1 - l2) * ssA;
      r += (ss[0] - r) * w;
      gg += (ss[1] - gg) * w;
      b += (ss[2] - b) * w;
    }
    if (shl && shlA) {
      const w = l2 * l2 * shlA;
      r += (shl[0] - r) * w;
      gg += (shl[1] - gg) * w;
      b += (shl[2] - b) * w;
    }
    // fade: lifted blacks, softened whites
    if (fade) {
      const k = 1 - fade / 255 - fade / 900;
      r = fade + r * k;
      gg = fade + gg * k;
      b = fade + b * k;
    }
    if (vig || grainAmt) {
      const p = i >> 2;
      const x = p % W;
      const y = (p / W) | 0;
      const dx = x - cx;
      const dy = y - cy;
      const v = 1 - vig * 0.75 * Math.pow((dx * dx + dy * dy) / maxD2, 1.3);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = (seed / 4294967296 - 0.5) * grainAmt;
      r = r * v + n;
      gg = gg * v + n;
      b = b * v + n;
    }
    d[i] = clamp(r);
    d[i + 1] = clamp(gg);
    d[i + 2] = clamp(b);
  }
  if ((g.sharpness ?? 0) > 0) sharpen(d, W, H, (g.sharpness ?? 0) / 100);
  ctx.putImageData(img, 0, 0);
}

/** Unsharp-style 3×3 sharpen, strength 0…1. */
function sharpen(d: Uint8ClampedArray, W: number, H: number, amount: number) {
  const src = new Uint8ClampedArray(d);
  const a = amount * 0.9;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const j = i + c;
        const lap = 4 * src[j] - src[j - 4] - src[j + 4] - src[j - W * 4] - src[j + W * 4];
        d[j] = clamp(src[j] + lap * a);
      }
    }
  }
}

// ── Presets (bold looks) ─────────────────────────────────────────────────────

export const PRESETS: Record<string, Grade> = {
  original: {},
  bw: { mono: true, contrast: 30, shadows: -12, highlights: 8, grain: 8 },
  warm: { warmth: 45, saturation: 15, contrast: 12, highlights: -10 },
  cool: { warmth: -40, tint: -6, saturation: 6, contrast: 12, highlights: 6 },
  vintage: { warmth: 25, fade: 35, saturation: -15, contrast: -4, splitShadow: ['#1F6E6A', 0.16], grain: 14, vignette: 30 },
  sepia: { mono: true, sepia: 1, contrast: 25, fade: 22, grain: 20, vignette: 45 },
  noir: { mono: true, contrast: 70, exposure: -10, shadows: -25, highlights: 10, grain: 24, vignette: 55 },
  film: { fade: 30, saturation: -10, warmth: 10, splitShadow: ['#1F6E6A', 0.24], splitHighlight: ['#F4B860', 0.16], grain: 16, vignette: 25 },
  flash: { exposure: 12, contrast: 35, saturation: 30, warmth: 15, highlights: -5, vignette: 60, grain: 10 },
  vivid: { saturation: 45, vibrance: 25, contrast: 22, shadows: -6 },
  fade: { fade: 45, contrast: -20, saturation: -20, exposure: 5 },
  // Bold family (unlocked together with Vivid)
  cinema: { contrast: 25, saturation: 10, splitShadow: ['#0E5A6B', 0.38], splitHighlight: ['#F2A65A', 0.3], highlights: -10, vignette: 20 },
  chrome: { contrast: 30, saturation: 35, vibrance: 20, warmth: 10, shadows: -12 },
  digicam: { exposure: 6, contrast: 25, warmth: -15, tint: 8, saturation: 20, highlights: 0, grain: 6, sharpness: 40 },
  polaroid: { fade: 26, warmth: 20, contrast: -5, splitShadow: ['#4E7A4A', 0.22], splitHighlight: ['#FFF1CC', 0.18], vignette: 35, grain: 8 },
  lomo: { contrast: 45, saturation: 40, vignette: 80, splitShadow: ['#3A2A7A', 0.22], exposure: 4 },
  pinky: { tint: 30, warmth: 10, highlights: 10, splitHighlight: ['#FF9BD2', 0.26], fade: 15, saturation: 10 },
};
