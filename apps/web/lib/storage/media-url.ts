/**
 * Stable, cacheable media URLs (SERVER ONLY for signing).
 *
 *   /media/<bucket>/<path>?s=<sig>[&w=480][&f=webp][&dl=1]
 *
 * `sig` is an HMAC of bucket+path, so the URL is the same on every request.
 * That is the whole egress fix: Supabase signed URLs carry a fresh token on
 * every API call, so browsers re-downloaded every photo on every poll. A
 * stable URL is downloaded once, then served from the browser cache / CDN.
 *
 * The signature is a capability (like the old signed URLs, minus the expiry):
 * only people who were given the URL can fetch the file.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BUCKETS, type BucketName } from './drivers';

const SEG_RE = /^[A-Za-z0-9._-]{1,120}$/;

function mediaKey(): Buffer {
  const base = process.env.MEDIA_SIGNING_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('Missing ADMIN_SESSION_SECRET');
  return createHmac('sha256', base).update('photovoks-media-v1').digest();
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  return (cachedKey ??= mediaKey());
}

export function isMediaPath(bucket: string, path: string): bucket is BucketName {
  if (!(BUCKETS as readonly string[]).includes(bucket)) return false;
  const segs = path.split('/');
  return segs.length >= 1 && segs.length <= 6 && segs.every((s) => SEG_RE.test(s) && s !== '.' && s !== '..');
}

export function mediaSig(bucket: BucketName, path: string): string {
  return createHmac('sha256', key()).update(`${bucket}/${path}`).digest('base64url').slice(0, 22);
}

export function verifyMediaSig(bucket: BucketName, path: string, sig: string | null): boolean {
  if (!sig || sig.length !== 22) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(mediaSig(bucket, path));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stable URL for a stored file. Returns null for empty/invalid paths. */
export function mediaUrl(bucket: BucketName, path: string | null | undefined): string | null {
  if (!path || !isMediaPath(bucket, path)) return null;
  return `/media/${bucket}/${path}?s=${mediaSig(bucket, path)}`;
}
