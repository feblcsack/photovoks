/**
 * Shared structured logger for the Electron print station main process.
 *
 * Wraps electron-log so entries are written both to the console and to
 * the platform log file, while preserving the same JSON schema used by
 * the web app's logger (apps/web/lib/logger.ts).
 *
 * Requirements: 16.2
 */

import log from 'electron-log';

export interface LogEntry {
  /** ISO 8601 timestamp, always populated by emit(). */
  ts?: string;
  level: 'info' | 'warn' | 'error';
  /** Dot-namespaced event name, e.g. "print_job.claimed", "print_job.printed". */
  event: string;
  sessionId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

/**
 * Emits a structured JSON log line via electron-log.
 * `ts` is injected automatically if not provided.
 */
export function emit(entry: LogEntry): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  switch (entry.level) {
    case 'info':  log.info(line);  break;
    case 'warn':  log.warn(line);  break;
    case 'error': log.error(line); break;
  }
}
