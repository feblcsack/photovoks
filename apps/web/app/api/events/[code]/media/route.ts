/**
 * POST /api/events/[code]/media { kind: 'attract'|'stickers', contentType }
 *   → { path, uploadUrl }  (event PIN or admin)
 *
 * The browser uploads straight to Supabase Storage (no Vercel body limit),
 * then saves the returned path through PATCH /api/events/[code].
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { readJson, jsonError } from '@/lib/http';
import { createMediaUpload, mediaPathFor } from '@/lib/event-media';

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  const kind = body?.kind === 'stickers' ? 'stickers' : body?.kind === 'attract' ? 'attract' : null;
  if (!kind) return jsonError('kind tidak valid', 400);
  const path = mediaPathFor(kind, access.event.id, String(body?.contentType ?? ''));
  if (!path) return jsonError(kind === 'stickers' ? 'Stiker harus PNG/WebP transparan' : 'Format harus MP4, WebM, MOV, JPG, PNG, atau WebP', 400);
  const uploadUrl = await createMediaUpload(createServerClient(), path);
  if (!uploadUrl) return jsonError('Gagal menyiapkan upload. Sudah menjalankan migrasi 008?', 500);
  return NextResponse.json({ path, uploadUrl });
}
