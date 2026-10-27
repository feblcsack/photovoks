/**
 * POST /api/admin/clear-queue
 *
 * Cancels all print jobs with status='queued' by setting their status to
 * 'cancelled'. This is used by the admin dashboard "Clear Queue" button
 * when the operator wants to discard all pending print jobs (e.g., end of
 * event).
 *
 * Returns:
 * - 200 { cancelledCount }    — number of jobs cancelled (may be 0)
 * - 500 { error }             — internal error
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function POST(): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'cancelled' })
    .eq('status', 'queued')
    .select('id');

  if (error) {
    log({
      level: 'error',
      event: 'admin.queue_clear.failed',
      details: { error: error.message },
    });
    return NextResponse.json({ error: 'Failed to clear queue' }, { status: 500 });
  }

  const cancelledCount = data?.length ?? 0;

  log({
    level: 'info',
    event: 'admin.queue_cleared',
    details: { cancelledCount },
  });

  return NextResponse.json({ cancelledCount });
}
