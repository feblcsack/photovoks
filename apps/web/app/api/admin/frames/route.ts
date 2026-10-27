/**
 * GET  /api/admin/frames?eventId=...  — list frames for an event
 * POST /api/admin/frames              — create a new frame record (after upload)
 *
 * Frame PNG upload goes directly to Supabase Storage from the client via a
 * signed upload URL (see GET /api/admin/frames/upload-url).
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6, 11.7, 11.8
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SlotGeometry } from '@photovoks/shared-types';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'eventId query parameter is required' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('frames')
    .select('id, event_id, name, storage_path, slot_geometry, is_active, sort_order, created_at, updated_at')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch frames' }, { status: 500 });
  }

  // Generate signed preview URLs for each frame thumbnail
  const framesWithUrls = await Promise.all(
    (data ?? []).map(async (frame) => {
      const { data: urlData } = await supabase.storage
        .from('frames')
        .createSignedUrl(frame.storage_path, 3600); // 1-hour validity for admin preview
      return { ...frame, thumbnailUrl: urlData?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ frames: framesWithUrls });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!b.eventId || typeof b.eventId !== 'string') {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }
  if (!b.name || typeof b.name !== 'string' || !b.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!b.storagePath || typeof b.storagePath !== 'string') {
    return NextResponse.json({ error: 'storagePath is required' }, { status: 400 });
  }

  const slotGeometry: SlotGeometry[] = Array.isArray(b.slotGeometry) ? b.slotGeometry as SlotGeometry[] : [];

  const supabase = createServerClient();

  // Get max sort_order for this event to append at the end
  const { data: maxOrderRow } = await supabase
    .from('frames')
    .select('sort_order')
    .eq('event_id', b.eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = maxOrderRow ? (maxOrderRow.sort_order as number) + 1 : 0;

  const { data, error } = await supabase
    .from('frames')
    .insert({
      event_id: b.eventId,
      name: String(b.name).trim(),
      storage_path: b.storagePath,
      slot_geometry: slotGeometry,
      is_active: true,
      sort_order: nextSortOrder,
    })
    .select('id')
    .single();

  if (error || !data) {
    log({
      level: 'error',
      event: 'admin.frame.create_failed',
      details: { eventId: b.eventId, name: b.name, error: error?.message },
    });
    return NextResponse.json(
      { error: `Failed to create frame: ${error?.message ?? 'unknown error'}` },
      { status: 500 }
    );
  }

  log({
    level: 'info',
    event: 'admin.frame.created',
    details: { frameId: data.id, eventId: b.eventId, name: b.name },
  });

  return NextResponse.json({ frameId: data.id }, { status: 201 });
}
