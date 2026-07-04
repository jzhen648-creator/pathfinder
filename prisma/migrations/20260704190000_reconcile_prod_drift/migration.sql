-- Reconcile prod drift: rename Branch_pkey left over from table rename migration.
-- No-op when ThemeCategory_pkey already exists (current Supabase state).

DO $$ BEGIN
  IF to_regclass('public."Branch_pkey"') IS NOT NULL THEN
    ALTER INDEX "Branch_pkey" RENAME TO "ThemeCategory_pkey";
  END IF;
END $$;
