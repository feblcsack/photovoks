-- v4: Y2K redesign — fridge live wall + guest wall stickers + minizine.
-- Safe to run more than once.

-- Y2K stickers a guest places on their photo for the live wall.
-- [{ id, x, y, s, r }] — positions are fractions of the photo box (validated server-side).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wall_stickers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Live wall look: silver | red | mint | green | maroon (fridge door colour).
ALTER TABLE events ADD COLUMN IF NOT EXISTS live_theme text NOT NULL DEFAULT 'silver';
-- Minizine maker on the guest page + booth.
ALTER TABLE events ADD COLUMN IF NOT EXISTS zine_enabled boolean NOT NULL DEFAULT true;

-- Zine sessions (booth) have no frame; sessions.filter = 'zine' marks them.
-- frame_id is already nullable.
