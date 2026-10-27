/**
 * POST /api/admin/frames/reorder
 *
 * Batch-updates sort_order for a list of frames.
 *
 * Request body: { frames: { id: string; sortOrder: number }[] }
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.frames) || b.frames.length === 0) {
    return NextResponse.json({ error: 'frames array is required' }, { status: 400 });
  }

  const frames = b.frames as { id: string; sortOrder: number }[];
  const supabase = createServerClient();

  // Update each frame's sort_order in parallel
  const updates = await Promise.all(
    frames.map(({ id, sortOrder }) =>
      supabase
        .from('frames')
        .update({ sort_order: sortOrder })
        .eq('id', id)
    )
  );

  const failed = updates.filter((r) => r.error);
  if (failed.length > 0) {
    log({
      level: 'error',
      event: 'admin.frame.reorder_failed',
      details: { failedCount: failed.length },
    });
    return NextResponse.json({ error: 'Failed to reorder some frames' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.frame.reordered',
    details: { frameCount: frames.length, frameIds: frames.map((f) => f.id) },
  });

  return NextResponse.json({ success: true });
}
