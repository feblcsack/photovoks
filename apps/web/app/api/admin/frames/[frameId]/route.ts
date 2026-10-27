/**
 * GET    /api/admin/frames/[frameId]  — fetch a single frame
 * PATCH  /api/admin/frames/[frameId]  — update name, slot_geometry, is_active, sort_order
 * DELETE /api/admin/frames/[frameId]  — soft-delete (set is_active = false)
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6, 11.7, 11.8
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SlotGeometry } from '@photovoks/shared-types';
import { log } from '@/lib/logger';

type RouteContext = { params: Promise<{ frameId: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { frameId } = await context.params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('frames')
    .select('id, event_id, name, storage_path, slot_geometry, is_active, sort_order, created_at, updated_at')
    .eq('id', frameId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
  }

  // Generate signed URL for thumbnail preview
  const { data: urlData } = await supabase.storage
    .from('frames')
    .createSignedUrl(data.storage_path, 3600);

  return NextResponse.json({ frame: { ...data, thumbnailUrl: urlData?.signedUrl ?? null } });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { frameId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const supabase = createServerClient();

  const updatePayload: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) updatePayload.name = b.name.trim();
  if (typeof b.isActive === 'boolean') updatePayload.is_active = b.isActive;
  if (typeof b.sortOrder === 'number') updatePayload.sort_order = b.sortOrder;
  if (Array.isArray(b.slotGeometry)) updatePayload.slot_geometry = b.slotGeometry as SlotGeometry[];

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('frames')
    .update(updatePayload)
    .eq('id', frameId);

  if (error) {
    log({ level: 'error', event: 'admin.frame.update_failed', details: { frameId, error: error.message } });
    return NextResponse.json({ error: 'Failed to update frame' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.frame_changed',
    details: { action: 'updated', frameId, changes: Object.keys(updatePayload) },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { frameId } = await context.params;
  const supabase = createServerClient();

  // Soft-delete: deactivate rather than hard-delete so existing sessions keep references
  const { error } = await supabase
    .from('frames')
    .update({ is_active: false })
    .eq('id', frameId);

  if (error) {
    return NextResponse.json({ error: 'Failed to deactivate frame' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.frame_changed',
    details: { action: 'deactivated', frameId },
  });

  return NextResponse.json({ success: true });
}
