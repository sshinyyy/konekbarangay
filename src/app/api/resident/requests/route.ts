import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import {
  createResidentDocumentRequest,
  DOCUMENT_TYPES,
  getResidentDocumentRequests,
  ResidentProfileRequiredError,
} from "@/lib/db/document-requests";

const requestSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  purpose: z.string().trim().min(3).max(500),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const resident = await requireResident(request);

  if ("response" in resident) {
    return resident.response;
  }

  const requests = await getResidentDocumentRequests(resident.userId);
  return Response.json({ requests }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const resident = await requireResident(request);

  if ("response" in resident) {
    return resident.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const year = new Date().getUTCFullYear();
  const requestNumber = `BRGY-${year}-${randomBytes(6).toString("hex").toUpperCase()}`;

  try {
    const documentRequest = await createResidentDocumentRequest({
      userId: resident.userId,
      requestNumber,
      ...parsed.data,
    });

    return Response.json(
      { request: documentRequest },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof ResidentProfileRequiredError) {
      return Response.json(
        { error: "profile_required" },
        { status: 409, headers: noStoreHeaders },
      );
    }

    throw error;
  }
}