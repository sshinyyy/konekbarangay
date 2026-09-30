import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  getStaffRequestQueue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/db/staff-requests", () => ({ getStaffRequestQueue: mocks.getStaffRequestQueue }));

import { GET } from "@/app/api/staff/requests/route";

describe("staff request queue route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireStaff.mockResolvedValue({ userId: "staff-app-id", role: "staff" });
    mocks.getStaffRequestQueue.mockResolvedValue({
      requests: [{ id: "request-1", requestNumber: "BRGY-1001" }],
      total: 41,
    });
  });

  it("returns the staff guard response without querying requests", async () => {
    const denied = Response.json({ error: "forbidden" }, { status: 403 });
    mocks.requireStaff.mockResolvedValueOnce({ response: denied });

    const response = await GET(new Request("http://localhost/api/staff/requests"));

    expect(response).toBe(denied);
    expect(mocks.getStaffRequestQueue).not.toHaveBeenCalled();
  });

  it("defaults to the first bounded page of all requests", async () => {
    const response = await GET(new Request("http://localhost/api/staff/requests"));

    expect(response.status).toBe(200);
    expect(mocks.getStaffRequestQueue).toHaveBeenCalledWith({
      status: null,
      search: "",
      page: 1,
      pageSize: 25,
      staffUserId: "staff-app-id",
      canManageAll: false,
    });
    expect(await response.json()).toEqual({
      requests: [{ id: "request-1", requestNumber: "BRGY-1001" }],
      total: 41,
      page: 1,
      pageSize: 25,
    });
  });

  it("passes status, search, and requested page to the query", async () => {
    const response = await GET(new Request(
      "http://localhost/api/staff/requests?status=under_review&page=2&pageSize=10&q=Jane%20Doe",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getStaffRequestQueue).toHaveBeenCalledWith({
      status: "under_review",
      search: "Jane Doe",
      page: 2,
      pageSize: 10,
      staffUserId: "staff-app-id",
      canManageAll: false,
    });
  });

  it("rejects out-of-range or malformed query parameters", async () => {
    const response = await GET(new Request(
      "http://localhost/api/staff/requests?status=all&page=0&pageSize=100",
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_queue_query" });
    expect(mocks.getStaffRequestQueue).not.toHaveBeenCalled();
  });
});