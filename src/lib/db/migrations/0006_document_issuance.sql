CREATE TYPE verification_result AS ENUM (
  'valid',
  'invalid_signature',
  'not_found',
  'revoked',
  'expired',
  'mismatch'
);

CREATE TABLE issued_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES document_requests(id) ON DELETE RESTRICT,
  version                 integer NOT NULL,
  serial_number           text NOT NULL UNIQUE,
  document_type           document_type NOT NULL,
  issued_to_display_name  text NOT NULL,
  issued_at               timestamptz NOT NULL,
  expires_at              timestamptz,
  storage_object_path     text NOT NULL UNIQUE,
  content_sha256_hex      char(64) NOT NULL,
  content_snapshot        jsonb NOT NULL,
  verification_key_id     text NOT NULL,
  qr_signature_hex        char(64) NOT NULL,
  is_revoked              boolean NOT NULL DEFAULT false,
  revoked_at              timestamptz,
  revoked_by              uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  revocation_reason       text,
  issued_by               uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_document_version_positive CHECK (version > 0),
  CONSTRAINT issued_document_content_hash_format CHECK (content_sha256_hex ~ '^[0-9a-f]{64}$'),
  CONSTRAINT issued_document_signature_format CHECK (qr_signature_hex ~ '^[0-9a-f]{64}$'),
  CONSTRAINT issued_document_snapshot_object CHECK (jsonb_typeof(content_snapshot) = 'object'),
  CONSTRAINT issued_document_expiry_after_issue CHECK (expires_at IS NULL OR expires_at > issued_at),
  CONSTRAINT issued_document_revocation_consistency CHECK (
    (is_revoked AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
    OR (NOT is_revoked AND revoked_at IS NULL AND revoked_by IS NULL)
  ),
  UNIQUE (request_id, version)
);

CREATE TABLE qr_verification_logs (
  id                  bigserial PRIMARY KEY,
  issued_document_id  uuid REFERENCES issued_documents(id) ON DELETE SET NULL,
  scanned_document_id uuid NOT NULL,
  result              verification_result NOT NULL,
  scanned_at          timestamptz NOT NULL DEFAULT now(),
  requester_ip_hash   char(64),
  user_agent_summary  text,
  CONSTRAINT qr_log_ip_hash_format CHECK (requester_ip_hash IS NULL OR requester_ip_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX issued_documents_request_idx
  ON issued_documents (request_id, version DESC);
CREATE INDEX qr_verification_logs_scanned_at_idx
  ON qr_verification_logs (scanned_at DESC);
CREATE INDEX audit_events_entity_idx
  ON audit_events (entity_type, entity_id, occurred_at DESC);