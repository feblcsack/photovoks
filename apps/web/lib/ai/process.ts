/**
 * AI generation job processor (SERVER ONLY). Runs in the background via
 * `after()` right after a generation is requested. The client polls status.
 */
import sharp from 'sharp';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { getProvider } from './provider';

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function closestAspect(w: number, h: number): string {
  const options: Array<[string, number]> = [['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 3 / 2], ['9:16', 9 / 16], ['16:9', 16 / 9]];
  const r = w / h;
  return options.reduce((best, cur) => (Math.abs(cur[1] - r) < Math.abs(best[1] - r) ? cur : best))[0];
}

export async function processAiGeneration(generationId: string): Promise<void> {
  const supabase = createServerClient();
  const provider = getProvider();

  const fail = async (reason: string, status: 'failed' | 'failed_safety' = 'failed') => {
    await supabase.from('ai_generations').update({ status, error_reason: reason }).eq('id', generationId);
  };

  const { data: job } = await supabase
    .from('ai_generations')
    .update({ status: 'processing', error_reason: null })
    .eq('id', generationId)
    .eq('status', 'pending')
    .select('id, session_id, shot_index, prompt, attempts')
    .maybeSingle();
  if (!job) return; // already claimed

  const sessionId: string = job.session_id;
  try {
    await supabase.from('ai_generations').update({ attempts: (job.attempts ?? 0) + 1 }).eq('id', generationId);

    const { data: session } = await supabase.from('sessions').select('id, event_id').eq('id', sessionId).maybeSingle();
    if (!session) return fail('session_not_found');
    const { data: event } = await supabase.from('events').select('id, daily_sketch_cap').eq('id', session.event_id).maybeSingle();
    if (!event) return fail('event_not_found');

    // Daily cap per event (UTC day) — protects the AI budget.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('ai_generations')
      .select('id, sessions!inner(event_id)', { count: 'exact', head: true })
      .eq('status', 'done')
      .eq('sessions.event_id', event.id)
      .gte('updated_at', dayStart.toISOString());
    if ((count ?? 0) >= (event.daily_sketch_cap ?? 50)) {
      log({ level: 'warn', event: 'ai.daily_cap_reached', sessionId });
      return fail('daily_cap_reached');
    }

    const photoPath = `sessions/${sessionId}/photo_${job.shot_index}.jpg`;
    const { data: blob, error: dlError } = await supabase.storage.from('sessions').download(photoPath);
    if (dlError || !blob) return fail('photo_download_failed');

    // Downscale before sending: faster + cheaper, models don't need >1024px.
    const original = Buffer.from(await blob.arrayBuffer());
    const meta = await sharp(original).metadata();
    const input = await sharp(original).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

    log({ level: 'info', event: 'ai.processing', sessionId, details: { generationId, provider: provider.id, model: provider.model() } });
    const result = await provider.generate({
      image: input,
      mimeType: 'image/jpeg',
      prompt: job.prompt,
      aspectRatio: meta.width && meta.height ? closestAspect(meta.width, meta.height) : undefined,
    });

    if (!result.ok) {
      log({ level: 'warn', event: 'ai.failed', sessionId, details: { generationId, reason: result.reason, message: result.message } });
      return fail(result.reason, result.reason === 'safety' ? 'failed_safety' : 'failed');
    }

    // Normalise to PNG/JPEG we can always display + print.
    let out = result.image;
    let mime = result.mimeType;
    if (!MIME_EXT[mime]) {
      out = await sharp(result.image).png().toBuffer();
      mime = 'image/png';
    }
    const path = `sketches/${sessionId}/ai_${generationId}.${MIME_EXT[mime]}`;
    const { error: upError } = await supabase.storage.from('sketches').upload(path, out, { contentType: mime, upsert: true });
    if (upError) return fail('storage_upload_failed');

    await supabase
      .from('ai_generations')
      .update({ status: 'done', result_path: path, model: result.model, error_reason: null })
      .eq('id', generationId);
    log({ level: 'info', event: 'ai.done', sessionId, details: { generationId } });
  } catch (err) {
    log({ level: 'error', event: 'ai.failed', sessionId, details: { generationId, error: err instanceof Error ? err.message : String(err) } });
    await fail('unexpected');
  }
}
