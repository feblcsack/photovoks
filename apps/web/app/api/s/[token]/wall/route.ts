/**
 * POST /api/s/[token]/wall { stickers: WallSticker[] }
 *
 * Saves the Y2K stickers a guest pinned onto their photo for the fridge-style
 * live wall. Only sticker ids from the built-in set + clamped positions are
 * stored (a few bytes of JSON — no image upload, no storage egress).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGuest } from '@/lib/guest-guard';
import { jsonError, readJson } from '@/lib/http';
import { sanitizeWallStickers } from '@/lib/y2k-stickers';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  if (!guest.event.liveEnabled) return jsonError('Live wall tidak aktif untuk event ini', 403);
  const body = await readJson(request);
  const stickers = sanitizeWallStickers(body?.stickers);
  const { error } = await createServerClient().from('sessions').update({ wall_stickers: stickers }).eq('id', guest.session.id);
  if (error) return jsonError('Gagal menyimpan stiker (jalankan migrasi database v4)', 500);
  return NextResponse.json({ ok: true, stickers });
}
