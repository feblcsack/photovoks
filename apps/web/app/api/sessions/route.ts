/**
 * POST /api/sessions  — booth starts a session (requires event PIN or admin).
 *
 * Body: { eventCode, frameId, shotCount, live?: boolean, gif?: boolean }
 * Returns: { sessionId, sessionToken, uploadUrls: Record<filename, signedUrl> }
 *
 * The browser uploads files straight to Supabase Storage with the short-lived
 * signed upload URLs, then calls /api/sessions/[id]/confirm.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateSessionToken } from '@photovoks/shared-types';
import { log } from '@/lib/logger';
import { isUuid } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { requireEventAccess } from '@/lib/access';
import { rowToDesign } from '@/lib/frames/server';
import { slotCountOf } from '@/lib/frames/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJson(request);
  if (!body || typeof body.eventCode !== 'string') return jsonError('eventCode wajib', 400);

  const access = await requireEventAccess(body.eventCode);
  if (!access.ok) return access.response;
  const event = access.event;
  if (event.status === 'archived') return jsonError('Event sudah diarsipkan', 409);

  if (!isUuid(body.frameId)) return jsonError('Frame tidak valid', 400);
  const supabase = createServerClient();
  const { data: link } = await supabase
    .from('event_frames')
    .select('frame_id, frames(id, design, storage_path, slot_geometry, is_active)')
    .eq('event_id', event.id)
    .eq('frame_id', body.frameId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frameRow = (link as any)?.frames;
  if (!frameRow || !frameRow.is_active) return jsonError('Frame tidak tersedia untuk event ini', 400);
  const slots = slotCountOf(rowToDesign(frameRow));

  const shotCount = Number(body.shotCount);
  if (!Number.isInteger(shotCount) || shotCount < Math.max(1, slots) || shotCount > 8) {
    return jsonError('Jumlah foto tidak valid', 400);
  }
  const wantLive = body.live === true;
  const wantGif = body.gif === true;

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + event.retentionDays * 86_400_000).toISOString();

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      token,
      event_id: event.id,
      frame_id: body.frameId,
      status: 'capturing',
      shot_count: shotCount,
      selected_photo_index: 0,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error || !session) {
    log({ level: 'error', event: 'session.create_failed', details: { eventId: event.id, error: error?.message } });
    return jsonError('Gagal membuat sesi', 500);
  }

  const files = [
    ...Array.from({ length: shotCount }, (_, i) => `photo_${i}.jpg`),
    'strip.png',
    'sheet.jpg',
    'thumb.jpg',
    ...(wantLive ? ['live.jpg'] : []),
    ...(wantGif ? ['anim.gif'] : []),
  ];
  const results = await Promise.all(
    files.map((f) => supabase.storage.from('sessions').createSignedUploadUrl(`sessions/${session.id}/${f}`, { upsert: true })),
  );
  const failed = results.findIndex((r) => r.error || !r.data);
  if (failed !== -1) {
    await supabase.from('sessions').delete().eq('id', session.id);
    log({ level: 'error', event: 'session.upload_url_failed', sessionId: session.id, details: { file: files[failed], error: results[failed].error?.message } });
    return jsonError('Gagal menyiapkan upload', 500);
  }

  const uploadUrls: Record<string, string> = {};
  files.forEach((f, i) => (uploadUrls[f] = results[i].data!.signedUrl));

  log({ level: 'info', event: 'session.created', sessionId: session.id, details: { eventId: event.id, shotCount } });
  return NextResponse.json({ sessionId: session.id, sessionToken: token, uploadUrls }, { status: 201 });
}
