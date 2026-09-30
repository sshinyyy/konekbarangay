import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signVerificationClaims, verifyVerificationToken } from "@/lib/documents/qr-signing";

const testSecret = Buffer.alloc(32, 42).toString("base64url");
const claims = {
  documentId: "df567e71-ffc9-4a02-ae02-f2be3fedf477",
  serial: "BRGY-2026-TEST001",
  type: "barangay_clearance" as const,
  issuedAt: "2026-09-30T09:00:00.000Z",
  expiresAt: null,
  contentSha256: "a".repeat(64),
};

describe("QR verification tokens", () => {
  beforeEach(() => {
    vi.stubEnv("QR_SIGNING_KEY_ID", "test-key-1");
    vi.stubEnv("QR_SIGNING_SECRET", testSecret);
    vi.stubEnv("QR_SIGNING_PREVIOUS_KEYS", "{}");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs claims that verify with the configured key", () => {
    const signed = signVerificationClaims(claims);

    expect(verifyVerificationToken(signed.token)).toEqual({
      valid: true,
      claims: signed.claims,
      signature: signed.signature,
    });
  });

  it("rejects a modified signature", () => {
    const signed = signVerificationClaims(claims);
    const [payload, signature] = signed.token.split(".");
    const modifiedSignature = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;

    expect(verifyVerificationToken(`${payload}.${modifiedSignature}`).valid).toBe(false);
  });

  it("rejects a correctly signed token with an unconfigured key ID", () => {
    const signed = signVerificationClaims(claims);
    const encodedClaims = Buffer.from(
      JSON.stringify({ ...signed.claims, kid: "retired-key" }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", Buffer.from(testSecret, "base64url"))
      .update(encodedClaims, "utf8")
      .digest("hex");

    expect(verifyVerificationToken(`${encodedClaims}.${signature}`)).toMatchObject({
      valid: false,
      claims: { kid: "retired-key" },
    });
  });

  it("verifies retained prior keys but signs new claims with the active key", () => {
    const previousKeyId = "test-key-0";
    const previousSecret = Buffer.alloc(32, 7).toString("base64url");
    vi.stubEnv("QR_SIGNING_PREVIOUS_KEYS", JSON.stringify({ [previousKeyId]: previousSecret }));
    const encodedClaims = Buffer.from(
      JSON.stringify({ v: 1, kid: previousKeyId, ...claims }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", Buffer.from(previousSecret, "base64url"))
      .update(encodedClaims, "utf8")
      .digest("hex");

    expect(verifyVerificationToken(`${encodedClaims}.${signature}`).valid).toBe(true);
    expect(signVerificationClaims(claims).claims.kid).toBe("test-key-1");
  });

  it("rejects malformed retained-key configuration", () => {
    vi.stubEnv("QR_SIGNING_PREVIOUS_KEYS", "not-json");

    expect(() => verifyVerificationToken(signVerificationClaims(claims).token))
      .toThrow("QR_SIGNING_PREVIOUS_KEYS must be a JSON object of key IDs to base64url secrets.");
  });

  it("rejects malformed claims and oversized tokens", () => {
    const malformedClaims = Buffer.from(JSON.stringify({ ...claims, v: 2 }), "utf8")
      .toString("base64url");

    expect(verifyVerificationToken(`${malformedClaims}.${"0".repeat(64)}`)).toEqual({
      valid: false,
      claims: null,
      signature: null,
    });
    expect(verifyVerificationToken("x".repeat(2049))).toEqual({
      valid: false,
      claims: null,
      signature: null,
    });
  });
});