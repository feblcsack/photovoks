/**
 * Storage drivers (SERVER ONLY).
 *
 *   supabase  Supabase Storage of the active database project (default).
 *   s3        Any S3-compatible service: Cloudflare R2 (recommended — no
 *             egress fees), MinIO on your own VPS, Backblaze B2, Wasabi…
 *             All app buckets share ONE S3 bucket, prefixed by bucket name.
 */
import { createServerClient } from '@/lib/supabase/server';
import type { StorageDriverId } from '@/lib/settings-shared';
import { presignUrl, signHeaders, type S3Credentials } from './sigv4';

export type BucketName = 'sessions' | 'sketches' | 'frames' | 'event-media';
export const BUCKETS: readonly BucketName[] = ['sessions', 'sketches', 'frames', 'event-media'];

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface StorageDriver {
  readonly id: StorageDriverId;
  readonly label: string;
  configured(): boolean;
  download(bucket: BucketName, path: string): Promise<StoredObject | null>;
  upload(bucket: BucketName, path: string, body: Buffer, contentType: string): Promise<void>;
  /** URL the browser PUTs the file to (short-lived). */
  uploadUrl(bucket: BucketName, path: string): Promise<string>;
  /** Short-lived direct read URL (used for large videos only). */
  readUrl(bucket: BucketName, path: string, ttlSeconds: number): Promise<string | null>;
  /** File names (not paths) directly inside folder `dir`. */
  list(bucket: BucketName, dir: string): Promise<string[]>;
  remove(bucket: BucketName, paths: string[]): Promise<void>;
  /** Every object of a bucket, page by page (storage migration tool). */
  listAll(bucket: BucketName, after: string | null, limit: number): Promise<Array<{ path: string; size: number }>>;
}

export const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

// ── Supabase ────────────────────────────────────────────────────────────────

export const supabaseDriver: StorageDriver = {
  id: 'supabase',
  label: 'Supabase Storage',
  configured: () => true,
  async download(bucket, path) {
    const { data, error } = await createServerClient().storage.from(bucket).download(path);
    if (error || !data) return null;
    return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type || contentTypeOf(path) };
  },
  async upload(bucket, path, body, contentType) {
    const { error } = await createServerClient().storage.from(bucket).upload(path, body, { contentType, upsert: true });
    if (error) throw new Error(`Upload gagal: ${error.message}`);
  },
  async uploadUrl(bucket, path) {
    const { data, error } = await createServerClient().storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error('Gagal menyiapkan upload');
    return data.signedUrl;
  },
  async readUrl(bucket, path, ttlSeconds) {
    const { data } = await createServerClient().storage.from(bucket).createSignedUrl(path, ttlSeconds);
    return data?.signedUrl ?? null;
  },
  async list(bucket, dir) {
    const { data } = await createServerClient().storage.from(bucket).list(dir, { limit: 1000 });
    return (data ?? []).filter((f) => f.id !== null).map((f) => f.name);
  },
  async remove(bucket, paths) {
    if (paths.length) await createServerClient().storage.from(bucket).remove(paths);
  },
  async listAll(bucket, after, limit) {
    const { data, error } = await createServerClient().rpc('list_storage_objects', { p_bucket: bucket, p_after: after ?? '', p_limit: limit });
    if (error) throw new Error(error.message.includes('list_storage_objects') ? 'Jalankan migrasi v5 dulu' : error.message);
    return ((data ?? []) as Array<{ name: string; size: number }>).map((r) => ({ path: r.name, size: Number(r.size) || 0 }));
  },
};

// ── S3-compatible (R2 / MinIO / B2) ─────────────────────────────────────────

export interface S3Config extends S3Credentials {
  endpoint: string;
  bucket: string;
}

export function s3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: process.env.S3_REGION || 'auto' };
}

function objectUrl(cfg: S3Config, bucket: BucketName, path: string, query?: Record<string, string>): URL {
  const key = `${bucket}/${path}`.split('/').map(encodeURIComponent).join('/');
  const u = new URL(`${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}/${key}`);
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
  return u;
}

async function s3Fetch(cfg: S3Config, method: string, url: URL, body?: Buffer | string, headers: Record<string, string> = {}) {
  const signed = signHeaders(cfg, method, url, headers, body ?? null);
  return fetch(url, { method, headers: signed, body: body ? new Uint8Array(body instanceof Buffer ? body : Buffer.from(body)) : undefined, cache: 'no-store' });
}

function unxml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export const s3Driver: StorageDriver = {
  id: 's3',
  label: 'S3 / Cloudflare R2',
  configured: () => s3Config() !== null,
  async download(bucket, path) {
    const cfg = s3Config();
    if (!cfg) return null;
    const res = await s3Fetch(cfg, 'GET', objectUrl(cfg, bucket, path));
    if (!res.ok) return null;
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || contentTypeOf(path) };
  },
  async upload(bucket, path, body, contentType) {
    const cfg = s3Config();
    if (!cfg) throw new Error('S3 belum dikonfigurasi');
    const res = await s3Fetch(cfg, 'PUT', objectUrl(cfg, bucket, path), body, { 'content-type': contentType });
    if (!res.ok) throw new Error(`Upload S3 gagal (${res.status})`);
  },
  async uploadUrl(bucket, path) {
    const cfg = s3Config();
    if (!cfg) throw new Error('S3 belum dikonfigurasi');
    return presignUrl(cfg, 'PUT', objectUrl(cfg, bucket, path), 15 * 60);
  },
  async readUrl(bucket, path, ttlSeconds) {
    const cfg = s3Config();
    return cfg ? presignUrl(cfg, 'GET', objectUrl(cfg, bucket, path), ttlSeconds) : null;
  },
  async list(bucket, dir) {
    const cfg = s3Config();
    if (!cfg) return [];
    const prefix = `${bucket}/${dir.replace(/\/+$/, '')}/`;
    const u = new URL(`${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}`);
    u.searchParams.set('list-type', '2');
    u.searchParams.set('prefix', prefix);
    u.searchParams.set('delimiter', '/');
    u.searchParams.set('max-keys', '1000');
    const res = await s3Fetch(cfg, 'GET', u);
    if (!res.ok) return [];
    const xml = await res.text();
    return Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (m) => unxml(m[1]).slice(prefix.length)).filter(Boolean);
  },
  async remove(bucket, paths) {
    const cfg = s3Config();
    if (!cfg) return;
    await Promise.all(paths.map((p) => s3Fetch(cfg, 'DELETE', objectUrl(cfg, bucket, p)).catch(() => null)));
  },
  async listAll(bucket, after, limit) {
    const cfg = s3Config();
    if (!cfg) return [];
    const u = new URL(`${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}`);
    u.searchParams.set('list-type', '2');
    u.searchParams.set('prefix', `${bucket}/`);
    u.searchParams.set('max-keys', String(Math.min(1000, limit)));
    if (after) u.searchParams.set('start-after', `${bucket}/${after}`);
    const res = await s3Fetch(cfg, 'GET', u);
    if (!res.ok) throw new Error(`S3 list gagal (${res.status})`);
    const xml = await res.text();
    return Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g), (m) => ({
      path: unxml(/<Key>([^<]+)<\/Key>/.exec(m[1])?.[1] ?? '').slice(bucket.length + 1),
      size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0),
    })).filter((o) => o.path);
  },
};

export const DRIVERS: Record<StorageDriverId, StorageDriver> = { supabase: supabaseDriver, s3: s3Driver };
