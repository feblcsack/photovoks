/**
 * POST /api/s/[token]/edit → { path, uploadUrl }
 *
 * Reserves a slot for a guest-decorated (sticker) version of the photo. The
 * phone uploads the JPEG straight to storage; printing it goes through
 * POST /api/s/[token]/print { type: 'edit', editPath }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGuest } from '@/lib/guest-guard';
import { jsonError } from '@/lib/http';

const MAX_EDITS = 12;

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  if (!guest.event.stickersEnabled) return jsonError('Stiker tidak aktif untuk event ini', 403);

  const supabase = createServerClient();
  const dir = `sessions/${guest.session.id}`;
  const { data: files } = await supabase.storage.from('sessions').list(dir, { search: 'edit_', limit: 100 });
  const edits = (files ?? []).filter((f) => /^edit_[0-9a-f]{12}\.jpg$/.test(f.name)).length;
  if (edits >= MAX_EDITS) return jsonError('Batas simpan hasil stiker tercapai', 429);

  const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const path = `${dir}/edit_${id}.jpg`;
  const { data, error } = await supabase.storage.from('sessions').createSignedUploadUrl(path);
  if (error || !data) return jsonError('Gagal menyiapkan upload', 500);
  return NextResponse.json({ path, uploadUrl: data.signedUrl });
}
