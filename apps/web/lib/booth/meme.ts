/**
 * Meme looks for booth photos (browser only), applied per photo after the
 * colour filter — same function for the review preview, the strip, the GIF
 * and the print, so what guests see is what they get.
 *
 *   freaky  pink/magenta vignette, script "freaky tiw........" title band and
 *           a doubled ghost caption (the classic edit-app meme look)
 *   swag    rainbow burst border, photo inset, WordArt punchlines
 */
import { createCanvas } from '@/lib/frames/render';
import { FONTS, ensureFonts } from '@/lib/frames/fonts';
import { drawWordArt } from '@/lib/wordart';
import { filteredCopy } from './media';

export type MemeStyle = 'none' | 'freaky' | 'swag';
export const MEME_STYLES: Array<{ id: MemeStyle; label: string; hint: string }> = [
  { id: 'none', label: 'Tanpa meme', hint: 'Foto biasa' },
  { id: 'freaky', label: 'Freaky tiw…', hint: 'Vignet pink + teks miring' },
  { id: 'swag', label: 'Tes SWAG', hint: 'Bingkai pelangi + WordArt' },
];

export function isMemeStyle(v: unknown): v is MemeStyle {
  return v === 'none' || v === 'freaky' || v === 'swag';
}

/** Loads the fonts the meme layouts use (call before rendering). */
export function ensureMemeFonts(): Promise<void> {
  return ensureFonts([
    { font: 'script', weight: 400 },
    { font: 'heavy', weight: 400 },
    { font: 'impact', weight: 400 },
    { font: 'serif', weight: 700 },
    { font: 'bubble', weight: 400 },
  ]);
}

/** Filter + meme, always a new canvas when a meme is applied. */
export function styledCopy(source: HTMLCanvasElement, filter: string, meme: MemeStyle, caption = 'Depok, Jawa Barat'): HTMLCanvasElement {
  const filtered = filteredCopy(source, filter);
  if (meme === 'none') return filtered;
  const c = createCanvas(source.width, source.height);
  const ctx = c.getContext('2d')!;
  if (meme === 'freaky') freaky(ctx, filtered, c.width, c.height, caption);
  else swag(ctx, filtered, c.width, c.height);
  return c;
}

function freaky(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, W: number, H: number, caption: string) {
  ctx.drawImage(img, 0, 0, W, H);
  // magenta colour cast
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(214, 48, 150, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // pink-purple vignette
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H * 0.48, r * 0.35, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(170,40,120,0.35)');
  g.addColorStop(1, 'rgba(70,10,60,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // title band
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
  // doubled ghost caption
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

function swag(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, W: number, H: number) {
  // rainbow burst
  const ctxAny = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  const stops = ['#FF2D55', '#FF9F1C', '#FFE066', '#3DDC84', '#2F80ED', '#9B51E0', '#FF2D55'];
  const g = ctxAny.createConicGradient ? ctxAny.createConicGradient(0, W / 2, H / 2) : ctx.createLinearGradient(0, 0, W, H);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // inset photo (cover-cropped), white border
  const ix = W * 0.07;
  const iy = H * 0.2;
  const iw = W * 0.86;
  const ih = H * 0.56;
  const s = Math.max(iw / img.width, ih / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ix - W * 0.012, iy - W * 0.012, iw + W * 0.024, ih + W * 0.024);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  ctx.restore();
  // top punchline
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
  // bottom punchline
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
