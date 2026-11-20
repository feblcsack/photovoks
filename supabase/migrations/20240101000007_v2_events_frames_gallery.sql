-- =============================================================================
-- Migration: v2 — event codes + PIN, reusable frame designs, gallery,
-- live photos / GIF, AI generations (OpenRouter), print station queue.
--
-- Purely additive: no existing rows or files are deleted. Safe to re-run.
-- =============================================================================

-- ── events ───────────────────────────────────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS code               text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pin_hash           text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pin_failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pin_locked_until   timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description        text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS welcome_title      text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS welcome_subtitle   text;
-- capture
ALTER TABLE events ADD COLUMN IF NOT EXISTS shot_count         integer NOT NULL DEFAULT 3;
ALTER TABLE events ADD COLUMN IF NOT EXISTS countdown_seconds  integer NOT NULL DEFAULT 3;
ALTER TABLE events ADD COLUMN IF NOT EXISTS capture_mode       text    NOT NULL DEFAULT 'auto';
ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_retake       boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_retakes        integer NOT NULL DEFAULT 2;
ALTER TABLE events ADD COLUMN IF NOT EXISTS live_photo         boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS mirror_preview     boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS filters            text[]  NOT NULL DEFAULT ARRAY['original','bw','warm','cool','vintage'];
-- print
ALTER TABLE events ADD COLUMN IF NOT EXISTS print_mode         text    NOT NULL DEFAULT 'station';
ALTER TABLE events ADD COLUMN IF NOT EXISTS print_paper        text    NOT NULL DEFAULT '4x6';
ALTER TABLE events ADD COLUMN IF NOT EXISTS print_copies       integer NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_guest_prints   integer NOT NULL DEFAULT 2;
-- AI
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_enabled         boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_styles          text[]  NOT NULL DEFAULT ARRAY['doodle','sketch','anime','watercolor','popart','claymation'];
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_per_session     integer NOT NULL DEFAULT 3;
-- gallery
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_visibility text    NOT NULL DEFAULT 'private';
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_token      text;

-- Backfill codes / gallery tokens for existing events.
UPDATE events SET code = upper(substr(replace(id::text, '-', ''), 1, 6)) WHERE code IS NULL;
UPDATE events SET gallery_token = replace(gen_random_uuid()::text, '-', '') WHERE gallery_token IS NULL;

ALTER TABLE events ALTER COLUMN code SET NOT NULL;
ALTER TABLE events ALTER COLUMN gallery_token SET NOT NULL;
ALTER TABLE events ALTER COLUMN gallery_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_code ON events (code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_gallery_token ON events (gallery_token);

DO $$
BEGIN
  ALTER TABLE events ADD CONSTRAINT events_code_format CHECK (code ~ '^[A-Z0-9]{4,12}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER TABLE events ADD CONSTRAINT events_v2_ranges CHECK (
    shot_count BETWEEN 1 AND 8
    AND countdown_seconds BETWEEN 1 AND 10
    AND max_retakes BETWEEN 0 AND 10
    AND print_copies BETWEEN 1 AND 10
    AND max_guest_prints BETWEEN 0 AND 20
    AND ai_per_session BETWEEN 0 AND 10
    AND capture_mode IN ('auto', 'manual')
    AND print_mode IN ('off', 'browser', 'station')
    AND gallery_visibility IN ('private', 'unlisted', 'public')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Several events may now be active at the same time (each booth opens its own
-- event by code), so nothing else changes for `status`.

-- ── frames: reusable library + visual designs ────────────────────────────────
ALTER TABLE frames ALTER COLUMN event_id DROP NOT NULL;      -- NULL = library frame
ALTER TABLE frames ALTER COLUMN storage_path DROP NOT NULL;  -- designs don't need an overlay PNG
ALTER TABLE frames ADD COLUMN IF NOT EXISTS design         jsonb;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS width          integer NOT NULL DEFAULT 600;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS height         integer NOT NULL DEFAULT 1800;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS slot_count     integer NOT NULL DEFAULT 3;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS category       text    NOT NULL DEFAULT 'strip';
ALTER TABLE frames ADD COLUMN IF NOT EXISTS thumbnail_path text;

UPDATE frames SET slot_count = jsonb_array_length(slot_geometry)
 WHERE design IS NULL AND jsonb_typeof(slot_geometry) = 'array' AND jsonb_array_length(slot_geometry) > 0;

CREATE TABLE IF NOT EXISTS event_frames (
  event_id   uuid    NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  frame_id   uuid    NOT NULL REFERENCES frames (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, frame_id)
);
CREATE INDEX IF NOT EXISTS idx_event_frames_frame ON event_frames (frame_id);

-- Existing frames stay attached to the event they were uploaded for.
INSERT INTO event_frames (event_id, frame_id, sort_order)
SELECT event_id, id, sort_order FROM frames WHERE event_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── sessions ─────────────────────────────────────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shot_count   integer NOT NULL DEFAULT 3;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS slot_map     integer[];
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS filter       text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS has_live     boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_frames  integer NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS has_gif      boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS has_thumb    boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_hidden    boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_count  integer NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS strip_width  integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS strip_height integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_event_created ON sessions (event_id, created_at DESC);

-- ── print_jobs: a real queue (reprints = new rows), copies, AI prints ───────
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_session_id_type_key;
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_type_check;
DO $$
BEGIN
  ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_type_check CHECK (type IN ('strip', 'sketch', 'ai'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS copies      integer NOT NULL DEFAULT 1;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS paper       text;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'booth';
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS event_id    uuid REFERENCES events (id) ON DELETE CASCADE;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS station_id  text;

UPDATE print_jobs pj SET event_id = s.event_id FROM sessions s WHERE pj.session_id = s.id AND pj.event_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_print_jobs_event_status ON print_jobs (event_id, status, created_at);

-- ── AI generations (many per session, any style / photo) ─────────────────────
CREATE TABLE IF NOT EXISTS ai_generations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  shot_index   integer     NOT NULL DEFAULT 0,
  style_id     text        NOT NULL,
  prompt       text        NOT NULL,
  provider     text        NOT NULL DEFAULT 'openrouter',
  model        text,
  status       text        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'done', 'failed', 'failed_safety')),
  result_path  text,
  error_reason text,
  attempts     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_generations_session ON ai_generations (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_generations_status  ON ai_generations (status, updated_at);
DROP TRIGGER IF EXISTS trg_ai_generations_updated_at ON ai_generations;
CREATE TRIGGER trg_ai_generations_updated_at
  BEFORE UPDATE ON ai_generations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_frames   ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: only the server (service role) touches them.

-- ── Lock down anon reads ─────────────────────────────────────────────────────
-- events now hold a PIN hash and frames are served with signed URLs by the
-- server, so the browser no longer reads these tables directly.
DROP POLICY IF EXISTS "events_anon_select_active" ON events;
DROP POLICY IF EXISTS "frames_anon_select_active" ON frames;
DROP POLICY IF EXISTS "frames_bucket_anon_select" ON storage.objects;

-- ── Storage buckets ──────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
       file_size_limit    = 20971520   -- 20 MB (live-photo sprites / GIFs)
 WHERE id = 'sessions';
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'],
       file_size_limit    = 10485760
 WHERE id IN ('frames', 'sketches');
