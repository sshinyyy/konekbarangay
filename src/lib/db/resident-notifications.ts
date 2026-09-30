import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export type ResidentNotification = {
  id: string;
  requestId: string | null;
  eventType: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export async function getResidentNotifications(userId: string) {
  const result = await getDatabasePool().query<{
    id: string;
    requestId: string | null;
    eventType: string;
    message: string;
    readAt: Date | null;
    createdAt: Date;
    unreadCount: string;
  }>(
    `SELECT id,
            request_id AS "requestId",
            event_type AS "eventType",
            message,
            read_at AS "readAt",
            created_at AS "createdAt",
            (count(*) FILTER (WHERE read_at IS NULL) OVER ())::int::text AS "unreadCount"
     FROM in_app_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    [userId],
  );

  return {
    notifications: result.rows.map((notification) => ({
      id: notification.id,
      requestId: notification.requestId,
      eventType: notification.eventType,
      message: notification.message,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    } satisfies ResidentNotification)),
    unreadCount: Number(result.rows[0]?.unreadCount ?? 0),
  };
}

export async function markResidentNotificationRead(notificationId: string, userId: string) {
  const result = await getDatabasePool().query<{ id: string; readAt: Date }>(
    `UPDATE in_app_notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at AS "readAt"`,
    [notificationId, userId],
  );
  const notification = result.rows[0];

  return notification
    ? { id: notification.id, readAt: notification.readAt.toISOString() }
    : null;
}