/**
 * Sticker library (SERVER ONLY): icons the owner uploads once in the admin
 * portal; every event's guests can use them in the sticker studio, live-wall
 * editor and minizine. Files: event-media/library/<uuid>.(png|webp).
 * Tolerant before migration v5 (returns an empty list).
 */
import { createServerClient } from '@/lib/supabase/server';
import { mediaUrl } from '@/lib/storage';
import type { LibrarySticker } from '@/lib/session-types';

export const LIBRARY_PATH_RE = /^library\/[0-9a-f-]{36}\.(png|webp)$/;
export const LIBRARY_CATEGORIES = ['y2k', 'lucu', 'teks', 'event', 'custom'] as const;

let cache: { at: number; list: LibrarySticker[] } | null = null;

export async function stickerLibrary(): Promise<LibrarySticker[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.list;
  const { data, error } = await createServerClient()
    .from('sticker_assets')
    .select('id, name, category, path')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);
  const list: LibrarySticker[] = error
    ? []
    : (data ?? []).flatMap((r) => {
        const url = LIBRARY_PATH_RE.test(r.path) ? mediaUrl('event-media', r.path) : null;
        return url ? [{ id: r.id as string, name: r.name as string, category: r.category as string, url }] : [];
      });
  cache = { at: Date.now(), list };
  return list;
}

export function invalidateStickerLibrary() {
  cache = null;
}
