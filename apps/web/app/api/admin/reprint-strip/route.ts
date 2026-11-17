/**
 * POST /api/admin/reprint-strip  (admin only)
 *
 * Re-queues the most recently finished strip print job (printed / failed /
 * cancelled) so the print worker prints it again.
 *
 * Returns 200 { printJobId } | 404 nothing to reprint | 500 error
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { requireAdmin } from '@/lib/security';

export async function POST(): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = createServerClient();

  // Most recent strip job that finished (printed, failed or cancelled).
  const { data: lastJob, error: findError } = await supabase
    .from('print_jobs')
    .select('id, session_id, asset_path, status')
    .eq('type', 'strip')
    .in('status', ['printed', 'failed', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    log({ level: 'error', event: 'admin.reprint.lookup_failed', details: { error: findError.message } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!lastJob || !lastJob.asset_path) {
    return NextResponse.json({ error: 'Belum ada strip yang bisa dicetak ulang' }, { status: 404 });
  }

  // UNIQUE(session_id, type) → re-queue the existing row instead of inserting.
  const { data: requeued, error: updateError } = await supabase
    .from('print_jobs')
    .update({ status: 'queued', error_reason: null })
    .eq('id', lastJob.id)
    .eq('status', lastJob.status)
    .select('id')
    .maybeSingle();

  if (updateError || !requeued) {
    log({
      level: 'error',
      event: 'admin.reprint.requeue_failed',
      sessionId: lastJob.session_id,
      details: { error: updateError?.message },
    });
    return NextResponse.json({ error: 'Gagal mencetak ulang' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.reprint',
    sessionId: lastJob.session_id,
    jobId: requeued.id,
    details: { type: 'strip', previousStatus: lastJob.status },
  });

  return NextResponse.json({ printJobId: requeued.id }, { status: 200 });
}
