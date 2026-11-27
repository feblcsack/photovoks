/**
 * SIM — "Surat Izin Mejeng" photo zine (browser only, canvas).
 *
 * A fold-out card in the spirit of a vehicle-papers parody zine, printed on
 * ONE side of a landscape sheet:
 *
 *   ┌──────┬──────┬──────┬──────┐
 *   │ B3 ↻ │ B2 ↻ │ B1 ↻ │ B0 ↻ │  ← back panels, printed upside-down
 *   ├──────┼──────┼──────┼──────┤  ─ fold BACKWARDS along this line
 *   │  F0  │  F1  │  F2  │  F3  │  ← front panels
 *   └──────┴──────┴──────┴──────┘
 *
 * 1) fold the sheet in half along the middle (top half to the back) → a
 *    double-sided strip; 2) fold it zig-zag like an accordion → a pocket card
 *    with the cover (F0) on top. Flip the strip to read the back B0…B3.
 *
 * Xerox look: black ink on off-white paper, halftone photos, grain. Pure
 * parody — the footer says it's not an official document.
 */
import { encode as encodeQr } from 'uqr';
import { createCanvas } from '@/lib/frames/render';
import { FONTS, ensureFonts } from '@/lib/frames/fonts';
import { filteredCopy } from '@/lib/booth/media';

export const SIM_GOLONGAN = [
  { id: 'A', label: 'Anak Kalcer', note: 'Baru belajar bergaya, masih malu-malu kamera.' },
  { id: 'B', label: 'Bikunholic', note: 'Anak kampus garis keras, hafal semua halte bikun.' },
  { id: 'C', label: 'Cekrek', note: 'Sudah lancar pose, tahu sudut terbaik.' },
  { id: 'D', label: 'Dandan Maksimal', note: 'Outfit niat, rambut rapi, siap jadi sampul.' },
] as const;
export type SimGolongan = (typeof SIM_GOLONGAN)[number]['id'];

export interface SimPaper {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}
export const SIM_PAPERS: SimPaper[] = [
  { id: 'a4', label: 'A4', widthMm: 297, heightMm: 210 },
  { id: 'letter', label: 'US Letter', widthMm: 279.4, heightMm: 215.9 },
  { id: 'a5', label: 'A5 (saku)', widthMm: 210, heightMm: 148 },
];
export function simPaper(id: string | null | undefined): SimPaper {
  return SIM_PAPERS.find((p) => p.id === id) ?? SIM_PAPERS[0];
}

export interface SimData {
  /** Name on the license. */
  name: string;
  golongan: SimGolongan;
  eventName: string;
  /** Issue date shown on the card. */
  date: Date;
  /** Stable number derived from the session. */
  number: string;
  /** Softfile link for the QR on the back. */
  qrValue: string;
  /** Three photos: F1, F2, B3. */
  photos: Array<CanvasImageSource & { width: number; height: number }>;
  /** 'xerox' = black & white zine; 'warna' = colour photos + yellow accents. */
  look: 'xerox' | 'warna';
}

const INK = '#141210';
const PAPER = '#F3F1EA';
const YELLOW = '#FFD43B';

export function simNumber(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = String(h >>> 0).padStart(10, '0') + String(Math.abs(Math.imul(h, 31)) % 10000).padStart(4, '0');
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 14)}`;
}

export function ensureSimFonts(): Promise<void> {
  return ensureFonts([
    { font: 'heavy', weight: 400 },
    { font: 'serif', weight: 700 },
    { font: 'script', weight: 400 },
    { font: 'typewriter', weight: 400 },
    { font: 'rounded', weight: 800 },
  ]);
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, key: keyof typeof FONTS, size: number, weight = 400, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[key].family}`;
}

function star(ctx: Ctx, cx: number, cy: number, r: number, fill = INK) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Laurel branch: leaves along an arc (used for wreaths + the crest). */
function laurel(ctx: Ctx, cx: number, cy: number, r: number, from: number, to: number, side: 1 | -1, leaf: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = leaf * 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to, side < 0);
  ctx.stroke();
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    for (const out of [1, -1]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + out * 0.65);
      ctx.beginPath();
      ctx.ellipse(0, -leaf * 0.55, leaf * 0.28, leaf * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = leaf * 0.12;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -leaf);
      ctx.lineWidth = leaf * 0.06;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Tiny side-view bikun (row motif like the snakes in the reference). */
function bikunIcon(ctx: Ctx, x: number, y: number, w: number, look: SimData['look']) {
  const h = w * 0.38;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, w * 0.04);
  ctx.strokeStyle = INK;
  ctx.fillStyle = look === 'warna' ? YELLOW : PAPER;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h * 0.8, h * 0.15);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.06 + i * 0.19), h * 0.12, w * 0.15, h * 0.26);
  for (const cx of [0.22, 0.8]) {
    ctx.beginPath();
    ctx.arc(w * cx, h * 0.8, h * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Original crest: laurel wreath + star + camera + bikun, ribbon "SAMSAT KALCER". */
function crest(ctx: Ctx, cx: number, cy: number, r: number, look: SimData['look']) {
  ctx.save();
  laurel(ctx, cx, cy, r, Math.PI * 0.62, Math.PI * 1.45, 1, r * 0.16);
  laurel(ctx, cx, cy, r, Math.PI * 0.38, -Math.PI * 0.45, -1, r * 0.16);
  // shield
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.55);
  ctx.lineTo(cx + r * 0.55, cy + r * 0.05);
  ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.55, cx, cy + r * 0.75);
  ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.55, cx - r * 0.55, cy + r * 0.05);
  ctx.closePath();
  ctx.fillStyle = look === 'warna' ? YELLOW : PAPER;
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // camera
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.36, cy - r * 0.32, r * 0.72, r * 0.46, r * 0.06);
  ctx.fill();
  ctx.fillRect(cx - r * 0.12, cy - r * 0.42, r * 0.24, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.09, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.09, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  star(ctx, cx, cy + r * 0.38, r * 0.16);
  star(ctx, cx - r * 0.85, cy - r * 0.75, r * 0.14);
  // ribbon
  ctx.beginPath();
  ctx.roundRect(cx - r * 1.05, cy + r * 0.82, r * 2.1, r * 0.34, r * 0.17);
  ctx.fillStyle = INK;
  ctx.fill();
  font(ctx, 'heavy', r * 0.2);
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SAMSAT KALCER', cx, cy + r * 0.995, r * 1.9);
  ctx.restore();
}

/** Black & white halftone-ish xerox photo, drawn cover-fit in a rect. */
function photo(ctx: Ctx, img: SimData['photos'][number] | undefined, x: number, y: number, w: number, h: number, look: SimData['look']) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#BDBAB2';
  ctx.fillRect(x, y, w, h);
  if (img) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    // Work at print size so the "xerox" grain stays fine.
    const c = createCanvas(Math.max(1, w), Math.max(1, h));
    const cx = c.getContext('2d')!;
    cx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const out = look === 'xerox' ? filteredCopy(c, 'noir') : c;
    ctx.drawImage(out, x, y, w, h);
    if (look === 'xerox') {
      // dot screen
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = INK;
      const step = Math.max(3, w / 90);
      for (let yy = y; yy < y + h; yy += step) for (let xx = x + ((yy / step) % 2 ? step / 2 : 0); xx < x + w; xx += step) ctx.fillRect(xx, yy, step * 0.28, step * 0.28);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.lineWidth = Math.max(2, w * 0.012);
  ctx.strokeStyle = INK;
  ctx.strokeRect(x, y, w, h);
}

function wrapText(ctx: Ctx, text: string, x: number, y: number, maxW: number, lh: number): number {
  let line = '';
  let yy = y;
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(t).width > maxW) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lh;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + lh;
}

function grainAndFooter(ctx: Ctx, W: number, H: number, u: number, look: SimData['look']) {
  // bikun row + grid strip at the bottom of every panel
  const rowY = H - u * 13;
  for (let i = 0; i < 4; i++) bikunIcon(ctx, u * 3 + i * (W - u * 6) / 4, rowY, (W - u * 6) / 4 - u * 2, look);
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u * 0.25);
  const gy = H - u * 6;
  ctx.strokeRect(u * 3, gy, W - u * 6, u * 4);
  for (let x = u * 3; x < W - u * 3; x += u * 1.4) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy + u * 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(u * 3, gy + u * 2);
  ctx.lineTo(W - u * 3, gy + u * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Panels (each drawn into (0,0,W,H), portrait) ─────────────────────────────

function panelCover(ctx: Ctx, W: number, H: number, d: SimData) {
  const u = W / 60;
  crest(ctx, W / 2, H * 0.13, W * 0.16, d.look);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // giant SIM with a script swash through it
  font(ctx, 'heavy', W * 0.36);
  ctx.fillStyle = INK;
  ctx.fillText('SIM', W / 2, H * 0.49, W * 0.9);
  ctx.save();
  ctx.lineCap = 'round';
  const swash = () => {
    ctx.beginPath();
    ctx.moveTo(W * 0.06, H * 0.465);
    ctx.bezierCurveTo(W * 0.3, H * 0.35, W * 0.55, H * 0.56, W * 0.95, H * 0.36);
  };
  swash();
  ctx.lineWidth = u * 3.2;
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  swash();
  ctx.lineWidth = u * 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
  font(ctx, 'serif', W * 0.125, 700);
  ctx.fillText('Surat Izin', W / 2, H * 0.585, W * 0.9);
  font(ctx, 'script', W * 0.14);
  ctx.fillText('Mejeng', W / 2, H * 0.67, W * 0.9);
  star(ctx, W * 0.1, H * 0.625, u * 3);
  star(ctx, W * 0.9, H * 0.625, u * 3);
  // golongan badge + number
  ctx.beginPath();
  ctx.roundRect(W * 0.1, H * 0.705, W * 0.8, u * 5.6, u * 2.8);
  ctx.fillStyle = d.look === 'warna' ? YELLOW : INK;
  ctx.fill();
  font(ctx, 'heavy', u * 3.2);
  ctx.fillStyle = d.look === 'warna' ? INK : PAPER;
  ctx.textBaseline = 'middle';
  ctx.fillText(`GOLONGAN ${d.golongan} · ${SIM_GOLONGAN.find((g) => g.id === d.golongan)?.label.toUpperCase()}`, W / 2, H * 0.705 + u * 2.8, W * 0.74);
  font(ctx, 'typewriter', u * 2.4);
  ctx.fillStyle = INK;
  ctx.fillText(`No. ${d.number}`, W / 2, H * 0.705 + u * 8.2);
  grainAndFooter(ctx, W, H, u, d.look);
}

function panelPhoto(ctx: Ctx, W: number, H: number, d: SimData, idx: number, caption: string) {
  const u = W / 60;
  star(ctx, W / 2, H * 0.07, u * 4);
  const pw = W * 0.7;
  const ph = pw * 1.08;
  const px = (W - pw) / 2;
  const py = H * 0.115;
  photo(ctx, d.photos[idx], px, py, pw, ph, d.look);
  // wreath around the bottom of the photo
  laurel(ctx, W / 2, py + ph * 0.62, pw * 0.58, Math.PI * 0.55, Math.PI * 1.05, 1, u * 3.2);
  laurel(ctx, W / 2, py + ph * 0.62, pw * 0.58, Math.PI * 0.45, -Math.PI * 0.05, -1, u * 3.2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 'heavy', u * 4.2);
  ctx.fillStyle = INK;
  ctx.fillText(caption, W / 2, py + ph + u * 8.5, W * 0.9);
  font(ctx, 'typewriter', u * 2.4);
  ctx.fillText(`${d.name.toUpperCase()} · GOL. ${d.golongan}`, W / 2, py + ph + u * 12.5, W * 0.9);
  grainAndFooter(ctx, W, H, u, d.look);
}

function panelSpine(ctx: Ctx, W: number, H: number, d: SimData) {
  const u = W / 60;
  // Vertical spine title (reads top → bottom).
  ctx.save();
  ctx.translate(W * 0.5, H * 0.36);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  font(ctx, 'heavy', W * 0.4);
  ctx.fillText('SIM', 0, W * 0.24, H * 0.5);
  font(ctx, 'serif', W * 0.12, 700);
  ctx.fillText('Surat Izin', 0, -W * 0.04, H * 0.5);
  font(ctx, 'script', W * 0.13);
  ctx.fillText('Mejeng', 0, -W * 0.25, H * 0.5);
  ctx.restore();
  star(ctx, W * 0.5, H * 0.04, u * 2.6);
  // golongan letter
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 'typewriter', u * 2.3);
  ctx.fillStyle = INK;
  ctx.fillText('GOLONGAN', W / 2, H * 0.72);
  font(ctx, 'heavy', W * 0.26);
  ctx.lineWidth = u * 0.7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = d.look === 'warna' ? YELLOW : PAPER;
  ctx.fillText(d.golongan, W / 2, H * 0.83);
  ctx.strokeText(d.golongan, W / 2, H * 0.83);
  grainAndFooter(ctx, W, H, u, d.look);
}

function panelData(ctx: Ctx, W: number, H: number, d: SimData) {
  const u = W / 60;
  crest(ctx, W * 0.22, H * 0.1, W * 0.12, d.look);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  font(ctx, 'heavy', u * 4.6);
  ctx.fillText('SAMSAT', W * 0.42, H * 0.075, W * 0.55);
  font(ctx, 'heavy', u * 2.6);
  ctx.fillText('MEJENG SATU ATAP', W * 0.42, H * 0.105, W * 0.55);
  font(ctx, 'serif', u * 2.8, 700);
  ctx.fillText('Resor Kampus UI Depok', W * 0.42, H * 0.135, W * 0.55);
  // grey band (like the reference)
  ctx.fillStyle = d.look === 'warna' ? YELLOW : '#CFCBC1';
  ctx.fillRect(0, H * 0.2, W, u * 5);
  font(ctx, 'serif', u * 4, 700);
  ctx.fillStyle = INK;
  ctx.fillText('Data Pemegang', u * 4, H * 0.2 + u * 3.6);
  // photo + fields
  photo(ctx, d.photos[0], u * 4, H * 0.28, W * 0.34, W * 0.42, d.look);
  const fx = u * 4 + W * 0.38;
  const fields: Array<[string, string]> = [
    ['Nama', d.name],
    ['Golongan', `${d.golongan} — ${SIM_GOLONGAN.find((g) => g.id === d.golongan)?.label}`],
    ['Asal', d.eventName],
    ['Terbit', d.date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Berlaku s/d', 'Selama masih kalcer'],
  ];
  let y = H * 0.3;
  for (const [k, v] of fields) {
    font(ctx, 'typewriter', u * 1.9);
    ctx.fillText(k.toUpperCase(), fx, y);
    font(ctx, 'rounded', u * 2.5, 800);
    y = wrapText(ctx, v, fx, y + u * 2.8, W - fx - u * 3, u * 2.8) + u * 0.8;
  }
  // signature
  // signature under the photo (left column only)
  const sy = H * 0.28 + W * 0.42 + u * 6;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = u * 0.45;
  ctx.beginPath();
  ctx.moveTo(u * 5, sy);
  ctx.bezierCurveTo(u * 9, sy - u * 5, u * 11, sy + u * 3, u * 14, sy - u * 1.5);
  ctx.bezierCurveTo(u * 17, sy - u * 5, u * 19, sy + u * 2.5, u * 24, sy - u);
  ctx.stroke();
  ctx.restore();
  font(ctx, 'typewriter', u * 1.8);
  ctx.fillText('Kepala Samsat Kalcer', u * 4, sy + u * 3.5, fx - u * 6);
  ctx.fillText(`No. ${d.number}`, u * 4, sy + u * 6, fx - u * 6);
  grainAndFooter(ctx, W, H, u, d.look);
}

function panelText(ctx: Ctx, W: number, H: number, d: SimData, word: string, body: string[], withQr: boolean) {
  const u = W / 60;
  // black circle with script word + star (like the reference)
  const cx = W * 0.32;
  const cy = H * 0.18;
  const r = W * 0.24;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  star(ctx, cx + r * 0.25, cy + r * 0.45, r * 0.28, PAPER);
  ctx.save();
  ctx.translate(cx, cy - r * 0.05);
  ctx.rotate(-0.25);
  font(ctx, 'script', r * 0.62);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = u * 0.8;
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;
  ctx.strokeText(word, 0, 0, r * 2.4);
  ctx.fillText(word, 0, 0, r * 2.4);
  ctx.restore();
  // grey band
  ctx.fillStyle = d.look === 'warna' ? YELLOW : '#CFCBC1';
  ctx.fillRect(0, H * 0.36, W, u * 3);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = H * 0.45;
  for (const p of body) {
    const strong = p.startsWith('**');
    font(ctx, strong ? 'heavy' : 'rounded', u * (strong ? 2.6 : 2.5), strong ? 400 : 700);
    y = wrapText(ctx, p.replace(/^\*\*/, ''), u * 5, y, W - u * 10, u * 3.3) + u * 1.6;
  }
  if (withQr) {
    const m = encodeQr(d.qrValue, { ecc: 'M', border: 1 }).data;
    const size = W * 0.3;
    const cell = size / m.length;
    const qx = W - size - u * 4;
    const qy = H * 0.06 + u * 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qx, qy, size, size);
    ctx.fillStyle = INK;
    m.forEach((row, yy) => row.forEach((on, xx) => on && ctx.fillRect(qx + xx * cell, qy + yy * cell, cell + 0.4, cell + 0.4)));
    font(ctx, 'typewriter', u * 2);
    ctx.textAlign = 'right';
    ctx.fillText('scan: foto + SIM digital', qx + size, qy + size + u * 2.4);
  }
  grainAndFooter(ctx, W, H, u, d.look);
}

function panelEvidence(ctx: Ctx, W: number, H: number, d: SimData) {
  const u = W / 60;
  const pw = W * 0.8;
  const ph = H * 0.56;
  photo(ctx, d.photos[2] ?? d.photos[0], (W - pw) / 2, H * 0.06, pw, ph, d.look);
  // spiky bursts
  for (const [bx, by, br] of [[W * 0.12, H * 0.58, u * 6], [W * 0.86, H * 0.12, u * 5], [W * 0.9, H * 0.55, u * 4]]) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 ? br * 0.45 : br;
      const a = (i * Math.PI) / 8;
      ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = u * 0.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  // stamp
  ctx.save();
  ctx.translate(W * 0.62, H * 0.6);
  ctx.rotate(-0.22);
  ctx.strokeStyle = d.look === 'warna' ? '#C4201A' : INK;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = u * 0.7;
  ctx.strokeRect(-W * 0.3, -u * 4, W * 0.6, u * 8);
  font(ctx, 'heavy', u * 4.6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TERDAFTAR ✓', 0, 0, W * 0.56);
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  font(ctx, 'serif', u * 4, 700);
  ctx.fillText('Barang Bukti Mejeng', W / 2, H * 0.73, W * 0.9);
  font(ctx, 'typewriter', u * 2);
  wrapText(ctx, `Bukan dokumen resmi — photozine dari Photovoks × ${d.eventName}. Dibuat ${d.date.toLocaleDateString('id-ID')}.`, W / 2, H * 0.77, W * 0.86, u * 2.8);
  grainAndFooter(ctx, W, H, u, d.look);
}

// ── Sheet ────────────────────────────────────────────────────────────────────

export type SimPanelId = 'F0' | 'F1' | 'F2' | 'F3' | 'B0' | 'B1' | 'B2' | 'B3';
export const SIM_FRONT: SimPanelId[] = ['F0', 'F1', 'F2', 'F3'];
export const SIM_BACK: SimPanelId[] = ['B0', 'B1', 'B2', 'B3'];

export function drawPanel(ctx: Ctx, id: SimPanelId, W: number, H: number, d: SimData) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  switch (id) {
    case 'F0':
      panelCover(ctx, W, H, d);
      break;
    case 'F1':
      panelPhoto(ctx, W, H, d, 0, 'Pemegang SIM');
      break;
    case 'F2':
      panelPhoto(ctx, W, H, d, 1, 'Pose Terdaftar');
      break;
    case 'F3':
      panelSpine(ctx, W, H, d);
      break;
    case 'B0':
      panelData(ctx, W, H, d);
      break;
    case 'B1':
      panelText(ctx, W, H, d, 'Mejeng', [
        '**Mejeng (v.)',
        'Tampil gaya di tempat umum biar dilihat orang. Istilah anak Jakarta sejak era 80-an.',
        '**Kenapa kamu dapat SIM ini?',
        `Karena kamu berani bergaya di depan kamera tanpa jaim, di ${d.eventName}. Itu sudah cukup.`,
      ], false);
      break;
    case 'B2':
      panelText(ctx, W, H, d, 'Kalcer', [
        '**Pasal 1 — Dilarang jaim di depan kamera.',
        '**Pasal 2 — Senyum minimal 3 detik.',
        '**Pasal 3 — Pose kayang diizinkan, tanggung sendiri.',
        '**Pasal 4 — SIM sah untuk nongkrong dari halte bikun sampai Danau Kenanga.',
      ], true);
      break;
    case 'B3':
      panelEvidence(ctx, W, H, d);
      break;
  }
  ctx.restore();
}

export function simPxPerMm(paper: SimPaper, maxPixels = 12_000_000): number {
  const at300 = 300 / 25.4;
  const px = paper.widthMm * paper.heightMm * at300 * at300;
  return px <= maxPixels ? at300 : at300 * Math.sqrt(maxPixels / px);
}

/** Full printable sheet (landscape), one side, with fold/cut guides. */
export function renderSimSheet(d: SimData, paper: SimPaper, guides = true, pxPerMm = simPxPerMm(paper)): HTMLCanvasElement {
  const W = Math.round(paper.widthMm * pxPerMm);
  const H = Math.round(paper.heightMm * pxPerMm);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const pw = W / 4;
  const ph = H / 2;
  // front row (bottom)
  SIM_FRONT.forEach((id, i) => {
    ctx.save();
    ctx.translate(i * pw, ph);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    drawPanel(ctx, id, pw, ph, d);
    ctx.restore();
  });
  // back row (top), upside-down, reversed: back panel j at column 3-j
  SIM_BACK.forEach((id, j) => {
    const col = 3 - j;
    ctx.save();
    ctx.translate(col * pw + pw, ph);
    ctx.rotate(Math.PI);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    drawPanel(ctx, id, pw, ph, d);
    ctx.restore();
  });
  if (guides) {
    const k = pxPerMm;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
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
    ctx.moveTo(0, ph);
    ctx.lineTo(tick, ph);
    ctx.moveTo(W - tick, ph);
    ctx.lineTo(W, ph);
    ctx.stroke();
    ctx.restore();
  }
  return c;
}

/** One panel as its own canvas (studio preview / accordion mock-up). */
export function renderSimPanel(id: SimPanelId, d: SimData, width = 360): HTMLCanvasElement {
  const c = createCanvas(width, Math.round(width * (105 / 74.25)));
  drawPanel(c.getContext('2d')!, id, c.width, c.height, d);
  return c;
}
