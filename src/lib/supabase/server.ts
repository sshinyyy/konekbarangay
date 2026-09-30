import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/config/public-env";
import { getSupabaseAdminConfig } from "@/lib/config/env";

let authClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export function getSupabaseAuthClient() {
  if (!authClient) {
    const config = getPublicSupabaseConfig();
    authClient = createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return authClient;
}

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const config = getSupabaseAdminConfig();
    adminClient = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return adminClient;
}