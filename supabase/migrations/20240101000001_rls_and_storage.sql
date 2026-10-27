-- =============================================================================
-- Migration: RLS policies for all tables
-- =============================================================================
--
-- SECURITY MODEL NOTES:
--
-- 1. PRINT STATION — scoped anon key with custom JWT claim:
--    The print station authenticates using the Supabase anon key. Its Supabase
--    JWT is augmented with the custom claim:
--        { "app_role": "print_station" }
--    This claim is injected via a Supabase Edge Function or a custom JWT hook
--    (e.g., auth.users metadata + pg_jwt). Policies below check this claim via
--        current_setting('request.jwt.claims', true)::jsonb->>'app_role'
--
-- 2. SERVICE ROLE KEY — server-side only:
--    The Supabase service role key MUST ONLY be used in:
--      - Next.js API routes (apps/web/app/api/**)
--      - The sketch worker route (apps/web/app/api/sketch/process)
--    It MUST NEVER be assigned to any NEXT_PUBLIC_* environment variable or
--    included in any client-accessible bundle. The service role bypasses RLS
--    entirely, so no policies are needed for server-side operations using it.
--
-- 3. ADMIN JWT:
--    Admins authenticate via POST /api/admin/verify-pin, which issues a
--    Supabase Auth JWT with the 'authenticated' role. Authenticated policies
--    below grant full access to admin-managed tables.
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sketch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_station_heartbeat ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- events table
-- ---------------------------------------------------------------------------
-- Service role: full access (bypasses RLS — no policy needed)
-- Authenticated (admin JWT): full access
-- Anon: SELECT only on active events

CREATE POLICY "events_anon_select_active" ON events
  FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY "events_authenticated_all" ON events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- frames table
-- ---------------------------------------------------------------------------
-- Service role: full access (bypasses RLS)
-- Authenticated: full access
-- Anon: SELECT only on active frames

CREATE POLICY "frames_anon_select_active" ON frames
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "frames_authenticated_all" ON frames
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- sessions table
-- ---------------------------------------------------------------------------
-- All session writes go through server-side API routes using the service role
-- key, which bypasses RLS. No anon access is needed or allowed.
-- Authenticated: full access (for admin operations).

CREATE POLICY "sessions_authenticated_all" ON sessions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- print_jobs table
-- ---------------------------------------------------------------------------
-- Print station (anon with app_role='print_station' claim): SELECT + UPDATE
-- Authenticated (admin/server API): full access

CREATE POLICY "print_jobs_print_station_select" ON print_jobs
  FOR SELECT TO anon
  USING (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' = 'print_station'
  );

CREATE POLICY "print_jobs_print_station_update" ON print_jobs
  FOR UPDATE TO anon
  USING (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' = 'print_station'
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' = 'print_station'
  );

CREATE POLICY "print_jobs_authenticated_all" ON print_jobs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- sketch_jobs table
-- ---------------------------------------------------------------------------
-- No anon access — all sketch job writes use the service role key server-side.
-- Authenticated: full access.

CREATE POLICY "sketch_jobs_authenticated_all" ON sketch_jobs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- prompt_templates table
-- ---------------------------------------------------------------------------
-- No anon access.
-- Authenticated: full access.

CREATE POLICY "prompt_templates_authenticated_all" ON prompt_templates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- admin_users table
-- ---------------------------------------------------------------------------
-- No anon access — PIN verification is performed exclusively server-side
-- and the pin_hash column is never returned to the client.
-- Authenticated: SELECT and UPDATE only (no INSERT/DELETE from client layer).

CREATE POLICY "admin_users_authenticated_select" ON admin_users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_users_authenticated_update" ON admin_users
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- print_station_heartbeat table
-- ---------------------------------------------------------------------------
-- Print station (anon with app_role='print_station'): INSERT/UPDATE (upsert).
-- Authenticated: SELECT (for admin dashboard heartbeat display).

CREATE POLICY "heartbeat_print_station_upsert" ON print_station_heartbeat
  FOR ALL TO anon
  USING (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' = 'print_station'
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' = 'print_station'
  );

CREATE POLICY "heartbeat_authenticated_select" ON print_station_heartbeat
  FOR SELECT TO authenticated
  USING (true);
