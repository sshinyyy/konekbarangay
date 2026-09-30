import { z } from "zod";
import { getDatabasePool } from "@/lib/db/pool";
import { verifyVerificationToken } from "@/lib/documents/qr-signing";

const noStoreHeaders = { "Cache-Control": "no-store" };
const documentIdSchema = z.uuid();

type VerificationOutcome = "valid" | "invalid_signature" | "not_found" | "revoked" | "expired" | "mismatch";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  if (!documentIdSchema.safeParse(documentId).success) {
    return Response.json(
      { valid: false, status: "not_found" },
      { status: 404, headers: noStoreHeaders },
    );
  }

  const token = new URL(request.url).searchParams.get("t") ?? "";
  let result: VerificationOutcome = "invalid_signature";
  let publicDocument: {
    documentType: string;
    serialNumber: string;
    issuedAt: string;
    expiresAt: string | null;
  } | null = null;
  let issuedDocumentId: string | null = null;
  const verification = token ? verifyVerificationToken(token) : null;

  if (verification?.valid && verification.claims) {
    const recordResult = await getDatabasePool().query<{
      id: string;
      requestId: string;
      serialNumber: string;
      documentType: string;
      issuedAt: Date;
      expiresAt: Date | null;
      contentSha256Hex: string;
      verificationKeyId: string;
      qrSignatureHex: string;
      isRevoked: boolean;
    }>(
      `SELECT id, request_id AS "requestId", serial_number AS "serialNumber",
              document_type AS "documentType", issued_at AS "issuedAt",
              expires_at AS "expiresAt", content_sha256_hex AS "contentSha256Hex",
              verification_key_id AS "verificationKeyId", qr_signature_hex AS "qrSignatureHex",
              is_revoked AS "isRevoked"
       FROM issued_documents
       WHERE id = $1`,
      [documentId],
    );
    const record = recordResult.rows[0];

    if (!record) {
      result = "not_found";
    } else {
      issuedDocumentId = record.id;
      const claims = verification.claims;
      const fieldsMatch =
        claims.documentId === documentId &&
        claims.documentId === record.id &&
        claims.serial === record.serialNumber &&
        claims.type === record.documentType &&
        claims.issuedAt === record.issuedAt.toISOString() &&
        claims.expiresAt === (record.expiresAt?.toISOString() ?? null) &&
        claims.contentSha256 === record.contentSha256Hex &&
        claims.kid === record.verificationKeyId &&
        verification.signature === record.qrSignatureHex;

      if (!fieldsMatch) {
        result = "mismatch";
      } else if (record.isRevoked) {
        result = "revoked";
      } else if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
        result = "expired";
      } else {
        result = "valid";
        publicDocument = {
          documentType: record.documentType,
          serialNumber: record.serialNumber,
          issuedAt: record.issuedAt.toISOString(),
          expiresAt: record.expiresAt?.toISOString() ?? null,
        };
      }
    }
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? null;
  await getDatabasePool().query(
    `INSERT INTO qr_verification_logs (
       issued_document_id, scanned_document_id, result, user_agent_summary
     ) VALUES ($1, $2, $3, $4)`,
    [issuedDocumentId, documentId, result, userAgent],
  );

  return Response.json(
    result === "valid"
      ? { valid: true, status: result, document: publicDocument }
      : { valid: false, status: result },
    { headers: noStoreHeaders },
  );
}