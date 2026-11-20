/** POST /api/m/[token]/upload → { path, uploadUrl } for a guestbook photo (JPEG). */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { eventByPublicToken } from '@/lib/community';
import { createMediaUpload, mediaPathFor } from '@/lib/event-media';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.guestbookEnabled) return jsonError('Buku tamu tidak aktif', 404);
  const path = mediaPathFor('guestbook', ev.id, 'image/jpeg')!;
  const uploadUrl = await createMediaUpload(createServerClient(), path);
  if (!uploadUrl) return jsonError('Gagal menyiapkan upload', 500);
  return NextResponse.json({ path, uploadUrl });
}
