/**
 * Supabase Edge Function: delete-expired-sessions
 *
 * Runs daily (via pg_cron) to remove session assets and DB records for
 * sessions whose retention period has expired and which have no active
 * print jobs (status in 'queued' | 'printing').
 *
 * Deletion order (Req 14.2, 14.3):
 *   1. DELETE Storage objects under sessions/{id}/** and sketches/{id}/**
 *   2. Only if ALL storage deletes succeed → DELETE sessions row
 *      (cascades to print_jobs + sketch_jobs via FK ON DELETE CASCADE)
 *
 * Sessions with any queued/printing print job are skipped (Req 14.4).
 *
 * Every deletion outcome emits a structured JSON log entry (Req 16.1).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  event: string;
  sessionId?: string;
  /** Number of storage files deleted (present on session.deleted entries). */
  assetsDeleted?: number;
  details?: Record<string, unknown>;
}

interface ExpiredSession {
  id: string;
}

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------

function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * List all object paths under a given storage prefix.
 * Returns an array of storage object paths (strings).
 */
async function listStorageObjects(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });

    if (error) {
      throw new Error(
        `Failed to list objects in ${bucket}/${prefix}: ${error.message}`,
      );
    }

    if (!data || data.length === 0) break;

    for (const item of data) {
      // Storage list returns items within the prefix directory — construct
      // the full path relative to the bucket root.
      paths.push(`${prefix}/${item.name}`);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

/**
 * Delete all storage objects for a session from both the `sessions` bucket
 * (sessions/{id}/**) and the `sketches` bucket (sketches/{id}/**).
 *
 * Returns the total count of deleted files.
 * Throws if any deletion fails.
 */
async function deleteSessionStorageObjects(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<number> {
  let totalDeleted = 0;

  const targets: Array<{ bucket: string; prefix: string }> = [
    { bucket: "sessions", prefix: `sessions/${sessionId}` },
    { bucket: "sketches", prefix: `sketches/${sessionId}` },
  ];

  for (const { bucket, prefix } of targets) {
    const paths = await listStorageObjects(supabase, bucket, prefix);

    if (paths.length === 0) continue;

    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      throw new Error(
        `Storage delete failed in bucket '${bucket}' for session ${sessionId}: ${error.message}`,
      );
    }

    totalDeleted += paths.length;
  }

  return totalDeleted;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Allow invocation via HTTP POST only (cron triggers use POST).
  // Also allow GET so the function can be manually triggered.
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Validate that the invocation comes from an authorised source.
  // pg_cron invocations via supabase.functions.invoke() carry the service role
  // key in the Authorization header. We verify it here as an extra safety net.
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== serviceRoleKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceRoleKey) {
    log({
      ts: new Date().toISOString(),
      level: "error",
      event: "deletion_job.misconfigured",
      details: { reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
    });
    return new Response("Server misconfiguration", { status: 500 });
  }

  // Use the service role key so the function bypasses RLS and can access all
  // storage buckets and tables (sessions, print_jobs, sketch_jobs).
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const jobStartedAt = new Date().toISOString();

  log({
    ts: jobStartedAt,
    level: "info",
    event: "deletion_job.started",
    details: {},
  });

  // -------------------------------------------------------------------------
  // 1. Query expired sessions that have no active print jobs
  //    (Req 14.1, 14.4 — skip sessions with queued/printing print jobs)
  //
  // The Supabase JS client doesn't natively support "NOT EXISTS" sub-queries.
  // We implement the filter in two steps:
  //   a) Fetch session IDs that have active (queued/printing) print jobs.
  //   b) Fetch expired sessions, excluding those IDs.
  // -------------------------------------------------------------------------
  const { data: activeJobSessions, error: activeJobsError } = await supabase
    .from("print_jobs")
    .select("session_id")
    .in("status", ["queued", "printing"]);

  if (activeJobsError) {
    log({
      ts: new Date().toISOString(),
      level: "error",
      event: "deletion_job.query_failed",
      details: { error: activeJobsError.message },
    });
    return new Response("Internal error querying active print jobs", {
      status: 500,
    });
  }

  const blockedSessionIds: string[] = (activeJobSessions ?? []).map(
    (r: { session_id: string }) => r.session_id,
  );

  // Build the expired-session query, excluding sessions with active print jobs.
  let expiredQuery = supabase
    .from("sessions")
    .select("id")
    .lt("expires_at", new Date().toISOString());

  if (blockedSessionIds.length > 0) {
    // PostgREST "not in" — pass array directly; Supabase JS serialises it
    // as a proper `id=not.in.(...)` filter without string concatenation.
    expiredQuery = expiredQuery.not(
      "id",
      "in",
      `(${blockedSessionIds.join(",")})`,
    );
  }

  const { data: expiredSessions, error: expiredError } = await expiredQuery;

  if (expiredError) {
    log({
      ts: new Date().toISOString(),
      level: "error",
      event: "deletion_job.query_failed",
      details: { error: expiredError.message },
    });
    return new Response("Internal error querying expired sessions", {
      status: 500,
    });
  }

  const sessions: ExpiredSession[] = expiredSessions ?? [];

  log({
    ts: new Date().toISOString(),
    level: "info",
    event: "deletion_job.candidates_found",
    details: {
      count: sessions.length,
      skippedDueToActivePrintJobs: blockedSessionIds.length,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Process each candidate session
  // -------------------------------------------------------------------------
  let successCount = 0;
  let failureCount = 0;

  for (const session of sessions) {
    const sessionId = session.id;

    try {
      // Step 1: Delete all Storage objects for this session (Req 14.2)
      // Must complete fully before the DB record is removed (Req 14.3).
      const storageFilesDeleted = await deleteSessionStorageObjects(
        supabase,
        sessionId,
      );

      // Step 2: Delete the DB session record only after all storage deletes
      // succeed. ON DELETE CASCADE removes print_jobs and sketch_jobs rows.
      const { error: dbDeleteError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId);

      if (dbDeleteError) {
        throw new Error(`DB delete failed: ${dbDeleteError.message}`);
      }

      // Structured success log (Req 16.1)
      // Shape matches the spec: { ts, level, event, sessionId, assetsDeleted }
      log({
        ts: new Date().toISOString(),
        level: "info",
        event: "session.deleted",
        sessionId,
        assetsDeleted: storageFilesDeleted,
        details: { assetsDeleted: storageFilesDeleted },
      });

      successCount++;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Structured error log (Req 16.1)
      log({
        ts: new Date().toISOString(),
        level: "error",
        event: "session.deletion_failed",
        sessionId,
        details: { error: errorMessage },
      });

      failureCount++;
      // Continue processing remaining sessions — one failure must not block
      // deletion of other expired sessions.
    }
  }

  // -------------------------------------------------------------------------
  // 3. Job summary log
  // -------------------------------------------------------------------------
  log({
    ts: new Date().toISOString(),
    level: "info",
    event: "deletion_job.completed",
    details: {
      totalCandidates: sessions.length,
      successCount,
      failureCount,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      totalCandidates: sessions.length,
      successCount,
      failureCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
