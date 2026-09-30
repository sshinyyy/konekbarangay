import { requireResident } from "@/lib/auth/require-resident";
import { getResidentNotifications } from "@/lib/db/resident-notifications";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const resident = await requireResident(request);
  if ("response" in resident) return resident.response;

  const result = await getResidentNotifications(resident.userId);
  return Response.json(result, { headers: noStoreHeaders });
}