import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  applyStaffReview,
  getStaffRequestDetail,
  InvalidRequestTransitionError,
  RequestAssignedToAnotherStaffError,
  ResidentProfileNotVerifiedError,
  ReviewNoteRequiredError,
  StaffRequestNotFoundError,
} from "@/lib/db/staff-requests";

const decisionSchema = z.object({
  action: z.enum(["start_review", "request_information", "approve", "reject"]),
  note: z.string().trim().max(500).optional().transform((value) => value || null),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const { requestId } = await context.params;
  if (!z.uuid().safeParse(requestId).success) {
    return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const detail = await getStaffRequestDetail(requestId, staff.userId, staff.role === "admin");
  if (!detail) {
    return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  return Response.json({ request: detail }, { headers: noStoreHeaders });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const { requestId } = await context.params;
  if (!z.uuid().safeParse(requestId).success) {
    return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_decision", issues: parsed.error.issues },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const transition = await applyStaffReview({
      requestId,
      actorUserId: staff.userId,
      canManageAll: staff.role === "admin",
      ...parsed.data,
    });
    return Response.json({ transition }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof StaffRequestNotFoundError) {
      return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof InvalidRequestTransitionError) {
      return Response.json({ error: "invalid_transition" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof RequestAssignedToAnotherStaffError) {
      return Response.json({ error: "request_assigned_to_another_staff" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof ReviewNoteRequiredError) {
      return Response.json({ error: "review_note_required" }, { status: 400, headers: noStoreHeaders });
    }
    if (error instanceof ResidentProfileNotVerifiedError) {
      return Response.json({ error: "profile_not_verified" }, { status: 409, headers: noStoreHeaders });
    }
    throw error;
  }
}