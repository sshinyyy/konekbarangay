import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  RequestAssignedToAnotherStaffError,
  StaffRequestNotFoundError,
  verifyResidentProfileForRequest,
} from "@/lib/db/staff-requests";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const { requestId } = await context.params;
  if (!z.uuid().safeParse(requestId).success) {
    return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  try {
    await verifyResidentProfileForRequest({
      requestId,
      actorUserId: staff.userId,
      canManageAll: staff.role === "admin",
    });
    return Response.json({ verified: true }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof StaffRequestNotFoundError) {
      return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof RequestAssignedToAnotherStaffError) {
      return Response.json({ error: "request_assigned_to_another_staff" }, { status: 409, headers: noStoreHeaders });
    }
    throw error;
  }
}