import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export const DOCUMENT_TYPES = [
  "barangay_clearance",
  "barangay_id",
  "certificate_of_residency",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type RequestStatus =
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "generating"
  | "ready_for_issuance"
  | "issued"
  | "cancelled";

export type ResidentDocumentRequest = {
  id: string;
  requestNumber: string;
  documentType: DocumentType;
  status: RequestStatus;
  purpose: string;
  submittedAt: string;
  attachmentCount: number;
  issuedDocumentId: string | null;
  issuedSerialNumber: string | null;
  issuedIsRevoked: boolean | null;
  issuedRevocationReason: string | null;
};

export class ResidentProfileRequiredError extends Error {}

export async function getResidentDocumentRequests(userId: string) {
  const result = await getDatabasePool().query<ResidentDocumentRequest>(
    `SELECT
       request.id AS "id",
       request.request_number AS "requestNumber",
       request.document_type AS "documentType",
       request.status,
       request.purpose,
       request.submitted_at AS "submittedAt",
       (
         SELECT count(*)::int
         FROM request_attachments AS attachment
         WHERE attachment.request_id = request.id AND attachment.status = 'uploaded'
       ) AS "attachmentCount",
       issued.id AS "issuedDocumentId",
      issued.serial_number AS "issuedSerialNumber",
      issued.is_revoked AS "issuedIsRevoked",
      issued.revocation_reason AS "issuedRevocationReason"
     FROM document_requests AS request
     LEFT JOIN LATERAL (
      SELECT id, serial_number, is_revoked, revocation_reason
       FROM issued_documents
       WHERE request_id = request.id
       ORDER BY version DESC
       LIMIT 1
     ) AS issued ON true
     WHERE request.resident_user_id = $1
     ORDER BY request.submitted_at DESC
     LIMIT 100`,
    [userId],
  );

  return result.rows;
}

export async function createResidentDocumentRequest(input: {
  userId: string;
  requestNumber: string;
  documentType: DocumentType;
  purpose: string;
}) {
  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const profile = await client.query(
      "SELECT 1 FROM resident_profiles WHERE user_id = $1 FOR SHARE",
      [input.userId],
    );

    if (profile.rowCount === 0) {
      throw new ResidentProfileRequiredError("A resident profile is required.");
    }

    const result = await client.query<ResidentDocumentRequest>(
      `INSERT INTO document_requests (
         request_number, resident_user_id, document_type, purpose
       ) VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         request_number AS "requestNumber",
         document_type AS "documentType",
         status,
         purpose,
         submitted_at AS "submittedAt"`,
      [input.requestNumber, input.userId, input.documentType, input.purpose],
    );
    const request = result.rows[0];

    await client.query(
      `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, 'submitted', $2)`,
      [request.id, input.userId],
    );
    await client.query(
      `INSERT INTO in_app_notifications (user_id, request_id, event_type, message)
       VALUES ($1, $2, 'request.submitted', $3)`,
      [input.userId, request.id, `Your document request ${input.requestNumber} was submitted.`],
    );
    await client.query("COMMIT");

    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}