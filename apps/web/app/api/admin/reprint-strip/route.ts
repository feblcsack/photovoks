/**
 * POST /api/admin/reprint-strip
 *
 * Finds the most recent session that has a 'strip' print job in 'printed'
 * status and creates a new print job record (type='strip', status='queued')
 * using the same asset_path. This allows the operator to reprint the last
 * strip without needing to re-upload anything.
 *
 * Returns:
 * - 201 { printJobId }        — new print job created
 * - 404 { error }             — no printable strip found
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

  // Find the most recent printed strip job (with its asset path)
  const { data: lastJob, error: findError } = await supabase
    .from('print_jobs')
    .select('id, session_id, asset_path')
    .eq('type', 'strip')
    .eq('status', 'printed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    log({
      level: 'error',
      event: 'admin.reprint.lookup_failed',
      details: { error: findError.message },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!lastJob || !lastJob.asset_path) {
    return NextResponse.json(
      { error: 'No printed strip job found to reprint' },
      { status: 404 }
    );
  }

  // Create a new queued print job using the same asset
  const { data: newJob, error: insertError } = await supabase
    .from('print_jobs')
    .insert({
      session_id: lastJob.session_id,
      type: 'strip',
      status: 'queued',
      asset_path: lastJob.asset_path,
    })
    .select('id')
    .single();

  if (insertError || !newJob) {
    log({
      level: 'error',
      event: 'admin.reprint.create_failed',
      sessionId: lastJob.session_id,
      details: { error: insertError?.message },
    });
    return NextResponse.json({ error: 'Failed to create reprint job' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.reprint',
    sessionId: lastJob.session_id,
    jobId: newJob.id,
    details: { type: 'strip', sourceJobId: lastJob.id, assetPath: lastJob.asset_path },
  });

  return NextResponse.json({ printJobId: newJob.id }, { status: 201 });
}
