/**
 * SKCK — "Surat Keterangan Cukup Kalcer" fold-out photozine (browser only, canvas).
 *
 * One side of a landscape sheet, 8 panels:
 *
 *   ┌──────┬──────┬──────┬──────┐
 *   │ B3 ↻ │ B2 ↻ │ B1 ↻ │ B0 ↻ │  ← back panels, printed upside-down
 *   ├──────┼──────┼──────┼──────┤  ─ fold 1: top half to the BACK
 *   │  F0  │  F1  │  F2  │  F3  │  ← front panels
 *   └──────┴──────┴──────┴──────┘
 *         ↑ gunung ↑ lembah ↑ gunung  (accordion folds 2–4)
 *
 * Layout is specified in "design millimetres" on a 74.25 mm wide panel (A4
 * quarter) so every paper size scales the same way; heights flex between
 * ~104 mm (A4/A5) and ~115 mm (Letter): headers anchor to the top, footers to
 * the bottom and the middle block is centred in what's left.
 *
 * Typography rule: no ALL-CAPS text anywhere. Gothic (blackletter) titles,
 * editorial italic body, typewriter for form fields.
 *
 * Pure parody — the last panel says it's not an official document.
 */
import { encode as encodeQr } from 'uqr';
import { createCanvas } from '@/lib/frames/render';
import { FONTS, ensureFonts } from '@/lib/frames/fonts';
import type { FontKey } from '@/lib/frames/types';
import { filteredCopy } from '@/lib/booth/media';

export const SKCK_KATEGORI = [
  { id: 'A', label: 'anak baru kalcer', note: 'Baru belajar bergaya, masih malu-malu kamera.' },
  { id: 'B', label: 'bikunholic', note: 'Anak kampus garis keras, hafal semua halte bikun.' },
  { id: 'C', label: 'cekrek profesional', note: 'Sudah lancar pose, tahu sudut terbaik.' },
  { id: 'D', label: 'dandan maksimal', note: 'Outfit niat, rambut rapi, siap jadi sampul.' },
] as const;
export type SkckKategori = (typeof SKCK_KATEGORI)[number]['id'];

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
  kategori: SkckKategori;
  eventName: string;
  date: Date;
  /** Stable number derived from the session. */
  number: string;
  /** Softfile link for the QR. */
  qrValue: string;
  /** Up to three photos: F1 (pas foto), F2, B3. */
  photos: Img[];
  /** 'xerox' = black & white fotokopi; 'warna' = colour photos + oxblood ink. */
  look: 'xerox' | 'warna';
}

const INK = '#16130F';
const MUTED = '#5E5850';
const PAPER = '#F4F0E6';
const SHADE = '#E6E0D2';
const OXBLOOD = '#6E1A1A';

export function skckNumber(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = String(h >>> 0).padStart(10, '0');
  return `${n.slice(0, 4)}/${n.slice(4, 7)}/kck/${new Date().getFullYear()}`;
}

export function ensureSkckFonts(): Promise<void> {
  return ensureFonts([
    { font: 'blackletter', weight: 400 },
    { font: 'gothic', weight: 400 },
    { font: 'gothic', weight: 600 },
    { font: 'gothic', weight: 800 },
    { font: 'pixelgothic', weight: 400 },
    { font: 'editorial', weight: 400 },
    { font: 'editorial', weight: 400, italic: true },
    { font: 'typewriter', weight: 400 },
  ]);
}

// ── Pen: everything in design-mm ─────────────────────────────────────────────

const PANEL_W_MM = 74.25;
const M = 6.5; // content margin

interface TextOpts {
  f: FontKey;
  size: number;
  w?: number;
  it?: boolean;
  align?: CanvasTextAlign;
  color?: string;
  maxW?: number;
  base?: CanvasTextBaseline;
}

class Pen {
  /** Panel width in design mm. */
  readonly W = PANEL_W_MM;
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly u: number,
    readonly look: SkckData['look'],
  ) {}
  get accent() {
    return this.look === 'warna' ? OXBLOOD : INK;
  }
  font(o: Pick<TextOpts, 'f' | 'size' | 'w' | 'it'>) {
    this.ctx.font = `${o.it ? 'italic ' : ''}${o.w ?? 400} ${o.size * this.u}px ${FONTS[o.f].family}`;
  }
  text(s: string, x: number, y: number, o: TextOpts) {
    const c = this.ctx;
    this.font(o);
    c.fillStyle = o.color ?? INK;
    c.textAlign = o.align ?? 'left';
    c.textBaseline = o.base ?? 'alphabetic';
    c.fillText(s, x * this.u, y * this.u, o.maxW ? o.maxW * this.u : undefined);
  }
  measure(s: string, o: TextOpts): number {
    this.font(o);
    return this.ctx.measureText(s).width / this.u;
  }
  /** Word-wrapped paragraph; returns the y after the last line. */
  para(s: string, x: number, y: number, maxW: number, lh: number, o: TextOpts): number {
    let line = '';
    let yy = y;
    for (const word of s.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (line && this.measure(t, o) > maxW) {
        this.text(line, x, yy, o);
        line = word;
        yy += lh;
      } else line = t;
    }
    if (line) this.text(line, x, yy, o);
    return yy + lh;
  }
  /** Text shrunk to fit `maxW` (keeps aspect, unlike fillText's maxWidth squeeze). */
  fit(s: string, x: number, y: number, maxW: number, o: TextOpts) {
    const w = this.measure(s, o);
    this.text(s, x, y, { ...o, size: w > maxW ? (o.size * maxW) / w : o.size });
  }
  line(x1: number, y1: number, x2: number, y2: number, width = 0.25, color = INK, dash?: number[]) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, width * this.u);
    if (dash) c.setLineDash(dash.map((d) => d * this.u));
    c.beginPath();
    c.moveTo(x1 * this.u, y1 * this.u);
    c.lineTo(x2 * this.u, y2 * this.u);
    c.stroke();
    c.restore();
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; width?: number } = {}) {
    const c = this.ctx;
    if (o.fill) {
      c.fillStyle = o.fill;
      c.fillRect(x * this.u, y * this.u, w * this.u, h * this.u);
    }
    if (o.stroke) {
      c.strokeStyle = o.stroke;
      c.lineWidth = Math.max(1, (o.width ?? 0.25) * this.u);
      c.strokeRect(x * this.u, y * this.u, w * this.u, h * this.u);
    }
  }
  /** Rule with a small diamond in the middle — the section divider. */
  divider(y: number, x1 = M, x2 = this.W - M) {
    const mid = (x1 + x2) / 2;
    this.line(x1, y, mid - 2.2, y, 0.2);
    this.line(mid + 2.2, y, x2, y, 0.2);
    const c = this.ctx;
    c.save();
    c.translate(mid * this.u, y * this.u);
    c.rotate(Math.PI / 4);
    c.fillStyle = this.accent;
    const s = 1.3 * this.u;
    c.fillRect(-s / 2, -s / 2, s, s);
    c.restore();
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** Double-rule document border; the gap to the panel edge is where folds land. */
function border(p: Pen, H: number) {
  p.rect(2.6, 2.6, p.W - 5.2, H - 5.2, { stroke: p.accent, width: 0.45 });
  p.rect(3.6, 3.6, p.W - 7.2, H - 7.2, { stroke: p.accent, width: 0.15 });
}

function footer(p: Pen, H: number, page: number) {
  const y = H - 6.4;
  p.text('skck · cukup kalcer', M, y, { f: 'typewriter', size: 1.9, color: MUTED });
  p.text(`hal. ${page}/8`, p.W - M, y, { f: 'typewriter', size: 1.9, color: MUTED, align: 'right' });
}

/** Panel heading: small gothic kicker + rule. Returns y below it. */
function heading(p: Pen, title: string, kicker: string | null, y = 11.5): number {
  if (kicker) p.text(kicker, p.W / 2, y - 4.2, { f: 'editorial', it: true, size: 2.5, color: MUTED, align: 'center' });
  p.fit(title, p.W / 2, y + 1.2, p.W - 2 * M, { f: 'gothic', w: 600, size: 5.6, align: 'center' });
  p.divider(y + 3.6);
  return y + 7.5;
}

function photo(p: Pen, img: Img | undefined, x: number, y: number, w: number, h: number) {
  const c = p.ctx;
  const u = p.u;
  const X = x * u;
  const Y = y * u;
  const Wp = w * u;
  const Hp = h * u;
  c.save();
  c.fillStyle = SHADE;
  c.fillRect(X, Y, Wp, Hp);
  if (img) {
    const s = Math.max(Wp / img.width, Hp / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    const tmp = createCanvas(Math.max(1, Math.round(Wp)), Math.max(1, Math.round(Hp)));
    tmp.getContext('2d')!.drawImage(img, (tmp.width - dw) / 2, (tmp.height - dh) / 2, dw, dh);
    const out = p.look === 'xerox' ? filteredCopy(tmp, 'noir') : tmp;
    c.drawImage(out, X, Y, Wp, Hp);
    if (p.look === 'xerox') {
      // fine fotokopi dot screen
      c.globalAlpha = 0.13;
      c.fillStyle = INK;
      const step = Math.max(2.5, 0.55 * u);
      for (let yy = 0, r = 0; yy < Hp; yy += step, r++) for (let xx = r % 2 ? step / 2 : 0; xx < Wp; xx += step) c.fillRect(X + xx, Y + yy, step * 0.3, step * 0.3);
      c.globalAlpha = 1;
    }
  }
  c.restore();
  p.rect(x, y, w, h, { stroke: INK, width: 0.35 });
}

/** Stylised fingerprint: concentric broken ellipses. */
function fingerprint(p: Pen, cx: number, cy: number, rx: number, ry: number, seed: number) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = p.look === 'warna' ? 'rgba(30,40,90,0.75)' : 'rgba(22,19,15,0.7)';
  c.lineWidth = Math.max(1, 0.28 * p.u);
  c.lineCap = 'round';
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 1; k <= 9; k++) {
    const f = k / 9;
    const gap = rnd() * Math.PI * 2;
    c.beginPath();
    c.ellipse(cx * p.u, (cy + (1 - f) * ry * 0.25) * p.u, rx * f * p.u, ry * f * p.u, (rnd() - 0.5) * 0.25, gap, gap + Math.PI * (1.55 + rnd() * 0.35));
    c.stroke();
  }
  c.restore();
}

/** Round rubber stamp: two rings, curved lowercase text, centre word. */
function stamp(p: Pen, cx: number, cy: number, r: number, rotate = -0.18) {
  const c = p.ctx;
  const u = p.u;
  const color = p.look === 'warna' ? 'rgba(110,26,26,0.82)' : 'rgba(22,19,15,0.78)';
  c.save();
  c.translate(cx * u, cy * u);
  c.rotate(rotate);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = Math.max(1, 0.45 * u);
  c.beginPath();
  c.arc(0, 0, r * u, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.max(1, 0.2 * u);
  c.beginPath();
  c.arc(0, 0, r * 0.72 * u, 0, Math.PI * 2);
  c.stroke();
  // curved text
  const label = 'biro urusan kalcer · resor kampus · ';
  c.font = `600 ${r * 0.2 * u}px ${FONTS.gothic.family}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const chars = Array.from(label);
  const step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, i) => {
    c.save();
    c.rotate(-Math.PI / 2 + i * step);
    c.translate(r * 0.86 * u, 0);
    c.rotate(Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
  });
  c.font = `400 ${r * 0.5 * u}px ${FONTS.blackletter.family}`;
  c.fillText('Lulus', 0, -r * 0.05 * u);
  c.font = `400 ${r * 0.15 * u}px ${FONTS.typewriter.family}`;
  c.fillText('cukup kalcer', 0, r * 0.36 * u);
  c.restore();
}

/** Emblem for the cover: ring + camera line icon (original, no official marks). */
function emblem(p: Pen, cx: number, cy: number, r: number) {
  const c = p.ctx;
  const u = p.u;
  c.save();
  c.translate(cx * u, cy * u);
  c.strokeStyle = p.accent;
  c.fillStyle = p.accent;
  c.lineWidth = Math.max(1, 0.4 * u);
  c.beginPath();
  c.arc(0, 0, r * u, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.max(1, 0.15 * u);
  c.beginPath();
  c.arc(0, 0, r * 0.84 * u, 0, Math.PI * 2);
  c.stroke();
  // ticks around the ring
  for (let i = 0; i < 48; i++) {
    c.save();
    c.rotate((i / 48) * Math.PI * 2);
    c.fillRect(-0.06 * u, -r * u, 0.12 * u, r * 0.12 * u);
    c.restore();
  }
  // camera
  c.lineWidth = Math.max(1, 0.38 * u);
  const w = r * 1.0;
  const h = r * 0.66;
  c.beginPath();
  c.roundRect((-w / 2) * u, (-h / 2 + r * 0.06) * u, w * u, h * u, r * 0.1 * u);
  c.stroke();
  c.beginPath();
  c.moveTo(-w * 0.18 * u, (-h / 2 + r * 0.06) * u);
  c.lineTo(-w * 0.1 * u, (-h / 2 - r * 0.06) * u);
  c.lineTo(w * 0.1 * u, (-h / 2 - r * 0.06) * u);
  c.lineTo(w * 0.18 * u, (-h / 2 + r * 0.06) * u);
  c.stroke();
  c.beginPath();
  c.arc(0, r * 0.06 * u, r * 0.2 * u, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(0, r * 0.06 * u, r * 0.07 * u, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function barcode(p: Pen, x: number, y: number, w: number, h: number, seed: string) {
  let s = 7;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let xx = x;
  p.ctx.fillStyle = INK;
  while (xx < x + w) {
    const bw = 0.25 + Math.floor(rnd() * 3) * 0.25;
    if (rnd() > 0.35) p.ctx.fillRect(xx * p.u, y * p.u, bw * p.u, h * p.u);
    xx += bw + 0.25;
  }
}

function qr(p: Pen, value: string, x: number, y: number, size: number) {
  const m = encodeQr(value, { ecc: 'M', border: 1 }).data;
  const cell = (size * p.u) / m.length;
  p.rect(x, y, size, size, { fill: '#FFFFFF' });
  p.ctx.fillStyle = INK;
  m.forEach((row, yy) => row.forEach((on, xx) => on && p.ctx.fillRect(x * p.u + xx * cell, y * p.u + yy * cell, cell + 0.5, cell + 0.5)));
}

const kategori = (d: SkckData) => SKCK_KATEGORI.find((k) => k.id === d.kategori) ?? SKCK_KATEGORI[2];
const tanggal = (d: SkckData) => d.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Panels ───────────────────────────────────────────────────────────────────

function cover(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  p.text('biro urusan kalcer', W / 2, 11, { f: 'editorial', it: true, size: 3, align: 'center', color: MUTED });
  p.text('resor kampus · depok', W / 2, 14.6, { f: 'typewriter', size: 2, align: 'center', color: MUTED });
  // Centre block flexes with paper height.
  const block = 70;
  const top = 18 + Math.max(0, (H - 30 - 18 - block) / 2);
  emblem(p, W / 2, top + 11, 9.5);
  p.text('surat keterangan', W / 2, top + 30, { f: 'gothic', w: 600, size: 5.4, align: 'center' });
  p.fit('Cukup', W / 2, top + 45, W - 2 * M, { f: 'blackletter', size: 15, align: 'center', color: p.accent });
  p.fit('Kalcer', W / 2, top + 59, W - 2 * M, { f: 'blackletter', size: 15, align: 'center', color: p.accent });
  p.divider(top + 64);
  p.text(`nomor ${d.number}`, W / 2, top + 69.5, { f: 'typewriter', size: 2.2, align: 'center' });
  p.text('berlaku selama masih kalcer', W / 2, H - 13, { f: 'editorial', it: true, size: 3, align: 'center', color: MUTED });
  footer(p, H, 1);
}

function pasFoto(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  let y = heading(p, 'pas foto pemohon', 'lampiran i');
  const ph = Math.min(54, H - y - 31);
  const pw = ph * (4 / 6) * 1.0;
  const block = ph + 16;
  y += Math.max(1.5, (H - 14 - y - block) / 2);
  const px = (W - pw) / 2;
  photo(p, d.photos[0], px, y, pw, ph);
  p.text('4 × 6', px + pw + 1.5, y + ph, { f: 'typewriter', size: 1.8, color: MUTED });
  y += ph + 7;
  p.fit(d.name, W / 2, y, W - 2 * M, { f: 'gothic', w: 800, size: 5.2, align: 'center' });
  p.text(`kategori ${d.kategori.toLowerCase()} — ${kategori(d).label}`, W / 2, y + 5, { f: 'editorial', it: true, size: 2.9, align: 'center', color: MUTED, maxW: W - 2 * M });
  footer(p, H, 2);
}

function bukti(p: Pen, H: number, d: SkckData, idx: number, title: string, kicker: string, page: number | null) {
  const W = p.W;
  let y = heading(p, title, kicker);
  const pw = W - 2 * M - 2;
  const ph = Math.min(pw * 1.22, H - y - 26);
  const block = ph + 13;
  y += Math.max(1.5, (H - 14 - y - block) / 2);
  photo(p, d.photos[idx] ?? d.photos[0], (W - pw) / 2, y, pw, ph);
  // evidence tag
  y += ph + 5.5;
  p.text(`dok. ${tanggal(d)}`, M + 1, y, { f: 'typewriter', size: 2.1 });
  p.text(`no. ${idx + 1}`, W - M - 1, y, { f: 'typewriter', size: 2.1, align: 'right' });
  p.text(d.eventName, M + 1, y + 4, { f: 'editorial', it: true, size: 2.8, color: MUTED, maxW: W - 2 * M - 2 });
  if (page) footer(p, H, page);
}

function punggung(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  // vertical title, reads bottom → top
  const c = p.ctx;
  c.save();
  // title column runs between the top border and the barcode block
  const top = 9;
  const bottom = H - 34;
  c.translate((W / 2) * p.u, ((top + bottom) / 2) * p.u);
  c.rotate(-Math.PI / 2);
  p.fit('Cukup Kalcer', 0, 6, bottom - top, { f: 'blackletter', size: 17, align: 'center', color: p.accent });
  p.text('surat keterangan', 0, -9.5, { f: 'gothic', w: 600, size: 4.4, align: 'center' });
  c.restore();
  const by = H - 27;
  p.divider(by - 4);
  barcode(p, M + 2, by, W - 2 * M - 4, 8, d.number);
  p.text(d.number, W / 2, by + 11.5, { f: 'typewriter', size: 2, align: 'center' });
  footer(p, H, 4);
}

function keterangan(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  let y = heading(p, 'keterangan', 'yang bertanda tangan di bawah ini');
  y = p.para('Menerangkan dengan sebenarnya bahwa pemohon tersebut di bawah ini:', M, y + 1, W - 2 * M, 3.6, { f: 'editorial', size: 3 });
  const rows: Array<[string, string]> = [
    ['nama', d.name],
    ['kategori', `${d.kategori.toLowerCase()} — ${kategori(d).label}`],
    ['tempat mejeng', d.eventName],
    ['tanggal', tanggal(d)],
    ['keperluan', 'nongkrong, mejeng & foto-foto'],
    ['catatan', 'nihil, tidak pernah jaim'],
  ];
  const lx = M;
  const vx = M + 19;
  y += 1.2;
  for (const [k, v] of rows) {
    p.text(k, lx, y, { f: 'typewriter', size: 2.1, color: MUTED });
    p.text(':', vx - 1.6, y, { f: 'typewriter', size: 2.1, color: MUTED });
    const ny = p.para(v, vx, y, W - M - vx, 3.4, { f: 'gothic', w: 600, size: 2.9 });
    p.line(vx, y + 0.9, W - M, y + 0.9, 0.1, MUTED, [0.4, 0.5]);
    y = ny + 0.6;
  }
  y += 1;
  y = p.para('Selama mengikuti sesi foto, yang bersangkutan berkelakuan baik dan', M, y, W - 2 * M, 3.6, { f: 'editorial', size: 3 });
  p.fit('dinyatakan cukup kalcer.', M, y, W - 2 * M, { f: 'gothic', w: 800, size: 3.6, color: p.accent });
  // signature block, anchored to the bottom
  const sy = H - 14;
  p.text(`depok, ${tanggal(d)}`, W - M, sy - 15, { f: 'editorial', it: true, size: 2.6, align: 'right' });
  const c = p.ctx;
  c.save();
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, 0.35 * p.u);
  c.lineCap = 'round';
  c.beginPath();
  const sx = (W - M - 24) * p.u;
  const yy = (sy - 6) * p.u;
  c.moveTo(sx, yy);
  c.bezierCurveTo(sx + 4 * p.u, yy - 6 * p.u, sx + 7 * p.u, yy + 3 * p.u, sx + 10 * p.u, yy - 2 * p.u);
  c.bezierCurveTo(sx + 13 * p.u, yy - 6 * p.u, sx + 16 * p.u, yy + 2 * p.u, sx + 23 * p.u, yy - 1.5 * p.u);
  c.stroke();
  c.restore();
  p.line(W - M - 26, sy - 2.5, W - M, sy - 2.5, 0.15);
  p.text('kepala biro urusan kalcer', W - M, sy + 0.5, { f: 'typewriter', size: 1.8, align: 'right', color: MUTED });
  stamp(p, M + 10.5, sy - 8.5, 9.5);
  footer(p, H, 5);
}

function sidikJari(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  let y = heading(p, 'rumus sidik kalcer', 'lampiran ii');
  const fingers = ['jempol', 'telunjuk', 'tengah', 'kelingking'];
  const bw = (W - 2 * M - 3) / 2;
  const bh = 17;
  fingers.forEach((f, i) => {
    const x = M + (i % 2) * (bw + 3);
    const yy = y + Math.floor(i / 2) * (bh + 3);
    p.rect(x, yy, bw, bh, { stroke: INK, width: 0.2 });
    fingerprint(p, x + bw / 2, yy + bh / 2 - 1.5, 4.2, 5.4, 11 + i * 97 + d.number.length);
    p.text(f, x + bw / 2, yy + bh - 1.4, { f: 'typewriter', size: 1.8, align: 'center', color: MUTED });
  });
  y += 2 * (bh + 3) + 4;
  p.text('kalcer', M, y, { f: 'blackletter', size: 7, color: p.accent });
  p.text('(n.)', M + p.measure('kalcer', { f: 'blackletter', size: 7 }) + 1.5, y, { f: 'editorial', it: true, size: 3, color: MUTED });
  y += 5;
  p.para('Plesetan dari “culture”: selera, gaya, dan cara nongkrong yang bikin orang lain penasaran. Tidak bisa dibeli, hanya bisa dilatih — misalnya lewat photobooth.', M, y, W - 2 * M, 3.7, { f: 'editorial', size: 3 });
  footer(p, H, 6);
}

function ketentuan(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  let y = heading(p, 'ketentuan', 'harap dibaca sebelum mejeng');
  const pasal = [
    ['pasal 1', 'Dilarang jaim di depan kamera.'],
    ['pasal 2', 'Senyum minimal tiga detik, atau pura-pura misterius.'],
    ['pasal 3', 'Pose kayang diizinkan, risiko tanggung sendiri.'],
    ['pasal 4', 'Surat ini sah dari halte bikun sampai danau kenanga.'],
  ];
  for (const [k, v] of pasal) {
    p.text(k, M, y, { f: 'gothic', w: 800, size: 3, color: p.accent });
    y = p.para(v, M + 13, y, W - 2 * M - 13, 3.6, { f: 'editorial', size: 3 }) + 1.4;
  }
  const size = Math.min(24, H - y - 22);
  const qy = H - 14 - size - 4;
  qr(p, d.qrValue, (W - size) / 2, qy, size);
  p.text('pindai untuk foto digital', W / 2, qy + size + 3.5, { f: 'editorial', it: true, size: 2.6, align: 'center', color: MUTED });
  footer(p, H, 7);
}

function penutup(p: Pen, H: number, d: SkckData) {
  const W = p.W;
  bukti(p, H - 12, d, 2, 'barang bukti', 'lampiran iii', null);
  // disclaimer replaces the bottom area
  p.rect(M, H - 19.5, W - 2 * M, 10.5, { fill: SHADE });
  p.para('Parodi photozine dari Photovoks — bukan dokumen resmi kepolisian. Simpan di dompet, tunjukkan kalau ditanya “kalcer-nya mana?”', M + 1.5, H - 16.5, W - 2 * M - 3, 2.9, { f: 'editorial', it: true, size: 2.3 });
  footer(p, H, 8);
}

// ── Sheet ────────────────────────────────────────────────────────────────────

export type SkckPanelId = 'F0' | 'F1' | 'F2' | 'F3' | 'B0' | 'B1' | 'B2' | 'B3';
export const SKCK_FRONT: SkckPanelId[] = ['F0', 'F1', 'F2', 'F3'];
export const SKCK_BACK: SkckPanelId[] = ['B0', 'B1', 'B2', 'B3'];

/** Draws a panel into (0,0,Wpx,Hpx). */
export function drawPanel(ctx: CanvasRenderingContext2D, id: SkckPanelId, Wpx: number, Hpx: number, d: SkckData) {
  const u = Wpx / PANEL_W_MM;
  const H = Hpx / u;
  const p = new Pen(ctx, u, d.look);
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, Wpx, Hpx);
  border(p, H);
  switch (id) {
    case 'F0':
      cover(p, H, d);
      break;
    case 'F1':
      pasFoto(p, H, d);
      break;
    case 'F2':
      bukti(p, H, d, 1, 'pose terdaftar', 'arsip kalcer', 3);
      break;
    case 'F3':
      punggung(p, H, d);
      break;
    case 'B0':
      keterangan(p, H, d);
      break;
    case 'B1':
      sidikJari(p, H, d);
      break;
    case 'B2':
      ketentuan(p, H, d);
      break;
    case 'B3':
      penutup(p, H, d);
      break;
  }
  ctx.restore();
}

export function skckPxPerMm(paper: SkckPaper, maxPixels = 12_000_000): number {
  const at300 = 300 / 25.4;
  const px = paper.widthMm * paper.heightMm * at300 * at300;
  return px <= maxPixels ? at300 : at300 * Math.sqrt(maxPixels / px);
}

/**
 * Full sheet (landscape). `guides` adds dashed fold lines + labels for the
 * on-screen folding guide only — downloads and prints are clean.
 */
export function renderSkckSheet(d: SkckData, paper: SkckPaper, guides = false, pxPerMm = skckPxPerMm(paper)): HTMLCanvasElement {
  const W = Math.round(paper.widthMm * pxPerMm);
  const H = Math.round(paper.heightMm * pxPerMm);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const pw = W / 4;
  const ph = H / 2;
  SKCK_FRONT.forEach((id, i) => {
    ctx.save();
    ctx.translate(i * pw, ph);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    drawPanel(ctx, id, pw, ph, d);
    ctx.restore();
  });
  SKCK_BACK.forEach((id, j) => {
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
  if (guides) drawGuides(ctx, W, H, pxPerMm);
  return c;
}

/** Fold guide overlay (preview only). */
function drawGuides(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
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
  ctx.restore();
  label('lipat 1 · ke belakang', W / 2, ph, '#C4201A');
  kinds.forEach((kind, i) => label(`${i + 2} · ${kind}`, (i + 1) * pw, H * 0.75, kind === 'gunung' ? '#2747C9' : '#1E7A3E'));
  // tint the upside-down half so it's obvious which side is the back
  ctx.fillStyle = 'rgba(39,71,201,0.06)';
  ctx.fillRect(0, 0, W, ph);
  label('sisi belakang (terbalik)', W / 2, ph * 0.1, '#5E5850');
}

/** One panel as its own canvas (studio preview / accordion mock-up). */
export function renderSkckPanel(id: SkckPanelId, d: SkckData, width = 360, paper: SkckPaper = SKCK_PAPERS[0]): HTMLCanvasElement {
  const ratio = paper.heightMm / 2 / (paper.widthMm / 4);
  const c = createCanvas(width, Math.round(width * ratio));
  drawPanel(c.getContext('2d')!, id, c.width, c.height, d);
  return c;
}
