import { z } from "zod";
import { requireResident } from "@/lib/auth/require-resident";
import {
  getResidentProfile,
  saveResidentProfile,
} from "@/lib/db/resident-profile";

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).transform((value) => value || null);

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalText(100),
  lastName: z.string().trim().min(1).max(100),
  suffix: optionalText(30),
  birthDate: z.iso.date().refine((value) => value <= new Date().toISOString().slice(0, 10), {
    message: "Birth date cannot be in the future.",
  }),
  civilStatus: optionalText(40),
  contactNumber: optionalText(32),
  houseStreet: z.string().trim().min(1).max(200),
  purokSitio: optionalText(100),
  barangay: z.string().trim().min(1).max(100),
  municipality: z.string().trim().min(1).max(100),
  province: z.string().trim().min(1).max(100),
  postalCode: optionalText(20),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const resident = await requireResident(request);

  if ("response" in resident) {
    return resident.response;
  }

  const profile = await getResidentProfile(resident.userId);
  return Response.json({ profile }, { headers: noStoreHeaders });
}

export async function PUT(request: Request) {
  const resident = await requireResident(request);

  if ("response" in resident) {
    return resident.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_profile", issues: parsed.error.issues },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const profile = await saveResidentProfile(resident.userId, parsed.data);
  return Response.json({ profile }, { headers: noStoreHeaders });
}