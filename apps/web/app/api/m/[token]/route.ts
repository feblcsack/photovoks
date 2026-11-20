/**
 * GET  /api/m/[token]?before=<iso>     → guestbook entries (newest first)
 * POST /api/m/[token] { name, message, photoPath? } → new entry
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { eventByPublicToken, guestbookEntries, isIsoDate } from '@/lib/community';
import { mediaExists, ownsMedia, signMedia } from '@/lib/event-media';
import { readJson, jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ token: string }> };

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
   
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  return t && t.length <= max ? t : null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.guestbookEnabled) return jsonError('Buku tamu tidak aktif', 404);
  const before = request.nextUrl.searchParams.get('before');
  const entries = await guestbookEntries(ev.id, { before: isIsoDate(before) ? before : null, limit: 30 });
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.guestbookEnabled) return jsonError('Buku tamu tidak aktif', 404);
  const body = await readJson(request);
  const name = clean(body?.name, 60);
  const message = clean(body?.message, 500);
  if (!name) return jsonError('Nama wajib diisi (maks. 60 karakter)', 400);
  if (!message) return jsonError('Pesan wajib diisi (maks. 500 karakter)', 400);

  const supabase = createServerClient();
  let photoPath: string | null = null;
  if (body?.photoPath !== undefined && body.photoPath !== null) {
    if (!ownsMedia(body.photoPath, ev.id, 'guestbook') || !(await mediaExists(supabase, body.photoPath))) return jsonError('Foto tidak ditemukan', 400);
    photoPath = body.photoPath;
  }
  const { data, error } = await supabase
    .from('guestbook_entries')
    .insert({ event_id: ev.id, name, message, photo_path: photoPath })
    .select('id, name, message, photo_path, created_at')
    .single();
  if (error || !data) return jsonError('Gagal menyimpan pesan', 500);
  const urls = photoPath ? await signMedia(supabase, [photoPath]) : new Map<string, string>();
  return NextResponse.json(
    { entry: { id: data.id, name: data.name, message: data.message, photo: photoPath ? urls.get(photoPath) ?? null : null, createdAt: data.created_at } },
    { status: 201 },
  );
}
