/**
 * POST /api/sessions
 *
 * Creates a new booth session for a visitor.
 * Public endpoint (no auth required) — rate-limited per IP by middleware.
 *
 * Request body: { eventId: string }
 * Response:     { sessionId, sessionToken, uploadUrls: { photo0, photo1, photo2, strip, sheet } }
 *
 * Requirements: 6.4, 15.1, 15.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateSessionToken } from '@photovoks/shared-types';
import { log } from '@/lib/logger';

// Session record expires 24 hours after creation
const SESSION_EXPIRY_HOURS = 24;

// NOTE: The 10-minute upload URL expiry (Requirement 15.6) is enforced by the
// Supabase Storage service configuration, not by a client-side parameter.
// Supabase's createSignedUploadUrl generates a token that expires according to
// the bucket's signed URL TTL setting, which must be set to 600 seconds (10 min)
// in the Supabase dashboard / Storage configuration.

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('eventId' in body) ||
    typeof (body as Record<string, unknown>).eventId !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid field: eventId' },
      { status: 400 }
    );
  }

  const { eventId } = body as { eventId: string };

  const supabase = createServerClient();

  // ── Validate event is active ──────────────────────────────────────────────
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .eq('status', 'active')
    .single();

  if (eventError || !event) {
    return NextResponse.json(
      { error: 'Event not found or not active' },
      { status: 404 }
    );
  }

  // ── Generate session token (96-bit entropy) ───────────────────────────────
  const sessionToken = generateSessionToken();

  // ── Compute expiry ────────────────────────────────────────────────────────
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  // ── Create session record BEFORE generating upload URLs ───────────────────
  // Requirement 6.4: session record must exist before any upload attempt.
  const { data: session, error: insertError } = await supabase
    .from('sessions')
    .insert({
      token: sessionToken,
      event_id: eventId,
      status: 'created',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError || !session) {
    log({
      level: 'error',
      event: 'session.create_failed',
      details: { eventId, error: insertError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }

  const sessionId: string = session.id;

  // ── Generate 5 signed upload URLs ────────────────────────────────────────
  // Paths scoped to sessions/{sessionId}/ — Requirement 15.6
  const assetPaths = [
    `sessions/${sessionId}/photo_0.jpg`,
    `sessions/${sessionId}/photo_1.jpg`,
    `sessions/${sessionId}/photo_2.jpg`,
    `sessions/${sessionId}/strip.png`,
    `sessions/${sessionId}/sheet.jpg`,
  ] as const;

  const signedUrlResults = await Promise.all(
    assetPaths.map((path) =>
      supabase.storage
        .from('sessions')
        .createSignedUploadUrl(path, { upsert: true })
    )
  );

  // If any URL generation failed, clean up the session record and error out
  const failedIndex = signedUrlResults.findIndex((r) => r.error);
  if (failedIndex !== -1) {
    await supabase.from('sessions').delete().eq('id', sessionId);
    log({
      level: 'error',
      event: 'session.upload_url_failed',
      sessionId,
      details: { path: assetPaths[failedIndex], error: signedUrlResults[failedIndex].error?.message },
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URLs' },
      { status: 500 }
    );
  }

  const [photo0Result, photo1Result, photo2Result, stripResult, sheetResult] =
    signedUrlResults;

  // ── Emit structured log ───────────────────────────────────────────────────
  log({
    level: 'info',
    event: 'session.created',
    sessionId,
    details: { eventId },
  });

  return NextResponse.json(
    {
      sessionId,
      sessionToken,
      uploadUrls: {
        photo0: photo0Result.data!.signedUrl,
        photo1: photo1Result.data!.signedUrl,
        photo2: photo2Result.data!.signedUrl,
        strip: stripResult.data!.signedUrl,
        sheet: sheetResult.data!.signedUrl,
      },
    },
    { status: 201 }
  );
}
