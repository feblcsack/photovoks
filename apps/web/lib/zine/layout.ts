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
import { canvasFont, FONTS } from '@/lib/frames/fonts';
import { drawWordArt, WORDART_BY_ID, type WordArtStyleId } from '@/lib/wordart';
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

export type ZineLayout = 'full' | 'framed' | 'polaroid' | 'duo' | 'trio' | 'grid' | 'circle' | 'heart' | 'film' | 'text';
export type ZinePattern = 'none' | 'dots' | 'grid' | 'stripes' | 'checker' | 'stars' | 'hearts' | 'gingham' | 'gradient';
export type ZineFrame = 'none' | 'white' | 'ink' | 'tape' | 'shadow';

/** How many photos a layout holds. */
export function slotCount(layout: ZineLayout): number {
  return layout === 'text' ? 0 : layout === 'duo' ? 2 : layout === 'trio' || layout === 'film' ? 3 : layout === 'grid' ? 4 : 1;
}

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
  // v5 (optional — older zines keep working)
  /** Background pattern drawn in `bg2` over `bg`. */
  pattern?: ZinePattern;
  bg2?: string;
  /** Frame style around photos (layouts with margins). */
  frame?: ZineFrame;
  /** Render the caption as WordArt. */
  captionArt?: WordArtStyleId | null;
  /** Caption size multiplier (0.6–1.8). */
  captionSize?: number;
}

export const PAGE_BGS = ['#FFFCF4', '#F4EDDC', '#1A1410', '#C4201A', '#2747C9', '#FF9BD2', '#C9F25C', '#3F7360', '#6E0C0E', '#9ED8FF'];
export const CAPTION_COLORS = ['#1A1410', '#FFFFFF', '#C4201A', '#2747C9', '#FF9BD2', '#C9F25C', '#FFD43B'];
export const CAPTION_FONTS: FontKey[] = ['bubble', 'typewriter', 'scribble', 'impact', 'heavy', 'techno', 'rounded', 'marker', 'display', 'serif', 'script', 'sans'];
export const PATTERNS: Array<{ id: ZinePattern; label: string }> = [
  { id: 'none', label: 'Polos' },
  { id: 'dots', label: 'Polkadot' },
  { id: 'grid', label: 'Kotak buku' },
  { id: 'stripes', label: 'Garis' },
  { id: 'checker', label: 'Catur' },
  { id: 'gingham', label: 'Gingham' },
  { id: 'stars', label: 'Bintang' },
  { id: 'hearts', label: 'Hati' },
  { id: 'gradient', label: 'Gradasi' },
];
export const FRAMES: Array<{ id: ZineFrame; label: string }> = [
  { id: 'none', label: 'Tanpa' },
  { id: 'white', label: 'Putih' },
  { id: 'ink', label: 'Garis tinta' },
  { id: 'tape', label: 'Selotip' },
  { id: 'shadow', label: 'Bayangan' },
];

/** One-tap looks applied to every page (photos and stickers are kept). */
export const ZINE_THEMES: Array<{ id: string; label: string; swatch: [string, string]; apply: (p: ZinePage, i: number) => ZinePage }> = [
  { id: 'klasik', label: 'Kertas klasik', swatch: ['#FFFCF4', '#1A1410'], apply: (p, i) => ({ ...p, bg: i === 0 ? '#C4201A' : '#FFFCF4', bg2: '#E4D9C1', pattern: i === 0 ? 'none' : 'grid', frame: 'white', captionFont: i === 0 ? 'bubble' : 'typewriter', captionColor: i === 0 ? '#FFFCF4' : '#1A1410', captionArt: null }) },
  { id: 'pink', label: 'Y2K Pink', swatch: ['#FFC4E6', '#FF4FA8'], apply: (p, i) => ({ ...p, bg: '#FFE1F1', bg2: '#FF9BD2', pattern: i % 2 ? 'hearts' : 'gingham', frame: 'white', captionFont: 'bubble', captionColor: '#7A0E45', captionArt: i === 0 ? 'bubblegum' : null }) },
  { id: 'kobalt', label: 'Kobalt', swatch: ['#2747C9', '#9ED8FF'], apply: (p, i) => ({ ...p, bg: '#2747C9', bg2: '#9ED8FF', pattern: i % 2 ? 'stars' : 'dots', frame: 'white', captionFont: 'techno', captionColor: '#FFFFFF', captionArt: i === 0 ? 'cobalt' : null }) },
  { id: 'malam', label: 'Malam disko', swatch: ['#1A1410', '#FFD43B'], apply: (p, i) => ({ ...p, bg: '#1A1410', bg2: '#5B4BC4', pattern: i % 2 ? 'dots' : 'gradient', frame: 'shadow', captionFont: 'heavy', captionColor: '#FFD43B', captionArt: i === 0 ? 'chrome' : null }) },
  { id: 'punk', label: 'Zine punk', swatch: ['#F4EDDC', '#C4201A'], apply: (p, i) => ({ ...p, bg: '#F4EDDC', bg2: '#C4201A', pattern: i % 3 === 0 ? 'stripes' : 'none', frame: 'tape', captionFont: 'impact', captionColor: '#1A1410', captionArt: i === 0 ? 'sunset' : null }) },
  { id: 'pastel', label: 'Pastel', swatch: ['#E2F3FF', '#FFE1F1'], apply: (p, i) => ({ ...p, bg: '#E2F3FF', bg2: '#FFC4E6', pattern: i % 2 ? 'gingham' : 'gradient', frame: 'white', captionFont: 'rounded', captionColor: '#2747C9', captionArt: i === 0 ? 'sky' : null }) },
];

export const LAYOUTS: Array<{ id: ZineLayout; label: string }> = [
  { id: 'full', label: 'Penuh' },
  { id: 'framed', label: 'Bingkai' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'duo', label: '2 foto' },
  { id: 'trio', label: 'Strip 3' },
  { id: 'grid', label: '4 foto' },
  { id: 'film', label: 'Film' },
  { id: 'circle', label: 'Bulat' },
  { id: 'heart', label: 'Hati' },
  { id: 'text', label: 'Teks' },
];

export function blankPage(i: number, title = '', subtitle = ''): ZinePage {
  const base: ZinePage = {
    layout: 'full',
    images: [null, null, null, null],
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
    const n = Math.max(1, slotCount(p.layout));
    return { ...p, images: Array.from({ length: 4 }, (_, j) => (j < n ? take() : p.images[j] ?? null)) };
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

function drawPattern(ctx: CanvasRenderingContext2D, page: ZinePage, w: number, h: number, unit: number) {
  const pat = page.pattern ?? 'none';
  const c2 = page.bg2 ?? '#1A1410';
  if (pat === 'none') return;
  ctx.save();
  if (pat === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, page.bg);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = c2;
  ctx.strokeStyle = c2;
  ctx.globalAlpha = pat === 'checker' ? 0.22 : 0.35;
  const step = unit * (pat === 'grid' ? 4 : pat === 'checker' || pat === 'gingham' ? 6 : 7);
  if (pat === 'dots') {
    for (let y = step / 2, row = 0; y < h + step; y += step, row++) for (let x = row % 2 ? step : step / 2; x < w + step; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, unit * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pat === 'grid') {
    ctx.lineWidth = Math.max(1, unit * 0.18);
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else if (pat === 'stripes') {
    ctx.lineWidth = unit * 2;
    ctx.beginPath();
    for (let x = -h; x < w + h; x += unit * 6) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
    }
    ctx.stroke();
  } else if (pat === 'checker') {
    for (let y = 0, r = 0; y < h; y += step, r++) for (let x = r % 2 ? step : 0; x < w; x += step * 2) ctx.fillRect(x, y, step, step);
  } else if (pat === 'gingham') {
    ctx.globalAlpha = 0.18;
    for (let x = 0; x < w; x += step * 2) ctx.fillRect(x, 0, step, h);
    for (let y = 0; y < h; y += step * 2) ctx.fillRect(0, y, w, step);
  } else if (pat === 'stars' || pat === 'hearts') {
    ctx.globalAlpha = 0.4;
    for (let y = step / 2, row = 0; y < h + step; y += step * 1.4, row++) for (let x = row % 2 ? step : step / 2; x < w + step; x += step * 1.6) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((row * 7 + x) % 5) * 0.12 - 0.24);
      if (pat === 'stars') starPath(ctx, unit * 1.6, unit * 0.7);
      else heartPath(ctx, unit * 1.6);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.2, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9);
  ctx.closePath();
}

/** Frame decoration around a photo rect (drawn BEFORE the photo for white/shadow, AFTER for ink/tape). */
function frameUnder(ctx: CanvasRenderingContext2D, frame: ZineFrame, x: number, y: number, w: number, h: number, unit: number) {
  if (frame === 'white' || frame === 'shadow' || frame === 'tape') {
    ctx.save();
    if (frame === 'shadow' || frame === 'tape') {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = unit * 1.6;
      ctx.shadowOffsetY = unit * 0.7;
    }
    const b = frame === 'shadow' ? 0 : unit * 1.1;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - b, y - b, w + b * 2, h + b * 2);
    ctx.restore();
  }
}
function frameOver(ctx: CanvasRenderingContext2D, frame: ZineFrame, x: number, y: number, w: number, h: number, unit: number) {
  if (frame === 'ink') {
    ctx.save();
    ctx.strokeStyle = '#1A1410';
    ctx.lineWidth = unit * 0.7;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  } else if (frame === 'tape') {
    ctx.save();
    ctx.fillStyle = 'rgba(246,226,150,0.85)';
    for (const [cx, cy, rot] of [[x + w * 0.2, y, -0.5], [x + w * 0.8, y + h, -0.5]] as const) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillRect(-unit * 5, -unit * 1.4, unit * 10, unit * 2.8);
      ctx.restore();
    }
    ctx.restore();
  }
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
  drawPattern(ctx, page, w, h, unit);
  const frame = page.frame ?? 'none';
  const img = (i: number) => {
    const k = page.images[i];
    const src = k ? opts.images.get(k) : null;
    return src ? filtered(src, page.filter, q) : null;
  };
  const hasCaption = !!page.caption.trim();
  const capH = hasCaption ? h * 0.16 * Math.min(1.5, Math.max(0.7, page.captionSize ?? 1)) : 0;

  const photoIn = (i: number, x: number, y: number, pw: number, ph: number, framed = true) => {
    if (framed) frameUnder(ctx, frame, x, y, pw, ph, unit);
    const im = img(i);
    if (im) drawPanned(ctx, im, x, y, pw, ph, page.zoom, page.panX, page.panY);
    else if (opts.hints) emptySlot(ctx, x, y, pw, ph, unit);
    if (framed) frameOver(ctx, frame, x, y, pw, ph, unit);
  };
  /** Photo clipped to a path (circle / heart). */
  const photoClipped = (path: () => void, x: number, y: number, pw: number, ph: number) => {
    ctx.save();
    path();
    ctx.fillStyle = '#FFFFFF';
    if (frame !== 'none') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = unit * 1.5;
      ctx.lineWidth = unit * 2.2;
      ctx.strokeStyle = frame === 'ink' ? '#1A1410' : '#FFFFFF';
      ctx.stroke();
      ctx.restore();
    }
    ctx.clip();
    const im = img(0);
    if (im) drawPanned(ctx, im, x, y, pw, ph, page.zoom, page.panX, page.panY);
    else if (opts.hints) emptySlot(ctx, x, y, pw, ph, unit);
    ctx.restore();
  };
  const capTop = page.captionPos === 'top' && hasCaption ? capH : 0;
  const capBottom = page.captionPos === 'bottom' && hasCaption ? capH : 0;

  switch (page.layout) {
    case 'full':
      photoIn(0, 0, 0, w, h, false);
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
      photoIn(0, px + inset, py + inset, pw - inset * 2, pw - inset * 2, false);
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
    case 'trio': {
      // Classic photobooth strip: three stacked frames.
      const m = w * 0.1;
      const gap = m * 0.4;
      const top = m * 0.7 + capTop;
      const avail = h - top - m * 0.7 - capBottom;
      const ph = (avail - gap * 2) / 3;
      for (let i = 0; i < 3; i++) photoIn(i, m, top + i * (ph + gap), w - m * 2, ph);
      break;
    }
    case 'grid': {
      const m = w * 0.07;
      const gap = m * 0.5;
      const top = m + capTop;
      const avail = h - top - m - capBottom;
      const cw = (w - m * 2 - gap) / 2;
      const ch = (avail - gap) / 2;
      for (let i = 0; i < 4; i++) photoIn(i, m + (i % 2) * (cw + gap), top + Math.floor(i / 2) * (ch + gap), cw, ch);
      break;
    }
    case 'film': {
      // Film strip: dark band with sprocket holes, three frames.
      const bw = w * 0.78;
      const bx = (w - bw) / 2;
      const top = unit * 3 + capTop;
      const bh = h - top - unit * 3 - capBottom;
      ctx.save();
      ctx.fillStyle = '#16120E';
      ctx.fillRect(bx, top, bw, bh);
      ctx.fillStyle = page.bg;
      const hole = bw * 0.07;
      for (let y = top + hole; y < top + bh - hole; y += hole * 2) {
        ctx.fillRect(bx + hole * 0.45, y, hole * 0.7, hole);
        ctx.fillRect(bx + bw - hole * 1.15, y, hole * 0.7, hole);
      }
      ctx.restore();
      const inner = bw - hole * 3.2;
      const gap = hole * 0.9;
      const ph = (bh - hole * 2 - gap * 2) / 3;
      for (let i = 0; i < 3; i++) photoIn(i, bx + (bw - inner) / 2, top + hole + i * (ph + gap), inner, ph, false);
      break;
    }
    case 'circle': {
      const d = Math.min(w * 0.82, (h - capH) * 0.82);
      const cx = w / 2;
      const cy = capTop + (h - capH) / 2;
      photoClipped(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      }, cx - d / 2, cy - d / 2, d, d);
      break;
    }
    case 'heart': {
      const d = Math.min(w * 0.9, (h - capH) * 0.9);
      const cx = w / 2;
      const cy = capTop + (h - capH) / 2 + d * 0.04;
      photoClipped(() => {
        ctx.save();
        ctx.translate(cx, cy);
        heartPath(ctx, d * 0.52);
        ctx.restore();
      }, cx - d / 2, cy - d / 2, d, d);
      break;
    }
    case 'text':
      break;
  }

  if (hasCaption) {
    const isText = page.layout === 'text';
    const mult = Math.min(1.8, Math.max(0.6, page.captionSize ?? 1));
    const size = (isText ? w * 0.13 : page.captionFont === 'bubble' || page.captionArt ? w * 0.12 : w * 0.085) * mult;
    ctx.font = canvasFont(page.captionFont, 700, size);
    const lines = wrap(ctx, page.caption, w * 0.86);
    const lh = size * 1.15;
    const blockH = lines.length * lh;
    let y: number;
    if (isText || page.captionPos === 'center') y = (h - blockH) / 2;
    else if (page.captionPos === 'top') y = Math.max(unit * 2, (capH - blockH) / 2 + unit * 2);
    else y = h - Math.max(unit * 2, (capH + blockH) / 2);
    // Full-bleed photos get a readable sticker-like label behind the text.
    if (page.layout === 'full' && !isText && !page.captionArt) {
      const tw = Math.min(w * 0.92, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 0.9);
      ctx.fillStyle = page.captionColor === '#FFFFFF' || page.captionColor === '#FFFCF4' ? 'rgba(26,20,16,0.82)' : 'rgba(255,252,244,0.92)';
      ctx.beginPath();
      ctx.roundRect((w - tw) / 2, y - size * 0.25, tw, blockH + size * 0.4, size * 0.5);
      ctx.fill();
    }
    if (page.captionArt && WORDART_BY_ID[page.captionArt]) {
      const art = WORDART_BY_ID[page.captionArt];
      const fam = FONTS[art.font === 'impact' ? 'impact' : art.font === 'heavy' ? 'heavy' : art.font === 'display' ? 'bubble' : 'serif'].family;
      lines.forEach((l, i) => {
        ctx.save();
        ctx.translate(w / 2, y + i * lh + lh / 2);
        // Keep long lines inside the page.
        ctx.font = `400 ${size}px ${fam}`;
        const fit = Math.min(1, (w * 0.9) / Math.max(1, ctx.measureText(l).width * 1.08));
        drawWordArt(ctx, l, page.captionArt!, size * fit, fam);
        ctx.restore();
      });
    } else {
      ctx.fillStyle = page.captionColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, y + i * lh));
    }
  }

  for (const st of page.stickers) {
    const im = opts.stickers.get(st.id);
    if (!im) continue;
    const sw = st.s * w;
    const { w: iw, h: ih } = sizeOf(im);
    const sh = iw && ih ? (sw * ih) / iw : sw;
    ctx.save();
    ctx.translate(st.x * w, st.y * h);
    ctx.rotate((st.r * Math.PI) / 180);
    ctx.drawImage(im as CanvasImageSource, -sw / 2, -sh / 2, sw, sh);
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

