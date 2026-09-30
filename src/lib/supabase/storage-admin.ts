import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseStorageBucketName } from "@/lib/config/env";

export function getSupabaseAdminStorage() {
  return getSupabaseAdminClient().storage.from(getSupabaseStorageBucketName());
}