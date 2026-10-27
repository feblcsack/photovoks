-- =============================================================================
-- Migration: Schedule daily deletion job for expired sessions
-- =============================================================================
--
-- Uses pg_cron (enabled by default on Supabase) to invoke the
-- `delete-expired-sessions` Edge Function every day at 02:00 UTC.
--
-- The job calls the Edge Function via net.http_post() (provided by the
-- pg_net extension, which is enabled on all Supabase projects).
--
-- Environment note:
--   Replace '<PROJECT_REF>' below with your actual Supabase project reference
--   (the subdomain of your Supabase project URL, e.g. 'abcdefghijklmnop').
--   The SUPABASE_SERVICE_ROLE_KEY value must be set as a Supabase Vault secret
--   and referenced here, or substituted at deploy time.
--
--   Recommended approach: store the service role key in Supabase Vault as
--   `service_role_key` and reference it via `vault.decrypted_secrets`.
--
-- =============================================================================

-- Enable required extensions (safe to run if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ---------------------------------------------------------------------------
-- Helper function: invoke the delete-expired-sessions Edge Function
-- ---------------------------------------------------------------------------
-- This function is called by pg_cron on the schedule below.
-- It reads the service role key from the Supabase Vault so the raw key
-- value never appears in plain text in the migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoke_delete_expired_sessions()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  _project_ref  text;
  _service_role text;
  _function_url text;
BEGIN
  -- Read project reference from a database setting (set once at deploy time):
  --   ALTER DATABASE postgres SET app.supabase_project_ref = '<PROJECT_REF>';
  -- Falls back to an empty string if not configured — the Edge Function URL
  -- will be invalid and the request will fail with a clear network error.
  _project_ref  := current_setting('app.supabase_project_ref', true);

  -- Read the service role key from Supabase Vault.
  -- The secret must be added via the Supabase Dashboard → Vault, or via:
  --   SELECT vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
  SELECT decrypted_secret
    INTO _service_role
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF _service_role IS NULL THEN
    RAISE WARNING 'invoke_delete_expired_sessions: service_role_key not found in Vault; skipping invocation';
    RETURN;
  END IF;

  _function_url := 'https://' || _project_ref || '.supabase.co/functions/v1/delete-expired-sessions';

  -- pg_net sends a fire-and-forget HTTP request; errors are recorded in
  -- net._http_response and do not raise exceptions here.
  PERFORM net.http_post(
    url     := _function_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _service_role
               ),
    body    := '{}'::jsonb
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- Schedule: run daily at 02:00 UTC
-- ---------------------------------------------------------------------------
-- Uses the pg_cron cron.schedule() API.
-- Job name is unique — re-running this migration is safe (cron.schedule
-- with the same name updates the existing entry rather than creating a
-- duplicate).
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'delete-expired-sessions-daily',  -- unique job name
  '0 2 * * *',                       -- cron expression: 02:00 UTC every day
  $$SELECT invoke_delete_expired_sessions()$$
);


-- ---------------------------------------------------------------------------
-- Grant execute to the cron background worker role
-- ---------------------------------------------------------------------------
-- pg_cron runs jobs as the `postgres` superuser by default on Supabase, so
-- no explicit GRANT is required. This GRANT is included for documentation
-- and forward-compatibility with environments that use a restricted cron role.
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION invoke_delete_expired_sessions() TO postgres;

