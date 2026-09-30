import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import {
  getAttachmentForResident,
  markAttachmentRejected,
  markAttachmentUploaded,
} from "@/lib/db/request-attachments";
import { getSupabaseAdminStorage } from "@/lib/supabase/storage-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };

function detectContentType(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

async function rejectUpload(input: {
  attachmentId: string;
  userId: string;
  storageObjectPath: string;
}) {
  await markAttachmentRejected(input.attachmentId, input.userId);
  await getSupabaseAdminStorage().remove([input.storageObjectPath]);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const resident = await requireResident(request);
  if ("response" in resident) return resident.response;

  const { attachmentId } = await context.params;
  if (!z.uuid().safeParse(attachmentId).success) {
    return Response.json({ error: "attachment_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const attachment = await getAttachmentForResident(attachmentId, resident.userId);
  if (!attachment) {
    return Response.json({ error: "attachment_not_found" }, { status: 404, headers: noStoreHeaders });
  }
  if (attachment.status === "uploaded") {
    return Response.json({ status: "uploaded" }, { headers: noStoreHeaders });
  }
  if (attachment.status !== "pending_upload") {
    return Response.json({ error: "upload_unavailable" }, { status: 409, headers: noStoreHeaders });
  }

  const storage = getSupabaseAdminStorage();
  const { data: blob, error: downloadError } = await storage.download(attachment.storageObjectPath);
  if (downloadError || !blob) {
    if (downloadError?.status === 404) {
      return Response.json({ error: "upload_missing" }, { status: 409, headers: noStoreHeaders });
    }
    throw downloadError ?? new Error("Storage returned no file data.");
  }

  if (blob.size !== attachment.byteSize || (blob.type && blob.type !== attachment.contentType)) {
    await rejectUpload({
      attachmentId,
      userId: resident.userId,
      storageObjectPath: attachment.storageObjectPath,
    });
    return Response.json({ error: "invalid_upload" }, { status: 400, headers: noStoreHeaders });
  }

  const bytes = Buffer.from(await blob.arrayBuffer());

  if (detectContentType(bytes) !== attachment.contentType) {
    await rejectUpload({
      attachmentId,
      userId: resident.userId,
      storageObjectPath: attachment.storageObjectPath,
    });
    return Response.json({ error: "invalid_upload" }, { status: 400, headers: noStoreHeaders });
  }

  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  const finalObjectPath = `supporting/${attachment.requestId}/${attachment.id}/${randomUUID()}`;
  try {
    const { error: moveError } = await storage.move(attachment.storageObjectPath, finalObjectPath);
    if (moveError) throw moveError;
    const updated = await markAttachmentUploaded({
      attachmentId,
      userId: resident.userId,
      storageObjectPath: finalObjectPath,
      sha256Hex,
      storageGeneration: null,
    });

    if (!updated) {
      await storage.remove([finalObjectPath]);
      return Response.json({ error: "upload_unavailable" }, { status: 409, headers: noStoreHeaders });
    }

    return Response.json({ status: "uploaded" }, { headers: noStoreHeaders });
  } catch (error) {
    await storage.remove([finalObjectPath]);
    throw error;
  }
}