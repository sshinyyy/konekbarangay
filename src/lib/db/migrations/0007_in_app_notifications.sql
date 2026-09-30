CREATE TABLE in_app_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  request_id  uuid REFERENCES document_requests(id) ON DELETE RESTRICT,
  event_type  text NOT NULL,
  message     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT in_app_notification_event_nonempty CHECK (length(trim(event_type)) > 0),
  CONSTRAINT in_app_notification_message_nonempty CHECK (length(trim(message)) > 0)
);

CREATE INDEX in_app_notifications_user_created_idx
  ON in_app_notifications (user_id, created_at DESC);
CREATE INDEX in_app_notifications_user_unread_idx
  ON in_app_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;