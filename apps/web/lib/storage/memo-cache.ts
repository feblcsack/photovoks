/**
 * Tiny in-memory LRU for media bytes (SERVER ONLY). On a VPS / `pnpm booth`
 * it keeps hot photos in RAM; on Vercel it helps warm instances. Bounded by
 * total bytes (MEDIA_MEMORY_CACHE_MB, default 96 MB, 0 = off).
 */
interface Entry {
  body: Buffer;
  contentType: string;
}

const LIMIT = Math.max(0, Number(process.env.MEDIA_MEMORY_CACHE_MB ?? 96)) * 1024 * 1024;
const MAX_ITEM = 8 * 1024 * 1024;
const map = new Map<string, Entry>();
let total = 0;

export function memoGet(key: string): Entry | null {
  const e = map.get(key);
  if (!e) return null;
  map.delete(key);
  map.set(key, e); // most recently used
  return e;
}

export function memoSet(key: string, entry: Entry) {
  if (!LIMIT || entry.body.length > MAX_ITEM) return;
  const old = map.get(key);
  if (old) {
    total -= old.body.length;
    map.delete(key);
  }
  map.set(key, entry);
  total += entry.body.length;
  for (const [k, v] of map) {
    if (total <= LIMIT) break;
    map.delete(k);
    total -= v.body.length;
  }
}

export function memoStats() {
  return { items: map.size, bytes: total, limit: LIMIT };
}

/** De-duplicates concurrent work for the same key (e.g. 30 phones loading one photo). */
const pending = new Map<string, Promise<unknown>>();
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
