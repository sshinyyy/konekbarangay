CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('resident', 'staff', 'admin');

CREATE TABLE app_users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  role         app_role NOT NULL DEFAULT 'resident',
  email        text,
  display_name text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_firebase_uid_nonempty CHECK (length(firebase_uid) > 0),
  CONSTRAINT app_users_display_name_nonempty CHECK (length(trim(display_name)) > 0)
);