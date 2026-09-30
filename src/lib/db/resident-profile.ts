import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export type ResidentProfile = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  birthDate: string;
  civilStatus: string | null;
  contactNumber: string | null;
  houseStreet: string;
  purokSitio: string | null;
  barangay: string;
  municipality: string;
  province: string;
  postalCode: string | null;
  profileVerifiedAt: string | null;
};

type ResidentProfileInput = Omit<ResidentProfile, "profileVerifiedAt">;

export async function getResidentProfile(userId: string) {
  const result = await getDatabasePool().query<ResidentProfile>(
    `SELECT
       first_name AS "firstName",
       middle_name AS "middleName",
       last_name AS "lastName",
       suffix,
       birth_date::text AS "birthDate",
       civil_status AS "civilStatus",
       contact_number AS "contactNumber",
       house_street AS "houseStreet",
       purok_sitio AS "purokSitio",
       barangay,
       municipality,
       province,
       postal_code AS "postalCode",
       profile_verified_at AS "profileVerifiedAt"
     FROM resident_profiles
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function saveResidentProfile(
  userId: string,
  profile: ResidentProfileInput,
) {
  const result = await getDatabasePool().query<ResidentProfile>(
    `INSERT INTO resident_profiles (
       user_id, first_name, middle_name, last_name, suffix, birth_date,
       civil_status, contact_number, house_street, purok_sitio, barangay,
       municipality, province, postal_code
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
     )
     ON CONFLICT (user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       middle_name = EXCLUDED.middle_name,
       last_name = EXCLUDED.last_name,
       suffix = EXCLUDED.suffix,
       birth_date = EXCLUDED.birth_date,
       civil_status = EXCLUDED.civil_status,
       contact_number = EXCLUDED.contact_number,
       house_street = EXCLUDED.house_street,
       purok_sitio = EXCLUDED.purok_sitio,
       barangay = EXCLUDED.barangay,
       municipality = EXCLUDED.municipality,
       province = EXCLUDED.province,
       postal_code = EXCLUDED.postal_code,
       profile_verified_at = NULL,
       verified_by = NULL,
       updated_at = now()
     RETURNING
       first_name AS "firstName",
       middle_name AS "middleName",
       last_name AS "lastName",
       suffix,
       birth_date::text AS "birthDate",
       civil_status AS "civilStatus",
       contact_number AS "contactNumber",
       house_street AS "houseStreet",
       purok_sitio AS "purokSitio",
       barangay,
       municipality,
       province,
       postal_code AS "postalCode",
       profile_verified_at AS "profileVerifiedAt"`,
    [
      userId,
      profile.firstName,
      profile.middleName,
      profile.lastName,
      profile.suffix,
      profile.birthDate,
      profile.civilStatus,
      profile.contactNumber,
      profile.houseStreet,
      profile.purokSitio,
      profile.barangay,
      profile.municipality,
      profile.province,
      profile.postalCode,
    ],
  );

  return result.rows[0];
}