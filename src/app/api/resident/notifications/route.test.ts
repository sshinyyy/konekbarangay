import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireResident: vi.fn(),
  getResidentNotifications: vi.fn(),
  markResidentNotificationRead: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-resident", () => ({ requireResident: mocks.requireResident }));
vi.mock("@/lib/db/resident-notifications", () => ({
  getResidentNotifications: mocks.getResidentNotifications,
  markResidentNotificationRead: mocks.markResidentNotificationRead,
}));

import { GET } from "@/app/api/resident/notifications/route";
import { PATCH } from "@/app/api/resident/notifications/[notificationId]/route";

const notificationId = "df567e71-ffc9-4a02-ae02-f2be3fedf477";

describe("resident notification routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireResident.mockResolvedValue({ userId: "resident-app-id" });
    mocks.getResidentNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
    mocks.markResidentNotificationRead.mockResolvedValue({
      id: notificationId,
      readAt: "2026-09-30T12:00:00.000Z",
    });
  });

  it("does not query notifications when resident access is denied", async () => {
    const denied = Response.json({ error: "unauthenticated" }, { status: 401 });
    mocks.requireResident.mockResolvedValueOnce({ response: denied });

    const response = await GET(new Request("http://localhost/api/resident/notifications"));

    expect(response).toBe(denied);
    expect(mocks.getResidentNotifications).not.toHaveBeenCalled();
  });

  it("returns the current resident's notifications without caching", async () => {
    mocks.getResidentNotifications.mockResolvedValueOnce({
      notifications: [{ id: notificationId, message: "Request updated", readAt: null }],
      unreadCount: 1,
    });

    const response = await GET(new Request("http://localhost/api/resident/notifications"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      notifications: [{ id: notificationId, message: "Request updated", readAt: null }],
      unreadCount: 1,
    });
    expect(mocks.getResidentNotifications).toHaveBeenCalledWith("resident-app-id");
  });

  it("marks only a resident-owned notification as read", async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/resident/notifications/${notificationId}`, { method: "PATCH" }),
      { params: Promise.resolve({ notificationId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notification: { id: notificationId, readAt: "2026-09-30T12:00:00.000Z" },
    });
    expect(mocks.markResidentNotificationRead).toHaveBeenCalledWith(notificationId, "resident-app-id");
  });

  it("does not reveal invalid or unavailable notification IDs", async () => {
    const invalid = await PATCH(
      new Request("http://localhost/api/resident/notifications/bad", { method: "PATCH" }),
      { params: Promise.resolve({ notificationId: "bad" }) },
    );
    expect(invalid.status).toBe(404);
    expect(mocks.markResidentNotificationRead).not.toHaveBeenCalled();

    mocks.markResidentNotificationRead.mockResolvedValueOnce(null);
    const unavailable = await PATCH(
      new Request(`http://localhost/api/resident/notifications/${notificationId}`, { method: "PATCH" }),
      { params: Promise.resolve({ notificationId }) },
    );
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({ error: "notification_not_found" });
  });
});