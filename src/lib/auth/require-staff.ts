import "server-only";

import { findActiveAppUser } from "@/lib/auth/app-user";
import {
  InvalidSupabaseAccessTokenError,
  verifySupabaseAccessToken,
} from "@/lib/auth/verify-supabase-token";

const noStoreHeaders = { "Cache-Control": "no-store" };

export type StaffAccess =
  | { userId: string; role: "staff" | "admin" }
  | { response: Response };

export async function requireStaff(request: Request): Promise<StaffAccess> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return {
      response: Response.json(
        { error: "unauthenticated" },
        { status: 401, headers: noStoreHeaders },
      ),
    };
  }

  try {
    const identity = await verifySupabaseAccessToken(match[1]);
    const appUser = await findActiveAppUser(identity.id);

    if (!appUser || (appUser.role !== "staff" && appUser.role !== "admin")) {
      return {
        response: Response.json(
          { error: "forbidden" },
          { status: 403, headers: noStoreHeaders },
        ),
      };
    }

    return { userId: appUser.id, role: appUser.role };
  } catch (error) {
    if (error instanceof InvalidSupabaseAccessTokenError) {
      return {
        response: Response.json(
          { error: "unauthenticated" },
          { status: 401, headers: noStoreHeaders },
        ),
      };
    }

    throw error;
  }
}