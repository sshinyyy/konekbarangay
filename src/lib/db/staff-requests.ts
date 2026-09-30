import "server-only";

import { getDatabasePool } from "@/lib/db/pool";
import type { RequestStatus } from "@/lib/db/document-requests";

export type StaffRequestSummary = {
  id: string;
  requestNumber: string;
  documentType: string;
  status: RequestStatus;
  purpose: string;
  submittedAt: string;
  residentUserId: string;
  residentName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  attachmentCount: number;
};

export async function getStaffRequestQueue(input: {
  status: RequestStatus | null;
  search: string;
  page: number;
  pageSize: number;
  staffUserId: string;
  canManageAll: boolean;
}) {
  const escapedSearch = input.search.replace(/[\\%_]/g, "\\$&");
  const searchPattern = escapedSearch ? `%${escapedSearch}%` : null;
  const pool = getDatabasePool();
  const [requestResult, countResult] = await Promise.all([
    pool.query<StaffRequestSummary>(
      `SELECT
       request.id,
       request.request_number AS "requestNumber",
       request.document_type AS "documentType",
       request.status,
       request.purpose,
       request.submitted_at AS "submittedAt",
       request.resident_user_id AS "residentUserId",
      request.assigned_to AS "assignedTo",
       concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name, profile.suffix) AS "residentName",
      assignee.display_name AS "assignedToName",
       (
         SELECT count(*)::int
         FROM request_attachments AS attachment
         WHERE attachment.request_id = request.id AND attachment.status = 'uploaded'
       ) AS "attachmentCount"
     FROM document_requests AS request
     LEFT JOIN resident_profiles AS profile ON profile.user_id = request.resident_user_id
    LEFT JOIN app_users AS assignee ON assignee.id = request.assigned_to
     WHERE ($1::request_status IS NULL OR request.status = $1)
       AND ($3::boolean OR request.assigned_to IS NULL OR request.assigned_to = $4)
       AND (
         $2::text IS NULL
         OR request.request_number ILIKE $2 ESCAPE E'\\\\'
         OR concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name, profile.suffix)
            ILIKE $2 ESCAPE E'\\\\'
       )
     ORDER BY request.submitted_at ASC, request.id ASC
    LIMIT $5 OFFSET $6`,
     [input.status, searchPattern, input.canManageAll, input.staffUserId, input.pageSize, (input.page - 1) * input.pageSize],
    ),
    pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM document_requests AS request
       LEFT JOIN resident_profiles AS profile ON profile.user_id = request.resident_user_id
       WHERE ($1::request_status IS NULL OR request.status = $1)
         AND ($3::boolean OR request.assigned_to IS NULL OR request.assigned_to = $4)
         AND (
           $2::text IS NULL
           OR request.request_number ILIKE $2 ESCAPE E'\\\\'
           OR concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name, profile.suffix)
              ILIKE $2 ESCAPE E'\\\\'
         )`,
      [input.status, searchPattern, input.canManageAll, input.staffUserId],
    ),
  ]);

  return {
    requests: requestResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getStaffRequestDetail(
  requestId: string,
  staffUserId: string,
  canManageAll: boolean,
) {
  const pool = getDatabasePool();
  const requestResult = await pool.query(
    `SELECT
       request.id,
       request.request_number AS "requestNumber",
       request.document_type AS "documentType",
       request.status,
       request.purpose,
       request.submitted_at AS "submittedAt",
       request.assigned_to AS "assignedTo",
       request.decision_note AS "decisionNote",
      assignee.display_name AS "assignedToName",
       profile.user_id AS "residentUserId",
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
       profile.profile_verified_at AS "profileVerifiedAt",
       issued.id AS "issuedDocumentId",
       issued.serial_number AS "issuedSerialNumber",
      issued.issued_at AS "issuedAt",
      issued.is_revoked AS "issuedIsRevoked",
      issued.revoked_at AS "issuedRevokedAt",
      issued.revocation_reason AS "issuedRevocationReason"
     FROM document_requests AS request
     LEFT JOIN resident_profiles AS profile ON profile.user_id = request.resident_user_id
    LEFT JOIN app_users AS assignee ON assignee.id = request.assigned_to
     LEFT JOIN LATERAL (
      SELECT id, serial_number, issued_at, is_revoked, revoked_at, revocation_reason
       FROM issued_documents
       WHERE request_id = request.id
       ORDER BY version DESC
       LIMIT 1
     ) AS issued ON true
     WHERE request.id = $1
       AND ($3::boolean OR request.assigned_to IS NULL OR request.assigned_to = $2)`,
    [requestId, staffUserId, canManageAll],
  );

  if (!requestResult.rows[0]) return null;

  const [attachmentResult, historyResult] = await Promise.all([
    pool.query(
      `SELECT id, original_filename AS "originalFilename", content_type AS "contentType",
              byte_size AS "byteSize", status, uploaded_at AS "uploadedAt"
       FROM request_attachments
       WHERE request_id = $1
       ORDER BY created_at ASC`,
      [requestId],
    ),
    pool.query(
      `SELECT history.from_status AS "fromStatus", history.to_status AS "toStatus",
              history.change_note AS "changeNote", history.changed_at AS "changedAt",
              actor.display_name AS "changedBy"
       FROM request_status_history AS history
       LEFT JOIN app_users AS actor ON actor.id = history.changed_by
       WHERE history.request_id = $1
       ORDER BY history.changed_at DESC`,
      [requestId],
    ),
  ]);

  return {
    ...requestResult.rows[0],
    attachments: attachmentResult.rows,
    history: historyResult.rows,
  };
}

export class StaffRequestNotFoundError extends Error {}
export class RequestAssignedToAnotherStaffError extends Error {}
export class InvalidRequestTransitionError extends Error {}
export class ReviewNoteRequiredError extends Error {}
export class ResidentProfileNotVerifiedError extends Error {}

export async function verifyResidentProfileForRequest(input: {
  requestId: string;
  actorUserId: string;
  canManageAll: boolean;
}) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const profile = await client.query<{
      userId: string;
      profileVerifiedAt: string | null;
      assignedTo: string | null;
    }>(
      `SELECT profile.user_id AS "userId",
              profile.profile_verified_at AS "profileVerifiedAt",
              request.assigned_to AS "assignedTo"
       FROM resident_profiles AS profile
       JOIN document_requests AS request ON request.resident_user_id = profile.user_id
       WHERE request.id = $1
       FOR UPDATE OF request, profile`,
      [input.requestId],
    );

    if (!profile.rows[0]) throw new StaffRequestNotFoundError();
    if (
      profile.rows[0].assignedTo &&
      profile.rows[0].assignedTo !== input.actorUserId &&
      !input.canManageAll
    ) {
      throw new RequestAssignedToAnotherStaffError();
    }
    await client.query(
      `UPDATE document_requests
       SET assigned_to = COALESCE(assigned_to, $2), updated_at = now()
       WHERE id = $1`,
      [input.requestId, input.actorUserId],
    );

    await client.query(
      `UPDATE resident_profiles
       SET profile_verified_at = COALESCE(profile_verified_at, now()),
           verified_by = COALESCE(verified_by, $2),
           updated_at = now()
       WHERE user_id = $1`,
      [profile.rows[0].userId, input.actorUserId],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'resident_profile.verified', 'resident_profile', $2)`,
      [input.actorUserId, profile.rows[0].userId],
    );
    await client.query(
      `INSERT INTO in_app_notifications (user_id, request_id, event_type, message)
       SELECT request.resident_user_id, request.id, 'profile.verified', $2
       FROM document_requests AS request
       WHERE request.id = $1`,
      [input.requestId, "Your resident profile has been verified by staff."],
    );
    await client.query("COMMIT");

    return profile.rows[0].userId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type ReviewAction = "start_review" | "request_information" | "approve" | "reject";

export async function applyStaffReview(input: {
  requestId: string;
  actorUserId: string;
  canManageAll: boolean;
  action: ReviewAction;
  note: string | null;
}) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const currentResult = await client.query<{
      status: RequestStatus;
      requestNumber: string;
      residentUserId: string;
            assignedTo: string | null;
    }>(
      `SELECT status, request_number AS "requestNumber",
              resident_user_id AS "residentUserId",
              assigned_to AS "assignedTo"
       FROM document_requests WHERE id = $1 FOR UPDATE`,
      [input.requestId],
    );
    const currentRequest = currentResult.rows[0];
    const currentStatus = currentRequest?.status;

    if (!currentStatus) throw new StaffRequestNotFoundError();
    if (
      currentRequest.assignedTo &&
      currentRequest.assignedTo !== input.actorUserId &&
      !input.canManageAll
    ) {
      throw new RequestAssignedToAnotherStaffError();
    }

    const nextStatus: RequestStatus | null =
      input.action === "start_review" && ["submitted", "needs_information"].includes(currentStatus)
        ? "under_review"
        : input.action === "request_information" && currentStatus === "under_review"
          ? "needs_information"
          : input.action === "approve" && currentStatus === "under_review"
            ? "approved"
            : input.action === "reject" && currentStatus === "under_review"
              ? "rejected"
              : null;

    if (!nextStatus) throw new InvalidRequestTransitionError();
    if ((nextStatus === "needs_information" || nextStatus === "rejected") && !input.note) {
      throw new ReviewNoteRequiredError();
    }
    if (nextStatus === "approved") {
      const profile = await client.query(
        `SELECT profile.profile_verified_at
         FROM resident_profiles AS profile
         JOIN document_requests AS request ON request.resident_user_id = profile.user_id
         WHERE request.id = $1
         FOR UPDATE OF profile`,
        [input.requestId],
      );
      if (!profile.rows[0]?.profile_verified_at) throw new ResidentProfileNotVerifiedError();
    }

    await client.query(
      `UPDATE document_requests
       SET status = $2::request_status,
           assigned_to = COALESCE(assigned_to, $3),
           reviewed_at = CASE WHEN $2::request_status IN ('approved', 'rejected', 'needs_information') THEN now() ELSE reviewed_at END,
           decision_note = $4,
           updated_at = now()
       WHERE id = $1`,
      [input.requestId, nextStatus, input.actorUserId, input.note],
    );
    await client.query(
      `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by, change_note)
       VALUES ($1, $2::request_status, $3::request_status, $4, $5)`,
      [input.requestId, currentStatus, nextStatus, input.actorUserId, input.note],
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'document_request.reviewed', 'document_request', $2, $3::jsonb)`,
      [
        input.actorUserId,
        input.requestId,
        JSON.stringify({
          action: input.action,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          note: input.note,
        }),
      ],
    );
    const notificationMessage =
      nextStatus === "needs_information"
        ? `More information is needed for request ${currentRequest.requestNumber}.`
        : nextStatus === "rejected"
          ? `Your document request ${currentRequest.requestNumber} was rejected.`
          : `Your document request ${currentRequest.requestNumber} is now ${nextStatus.replaceAll("_", " ")}.`;
    await client.query(
      `INSERT INTO in_app_notifications (user_id, request_id, event_type, message)
       VALUES ($1, $2, $3, $4)`,
      [currentRequest.residentUserId, input.requestId, `request.${nextStatus}`, notificationMessage],
    );
    await client.query("COMMIT");

    return { fromStatus: currentStatus, toStatus: nextStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}