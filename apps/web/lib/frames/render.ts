/**
 * The ONE renderer for frame designs. Used by:
 *  - the Frame Builder canvas (live preview, placeholders),
 *  - the booth (final strip composition),
 *  - thumbnails + print sheets.
 * Because every surface uses the same code, the editor preview matches the
 * printed result exactly.
 */
import { canvasFont, ensureFonts } from './fonts';
import { encode as encodeQr } from 'uqr';
import type { FrameDesign, FrameElement, PhotoElement, QrElement, TextElement } from './types';
import { collectAssets } from './types';

export type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Photo per slot index (null → placeholder or empty). */
  photos?: (Drawable | null)[];
  /** Loaded images keyed by asset path. */
  assets?: Map<string, Drawable>;
  /** Draw labelled placeholders for empty slots (editor). */
  placeholders?: boolean;
  /** Token values for text: {date} {time} {event} {code} */
  tokens?: Record<string, string>;
  /** Output scale (1 = design pixels). */
  scale?: number;
  /** Real session link for QR elements (sample code when absent). */
  qrValue?: string;
}

const PLACEHOLDER_COLORS = ['#C9D6FF', '#C8EBD9', '#FFE3B8', '#F8CFE0', '#D9CCF7', '#C7ECF2', '#F3E3A6', '#E2D3C5'];

function sizeOf(img: Drawable): { w: number; h: number } {
  if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) return { w: img.videoWidth, h: img.videoHeight };
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return { w: img.naturalWidth, h: img.naturalHeight };
  return { w: (img as ImageBitmap).width, h: (img as ImageBitmap).height };
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draws `img` into the rect with cover/contain/stretch semantics. */
export function drawFitted(ctx: Ctx, img: Drawable, x: number, y: number, w: number, h: number, fit: 'cover' | 'contain' | 'stretch' = 'cover') {
  const { w: iw, h: ih } = sizeOf(img);
  if (!iw || !ih) return;
  if (fit === 'stretch') {
    ctx.drawImage(img as CanvasImageSource, x, y, w, h);
    return;
  }
  const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  if (fit === 'cover') {
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img as CanvasImageSource, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  } else {
    ctx.drawImage(img as CanvasImageSource, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
}

export function applyTokens(text: string, tokens: Record<string, string> = {}): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in tokens ? tokens[k] : m));
}

export function defaultTokens(eventName = '', code = '', when = new Date()): Record<string, string> {
  const dd = String(when.getDate()).padStart(2, '0');
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  return {
    date: `${dd}/${mm}/${when.getFullYear()}`,
    time: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`,
    event: eventName,
    code,
  };
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number, letterSpacing: number): string[] {
  const out: string[] = [];
  const measure = (s: string) => ctx.measureText(s).width + Math.max(0, s.length - 1) * letterSpacing;
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (line && measure(candidate.trimEnd()) > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function drawSpacedText(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: TextElement['align']) {
  if (!spacing) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
  const total = ctx.measureText(text).width + Math.max(0, text.length - 1) * spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function drawText(ctx: Ctx, el: TextElement, tokens?: Record<string, string>) {
  const content = applyTokens(el.uppercase ? el.text.toUpperCase() : el.text, tokens);
  ctx.font = canvasFont(el.font, el.weight, el.size, el.italic);
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, content, el.w, el.letterSpacing);
  const lh = el.size * el.lineHeight;
  const anchorX = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
  // Small top inset so ascenders aren't clipped with tight line heights.
  const offset = (lh - el.size) / 2;
  lines.forEach((line, i) => drawSpacedText(ctx, line, anchorX, el.y + offset + i * lh, el.letterSpacing, el.align));
}

/** Deterministic pseudo-random bar pattern from a seed. */
function drawBarcode(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, seed: string) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const units: number[] = [];
  let total = 0;
  while (total < 95) {
    const u = 1 + Math.floor(rand() * 3);
    units.push(u);
    total += u;
  }
  const unit = w / total;
  ctx.fillStyle = color;
  let cx = x;
  units.forEach((u, i) => {
    if (i % 2 === 0) ctx.fillRect(cx, y, Math.max(1, u * unit), h);
    cx += u * unit;
  });
}

function drawPhoto(ctx: Ctx, el: PhotoElement, opts: RenderOptions) {
  const photo = opts.photos?.[el.slot] ?? null;
  ctx.save();
  roundedRect(ctx, el.x, el.y, el.w, el.h, el.radius);
  ctx.clip();
  if (photo) {
    drawFitted(ctx, photo, el.x, el.y, el.w, el.h, 'cover');
  } else if (opts.placeholders) {
    ctx.fillStyle = PLACEHOLDER_COLORS[el.slot % PLACEHOLDER_COLORS.length];
    ctx.fillRect(el.x, el.y, el.w, el.h);
    const size = Math.max(14, Math.min(el.w, el.h) * 0.14);
    ctx.font = canvasFont('sans', 600, size);
    ctx.fillStyle = 'rgba(20,30,60,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Foto ${el.slot + 1}`, el.x + el.w / 2, el.y + el.h / 2);
  }
  ctx.restore();
  if (el.borderWidth > 0) {
    ctx.save();
    roundedRect(ctx, el.x + el.borderWidth / 2, el.y + el.borderWidth / 2, el.w - el.borderWidth, el.h - el.borderWidth, Math.max(0, el.radius - el.borderWidth / 2));
    ctx.strokeStyle = el.borderColor;
    ctx.lineWidth = el.borderWidth;
    ctx.stroke();
    ctx.restore();
  }
}

/** Shown wherever no real session link is known yet (editor, thumbnails, previews). */
export const SAMPLE_QR_VALUE = 'https://photovoks.app/s/contoh-qr-sesi';

const qrCache = new Map<string, boolean[][]>();
function qrMatrix(value: string): boolean[][] {
  let m = qrCache.get(value);
  if (!m) {
    m = encodeQr(value, { ecc: 'M', border: 0 }).data;
    if (qrCache.size > 20) qrCache.clear();
    qrCache.set(value, m);
  }
  return m;
}

function drawQr(ctx: Ctx, el: QrElement, opts: RenderOptions) {
  const value = opts.qrValue || SAMPLE_QR_VALUE;
  const matrix = qrMatrix(value);
  const n = matrix.length + el.margin * 2;
  const side = Math.min(el.w, el.h);
  // Caption lives inside the square, under the code.
  const captionH = el.caption ? Math.round(side * 0.16) : 0;
  const codeSide = side - captionH;
  const cx = el.x + (side - codeSide) / 2;
  if (el.background !== 'transparent') {
    ctx.fillStyle = el.background;
    roundedRect(ctx, el.x, el.y, side, side, el.radius);
    ctx.fill();
  }
  const unit = codeSide / n;
  ctx.fillStyle = el.color;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (!matrix[r][c]) continue;
      // +0.5px overlap avoids hairline seams between modules.
      ctx.fillRect(cx + (c + el.margin) * unit, el.y + (r + el.margin) * unit, unit + 0.5, unit + 0.5);
    }
  }
  if (el.caption) {
    ctx.fillStyle = el.captionColor ?? el.color;
    ctx.font = canvasFont('sans', 700, Math.max(8, captionH * 0.5));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.caption, el.x + side / 2, el.y + codeSide + captionH * 0.42, side * 0.94);
  }
  if (!opts.qrValue && opts.placeholders) {
    // Editor hint: dashed outline so owners see the reserved area.
    ctx.save();
    ctx.setLineDash([Math.max(4, side * 0.04), Math.max(3, side * 0.03)]);
    ctx.strokeStyle = 'rgba(37,99,235,0.85)';
    ctx.lineWidth = Math.max(2, side * 0.012);
    ctx.strokeRect(el.x, el.y, side, side);
    ctx.restore();
  }
}

export function drawElement(ctx: Ctx, el: FrameElement, opts: RenderOptions) {
  if (el.hidden) return;
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  switch (el.type) {
    case 'photo':
      drawPhoto(ctx, el, opts);
      break;
    case 'text':
      drawText(ctx, el, opts.tokens);
      break;
    case 'image': {
      const img = opts.assets?.get(el.asset.path);
      if (img) {
        roundedRect(ctx, el.x, el.y, el.w, el.h, el.radius);
        ctx.clip();
        drawFitted(ctx, img, el.x, el.y, el.w, el.h, el.fit);
      } else if (opts.placeholders) {
        ctx.fillStyle = '#E5E7EB';
        ctx.fillRect(el.x, el.y, el.w, el.h);
      }
      break;
    }
    case 'rect':
    case 'ellipse': {
      ctx.beginPath();
      if (el.type === 'ellipse') ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      else roundedRect(ctx, el.x, el.y, el.w, el.h, el.radius);
      if (el.fill !== 'transparent') {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      if (el.strokeWidth > 0 && el.stroke !== 'transparent') {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'line': {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.thickness;
      if (el.dash > 0) ctx.setLineDash([el.dash, el.dash * 0.8]);
      ctx.beginPath();
      if (el.w >= el.h) {
        ctx.moveTo(el.x, el.y + el.h / 2);
        ctx.lineTo(el.x + el.w, el.y + el.h / 2);
      } else {
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x + el.w / 2, el.y + el.h);
      }
      ctx.stroke();
      break;
    }
    case 'qr':
      drawQr(ctx, el, opts);
      break;
    case 'barcode':
      drawBarcode(ctx, el.x, el.y, el.w, el.h, el.color, el.seed);
      break;
  }
  ctx.restore();
}

/** Renders a full design onto a context sized design.width*scale × design.height*scale. */
export function renderDesign(ctx: Ctx, design: FrameDesign, opts: RenderOptions = {}) {
  const scale = opts.scale ?? 1;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, design.width, design.height);
  ctx.fillStyle = design.background.color === 'transparent' ? '#ffffff' : design.background.color;
  ctx.fillRect(0, 0, design.width, design.height);
  const bg = design.background.image ? opts.assets?.get(design.background.image.path) : null;
  if (bg) drawFitted(ctx, bg, 0, 0, design.width, design.height, design.background.imageFit ?? 'cover');
  for (const el of design.elements) drawElement(ctx, el, opts);
  ctx.restore();
}

// ── Asset loading ────────────────────────────────────────────────────────────

const assetCache = new Map<string, Promise<ImageBitmap | null>>();

/** Decodes via an <img> element (fallback when fetch() is blocked, e.g. by CSP or CORS). */
function loadViaImage(url: string): Promise<ImageBitmap | HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (typeof createImageBitmap === 'function') createImageBitmap(img).then(resolve, () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Loads an image URL → ImageBitmap (CORS-safe, keeps canvas untainted).
 * fetch() first; falls back to an <img> decode so freshly uploaded assets
 * (blob: URLs) and odd CDN responses never end up as a grey placeholder.
 * Failed loads are NOT cached, so a later retry can succeed.
 */
export function loadBitmap(url: string): Promise<ImageBitmap | null> {
  const cached = assetCache.get(url);
  if (cached) return cached;
  const p = fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((b) => createImageBitmap(b))
    .catch(() => loadViaImage(url) as Promise<ImageBitmap | null>)
    .then((bmp) => {
      if (!bmp) assetCache.delete(url);
      return bmp;
    });
  assetCache.set(url, p);
  return p;
}

/** Loads every image + font a design needs. Missing assets are skipped. */
export async function prepareDesign(design: FrameDesign): Promise<Map<string, Drawable>> {
  const refs = collectAssets(design);
  const map = new Map<string, Drawable>();
  await Promise.all([
    ensureFonts(design.elements.filter((e): e is TextElement => e.type === 'text')),
    ensureFonts([{ font: 'sans', weight: 600 }]),
    ...refs.map(async (ref) => {
      if (!ref.url) return;
      const bmp = await loadBitmap(ref.url);
      if (bmp) map.set(ref.path, bmp);
    }),
  ]);
  return map;
}

// ── Output helpers ───────────────────────────────────────────────────────────

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob gagal'))), type, quality),
  );
}

/** Composes a full-resolution strip from photos. */
export async function composeDesign(
  design: FrameDesign,
  photos: (Drawable | null)[],
  tokens: Record<string, string>,
  assets?: Map<string, Drawable>,
): Promise<HTMLCanvasElement> {
  const loaded = assets ?? (await prepareDesign(design));
  const canvas = createCanvas(design.width, design.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  renderDesign(ctx, design, { photos, assets: loaded, tokens });
  return canvas;
}

/** Downscaled copy (thumbnails). */
export function scaledCopy(source: HTMLCanvasElement, maxW: number, maxH = maxW * 4): HTMLCanvasElement {
  const s = Math.min(1, maxW / source.width, maxH / source.height);
  const c = createCanvas(source.width * s, source.height * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}
