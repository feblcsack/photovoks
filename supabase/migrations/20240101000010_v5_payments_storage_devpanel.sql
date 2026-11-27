-- =============================================================================
-- Migration: v5 — egress fix, developer panel, payments (QRIS + cash),
-- sticker library and AI kill switch.
--
-- Purely additive: no existing rows or files are deleted. Safe to re-run.
-- =============================================================================

-- ── Runtime settings (developer panel) ───────────────────────────────────────
-- One row per settings group, e.g. key='maintenance' value={"enabled":false}.
-- Read by the server with the service role (cached ~20 s per instance).
CREATE TABLE IF NOT EXISTS app_settings (
  key         text        PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 40),
  value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ── Usage counters (egress served from the origin storage) ──────────────────
CREATE TABLE IF NOT EXISTS usage_daily (
  day     date   NOT NULL DEFAULT current_date,
  metric  text   NOT NULL CHECK (char_length(metric) BETWEEN 1 AND 40),
  value   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_usage(p_metric text, p_value bigint)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  INSERT INTO usage_daily (day, metric, value) VALUES (current_date, p_metric, p_value)
  ON CONFLICT (day, metric) DO UPDATE SET value = usage_daily.value + EXCLUDED.value;
$$;
REVOKE ALL ON FUNCTION bump_usage(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_usage(text, bigint) TO service_role;

-- Lists stored objects page by page (storage migration tool in the dev panel).
CREATE OR REPLACE FUNCTION list_storage_objects(p_bucket text, p_after text, p_limit int)
  RETURNS TABLE (name text, size bigint, mimetype text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, storage
AS $$
  SELECT o.name, COALESCE((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype'
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket AND o.name > COALESCE(p_after, '')
  ORDER BY o.name
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;
REVOKE ALL ON FUNCTION list_storage_objects(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_storage_objects(text, text, int) TO service_role;

-- Storage totals per bucket (dev panel).
CREATE OR REPLACE FUNCTION storage_usage()
  RETURNS TABLE (bucket text, files bigint, bytes bigint)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, storage
AS $$
  SELECT o.bucket_id, count(*), COALESCE(sum((o.metadata->>'size')::bigint), 0)
  FROM storage.objects o GROUP BY o.bucket_id;
$$;
REVOKE ALL ON FUNCTION storage_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION storage_usage() TO service_role;

-- ── Events: payments ─────────────────────────────────────────────────────────
-- payment_mode: off | qris | cash | both  (which methods guests may use)
-- session_price: IDR per photo session (0 = free)
-- ai_price: IDR per AI generation (0 = free)
ALTER TABLE events ADD COLUMN IF NOT EXISTS payment_mode  text    NOT NULL DEFAULT 'off';
ALTER TABLE events ADD COLUMN IF NOT EXISTS session_price integer NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_price      integer NOT NULL DEFAULT 1500;
DO $$
BEGIN
  ALTER TABLE events ADD CONSTRAINT events_payment_mode CHECK (payment_mode IN ('off', 'qris', 'cash', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE events ADD CONSTRAINT events_prices CHECK (session_price BETWEEN 0 AND 10000000 AND ai_price BETWEEN 0 AND 10000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payments ─────────────────────────────────────────────────────────────────
-- status: pending → paid (QRIS confirmed by webhook / status check)
--                 → approved (cash, confirmed by operator/admin)
--                 → declined | expired | cancelled | failed
-- consumed_at marks a payment already used by a session / AI generation.
CREATE TABLE IF NOT EXISTS payments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES sessions (id) ON DELETE SET NULL,
  purpose       text        NOT NULL CHECK (purpose IN ('session', 'ai')),
  amount        integer     NOT NULL CHECK (amount BETWEEN 0 AND 10000000),
  method        text        NOT NULL CHECK (method IN ('qris', 'cash')),
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'approved', 'declined', 'expired', 'cancelled', 'failed')),
  order_id      text        NOT NULL UNIQUE,
  short_code    text        NOT NULL,
  token         text        NOT NULL UNIQUE,
  provider      text,
  provider_id   text,
  payment_link  text,
  expires_at    timestamptz,
  paid_at       timestamptz,
  decided_by    text,
  consumed_at   timestamptz,
  meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_event_created ON payments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments (status) WHERE status = 'pending';
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sessions       ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments (id) ON DELETE SET NULL;
ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments (id) ON DELETE SET NULL;

-- ── Sticker library (admin-uploaded icons for every event) ───────────────────
-- Files live in the private `event-media` bucket under library/<uuid>.<ext>.
CREATE TABLE IF NOT EXISTS sticker_assets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  category    text        NOT NULL DEFAULT 'custom' CHECK (char_length(category) BETWEEN 1 AND 30),
  path        text        NOT NULL UNIQUE,
  width       integer,
  height      integer,
  bytes       integer,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sticker_assets ENABLE ROW LEVEL SECURITY;

-- No anon policies anywhere above: every read/write goes through the server.
