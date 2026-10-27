/**
 * GET  /api/admin/prompts?eventId=…  — list all prompt template versions for an event
 * POST /api/admin/prompts             — create a new prompt template version for an event
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'eventId query parameter is required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Also fetch the event's active_prompt_template_id so the UI can highlight it
  const [{ data: templates, error: tplError }, { data: event, error: evtError }] =
    await Promise.all([
      supabase
        .from('prompt_templates')
        .select('id, event_id, content, version, is_active, created_at')
        .eq('event_id', eventId)
        .order('version', { ascending: false }),
      supabase
        .from('events')
        .select('id, active_prompt_template_id')
        .eq('id', eventId)
        .single(),
    ]);

  if (tplError) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.prompts.list_failed',
        details: { eventId, error: tplError.message },
      })
    );
    return NextResponse.json({ error: 'Failed to fetch prompt templates' }, { status: 500 });
  }

  if (evtError) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  return NextResponse.json({
    templates: templates ?? [],
    activePromptTemplateId: event?.active_prompt_template_id ?? null,
  });
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

  if (!b.content || typeof b.content !== 'string' || !b.content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const eventId = b.eventId;
  const content = (b.content as string).trim();

  const supabase = createServerClient();

  // Verify the event exists
  const { data: event, error: evtError } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .single();

  if (evtError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Compute the next version number
  const { data: latestVersion } = await supabase
    .from('prompt_templates')
    .select('version')
    .eq('event_id', eventId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from('prompt_templates')
    .insert({
      event_id: eventId,
      content,
      version: nextVersion,
      is_active: false,
    })
    .select('id, version')
    .single();

  if (error || !data) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.prompts.create_failed',
        details: { eventId, error: error?.message },
      })
    );
    return NextResponse.json({ error: 'Failed to create prompt template' }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'admin.prompt_template.created',
      details: { templateId: data.id, eventId, version: data.version },
    })
  );

  return NextResponse.json({ templateId: data.id, version: data.version }, { status: 201 });
}
