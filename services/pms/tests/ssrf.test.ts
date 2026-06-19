import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dns lookup
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";

// We import calendar-sync.ts dynamically or directly
// Since we want to test fetchICal (which is not exported), we can either test the public function syncCalendars with mocked DB,
// or we can test syncCalendars to ensure fetch is never called for private IPs.

describe("SSRF validation in calendar-sync.ts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("blocks private IPv4 addresses", async () => {
    const { syncCalendars } = await import("../src/lib/calendar-sync.js");

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "link-1",
              tenantId: "tenant-1",
              propertyId: "property-1",
              name: "Airbnb Feed",
              platform: "airbnb",
              importUrl: "http://10.0.0.1/feed.ics",
              failureCount: 0,
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    } as any;

    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.1", family: 4 });

    const summary = await syncCalendars(mockDb, { tenantId: "tenant-1" });

    expect(summary.errors).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("blocks loopback IPv4 addresses", async () => {
    const { syncCalendars } = await import("../src/lib/calendar-sync.js");

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "link-1",
              tenantId: "tenant-1",
              propertyId: "property-1",
              name: "Airbnb Feed",
              platform: "airbnb",
              importUrl: "http://localhost/feed.ics",
              failureCount: 0,
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    } as any;

    vi.mocked(lookup).mockResolvedValue({ address: "127.0.0.1", family: 4 });

    const summary = await syncCalendars(mockDb, { tenantId: "tenant-1" });

    expect(summary.errors).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows public IP addresses", async () => {
    const { syncCalendars } = await import("../src/lib/calendar-sync.js");

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "link-1",
              tenantId: "tenant-1",
              propertyId: "property-1",
              name: "Airbnb Feed",
              platform: "airbnb",
              importUrl: "https://example.com/feed.ics",
              failureCount: 0,
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    } as any;

    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("BEGIN:VCALENDAR\r\nEND:VCALENDAR"),
    } as any);

    const summary = await syncCalendars(mockDb, { tenantId: "tenant-1" });

    expect(summary.errors).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/feed.ics", expect.any(Object));
  });
});
