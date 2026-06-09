import { describe, expect, it } from "vitest";

import { buildSocketAllowedOrigins } from "./tenant-env.js";

describe("buildSocketAllowedOrigins", () => {
  it("derives direct local port origins from baseUrl and port (any tenant slug)", () => {
    const origins = buildSocketAllowedOrigins("http://acme-corp.localhost", 4100);
    expect(origins).toContain("http://acme-corp.localhost");
    expect(origins).toContain("http://127.0.0.1:4100");
    expect(origins).toContain("http://localhost:4100");
    expect(origins).toContain("http://acme-corp.localhost:4100");
  });

  it("does not embed a fixed tenant slug or port", () => {
    const origins = buildSocketAllowedOrigins("https://tenant-z.example.com", 5200);
    expect(origins).not.toContain("dajo");
    expect(origins).toContain("http://127.0.0.1:5200");
    expect(origins).toContain("https://tenant-z.example.com");
  });
});
