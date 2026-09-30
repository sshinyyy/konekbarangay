import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { getDatabasePool } from "@/lib/db/pool";
import { DOCUMENT_TEMPLATE_VERSION, renderIssuedDocumentPdf } from "@/lib/documents/issued-pdf";
import { signVerificationClaims } from "@/lib/documents/qr-signing";
import { getSupabaseAdminStorage } from "@/lib/supabase/storage-admin";

export class IssueRequestNotFoundError extends Error {}
export class IssueRequestAssignedToAnotherStaffError extends Error {}
export class RequestNotApprovedError extends Error {}
export class IssueProfileNotVerifiedError extends Error {}

type ApprovedRequestRecord = {
  id: string;
  residentUserId: string;
  assignedTo: string | null;
  requestNumber: string;
  documentType: "barangay_clearance" | "barangay_id" | "certificate_of_residency";
  status: string;
  purpose: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  birthDate: string;
  civilStatus: string | null;
  contactNumber: string | null;
  houseStreet: string;
  purokSitio: string | null;
  barangay: string;
  municipality: string;
  province: string;
  postalCode: string | null;
  profileVerifiedAt: string | null;
};

export async function issueApprovedRequest(input: {
  requestId: string;
  actorUserId: string;
  canManageAll: boolean;
  verificationOrigin: string;
}) {
  const client = await getDatabasePool().connect();
  let uploadedObjectPath: string | null = null;

  try {
    await client.query("BEGIN");
    const result = await client.query<ApprovedRequestRecord>(
      `SELECT
         request.id,
         request.resident_user_id AS "residentUserId",
         request.assigned_to AS "assignedTo",
         request.request_number AS "requestNumber",
         request.document_type AS "documentType",
         request.status,
         request.purpose,
         profile.first_name AS "firstName",
         profile.middle_name AS "middleName",
         profile.last_name AS "lastName",
         profile.suffix,
         profile.birth_date::text AS "birthDate",
         profile.civil_status AS "civilStatus",
         profile.contact_number AS "contactNumber",
         profile.house_street AS "houseStreet",
         profile.purok_sitio AS "purokSitio",
         profile.barangay,
         profile.municipality,
         profile.province,
         profile.postal_code AS "postalCode",
         profile.profile_verified_at AS "profileVerifiedAt"
       FROM document_requests AS request
       JOIN resident_profiles AS profile ON profile.user_id = request.resident_user_id
       WHERE request.id = $1
       FOR UPDATE OF request, profile`,
      [input.requestId],
    );
    const request = result.rows[0];

    if (!request) throw new IssueRequestNotFoundError();
    if (request.assignedTo && request.assignedTo !== input.actorUserId && !input.canManageAll) {
      throw new IssueRequestAssignedToAnotherStaffError();
    }
    if (request.status !== "approved") throw new RequestNotApprovedError();
    if (!request.profileVerifiedAt) throw new IssueProfileNotVerifiedError();

    const issuedAt = new Date().toISOString();
    const documentId = randomUUID();
    const serialNumber = `BRGY-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
    const issuedToName = [request.firstName, request.middleName, request.lastName, request.suffix]
      .filter(Boolean)
      .join(" ");
    const address = [
      request.houseStreet,
      request.purokSitio,
      request.barangay,
      request.municipality,
      request.province,
      request.postalCode,
    ].filter(Boolean).join(", ");

    const snapshot = {
      templateVersion: DOCUMENT_TEMPLATE_VERSION,
      requestNumber: request.requestNumber,
      documentType: request.documentType,
      purpose: request.purpose,
      issuedAt,
      issuedBy: input.actorUserId,
      issuedTo: {
        name: issuedToName,
        birthDate: request.birthDate,
        civilStatus: request.civilStatus,
        contactNumber: request.contactNumber,
        address,
      },
    };
    const contentSha256Hex = createHash("sha256")
      .update(JSON.stringify(snapshot), "utf8")
      .digest("hex");
    const signed = signVerificationClaims({
      documentId,
      serial: serialNumber,
      type: request.documentType,
      issuedAt,
      expiresAt: null,
      contentSha256: contentSha256Hex,
    });
    const verificationUrl = new URL(`/verify/${documentId}`, input.verificationOrigin);
    verificationUrl.searchParams.set("t", signed.token);
    const qrDataUrl = await QRCode.toDataURL(verificationUrl.toString(), {
      errorCorrectionLevel: "Q",
      margin: 1,
      width: 240,
    });
    const pdf = await renderIssuedDocumentPdf(snapshot, serialNumber, qrDataUrl);
    const storageObjectPath = `issued/${request.id}/${documentId}/v1.pdf`;
    const { error: uploadError } = await getSupabaseAdminStorage().upload(
      storageObjectPath,
      pdf,
      { contentType: "application/pdf", cacheControl: "no-store", upsert: false },
    );
    if (uploadError) throw uploadError;
    uploadedObjectPath = storageObjectPath;

    await client.query(
      `INSERT INTO issued_documents (
         id, request_id, version, serial_number, document_type,
         issued_to_display_name, issued_at, expires_at, storage_object_path,
         content_sha256_hex, content_snapshot, verification_key_id,
         qr_signature_hex, issued_by
       ) VALUES ($1, $2, 1, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12)`,
      [
        documentId,
        request.id,
        serialNumber,
        request.documentType,
        issuedToName,
        issuedAt,
        storageObjectPath,
        contentSha256Hex,
        snapshot,
        signed.claims.kid,
        signed.signature,
        input.actorUserId,
      ],
    );

    await client.query(
      `UPDATE document_requests
       SET status = 'issued', completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [request.id],
    );
    await client.query(
      `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by, change_note)
       VALUES
         ($1, 'approved', 'generating', $2, 'Document generation started'),
         ($1, 'generating', 'ready_for_issuance', $2, 'Document generated'),
         ($1, 'ready_for_issuance', 'issued', $2, 'Document issued')`,
      [request.id, input.actorUserId],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'document.issued', 'issued_document', $2, $3::jsonb)`,
      [input.actorUserId, documentId, JSON.stringify({ requestId: request.id, serialNumber })],
    );
    await client.query(
      `INSERT INTO in_app_notifications (user_id, request_id, event_type, message)
       VALUES ($1, $2, 'document.issued', $3)`,
      [
        request.residentUserId,
        request.id,
        `Your document request ${request.requestNumber} has been issued.`,
      ],
    );
    await client.query("COMMIT");

    return { id: documentId, serialNumber, issuedAt, storageObjectPath };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (uploadedObjectPath) {
      await getSupabaseAdminStorage().remove([uploadedObjectPath]).catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}