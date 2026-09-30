import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import { getIssuedDocumentForResident } from "@/lib/db/request-attachments";
import { getSupabaseAdminStorage } from "@/lib/supabase/storage-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const resident = await requireResident(request);
  if ("response" in resident) return resident.response;

  const { documentId } = await context.params;
  if (!z.uuid().safeParse(documentId).success) {
    return Response.json({ error: "document_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const document = await getIssuedDocumentForResident(documentId, resident.userId);
  if (!document) {
    return Response.json({ error: "document_not_found" }, { status: 404, headers: noStoreHeaders });
  }

  const { data, error } = await getSupabaseAdminStorage().createSignedUrl(
    document.storageObjectPath,
    60,
    { download: `${document.serialNumber}.pdf` },
  );
  if (error) throw error;

  return Response.json({ signedUrl: data.signedUrl }, { headers: noStoreHeaders });
}