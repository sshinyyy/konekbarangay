import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getQrSigningConfig } from "@/lib/config/env";

const claimsSchema = z.object({
  v: z.literal(1),
  kid: z.string().min(1).max(64),
  documentId: z.uuid(),
  serial: z.string().min(1).max(80),
  type: z.enum(["barangay_clearance", "barangay_id", "certificate_of_residency"]),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type VerificationClaims = z.infer<typeof claimsSchema>;

function signatureFor(encodedPayload: string, key: Buffer) {
  return createHmac("sha256", key).update(encodedPayload, "utf8").digest("hex");
}

export function signVerificationClaims(
  claims: Omit<VerificationClaims, "v" | "kid">,
) {
  const { keyId, key } = getQrSigningConfig();
  const canonicalClaims: VerificationClaims = {
    v: 1,
    kid: keyId,
    ...claims,
  };
  const encodedPayload = Buffer.from(JSON.stringify(canonicalClaims), "utf8").toString("base64url");
  const signature = signatureFor(encodedPayload, key);

  return {
    claims: canonicalClaims,
    signature,
    token: `${encodedPayload}.${signature}`,
  };
}

export function verifyVerificationToken(token: string) {
  if (token.length > 2048) return { valid: false as const, claims: null, signature: null };
  const [encodedPayload, suppliedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !suppliedSignature || rest.length > 0 || !/^[0-9a-f]{64}$/.test(suppliedSignature)) {
    return { valid: false as const, claims: null, signature: null };
  }

  let claims: VerificationClaims;
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
    if (!parsed.success) return { valid: false as const, claims: null, signature: null };
    claims = parsed.data;
  } catch {
    return { valid: false as const, claims: null, signature: null };
  }

  const { verificationKeys } = getQrSigningConfig();
  const key = verificationKeys.get(claims.kid);
  if (!key) return { valid: false as const, claims, signature: suppliedSignature };

  const expectedSignature = signatureFor(encodedPayload, key);
  const expected = Buffer.from(expectedSignature, "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  return {
    valid: expected.length === supplied.length && timingSafeEqual(expected, supplied),
    claims,
    signature: suppliedSignature,
  };
}