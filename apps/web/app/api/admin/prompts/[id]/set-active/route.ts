/**
 * POST /api/admin/prompts/[id]/set-active
 *
 * Sets the given prompt template as the active prompt for the active event
 * (or for the event specified in the request body). Updates
 * `events.active_prompt_template_id` to this template's id.
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id: templateId } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === 'object') {
      body = raw as Record<string, unknown>;
    }
  } catch {
    // Body is optional — eventId can be omitted to target the active event
  }

  const supabase = createServerClient();

  // Verify the template exists and get its event_id
  const { data: template, error: tplError } = await supabase
    .from('prompt_templates')
    .select('id, event_id, version')
    .eq('id', templateId)
    .single();

  if (tplError || !template) {
    return NextResponse.json({ error: 'Prompt template not found' }, { status: 404 });
  }

  // Resolve the target event: either the explicitly passed eventId or the
  // template's own event_id
  const targetEventId =
    typeof body.eventId === 'string' ? body.eventId : (template.event_id as string);

  // Update the event's active_prompt_template_id
  const { data: updated, error: updateError } = await supabase
    .from('events')
    .update({ active_prompt_template_id: templateId })
    .eq('id', targetEventId)
    .select('id, name')
    .single();

  if (updateError || !updated) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.prompts.set_active_failed',
        details: { templateId, eventId: targetEventId, error: updateError?.message },
      })
    );
    return NextResponse.json({ error: 'Failed to set active prompt template' }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'admin.prompt_template.set_active',
      details: {
        templateId,
        version: template.version,
        eventId: targetEventId,
        eventName: updated.name,
      },
    })
  );

  return NextResponse.json({ success: true });
}
