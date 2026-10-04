import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockQuery = vi.fn();

vi.mock("@/lib/db/pool", () => ({
  getDatabasePool: () => ({
    query: mockQuery,
  }),
}));

import { resolveAppUserIdentityColumn } from "@/lib/auth/app-user";

describe("resolveAppUserIdentityColumn", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("prefers the current auth_user_id column when present", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ column_name: "auth_user_id" }, { column_name: "firebase_uid" }],
    });

    await expect(resolveAppUserIdentityColumn()).resolves.toBe("auth_user_id");
  });

  it("falls back to firebase_uid for legacy app_users tables", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ column_name: "firebase_uid" }],
    });

    await expect(resolveAppUserIdentityColumn()).resolves.toBe("firebase_uid");
  });
});
