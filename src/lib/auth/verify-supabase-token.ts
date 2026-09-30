import "server-only";

import { getSupabaseAuthClient } from "@/lib/supabase/server";

export class InvalidSupabaseAccessTokenError extends Error {}

export async function verifySupabaseAccessToken(accessToken: string) {
  const { data, error } = await getSupabaseAuthClient().auth.getUser(accessToken);

  if (error) {
    if (error.status === 401 || error.status === 403) {
      throw new InvalidSupabaseAccessTokenError("Supabase access token is invalid.");
    }
    throw error;
  }

  if (!data.user) {
    throw new InvalidSupabaseAccessTokenError("Supabase access token is invalid.");
  }

  return data.user;
}