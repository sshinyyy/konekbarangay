import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export class IssuedDocumentNotFoundError extends Error {}
export class IssuedDocumentAlreadyRevokedError extends Error {}
export class IssuedDocumentAssignedToAnotherStaffError extends Error {}

export async function revokeIssuedDocument(input: {
  documentId: string;
  actorUserId: string;
  canManageAll: boolean;
  reason: string;
}) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const documentResult = await client.query<{
      serialNumber: string;
      isRevoked: boolean;
      residentUserId: string;
      requestId: string;
      assignedTo: string | null;
    }>(
      `SELECT issued.serial_number AS "serialNumber",
              issued.is_revoked AS "isRevoked",
              request.resident_user_id AS "residentUserId",
              request.id AS "requestId",
              request.assigned_to AS "assignedTo"
       FROM issued_documents AS issued
       JOIN document_requests AS request ON request.id = issued.request_id
       WHERE issued.id = $1
       FOR UPDATE`,
      [input.documentId],
    );
    const document = documentResult.rows[0];

    if (!document) throw new IssuedDocumentNotFoundError();
    if (document.assignedTo && document.assignedTo !== input.actorUserId && !input.canManageAll) {
      throw new IssuedDocumentAssignedToAnotherStaffError();
    }
    if (document.isRevoked) throw new IssuedDocumentAlreadyRevokedError();

    const revokedResult = await client.query<{ revokedAt: Date }>(
      `UPDATE issued_documents
       SET is_revoked = true,
           revoked_at = now(),
           revoked_by = $2,
           revocation_reason = $3
       WHERE id = $1 AND is_revoked = false
       RETURNING revoked_at AS "revokedAt"`,
      [input.documentId, input.actorUserId, input.reason],
    );
    const revokedAt = revokedResult.rows[0]?.revokedAt;
    if (!revokedAt) throw new IssuedDocumentAlreadyRevokedError();

    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'document.revoked', 'issued_document', $2, $3::jsonb)`,
      [
        input.actorUserId,
        input.documentId,
        JSON.stringify({ serialNumber: document.serialNumber, reason: input.reason }),
      ],
    );
    await client.query(
      `INSERT INTO in_app_notifications (user_id, request_id, event_type, message)
       VALUES ($1, $2, 'document.revoked', $3)`,
      [
        document.residentUserId,
        document.requestId,
        `Your issued document ${document.serialNumber} was revoked. Reason: ${input.reason}`,
      ],
    );
    await client.query("COMMIT");

    return {
      documentId: input.documentId,
      serialNumber: document.serialNumber,
      revokedAt: revokedAt.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
