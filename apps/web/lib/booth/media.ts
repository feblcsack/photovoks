/**
 * Booth media helpers (browser only): capture, filters, live-photo bursts,
 * sprite sheets and GIF encoding.
 *
 * Filters are implemented with pixel math (not ctx.filter) so they work on
 * older iPad Safari versions too.
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { createCanvas, canvasToBlob } from '@/lib/frames/render';
import { applyGrade, combine, isNeutral, PRESETS, type Adjustments } from './grade';

// ── Filters ──────────────────────────────────────────────────────────────────

export const FILTERS: Array<{ id: string; label: string; family?: 'vintage' | 'bold' }> = [
  { id: 'original', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'warm', label: 'Hangat' },
  { id: 'cool', label: 'Sejuk' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'sepia', label: 'Booth Sepia', family: 'vintage' },
  { id: 'noir', label: 'Booth Noir', family: 'vintage' },
  { id: 'film', label: 'Film 90an', family: 'vintage' },
  { id: 'flash', label: 'Kamera Sekali Pakai', family: 'vintage' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'cinema', label: 'Sinematik', family: 'bold' },
  { id: 'chrome', label: 'Kodachrome', family: 'bold' },
  { id: 'digicam', label: 'Digicam Y2K', family: 'bold' },
  { id: 'polaroid', label: 'Polaroid', family: 'bold' },
  { id: 'lomo', label: 'Lomo', family: 'bold' },
  { id: 'pinky', label: 'Pink Kalcer', family: 'bold' },
  { id: 'fade', label: 'Pudar' },
];

/**
 * Filters an event allows. Enabling "Vintage" also unlocks the vintage family
 * (sepia booth, noir, film, flash); enabling "Vivid" unlocks the bold family
 * (cinematic, Kodachrome, digicam, Polaroid, lomo, pink) — older events get
 * the new looks without re-saving settings.
 */
export function allowedFilterList(allowed: string[]) {
  return FILTERS.filter((f) => allowed.includes(f.id) || (f.family === 'vintage' && allowed.includes('vintage')) || (f.family === 'bold' && allowed.includes('vivid')));
}

/** CSS approximations (only for quick UI swatches — output uses pixel math). */
export const FILTER_CSS: Record<string, string> = {
  original: 'none',
  bw: 'grayscale(1) contrast(1.3)',
  warm: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg)',
  cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.03)',
  vintage: 'sepia(0.45) contrast(0.92) brightness(1.04) saturate(0.85)',
  vivid: 'saturate(1.6) contrast(1.2)',
  fade: 'contrast(0.8) brightness(1.08) saturate(0.75)',
  sepia: 'grayscale(1) sepia(0.8) contrast(1.25)',
  noir: 'grayscale(1) contrast(1.7) brightness(0.9)',
  film: 'sepia(0.22) saturate(0.85) contrast(0.9) brightness(1.06) hue-rotate(-8deg)',
  flash: 'saturate(1.35) contrast(1.35) brightness(1.12) sepia(0.12)',
  cinema: 'contrast(1.25) saturate(1.1) hue-rotate(-6deg)',
  chrome: 'contrast(1.3) saturate(1.45)',
  digicam: 'contrast(1.25) saturate(1.2) brightness(1.08) hue-rotate(8deg)',
  polaroid: 'sepia(0.3) contrast(0.9) saturate(0.95) brightness(1.06)',
  lomo: 'contrast(1.45) saturate(1.5)',
  pinky: 'sepia(0.15) hue-rotate(-18deg) saturate(1.2) brightness(1.06)',
};

/** Applies a preset (+ optional guest adjustments) in place. */
export function applyFilter(canvas: HTMLCanvasElement, id: string, adjust?: Partial<Adjustments> | null) {
  const preset = PRESETS[id] ?? PRESETS.original;
  if ((!id || id === 'original') && isNeutral(adjust)) return;
  applyGrade(canvas, combine(preset, adjust));
}

/** Returns a graded copy (source untouched; returns the source when nothing changes). */
export function filteredCopy(source: HTMLCanvasElement, id: string, adjust?: Partial<Adjustments> | null): HTMLCanvasElement {
  if ((!id || id === 'original') && isNeutral(adjust)) return source;
  const c = createCanvas(source.width, source.height);
  c.getContext('2d')!.drawImage(source, 0, 0);
  applyFilter(c, id, adjust);
  return c;
}

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * Grabs the current video frame, centre-cropped to `aspect` (w/h), optionally
 * mirrored, scaled so its width is at most `maxWidth`.
 */
export function grabFrame(video: HTMLVideoElement, aspect: number, mirror: boolean, maxWidth: number): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('Kamera belum siap');
  let cw = vw;
  let ch = Math.round(vw / aspect);
  if (ch > vh) {
    ch = vh;
    cw = Math.round(vh * aspect);
  }
  const sx = Math.round((vw - cw) / 2);
  const sy = Math.round((vh - ch) / 2);
  const scale = Math.min(1, maxWidth / cw);
  const out = createCanvas(cw * scale, ch * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export function toJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

// ── Live photo (burst) ───────────────────────────────────────────────────────

export const LIVE_FRAMES = 10;
export const LIVE_CELL_WIDTH = 300;

/** Pads/trims a burst to exactly LIVE_FRAMES frames. */
export function normalizeBurst(frames: HTMLCanvasElement[]): HTMLCanvasElement[] {
  if (!frames.length) return [];
  const out = frames.slice(-LIVE_FRAMES);
  while (out.length < LIVE_FRAMES) out.push(out[out.length - 1]);
  return out;
}

/** Packs bursts (one row per shot) into a single JPEG sprite sheet. */
export function buildSprite(bursts: HTMLCanvasElement[][], cellW: number, cellH: number): HTMLCanvasElement {
  const sprite = createCanvas(cellW * LIVE_FRAMES, cellH * bursts.length);
  const ctx = sprite.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, sprite.width, sprite.height);
  bursts.forEach((row, r) => row.forEach((f, c) => ctx.drawImage(f, c * cellW, r * cellH, cellW, cellH)));
  return sprite;
}

/** Forward then backward (without repeating the ends) — smooth loop. */
export function boomerang<T>(list: T[]): T[] {
  if (list.length < 3) return list;
  return [...list, ...list.slice(1, -1).reverse()];
}

// ── GIF ──────────────────────────────────────────────────────────────────────

/** Encodes canvases (same size) to an animated GIF. Yields to keep UI responsive. */
export async function encodeGif(frames: HTMLCanvasElement[], delayMs = 100, maxSide = 540): Promise<Blob> {
  if (!frames.length) throw new Error('Tidak ada frame');
  const s = Math.min(1, maxSide / Math.max(frames[0].width, frames[0].height));
  const w = Math.max(1, Math.round(frames[0].width * s));
  const h = Math.max(1, Math.round(frames[0].height * s));
  const scratch = createCanvas(w, h);
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    ctx.drawImage(frames[i], 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay: delayMs, repeat: 0 });
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.slice().buffer], { type: 'image/gif' });
}
