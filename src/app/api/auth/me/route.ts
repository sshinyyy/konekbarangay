import {
  InvalidSupabaseAccessTokenError,
  verifySupabaseAccessToken,
} from "@/lib/auth/verify-supabase-token";
import { findActiveAppUser } from "@/lib/auth/app-user";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  try {
    const identity = await verifySupabaseAccessToken(match[1]);
    const appUser = await findActiveAppUser(identity.id);

    if (!appUser) {
      return Response.json(
        { error: "account_unavailable" },
        { status: 403, headers: noStoreHeaders },
      );
    }

    return Response.json(
      {
        userId: appUser.id,
        role: appUser.role,
        uid: identity.id,
        email: identity.email ?? null,
        emailVerified: Boolean(identity.email_confirmed_at),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof InvalidSupabaseAccessTokenError) {
      return Response.json(
        { error: "unauthenticated" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    throw error;
  }
}