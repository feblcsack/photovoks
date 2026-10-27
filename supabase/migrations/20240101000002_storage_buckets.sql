-- =============================================================================
-- Migration: Private Supabase Storage buckets
-- =============================================================================
--
-- Creates three private storage buckets for the Photovoks platform.
-- All buckets are private (public = false) — assets are served exclusively
-- via time-limited signed URLs. No bucket allows unauthenticated direct access.
--
-- File size limits:
--   sessions  — 10 MB  (source photos, strip PNG, sheet JPEG)
--   sketches  — 10 MB  (AI-generated sketch PNG, sketch card PNG)
--   frames    —  5 MB  (admin-uploaded frame PNGs with alpha)
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create private buckets
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'sessions',
    'sessions',
    false,
    10485760,  -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'sketches',
    'sketches',
    false,
    10485760,  -- 10 MB
    ARRAY['image/png', 'image/jpeg']
  ),
  (
    'frames',
    'frames',
    false,
    5242880,   -- 5 MB
    ARRAY['image/png']
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Storage RLS policies
-- ---------------------------------------------------------------------------
--
-- The storage.objects table has RLS enabled by default in Supabase.
-- Uploads from the iPad go directly to the sessions bucket using short-lived
-- signed upload URLs (max 10 min) generated server-side — there is no anon
-- write policy needed here; the signed URL mechanism handles authorisation at
-- the Supabase Storage layer independently of these RLS policies.
--
-- All read access for all three buckets uses signed download URLs generated
-- server-side, so no anon SELECT policy is required for sessions or sketches.

-- sessions bucket: authenticated access only
-- (iPad uploads use signed upload URLs — no anon policy needed)
CREATE POLICY "sessions_bucket_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sessions')
  WITH CHECK (bucket_id = 'sessions');

-- sketches bucket: authenticated access only
CREATE POLICY "sketches_bucket_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sketches')
  WITH CHECK (bucket_id = 'sketches');

-- frames bucket: authenticated write; anon read (frames are served to the
-- booth for preview — a permissive SELECT lets the booth cache frame images
-- without a per-request signed URL for read, while uploads remain admin-only)
CREATE POLICY "frames_bucket_anon_select" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'frames');

CREATE POLICY "frames_bucket_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'frames')
  WITH CHECK (bucket_id = 'frames');
