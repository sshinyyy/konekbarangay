import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAppUser: vi.fn(),
  verifySupabaseAccessToken: vi.fn(),
  getIssuedDocumentForResident: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/app-user", () => ({
  findActiveAppUser: mocks.findActiveAppUser,
}));
vi.mock("@/lib/auth/verify-supabase-token", () => ({
  InvalidSupabaseAccessTokenError: class InvalidSupabaseAccessTokenError extends Error {},
  verifySupabaseAccessToken: mocks.verifySupabaseAccessToken,
}));
vi.mock("@/lib/db/request-attachments", () => ({
  getIssuedDocumentForResident: mocks.getIssuedDocumentForResident,
}));
vi.mock("@/lib/supabase/storage-admin", () => ({
  getSupabaseAdminStorage: () => ({ createSignedUrl: mocks.createSignedUrl }),
}));

import { GET } from "@/app/api/resident/documents/[documentId]/download/route";

const documentId = "df567e71-ffc9-4a02-ae02-f2be3fedf477";

function createRequest(withAuthorization = true) {
  return new Request(`http://localhost/api/resident/documents/${documentId}/download`, {
    headers: withAuthorization ? { Authorization: "Bearer access-token" } : undefined,
  });
}

function createContext(id = documentId) {
  return { params: Promise.resolve({ documentId: id }) };
}

describe("resident issued-document download route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifySupabaseAccessToken.mockResolvedValue({ id: "auth-resident-id" });
    mocks.findActiveAppUser.mockResolvedValue({ id: "resident-app-id", role: "resident" });
    mocks.getIssuedDocumentForResident.mockResolvedValue({
      storageObjectPath: "issued/request/document/v1.pdf",
      serialNumber: "BRGY-2026-TEST001",
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-document" },
      error: null,
    });
  });

  it("rejects requests without a bearer token before querying storage", async () => {
    const response = await GET(createRequest(false), createContext());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(mocks.getIssuedDocumentForResident).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("denies staff accounts from the resident download route", async () => {
    mocks.findActiveAppUser.mockResolvedValueOnce({ id: "staff-app-id", role: "staff" });

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.getIssuedDocumentForResident).not.toHaveBeenCalled();
  });

  it("returns not found for invalid IDs without querying for a document", async () => {
    const response = await GET(createRequest(), createContext("invalid-id"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "document_not_found" });
    expect(mocks.getIssuedDocumentForResident).not.toHaveBeenCalled();
  });

  it("does not reveal documents unavailable to the resident", async () => {
    mocks.getIssuedDocumentForResident.mockResolvedValueOnce(null);

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "document_not_found" });
    expect(mocks.getIssuedDocumentForResident).toHaveBeenCalledWith(documentId, "resident-app-id");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("creates a 60-second download URL for the resident-owned document", async () => {
    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      signedUrl: "https://storage.example/signed-document",
    });
    expect(mocks.getIssuedDocumentForResident).toHaveBeenCalledWith(documentId, "resident-app-id");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "issued/request/document/v1.pdf",
      60,
      { download: "BRGY-2026-TEST001.pdf" },
    );
  });
});