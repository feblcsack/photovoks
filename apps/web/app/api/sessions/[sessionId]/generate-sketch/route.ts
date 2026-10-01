/**
 * POST /api/sessions/[sessionId]/generate-sketch
 *
 * Creates a sketch_job record for the session, triggering async AI processing.
 * Idempotent: returns existing job ID if an active (non-failed) sketch job already exists.
 *
 * Auth: Bearer {sessionToken} in Authorization header
 *
 * Response 200: { sketchJobId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

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
    .select('id, token')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.token !== bearerToken) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
  }

  // ── Check for existing active sketch job (idempotency) ────────────────────
  const { data: existing } = await supabase
    .from('sketch_jobs')
    .select('id, status')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (existing && existing.status !== 'failed' && existing.status !== 'failed_safety') {
    return NextResponse.json({ sketchJobId: existing.id });
  }

  // ── Upsert sketch job ─────────────────────────────────────────────────────
  const { data: sketchJob, error: sketchJobError } = await supabase
    .from('sketch_jobs')
    .upsert(
      { session_id: sessionId, status: 'pending' },
      { onConflict: 'session_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (sketchJobError || !sketchJob) {
    log({
      level: 'error',
      event: 'sketch_job.create_failed',
      sessionId,
      details: { error: sketchJobError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to create sketch job' },
      { status: 500 }
    );
  }

  log({
    level: 'info',
    event: 'sketch_job.created_on_demand',
    sessionId,
    details: { sketchJobId: sketchJob.id },
  });

  return NextResponse.json({ sketchJobId: sketchJob.id });
}
