/**
 * Admin sticker library.
 *   GET    → { stickers: [...all, incl. inactive] }
 *   POST   { action: 'upload-url', contentType }        → { path, uploadUrl }
 *   POST   { action: 'create', path, name, category, width, height, bytes }
 *   PATCH  { id, name?, category?, isActive?, sortOrder? }
 *   DELETE ?id=<uuid>
 * The browser compresses icons (≤ 512 px WebP/PNG) before uploading.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUuid, requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { createUploadUrl, mediaUrl, objectExists, removeObjects } from '@/lib/storage';
import { invalidateStickerLibrary, LIBRARY_CATEGORIES, LIBRARY_PATH_RE } from '@/lib/sticker-library';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp' };

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await createServerClient()
    .from('sticker_assets')
    .select('id, name, category, path, width, height, bytes, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ stickers: [], migrationNeeded: true });
  return NextResponse.json({
    stickers: (data ?? []).map((r) => ({ id: r.id, name: r.name, category: r.category, url: mediaUrl('event-media', r.path), width: r.width, height: r.height, bytes: r.bytes, isActive: r.is_active, sortOrder: r.sort_order })),
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);

  if (body.action === 'upload-url') {
    const ext = EXT[String(body.contentType)];
    if (!ext) return jsonError('Hanya PNG atau WebP (transparan)', 400);
    const path = `library/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await createUploadUrl('event-media', path).catch(() => null);
    if (!uploadUrl) return jsonError('Gagal menyiapkan upload', 500);
    return NextResponse.json({ path, uploadUrl });
  }

  if (body.action === 'create') {
    const path = String(body.path ?? '');
    if (!LIBRARY_PATH_RE.test(path)) return jsonError('Path tidak valid', 400);
    if (!(await objectExists('event-media', path))) return jsonError('File belum terunggah', 400);
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'Stiker';
    const category = (LIBRARY_CATEGORIES as readonly string[]).includes(String(body.category)) ? String(body.category) : 'custom';
    const int = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 50_000_000 ? (v as number) : null);
    const { data, error } = await createServerClient()
      .from('sticker_assets')
      .insert({ path, name, category, width: int(body.width), height: int(body.height), bytes: int(body.bytes) })
      .select('id')
      .single();
    if (error) return jsonError(error.message.includes('sticker_assets') ? 'Jalankan migrasi v5 dulu' : 'Gagal menyimpan', 500);
    invalidateStickerLibrary();
    return NextResponse.json({ id: data.id }, { status: 201 });
  }
  return jsonError('Aksi tidak dikenal', 400);
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body || !isUuid(body.id)) return jsonError('Body tidak valid', 400);
  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim().slice(0, 60);
  if ((LIBRARY_CATEGORIES as readonly string[]).includes(String(body.category))) update.category = body.category;
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive;
  if (Number.isInteger(body.sortOrder)) update.sort_order = body.sortOrder;
  if (!Object.keys(update).length) return jsonError('Tidak ada perubahan', 400);
  const { error } = await createServerClient().from('sticker_assets').update(update).eq('id', body.id as string);
  if (error) return jsonError('Gagal menyimpan', 500);
  invalidateStickerLibrary();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return jsonError('id tidak valid', 400);
  const supabase = createServerClient();
  const { data } = await supabase.from('sticker_assets').delete().eq('id', id).select('path').maybeSingle();
  if (data?.path && LIBRARY_PATH_RE.test(data.path)) await removeObjects('event-media', [data.path]);
  invalidateStickerLibrary();
  return NextResponse.json({ ok: true });
}
