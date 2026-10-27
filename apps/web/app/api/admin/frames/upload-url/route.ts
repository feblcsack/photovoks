/**
 * POST /api/admin/frames/upload-url
 *
 * Generates a signed upload URL so the admin client can upload a frame PNG
 * directly to Supabase Storage without routing through Vercel.
 *
 * Request body: { frameId: string }  — a pre-generated UUID to use as the frame's storage key
 * Response:     { signedUrl: string, storagePath: string }
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6, 11.8
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!b.frameId || typeof b.frameId !== 'string') {
    return NextResponse.json({ error: 'frameId is required' }, { status: 400 });
  }

  const storagePath = `${b.frameId}.png`;
  const supabase = createServerClient();

  const { data, error } = await supabase.storage
    .from('frames')
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: `Failed to generate upload URL: ${error?.message ?? 'unknown error'}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath });
}
