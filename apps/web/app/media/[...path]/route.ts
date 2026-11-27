/**
 * GET /media/<bucket>/<path>?s=<sig>[&w=<width>][&f=webp][&dl=<filename>]
 *
 * Serves stored files through stable, HMAC-signed URLs with long cache
 * headers. Browsers and the CDN keep the bytes, so each file is pulled from
 * the origin storage (Supabase / R2) once instead of on every page view or
 * poll. `w` + `f=webp` return a resized WebP (thumbnails, previews) which is
 * typically 5–15× smaller than the original JPEG/PNG; GIFs become animated
 * WebP. Videos redirect to a long-lived direct URL (Safari needs ranges).
 *
 * Outside the proxy matcher on purpose: cached hits must stay cheap.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import sharp from 'sharp';
import { contentTypeOf, directReadUrl, downloadObject, isMediaPath, verifyMediaSig } from '@/lib/storage';
import { memoGet, memoSet, once } from '@/lib/storage/memo-cache';
import { MEDIA_WIDTHS } from '@/lib/media-variant';
import { flushUsage, trackUsage } from '@/lib/usage';
import { getSettings } from '@/lib/settings';

export const maxDuration = 30;

const YEAR = 31_536_000;
const IMMUTABLE = `public, max-age=${YEAR}, s-maxage=${30 * 86_400}, immutable`;
const VIDEO_TTL = 7 * 86_400;
const WEBP_QUALITY = { saver: 68, balanced: 78, high: 86 } as const;

type Ctx = { params: Promise<{ path: string[] }> };

function notFound(status = 404) {
  return new NextResponse(null, { status, headers: { 'Cache-Control': 'public, max-age=60' } });
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path: segs } = await ctx.params;
  if (!segs || segs.length < 2) return notFound();
  const [bucket, ...rest] = segs;
  const path = rest.join('/');
  if (!isMediaPath(bucket, path)) return notFound();
  const sp = request.nextUrl.searchParams;
  if (!verifyMediaSig(bucket, path, sp.get('s'))) return notFound(403);

  const etag = `"${sp.get('s')}-${sp.get('w') ?? 0}-${sp.get('f') ?? 'o'}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': IMMUTABLE } });
  }

  const type = contentTypeOf(path);

  // Large videos: redirect to a long-lived provider URL. The redirect itself
  // is cached, so every booth reuses one URL (and the browser's video cache).
  if (type.startsWith('video/')) {
    const url = await directReadUrl(bucket, path, VIDEO_TTL);
    if (!url) return notFound();
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': `public, max-age=${VIDEO_TTL - 86_400}` } });
  }

  const wRaw = Number(sp.get('w'));
  const width = (MEDIA_WIDTHS as readonly number[]).includes(wRaw) ? wRaw : 0;
  const webp = sp.get('f') === 'webp' && type.startsWith('image/');
  const key = `${bucket}/${path}|${width}|${webp ? 'webp' : 'o'}`;

  let entry = memoGet(key);
  if (!entry) {
    try {
      entry = await once(key, async () => {
        const original = memoGet(`${bucket}/${path}|0|o`) ?? (await fetchOriginal(bucket, path));
        if (!original) return null;
        memoSet(`${bucket}/${path}|0|o`, original);
        if (!width && !webp) return original;
        const { performance } = await getSettings();
        const out = await transform(original.body, type, width, WEBP_QUALITY[performance.imageQuality]);
        trackUsage('transform_requests', 1);
        const e = { body: out, contentType: 'image/webp' };
        memoSet(key, e);
        return e;
      });
    } catch {
      entry = null;
    }
  }
  after(flushUsage);
  if (!entry) return notFound();

  trackUsage('served_bytes', entry.body.length);
  trackUsage('served_requests', 1);

  const headers: Record<string, string> = {
    'Content-Type': entry.contentType,
    'Content-Length': String(entry.body.length),
    'Cache-Control': IMMUTABLE,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  const dl = sp.get('dl');
  if (dl) headers['Content-Disposition'] = `attachment; filename="${dl.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'photovoks'}"`;
  return new NextResponse(new Uint8Array(entry.body), { status: 200, headers });
}

async function fetchOriginal(bucket: Parameters<typeof downloadObject>[0], path: string) {
  let obj = await downloadObject(bucket, path);
  // Sessions from older booth builds stored the strip as PNG.
  if (!obj && bucket === 'sessions' && path.endsWith('/strip.jpg')) obj = await downloadObject(bucket, path.replace(/strip\.jpg$/, 'strip.png'));
  if (!obj) return null;
  trackUsage('origin_bytes', obj.body.length);
  trackUsage('origin_requests', 1);
  return { body: obj.body, contentType: obj.contentType || contentTypeOf(path) };
}

async function transform(input: Buffer, type: string, width: number, quality: number): Promise<Buffer> {
  const animated = type === 'image/gif';
  let img = sharp(input, { animated, limitInputPixels: 80_000_000 });
  if (!animated) img = img.rotate();
  if (width) img = img.resize({ width, withoutEnlargement: true });
  return img.webp({ quality: animated ? Math.min(quality, 72) : quality, effort: animated ? 3 : 4, smartSubsample: true }).toBuffer();
}
