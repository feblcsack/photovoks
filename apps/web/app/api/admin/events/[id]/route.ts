/**
 * GET    /api/admin/events/[id]  — fetch a single event
 * PATCH  /api/admin/events/[id]  — update event fields (including status)
 *
 * PATCH with { status: 'active' } is blocked if a visitor session is currently
 * active (i.e., sessions with status NOT IN terminal states).
 *
 * Terminal session statuses: 'abandoned', 'failed', 'completed', 'printed'
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const TERMINAL_SESSION_STATUSES = ['abandoned', 'failed', 'completed', 'printed'];

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, retention_days, daily_sketch_cap, tear_line_offset_px, active_prompt_template_id, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  return NextResponse.json({ event: data });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const supabase = createServerClient();

  // ── Block switching to 'active' if a visitor session is ongoing ──────────
  if (b.status === 'active') {
    const { count, error: sessionCheckError } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', `(${TERMINAL_SESSION_STATUSES.join(',')})`)
      .eq('event_id', id);

    if (sessionCheckError) {
      return NextResponse.json({ error: 'Failed to check active sessions' }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'Cannot switch event to active while a visitor session is in progress.',
          code: 'ACTIVE_SESSION_CONFLICT',
        },
        { status: 409 }
      );
    }
  }

  // ── Build update payload (only include provided fields) ──────────────────
  const updatePayload: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) updatePayload.name = b.name.trim();
  if (typeof b.status === 'string') updatePayload.status = b.status;
  if (typeof b.retentionDays === 'number') updatePayload.retention_days = b.retentionDays;
  if (typeof b.dailySketchCap === 'number') updatePayload.daily_sketch_cap = b.dailySketchCap;
  if (typeof b.tearLineOffsetPx === 'number') updatePayload.tear_line_offset_px = b.tearLineOffsetPx;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('events')
    .update(updatePayload)
    .eq('id', id)
    .select('id')
    .single();

  if (error || !data) {
    log({
      level: 'error',
      event: 'admin.event.update_failed',
      details: { eventId: id, error: error?.message },
    });
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.event_changed',
    details: { action: 'updated', eventId: id, changes: updatePayload },
  });

  return NextResponse.json({ success: true });
}
