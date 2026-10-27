/**
 * GET  /api/admin/events  — list all events
 * POST /api/admin/events  — create a new event
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, retention_days, daily_sketch_cap, tear_line_offset_px, active_prompt_template_id, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    log({
      level: 'error',
      event: 'admin.events.list_failed',
      details: { error: error.message },
    });
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!b.name || typeof b.name !== 'string' || !b.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const requestedStatus = typeof b.status === 'string' ? b.status : 'draft';
  if (!['draft', 'active', 'archived'].includes(requestedStatus)) {
    return NextResponse.json({ error: 'Invalid event status' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('events')
    .insert({
      name: String(b.name).trim(),
      status: requestedStatus,
      retention_days: typeof b.retentionDays === 'number' ? b.retentionDays : 30,
      daily_sketch_cap: typeof b.dailySketchCap === 'number' ? b.dailySketchCap : 50,
      tear_line_offset_px: typeof b.tearLineOffsetPx === 'number' ? b.tearLineOffsetPx : 0,
    })
    .select('id')
    .single();

  if (error || !data) {
    log({
      level: 'error',
      event: 'admin.event.create_failed',
      details: { error: error?.message },
    });
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.event_changed',
    details: { action: 'created', eventId: data.id, name: b.name },
  });

  return NextResponse.json({ eventId: data.id }, { status: 201 });
}
