-- REVIEW BEFORE RUNNING. Not executed by the app.
-- Prepares `profiles` for Microsoft Entra ID sign-in while keeping the existing
-- Supabase-era UUIDs, so every foreign key and audit row stays valid.

BEGIN;

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS entra_object_id text,
  ADD COLUMN IF NOT EXISTS identity_provider text NOT NULL DEFAULT 'legacy_supabase',
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- One profile per Entra identity. NULLs are allowed until each user signs in once.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_entra_object_id_key
  ON profiles (entra_object_id)
  WHERE entra_object_id IS NOT NULL;

-- Case-insensitive email lookup, used to link an existing profile on first Entra sign-in.
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON profiles (lower(email));

COMMIT;

-- On first Entra sign-in the app should run (parameterised):
--   UPDATE profiles
--      SET entra_object_id = $1, identity_provider = 'entra', last_sign_in_at = now()
--    WHERE lower(email) = lower($2) AND entra_object_id IS NULL
--   RETURNING id;
-- If no row is returned, insert a new profile instead.
