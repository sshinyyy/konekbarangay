import "server-only";

import { z } from "zod";

const databaseSchema = z.object({
  url: z.string().min(1),
});

const supabaseAdminSchema = z.object({
  url: z.url(),
  serviceRoleKey: z.string().min(1),
});

const supabaseBucketSchema = z.object({
  bucket: z.string().min(1),
});

const qrSigningSchema = z.object({
  keyId: z.string().trim().min(1).max(64),
  secret: z.string().min(43).max(44),
  previousKeys: z.string(),
});
const qrVerificationKeysSchema = z.record(
  z.string().trim().min(1).max(64),
  z.string().min(43).max(44),
);

export function getSupabaseAdminConfig() {
  return supabaseAdminSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function getDatabaseUrl() {
  return databaseSchema.parse({ url: process.env.DATABASE_URL }).url;
}

export function getSupabaseStorageBucketName() {
  return supabaseBucketSchema.parse({
    bucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  }).bucket;
}

export function getQrSigningConfig() {
  const config = qrSigningSchema.parse({
    keyId: process.env.QR_SIGNING_KEY_ID,
    secret: process.env.QR_SIGNING_SECRET,
    previousKeys: process.env.QR_SIGNING_PREVIOUS_KEYS ?? "{}",
  });
  const key = Buffer.from(config.secret, "base64url");

  if (key.length !== 32) {
    throw new Error("QR_SIGNING_SECRET must encode exactly 32 random bytes.");
  }

  let previousKeySecrets: Record<string, string>;
  try {
    previousKeySecrets = qrVerificationKeysSchema.parse(JSON.parse(config.previousKeys));
  } catch {
    throw new Error("QR_SIGNING_PREVIOUS_KEYS must be a JSON object of key IDs to base64url secrets.");
  }

  const verificationKeys = new Map<string, Buffer>([[config.keyId, key]]);
  for (const [previousKeyId, previousSecret] of Object.entries(previousKeySecrets)) {
    if (previousKeyId === config.keyId) {
      throw new Error("QR_SIGNING_PREVIOUS_KEYS must not repeat the active key ID.");
    }
    const previousKey = Buffer.from(previousSecret, "base64url");
    if (previousKey.length !== 32) {
      throw new Error(`QR verification key ${previousKeyId} must encode exactly 32 random bytes.`);
    }
    verificationKeys.set(previousKeyId, previousKey);
  }

  return { keyId: config.keyId, key, verificationKeys };
}