// =============================================================================
// Local SQLite Job Queue — offline-resilient backup for print jobs
// Uses better-sqlite3 (synchronous API) so no async/await needed.
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalJob {
  id: string;
  session_id: string;
  type: 'strip' | 'sketch';
  status: 'queued' | 'printing' | 'printed' | 'failed';
  asset_path: string | null;
  error_reason: string | null;
  /** Unix epoch milliseconds */
  created_at: number;
  /** Unix epoch milliseconds */
  updated_at: number;
}

// ── Module-level database handle ─────────────────────────────────────────────

let db: Database.Database | null = null;

// ── Schema ────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS local_jobs (
    id           TEXT    PRIMARY KEY,
    session_id   TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    status       TEXT    NOT NULL,
    asset_path   TEXT,
    error_reason TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
`;

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Opens (or creates) the SQLite database and ensures the schema exists.
 * Call once from the main process during app startup.
 *
 * @param dbPath - Absolute path to the .db file. Defaults to the Electron
 *   userData directory when `app` is available, otherwise the process cwd.
 */
export function initLocalQueue(dbPath?: string): void {
  let resolvedPath: string;

  if (dbPath) {
    resolvedPath = dbPath;
  } else {
    // Lazy-import to allow the module to be used outside Electron (tests etc.)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron') as { app: Electron.App };
      resolvedPath = path.join(app.getPath('userData'), 'print-jobs.db');
    } catch {
      resolvedPath = path.join(process.cwd(), 'print-jobs.db');
    }
  }

  db = new Database(resolvedPath);
  db.exec(CREATE_TABLE_SQL);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDb(): Database.Database {
  if (!db) {
    throw new Error('Local queue not initialised. Call initLocalQueue() first.');
  }
  return db;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inserts or replaces a job record. All fields are replaced on conflict.
 */
export function upsertJob(job: LocalJob): void {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO local_jobs
      (id, session_id, type, status, asset_path, error_reason, created_at, updated_at)
    VALUES
      (@id, @session_id, @type, @status, @asset_path, @error_reason, @created_at, @updated_at)
  `);
  stmt.run(job);
}

/**
 * Updates the status (and optionally error_reason) of a job by id.
 * Always stamps updated_at with the current time.
 */
export function updateJobStatus(
  id: string,
  status: LocalJob['status'],
  errorReason?: string | null,
): void {
  const stmt = getDb().prepare(`
    UPDATE local_jobs
    SET status = @status,
        error_reason = @error_reason,
        updated_at = @updated_at
    WHERE id = @id
  `);
  stmt.run({ id, status, error_reason: errorReason ?? null, updated_at: Date.now() });
}

/**
 * Returns a single job by id, or undefined if not found.
 */
export function getJob(id: string): LocalJob | undefined {
  const stmt = getDb().prepare('SELECT * FROM local_jobs WHERE id = ?');
  return stmt.get(id) as LocalJob | undefined;
}

/**
 * Returns the most recent jobs ordered by created_at descending.
 * @param limit - Maximum number of rows to return (default 20).
 */
export function getRecentJobs(limit = 20): LocalJob[] {
  const stmt = getDb().prepare(
    'SELECT * FROM local_jobs ORDER BY created_at DESC LIMIT ?',
  );
  return stmt.all(limit) as LocalJob[];
}

/**
 * Returns all jobs currently in the 'queued' state.
 */
export function getAllQueuedJobs(): LocalJob[] {
  const stmt = getDb().prepare(
    "SELECT * FROM local_jobs WHERE status = 'queued' ORDER BY created_at ASC",
  );
  return stmt.all() as LocalJob[];
}
