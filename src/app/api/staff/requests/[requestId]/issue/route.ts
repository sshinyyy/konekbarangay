import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  IssueRequestAssignedToAnotherStaffError,
  IssueProfileNotVerifiedError,
  IssueRequestNotFoundError,
  issueApprovedRequest,
  RequestNotApprovedError,
} from "@/lib/db/issue-document";

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
    const issued = await issueApprovedRequest({
      requestId,
      actorUserId: staff.userId,
      canManageAll: staff.role === "admin",
      verificationOrigin: new URL(request.url).origin,
    });
    return Response.json({ document: issued }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof IssueRequestNotFoundError) {
      return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof RequestNotApprovedError) {
      return Response.json({ error: "request_not_approved" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof IssueProfileNotVerifiedError) {
      return Response.json({ error: "profile_not_verified" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof IssueRequestAssignedToAnotherStaffError) {
      return Response.json({ error: "request_assigned_to_another_staff" }, { status: 409, headers: noStoreHeaders });
    }
    throw error;
  }
}