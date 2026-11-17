/**
 * Sketch (AI doodle) job processor — SERVER ONLY.
 *
 * Called in the background (via `after()`) right after a visitor taps
 * "Buat Doodle AI". No Supabase webhook or extra service is needed.
 *
 * Storage convention: every stored path starts with its bucket name, e.g.
 *   sessions bucket → "sessions/<sessionId>/photo_1.jpg"
 *   sketches bucket → "sketches/<sessionId>/card.png"
 */
import { createServerClient } from '@/lib/supabase/server';
import { composeSketchCardServer } from '@/lib/canvas/server-compose';
import { log } from '@/lib/logger';
import { DEFAULT_DOODLE_PROMPT, generateDoodle } from './gemini';

type SketchStatus = 'pending' | 'processing' | 'done' | 'failed' | 'failed_safety';

/** Splits "bucket/rest/of/path" → { bucket, path: full path } */
export function bucketOf(storagePath: string): string {
  return storagePath.split('/')[0];
}

export async function processSketchJob(sketchJobId: string): Promise<void> {
  const supabase = createServerClient();

  async function update(fields: {
    status: SketchStatus;
    error_reason?: string | null;
    result_path?: string;
    card_path?: string;
  }) {
    await supabase.from('sketch_jobs').update(fields).eq('id', sketchJobId);
  }

  // ── Atomically claim the job (pending → processing) ──────────────────────
  const { data: claimed } = await supabase
    .from('sketch_jobs')
    .update({ status: 'processing', error_reason: null })
    .eq('id', sketchJobId)
    .eq('status', 'pending')
    .select('id, session_id, input_photo_path')
    .maybeSingle();

  if (!claimed) return; // already processed / claimed elsewhere
  const sessionId: string = claimed.session_id;

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('id, event_id')
      .eq('id', sessionId)
      .single();
    if (!session) {
      await update({ status: 'failed', error_reason: 'session_not_found' });
      return;
    }

    const { data: event } = await supabase
      .from('events')
      .select('id, daily_sketch_cap, active_prompt_template_id')
      .eq('id', session.event_id)
      .single();
    if (!event) {
      await update({ status: 'failed', error_reason: 'event_not_found' });
      return;
    }

    // ── Daily cap (per event, UTC day) — protects the Gemini budget ─────────
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: doneToday } = await supabase
      .from('sketch_jobs')
      .select('id, sessions!inner(event_id)', { count: 'exact', head: true })
      .eq('status', 'done')
      .eq('sessions.event_id', event.id)
      .gte('updated_at', dayStart.toISOString());

    if ((doneToday ?? 0) >= event.daily_sketch_cap) {
      log({ level: 'warn', event: 'sketch.daily_cap_reached', sessionId, details: { cap: event.daily_sketch_cap } });
      await update({ status: 'failed', error_reason: 'daily_cap_reached' });
      return;
    }

    // ── Prompt ──────────────────────────────────────────────────────────────
    let prompt = DEFAULT_DOODLE_PROMPT;
    if (event.active_prompt_template_id) {
      const { data: tpl } = await supabase
        .from('prompt_templates')
        .select('content')
        .eq('id', event.active_prompt_template_id)
        .maybeSingle();
      if (tpl?.content) prompt = tpl.content as string;
    }

    // ── Input photo ─────────────────────────────────────────────────────────
    const inputPath: string | null = claimed.input_photo_path;
    if (!inputPath) {
      await update({ status: 'failed', error_reason: 'no_input_photo_path' });
      return;
    }
    const { data: photoBlob, error: dlError } = await supabase.storage
      .from(bucketOf(inputPath))
      .download(inputPath);
    if (dlError || !photoBlob) {
      await update({ status: 'failed', error_reason: 'photo_download_failed' });
      return;
    }
    const photo = Buffer.from(await photoBlob.arrayBuffer());

    // ── Gemini ──────────────────────────────────────────────────────────────
    log({ level: 'info', event: 'sketch.processing', sessionId, details: { sketchJobId } });
    const result = await generateDoodle(photo, photoBlob.type || 'image/jpeg', prompt);

    if (!result.ok) {
      log({ level: 'warn', event: 'sketch.failed', sessionId, details: { reason: result.reason, message: result.message } });
      await update(
        result.reason === 'safety'
          ? { status: 'failed_safety', error_reason: 'safety' }
          : { status: 'failed', error_reason: result.reason },
      );
      return;
    }

    // ── Store raw + 600×1800 card ───────────────────────────────────────────
    const rawPath = `sketches/${sessionId}/raw.png`;
    const cardPath = `sketches/${sessionId}/card.png`;
    const card = await composeSketchCardServer(result.image);

    const [rawUp, cardUp] = await Promise.all([
      supabase.storage.from('sketches').upload(rawPath, result.image, { contentType: result.mimeType, upsert: true }),
      supabase.storage.from('sketches').upload(cardPath, card, { contentType: 'image/png', upsert: true }),
    ]);
    if (rawUp.error || cardUp.error) {
      await update({ status: 'failed', error_reason: 'storage_upload_failed' });
      return;
    }

    await update({ status: 'done', error_reason: null, result_path: rawPath, card_path: cardPath });
    log({ level: 'info', event: 'sketch.done', sessionId, details: { sketchJobId } });
  } catch (err) {
    log({
      level: 'error',
      event: 'sketch.failed',
      sessionId,
      details: { reason: 'unexpected', error: err instanceof Error ? err.message : String(err) },
    });
    await update({ status: 'failed', error_reason: 'unexpected' });
  }
}
