/**
 * POST /api/admin/frames/upload-url { kind: 'asset'|'thumb', contentType }
 *
 * Returns a short-lived signed upload URL in the private `frames` bucket.
 * Paths are generated server-side (no client-controlled paths).
 *   asset → frames/assets/<uuid>.<ext>   (backgrounds, stickers, overlays)
 *   thumb → frames/thumbs/<uuid>.jpg
 * Response also includes a 6-hour signed read URL for immediate preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  const kind = body?.kind === 'thumb' ? 'thumb' : body?.kind === 'asset' ? 'asset' : null;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : '';
  if (!kind || !EXT[contentType]) return jsonError('Hanya PNG, JPEG, atau WebP', 400);

  const id = crypto.randomUUID();
  const path = kind === 'thumb' ? `frames/thumbs/${id}.jpg` : `frames/assets/${id}.${EXT[contentType]}`;
  const supabase = createServerClient();
  const { data, error } = await supabase.storage.from('frames').createSignedUploadUrl(path);
  if (error || !data) return jsonError('Gagal membuat URL upload', 500);
  const { data: read } = await supabase.storage.from('frames').createSignedUrl(path, 6 * 3600);
  return NextResponse.json({ path, signedUrl: data.signedUrl, readUrl: read?.signedUrl ?? null });
}
