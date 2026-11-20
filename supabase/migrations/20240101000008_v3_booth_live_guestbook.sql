-- =============================================================================
-- Migration: v3 — custom booth home screen, session QR on frames, live
-- gallery, guestbook microsite, guest stickers, guest AI prompts.
--
-- Purely additive: no existing rows or files are deleted. Safe to re-run.
-- =============================================================================

-- ── events ───────────────────────────────────────────────────────────────────
-- Home screen (attract): own video / image, call-to-action text.
ALTER TABLE events ADD COLUMN IF NOT EXISTS attract_media_path text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attract_media_type text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attract_cta        text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attract_show_text  boolean NOT NULL DEFAULT true;
-- Live gallery + guestbook microsite (one public token per event).
ALTER TABLE events ADD COLUMN IF NOT EXISTS live_enabled       boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guestbook_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_token       text;
-- Guest tools
ALTER TABLE events ADD COLUMN IF NOT EXISTS stickers_enabled   boolean NOT NULL DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sticker_paths      text[]  NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_guest_prompt    boolean NOT NULL DEFAULT false;

UPDATE events SET public_token = replace(gen_random_uuid()::text, '-', '') WHERE public_token IS NULL;
ALTER TABLE events ALTER COLUMN public_token SET NOT NULL;
ALTER TABLE events ALTER COLUMN public_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_public_token ON events (public_token);

DO $$
BEGIN
  ALTER TABLE events ADD CONSTRAINT events_attract_media_type CHECK (attract_media_type IS NULL OR attract_media_type IN ('video', 'image'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Guests now confirm each shot themselves (press the button for every photo).
ALTER TABLE events ALTER COLUMN capture_mode SET DEFAULT 'manual';
UPDATE events SET capture_mode = 'manual' WHERE capture_mode = 'auto';

-- ── event_frames: per-event session-QR placement ─────────────────────────────
-- NULL = use the frame design as-is (incl. any QR element placed in the
-- Frame Builder). {"mode":"off"} removes QR elements; {"mode":"corner",
-- "corner":"br","size":0.2} adds one.
ALTER TABLE event_frames ADD COLUMN IF NOT EXISTS qr jsonb;

-- ── print_jobs: guest-decorated (sticker) prints ─────────────────────────────
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_type_check;
DO $$
BEGIN
  ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_type_check CHECK (type IN ('strip', 'sketch', 'ai', 'edit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── guestbook ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  message     text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  photo_path  text,
  is_hidden   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guestbook_event_created ON guestbook_entries (event_id, created_at DESC);
ALTER TABLE guestbook_entries ENABLE ROW LEVEL SECURITY;
-- No anon policies: reads/writes go through token-checked API routes.

-- Live gallery polls "sessions of this event completed after X".
CREATE INDEX IF NOT EXISTS idx_sessions_event_completed ON sessions (event_id, completed_at DESC);

-- ── Storage: event media (home-screen video, stickers, guestbook photos) ─────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media', 'event-media', false, 52428800,  -- 50 MB (home-screen video)
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
