CREATE TYPE attachment_status AS ENUM (
  'pending_upload',
  'uploaded',
  'rejected',
  'deleted'
);

CREATE TABLE request_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES document_requests(id) ON DELETE RESTRICT,
  uploaded_by         uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  storage_object_path text NOT NULL UNIQUE,
  original_filename   text NOT NULL,
  content_type        text NOT NULL,
  byte_size           bigint NOT NULL,
  sha256_hex          char(64),
  storage_generation  text,
  status              attachment_status NOT NULL DEFAULT 'pending_upload',
  uploaded_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_size_positive CHECK (byte_size > 0),
  CONSTRAINT attachment_sha256_format CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[0-9a-f]{64}$')
);

CREATE INDEX request_attachments_request_idx
  ON request_attachments (request_id, status);