/**
 * GET  /api/admin/frames               — frame library (with usage counts)
 * POST /api/admin/frames { name, design, category?, eventCode? }
 *      — creates a frame; optionally assigns it to an event.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { FRAME_COLUMNS, hydrateFrames } from '@/lib/frames/server';
import { sanitizeDesign, slotCountOf } from '@/lib/frames/types';
import { normalizeEventCode } from '@/lib/events';
import { log } from '@/lib/logger';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServerClient();
  const [{ data: rows }, { data: links }] = await Promise.all([
    supabase.from('frames').select(FRAME_COLUMNS).order('updated_at', { ascending: false }).limit(500),
    supabase.from('event_frames').select('frame_id, events(code, name)'),
  ]);
  const frames = await hydrateFrames(supabase, rows ?? []);
  const usage: Record<string, Array<{ code: string; name: string }>> = {};
  for (const l of links ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = l.events as any;
    if (ev) (usage[l.frame_id] ??= []).push({ code: ev.code, name: ev.name });
  }
  return NextResponse.json({ frames, usage });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return jsonError('Nama frame wajib diisi', 400);
  const design = sanitizeDesign(body.design);
  if (!design) return jsonError('Desain frame tidak valid', 400);
  const slots = slotCountOf(design);
  if (slots < 1) return jsonError('Frame butuh minimal 1 slot foto', 400);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('frames')
    .insert({
      name,
      design,
      width: design.width,
      height: design.height,
      slot_count: slots,
      slot_geometry: [],
      category: typeof body.category === 'string' ? body.category.slice(0, 20) : 'strip',
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !data) {
    log({ level: 'error', event: 'admin.frame.create_failed', details: { error: error?.message } });
    return jsonError('Gagal menyimpan frame', 500);
  }

  const code = normalizeEventCode(body.eventCode);
  if (code) {
    const { data: ev } = await supabase.from('events').select('id').eq('code', code).maybeSingle();
    if (ev) {
      const { count } = await supabase.from('event_frames').select('frame_id', { count: 'exact', head: true }).eq('event_id', ev.id);
      await supabase.from('event_frames').insert({ event_id: ev.id, frame_id: data.id, sort_order: count ?? 0 });
    }
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
