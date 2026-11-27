/**
 * POST /api/admin/frames/upload-url { kind: 'asset'|'thumb', contentType }
 *
 * Returns a short-lived signed upload URL in the private `frames` bucket.
 * Paths are generated server-side (no client-controlled paths).
 *   asset → frames/assets/<uuid>.<ext>   (backgrounds, stickers, overlays)
 *   thumb → frames/thumbs/<uuid>.jpg
 * Response also includes a stable read URL for immediate preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createUploadUrl, mediaUrl } from '@/lib/storage';
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
  const signedUrl = await createUploadUrl('frames', path).catch(() => null);
  if (!signedUrl) return jsonError('Gagal membuat URL upload', 500);
  return NextResponse.json({ path, signedUrl, readUrl: mediaUrl('frames', path) });
}
