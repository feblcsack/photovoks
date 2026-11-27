/**
 * Event media (SERVER ONLY): home-screen video/image, sticker packs,
 * guestbook photos and the global sticker library in the private
 * `event-media` bucket. Served through stable /media URLs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_MEDIA_RE } from '@/lib/events';
import { createUploadUrl, mediaUrl, objectExists, removeObjects } from '@/lib/storage';

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

// The SupabaseClient parameters below are kept for call-site compatibility;
// storage now goes through the provider-neutral facade.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function createMediaUpload(_supabase: SupabaseClient, path: string): Promise<string | null> {
  return createUploadUrl('event-media', path).catch(() => null);
}

export async function mediaExists(_supabase: SupabaseClient, path: string): Promise<boolean> {
  return objectExists('event-media', path);
}

/** Stable URLs for event-media paths (sync — no storage round-trip). */
export function mediaUrls(paths: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of new Set(paths.filter(Boolean))) {
    const u = mediaUrl('event-media', p);
    if (u) out.set(p, u);
  }
  return out;
}

/** @deprecated kept for older call sites — URLs no longer expire. */
export async function signMedia(_supabase: SupabaseClient, paths: string[], _ttlSeconds?: number): Promise<Map<string, string>> {
  return mediaUrls(paths);
}

export async function removeMedia(_supabase: SupabaseClient, paths: string[]) {
  await removeObjects('event-media', paths.filter((p) => EVENT_MEDIA_RE.test(p)));
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** Public-facing media of an event: home screen + stickers. */
export function eventMediaUrls(event: { attractMediaPath: string | null; stickerPaths: string[] }) {
  const urls = mediaUrls([...(event.attractMediaPath ? [event.attractMediaPath] : []), ...event.stickerPaths]);
  return {
    attractUrl: event.attractMediaPath ? urls.get(event.attractMediaPath) ?? null : null,
    stickers: event.stickerPaths.map((p) => ({ path: p, url: urls.get(p) ?? null })).filter((s): s is { path: string; url: string } => !!s.url),
  };
}
