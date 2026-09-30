import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  IssuedDocumentAlreadyRevokedError,
  IssuedDocumentAssignedToAnotherStaffError,
  IssuedDocumentNotFoundError,
  revokeIssuedDocument,
} from "@/lib/db/revoke-issued-document";

const noStoreHeaders = { "Cache-Control": "no-store" };
const revocationSchema = z.object({
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const { documentId } = await context.params;
  if (!z.uuid().safeParse(documentId).success) {
    return Response.json({ error: "document_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const body = await request.json().catch(() => null);
  const parsed = revocationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_revocation", issues: parsed.error.issues },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const document = await revokeIssuedDocument({
      documentId,
      actorUserId: staff.userId,
      canManageAll: staff.role === "admin",
      reason: parsed.data.reason,
    });
    return Response.json({ document }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof IssuedDocumentNotFoundError) {
      return Response.json({ error: "document_not_found" }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof IssuedDocumentAlreadyRevokedError) {
      return Response.json({ error: "document_already_revoked" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof IssuedDocumentAssignedToAnotherStaffError) {
      return Response.json({ error: "request_assigned_to_another_staff" }, { status: 409, headers: noStoreHeaders });
    }
    throw error;
  }
}