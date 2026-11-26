/**
 * POST /api/sessions/[sessionId]/confirm   (Authorization: Bearer <sessionToken>)
 *
 * Called after the booth uploaded every file. Verifies the files exist,
 * stores metadata, marks the session composed, and — when the event uses a
 * print station and `autoPrint` is true — queues the first print.
 *
 * Body: { slotMap: number[], filter?: string, stripWidth, stripHeight,
 *         liveFrames?: number, autoPrint?: boolean }
 * Idempotent: a second call returns the same result without re-queuing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { getBearer, isUuid, safeEqual } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { enqueuePrint } from '@/lib/print/server';

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { sessionId } = await ctx.params;
  const bearer = getBearer(request);
  if (!bearer) return jsonError('Unauthorized', 401);
  if (!isUuid(sessionId)) return jsonError('Sesi tidak ditemukan', 404);
  const body = (await readJson(request)) ?? {};

  const supabase = createServerClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('id, token, status, event_id, shot_count')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || !safeEqual(session.token, bearer)) return jsonError('Sesi tidak ditemukan', 404);

  const { data: evRow } = await supabase.from('events').select(EVENT_COLUMNS).eq('id', session.event_id).single();
  const event = mapEvent(evRow);

  const alreadyDone = !['created', 'capturing'].includes(session.status);
  if (alreadyDone) {
    const { data: job } = await supabase
      .from('print_jobs')
      .select('id')
      .eq('session_id', sessionId)
      .eq('source', 'booth')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ ok: true, token: session.token, printJobId: job?.id ?? null });
  }

  const { data: files } = await supabase.storage.from('sessions').list(`sessions/${sessionId}`, { limit: 100 });
  const names = new Set((files ?? []).map((f) => f.name));
  const required = Array.from({ length: session.shot_count }, (_, i) => `photo_${i}.jpg`);
  const missing = required.filter((f) => !names.has(f));
  // strip.jpg since v4 (egress); strip.png from older booth builds.
  if (!names.has('strip.jpg') && !names.has('strip.png')) missing.push('strip.jpg');
  if (missing.length) return jsonError('Upload belum lengkap', 422, { missing });

  const shotCount = session.shot_count as number;
  const slotMap = Array.isArray(body.slotMap)
    ? (body.slotMap as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < shotCount).slice(0, 12)
    : null;
  const intOrNull = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 20000 ? (v as number) : null);
  const liveFrames = Number.isInteger(body.liveFrames) ? Math.min(30, Math.max(0, body.liveFrames as number)) : 0;

  const { error: updError } = await supabase
    .from('sessions')
    .update({
      status: 'composed',
      completed_at: new Date().toISOString(),
      slot_map: slotMap,
      filter: typeof body.filter === 'string' ? body.filter.slice(0, 20) : null,
      strip_width: intOrNull(body.stripWidth),
      strip_height: intOrNull(body.stripHeight),
      has_thumb: names.has('thumb.jpg'),
      has_gif: names.has('anim.gif'),
      has_live: names.has('live.jpg') && liveFrames > 0,
      live_frames: names.has('live.jpg') ? liveFrames : 0,
    })
    .eq('id', sessionId)
    .in('status', ['created', 'capturing']);
  if (updError) return jsonError('Gagal menyimpan sesi', 500);

  let printJobId: string | null = null;
  if (body.autoPrint === true && event.printMode === 'station' && names.has('sheet.jpg')) {
    const result = await enqueuePrint(supabase, {
      sessionId,
      eventId: event.id,
      type: 'strip',
      copies: event.printCopies,
      source: 'booth',
      paper: event.printPaper,
    });
    if ('id' in result) printJobId = result.id;
  }

  log({ level: 'info', event: 'session.composed', sessionId, details: { printJobId } });
  return NextResponse.json({ ok: true, token: session.token, printJobId });
}
