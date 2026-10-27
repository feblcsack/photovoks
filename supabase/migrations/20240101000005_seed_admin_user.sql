-- =============================================================================
-- Seed Migration: Admin User
--
-- Inserts the default admin user with a bcrypt-hashed PIN.
-- The hash corresponds to the value in ADMIN_PIN_HASH from .env.local.
--
-- This migration is idempotent — it skips the INSERT if an admin user
-- with username 'admin' already exists.
--
-- To regenerate the hash for a different PIN, run:
--   node -e "const b=require('bcryptjs'); b.hash('YOUR_PIN',12).then(console.log)"
-- or use: https://bcrypt-generator.com (rounds = 12)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_users WHERE username = 'admin'
  ) THEN
    INSERT INTO admin_users (username, pin_hash)
    VALUES (
      'admin',
      -- Hash from ADMIN_PIN_HASH in .env.local
      -- Replace this with the actual hash if you change the PIN
      '$2b$12$FdNHYy3Daad0qZhCRkVlo.VVN9ejllql/4s.lA68a3Re/mRggMsWW'
    );
    RAISE NOTICE 'Admin user seeded successfully.';
  ELSE
    RAISE NOTICE 'Admin user already exists — skipping seed.';
  END IF;
END;
$$;
