CREATE TYPE document_type AS ENUM (
  'barangay_clearance',
  'barangay_id',
  'certificate_of_residency'
);

CREATE TYPE request_status AS ENUM (
  'submitted',
  'under_review',
  'needs_information',
  'approved',
  'rejected',
  'generating',
  'ready_for_issuance',
  'issued',
  'cancelled'
);

CREATE TABLE document_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number   text NOT NULL UNIQUE,
  resident_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  document_type    document_type NOT NULL,
  status           request_status NOT NULL DEFAULT 'submitted',
  purpose          text NOT NULL,
  additional_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  assigned_to      uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  reviewed_at      timestamptz,
  decision_note    text,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_purpose_nonempty CHECK (length(trim(purpose)) > 0),
  CONSTRAINT request_additional_data_object CHECK (jsonb_typeof(additional_data) = 'object')
);

CREATE TABLE request_status_history (
  id          bigserial PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES document_requests(id) ON DELETE RESTRICT,
  from_status request_status,
  to_status   request_status NOT NULL,
  changed_by  uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  change_note text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_requests_resident_created_idx
  ON document_requests (resident_user_id, created_at DESC);
CREATE INDEX request_status_history_request_idx
  ON request_status_history (request_id, changed_at DESC);