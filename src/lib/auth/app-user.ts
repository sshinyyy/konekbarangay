import "server-only";

import { getDatabasePool } from "@/lib/db/pool";

export type AppRole = "resident" | "staff" | "admin";
export type AppUserIdentityColumn = "auth_user_id" | "firebase_uid";

export type ActiveAppUser = {
  id: string;
  role: AppRole;
};

type AppUserRecord = ActiveAppUser & {
  is_active: boolean;
};

export class ResidentRegistrationConflictError extends Error {}

export async function resolveAppUserIdentityColumn(): Promise<AppUserIdentityColumn> {
  const result = await getDatabasePool().query<{ column_name: string }>(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'app_users'
       AND column_name IN ('auth_user_id', 'firebase_uid')
     ORDER BY CASE column_name WHEN 'auth_user_id' THEN 0 ELSE 1 END, column_name
  `);

  const columns = result.rows.map((row) => row.column_name);

  if (columns.includes("auth_user_id")) {
    return "auth_user_id";
  }

  if (columns.includes("firebase_uid")) {
    return "firebase_uid";
  }

  throw new Error("app_users table is missing the required auth user identifier column.");
}

export async function findActiveAppUser(
  authUserId: string,
): Promise<ActiveAppUser | null> {
  const identityColumn = await resolveAppUserIdentityColumn();
  const result = await getDatabasePool().query<ActiveAppUser>(
    `SELECT id, role
     FROM app_users
    WHERE ${identityColumn} = $1 AND is_active = true`,
    [authUserId],
  );

  return result.rows[0] ?? null;
}

export async function registerResidentAccount(input: {
  authUserId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}) {
  const pool = getDatabasePool();
  const identityColumn = await resolveAppUserIdentityColumn();

  if (input.emailVerified) {
    const linked = await pool.query<AppUserRecord>(
      `UPDATE app_users
       SET ${identityColumn} = $1,
           email = $2,
           display_name = $3,
           updated_at = now()
       WHERE id = (
         SELECT id
         FROM app_users
         WHERE lower(email) = lower($2)
           AND role = 'resident'
           AND is_active = true
           AND ${identityColumn} <> $1
         ORDER BY created_at
         LIMIT 1
       )
         AND NOT EXISTS (
           SELECT 1 FROM app_users WHERE ${identityColumn} = $1
         )
       RETURNING id, role, is_active`,
      [input.authUserId, input.email, input.displayName],
    );

    if (linked.rows[0]) {
      return linked.rows[0];
    }
  }

  const inserted = await pool.query<AppUserRecord>(
    `INSERT INTO app_users (${identityColumn}, role, email, display_name)
     VALUES ($1, 'resident', $2, $3)
     ON CONFLICT (${identityColumn}) DO NOTHING
     RETURNING id, role, is_active`,
    [input.authUserId, input.email, input.displayName],
  );

  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const existing = await pool.query<AppUserRecord>(
    `SELECT id, role, is_active
     FROM app_users
    WHERE ${identityColumn} = $1`,
    [input.authUserId],
  );
  const account = existing.rows[0];

  if (account?.role === "resident" && account.is_active) {
    return account;
  }

  throw new ResidentRegistrationConflictError(
    "This identity is not available for resident registration.",
  );
}