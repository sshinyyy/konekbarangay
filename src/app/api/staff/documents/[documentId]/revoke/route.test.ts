import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class IssuedDocumentNotFoundError extends Error {}
  class IssuedDocumentAlreadyRevokedError extends Error {}
  return {
    requireStaff: vi.fn(),
    revokeIssuedDocument: vi.fn(),
    IssuedDocumentNotFoundError,
    IssuedDocumentAlreadyRevokedError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/db/revoke-issued-document", () => ({
  IssuedDocumentAlreadyRevokedError: mocks.IssuedDocumentAlreadyRevokedError,
  IssuedDocumentNotFoundError: mocks.IssuedDocumentNotFoundError,
  revokeIssuedDocument: mocks.revokeIssuedDocument,
}));

import { POST } from "@/app/api/staff/documents/[documentId]/revoke/route";

const documentId = "df567e71-ffc9-4a02-ae02-f2be3fedf477";

function createRequest(body: unknown = { reason: "Issued with incorrect details" }) {
  return new Request(`http://localhost/api/staff/documents/${documentId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createContext(id = documentId) {
  return { params: Promise.resolve({ documentId: id }) };
}

describe("staff issued-document revocation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireStaff.mockResolvedValue({ userId: "staff-app-id", role: "staff" });
    mocks.revokeIssuedDocument.mockResolvedValue({
      documentId,
      serialNumber: "BRGY-2026-TEST001",
      revokedAt: "2026-09-30T12:00:00.000Z",
    });
  });

  it("returns the staff guard response without performing a revocation", async () => {
    const denied = Response.json({ error: "forbidden" }, { status: 403 });
    mocks.requireStaff.mockResolvedValueOnce({ response: denied });

    const response = await POST(createRequest(), createContext());

    expect(response).toBe(denied);
    expect(mocks.revokeIssuedDocument).not.toHaveBeenCalled();
  });

  it("rejects invalid document IDs and invalid reasons", async () => {
    const invalidIdResponse = await POST(createRequest(), createContext("bad-id"));
    expect(invalidIdResponse.status).toBe(404);

    const invalidReasonResponse = await POST(createRequest({ reason: "no" }), createContext());
    expect(invalidReasonResponse.status).toBe(400);
    expect(mocks.revokeIssuedDocument).not.toHaveBeenCalled();
  });

  it("returns not found when the issued document does not exist", async () => {
    mocks.revokeIssuedDocument.mockRejectedValueOnce(new mocks.IssuedDocumentNotFoundError());

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "document_not_found" });
  });

  it("returns a conflict when the document is already revoked", async () => {
    mocks.revokeIssuedDocument.mockRejectedValueOnce(new mocks.IssuedDocumentAlreadyRevokedError());

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "document_already_revoked" });
  });

  it("revokes with the authenticated staff actor and supplied reason", async () => {
    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      document: {
        documentId,
        serialNumber: "BRGY-2026-TEST001",
        revokedAt: "2026-09-30T12:00:00.000Z",
      },
    });
    expect(mocks.revokeIssuedDocument).toHaveBeenCalledWith({
      documentId,
      actorUserId: "staff-app-id",
      canManageAll: false,
      reason: "Issued with incorrect details",
    });
  });
});