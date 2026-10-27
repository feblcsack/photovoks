/**
 * POST /api/admin/switch-event
 *
 * Switches the active event to the specified eventId. If any visitor session
 * is currently active (status not in terminal states), the switch is blocked
 * with a 409 response. Otherwise the target event's status is set to 'active'
 * and all other events are set to 'archived' (or their current non-active
 * status is retained — only the previously active event is touched).
 *
 * Body: { eventId: string }
 *
 * Returns:
 * - 200 {}                    — event switched successfully
 * - 400 { error }             — missing/invalid body
 * - 404 { error }             — eventId not found
 * - 409 { error: 'active_session', message: string, sessionId: string }
 *         — blocked: active visitor session exists
 * - 500 { error }             — internal error
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const TERMINAL_SESSION_STATUSES = ['completed', 'abandoned', 'failed'] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (!b.eventId || typeof b.eventId !== 'string' || !b.eventId.trim()) {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  }
  const eventId = b.eventId.trim();

  const supabase = createServerClient();

  // ── Check for active visitor session ─────────────────────────────────────
  const { data: activeSession, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status')
    .not('status', 'in', `(${TERMINAL_SESSION_STATUSES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.event.switch_session_check_failed',
        details: { error: sessionError.message },
      })
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (activeSession) {
    // Block the switch: a visitor session is currently in progress
    return NextResponse.json(
      {
        error: 'active_session',
        message:
          'Tidak dapat mengganti event: sesi pengunjung sedang berlangsung. Selesaikan atau reset sesi terlebih dahulu.',
        sessionId: activeSession.id,
      },
      { status: 409 }
    );
  }

  // ── Verify target event exists ────────────────────────────────────────────
  const { data: targetEvent, error: eventFetchError } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('id', eventId)
    .single();

  if (eventFetchError || !targetEvent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // ── Deactivate currently active event (set to draft) ─────────────────────
  // Only touch the currently active event, not all events.
  const { error: deactivateError } = await supabase
    .from('events')
    .update({ status: 'draft' })
    .eq('status', 'active')
    .neq('id', eventId);

  if (deactivateError) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.event.switch_deactivate_failed',
        details: { error: deactivateError.message },
      })
    );
    return NextResponse.json({ error: 'Failed to deactivate current event' }, { status: 500 });
  }

  // ── Activate target event ─────────────────────────────────────────────────
  const { error: activateError } = await supabase
    .from('events')
    .update({ status: 'active' })
    .eq('id', eventId);

  if (activateError) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.event.switch_activate_failed',
        details: { error: activateError.message, eventId },
      })
    );
    return NextResponse.json({ error: 'Failed to activate event' }, { status: 500 });
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'admin.event.switched',
      details: { eventId, eventName: targetEvent.name },
    })
  );

  return NextResponse.json({});
}
