/**
 * Shared structured logger for all server-side Next.js routes.
 *
 * Every entry is emitted as a single-line JSON object compatible with
 * log aggregation pipelines (Vercel Logs, Datadog, etc.).
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4
 */

export interface LogEntry {
  /** ISO 8601 timestamp, always populated by log(). */
  ts?: string;
  level: 'info' | 'warn' | 'error';
  /** Dot-namespaced event name, e.g. "session.created", "print_job.claimed". */
  event: string;
  sessionId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

/**
 * Emits a structured JSON log line.
 * `ts` is injected automatically if not provided.
 */
export function log(entry: LogEntry): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}
