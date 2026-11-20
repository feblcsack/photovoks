/**
 * PATCH  /api/admin/events/[id]  { pin?, code?, ...settings }  (admin only)
 * DELETE /api/admin/events/[id]  — deletes the event, its sessions and files.
 */
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { isUuid, requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { buildEventUpdate, EVENT_COLUMNS, isValidEventPin, mapEvent, normalizeEventCode } from '@/lib/events';
import { deleteSessionFiles } from '@/lib/sessions';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError('Event tidak ditemukan', 404);
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);

  const built = buildEventUpdate(body);
  if ('error' in built) return jsonError(built.error, 400);
  const update = built.update;
  const supabase = createServerClient();

  if ('pin' in body) {
    if (!isValidEventPin(body.pin)) return jsonError('PIN event harus 4–8 angka', 400);
    update.pin_hash = await hash(body.pin as string, 10);
    update.pin_failed_attempts = 0;
    update.pin_locked_until = null;
  }
  if ('code' in body) {
    const code = normalizeEventCode(body.code);
    if (!code) return jsonError('Kode event: 4–12 huruf/angka', 400);
    const { data: taken } = await supabase.from('events').select('id').eq('code', code).neq('id', id).maybeSingle();
    if (taken) return jsonError('Kode event sudah dipakai', 409);
    update.code = code;
  }
  if (body.rotateGalleryLink === true) update.gallery_token = crypto.randomUUID().replace(/-/g, '');

  const { data, error } = await supabase.from('events').update(update).eq('id', id).select(EVENT_COLUMNS).maybeSingle();
  if (error || !data) return jsonError('Gagal menyimpan', 500);
  log({ level: 'info', event: 'admin.event.updated', details: { eventId: id, fields: Object.keys(update).filter((k) => k !== 'pin_hash') } });
  return NextResponse.json({ event: mapEvent(data) });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError('Event tidak ditemukan', 404);
  const supabase = createServerClient();
  const { data: sessions } = await supabase.from('sessions').select('id').eq('event_id', id).limit(5000);
  for (const s of sessions ?? []) await deleteSessionFiles(supabase, s.id);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return jsonError('Gagal menghapus event', 500);
  log({ level: 'info', event: 'admin.event.deleted', details: { eventId: id, sessions: sessions?.length ?? 0 } });
  return NextResponse.json({ ok: true });
}
