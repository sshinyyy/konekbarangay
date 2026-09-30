import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export const MAX_ATTACHMENTS_PER_REQUEST = 5;

export class RequestNotAttachableError extends Error {}
export class AttachmentLimitReachedError extends Error {}

export type AttachmentRecord = {
  id: string;
  requestId: string;
  storageObjectPath: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  status: "pending_upload" | "uploaded" | "rejected" | "deleted";
};

export async function createAttachmentIntent(input: {
  attachmentId: string;
  requestId: string;
  userId: string;
  storageObjectPath: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
}) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const request = await client.query(
      `SELECT id
       FROM document_requests
       WHERE id = $1
         AND resident_user_id = $2
         AND status IN ('submitted', 'needs_information')
       FOR UPDATE`,
      [input.requestId, input.userId],
    );

    if (request.rowCount === 0) {
      throw new RequestNotAttachableError("Request is unavailable for uploads.");
    }

    const existing = await client.query<{ id: string; storageObjectPath: string }>(
      `SELECT id, storage_object_path AS "storageObjectPath"
       FROM request_attachments
       WHERE request_id = $1
         AND uploaded_by = $2
         AND original_filename = $3
         AND content_type = $4
         AND byte_size = $5
         AND status = 'pending_upload'
         AND created_at > now() - interval '30 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.requestId, input.userId, input.originalFilename, input.contentType, input.byteSize],
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const activeCount = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM request_attachments
       WHERE request_id = $1
         AND (
           status = 'uploaded'
           OR (status = 'pending_upload' AND created_at > now() - interval '30 minutes')
         )`,
      [input.requestId],
    );

    if (Number(activeCount.rows[0].count) >= MAX_ATTACHMENTS_PER_REQUEST) {
      throw new AttachmentLimitReachedError("Attachment limit reached.");
    }

    await client.query(
      `INSERT INTO request_attachments (
         id, request_id, uploaded_by, storage_object_path, original_filename,
         content_type, byte_size, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_upload')`,
      [
        input.attachmentId,
        input.requestId,
        input.userId,
        input.storageObjectPath,
        input.originalFilename,
        input.contentType,
        input.byteSize,
      ],
    );
    await client.query("COMMIT");

    return {
      id: input.attachmentId,
      storageObjectPath: input.storageObjectPath,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAttachmentForResident(
  attachmentId: string,
  userId: string,
) {
  const result = await getDatabasePool().query<AttachmentRecord>(
    `SELECT
       attachment.id,
       attachment.request_id AS "requestId",
       attachment.storage_object_path AS "storageObjectPath",
       attachment.original_filename AS "originalFilename",
       attachment.content_type AS "contentType",
       attachment.byte_size::int AS "byteSize",
       attachment.status
     FROM request_attachments AS attachment
     JOIN document_requests AS request ON request.id = attachment.request_id
     WHERE attachment.id = $1
       AND attachment.uploaded_by = $2
       AND request.resident_user_id = $2`,
    [attachmentId, userId],
  );

  return result.rows[0] ?? null;
}

export async function getUploadedAttachmentForStaff(
  attachmentId: string,
  staffUserId: string,
  canManageAll: boolean,
) {
  const result = await getDatabasePool().query<{
    storageObjectPath: string;
    originalFilename: string;
    contentType: string;
  }>(
    `SELECT storage_object_path AS "storageObjectPath",
            original_filename AS "originalFilename",
            content_type AS "contentType"
     FROM request_attachments AS attachment
     JOIN document_requests AS request ON request.id = attachment.request_id
     WHERE attachment.id = $1
       AND attachment.status = 'uploaded'
       AND ($3::boolean OR request.assigned_to IS NULL OR request.assigned_to = $2)`,
    [attachmentId, staffUserId, canManageAll],
  );

  return result.rows[0] ?? null;
}

export async function getIssuedDocumentForResident(documentId: string, userId: string) {
  const result = await getDatabasePool().query<{
    storageObjectPath: string;
    serialNumber: string;
  }>(
    `SELECT issued.storage_object_path AS "storageObjectPath",
            issued.serial_number AS "serialNumber"
     FROM issued_documents AS issued
     JOIN document_requests AS request ON request.id = issued.request_id
     WHERE issued.id = $1 AND request.resident_user_id = $2 AND issued.is_revoked = false`,
    [documentId, userId],
  );

  return result.rows[0] ?? null;
}

export async function markAttachmentUploaded(input: {
  attachmentId: string;
  userId: string;
  storageObjectPath: string;
  sha256Hex: string;
  storageGeneration: string | null;
}) {
  const result = await getDatabasePool().query(
    `UPDATE request_attachments
     SET storage_object_path = $3,
         sha256_hex = $4,
         storage_generation = $5,
         status = 'uploaded',
         uploaded_at = now()
     WHERE id = $1 AND uploaded_by = $2 AND status = 'pending_upload'`,
    [
      input.attachmentId,
      input.userId,
      input.storageObjectPath,
      input.sha256Hex,
      input.storageGeneration,
    ],
  );

  return result.rowCount === 1;
}

export async function markAttachmentRejected(attachmentId: string, userId: string) {
  await getDatabasePool().query(
    `UPDATE request_attachments
     SET status = 'rejected'
     WHERE id = $1 AND uploaded_by = $2 AND status = 'pending_upload'`,
    [attachmentId, userId],
  );
}