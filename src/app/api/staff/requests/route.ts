import { z } from "zod";
import { requireStaff } from "@/lib/auth/require-staff";
import { getStaffRequestQueue } from "@/lib/db/staff-requests";

const statusSchema = z.enum([
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "rejected",
  "generating",
  "ready_for_issuance",
  "issued",
  "cancelled",
]);
const queueQuerySchema = z.object({
  status: statusSchema.or(z.literal("all")).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  q: z.string().trim().max(100).default(""),
});

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if ("response" in staff) return staff.response;

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = queueQuerySchema.safeParse({
    status: searchParams.get("status") ?? "all",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "25",
    q: searchParams.get("q") ?? "",
  });

  if (!parsedQuery.success) {
    return Response.json({ error: "invalid_queue_query" }, { status: 400, headers: noStoreHeaders });
  }

  const { status, page, pageSize, q } = parsedQuery.data;
  const result = await getStaffRequestQueue({
    status: status === "all" ? null : status,
    search: q,
    page,
    pageSize,
    staffUserId: staff.userId,
    canManageAll: staff.role === "admin",
  });
  return Response.json({ ...result, page, pageSize }, { headers: noStoreHeaders });
}