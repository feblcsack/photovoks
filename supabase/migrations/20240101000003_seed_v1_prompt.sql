-- =============================================================================
-- Seed Migration: v1 Prompt Template
--
-- Inserts the initial v1 sketch prompt template, linked to the first active
-- (or most-recently-created) event. If no event exists yet, the INSERT is
-- skipped via DO $$ … END $$ logic so the migration remains idempotent.
--
-- The seed prompt is a general sketchbook-style generation directive.
-- Admins can create additional versions via /admin/prompts.
-- =============================================================================

DO $$
DECLARE
  v_event_id   uuid;
  v_template_id uuid;
BEGIN
  -- Pick the first active event, falling back to the most recent event.
  SELECT id INTO v_event_id
  FROM events
  WHERE status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM events
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- No events exist yet — skip the seed. Admins can seed the prompt after
  -- creating their first event via the admin prompts page.
  IF v_event_id IS NULL THEN
    RAISE NOTICE 'No events found — skipping v1 prompt template seed. Run /admin/prompts to create the first template after an event is created.';
    RETURN;
  END IF;

  -- Avoid seeding twice if a version-1 template already exists for this event.
  IF EXISTS (
    SELECT 1 FROM prompt_templates
    WHERE event_id = v_event_id AND version = 1
  ) THEN
    RAISE NOTICE 'v1 prompt template already exists for event %. Skipping.', v_event_id;
    RETURN;
  END IF;

  INSERT INTO prompt_templates (event_id, content, version, is_active)
  VALUES (
    v_event_id,
    'You are a skilled illustrator. Create a hand-drawn pencil sketch artwork in a sketchbook style from the provided photo. '
    'The sketch should feel intimate and personal, with expressive linework, gentle cross-hatching for shading, and a warm, '
    'slightly rough paper texture. Preserve the subject''s likeness and emotion. Output a full 600×1800 portrait sketch '
    'that fills the canvas with the subjects. Use only graphite tones (no color). The result should look like a cherished '
    'hand-drawn keepsake from a special occasion.',
    1,
    true
  )
  RETURNING id INTO v_template_id;

  -- Set this template as the active prompt for the event
  UPDATE events
  SET active_prompt_template_id = v_template_id
  WHERE id = v_event_id
    AND active_prompt_template_id IS NULL;  -- only if not already set

  RAISE NOTICE 'Seeded v1 prompt template % for event %.', v_template_id, v_event_id;
END;
$$;
