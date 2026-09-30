import "server-only";

import { findActiveAppUser } from "@/lib/auth/app-user";
import {
  InvalidSupabaseAccessTokenError,
  verifySupabaseAccessToken,
} from "@/lib/auth/verify-supabase-token";

const noStoreHeaders = { "Cache-Control": "no-store" };

export type ResidentAccess =
  | { userId: string }
  | { response: Response };

export async function requireResident(request: Request): Promise<ResidentAccess> {
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

    if (!appUser || appUser.role !== "resident") {
      return {
        response: Response.json(
          { error: "forbidden" },
          { status: 403, headers: noStoreHeaders },
        ),
      };
    }

    return { userId: appUser.id };
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