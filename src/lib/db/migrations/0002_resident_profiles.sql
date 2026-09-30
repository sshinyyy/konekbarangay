CREATE TABLE resident_profiles (
  user_id             uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE RESTRICT,
  first_name          text NOT NULL,
  middle_name         text,
  last_name           text NOT NULL,
  suffix              text,
  birth_date          date NOT NULL,
  civil_status        text,
  contact_number      text,
  house_street        text NOT NULL,
  purok_sitio         text,
  barangay            text NOT NULL,
  municipality        text NOT NULL,
  province            text NOT NULL,
  postal_code         text,
  profile_verified_at timestamptz,
  verified_by         uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_profile_names_nonempty CHECK (
    length(trim(first_name)) > 0 AND length(trim(last_name)) > 0
  ),
  CONSTRAINT resident_profile_address_nonempty CHECK (
    length(trim(house_street)) > 0
    AND length(trim(barangay)) > 0
    AND length(trim(municipality)) > 0
    AND length(trim(province)) > 0
  )
);