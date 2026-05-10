import { describe, expect, it } from "vitest";
import { validateOwnerSession } from "../src/services/auth/session-validation.js";

describe("validateOwnerSession service", () => {
  it("returns forbidden when owner is not found", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "00000000-0000-0000-0000-000000000099",
      role: "super_admin",
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("forbidden");
  });

  it("returns forbidden when owner status is not active", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "suspended", sessionVersion: 1 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("forbidden");
  });

  it("returns session_stale when sessionVersion does not match", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 5 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 3,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("session_stale");
  });

  it("returns session_stale when role does not match DB row", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 1 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "read_only",
      sessionVersion: 1,
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("session_stale");
  });

  it("returns success when owner is active and session is current", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: "owner-1", role: "super_admin", status: "active", sessionVersion: 2 },
            ],
          }),
        }),
      }),
    } as unknown as Parameters<typeof validateOwnerSession>[0];

    const result = await validateOwnerSession(db, {
      ownerId: "owner-1",
      role: "super_admin",
      sessionVersion: 2,
    });

    expect(result.success).toBe(true);
    expect((result as { data: { id: string } }).data.id).toBe("owner-1");
  });
});
