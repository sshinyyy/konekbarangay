import { z } from "zod";
import {
  registerResidentAccount,
  ResidentRegistrationConflictError,
} from "@/lib/auth/app-user";
import {
  InvalidSupabaseAccessTokenError,
  verifySupabaseAccessToken,
} from "@/lib/auth/verify-supabase-token";

const registrationSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = registrationSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { error: "invalid_registration" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const identity = await verifySupabaseAccessToken(match[1]);

    if (!identity.email) {
      return Response.json(
        { error: "email_required" },
        { status: 400, headers: noStoreHeaders },
      );
    }
    if (!identity.email_confirmed_at) {
      return Response.json(
        { error: "email_confirmation_required" },
        { status: 403, headers: noStoreHeaders },
      );
    }

    const account = await registerResidentAccount({
      authUserId: identity.id,
      email: identity.email,
      displayName: parsedBody.data.displayName,
      emailVerified: true,
    });

    return Response.json(
      { userId: account.id, role: account.role },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof InvalidSupabaseAccessTokenError) {
      return Response.json(
        { error: "unauthenticated" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    if (error instanceof ResidentRegistrationConflictError) {
      return Response.json(
        { error: "account_unavailable" },
        { status: 409, headers: noStoreHeaders },
      );
    }

    throw error;
  }
}