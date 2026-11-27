/**
 * Meme looks for booth photos (browser only), applied per photo after the
 * colour grade — the same function draws the review preview, the strip, the
 * GIF and the print, so what guests see is what they get.
 *
 * Captions are Indonesian, kalcer-flavoured, family-friendly.
 */
import { createCanvas } from '@/lib/frames/render';
import { FONTS, ensureFonts } from '@/lib/frames/fonts';
import { drawWordArt } from '@/lib/wordart';
import { filteredCopy } from './media';
import { applyGrade, type Adjustments } from './grade';

export type MemeStyle = 'none' | 'freaky' | 'swag' | 'cukup' | 'simulasi' | 'kabur' | 'offdulu' | 'pagi' | 'demotivasi' | 'gorengan' | 'vaporwave';

export const MEME_STYLES: Array<{ id: MemeStyle; label: string; hint: string }> = [
  { id: 'none', label: 'Tanpa meme', hint: 'Foto biasa' },
  { id: 'freaky', label: 'Freaky tiw…', hint: 'Vignet pink + teks miring' },
  { id: 'swag', label: 'Tes SWAG', hint: 'Bingkai pelangi + WordArt' },
  { id: 'cukup', label: 'Cukup hari ini', hint: 'Teks emas 3D di langit ungu' },
  { id: 'simulasi', label: 'Hidup = simulasi', hint: 'Psikedelik biru + teks lime' },
  { id: 'kabur', label: 'Lari dari masalah', hint: 'Motivasi aneh, hijau neon' },
  { id: 'offdulu', label: 'Off dulu bray', hint: 'Caption santai ala status' },
  { id: 'pagi', label: 'Selamat Pagi grup', hint: 'Ucapan WA keluarga, glitter & mawar' },
  { id: 'demotivasi', label: 'Poster demotivasi', hint: 'Bingkai hitam, huruf serif' },
  { id: 'gorengan', label: 'Deep-fried', hint: 'Over-saturasi, kriuk, flare merah' },
  { id: 'vaporwave', label: 'Vaporwave', hint: 'Grid neon, matahari 80an' },
];

const IDS = new Set(MEME_STYLES.map((m) => m.id));
export function isMemeStyle(v: unknown): v is MemeStyle {
  return typeof v === 'string' && IDS.has(v as MemeStyle);
}

/** Loads the fonts the meme layouts use (call before rendering). */
export function ensureMemeFonts(): Promise<void> {
  return ensureFonts([
    { font: 'script', weight: 400 },
    { font: 'heavy', weight: 400 },
    { font: 'impact', weight: 400 },
    { font: 'serif', weight: 700 },
    { font: 'bubble', weight: 400 },
    { font: 'scribble', weight: 400 },
    { font: 'rounded', weight: 800 },
  ]);
}

type Img = HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D;

/** Grade + meme. Always a new canvas when a meme is applied. */
export function styledCopy(source: HTMLCanvasElement, filter: string, meme: MemeStyle, adjust?: Partial<Adjustments> | null, caption = 'Depok, Jawa Barat'): HTMLCanvasElement {
  const graded = filteredCopy(source, filter, adjust);
  if (meme === 'none') return graded;
  const c = createCanvas(source.width, source.height);
  const ctx = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  switch (meme) {
    case 'freaky':
      freaky(ctx, graded, W, H, caption);
      break;
    case 'swag':
      swag(ctx, graded, W, H);
      break;
    case 'cukup':
      cukup(ctx, graded, W, H);
      break;
    case 'simulasi':
      simulasi(ctx, graded, W, H);
      break;
    case 'kabur':
      kabur(ctx, graded, W, H);
      break;
    case 'offdulu':
      offdulu(ctx, graded, W, H);
      break;
    case 'pagi':
      pagi(ctx, graded, W, H);
      break;
    case 'demotivasi':
      demotivasi(ctx, graded, W, H);
      break;
    case 'gorengan':
      gorengan(ctx, graded, W, H);
      break;
    case 'vaporwave':
      vaporwave(ctx, graded, W, H);
      break;
  }
  return c;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Cover-fit `img` into a rect (optionally clipped to a rounded rect). */
function cover(ctx: Ctx, img: Img, x: number, y: number, w: number, h: number, radius = 0) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.save();
  ctx.beginPath();
  if (radius) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** One or more WordArt lines centred at (cx, y…), auto-shrunk to fit `maxW`. */
function artLines(ctx: Ctx, lines: string[], cx: number, y: number, size: number, style: Parameters<typeof drawWordArt>[2], family: string, maxW: number, gap = 1.05) {
  lines.forEach((line, i) => {
    ctx.save();
    ctx.font = `400 ${size}px ${family}`;
    const fit = Math.min(1, maxW / Math.max(1, ctx.measureText(line).width * 1.12));
    ctx.translate(cx, y + i * size * gap);
    drawWordArt(ctx, line, style, size * fit, family);
    ctx.restore();
  });
}

/** Plain caption with outline (classic meme text). */
function outlined(ctx: Ctx, text: string, x: number, y: number, size: number, family: string, fill: string, stroke: string, maxW: number, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.font = `400 ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y, maxW);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxW);
  ctx.restore();
}

function sparkle(ctx: Ctx, x: number, y: number, r: number, color = '#FFFFFF') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

function seeded(n: number) {
  let s = n;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ── looks ────────────────────────────────────────────────────────────────────

function freaky(ctx: Ctx, img: Img, W: number, H: number, caption: string) {
  ctx.drawImage(img, 0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(214, 48, 150, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H * 0.48, r * 0.35, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(170,40,120,0.35)');
  g.addColorStop(1, 'rgba(70,10,60,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const band = H * 0.13;
  ctx.fillStyle = 'rgba(40,10,40,0.45)';
  ctx.fillRect(0, H * 0.05, W, band);
  const size = Math.min(W * 0.13, band * 0.8);
  ctx.font = `400 ${size}px ${FONTS.script.family}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.strokeStyle = 'rgba(40,10,40,0.85)';
  const title = 'freaky tiw........';
  ctx.strokeText(title, W * 0.05, H * 0.05 + band / 2, W * 0.9);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(title, W * 0.05, H * 0.05 + band / 2, W * 0.9);
  const cs = W * 0.075;
  ctx.font = `600 ${cs}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(caption, W / 2, H * 0.6 - cs * 0.35, W * 0.9);
  ctx.lineWidth = Math.max(1, cs * 0.06);
  ctx.strokeStyle = 'rgba(80,20,70,0.6)';
  ctx.strokeText(caption, W / 2, H * 0.6, W * 0.9);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(caption, W / 2, H * 0.6, W * 0.9);
}

function conic(ctx: Ctx, W: number, H: number, stops: string[], cx = W / 2, cy = H / 2) {
  const c = ctx as Ctx & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  const g = c.createConicGradient ? c.createConicGradient(0, cx, cy) : ctx.createLinearGradient(0, 0, W, H);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function swag(ctx: Ctx, img: Img, W: number, H: number) {
  conic(ctx, W, H, ['#FF2D55', '#FF9F1C', '#FFE066', '#3DDC84', '#2F80ED', '#9B51E0', '#FF2D55']);
  const ix = W * 0.07;
  const iy = H * 0.2;
  const iw = W * 0.86;
  const ih = H * 0.56;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ix - W * 0.012, iy - W * 0.012, iw + W * 0.024, ih + W * 0.024);
  cover(ctx, img, ix, iy, iw, ih);
  const t = Math.min(W * 0.075, H * 0.06);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `italic 400 ${t}px ${FONTS.heavy.family}`;
  ctx.fillStyle = '#120C08';
  ctx.fillText('Tes ujian mungkin gw', W / 2, H * 0.07, W * 0.92);
  ctx.save();
  ctx.translate(W / 2, H * 0.145);
  ctx.rotate(-0.06);
  drawWordArt(ctx, 'Remidi', 'sunset', t * 1.25, FONTS.impact.family);
  ctx.restore();
  ctx.font = `400 ${t * 0.9}px ${FONTS.heavy.family}`;
  ctx.fillStyle = '#120C08';
  ctx.fillText('Tapi tes', W * 0.3, H * 0.825, W * 0.5);
  ctx.save();
  ctx.translate(W * 0.68, H * 0.83);
  drawWordArt(ctx, 'SWAG', 'bubblegum', t * 1.5, FONTS.bubble.family);
  ctx.restore();
  ctx.font = `700 ${t * 0.95}px ${FONTS.serif.family}`;
  ctx.fillStyle = '#8C140E';
  ctx.fillText('udah pasti 1000% positif', W / 2, H * 0.93, W * 0.92);
}

/** "That's enough … for today, we start again tomorrow" — gold 3D over a dreamy sky. */
function cukup(ctx: Ctx, img: Img, W: number, H: number) {
  ctx.drawImage(img, 0, 0, W, H);
  // dreamy lilac sky fading in from top and bottom
  for (const [y0, y1] of [[0, H * 0.34], [H, H * 0.66]] as const) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(150,120,235,0.92)');
    g.addColorStop(0.55, 'rgba(190,170,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }
  // soft clouds
  const rnd = seeded(7);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * W;
    const cy = i < 5 ? rnd() * H * 0.22 : H - rnd() * H * 0.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, W * (0.12 + rnd() * 0.1), H * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const s = W * 0.11;
  artLines(ctx, ['CUKUP KALCERNYA', 'HARI INI'], W / 2, H * 0.09, s, 'gold', FONTS.serif.family, W * 0.94)
  ;
  artLines(ctx, ['BESOK KITA', 'MULAI LAGI'], W / 2, H * 0.8, s * 1.05, 'gold', FONTS.serif.family, W * 0.94);
  for (let i = 0; i < 6; i++) sparkle(ctx, rnd() * W, rnd() * H * 0.3, W * 0.015, '#FFF6C8');
}

/** Psychedelic blue rays, glowing photo, lime 3D quote. */
function simulasi(ctx: Ctx, img: Img, W: number, H: number) {
  // ray burst
  const cx = W / 2;
  const cy = H * 0.5;
  const rays = 28;
  ctx.fillStyle = '#0B2A8A';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 0.5) / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(W, H), a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#1E5BFF' : '#00C2FF';
    ctx.fill();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(160,255,120,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,10,60,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // glowing photo
  const iw = W * 0.82;
  const ih = H * 0.5;
  const ix = (W - iw) / 2;
  const iy = H * 0.25;
  ctx.save();
  ctx.shadowColor = '#7CFF4D';
  ctx.shadowBlur = W * 0.06;
  ctx.fillStyle = '#7CFF4D';
  ctx.fillRect(ix, iy, iw, ih);
  ctx.restore();
  cover(ctx, img, ix, iy, iw, ih);
  const s = W * 0.1;
  artLines(ctx, ['Kalau hidup ini', 'simulasi,'], W / 2, H * 0.08, s, 'lime', FONTS.heavy.family, W * 0.92);
  artLines(ctx, ['tolong', 'matiin dong'], W / 2, H * 0.82, s * 0.95, 'lime', FONTS.heavy.family, W * 0.92);
}

/** "If you can't run away from your problems…" — neon green motivational. */
function kabur(ctx: Ctx, img: Img, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#E8FF6A');
  g.addColorStop(0.5, '#7BE84A');
  g.addColorStop(1, '#2FB36B');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const iw = W * 0.86;
  const ih = H * 0.52;
  cover(ctx, img, (W - iw) / 2, H * 0.26, iw, ih, W * 0.04);
  ctx.save();
  ctx.lineWidth = W * 0.012;
  ctx.strokeStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect((W - iw) / 2, H * 0.26, iw, ih, W * 0.04);
  ctx.stroke();
  ctx.restore();
  const s = W * 0.085;
  artLines(ctx, ['kalau gak bisa kabur', 'dari masalahmu,'], W / 2, H * 0.08, s, 'ice', FONTS.bubble.family, W * 0.94);
  artLines(ctx, ['berarti larimu', 'kurang kencang'], W / 2, H * 0.84, s, 'ice', FONTS.bubble.family, W * 0.94);
}

/** "off dulu bray" — casual status caption, white card. */
function offdulu(ctx: Ctx, img: Img, W: number, H: number) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  cover(ctx, img, W * 0.06, H * 0.2, W * 0.88, H * 0.62);
  artLines(ctx, ['off dulu bray'], W / 2, H * 0.1, W * 0.15, 'cobalt', FONTS.heavy.family, W * 0.94);
  ctx.save();
  ctx.font = `400 ${W * 0.13}px ${FONTS.scribble.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#C4201A';
  ctx.fillText('lagi mejeng', W * 0.55, H * 0.905, W * 0.8);
  // little arrow scribble
  ctx.strokeStyle = '#C4201A';
  ctx.lineWidth = W * 0.012;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W * 0.14, H * 0.93);
  ctx.quadraticCurveTo(W * 0.08, H * 0.88, W * 0.16, H * 0.85);
  ctx.moveTo(W * 0.16, H * 0.85);
  ctx.lineTo(W * 0.12, H * 0.845);
  ctx.moveTo(W * 0.16, H * 0.85);
  ctx.lineTo(W * 0.145, H * 0.88);
  ctx.stroke();
  ctx.restore();
}

function rose(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5 + k * 0.3);
      ctx.beginPath();
      ctx.ellipse(0, -r * (0.55 - k * 0.15), r * (0.45 - k * 0.1), r * (0.55 - k * 0.12), 0, 0, Math.PI * 2);
      ctx.fillStyle = k === 2 ? '#8E0F3A' : color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#3FA34F';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.9, y + r * 0.5, r * 0.5, r * 0.22, 0.6, 0, Math.PI * 2);
  ctx.ellipse(x - r * 0.9, y + r * 0.6, r * 0.5, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** WhatsApp family-group "Selamat Pagi" greeting card. */
function pagi(ctx: Ctx, img: Img, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#FFD6EC');
  g.addColorStop(0.5, '#FFF3C4');
  g.addColorStop(1, '#FFC2DD');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // glitter
  const rnd = seeded(11);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = ['#FFD700', '#FFFFFF', '#FF69B4'][i % 3];
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    const s = W * (0.003 + rnd() * 0.006);
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }
  ctx.globalAlpha = 1;
  // photo in a gold rounded frame
  const iw = W * 0.8;
  const ih = H * 0.5;
  const ix = (W - iw) / 2;
  const iy = H * 0.24;
  ctx.save();
  ctx.shadowColor = 'rgba(180,120,0,0.6)';
  ctx.shadowBlur = W * 0.04;
  ctx.fillStyle = '#F2C14E';
  ctx.beginPath();
  ctx.roundRect(ix - W * 0.02, iy - W * 0.02, iw + W * 0.04, ih + W * 0.04, W * 0.06);
  ctx.fill();
  ctx.restore();
  cover(ctx, img, ix, iy, iw, ih, W * 0.05);
  rose(ctx, ix + W * 0.02, iy + ih, W * 0.08, '#FF4F8B');
  rose(ctx, ix + iw - W * 0.02, iy, W * 0.07, '#FF7BAC');
  artLines(ctx, ['Selamat Pagi'], W / 2, H * 0.11, W * 0.15, 'gold', FONTS.script.family, W * 0.94);
  ctx.save();
  ctx.font = `800 ${W * 0.055}px ${FONTS.rounded.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = W * 0.012;
  ctx.strokeStyle = '#D81B60';
  const lines = ['Semoga harimu penuh berkah', '& tetap kalcer ✿'];
  lines.forEach((l, i) => {
    ctx.strokeText(l, W / 2, H * (0.83 + i * 0.065), W * 0.92);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(l, W / 2, H * (0.83 + i * 0.065), W * 0.92);
  });
  ctx.restore();
  for (let i = 0; i < 8; i++) sparkle(ctx, rnd() * W, rnd() * H, W * (0.015 + rnd() * 0.015), '#FFFFFF');
}

/** Demotivational poster: black field, framed photo, big serif word. */
function demotivasi(ctx: Ctx, img: Img, W: number, H: number) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const iw = W * 0.8;
  const ih = H * 0.62;
  const ix = (W - iw) / 2;
  const iy = H * 0.07;
  cover(ctx, img, ix, iy, iw, ih);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(2, W * 0.006);
  ctx.strokeRect(ix - W * 0.015, iy - W * 0.015, iw + W * 0.03, ih + W * 0.03);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `400 ${W * 0.13}px ${FONTS.serif.family}`;
  const word = 'K A L C E R';
  ctx.fillText(word, W / 2, H * 0.8, W * 0.9);
  ctx.font = `400 ${W * 0.042}px ${FONTS.serif.family}`;
  ctx.fillText('Gak semua orang bisa bergaya.', W / 2, H * 0.875, W * 0.86);
  ctx.fillText('Tapi kamu sudah resmi mejeng.', W / 2, H * 0.92, W * 0.86);
}

/** Deep-fried meme: crushed colours, crunchy pixels, red flares, Impact text. */
function gorengan(ctx: Ctx, img: Img, W: number, H: number) {
  // crunch: downscale then upscale without smoothing
  const small = createCanvas(Math.max(8, Math.round(W * 0.35)), Math.max(8, Math.round(H * 0.35)));
  const sctx = small.getContext('2d')!;
  sctx.drawImage(img, 0, 0, small.width, small.height);
  applyGrade(small, { saturation: 110, contrast: 85, warmth: 45, exposure: 10, sharpness: 100, grain: 35 });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  // red lens flares
  for (const [fx, fy] of [[0.32, 0.36], [0.68, 0.36]]) {
    const x = W * fx;
    const y = H * fy;
    const r = W * 0.09;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,40,20,0.85)');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,230,0.9)';
    ctx.fillRect(x - r * 1.6, y - r * 0.04, r * 3.2, r * 0.08);
    ctx.fillRect(x - r * 0.04, y - r * 1.2, r * 0.08, r * 2.4);
  }
  outlined(ctx, 'KETIKA FOTONYA', W / 2, H * 0.08, W * 0.12, FONTS.impact.family, '#FFFFFF', '#000000', W * 0.94);
  outlined(ctx, 'KALCER PARAH 100%', W / 2, H * 0.92, W * 0.12, FONTS.impact.family, '#FFFFFF', '#000000', W * 0.94);
}

/** Vaporwave: sunset stripes, neon grid floor, RGB-split photo, spaced title. */
function vaporwave(ctx: Ctx, img: Img, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2B0B5A');
  g.addColorStop(0.45, '#FF5FA2');
  g.addColorStop(0.62, '#FFB86B');
  g.addColorStop(0.63, '#1A0A3A');
  g.addColorStop(1, '#1A0A3A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // sun with stripes
  const sx = W / 2;
  const sy = H * 0.56;
  const sr = W * 0.32;
  const sg = ctx.createLinearGradient(0, sy - sr, 0, sy);
  sg.addColorStop(0, '#FFE66B');
  sg.addColorStop(1, '#FF4F9A');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, sy);
  ctx.clip();
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FF5FA2';
  for (let i = 1; i < 6; i++) ctx.fillRect(sx - sr, sy - sr * 0.12 * i * 1.4, sr * 2, sr * 0.035 * i);
  ctx.restore();
  // grid floor
  ctx.save();
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = Math.max(1, W * 0.004);
  const hy = H * 0.63;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * W * 0.02, hy);
    ctx.lineTo(W / 2 + i * W * 0.2, H);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const y = hy + (H - hy) * Math.pow(k / 8, 1.8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  // RGB-split photo
  const iw = W * 0.62;
  const ih = H * 0.46;
  const ix = (W - iw) / 2;
  const iy = H * 0.2;
  const off = W * 0.012;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = '#FF0050';
  ctx.fillRect(ix - off, iy, iw, ih);
  ctx.fillStyle = '#00E5FF';
  ctx.fillRect(ix + off, iy, iw, ih);
  ctx.restore();
  cover(ctx, img, ix, iy, iw, ih);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(2, W * 0.006);
  ctx.strokeRect(ix, iy, iw, ih);
  // title
  const t = 'M E J E N G';
  for (const [dx, col] of [[-off, '#00E5FF'], [off, '#FF0050'], [0, '#FFFFFF']] as const) {
    ctx.save();
    ctx.font = `400 ${W * 0.11}px ${FONTS.heavy.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(t, W / 2 + dx, H * 0.1, W * 0.92);
    ctx.restore();
  }
  ctx.save();
  ctx.font = `400 ${W * 0.045}px ${FONTS.typewriter.family}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFE66B';
  ctx.fillText('kalcer  2000  ☆  depok', W / 2, H * 0.95, W * 0.9);
  ctx.restore();
}
