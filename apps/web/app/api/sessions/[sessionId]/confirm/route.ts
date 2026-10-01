/**
 * POST /api/sessions/[sessionId]/confirm
 *
 * Confirms that all 5 assets have been uploaded, then creates the print job
 * record and marks the session as composed.
 *
 * Auth: Bearer {sessionToken} in Authorization header
 *
 * Response: { printJobId: string, sketchJobId: null }
 *
 * Requirements: 6.5, 6.8, 6.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

/** The 5 asset paths expected under sessions/{sessionId}/ */
const ASSET_FILENAMES = [
  'photo_0.jpg',
  'photo_1.jpg',
  'photo_2.jpg',
  'strip.png',
  'sheet.jpg',
] as const;

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { sessionId } = await context.params;

  // ── Validate Bearer token ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
    );
  }
  const bearerToken = authHeader.slice('Bearer '.length).trim();

  const supabase = createServerClient();

  // ── Look up the session and validate token ────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, token, status')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.token !== bearerToken) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
  }

  // ── Verify all 5 assets exist in Storage ─────────────────────────────────
  const headChecks = await Promise.all(
    ASSET_FILENAMES.map(async (filename) => {
      const path = `sessions/${sessionId}/${filename}`;
      const { data, error } = await supabase.storage
        .from('sessions')
        .list(`sessions/${sessionId}`, {
          search: filename,
          limit: 1,
        });

      // Alternative: use getPublicUrl or download. We check via list() since
      // HEAD via the storage client isn't directly exposed. A non-empty result
      // means the file exists.
      if (error) return { path, exists: false };
      return { path, exists: (data?.length ?? 0) > 0 };
    })
  );

  const missing = headChecks.filter((r) => !r.exists).map((r) => r.path);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Upload verification failed — missing assets', missing },
      { status: 422 }
    );
  }

  // ── Log upload completion ─────────────────────────────────────────────────
  log({
    level: 'info',
    event: 'session.uploaded',
    sessionId,
    details: { assetsVerified: ASSET_FILENAMES.length },
  });

  // ── Upsert strip print job (idempotent via UNIQUE(session_id, type)) ──────
  // Requirement 6.8: idempotent — repeated calls must not create duplicates.
  const { data: printJob, error: printJobError } = await supabase
    .from('print_jobs')
    .upsert(
      {
        session_id: sessionId,
        type: 'strip',
        status: 'queued',
        asset_path: `sessions/${sessionId}/sheet.jpg`,
      },
      { onConflict: 'session_id,type', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (printJobError || !printJob) {
    log({
      level: 'error',
      event: 'print_job.create_failed',
      sessionId,
      details: { error: printJobError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to create print job' },
      { status: 500 }
    );
  }

  // Log print job creation lifecycle event (Requirement 16.2)
  log({
    level: 'info',
    event: 'print_job.created',
    sessionId,
    jobId: printJob.id,
    details: { type: 'strip', status: 'queued' },
  });

  // ── Update session status → composed ─────────────────────────────────────
  const { error: updateError } = await supabase
    .from('sessions')
    .update({ status: 'composed' })
    .eq('id', sessionId);

  if (updateError) {
    log({
      level: 'error',
      event: 'session.status_update_failed',
      sessionId,
      details: { error: updateError.message },
    });
    // Non-fatal: status update failure doesn't block printing
  }

  // ── Emit structured log ───────────────────────────────────────────────────
  log({
    level: 'info',
    event: 'session.composed',
    sessionId,
    details: {
      printJobId: printJob.id,
      sketchJobId: null,
    },
  });

  return NextResponse.json({
    printJobId: printJob.id,
    sketchJobId: null,
  });
}
