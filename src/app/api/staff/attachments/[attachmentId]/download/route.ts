import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { getUploadedAttachmentForStaff } from "@/lib/db/request-attachments";
import { getSupabaseAdminStorage } from "@/lib/supabase/storage-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const { attachmentId } = await context.params;
  if (!z.uuid().safeParse(attachmentId).success) {
    return Response.json({ error: "attachment_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const attachment = await getUploadedAttachmentForStaff(
    attachmentId,
    staff.userId,
    staff.role === "admin",
  );
  if (!attachment) {
    return Response.json({ error: "attachment_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const { data, error } = await getSupabaseAdminStorage().createSignedUrl(
    attachment.storageObjectPath,
    60,
    { download: attachment.originalFilename },
  );
  if (error) throw error;

  return Response.json(
    { signedUrl: data.signedUrl, contentType: attachment.contentType },
    { headers: noStoreHeaders },
  );
}