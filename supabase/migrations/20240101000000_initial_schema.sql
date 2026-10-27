-- =============================================================================
-- Photovoks Photobooth — Initial Schema Migration
-- =============================================================================
-- Table creation order must respect FK dependencies:
--   1. prompt_templates  (referenced by events.active_prompt_template_id)
--   2. events            (referenced by frames, sessions, prompt_templates, sketch_jobs via sessions)
--   3. frames            (referenced by sessions)
--   4. sessions          (referenced by print_jobs, sketch_jobs)
--   5. print_jobs
--   6. sketch_jobs
--   7. admin_users
--   8. print_station_heartbeat
--
-- NOTE: events.active_prompt_template_id is a forward-reference to prompt_templates.
--   To avoid a circular dependency, prompt_templates is created first (without event_id FK),
--   then events, then the event_id FK is added to prompt_templates via ALTER TABLE below.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 1. prompt_templates
--    (created before events to allow events.active_prompt_template_id FK)
-- ---------------------------------------------------------------------------
CREATE TABLE prompt_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- event_id FK added via ALTER TABLE after events table is created (see below)
  event_id     uuid        NOT NULL,
  content      text        NOT NULL,
  version      integer     NOT NULL DEFAULT 1,
  is_active    boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_templates_event_id ON prompt_templates (event_id);


-- ---------------------------------------------------------------------------
-- 2. events
-- ---------------------------------------------------------------------------
CREATE TABLE events (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text        NOT NULL,
  status                    text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'active', 'archived')),
  retention_days            integer     NOT NULL DEFAULT 30,
  daily_sketch_cap          integer     NOT NULL DEFAULT 50,
  tear_line_offset_px       integer     NOT NULL DEFAULT 0,
  -- Forward-reference FK: references prompt_templates(id).
  -- prompt_templates is created first; this FK is safe because the column
  -- is nullable and ON DELETE SET NULL prevents orphan references.
  active_prompt_template_id uuid        REFERENCES prompt_templates (id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_status ON events (status);

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Now that events exists, add the event_id FK to prompt_templates
ALTER TABLE prompt_templates
  ADD CONSTRAINT fk_prompt_templates_event_id
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE;


-- ---------------------------------------------------------------------------
-- 3. frames
-- ---------------------------------------------------------------------------
CREATE TABLE frames (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name         text        NOT NULL,
  storage_path text        NOT NULL,
  -- Array of SlotGeometry objects: [{x, y, w, h, aspectRatio}, ...]
  slot_geometry jsonb       NOT NULL DEFAULT '[]',
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_frames_event_id          ON frames (event_id);
CREATE INDEX idx_frames_event_id_active   ON frames (event_id, is_active);
CREATE INDEX idx_frames_sort_order        ON frames (event_id, sort_order);

CREATE TRIGGER trg_frames_updated_at
  BEFORE UPDATE ON frames
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. sessions
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token               text        NOT NULL UNIQUE,
  event_id            uuid        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  frame_id            uuid        REFERENCES frames (id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'created'
                        CHECK (status IN (
                          'created', 'capturing', 'composed',
                          'printing', 'printed', 'completed',
                          'abandoned', 'failed'
                        )),
  selected_photo_index integer    NOT NULL DEFAULT 1,
  -- Live Photo scaffold (UI + data layer only; MediaRecorder not implemented in MVP)
  live_photo_status   text        NOT NULL DEFAULT 'pending'
                        CHECK (live_photo_status IN ('pending', 'processing', 'done', 'failed')),
  -- Session assets are auto-deleted once expires_at is reached (Requirement 14)
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token           ON sessions (token);
CREATE INDEX idx_sessions_event_id        ON sessions (event_id);
CREATE INDEX idx_sessions_frame_id        ON sessions (frame_id);
CREATE INDEX idx_sessions_status          ON sessions (status);
CREATE INDEX idx_sessions_expires_at      ON sessions (expires_at);

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. print_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE print_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('strip', 'sketch')),
  status       text        NOT NULL DEFAULT 'queued'
                 CHECK (status IN (
                   'queued', 'printing', 'printed',
                   'failed', 'cancelled', 'cancel_failed'
                 )),
  asset_path   text,
  error_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Ensures at most one print job per (session, type) — idempotent creation
  UNIQUE (session_id, type)
);

CREATE INDEX idx_print_jobs_session_id ON print_jobs (session_id);
CREATE INDEX idx_print_jobs_status     ON print_jobs (status);
CREATE INDEX idx_print_jobs_type       ON print_jobs (type);

CREATE TRIGGER trg_print_jobs_updated_at
  BEFORE UPDATE ON print_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 6. sketch_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE sketch_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE enforces exactly one sketch job per session (Property 31)
  session_id       uuid        NOT NULL UNIQUE REFERENCES sessions (id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending', 'processing', 'done',
                       'failed', 'failed_safety'
                     )),
  input_photo_path text,
  result_path      text,
  card_path        text,
  retry_count      integer     NOT NULL DEFAULT 0,
  error_reason     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- session_id already has an implicit unique index; add status index for queries
CREATE INDEX idx_sketch_jobs_status     ON sketch_jobs (status);
CREATE INDEX idx_sketch_jobs_session_id ON sketch_jobs (session_id);

CREATE TRIGGER trg_sketch_jobs_updated_at
  BEFORE UPDATE ON sketch_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. admin_users
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username        text        NOT NULL UNIQUE,
  -- bcrypt hash of the PIN; the raw PIN value is never stored (Requirement 15.3)
  pin_hash        text        NOT NULL,
  failed_attempts integer     NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 8. print_station_heartbeat
-- ---------------------------------------------------------------------------
CREATE TABLE print_station_heartbeat (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unique station identifier; UPSERT target (Requirement 9.10)
  station_id   text        NOT NULL UNIQUE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_station_heartbeat_station_id ON print_station_heartbeat (station_id);
CREATE INDEX idx_print_station_heartbeat_last_seen  ON print_station_heartbeat (last_seen_at);


-- =============================================================================
-- Enable Supabase Realtime on tables that need live push updates
--   - sessions:   booth end screen print status; session page live updates
--   - print_jobs: print station claim; booth + session page status updates
--   - sketch_jobs: session page AI sketch progress updates
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE print_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE sketch_jobs;
