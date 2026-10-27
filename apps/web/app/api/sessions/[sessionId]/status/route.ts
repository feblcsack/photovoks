/**
 * GET /api/sessions/[sessionId]/status
 *
 * Returns the current status of a session identified by its unguessable token.
 * The token in the URL acts as the bearer credential — no additional auth needed.
 *
 * Response: { session, sketchJob, printJob, printStationOnline }
 *
 * On unknown token: returns 404 with a generic message (no token details leaked).
 *
 * Requirements: 8.11, 9.11
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** Station is considered online if heartbeat is fresher than this threshold. */
const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // sessionId here is actually the session token (unguessable string used as bearer)
  const { sessionId: token } = await context.params;

  const supabase = createServerClient();

  // ── Fetch session by token ────────────────────────────────────────────────
  // Generic 404 on miss — do not reveal whether the token ever existed.
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select(
      'id, token, event_id, status, selected_photo_index, live_photo_status, expires_at, created_at, updated_at'
    )
    .eq('token', token)
    .single();

  if (sessionError || !session) {
    // Generic 404 — Requirement 8.11: no token details leaked
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sessionId: string = session.id;

  // ── Fetch sketch job ──────────────────────────────────────────────────────
  const { data: sketchJob } = await supabase
    .from('sketch_jobs')
    .select('id, status, result_path, card_path, error_reason, retry_count, created_at, updated_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  // ── Fetch strip print job ─────────────────────────────────────────────────
  const { data: printJob } = await supabase
    .from('print_jobs')
    .select('id, type, status, asset_path, error_reason, created_at, updated_at')
    .eq('session_id', sessionId)
    .eq('type', 'strip')
    .maybeSingle();

  // ── Generate signed URL for the strip image ───────────────────────────────
  // The strip lives at sessions/{sessionId}/strip.png in the 'sessions' bucket.
  // We generate a 1-hour signed URL so the visitor can view and download it.
  let stripSignedUrl: string | null = null;
  const stripPath = `sessions/${sessionId}/strip.png`;
  const { data: stripUrlData } = await supabase.storage
    .from('sessions')
    .createSignedUrl(stripPath, 3600); // 1 hour validity
  if (stripUrlData?.signedUrl) {
    stripSignedUrl = stripUrlData.signedUrl;
  }

  // ── Generate signed URL for sketch card (if done) ─────────────────────────
  let sketchCardSignedUrl: string | null = null;
  if (sketchJob?.card_path && sketchJob.status === 'done') {
    const { data: sketchUrlData } = await supabase.storage
      .from('sketches')
      .createSignedUrl(sketchJob.card_path, 3600);
    if (sketchUrlData?.signedUrl) {
      sketchCardSignedUrl = sketchUrlData.signedUrl;
    }
  }

  // ── Compute print station online status ───────────────────────────────────
  // Requirement 9.11: station is online if heartbeat < 90 seconds ago.
  const { data: heartbeat } = await supabase
    .from('print_station_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let printStationOnline = false;
  if (heartbeat?.last_seen_at) {
    const lastSeenMs = new Date(heartbeat.last_seen_at).getTime();
    printStationOnline = Date.now() - lastSeenMs < HEARTBEAT_ONLINE_THRESHOLD_MS;
  }

  return NextResponse.json({
    session: {
      id: session.id,
      eventId: session.event_id,
      status: session.status,
      selectedPhotoIndex: session.selected_photo_index,
      livePhotoStatus: session.live_photo_status,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      stripSignedUrl,
    },
    sketchJob: sketchJob
      ? {
          ...sketchJob,
          cardSignedUrl: sketchCardSignedUrl,
        }
      : null,
    printJob: printJob ?? null,
    printStationOnline,
  });
}
