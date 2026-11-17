/**
 * POST /api/print-jobs/sketch
 *
 * Queues a print of the visitor's AI doodle (authorised by session token).
 * Idempotent: UNIQUE(session_id, type) → at most one doodle print per session.
 *
 * Steps (first call only):
 *   1. Download the 600×1800 card from sketches/<sessionId>/card.png
 *   2. Compose a 4R sheet (card left of the tear line, right half white)
 *   3. Upload to sketches/<sessionId>/sheet.jpg
 *   4. Insert the print job (asset_path = "sketches/<sessionId>/sheet.jpg")
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { composeSketchSheetServer } from '@/lib/canvas/server-compose';
import { log } from '@/lib/logger';
import { getBearer } from '@/lib/security';
import { isPrintStationOnline } from '@/lib/session-status';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = getBearer(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, event_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sessionId: string = session.id;

  const { data: sketchJob } = await supabase
    .from('sketch_jobs')
    .select('id, status, card_path')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!sketchJob || sketchJob.status !== 'done' || !sketchJob.card_path) {
    return NextResponse.json({ error: 'Doodle belum siap' }, { status: 422 });
  }

  const { data: existingJob } = await supabase
    .from('print_jobs')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('type', 'sketch')
    .maybeSingle();
  if (existingJob) return NextResponse.json({ printJobId: existingJob.id });

  if (!(await isPrintStationOnline())) {
    return NextResponse.json({ error: 'Printer offline' }, { status: 503 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('tear_line_offset_px')
    .eq('id', session.event_id)
    .maybeSingle();

  const { data: cardBlob, error: dlError } = await supabase.storage
    .from('sketches')
    .download(sketchJob.card_path);
  if (dlError || !cardBlob) {
    log({ level: 'error', event: 'print_job.card_download_failed', sessionId, details: { error: dlError?.message } });
    return NextResponse.json({ error: 'Gagal menyiapkan cetakan' }, { status: 500 });
  }

  let sheet: Buffer;
  try {
    sheet = await composeSketchSheetServer(
      Buffer.from(await cardBlob.arrayBuffer()),
      event?.tear_line_offset_px ?? 0,
    );
  } catch (err) {
    log({ level: 'error', event: 'print_job.compose_failed', sessionId, details: { error: String(err) } });
    return NextResponse.json({ error: 'Gagal menyiapkan cetakan' }, { status: 500 });
  }

  const sheetPath = `sketches/${sessionId}/sheet.jpg`;
  const { error: upError } = await supabase.storage
    .from('sketches')
    .upload(sheetPath, sheet, { contentType: 'image/jpeg', upsert: true });
  if (upError) {
    log({ level: 'error', event: 'print_job.sheet_upload_failed', sessionId, details: { error: upError.message } });
    return NextResponse.json({ error: 'Gagal menyiapkan cetakan' }, { status: 500 });
  }

  const { data: printJob, error: jobError } = await supabase
    .from('print_jobs')
    .upsert(
      { session_id: sessionId, type: 'sketch', status: 'queued', asset_path: sheetPath },
      { onConflict: 'session_id,type', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (jobError) {
    log({ level: 'error', event: 'print_job.create_failed', sessionId, details: { error: jobError.message } });
    return NextResponse.json({ error: 'Gagal membuat antrian cetak' }, { status: 500 });
  }

  // ignoreDuplicates returns no row on conflict — fetch the winner
  let jobId = printJob?.id as string | undefined;
  if (!jobId) {
    const { data } = await supabase
      .from('print_jobs')
      .select('id')
      .eq('session_id', sessionId)
      .eq('type', 'sketch')
      .single();
    jobId = data?.id;
  }

  log({ level: 'info', event: 'print_job.created', sessionId, jobId, details: { type: 'sketch' } });
  return NextResponse.json({ printJobId: jobId });
}
