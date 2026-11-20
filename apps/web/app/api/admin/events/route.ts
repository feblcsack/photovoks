/**
 * GET  /api/admin/events  — list events (admin)
 * POST /api/admin/events  — create { name, code?, pin, templateFrames?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { EVENT_COLUMNS, generateEventCode, isValidEventPin, mapEvent, normalizeEventCode } from '@/lib/events';

export async function GET(): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServerClient();
  const { data, error } = await supabase.from('events').select(EVENT_COLUMNS).order('created_at', { ascending: false });
  if (error) return jsonError('Gagal memuat event', 500);
  return NextResponse.json({ events: (data ?? []).map(mapEvent) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return jsonError('Nama event wajib diisi', 400);
  if (!isValidEventPin(body.pin)) return jsonError('PIN event harus 4–8 angka', 400);

  const supabase = createServerClient();
  let code = body.code ? normalizeEventCode(body.code) : null;
  if (body.code && !code) return jsonError('Kode event: 4–12 huruf/angka', 400);
  if (code) {
    const { data: taken } = await supabase.from('events').select('id').eq('code', code).maybeSingle();
    if (taken) return jsonError('Kode event sudah dipakai', 409);
  } else {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = generateEventCode();
      const { data: taken } = await supabase.from('events').select('id').eq('code', candidate).maybeSingle();
      if (!taken) code = candidate;
    }
    if (!code) return jsonError('Gagal membuat kode unik, coba lagi', 500);
  }

  const { data, error } = await supabase
    .from('events')
    .insert({ name, code, status: 'draft', pin_hash: await hash(body.pin as string, 10) })
    .select(EVENT_COLUMNS)
    .single();
  if (error || !data) {
    log({ level: 'error', event: 'admin.event.create_failed', details: { error: error?.message } });
    return jsonError('Gagal membuat event', 500);
  }
  const event = mapEvent(data);

  // Start with every active library frame so the booth works immediately.
  const { data: frames } = await supabase.from('frames').select('id').eq('is_active', true).order('updated_at', { ascending: false }).limit(12);
  if (frames?.length) {
    await supabase.from('event_frames').insert(frames.map((f, i) => ({ event_id: event.id, frame_id: f.id, sort_order: i })));
  }

  log({ level: 'info', event: 'admin.event.created', details: { eventId: event.id, code } });
  return NextResponse.json({ event }, { status: 201 });
}
