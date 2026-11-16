-- =============================================================================
-- Migration: security hardening
--
-- 1. The Electron print station was replaced by the print worker, which runs
--    server-side with the service-role key. The anon "print_station" policies
--    are no longer needed, so anon gets NO access to print jobs / heartbeat.
-- 2. Realtime is no longer used by the browser (status is polled through
--    token-checked API routes), so these tables leave the publication.
-- 3. Visitors' photos: sessions/sketches buckets stay private; only signed
--    URLs generated server-side can read or write them.
-- =============================================================================

DROP POLICY IF EXISTS "print_jobs_print_station_select" ON print_jobs;
DROP POLICY IF EXISTS "print_jobs_print_station_update" ON print_jobs;
DROP POLICY IF EXISTS "heartbeat_print_station_upsert" ON print_station_heartbeat;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE sessions;    EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE print_jobs;  EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE sketch_jobs; EXCEPTION WHEN others THEN NULL; END;
END;
$$;

-- Faster daily-cap counting for the AI doodle
CREATE INDEX IF NOT EXISTS idx_sketch_jobs_status_updated ON sketch_jobs (status, updated_at);
