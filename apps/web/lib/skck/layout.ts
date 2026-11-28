/**
 * SKCK — "Surat Keterangan Cukup Kalcer" fold-out photozine (browser only, canvas).
 *
 * The sheet is the designer's template (`/skck/template.png`, landscape, A4
 * ratio). Its photo slots are transparent; we paint the photos underneath,
 * then the template on top, then the guest's data and the QR.
 *
 *   ┌──────┬──────┬──────┬──────┐
 *   │ B3 ↻ │ B2 ↻ │ B1 ↻ │ B0 ↻ │  ← back panels, printed upside-down
 *   ├──────┼──────┼──────┼──────┤  ─ fold 1: top half to the BACK
 *   │  F0  │  F1  │  F2  │  F3  │  ← front panels
 *   └──────┴──────┴──────┴──────┘
 *         ↑ gunung ↑ lembah ↑ gunung  (accordion folds 2–4)
 *
 * All slot positions are fractions of the template, so a higher-resolution
 * export of the same design can replace the PNG without touching the code.
 *
 * Pure parody, not an official document.
 */
import { encode as encodeQr } from 'uqr';
import { createCanvas, loadBitmap } from '@/lib/frames/render';
import { FONTS, ensureFonts } from '@/lib/frames/fonts';
import { filteredCopy } from '@/lib/booth/media';

export const SKCK_TEMPLATE_URL = '/skck/template.png';

export interface SkckPaper {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}
export const SKCK_PAPERS: SkckPaper[] = [
  { id: 'a4', label: 'A4', widthMm: 297, heightMm: 210 },
  { id: 'letter', label: 'Letter', widthMm: 279.4, heightMm: 215.9 },
  { id: 'a5', label: 'A5 (saku)', widthMm: 210, heightMm: 148 },
];
export function skckPaper(id: string | null | undefined): SkckPaper {
  return SKCK_PAPERS.find((p) => p.id === id) ?? SKCK_PAPERS[0];
}

type Img = CanvasImageSource & { width: number; height: number };

export interface SkckData {
  name: string;
  eventName: string;
  /** "Terbit" line, already formatted (editable by the guest). */
  issued: string;
  /** Stable number derived from the session. */
  number: string;
  /** Softfile link for the QR. */
  qrValue: string;
  /** Up to four photos, in slot order (see SKCK_SLOTS). */
  photos: Img[];
  /** 'xerox' = black & white fotokopi; 'warna' = colour photos. */
  look: 'xerox' | 'warna';
  /** The loaded template (see loadSkckTemplate). */
  template: Img;
}

const INK = '#16130F';
const MUTED = '#5E5850';
const PAPER = '#F4F0E6';

export function skckNumber(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = String(h >>> 0).padStart(10, '0');
  return `${n.slice(0, 4)}/${n.slice(4, 7)}/kck/${new Date().getFullYear()}`;
}

export function skckToday(date = new Date()): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ensureSkckFonts(): Promise<void> {
  return ensureFonts([
    { font: 'gothic', weight: 600 },
    { font: 'editorial', weight: 400, italic: true },
    { font: 'typewriter', weight: 400 },
  ]);
}

let templatePromise: Promise<Img> | null = null;
export function loadSkckTemplate(): Promise<Img> {
  templatePromise ??= loadBitmap(SKCK_TEMPLATE_URL).then((img) => {
    if (!img) {
      templatePromise = null;
      throw new Error('Template SKCK gagal dimuat');
    }
    return img as Img;
  });
  return templatePromise;
}

// ── Template geometry (fractions of the template's 2527 × 1787 master) ──────

const TW = 2527;
const TH = 1787;
const R = (x: number, y: number, w: number, h: number) => ({ x: x / TW, y: y / TH, w: w / TW, h: h / TH });

/**
 * Photo slots in the order the guest picks photos. `flip` = slot sits on the
 * upside-down half, so the photo is drawn rotated 180°.
 */
export const SKCK_SLOTS = [
  { id: 'pas', label: 'Pas foto (Data SKCK)', rect: R(18, 1167, 175, 211), flip: false },
  { id: 'pemegang', label: 'Pemegang SKCK', rect: R(1354, 239, 451, 544), flip: true },
  { id: 'pose', label: 'Pose Terkalcer', rect: R(723, 239, 450, 544), flip: true },
  { id: 'bukti', label: 'Barang Bukti', rect: R(1991, 974, 438, 510), flip: false },
] as const;

/** Data SKCK form: value lines sit under the template's labels. */
const FIELD_X = 222 / TW;
const FIELD_R = 612 / TW;
const FIELD_Y = [1231, 1320, 1406].map((y) => y / TH);
const NUMBER_POS = { x: 18 / TW, y: 1404 / TH, w: 175 / TW };
/** QR: empty space beside the "Cukup" circle. */
const QR_RECT = R(995, 942, 190, 190);
const QR_CAPTION_Y = 1164 / TH;

// ── Drawing ──────────────────────────────────────────────────────────────────

function drawPhoto(ctx: CanvasRenderingContext2D, img: Img, X: number, Y: number, Wp: number, Hp: number, flip: boolean, look: SkckData['look'], unit: number) {
  const tmp = createCanvas(Math.max(1, Math.round(Wp)), Math.max(1, Math.round(Hp)));
  const t = tmp.getContext('2d')!;
  const s = Math.max(tmp.width / img.width, tmp.height / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  t.imageSmoothingQuality = 'high';
  t.drawImage(img, (tmp.width - dw) / 2, (tmp.height - dh) / 2, dw, dh);
  const out = look === 'xerox' ? filteredCopy(tmp, 'noir') : tmp;
  if (look === 'xerox') {
    // fine fotokopi dot screen
    const o = out.getContext('2d')!;
    o.globalAlpha = 0.12;
    o.fillStyle = INK;
    const step = Math.max(2.5, unit * 7);
    for (let yy = 0, r = 0; yy < out.height; yy += step, r++) for (let xx = r % 2 ? step / 2 : 0; xx < out.width; xx += step) o.fillRect(xx, yy, step * 0.3, step * 0.3);
    o.globalAlpha = 1;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(X, Y, Wp, Hp);
  ctx.clip();
  if (flip) {
    ctx.translate(X + Wp, Y + Hp);
    ctx.rotate(Math.PI);
    ctx.drawImage(out, 0, 0, Wp, Hp);
  } else ctx.drawImage(out, X, Y, Wp, Hp);
  ctx.restore();
}

/** Text shrunk to fit maxW (keeps aspect). */
function fitText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, size: number, font: (px: number) => string, color = INK, align: CanvasTextAlign = 'left') {
  ctx.font = font(size);
  const w = ctx.measureText(s).width;
  if (w > maxW) ctx.font = font((size * maxW) / w);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  const m = encodeQr(value, { ecc: 'M', border: 1 }).data;
  const cell = size / m.length;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = INK;
  m.forEach((row, yy) => row.forEach((on, xx) => on && ctx.fillRect(x + xx * cell, y + yy * cell, cell + 0.5, cell + 0.5)));
}

/**
 * The finished design at the template's aspect ratio, `width` px wide:
 * paper → photos → template → data → QR.
 */
export function composeSkck(d: SkckData, width: number): HTMLCanvasElement {
  const W = Math.round(width);
  const H = Math.round((width * TH) / TW);
  const unit = W / TW; // template px → canvas px
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // 1. photos (small bleed so the template's anti-aliased slot edges close cleanly)
  const bleed = 2 * unit;
  if (d.photos.length) {
    SKCK_SLOTS.forEach((slot, i) => {
      const img = d.photos[i] ?? d.photos[i % d.photos.length];
      const r = slot.rect;
      drawPhoto(ctx, img, r.x * W - bleed, r.y * H - bleed, r.w * W + 2 * bleed, r.h * H + 2 * bleed, slot.flip, d.look, unit);
    });
  }

  // 2. template
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.template, 0, 0, W, H);

  // 3. Data SKCK
  const fx = FIELD_X * W;
  const fw = (FIELD_R - FIELD_X) * W;
  const gothic = (px: number) => `600 ${px}px ${FONTS.gothic.family}`;
  const values = [d.name, d.eventName, d.issued];
  values.forEach((v, i) => {
    const y = FIELD_Y[i] * H;
    fitText(ctx, v, fx, y, fw, 34 * unit, gothic);
    ctx.save();
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = Math.max(1, 1.2 * unit);
    ctx.setLineDash([3 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.moveTo(fx, y + 9 * unit);
    ctx.lineTo(fx + fw, y + 9 * unit);
    ctx.stroke();
    ctx.restore();
  });
  fitText(ctx, `No. ${d.number}`, NUMBER_POS.x * W, NUMBER_POS.y * H, NUMBER_POS.w * W, 20 * unit, (px) => `400 ${px}px ${FONTS.typewriter.family}`, MUTED);

  // 4. QR beside "Cukup"
  const q = QR_RECT;
  drawQr(ctx, d.qrValue, q.x * W, q.y * H, q.w * W);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, 2 * unit);
  ctx.setLineDash([]);
  ctx.strokeRect(q.x * W, q.y * H, q.w * W, q.w * W);
  fitText(ctx, 'pindai: foto + SKCK digital', (q.x + q.w / 2) * W, QR_CAPTION_Y * H, 250 * unit, 24 * unit, (px) => `italic 400 ${px}px ${FONTS.editorial.family}`, INK, 'center');

  return c;
}

// ── Sheet ────────────────────────────────────────────────────────────────────

export type SkckPanelId = 'F0' | 'F1' | 'F2' | 'F3' | 'B0' | 'B1' | 'B2' | 'B3';
export const SKCK_FRONT: SkckPanelId[] = ['F0', 'F1', 'F2', 'F3'];
export const SKCK_BACK: SkckPanelId[] = ['B0', 'B1', 'B2', 'B3'];

export function skckPxPerMm(paper: SkckPaper, maxPixels = 12_000_000): number {
  const at300 = 300 / 25.4;
  const px = paper.widthMm * paper.heightMm * at300 * at300;
  return px <= maxPixels ? at300 : at300 * Math.sqrt(maxPixels / px);
}

/**
 * Full sheet (landscape) at the paper size; the design is centred and fitted
 * (A4/A5 fill the page, Letter gets thin margins). `guides` adds dashed fold
 * lines + labels for the on-screen folding guide only — downloads and prints
 * are clean.
 */
export function renderSkckSheet(d: SkckData, paper: SkckPaper, guides = false, pxPerMm = skckPxPerMm(paper)): HTMLCanvasElement {
  const W = Math.round(paper.widthMm * pxPerMm);
  const H = Math.round(paper.heightMm * pxPerMm);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / TW, H / TH);
  const dw = TW * s;
  const dh = TH * s;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2;
  ctx.drawImage(composeSkck(d, dw), ox, oy, dw, dh);
  if (guides) drawGuides(ctx, ox, oy, dw, dh, pxPerMm);
  return c;
}

/** Fold guide overlay (preview only). */
function drawGuides(ctx: CanvasRenderingContext2D, ox: number, oy: number, W: number, H: number, k: number) {
  const pw = W / 4;
  const ph = H / 2;
  const label = (s: string, x: number, y: number, color: string) => {
    ctx.save();
    ctx.font = `600 ${5.2 * k}px ${FONTS.gothic.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(s).width + 3 * k;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 4 * k, w, 8 * k, 4 * k);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(s, x, y);
    ctx.restore();
  };
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineWidth = Math.max(2, 0.6 * k);
  // fold 1 — horizontal, top half goes back
  ctx.strokeStyle = '#C4201A';
  ctx.setLineDash([3 * k, 2 * k]);
  ctx.beginPath();
  ctx.moveTo(0, ph);
  ctx.lineTo(W, ph);
  ctx.stroke();
  // folds 2–4 — accordion
  const kinds = ['gunung', 'lembah', 'gunung'];
  kinds.forEach((kind, i) => {
    ctx.strokeStyle = kind === 'gunung' ? '#2747C9' : '#1E7A3E';
    ctx.setLineDash(kind === 'gunung' ? [3 * k, 1.2 * k, 0.6 * k, 1.2 * k] : [1.2 * k, 1.2 * k]);
    ctx.beginPath();
    ctx.moveTo((i + 1) * pw, 0);
    ctx.lineTo((i + 1) * pw, H);
    ctx.stroke();
  });
  label('lipat 1 · ke belakang', W / 2, ph, '#C4201A');
  kinds.forEach((kind, i) => label(`${i + 2} · ${kind}`, (i + 1) * pw, H * 0.75, kind === 'gunung' ? '#2747C9' : '#1E7A3E'));
  // tint the upside-down half so it's obvious which side is the back
  ctx.fillStyle = 'rgba(39,71,201,0.06)';
  ctx.fillRect(0, 0, W, ph);
  label('sisi belakang (terbalik)', W / 2, ph * 0.1, '#5E5850');
  ctx.restore();
}

/**
 * All eight panels as separate canvases (studio preview / accordion mock-up),
 * from one composition. Back panels are turned upright.
 */
export function renderSkckPanels(d: SkckData, panelWidth = 320): Record<SkckPanelId, HTMLCanvasElement> {
  const sheet = composeSkck(d, panelWidth * 4);
  const pw = sheet.width / 4;
  const ph = sheet.height / 2;
  const cut = (col: number, row: number, flip: boolean) => {
    const c = createCanvas(pw, ph);
    const ctx = c.getContext('2d')!;
    if (flip) {
      ctx.translate(c.width, c.height);
      ctx.rotate(Math.PI);
    }
    ctx.drawImage(sheet, col * pw, row * ph, pw, ph, 0, 0, c.width, c.height);
    return c;
  };
  const out = {} as Record<SkckPanelId, HTMLCanvasElement>;
  SKCK_FRONT.forEach((id, i) => (out[id] = cut(i, 1, false)));
  SKCK_BACK.forEach((id, j) => (out[id] = cut(3 - j, 0, true)));
  return out;
}
