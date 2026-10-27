/**
 * POST /api/print-jobs/sketch
 *
 * Creates a sketch print job for a session, authorized by the session token.
 *
 * Auth: Bearer {sessionToken} in Authorization header
 *
 * Idempotent: the UNIQUE(session_id, type) constraint ensures at most one
 * sketch print job exists per session. Repeated calls return the existing job.
 *
 * Validates:
 * - Session token matches a valid session
 * - Sketch job status is 'done' (no point printing an unfinished sketch)
 * - Print station heartbeat is within 90 seconds (station must be online)
 *
 * On first call:
 *   1. Downloads the 600×1800 sketch card from Storage
 *   2. Composes a 4R print sheet (card on left, white on right)
 *   3. Uploads the sheet to sketches/{sessionId}/sheet.jpg
 *   4. Upserts the print job with the sheet path as asset_path
 *
 * On repeat calls (UNIQUE conflict):
 *   - Returns the existing print job id unchanged (no re-composition)
 *
 * Response: { printJobId: string }
 *
 * Requirements: 8.9, 12.1, 12.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  composeSketchCardServer,
  composeSketchSheetServer,
} from '@/lib/canvas/server-compose';
import { log } from '@/lib/logger';

/** Storage bucket that holds sketch assets. */

/** Station is considered online if heartbeat is fresher than this threshold (Requirement 9.11). */
const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

const SKETCH_BUCKET = 'sketches';

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Validate Bearer token ────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 },
    );
  }
  const bearerToken = authHeader.slice('Bearer '.length).trim();

  const supabase = createServerClient();

  // ── Look up the session by token ─────────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, token, event_id')
    .eq('token', bearerToken)
    .single();

  if (sessionError || !session) {
    // Generic 401 — do not reveal whether the token is unknown or just wrong
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId: string = session.id;
  const eventId: string = session.event_id;

  // ── Verify sketch job is done ────────────────────────────────────────────
  const { data: sketchJob, error: sketchJobError } = await supabase
    .from('sketch_jobs')
    .select('id, status, card_path')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (sketchJobError || !sketchJob) {
    return NextResponse.json(
      { error: 'Sketch job not found for this session' },
      { status: 404 },
    );
  }

  if (sketchJob.status !== 'done') {
    return NextResponse.json(
      { error: 'Sketch is not ready for printing yet', sketchStatus: sketchJob.status },
      { status: 422 },
    );
  }

  if (!sketchJob.card_path) {
    return NextResponse.json(
      { error: 'Sketch card asset is missing' },
      { status: 422 },
    );
  }

  // ── Check if a sketch print job already exists (idempotency fast-path) ───
  // If the job already exists we skip re-composing the sheet and just return
  // the existing job id. We check this before the heartbeat so that subsequent
  // taps don't require the station to be online once the job is queued.
  const { data: existingJob } = await supabase
    .from('print_jobs')
    .select('id')
    .eq('session_id', sessionId)
    .eq('type', 'sketch')
    .maybeSingle();

  if (existingJob) {
    log({
      level: 'info',
      event: 'print_job.already_exists',
      sessionId,
      jobId: existingJob.id,
      details: { type: 'sketch' },
    });
    return NextResponse.json({ printJobId: existingJob.id });
  }

  // ── Verify print station is online ───────────────────────────────────────
  // Only gated for the *first* request; subsequent taps use the fast-path above.
  const { data: heartbeat } = await supabase
    .from('print_station_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!heartbeat?.last_seen_at) {
    return NextResponse.json(
      { error: 'Print station is offline' },
      { status: 503 },
    );
  }

  const lastSeenMs = new Date(heartbeat.last_seen_at).getTime();
  if (Date.now() - lastSeenMs >= HEARTBEAT_ONLINE_THRESHOLD_MS) {
    return NextResponse.json(
      { error: 'Print station is offline' },
      { status: 503 },
    );
  }

  // ── Fetch event config for tear-line offset ───────────────────────────────
  const { data: event } = await supabase
    .from('events')
    .select('tear_line_offset_px')
    .eq('id', eventId)
    .single();

  const tearLineOffsetPx: number = event?.tear_line_offset_px ?? 0;

  // ── Compose sketch sheet (card on left, white on right) ──────────────────
  // Requirement 12.3: print the sketch card as a standalone strip on its own
  // 4R sheet, with the other half of the sheet left blank.
  //
  // card_path format: "sketches/{sessionId}/card.png"
  // Strip the leading bucket prefix to get the storage object path.
  const cardStoragePath = sketchJob.card_path.replace(/^sketches\//, '');

  const { data: cardBlob, error: cardDownloadError } = await supabase.storage
    .from(SKETCH_BUCKET)
    .download(cardStoragePath);

  if (cardDownloadError || !cardBlob) {
    log({
      level: 'error',
      event: 'print_job.card_download_failed',
      sessionId,
      details: { cardStoragePath, error: cardDownloadError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to download sketch card for sheet composition' },
      { status: 500 },
    );
  }

  const cardArrayBuffer = await cardBlob.arrayBuffer();
  const cardBuffer = Buffer.from(cardArrayBuffer);

  // Re-compose as 600×1800 card first (server-side canonical step), then sheet
  let sheetBuffer: Buffer;
  try {
    const canonicalCard = await composeSketchCardServer(cardBuffer);
    sheetBuffer = await composeSketchSheetServer(canonicalCard, tearLineOffsetPx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({
      level: 'error',
      event: 'print_job.compose_failed',
      sessionId,
      details: { error: message },
    });
    return NextResponse.json(
      { error: 'Failed to compose sketch print sheet' },
      { status: 500 },
    );
  }

  // ── Upload sketch sheet to Storage ───────────────────────────────────────
  // Path: sketches/{sessionId}/sheet.jpg
  const sheetStoragePath = `${sessionId}/sheet.jpg`;
  const sheetAssetPath = `sketches/${sessionId}/sheet.jpg`;

  const { error: sheetUploadError } = await supabase.storage
    .from(SKETCH_BUCKET)
    .upload(sheetStoragePath, sheetBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (sheetUploadError) {
    log({
      level: 'error',
      event: 'print_job.sheet_upload_failed',
      sessionId,
      details: { error: sheetUploadError.message },
    });
    return NextResponse.json(
      { error: 'Failed to upload sketch print sheet' },
      { status: 500 },
    );
  }

  // ── Upsert sketch print job (idempotent — Req 12.2) ──────────────────────
  // UNIQUE(session_id, type) ensures at most one sketch print job per session.
  // ignoreDuplicates: false so the existing row is returned on conflict.
  const { data: printJob, error: printJobError } = await supabase
    .from('print_jobs')
    .upsert(
      {
        session_id: sessionId,
        type: 'sketch',
        status: 'queued',
        asset_path: sheetAssetPath,
      },
      { onConflict: 'session_id,type', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (printJobError || !printJob) {
    log({
      level: 'error',
      event: 'print_job.create_failed',
      sessionId,
      details: { type: 'sketch', error: printJobError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to create sketch print job' },
      { status: 500 },
    );
  }

  // ── Structured log ────────────────────────────────────────────────────────
  log({
    level: 'info',
    event: 'print_job.created',
    sessionId,
    jobId: printJob.id,
    details: { type: 'sketch', sheetAssetPath },
  });

  return NextResponse.json({ printJobId: printJob.id });
}
