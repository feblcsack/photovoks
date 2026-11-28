-- =============================================================================
-- Migration: v6 — "Tebak Lagu" (guess the song) game.
--
--   song_tracks  Spotify tracks the owner adds (answer = title + aliases)
--   song_rounds  one round = one random track for a player:
--                mode 'host'  → run by the admin for visitors (pre-purchase)
--                mode 'guest' → played from the guest's photo page (post-purchase)
--                A correct guess issues a voucher code with the prize.
--
-- Purely additive. Safe to re-run. No anon policies: server-only access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS song_tracks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_id  text        NOT NULL UNIQUE CHECK (spotify_id ~ '^[A-Za-z0-9]{22}$'),
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  artist      text,
  aliases     text[]      NOT NULL DEFAULT ARRAY[]::text[],
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE song_tracks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS song_rounds (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          text        NOT NULL CHECK (mode IN ('host', 'guest')),
  track_id      uuid        NOT NULL REFERENCES song_tracks (id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES sessions (id) ON DELETE CASCADE,
  event_id      uuid        REFERENCES events (id) ON DELETE SET NULL,
  player_name   text,
  guesses       integer     NOT NULL DEFAULT 0,
  last_guess    text,
  status        text        NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost', 'skipped')),
  voucher_code  text        UNIQUE,
  prize         text,
  redeemed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_song_rounds_session ON song_rounds (session_id);
CREATE INDEX IF NOT EXISTS idx_song_rounds_created ON song_rounds (created_at DESC);
ALTER TABLE song_rounds ENABLE ROW LEVEL SECURITY;
