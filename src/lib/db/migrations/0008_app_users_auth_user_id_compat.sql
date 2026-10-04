DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'app_users'
       AND column_name = 'firebase_uid'
  )
  AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'app_users'
       AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE app_users
      RENAME COLUMN firebase_uid TO auth_user_id;
  END IF;
END $$;
