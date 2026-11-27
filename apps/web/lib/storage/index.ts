/**
 * Storage facade (SERVER ONLY).
 *
 * - Writes go to the driver selected in the developer panel (Supabase or
 *   S3/R2). If that driver is not configured, Supabase is used.
 * - Reads try the active driver first, then the other configured driver
 *   (`readFallback`). This makes switching providers painless: old files keep
 *   loading from the old place while new files land in the new one.
 * - Browsers never get raw storage URLs for images: they get stable,
 *   HMAC-signed `/media/...` URLs (see media-url.ts) that browsers and the
 *   CDN can cache, so a photo is pulled from the origin only once.
 */
import { getSettings } from '@/lib/settings';
import { activeDbProfile, createServerClient, dbProfileConfig } from '@/lib/supabase/server';
import type { StorageDriverId } from '@/lib/settings-shared';
import { DRIVERS, supabaseDriver, type BucketName, type StorageDriver, type StoredObject } from './drivers';

export { BUCKETS, contentTypeOf, type BucketName, type StoredObject } from './drivers';
export { mediaUrl, mediaSig, verifyMediaSig, isMediaPath } from './media-url';

export async function activeDriver(): Promise<StorageDriver> {
  const { storage } = await getSettings();
  const d = DRIVERS[storage.driver];
  return d.configured() ? d : supabaseDriver;
}

/** Active driver first, then the others (when read fallback is on). */
async function readOrder(): Promise<StorageDriver[]> {
  const { storage } = await getSettings();
  const first = await activeDriver();
  if (!storage.readFallback) return [first];
  return [first, ...Object.values(DRIVERS).filter((d) => d !== first && d.configured())];
}

export async function downloadObject(bucket: BucketName, path: string): Promise<(StoredObject & { driver: StorageDriverId }) | null> {
  for (const d of await readOrder()) {
    try {
      const obj = await d.download(bucket, path);
      if (obj) return { ...obj, driver: d.id };
    } catch {
      /* try the next driver */
    }
  }
  // Running on the secondary database project: older files may still live in
  // the primary project's storage (if it is still reachable).
  if (activeDbProfile() === 'secondary' && dbProfileConfig('primary').configured) {
    try {
      const { data } = await createServerClient('primary').storage.from(bucket).download(path);
      if (data) return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type, driver: 'supabase' };
    } catch {
      /* unreachable */
    }
  }
  return null;
}

export async function uploadObject(bucket: BucketName, path: string, body: Buffer, contentType: string): Promise<void> {
  await (await activeDriver()).upload(bucket, path, body, contentType);
}

export async function createUploadUrl(bucket: BucketName, path: string): Promise<string> {
  return (await activeDriver()).uploadUrl(bucket, path);
}

/** Direct (provider) read URL for large files such as home-screen videos. */
export async function directReadUrl(bucket: BucketName, path: string, ttlSeconds: number): Promise<string | null> {
  for (const d of await readOrder()) {
    const names = await d.list(bucket, path.slice(0, path.lastIndexOf('/'))).catch(() => [] as string[]);
    if (names.includes(path.slice(path.lastIndexOf('/') + 1))) return d.readUrl(bucket, path, ttlSeconds);
  }
  return null;
}

/** Union of file names inside `dir` across readable drivers. */
export async function listFiles(bucket: BucketName, dir: string): Promise<string[]> {
  const out = new Set<string>();
  for (const d of await readOrder()) {
    for (const n of await d.list(bucket, dir).catch(() => [] as string[])) out.add(n);
  }
  return Array.from(out);
}

export async function objectExists(bucket: BucketName, path: string): Promise<boolean> {
  const names = await listFiles(bucket, path.slice(0, path.lastIndexOf('/')));
  return names.includes(path.slice(path.lastIndexOf('/') + 1));
}

/** Removes from every configured driver (a file may live in either). */
export async function removeObjects(bucket: BucketName, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await Promise.all(Object.values(DRIVERS).filter((d) => d.configured()).map((d) => d.remove(bucket, paths).catch(() => {})));
}

/** Removes a whole folder (one level deep) from every configured driver. */
export async function removeFolder(bucket: BucketName, dir: string): Promise<void> {
  for (const d of Object.values(DRIVERS).filter((x) => x.configured())) {
    const names = await d.list(bucket, dir).catch(() => [] as string[]);
    if (names.length) await d.remove(bucket, names.map((n) => `${dir}/${n}`)).catch(() => {});
  }
}
