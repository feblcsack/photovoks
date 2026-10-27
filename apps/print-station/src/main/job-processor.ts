// =============================================================================
// Job Processor — Supabase Realtime subscription, atomic claim, print lifecycle
//
// Responsibilities (Tasks 14.1, 14.3, 14.7):
//   14.1 — Supabase client, Realtime subscription (queued jobs), atomic claim,
//           polling fallback every 10 s when Realtime is dropped
//   14.3 — Full job lifecycle: download → print → status update; error routing
//           per PrintError type; local SQLite persistence throughout
//   14.7 — 30 s heartbeat UPSERT; Realtime reconnection with exponential
//           backoff; IPC job-update events to renderer on every status change
// =============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';

import Store from 'electron-store';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

import { driver } from '../drivers/index';
import type { PrintError } from '../drivers/interface';
import {
  upsertJob,
  updateJobStatus,
  getRecentJobs,
  type LocalJob,
} from './local-queue';
import { emit } from './logger';

// ── Config store ──────────────────────────────────────────────────────────────

interface StationConfig {
  printerName: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const store = new Store<StationConfig>({
  defaults: { printerName: '', supabaseUrl: '', supabaseKey: '' },
});

// ── Supabase row type for print_jobs ──────────────────────────────────────────

interface PrintJobRow {
  id: string;
  session_id: string;
  type: 'strip' | 'sketch';
  status: 'queued' | 'printing' | 'printed' | 'failed' | 'cancelled' | 'cancel_failed';
  asset_path: string | null;
  error_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ── Module state ──────────────────────────────────────────────────────────────

let supabase: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Reconnect attempt counter (reset on successful subscription). */
let reconnectAttempt = 0;

/** Whether Realtime is currently connected and active. */
let realtimeConnected = false;

/** Whether the processor has been started. */
let started = false;

/** Broadcast callback injected from main/index.ts. */
type BroadcastFn = (payload: {
  jobs: ReturnType<typeof getRecentJobs>;
  printerStatus: 'online' | 'offline' | 'error' | 'unknown';
  stationOnline: boolean;
}) => void;

let broadcastFn: BroadcastFn = () => { /* no-op until wired */ };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sets the IPC broadcast function that sends job-update events to the renderer.
 * Must be called before startJobProcessor().
 */
export function setBroadcastFn(fn: BroadcastFn): void {
  broadcastFn = fn;
}

/**
 * Initialises the Supabase client, starts the Realtime subscription,
 * starts the heartbeat, and begins polling fallback. Safe to call once.
 */
export async function startJobProcessor(): Promise<void> {
  if (started) return;
  started = true;

  const supabaseUrl = store.get('supabaseUrl');
  const supabaseKey = store.get('supabaseKey');

  if (!supabaseUrl || !supabaseKey) {
    emit({
      level: 'warn',
      event: 'job_processor.unconfigured',
      details: { message: 'Supabase URL or key not configured; job processor paused.' },
    });
    startHeartbeat();
    return;
  }

  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  emit({
    level: 'info',
    event: 'job_processor.started',
    details: { supabaseUrl },
  });

  await subscribeRealtime();
  startHeartbeat();
  startPollingFallback();
}

/**
 * Gracefully stops all timers and unsubscribes from Realtime.
 * Call on app quit.
 */
export async function stopJobProcessor(): Promise<void> {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  if (realtimeChannel && supabase) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  started = false;
  realtimeConnected = false;
}

/**
 * Re-queues a failed or printed job back to 'queued' so it gets picked up again.
 * Exposed for the manual reprint IPC handler.
 */
export async function requeueJob(jobId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'queued', error_reason: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['failed', 'printed', 'queued'])
    .select('id');

  if (error) {
    emit({
      level: 'error',
      event: 'print_job.requeue_error',
      jobId,
      details: { message: error.message },
    });
    return false;
  }

  const requeued = Array.isArray(data) && data.length === 1;
  if (requeued) {
    updateJobStatus(jobId, 'queued');
    emit({ level: 'info', event: 'print_job.requeued', jobId });
    broadcastStatus();
  }

  return requeued;
}

/**
 * Re-initialises the processor when the user saves new config.
 * Tears down the existing connection and restarts cleanly.
 */
export async function restartJobProcessor(): Promise<void> {
  await stopJobProcessor();
  reconnectAttempt = 0;
  await startJobProcessor();
}

// ── Realtime subscription (Task 14.1) ─────────────────────────────────────────

async function subscribeRealtime(): Promise<void> {
  if (!supabase) return;

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel('print_jobs_queued')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'print_jobs',
        filter: 'status=eq.queued',
      },
      (payload) => {
        const row = payload.new as PrintJobRow;
        emit({
          level: 'info',
          event: 'realtime.job_received',
          jobId: row.id,
          sessionId: row.session_id,
        });
        void handleIncomingJob(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'print_jobs',
        filter: 'status=eq.queued',
      },
      (payload) => {
        const row = payload.new as PrintJobRow;
        void handleIncomingJob(row);
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        realtimeConnected = true;
        reconnectAttempt = 0;
        emit({
          level: 'info',
          event: 'realtime.subscribed',
        });
        broadcastStatus();
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        realtimeConnected = false;
        emit({
          level: 'warn',
          event: 'realtime.disconnected',
          details: { status, error: (err as Error | undefined)?.message },
        });
        broadcastStatus();
        scheduleReconnect();
      }
    });
}

/**
 * Schedules a reconnect attempt with exponential backoff.
 * After 5 failed attempts, forces a full re-subscription.
 * Backoff: Math.min(2000 * 2**attempt, 60000) ms.
 */
function scheduleReconnect(): void {
  reconnectAttempt++;
  const delayMs = Math.min(2000 * Math.pow(2, reconnectAttempt - 1), 60_000);

  emit({
    level: 'info',
    event: 'realtime.reconnect_scheduled',
    details: { attempt: reconnectAttempt, delayMs },
  });

  setTimeout(async () => {
    if (realtimeConnected) return; // already recovered

    emit({
      level: reconnectAttempt >= 5 ? 'warn' : 'info',
      event: reconnectAttempt >= 5
        ? 'realtime.force_resubscribe'
        : 'realtime.reconnecting',
      details: { attempt: reconnectAttempt },
    });

    if (reconnectAttempt >= 5) {
      reconnectAttempt = 0;
    }

    await subscribeRealtime();
  }, delayMs);
}

// ── Polling fallback (Task 14.1) ──────────────────────────────────────────────

function startPollingFallback(): void {
  if (pollingTimer) return;

  pollingTimer = setInterval(async () => {
    if (realtimeConnected) return;

    emit({
      level: 'info',
      event: 'polling.fallback_tick',
    });

    await pollQueuedJobs();
  }, 10_000);
}

async function pollQueuedJobs(): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });

  if (error) {
    emit({
      level: 'error',
      event: 'polling.fetch_error',
      details: { message: error.message },
    });
    return;
  }

  for (const row of (data ?? []) as PrintJobRow[]) {
    await handleIncomingJob(row);
  }
}

// ── Heartbeat (Task 14.7) ─────────────────────────────────────────────────────

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  void upsertHeartbeat();
  heartbeatTimer = setInterval(() => void upsertHeartbeat(), 30_000);
}

async function upsertHeartbeat(): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('print_station_heartbeat')
    .upsert({ id: 1, last_seen: new Date().toISOString() }, { onConflict: 'id' });

  if (error) {
    emit({
      level: 'warn',
      event: 'heartbeat.upsert_error',
      details: { message: error.message },
    });
  } else {
    emit({
      level: 'info',
      event: 'heartbeat.sent',
    });
  }

  broadcastStatus();
}

// ── Broadcast helpers (Task 14.7) ─────────────────────────────────────────────

async function detectPrinterStatus(): Promise<'online' | 'offline' | 'error' | 'unknown'> {
  try {
    const available = await driver.isAvailable();
    return available ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

function broadcastStatus(): void {
  void (async () => {
    const printerStatus = await detectPrinterStatus();
    const jobs = getRecentJobs(20);
    broadcastFn({ jobs, printerStatus, stationOnline: realtimeConnected });
  })();
}

// ── Atomic claim (Task 14.1) ──────────────────────────────────────────────────

/**
 * Atomically transitions a print job from 'queued' -> 'printing'.
 * Returns true only if exactly one row was updated (this station won the claim).
 */
async function claimJob(jobId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'printing', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id');

  if (error) {
    emit({
      level: 'error',
      event: 'print_job.claim_error',
      jobId,
      details: { message: error.message },
    });
    return false;
  }

  const claimed = Array.isArray(data) && data.length === 1;
  if (claimed) {
    emit({
      level: 'info',
      event: 'print_job.claimed',
      jobId,
    });
  }
  return claimed;
}

// ── Job lifecycle (Tasks 14.1, 14.3) ─────────────────────────────────────────

/** Job IDs currently being processed — prevents concurrent re-entry. */
const inFlight = new Set<string>();

async function handleIncomingJob(row: PrintJobRow): Promise<void> {
  if (inFlight.has(row.id)) return;

  // Persist immediately to local SQLite for offline resilience
  const localJob: LocalJob = {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    status: 'queued',
    asset_path: row.asset_path,
    error_reason: null,
    created_at: new Date(row.created_at).getTime(),
    updated_at: new Date(row.updated_at).getTime(),
  };
  upsertJob(localJob);

  inFlight.add(row.id);
  try {
    await processJob(row);
  } finally {
    inFlight.delete(row.id);
  }
}

/**
 * Full job lifecycle:
 *   1. Atomic claim
 *   2. Download asset to temp file
 *   3. Print via driver
 *   4. Update status: printed / re-queued (transient) / failed (permanent)
 *   5. Sync local SQLite and broadcast IPC on every transition
 *
 * Handles both strip and sketch print jobs identically at the driver level.
 * Sketch jobs may arrive hours after the session; their arrival is driven by
 * an explicit visitor "Request Print" action on the Session Page (Req 12.4).
 * Session status is updated on sketch job completion to drive Realtime updates
 * on the Session Page (Req 9.6).
 */
async function processJob(row: PrintJobRow): Promise<void> {
  const { id: jobId, session_id: sessionId, type: jobType } = row;
  const printerName = store.get('printerName');

  // 1. Atomic claim
  const claimed = await claimJob(jobId);
  if (!claimed) return; // another station claimed it

  updateJobStatus(jobId, 'printing');
  emit({
    level: 'info',
    event: 'print_job.printing',
    jobId,
    sessionId,
    details: { type: jobType },
  });

  // Update session status to 'printing' when a strip job starts (not sketch —
  // strip already drove the session to this state; sketch arrives independently).
  if (jobType === 'strip') {
    await patchSessionStatus(sessionId, 'printing');
  }

  broadcastStatus();

  // 2. Validate asset path
  if (!row.asset_path) {
    emit({
      level: 'error',
      event: 'print_job.no_asset',
      jobId,
      sessionId,
      details: { type: jobType },
    });
    await failJob(jobId, sessionId, 'no_asset_path');
    return;
  }

  // 3. Download asset
  let tempFilePath = '';
  try {
    tempFilePath = await downloadAsset(jobId, sessionId, row.asset_path);
  } catch (err) {
    emit({
      level: 'error',
      event: 'print_job.download_failed',
      jobId,
      sessionId,
      details: { type: jobType, message: (err as Error).message },
    });
    await failJob(jobId, sessionId, 'download_failed');
    return;
  }

  // 4. Print
  try {
    if (!printerName) {
      const offlineError: PrintError = { type: 'offline' };
      throw Object.assign(new Error('No printer configured'), {
        printError: offlineError,
      });
    }

    await driver.print(tempFilePath, printerName);

    // Success
    await patchJobStatus(jobId, 'printed', null);
    updateJobStatus(jobId, 'printed');

    emit({
      level: 'info',
      event: 'print_job.printed',
      jobId,
      sessionId,
      details: { type: jobType },
    });

    // Update session status on successful print.
    //
    // Strip job → 'printed': the session's strip is physically in-hand.
    // Sketch job → 'completed': visitor has received both strip and sketch card.
    //   Only transition to 'completed' if the session is already 'printed'
    //   (meaning the strip was successfully printed before the sketch request).
    //   This guards against racing with the strip flow and avoids regressing
    //   the status from a more advanced state.
    if (jobType === 'strip') {
      await patchSessionStatus(sessionId, 'printed');
    } else if (jobType === 'sketch') {
      await patchSessionStatusIfCurrent(sessionId, 'printed', 'completed');
    }
  } catch (err) {
    const printError = (err as { printError?: PrintError }).printError ?? null;
    const rawMessage = (err as Error).message ?? 'unknown';
    const detected: PrintError | null = printError ?? driver.detectError(rawMessage);

    emit({
      level: 'error',
      event: 'print_job.print_failed',
      jobId,
      sessionId,
      details: { type: jobType, errorType: detected?.type ?? 'unknown', message: rawMessage },
    });

    if (detected) {
      await handlePrintError(jobId, sessionId, detected);
    } else {
      await failJob(jobId, sessionId, rawMessage);
    }
  } finally {
    cleanupTempFile(tempFilePath);
  }

  broadcastStatus();
}

/** Routes a structured PrintError to the correct job status transition. */
async function handlePrintError(
  jobId: string,
  sessionId: string,
  error: PrintError,
): Promise<void> {
  switch (error.type) {
    // Transient: paper-out or ink-out — re-queue for retry once resolved
    case 'paper_out':
    case 'ink_out':
      emit({
        level: 'warn',
        event: 'print_job.transient_error_requeued',
        jobId,
        sessionId,
        details: { errorType: error.type },
      });
      await patchJobStatus(jobId, 'queued', null);
      updateJobStatus(jobId, 'queued');
      break;

    // Permanent: paper jam — no auto-retry, operator must intervene
    case 'paper_jam':
      emit({
        level: 'error',
        event: 'print_job.paper_jam',
        jobId,
        sessionId,
      });
      await patchJobStatus(jobId, 'failed', 'paper_jam');
      updateJobStatus(jobId, 'failed', 'paper_jam');
      break;

    // Printer offline — transient, re-queue
    case 'offline':
      emit({
        level: 'warn',
        event: 'print_job.printer_offline_requeued',
        jobId,
        sessionId,
      });
      await patchJobStatus(jobId, 'queued', null);
      updateJobStatus(jobId, 'queued');
      break;

    // Unknown — permanent failure
    default: {
      const unknownError = error as PrintError & { type: 'unknown' };
      const message =
        unknownError.type === 'unknown' ? unknownError.message : String((error as { type: string }).type);
      await failJob(jobId, sessionId, message);
    }
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

async function patchJobStatus(
  jobId: string,
  status: LocalJob['status'],
  errorReason: string | null,
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('print_jobs')
    .update({
      status,
      error_reason: errorReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    emit({
      level: 'error',
      event: 'print_job.patch_error',
      jobId,
      details: { status, message: error.message },
    });
  }
}

/**
 * Updates sessions.status unconditionally.
 * Used for strip job lifecycle milestones (printing, printed).
 */
async function patchSessionStatus(
  sessionId: string,
  status: string,
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('sessions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    emit({
      level: 'warn',
      event: 'session.status_update_failed',
      sessionId,
      details: { targetStatus: status, message: error.message },
    });
  } else {
    emit({
      level: 'info',
      event: 'session.status_updated',
      sessionId,
      details: { status },
    });
  }
}

/**
 * Conditionally updates sessions.status only if it currently equals
 * `expectedCurrentStatus`. Used for sketch job completion to advance
 * a 'printed' session to 'completed' without racing the strip flow.
 */
async function patchSessionStatusIfCurrent(
  sessionId: string,
  expectedCurrentStatus: string,
  newStatus: string,
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('sessions')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', expectedCurrentStatus);

  if (error) {
    emit({
      level: 'warn',
      event: 'session.status_update_failed',
      sessionId,
      details: { expectedCurrentStatus, newStatus, message: error.message },
    });
  } else {
    emit({
      level: 'info',
      event: 'session.status_updated',
      sessionId,
      details: { status: newStatus },
    });
  }
}

async function failJob(
  jobId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  await patchJobStatus(jobId, 'failed', reason);
  updateJobStatus(jobId, 'failed', reason);

  emit({
    level: 'error',
    event: 'print_job.failed',
    jobId,
    sessionId,
    details: { reason },
  });

  broadcastStatus();
}

// ── Asset download (Task 14.3) ────────────────────────────────────────────────

/**
 * Downloads the asset at `assetPath` (Supabase Storage path) to a temp file.
 * Uses a signed URL fetched via the Supabase client for secure access.
 * Retries up to 3 times with a 1 s delay between attempts.
 */
async function downloadAsset(
  jobId: string,
  sessionId: string,
  assetPath: string,
): Promise<string> {
  if (!supabase) throw new Error('Supabase client not initialised');

  // Determine bucket from path prefix
  const bucket = assetPath.startsWith('sketches/') ? 'sketches' : 'sessions';
  const objectPath = assetPath.replace(/^(sessions|sketches)\//, '');

  const maxAttempts = 3;
  let lastError: Error = new Error('Unknown download error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Generate a short-lived signed URL (60 s is sufficient for download)
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from(bucket)
        .createSignedUrl(objectPath, 60);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(signedError?.message ?? 'Failed to create signed URL');
      }

      const ext = path.extname(assetPath) || '.jpg';
      const tempFile = path.join(os.tmpdir(), `photovoks-${jobId}${ext}`);

      // Fetch asset using Node.js native fetch (requires Node 18+)
      const response = await fetch(signedData.signedUrl);
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Stream to disk
      const writeStream = fs.createWriteStream(tempFile);
      const reader = response.body.getReader();

      await new Promise<void>((resolve, reject) => {
        function pump(): void {
          reader.read().then(({ done, value }) => {
            if (done) {
              writeStream.end();
              writeStream.once('finish', resolve);
              writeStream.once('error', reject);
              return;
            }
            if (!writeStream.write(value)) {
              writeStream.once('drain', pump);
            } else {
              pump();
            }
          }).catch(reject);
        }
        pump();
      });

      emit({
        level: 'info',
        event: 'print_job.asset_downloaded',
        jobId,
        sessionId,
        details: { attempt, tempFile },
      });

      return tempFile;
    } catch (err) {
      lastError = err as Error;
      emit({
        level: 'warn',
        event: 'print_job.download_attempt_failed',
        jobId,
        sessionId,
        details: { attempt, message: lastError.message },
      });

      if (attempt < maxAttempts) {
        await sleep(1_000);
      }
    }
  }

  throw lastError;
}

function cleanupTempFile(filePath: string): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup; ignore errors
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
