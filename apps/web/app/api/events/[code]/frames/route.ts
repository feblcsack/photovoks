/**
 * GET /api/events/[code]/frames → { assigned: FrameRecord[], library: FrameRecord[] }
 * PUT /api/events/[code]/frames { frameIds: string[], qr?: Record<frameId, QrPlacement> }
 *     → replaces the event's frame list (order = booth order) and the
 *       per-frame session-QR placement.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { FRAME_COLUMNS, framesForEvent, hydrateFrames } from '@/lib/frames/server';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { sanitizeQrPlacement } from '@/lib/frames/types';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const supabase = createServerClient();
  const [assigned, libRes] = await Promise.all([
    framesForEvent(supabase, access.event.id, false),
    supabase.from('frames').select(FRAME_COLUMNS).order('updated_at', { ascending: false }).limit(300),
  ]);
  const library = await hydrateFrames(supabase, libRes.data ?? []);
  return NextResponse.json({ assigned, library });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  const ids = body?.frameIds;
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every(isUuid)) return jsonError('frameIds tidak valid', 400);
  const unique = Array.from(new Set(ids as string[]));
  const qr = (body?.qr && typeof body.qr === "object" ? body.qr : {}) as Record<string, unknown>;

  const supabase = createServerClient();
  if (unique.length) {
    const { count } = await supabase.from('frames').select('id', { count: 'exact', head: true }).in('id', unique);
    if (count !== unique.length) return jsonError('Ada frame yang tidak ditemukan', 400);
  }
  const { error: delError } = await supabase.from('event_frames').delete().eq('event_id', access.event.id);
  if (delError) return jsonError('Gagal menyimpan frame', 500);
  if (unique.length) {
    const { error } = await supabase
      .from('event_frames')
      .insert(unique.map((frame_id, i) => ({ event_id: access.event.id, frame_id, sort_order: i, qr: sanitizeQrPlacement(qr[frame_id]) })));
    if (error) return jsonError('Gagal menyimpan frame', 500);
  }
  return NextResponse.json({ ok: true, count: unique.length });
}
