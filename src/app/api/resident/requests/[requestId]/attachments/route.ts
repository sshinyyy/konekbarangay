import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import {
  AttachmentLimitReachedError,
  createAttachmentIntent,
  markAttachmentRejected,
  RequestNotAttachableError,
} from "@/lib/db/request-attachments";
import { getSupabaseAdminStorage } from "@/lib/supabase/storage-admin";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size: z.number().int().min(1).max(MAX_FILE_BYTES),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

function safeFilename(filename: string) {
  const name = filename.split(/[\\/]/).pop()?.trim() ?? "attachment";
  return name.replace(/[^A-Za-z0-9._() -]/g, "_").slice(0, 255) || "attachment";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const resident = await requireResident(request);
  if ("response" in resident) return resident.response;

  const { requestId } = await context.params;
  if (!z.uuid().safeParse(requestId).success) {
    return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const body = await request.json().catch(() => null);
  const parsed = attachmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_attachment", issues: parsed.error.issues },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const attachmentId = randomUUID();
  const storageObjectPath = `staging/${requestId}/${attachmentId}`;
  let intent: { id: string; storageObjectPath: string };

  try {
    intent = await createAttachmentIntent({
      attachmentId,
      requestId,
      userId: resident.userId,
      storageObjectPath,
      originalFilename: safeFilename(parsed.data.fileName),
      contentType: parsed.data.contentType,
      byteSize: parsed.data.size,
    });
  } catch (error) {
    if (error instanceof RequestNotAttachableError) {
      return Response.json({ error: "request_not_found" }, { status: 404, headers: noStoreHeaders });
    }
    if (error instanceof AttachmentLimitReachedError) {
      return Response.json({ error: "attachment_limit_reached" }, { status: 409, headers: noStoreHeaders });
    }
    throw error;
  }

  try {
    const { data, error } = await getSupabaseAdminStorage().createSignedUploadUrl(
      intent.storageObjectPath,
      { upsert: false },
    );
    if (error) throw error;

    return Response.json(
      {
        attachmentId: intent.id,
        path: data.path,
        token: data.token,
        contentType: parsed.data.contentType,
        size: parsed.data.size,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    await markAttachmentRejected(intent.id, resident.userId);
    throw error;
  }
}