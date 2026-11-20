/**
 * GET   /api/events/[code]   → event settings (event PIN or admin)
 * PATCH /api/events/[code]   → update settings (event PIN or admin)
 *
 * Code / PIN changes and deletion are admin-only (see /api/admin/events/[id]).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { buildEventUpdate, EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { readJson, jsonError } from '@/lib/http';
import { log } from '@/lib/logger';
import { mediaExists, ownsMedia, removeMedia } from '@/lib/event-media';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  return NextResponse.json({ event: access.event, role: access.role });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;

  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const built = buildEventUpdate(body);
  if ('error' in built) return jsonError(built.error, 400);
  if (!Object.keys(built.update).length) return NextResponse.json({ event: access.event });

  const supabase = createServerClient();
  const ev = access.event;
  // Media paths must belong to this event and exist in storage.
  if (typeof body.attractMediaPath === 'string') {
    if (!ownsMedia(body.attractMediaPath, ev.id, 'attract') || !(await mediaExists(supabase, body.attractMediaPath))) {
      return jsonError('File layar awal tidak ditemukan', 400);
    }
  }
  if (Array.isArray(body.stickerPaths) && !body.stickerPaths.every((p: unknown) => ownsMedia(p, ev.id, 'stickers'))) {
    return jsonError('Stiker tidak valid', 400);
  }

  const { data, error } = await supabase
    .from('events')
    .update(built.update)
    .eq('id', access.event.id)
    .select(EVENT_COLUMNS)
    .single();
  if (error || !data) return jsonError('Gagal menyimpan pengaturan', 500);

  // Clean up media that is no longer referenced.
  const removed: string[] = [];
  if ('attract_media_path' in built.update && ev.attractMediaPath && ev.attractMediaPath !== built.update.attract_media_path) removed.push(ev.attractMediaPath);
  if ('sticker_paths' in built.update) removed.push(...ev.stickerPaths.filter((p) => !(built.update.sticker_paths as string[]).includes(p)));
  if (removed.length) await removeMedia(supabase, removed).catch(() => {});

  log({ level: 'info', event: 'event.updated', details: { eventId: access.event.id, by: access.role, fields: Object.keys(built.update) } });
  return NextResponse.json({ event: mapEvent(data) });
}
