import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import { markResidentNotificationRead } from "@/lib/db/resident-notifications";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function PATCH(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  const resident = await requireResident(request);
  if ("response" in resident) return resident.response;

  const { notificationId } = await context.params;
  if (!z.uuid().safeParse(notificationId).success) {
    return Response.json({ error: "notification_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const notification = await markResidentNotificationRead(notificationId, resident.userId);
  if (!notification) {
    return Response.json({ error: "notification_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  return Response.json({ notification }, { headers: noStoreHeaders });
}