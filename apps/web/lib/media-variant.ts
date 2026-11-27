/**
 * Client-safe helpers for /media URLs: ask the server for a resized WebP
 * variant instead of the full-size original (thumbnails, grids, previews).
 * Non-/media URLs (blob:, data:, legacy signed URLs) are returned unchanged.
 */

/** Widths the media route accepts — a fixed set keeps CDN cache keys bounded. */
export const MEDIA_WIDTHS = [160, 320, 480, 720, 1080, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

export function nearestMediaWidth(px: number): MediaWidth {
  return MEDIA_WIDTHS.find((w) => w >= px) ?? MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1];
}

export function variant(url: string | null | undefined, opts: { w?: number; webp?: boolean; download?: string } = {}): string {
  if (!url) return '';
  if (!url.startsWith('/media/')) return url;
  const params: string[] = [];
  if (opts.w) params.push(`w=${nearestMediaWidth(opts.w)}`);
  if (opts.webp !== false && (opts.w || opts.webp)) params.push('f=webp');
  if (opts.download) params.push(`dl=${encodeURIComponent(opts.download)}`);
  return params.length ? `${url}&${params.join('&')}` : url;
}

/** Thumbnail-sized animated WebP of a GIF (≈60–70 % smaller than the GIF). */
export function animatedPreview(url: string | null | undefined, w = 480): string {
  return variant(url, { w, webp: true });
}
