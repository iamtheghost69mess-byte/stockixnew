import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

vi.mock("@repo/config", () => ({
  apiConfig: {
    nodeEnv: "production",
  },
}));

import { execa } from "execa";

import {
  assertRequiredTenantImages,
  checkRequiredTenantImages,
} from "./check-tenant-images.js";

describe("checkRequiredTenantImages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws in production when Finance images are missing", async () => {
    vi.mocked(execa).mockRejectedValue(new Error("No such image"));

    await expect(checkRequiredTenantImages()).rejects.toThrow(
      "Required tenant images missing",
    );
  });
});

describe("assertRequiredTenantImages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws when stockix-server:local is missing", async () => {
    vi.mocked(execa).mockRejectedValue(new Error("No such image"));

    await expect(assertRequiredTenantImages()).rejects.toThrow("stockix-server:local");
  });
});
