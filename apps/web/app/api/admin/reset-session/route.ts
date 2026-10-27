/**
 * POST /api/admin/reset-session
 *
 * Sets the most recent non-terminal session's status to 'abandoned'.
 * Used by the admin dashboard "Reset Session" button to clear a stuck
 * or in-progress booth session.
 *
 * Returns:
 * - 200 { sessionId }         — session was reset
 * - 404 { error }             — no active session to reset
 * - 500 { error }             — internal error
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const TERMINAL_SESSION_STATUSES = ['completed', 'abandoned', 'failed'] as const;

export async function POST(): Promise<NextResponse> {
  const supabase = createServerClient();

  // Find the most recent non-terminal session
  const { data: session, error: findError } = await supabase
    .from('sessions')
    .select('id, status')
    .not('status', 'in', `(${TERMINAL_SESSION_STATUSES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    log({
      level: 'error',
      event: 'admin.session_reset.lookup_failed',
      details: { error: findError.message },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'No active session to reset' }, { status: 404 });
  }

  // Update to abandoned
  const { error: updateError } = await supabase
    .from('sessions')
    .update({ status: 'abandoned' })
    .eq('id', session.id);

  if (updateError) {
    log({
      level: 'error',
      event: 'admin.session_reset.update_failed',
      sessionId: session.id,
      details: { error: updateError.message },
    });
    return NextResponse.json({ error: 'Failed to reset session' }, { status: 500 });
  }

  // Emit both the admin action event and the session lifecycle event
  log({
    level: 'info',
    event: 'session.abandoned',
    sessionId: session.id,
    details: { previousStatus: session.status, triggeredBy: 'admin.reset' },
  });

  return NextResponse.json({ sessionId: session.id });
}
