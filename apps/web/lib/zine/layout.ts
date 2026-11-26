/**
 * Mini zine (8 pages from ONE sheet, one cut) — layout + renderer.
 *
 * The sheet is landscape, 4 columns × 2 rows. The top row is printed
 * upside-down so that after folding every page is upright:
 *
 *   ┌──────┬──────┬──────┬──────┐
 *   │  6 ↻ │  5 ↻ │  4 ↻ │  3 ↻ │   ← top row (rotated 180°)
 *   ├──────┼══════┼══════┼──────┤   ═ = cut line (center, 2 panels)
 *   │ BACK │FRONT │  1   │  2   │
 *   └──────┴──────┴──────┴──────┘
 *
 * Page index: 0 = front cover, 1…6 = inside pages, 7 = back cover.
 * Browser only (canvas).
 */
import { createCanvas, type Drawable } from '@/lib/frames/render';
import { canvasFont } from '@/lib/frames/fonts';
import type { FontKey } from '@/lib/frames/types';
import { filteredCopy } from '@/lib/booth/media';

export const ZINE_PAGE_COUNT = 8;
export const PAGE_NAMES = ['Sampul depan', 'Hal. 1', 'Hal. 2', 'Hal. 3', 'Hal. 4', 'Hal. 5', 'Hal. 6', 'Sampul belakang'];
export const PAGE_SHORT = ['Depan', '1', '2', '3', '4', '5', '6', 'Blkg'];

/** Where each page sits on the sheet. */
export const ZINE_CELLS: Array<{ col: number; row: 0 | 1; flipped: boolean }> = [
  { col: 1, row: 1, flipped: false }, // front
  { col: 2, row: 1, flipped: false }, // 1
  { col: 3, row: 1, flipped: false }, // 2
  { col: 3, row: 0, flipped: true }, // 3
  { col: 2, row: 0, flipped: true }, // 4
  { col: 1, row: 0, flipped: true }, // 5
  { col: 0, row: 0, flipped: true }, // 6
  { col: 0, row: 1, flipped: false }, // back
];

export interface ZinePaper {
  id: string;
  label: string;
  /** Landscape sheet size in mm. */
  widthMm: number;
  heightMm: number;
  hint: string;
}

export const ZINE_PAPERS: ZinePaper[] = [
  { id: 'a4', label: 'A4', widthMm: 297, heightMm: 210, hint: 'Paling umum · printer rumah/kantor' },
  { id: 'letter', label: 'US Letter', widthMm: 279.4, heightMm: 215.9, hint: 'Kertas Letter 8.5×11"' },
  { id: 'a3', label: 'A3', widthMm: 420, heightMm: 297, hint: 'Zine lebih besar · fotokopi/percetakan' },
  { id: 'a5', label: 'A5', widthMm: 210, heightMm: 148, hint: 'Zine saku mungil' },
  { id: '4x6', label: '4R · 4×6"', widthMm: 152.4, heightMm: 101.6, hint: 'Micro-zine dari printer foto booth' },
];

export function zinePaper(id: string | null | undefined): ZinePaper {
  return ZINE_PAPERS.find((p) => p.id === id) ?? ZINE_PAPERS[0];
}

/** Finished page size in mm (one panel). */
export function pageSizeMm(paper: ZinePaper) {
  return { w: paper.widthMm / 4, h: paper.heightMm / 2 };
}

/** Panel aspect ratio (w/h) — the same for every page. */
export function pageAspect(paper: ZinePaper) {
  const s = pageSizeMm(paper);
  return s.w / s.h;
}

// ── Page model ───────────────────────────────────────────────────────────────

export type ZineLayout = 'full' | 'framed' | 'polaroid' | 'duo' | 'text';

export interface ZineSticker {
  key: string;
  id: string;
  /** Centre position, fraction of page width/height. */
  x: number;
  y: number;
  /** Width, fraction of page width. */
  s: number;
  r: number;
}

export interface ZinePage {
  layout: ZineLayout;
  /** Image source keys (see ZineImages). `duo` uses two. */
  images: (string | null)[];
  /** 1 = fit to cover; up to 3. */
  zoom: number;
  /** Pan offset, -1…1 of the overflow. */
  panX: number;
  panY: number;
  filter: string;
  bg: string;
  caption: string;
  captionFont: FontKey;
  captionColor: string;
  captionPos: 'top' | 'bottom' | 'center';
  stickers: ZineSticker[];
}

export const PAGE_BGS = ['#FFFCF4', '#F4EDDC', '#1A1410', '#C4201A', '#2747C9', '#FF9BD2', '#C9F25C', '#3F7360', '#6E0C0E', '#9ED8FF'];
export const CAPTION_COLORS = ['#1A1410', '#FFFFFF', '#C4201A', '#2747C9', '#FF9BD2', '#C9F25C', '#FFD43B'];
export const CAPTION_FONTS: FontKey[] = ['bubble', 'typewriter', 'scribble', 'marker', 'display', 'serif', 'script', 'sans'];

export const LAYOUTS: Array<{ id: ZineLayout; label: string }> = [
  { id: 'full', label: 'Penuh' },
  { id: 'framed', label: 'Bingkai' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'duo', label: '2 foto' },
  { id: 'text', label: 'Teks' },
];

export function blankPage(i: number, title = '', subtitle = ''): ZinePage {
  const base: ZinePage = {
    layout: 'full',
    images: [null, null],
    zoom: 1,
    panX: 0,
    panY: 0,
    filter: 'original',
    bg: '#FFFCF4',
    caption: '',
    captionFont: 'typewriter',
    captionColor: '#1A1410',
    captionPos: 'bottom',
    stickers: [],
  };
  if (i === 0) return { ...base, layout: 'framed', bg: '#C4201A', caption: title || 'my lil zine', captionFont: 'bubble', captionColor: '#FFFCF4', captionPos: 'top' };
  if (i === 7) return { ...base, layout: 'text', bg: '#F4EDDC', caption: subtitle || 'made with photovoks ✶', captionFont: 'typewriter', captionPos: 'center' };
  if (i === 3) return { ...base, layout: 'polaroid', captionFont: 'scribble', caption: 'best day ever' };
  return base;
}

/** Fills the pages with photos in order (keeps captions/stickers). */
export function autoFill(pages: ZinePage[], keys: string[]): ZinePage[] {
  if (!keys.length) return pages;
  let k = 0;
  return pages.map((p, i) => {
    if (p.layout === 'text' || i === 7) return p;
    const take = () => keys[k++ % keys.length];
    return { ...p, images: p.layout === 'duo' ? [take(), take()] : [take(), p.images[1] ?? null] };
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Loaded images by key (already decoded). */
export type ZineImages = Map<string, Drawable>;
export type StickerImages = Map<string, Drawable>;

const filterCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();
/** Downscaled + filtered copy, cached per source image. */
function filtered(img: Drawable, filter: string, maxSide: number): Drawable {
  const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width;
  const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height;
  const key = `${filter}@${maxSide}`;
  let m = filterCache.get(img as object);
  if (!m) {
    m = new Map();
    filterCache.set(img as object, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const s = Math.min(1, maxSide / Math.max(iw, ih));
  const c = createCanvas(iw * s, ih * s);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  const out = filter && filter !== 'original' ? filteredCopy(c, filter) : c;
  m.set(key, out);
  return out;
}

function sizeOf(img: Drawable) {
  return { w: (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width, h: (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height };
}

/** Cover-fit with zoom + pan inside a rect. */
function drawPanned(ctx: CanvasRenderingContext2D, img: Drawable, x: number, y: number, w: number, h: number, zoom: number, panX: number, panY: number) {
  const { w: iw, h: ih } = sizeOf(img);
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih) * Math.max(1, zoom);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = ((dw - w) / 2) * Math.max(-1, Math.min(1, panX));
  const oy = ((dh - h) / 2) * Math.max(-1, Math.min(1, panY));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img as CanvasImageSource, x + (w - dw) / 2 - ox, y + (h - dh) / 2 - oy, dw, dh);
  ctx.restore();
}

function emptySlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, unit: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(26,20,16,0.06)';
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([unit * 2, unit * 1.5]);
  ctx.strokeStyle = 'rgba(26,20,16,0.35)';
  ctx.lineWidth = Math.max(1, unit * 0.35);
  ctx.strokeRect(x + unit, y + unit, w - unit * 2, h - unit * 2);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(t).width > maxW) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export interface RenderPageOptions {
  images: ZineImages;
  stickers: StickerImages;
  /** Max source side used for filtering (preview vs print). */
  quality?: number;
  /** Draw hints for empty slots. */
  hints?: boolean;
}

/** Draws one page into (0,0,w,h) of ctx. */
export function renderPage(ctx: CanvasRenderingContext2D, page: ZinePage, w: number, h: number, opts: RenderPageOptions) {
  const unit = w / 60;
  const q = opts.quality ?? 1400;
  ctx.save();
  ctx.fillStyle = page.bg;
  ctx.fillRect(0, 0, w, h);
  const img = (i: number) => {
    const k = page.images[i];
    const src = k ? opts.images.get(k) : null;
    return src ? filtered(src, page.filter, q) : null;
  };
  const hasCaption = !!page.caption.trim();
  const capH = hasCaption ? h * 0.16 : 0;

  const photoIn = (i: number, x: number, y: number, pw: number, ph: number) => {
    const im = img(i);
    if (im) drawPanned(ctx, im, x, y, pw, ph, page.zoom, page.panX, page.panY);
    else if (opts.hints) emptySlot(ctx, x, y, pw, ph, unit);
  };

  switch (page.layout) {
    case 'full':
      photoIn(0, 0, 0, w, h);
      break;
    case 'framed': {
      const m = w * 0.08;
      const top = page.captionPos === 'top' && hasCaption ? capH + m * 0.4 : m;
      const bottom = page.captionPos === 'bottom' && hasCaption ? capH + m * 0.4 : m;
      photoIn(0, m, top, w - m * 2, h - top - bottom);
      break;
    }
    case 'polaroid': {
      const pw = w * 0.8;
      const ph = pw * 1.16;
      const px = (w - pw) / 2;
      const py = Math.max(unit * 3, (h - ph - capH * 0.5) / 2);
      ctx.save();
      ctx.translate(w / 2, py + ph / 2);
      ctx.rotate(-0.035);
      ctx.translate(-w / 2, -(py + ph / 2));
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = unit * 1.6;
      ctx.shadowOffsetY = unit * 0.6;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px, py, pw, ph);
      ctx.shadowColor = 'transparent';
      const inset = pw * 0.07;
      photoIn(0, px + inset, py + inset, pw - inset * 2, pw - inset * 2);
      ctx.restore();
      break;
    }
    case 'duo': {
      const m = w * 0.06;
      const gap = m * 0.6;
      const avail = h - m * 2 - (hasCaption ? capH : 0);
      const ph = (avail - gap) / 2;
      const y0 = page.captionPos === 'top' && hasCaption ? m + capH : m;
      photoIn(0, m, y0, w - m * 2, ph);
      photoIn(1, m, y0 + ph + gap, w - m * 2, ph);
      break;
    }
    case 'text':
      break;
  }

  if (hasCaption) {
    const isText = page.layout === 'text';
    const size = isText ? w * 0.13 : page.captionFont === 'bubble' ? w * 0.12 : w * 0.085;
    ctx.font = canvasFont(page.captionFont, 700, size);
    const lines = wrap(ctx, page.caption, w * 0.86);
    const lh = size * 1.15;
    const blockH = lines.length * lh;
    let y: number;
    if (isText || page.captionPos === 'center') y = (h - blockH) / 2;
    else if (page.captionPos === 'top') y = Math.max(unit * 2, (capH - blockH) / 2 + unit * 2);
    else y = h - Math.max(unit * 2, (capH + blockH) / 2);
    // Full-bleed photos get a readable sticker-like label behind the text.
    if (page.layout === 'full' && !isText) {
      const tw = Math.min(w * 0.92, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 0.9);
      ctx.fillStyle = page.captionColor === '#FFFFFF' || page.captionColor === '#FFFCF4' ? 'rgba(26,20,16,0.82)' : 'rgba(255,252,244,0.92)';
      ctx.beginPath();
      ctx.roundRect((w - tw) / 2, y - size * 0.25, tw, blockH + size * 0.4, size * 0.5);
      ctx.fill();
    }
    ctx.fillStyle = page.captionColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, y + i * lh));
  }

  for (const st of page.stickers) {
    const im = opts.stickers.get(st.id);
    if (!im) continue;
    const sw = st.s * w;
    ctx.save();
    ctx.translate(st.x * w, st.y * h);
    ctx.rotate((st.r * Math.PI) / 180);
    ctx.drawImage(im as CanvasImageSource, -sw / 2, -sw / 2, sw, sw);
    ctx.restore();
  }
  ctx.restore();
}

export interface SheetOptions extends RenderPageOptions {
  paper: ZinePaper;
  /** Dashed fold lines + red cut line. */
  guides?: boolean;
  /** Pixels per mm (default 300 DPI, auto-reduced to stay under ~12 MP for iOS). */
  pxPerMm?: number;
}

export function sheetPxPerMm(paper: ZinePaper, maxPixels = 12_000_000): number {
  const at300 = 300 / 25.4;
  const px = paper.widthMm * paper.heightMm * at300 * at300;
  return px <= maxPixels ? at300 : at300 * Math.sqrt(maxPixels / px);
}

/** Renders the full printable sheet (landscape). */
export function renderSheet(pages: ZinePage[], opts: SheetOptions): HTMLCanvasElement {
  const k = opts.pxPerMm ?? sheetPxPerMm(opts.paper);
  const W = Math.round(opts.paper.widthMm * k);
  const H = Math.round(opts.paper.heightMm * k);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const pw = W / 4;
  const ph = H / 2;
  pages.slice(0, ZINE_PAGE_COUNT).forEach((page, i) => {
    const cell = ZINE_CELLS[i];
    ctx.save();
    const x = cell.col * pw;
    const y = cell.row * ph;
    if (cell.flipped) {
      ctx.translate(x + pw, y + ph);
      ctx.rotate(Math.PI);
    } else ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    renderPage(ctx, page, pw, ph, opts);
    ctx.restore();
  });
  if (opts.guides) drawGuides(ctx, W, H, k);
  return c;
}

function drawGuides(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const pw = W / 4;
  ctx.save();
  // Folds: light dashed grey, only short ticks at the edges so they don't show on pages.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = Math.max(1, k * 0.25);
  ctx.setLineDash([k * 2, k * 1.5]);
  const tick = k * 5;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(i * pw, 0);
    ctx.lineTo(i * pw, tick);
    ctx.moveTo(i * pw, H - tick);
    ctx.lineTo(i * pw, H);
  }
  ctx.moveTo(0, H / 2);
  ctx.lineTo(tick, H / 2);
  ctx.moveTo(W - tick, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  // Cut: solid red across the middle two panels.
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(196,32,26,0.9)';
  ctx.lineWidth = Math.max(2.5, k * 0.4);
  ctx.beginPath();
  ctx.moveTo(pw, H / 2);
  ctx.lineTo(pw * 3, H / 2);
  ctx.stroke();
  // Scissors mark
  ctx.fillStyle = 'rgba(196,32,26,0.9)';
  ctx.font = `${Math.round(k * 4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('✂', pw, H / 2 - k * 0.6);
  ctx.restore();
}

/** Renders one page standalone (preview thumbnails / booklet). */
export function renderPageCanvas(page: ZinePage, width: number, aspect: number, opts: RenderPageOptions): HTMLCanvasElement {
  const c = createCanvas(width, width / aspect);
  renderPage(c.getContext('2d')!, page, c.width, c.height, opts);
  return c;
}

