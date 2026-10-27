/**
 * POST /api/sketch/process
 *
 * Supabase Database Webhook handler that processes a sketch job:
 *   1. Validates the Supabase webhook secret
 *   2. Checks the daily sketch cap for the event
 *   3. Atomically transitions the job from pending → processing
 *   4. Calls the Gemini API with the visitor's selected photo + prompt template
 *   5. On success: uploads raw sketch + composed card to Storage, marks done
 *   6. On any failure: marks the job with the appropriate error status
 *
 * Returns HTTP 200 for all handled outcomes so that Supabase does not retry.
 *
 * Requirements: 10.2–10.12
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FinishReason,
  GoogleGenerativeAIFetchError,
} from '@google/generative-ai';
import { createServerClient } from '@/lib/supabase/server';
import {
  composeSketchCardServer,
  composeSketchSheetServer,
} from '@/lib/canvas/server-compose';
import { log } from '@/lib/logger';

// Vercel — allow up to 60 seconds (Requirement 10.2)
export const maxDuration = 60;

// ── Environment helpers ───────────────────────────────────────────────────────

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

// ── Supabase job status updater ───────────────────────────────────────────────

type SketchStatus = 'pending' | 'processing' | 'done' | 'failed' | 'failed_safety';

async function updateSketchJob(
  sketchJobId: string,
  fields: {
    status: SketchStatus;
    error_reason?: string;
    result_path?: string;
    card_path?: string;
  },
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('sketch_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', sketchJobId);
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Validate webhook secret ─────────────────────────────────────────────
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Misconfigured server — do not reveal details
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const incomingSecret = request.headers.get('x-supabase-webhook-secret');
  if (!incomingSecret || incomingSecret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Parse webhook payload ───────────────────────────────────────────────
  // Supabase Database Webhook format: { type, table, record, old_record, ... }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const record = (body as Record<string, unknown>)?.record as Record<string, unknown> | undefined;
  const sketchJobId = record?.id as string | undefined;

  if (!sketchJobId || typeof sketchJobId !== 'string') {
    return NextResponse.json({ error: 'Missing sketch_job_id in webhook record' }, { status: 400 });
  }

  const supabase = createServerClient();

  // ── 3. Fetch sketch job row ────────────────────────────────────────────────
  const { data: sketchJob, error: sketchJobError } = await supabase
    .from('sketch_jobs')
    .select('id, session_id, status, input_photo_path, retry_count')
    .eq('id', sketchJobId)
    .single();

  if (sketchJobError || !sketchJob) {
    // Unknown job — nothing to do
    return NextResponse.json({ ok: true });
  }

  const sessionId: string = sketchJob.session_id;

  // ── 4. Fetch session to get event_id ──────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, event_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'session_not_found', sketchJobId },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'session_not_found' });
    return NextResponse.json({ ok: true });
  }

  const eventId: string = session.event_id;

  // ── 5. Fetch event config (cap + prompt template id + tear line) ──────────
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, daily_sketch_cap, active_prompt_template_id, tear_line_offset_px')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'event_not_found', sketchJobId, eventId },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'event_not_found' });
    return NextResponse.json({ ok: true });
  }

  // ── 6. Check daily sketch cap ──────────────────────────────────────────────
  // Requirement 10.10
  const { count: doneToday } = await supabase
    .from('sketch_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'done')
    // Join via session to get the event_id
    .in(
      'session_id',
      // Subquery: session_ids for this event
      (
        await supabase
          .from('sessions')
          .select('id')
          .eq('event_id', eventId)
      ).data?.map((s: { id: string }) => s.id) ?? [],
    )
    // created_at on the same calendar day (UTC)
    .gte('created_at', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString())
    .lt('created_at', new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString());

  if ((doneToday ?? 0) >= event.daily_sketch_cap) {
    log({
      level: 'warn',
      event: 'sketch.daily_cap_reached',
      sessionId,
      details: { sketchJobId, eventId, cap: event.daily_sketch_cap, doneToday },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'daily_cap_reached' });
    return NextResponse.json({ ok: true });
  }

  // ── 7. Optimistic lock: pending → processing ───────────────────────────────
  // Requirement 10.9 — prevents duplicate processing on duplicate webhook triggers.
  const { data: claimedRows, error: claimError } = await supabase
    .from('sketch_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', sketchJobId)
    .eq('status', 'pending')
    .select('id');

  if (claimError || !claimedRows || claimedRows.length === 0) {
    // Another instance already claimed this job — idempotent return
    return NextResponse.json({ ok: true });
  }

  log({
    level: 'info',
    event: 'sketch.processing',
    sessionId,
    details: { sketchJobId },
  });

  // ── 8. Fetch prompt template ───────────────────────────────────────────────
  let promptContent = 'Create a hand-drawn sketch artwork of this photo.';

  if (event.active_prompt_template_id) {
    const { data: promptTemplate } = await supabase
      .from('prompt_templates')
      .select('content')
      .eq('id', event.active_prompt_template_id)
      .single();

    if (promptTemplate?.content) {
      promptContent = promptTemplate.content as string;
    }
  }

  // ── 9. Fetch input photo from Storage ─────────────────────────────────────
  if (!sketchJob.input_photo_path) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'no_input_photo_path', sketchJobId },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'no_input_photo_path' });
    return NextResponse.json({ ok: true });
  }

  // Determine bucket and path from input_photo_path (format: sessions/{sessionId}/photo_N.jpg)
  const [inputBucket, ...inputPathParts] = sketchJob.input_photo_path.split('/');
  const inputPath = inputPathParts.join('/');

  const { data: photoData, error: photoError } = await supabase.storage
    .from(inputBucket)
    .download(inputPath);

  if (photoError || !photoData) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'photo_download_failed', sketchJobId, error: photoError?.message },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'photo_download_failed' });
    return NextResponse.json({ ok: true });
  }

  // Convert Blob → ArrayBuffer → Buffer
  const photoArrayBuffer = await photoData.arrayBuffer();
  const photoBuffer = Buffer.from(photoArrayBuffer);
  const photoBase64 = photoBuffer.toString('base64');

  // Determine MIME type from path extension
  const photoMimeType = sketchJob.input_photo_path.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // ── 10. Call Gemini API (with timeout guard and single retry on 429) ───────
  // Requirement 10.3, 10.5, 10.6, 10.7
  const startMs = Date.now();
  const TIMEOUT_GUARD_MS = 55_000; // Requirement: timeout > 55 s → mark failed

  const geminiModelName = getEnv('GEMINI_MODEL_NAME');
  const geminiApiKey = getEnv('GEMINI_API_KEY');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: geminiModelName });

  let rawSketchBuffer: Buffer | null = null;
  let geminiAttempt = 0;

  while (geminiAttempt < 2) {
    // Check timeout before each attempt
    if (Date.now() - startMs > TIMEOUT_GUARD_MS) {
      log({
        level: 'error',
        event: 'sketch.failed',
        sessionId,
        details: { reason: 'timeout', sketchJobId, elapsedMs: Date.now() - startMs },
      });
      await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'timeout' });
      return NextResponse.json({ ok: true });
    }

    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: photoMimeType,
            data: photoBase64,
          },
        },
        { text: promptContent },
      ]);

      const response = result.response;

      // Check if the prompt was blocked by safety filters
      if (response.promptFeedback?.blockReason) {
        log({
          level: 'warn',
          event: 'sketch.failed_safety',
          sessionId,
          details: {
            sketchJobId,
            blockReason: response.promptFeedback.blockReason,
          },
        });
        await updateSketchJob(sketchJobId, { status: 'failed_safety' });
        return NextResponse.json({ ok: true });
      }

      const candidate = response.candidates?.[0];

      // Check if the response was blocked by safety filters
      if (
        candidate?.finishReason === FinishReason.SAFETY ||
        candidate?.finishReason === FinishReason.PROHIBITED_CONTENT ||
        candidate?.finishReason === FinishReason.SPII
      ) {
        log({
          level: 'warn',
          event: 'sketch.failed_safety',
          sessionId,
          details: { sketchJobId, finishReason: candidate.finishReason },
        });
        await updateSketchJob(sketchJobId, { status: 'failed_safety' });
        return NextResponse.json({ ok: true });
      }

      // Extract image bytes from the first candidate's inline data part
      const parts = candidate?.content?.parts ?? [];
      let imageBase64: string | null = null;
      let imageMimeType: string = 'image/png';

      for (const part of parts) {
        if ('inlineData' in part && part.inlineData) {
          imageBase64 = part.inlineData.data;
          imageMimeType = part.inlineData.mimeType;
          break;
        }
      }

      if (!imageBase64) {
        // No image data in response — treat as a generation failure
        log({
          level: 'error',
          event: 'sketch.failed',
          sessionId,
          details: { reason: 'empty_response', sketchJobId, finishReason: candidate?.finishReason },
        });
        await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'empty_response' });
        return NextResponse.json({ ok: true });
      }

      void imageMimeType; // consumed above; suppress unused-var lint
      rawSketchBuffer = Buffer.from(imageBase64, 'base64');
      break; // success — exit the retry loop

    } catch (err: unknown) {
      const elapsed = Date.now() - startMs;

      // Check timeout again after a failed attempt
      if (elapsed > TIMEOUT_GUARD_MS) {
        log({
          level: 'error',
          event: 'sketch.failed',
          sessionId,
          details: { reason: 'timeout', sketchJobId, elapsedMs: elapsed },
        });
        await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'timeout' });
        return NextResponse.json({ ok: true });
      }

      // Handle 429 — retry once after 2 seconds (Requirement 10.6)
      if (err instanceof GoogleGenerativeAIFetchError && err.status === 429) {
        if (geminiAttempt === 0) {
          log({
            level: 'warn',
            event: 'sketch.rate_limited',
            sessionId,
            details: { sketchJobId, attempt: geminiAttempt + 1 },
          });
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          geminiAttempt++;
          continue;
        }
        // Second 429 — give up
        log({
          level: 'error',
          event: 'sketch.failed',
          sessionId,
          details: { reason: 'rate_limited', sketchJobId },
        });
        await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'rate_limited' });
        return NextResponse.json({ ok: true });
      }

      // Any other Gemini error
      const message = err instanceof Error ? err.message : String(err);
      log({
        level: 'error',
        event: 'sketch.failed',
        sessionId,
        details: { reason: 'gemini_error', sketchJobId, error: message },
      });
      await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'gemini_error' });
      return NextResponse.json({ ok: true });
    }
  }

  if (!rawSketchBuffer) {
    // Should not happen — belt and suspenders
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'gemini_error' });
    return NextResponse.json({ ok: true });
  }

  // ── 11. Upload raw sketch to Storage ─────────────────────────────────────
  const rawSketchPath = `sketches/${sessionId}/raw.png`;

  const { error: rawUploadError } = await supabase.storage
    .from('sketches')
    .upload(rawSketchPath, rawSketchBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (rawUploadError) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'storage_upload_failed', sketchJobId, error: rawUploadError.message, path: rawSketchPath },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'storage_upload_failed' });
    return NextResponse.json({ ok: true });
  }

  // ── 12. Compose sketch card (600×1800 px PNG) ─────────────────────────────
  // Requirement 10.12, Task 17.8
  let cardBuffer: Buffer;
  try {
    cardBuffer = await composeSketchCardServer(rawSketchBuffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'card_compose_failed', sketchJobId, error: message },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'card_compose_failed' });
    return NextResponse.json({ ok: true });
  }

  // ── 13. Upload sketch card to Storage ─────────────────────────────────────
  const cardPath = `sketches/${sessionId}/card.png`;

  const { error: cardUploadError } = await supabase.storage
    .from('sketches')
    .upload(cardPath, cardBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (cardUploadError) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'storage_upload_failed', sketchJobId, error: cardUploadError.message, path: cardPath },
    });
    await updateSketchJob(sketchJobId, { status: 'failed', error_reason: 'storage_upload_failed' });
    return NextResponse.json({ ok: true });
  }

  // Compose sketch sheet (used only for print; stored for on-demand access)
  // We compose but do NOT store it here unless a print is requested.
  // The sketch sheet is composed at print-request time via POST /api/print-jobs/sketch.
  // The `card_path` stored now is the canonical reference.
  // Note: composeSketchSheetServer is available for use in /api/print-jobs/sketch.
  void composeSketchSheetServer; // referenced here to prevent tree-shaking confusion

  // ── 14. Mark sketch job as done ───────────────────────────────────────────
  await updateSketchJob(sketchJobId, {
    status: 'done',
    result_path: rawSketchPath,
    card_path: cardPath,
  });

  log({
    level: 'info',
    event: 'sketch.done',
    sessionId,
    details: { sketchJobId, cardPath, rawSketchPath },
  });

  return NextResponse.json({ ok: true });
}
