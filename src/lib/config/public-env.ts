import { z } from "zod";

const publicSupabaseSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
  storageBucket: z.string().min(1),
});

export function getPublicSupabaseConfig() {
  return publicSupabaseSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    storageBucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  });
}