/**
 * Booth media helpers (browser only): capture, filters, live-photo bursts,
 * sprite sheets and GIF encoding.
 *
 * Filters are implemented with pixel math (not ctx.filter) so they work on
 * older iPad Safari versions too.
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { createCanvas, canvasToBlob } from '@/lib/frames/render';

// ── Filters ──────────────────────────────────────────────────────────────────

export const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'warm', label: 'Hangat' },
  { id: 'cool', label: 'Sejuk' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'fade', label: 'Pudar' },
];

/** CSS preview equivalents (live camera preview only — output uses pixel math). */
export const FILTER_CSS: Record<string, string> = {
  original: 'none',
  bw: 'grayscale(1) contrast(1.08)',
  warm: 'sepia(0.18) saturate(1.15) hue-rotate(-6deg)',
  cool: 'saturate(0.95) hue-rotate(8deg) brightness(1.02)',
  vintage: 'sepia(0.45) contrast(0.92) brightness(1.04) saturate(0.85)',
  vivid: 'saturate(1.35) contrast(1.08)',
  fade: 'contrast(0.85) brightness(1.08) saturate(0.8)',
};

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function applyFilter(canvas: HTMLCanvasElement, id: string) {
  if (!id || id === 'original') return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    switch (id) {
      case 'bw': {
        const c = (lum - 128) * 1.08 + 128;
        r = g = b = c;
        break;
      }
      case 'warm':
        r = r * 1.08 + 8;
        g = g * 1.02 + 2;
        b = b * 0.9;
        break;
      case 'cool':
        r = r * 0.92;
        g = g * 1.0 + 2;
        b = b * 1.08 + 8;
        break;
      case 'vintage': {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = r * 0.55 + sr * 0.45;
        g = g * 0.55 + sg * 0.45;
        b = b * 0.55 + sb * 0.45;
        r = (r - 128) * 0.9 + 138;
        g = (g - 128) * 0.9 + 132;
        b = (b - 128) * 0.9 + 120;
        break;
      }
      case 'vivid': {
        r = lum + (r - lum) * 1.35;
        g = lum + (g - lum) * 1.35;
        b = lum + (b - lum) * 1.35;
        r = (r - 128) * 1.08 + 128;
        g = (g - 128) * 1.08 + 128;
        b = (b - 128) * 1.08 + 128;
        break;
      }
      case 'fade':
        r = (lum + (r - lum) * 0.8 - 128) * 0.85 + 146;
        g = (lum + (g - lum) * 0.8 - 128) * 0.85 + 146;
        b = (lum + (b - lum) * 0.8 - 128) * 0.85 + 150;
        break;
    }
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
  ctx.putImageData(img, 0, 0);
}

/** Returns a filtered copy (source untouched). */
export function filteredCopy(source: HTMLCanvasElement, id: string): HTMLCanvasElement {
  if (!id || id === 'original') return source;
  const c = createCanvas(source.width, source.height);
  c.getContext('2d')!.drawImage(source, 0, 0);
  applyFilter(c, id);
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
