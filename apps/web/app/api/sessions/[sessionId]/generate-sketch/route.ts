/**
 * POST /api/sessions/[sessionId]/generate-sketch
 *
 * Starts AI doodle generation for a session. The work runs in the background
 * via `after()` — the client polls /api/sessions/[token]/status for progress.
 *
 * Auth: Bearer {sessionToken}
 * Idempotent: returns the existing job while it is pending/processing/done.
 * A failed job may be retried up to MAX_RETRIES times (not safety failures).
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { getBearer, isUuid, safeEqual } from '@/lib/security';
import { isGeminiConfigured } from '@/lib/sketch/gemini';
import { processSketchJob } from '@/lib/sketch/process';

export const maxDuration = 60;

const MAX_RETRIES = 2;

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { sessionId } = await context.params;
  const bearer = getBearer(request);
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(sessionId)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'AI doodle belum diaktifkan' }, { status: 503 });
  }

  const supabase = createServerClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, token, selected_photo_index, expires_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || !safeEqual(session.token, bearer)) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Session expired' }, { status: 410 });
  }

  const photoIndex = [0, 1, 2].includes(session.selected_photo_index) ? session.selected_photo_index : 1;
  const inputPhotoPath = `sessions/${sessionId}/photo_${photoIndex}.jpg`;

  const { data: existing } = await supabase
    .from('sketch_jobs')
    .select('id, status, retry_count')
    .eq('session_id', sessionId)
    .maybeSingle();

  let jobId: string;

  if (existing) {
    if (existing.status !== 'failed') {
      // pending / processing / done / failed_safety → nothing new to do
      return NextResponse.json({ sketchJobId: existing.id, status: existing.status });
    }
    if (existing.retry_count >= MAX_RETRIES) {
      return NextResponse.json({ sketchJobId: existing.id, status: 'failed' }, { status: 429 });
    }
    const { data: reset } = await supabase
      .from('sketch_jobs')
      .update({
        status: 'pending',
        error_reason: null,
        input_photo_path: inputPhotoPath,
        retry_count: existing.retry_count + 1,
      })
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle();
    if (!reset) return NextResponse.json({ sketchJobId: existing.id, status: 'pending' });
    jobId = reset.id;
  } else {
    const { data: created, error } = await supabase
      .from('sketch_jobs')
      .insert({ session_id: sessionId, status: 'pending', input_photo_path: inputPhotoPath })
      .select('id')
      .single();
    if (error || !created) {
      // Unique violation = a concurrent request created it — treat as success.
      const { data: again } = await supabase
        .from('sketch_jobs')
        .select('id, status')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (again) return NextResponse.json({ sketchJobId: again.id, status: again.status });
      log({ level: 'error', event: 'sketch_job.create_failed', sessionId, details: { error: error?.message } });
      return NextResponse.json({ error: 'Failed to create sketch job' }, { status: 500 });
    }
    jobId = created.id;
  }

  log({ level: 'info', event: 'sketch_job.created_on_demand', sessionId, details: { sketchJobId: jobId } });

  after(() => processSketchJob(jobId));

  return NextResponse.json({ sketchJobId: jobId, status: 'pending' });
}
