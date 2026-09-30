"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/config/public-env";

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (!browserClient) {
    const config = getPublicSupabaseConfig();
    browserClient = createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return browserClient;
}

export function signIn(email: string, password: string) {
  return getSupabaseClient().auth.signInWithPassword({ email, password });
}

export function createResidentIdentity(
  email: string,
  password: string,
  displayName: string,
) {
  return getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${window.location.origin}/register`,
    },
  });
}

export function resendResidentSignupConfirmation(email: string) {
  return getSupabaseClient().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}/register` },
  });
}

export function signOut() {
  return getSupabaseClient().auth.signOut();
}