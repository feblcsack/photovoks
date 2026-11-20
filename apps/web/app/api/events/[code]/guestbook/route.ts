/**
 * Guestbook moderation (event PIN or admin).
 * GET    → all entries incl. hidden
 * PATCH  { id, hidden } → hide / show
 * DELETE { id } → delete entry (+ photo)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { guestbookEntries, isIsoDate } from '@/lib/community';
import { removeMedia } from '@/lib/event-media';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const before = request.nextUrl.searchParams.get('before');
  const entries = await guestbookEntries(access.event.id, { before: isIsoDate(before) ? before : null, limit: 60, includeHidden: true });
  return NextResponse.json({ entries });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  if (!isUuid(body?.id) || typeof body?.hidden !== 'boolean') return jsonError('Body tidak valid', 400);
  const { error } = await createServerClient().from('guestbook_entries').update({ is_hidden: body.hidden }).eq('id', body.id).eq('event_id', access.event.id);
  if (error) return jsonError('Gagal menyimpan', 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  if (!isUuid(body?.id)) return jsonError('id tidak valid', 400);
  const supabase = createServerClient();
  const { data } = await supabase.from('guestbook_entries').delete().eq('id', body.id).eq('event_id', access.event.id).select('photo_path').maybeSingle();
  if (data?.photo_path) await removeMedia(supabase, [data.photo_path]).catch(() => {});
  return NextResponse.json({ ok: true });
}
