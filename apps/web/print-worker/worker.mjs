// =============================================================================
// Photovoks print worker
//
// Replaces the old Electron "print-station" app. It is plain Node.js (no
// native modules, no build step) and runs in one of two ways:
//
//   1. Automatically inside the web server (`pnpm booth`) when PRINTER_NAME is
//      set — see instrumentation.ts. One command runs everything.
//   2. Standalone (`pnpm print`) on the laptop wired to the printer, when the
//      web app is hosted elsewhere (e.g. Vercel).
//
// Loop: heartbeat every 20 s → poll `print_jobs` for status=queued → claim
// atomically (queued→printing) → download asset → send to printer → mark
// printed/failed.
//
// PRINTER_NAME=dry-run saves the files to ./print-output instead of printing.
// =============================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);

const POLL_MS = 2_500;
const HEARTBEAT_MS = 20_000;
const STALE_PRINTING_MS = 5 * 60_000;
const DRY_RUN = 'dry-run';

/** @param {string} level @param {string} event @param {Record<string, unknown>} [details] */
function log(level, event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, source: 'print-worker', ...details }));
}

// ── Printer drivers ───────────────────────────────────────────────────────────

/** Lists printers installed on this computer. */
export async function listPrinters() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Get-Printer | Select-Object -ExpandProperty Name',
      ]);
      return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
    const { stdout } = await execFileAsync('lpstat', ['-a']);
    return stdout
      .split('\n')
      .map((l) => l.trim().split(' ')[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function detectPrinterError(output) {
  const lower = String(output || '').toLowerCase();
  if (lower.includes('paper-out') || lower.includes('out of paper')) return 'paper_out';
  if (lower.includes('jam')) return 'paper_jam';
  if (lower.includes('ink') || lower.includes('toner') || lower.includes('ribbon')) return 'ink_out';
  if (lower.includes('offline') || lower.includes('not exist') || lower.includes('unknown printer')) return 'offline';
  return null;
}

async function findSumatra() {
  const candidates = [
    process.env.SUMATRA_PATH,
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Sends an image file to the printer. Uses execFile with argument arrays —
 * never a shell — so file/printer names cannot inject commands.
 */
async function printFile(filePath, printerName) {
  if (printerName === DRY_RUN) {
    const outDir = path.resolve(process.cwd(), 'print-output');
    await fs.mkdir(outDir, { recursive: true });
    await fs.copyFile(filePath, path.join(outDir, path.basename(filePath)));
    return;
  }

  if (process.platform === 'win32') {
    const sumatra = await findSumatra();
    if (sumatra) {
      await execFileAsync(sumatra, ['-silent', '-print-to', printerName, '-print-settings', 'fit', filePath]);
    } else {
      // Built-in fallback: Paint can print an image to a named printer.
      await execFileAsync('mspaint.exe', ['/pt', filePath, printerName]);
    }
    return;
  }

  const media = process.env.PRINT_MEDIA || '4x6';
  const args = ['-d', printerName, '-o', `media=${media}`, '-o', 'fit-to-page'];
  for (const opt of (process.env.PRINT_LP_OPTIONS || '').split(/\s+/).filter(Boolean)) {
    args.push('-o', opt);
  }
  args.push(filePath);
  const { stderr } = await execFileAsync('lp', args);
  const err = detectPrinterError(stderr);
  if (err) throw Object.assign(new Error(err), { reason: err });
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * @param {{ supabaseUrl: string, serviceKey: string, printerName: string, stationId?: string }} opts
 * @returns {{ stop: () => void }}
 */
export function startPrintWorker(opts) {
  const { supabaseUrl, serviceKey, printerName } = opts;
  const stationId = opts.stationId || os.hostname();
  if (!supabaseUrl || !serviceKey || !printerName) {
    throw new Error('print worker needs SUPABASE URL, SUPABASE_SERVICE_ROLE_KEY and PRINTER_NAME');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let busy = false;
  let stopped = false;

  async function heartbeat() {
    const { error } = await supabase
      .from('print_station_heartbeat')
      .upsert({ station_id: stationId, last_seen_at: new Date().toISOString() }, { onConflict: 'station_id' });
    if (error) log('warn', 'heartbeat.failed', { message: error.message });
  }

  /** Jobs left in `printing` by a crash are marked failed (admin can reprint). */
  async function recoverStale() {
    const cutoff = new Date(Date.now() - STALE_PRINTING_MS).toISOString();
    const { data } = await supabase
      .from('print_jobs')
      .update({ status: 'failed', error_reason: 'interrupted' })
      .eq('status', 'printing')
      .lt('updated_at', cutoff)
      .select('id');
    if (data?.length) log('warn', 'print_job.recovered_stale', { count: data.length });
  }

  async function setJob(id, status, errorReason = null) {
    await supabase.from('print_jobs').update({ status, error_reason: errorReason }).eq('id', id);
  }

  async function processOne() {
    const { data: next } = await supabase
      .from('print_jobs')
      .select('id, session_id, type, asset_path')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) return false;

    // Atomic claim — only one worker can move queued → printing.
    const { data: claimed } = await supabase
      .from('print_jobs')
      .update({ status: 'printing', error_reason: null })
      .eq('id', next.id)
      .eq('status', 'queued')
      .select('id, session_id, type, asset_path')
      .maybeSingle();
    if (!claimed) return true; // someone else got it; look again

    log('info', 'print_job.claimed', { jobId: claimed.id, type: claimed.type });

    const assetPath = claimed.asset_path;
    if (!assetPath || !/^(sessions|sketches)\/[\w-]+\/[\w./-]+$/.test(assetPath) || assetPath.includes('..')) {
      await setJob(claimed.id, 'failed', 'invalid_asset_path');
      return true;
    }

    const bucket = assetPath.split('/')[0];
    const tmpFile = path.join(os.tmpdir(), `photovoks-${claimed.id}${path.extname(assetPath) || '.jpg'}`);

    try {
      const { data: blob, error } = await supabase.storage.from(bucket).download(assetPath);
      if (error || !blob) throw Object.assign(new Error(error?.message || 'download failed'), { reason: 'download_failed' });
      await fs.writeFile(tmpFile, Buffer.from(await blob.arrayBuffer()));

      await printFile(tmpFile, printerName);

      await setJob(claimed.id, 'printed');
      if (claimed.type === 'strip') {
        await supabase.from('sessions').update({ status: 'printed' }).eq('id', claimed.session_id);
      }
      log('info', 'print_job.printed', { jobId: claimed.id, type: claimed.type, printer: printerName });
    } catch (err) {
      const reason = err?.reason || 'print_failed';
      log('error', 'print_job.failed', { jobId: claimed.id, reason, message: err?.message });
      await setJob(claimed.id, 'failed', reason);
    } finally {
      fs.unlink(tmpFile).catch(() => {});
    }
    return true;
  }

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      // Drain the queue, one job at a time.
      while (!stopped && (await processOne())) {
        /* keep going */
      }
    } catch (err) {
      log('error', 'print_worker.tick_failed', { message: err?.message });
    } finally {
      busy = false;
    }
  }

  void heartbeat();
  void recoverStale();
  const hb = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  const poll = setInterval(() => void tick(), POLL_MS);
  void tick();

  log('info', 'print_worker.started', { printer: printerName, stationId });

  return {
    stop() {
      stopped = true;
      clearInterval(hb);
      clearInterval(poll);
    },
  };
}
