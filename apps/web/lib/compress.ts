/**
 * Browser-side image compression before upload (client only).
 *
 * Small files = less storage and, above all, less egress every time someone
 * views them. Defaults keep print quality: frame overlays stay at full
 * resolution (only re-encoded), stickers/icons are capped to 512 px.
 *
 * WebP keeps transparency and is ~25–35 % smaller than PNG at visually
 * lossless quality. When the browser can't encode WebP (older Safari), PNG is
 * kept for transparent images and JPEG for opaque ones.
 */

let webpSupport: boolean | null = null;

export function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), type, quality));
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Sample a downscaled copy: fast and good enough to detect transparency.
  const sw = Math.min(64, w);
  const sh = Math.min(64, h);
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const sctx = c.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
  const d = sctx.getImageData(0, 0, sw, sh).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

export interface CompressOptions {
  /** Longest side in px (default: keep). */
  maxSide?: number;
  /** 0–1 (default 0.9). */
  quality?: number;
  /** Force an output type; default picks WebP / PNG / JPEG automatically. */
  type?: 'image/webp' | 'image/jpeg' | 'image/png';
  /** Never make the file bigger than the original (default true). */
  neverLarger?: boolean;
}

export interface CompressResult {
  blob: Blob;
  type: string;
  width: number;
  height: number;
  /** Bytes saved vs. the original. */
  saved: number;
}

export async function compressImage(file: Blob, opts: CompressOptions = {}): Promise<CompressResult> {
  const { maxSide, quality = 0.9, neverLarger = true } = opts;
  const img = await decode(file);
  const scale = maxSide ? Math.min(1, maxSide / Math.max(img.width, img.height)) : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.source, 0, 0, w, h);
  img.close?.();

  let type = opts.type;
  if (!type) {
    if (canEncodeWebp()) type = 'image/webp';
    else type = hasAlpha(ctx, w, h) ? 'image/png' : 'image/jpeg';
  }
  if (type === 'image/webp' && !canEncodeWebp()) type = hasAlpha(ctx, w, h) ? 'image/png' : 'image/jpeg';
  if (type === 'image/jpeg') {
    // Flatten transparency onto white for JPEG.
    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d')!;
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvas, 0, 0);
    const blob = await toBlob(flat, type, quality);
    return pickSmaller(file, blob, type, w, h, scale, neverLarger);
  }
  const blob = await toBlob(canvas, type, type === 'image/png' ? undefined : quality);
  return pickSmaller(file, blob, type, w, h, scale, neverLarger);
}

function pickSmaller(original: Blob, blob: Blob, type: string, w: number, h: number, scale: number, neverLarger: boolean): CompressResult {
  // Same dimensions and the re-encode didn't help → keep the original bytes.
  if (neverLarger && scale === 1 && blob.size >= original.size && original.type) {
    return { blob: original, type: original.type, width: w, height: h, saved: 0 };
  }
  return { blob, type, width: w, height: h, saved: Math.max(0, original.size - blob.size) };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
