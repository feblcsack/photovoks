/**
 * Event media (SERVER ONLY): home-screen video/image, sticker packs and
 * guestbook photos in the private `event-media` bucket. Everything is served
 * through short-lived signed URLs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_MEDIA_RE } from '@/lib/events';

export const EVENT_MEDIA_BUCKET = 'event-media';
export type EventMediaKind = 'attract' | 'stickers' | 'guestbook';

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ALLOWED: Record<EventMediaKind, string[]> = {
  attract: ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'],
  stickers: ['image/png', 'image/webp'],
  guestbook: ['image/jpeg'],
};

export function mediaPathFor(kind: EventMediaKind, eventId: string, contentType: string): string | null {
  if (!ALLOWED[kind].includes(contentType)) return null;
  return `${kind}/${eventId}/${crypto.randomUUID()}.${EXT_BY_TYPE[contentType]}`;
}

/** True when `path` is a valid media path of `kind` belonging to `eventId`. */
export function ownsMedia(path: unknown, eventId: string, kind: EventMediaKind): path is string {
  return typeof path === 'string' && EVENT_MEDIA_RE.test(path) && path.startsWith(`${kind}/${eventId}/`);
}

export async function createMediaUpload(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(EVENT_MEDIA_BUCKET).createSignedUploadUrl(path);
  return error || !data ? null : data.signedUrl;
}

export async function mediaExists(supabase: SupabaseClient, path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await supabase.storage.from(EVENT_MEDIA_BUCKET).list(dir, { search: name, limit: 1 });
  return !!data?.some((f) => f.name === name);
}

export async function signMedia(supabase: SupabaseClient, paths: string[], ttlSeconds = 6 * 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = Array.from(new Set(paths.filter(Boolean)));
  if (!list.length) return out;
  const { data } = await supabase.storage.from(EVENT_MEDIA_BUCKET).createSignedUrls(list, ttlSeconds);
  data?.forEach((d) => d.path && d.signedUrl && out.set(d.path, d.signedUrl));
  return out;
}

export async function removeMedia(supabase: SupabaseClient, paths: string[]) {
  const list = paths.filter((p) => EVENT_MEDIA_RE.test(p));
  if (list.length) await supabase.storage.from(EVENT_MEDIA_BUCKET).remove(list);
}

/** Public-facing media of an event: home screen + stickers, with signed URLs. */
export async function eventMediaUrls(supabase: SupabaseClient, event: { attractMediaPath: string | null; stickerPaths: string[] }) {
  const urls = await signMedia(supabase, [...(event.attractMediaPath ? [event.attractMediaPath] : []), ...event.stickerPaths]);
  return {
    attractUrl: event.attractMediaPath ? urls.get(event.attractMediaPath) ?? null : null,
    stickers: event.stickerPaths.map((p) => ({ path: p, url: urls.get(p) ?? null })).filter((s): s is { path: string; url: string } => !!s.url),
  };
}
