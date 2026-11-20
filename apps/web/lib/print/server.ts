/**
 * Print queue helpers (SERVER ONLY).
 */
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planSheet } from './papers';
import { log } from '@/lib/logger';

/** Renders any image to a print-ready JPEG for `paperId` (auto layout). */
export async function composeSheetServer(image: Buffer, paperId: string): Promise<Buffer> {
  const rotated = await sharp(image).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const plan = planSheet(paperId, meta.width ?? 1, meta.height ?? 1, 'auto');
  const layers = await Promise.all(
    plan.placements.map(async (p) => ({
      input: await sharp(rotated)
        .resize(Math.round(p.w), Math.round(p.h), { fit: p.fit, background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer(),
      left: Math.round(p.x),
      top: Math.round(p.y),
    })),
  );
  return sharp({ create: { width: plan.widthPx, height: plan.heightPx, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .jpeg({ quality: 93 })
    .toBuffer();
}

export interface EnqueueInput {
  sessionId: string;
  eventId: string;
  type: 'strip' | 'ai' | 'edit';
  copies: number;
  source: 'booth' | 'guest' | 'station' | 'admin';
  paper: string;
  aiGenerationId?: string;
  /** sessions/<sid>/edit_<id>.jpg (guest sticker edit) */
  editPath?: string;
}

export const EDIT_PATH_RE = /^sessions\/[0-9a-f-]{36}\/edit_[0-9a-f]{12}\.jpg$/;

/**
 * Creates a queued print job. For AI results a print-ready sheet is rendered
 * server-side first (strips already have sheet.jpg uploaded by the booth).
 */
export async function enqueuePrint(supabase: SupabaseClient, input: EnqueueInput): Promise<{ id: string } | { error: string }> {
  let assetPath = `sessions/${input.sessionId}/sheet.jpg`;

  if (input.type === 'ai') {
    if (!input.aiGenerationId) return { error: 'AI result tidak ditemukan' };
    const { data: gen } = await supabase
      .from('ai_generations')
      .select('id, session_id, status, result_path')
      .eq('id', input.aiGenerationId)
      .maybeSingle();
    if (!gen || gen.session_id !== input.sessionId || gen.status !== 'done' || !gen.result_path) {
      return { error: 'AI result belum siap' };
    }
    const sheetPath = `sketches/${input.sessionId}/ai_${gen.id}_${input.paper}.jpg`;
    const { data: existing } = await supabase.storage.from('sketches').list(`sketches/${input.sessionId}`, { search: `ai_${gen.id}_${input.paper}.jpg` });
    if (!existing?.length) {
      const { data: blob } = await supabase.storage.from('sketches').download(gen.result_path);
      if (!blob) return { error: 'Gagal mengunduh hasil AI' };
      const sheet = await composeSheetServer(Buffer.from(await blob.arrayBuffer()), input.paper);
      const { error } = await supabase.storage.from('sketches').upload(sheetPath, sheet, { contentType: 'image/jpeg', upsert: true });
      if (error) return { error: 'Gagal menyiapkan file cetak' };
    }
    assetPath = sheetPath;
  }

  if (input.type === 'edit') {
    const edit = input.editPath ?? '';
    if (!EDIT_PATH_RE.test(edit) || !edit.startsWith(`sessions/${input.sessionId}/`)) return { error: 'File stiker tidak valid' };
    const sheetPath = edit.replace(/\.jpg$/, `_${input.paper}.jpg`);
    const { data: blob } = await supabase.storage.from('sessions').download(edit);
    if (!blob) return { error: 'File stiker belum terunggah' };
    const sheet = await composeSheetServer(Buffer.from(await blob.arrayBuffer()), input.paper);
    const { error } = await supabase.storage.from('sessions').upload(sheetPath, sheet, { contentType: 'image/jpeg', upsert: true });
    if (error) return { error: 'Gagal menyiapkan file cetak' };
    assetPath = sheetPath;
  }

  const { data, error } = await supabase
    .from('print_jobs')
    .insert({
      session_id: input.sessionId,
      event_id: input.eventId,
      type: input.type,
      status: 'queued',
      asset_path: assetPath,
      copies: input.copies,
      paper: input.paper,
      source: input.source,
    })
    .select('id')
    .single();
  if (error || !data) {
    log({ level: 'error', event: 'print_job.create_failed', sessionId: input.sessionId, details: { error: error?.message } });
    return { error: 'Gagal membuat antrean cetak' };
  }
  await supabase.from('sessions').update({ status: 'printing' }).eq('id', input.sessionId).in('status', ['composed']);
  log({ level: 'info', event: 'print_job.created', sessionId: input.sessionId, jobId: data.id, details: { type: input.type, source: input.source, copies: input.copies } });
  return { id: data.id };
}

/** Records a print done directly from a browser (counts toward limits / history). */
export async function recordBrowserPrint(supabase: SupabaseClient, sessionId: string, eventId: string, type: 'strip' | 'ai' | 'edit', copies: number, paper: string, source: string) {
  await supabase.from('print_jobs').insert({
    session_id: sessionId,
    event_id: eventId,
    type,
    status: 'printed',
    copies,
    paper,
    source: `${source}-browser`,
    asset_path: null,
  });
  const { data } = await supabase.from('sessions').select('print_count').eq('id', sessionId).maybeSingle();
  await supabase
    .from('sessions')
    .update({ print_count: (data?.print_count ?? 0) + copies, status: 'printed' })
    .eq('id', sessionId);
}

/** Number of prints a guest has already requested for a session. */
export async function guestPrintsUsed(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const { data } = await supabase
    .from('print_jobs')
    .select('copies, status, source')
    .eq('session_id', sessionId)
    .neq('status', 'cancelled')
    .in('source', ['guest', 'guest-browser']);
  return (data ?? []).reduce((sum, j) => sum + (j.copies ?? 1), 0);
}
