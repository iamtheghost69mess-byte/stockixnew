import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "app");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("dashboard auth pages stay HTTP-only", () => {
  it("login page only uses dashboard relay endpoint", () => {
    const src = read("(auth)/login/page.tsx");
    expect(src).toContain('fetch("/api/session/login"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
    expect(src).not.toContain("sessionToken");
    expect(src).not.toContain("mfaToken");
  });

  it("settings page uses relay endpoints and no token storage", () => {
    const src = read("(dashboard)/settings/page.tsx");
    expect(src).toContain('fetch("/api/security/mfa/status"');
    expect(src).toContain('fetch("/api/security/mfa/begin"');
    expect(src).toContain('fetch("/api/security/mfa/enable"');
    expect(src).toContain('fetch("/api/security/mfa/disable"');
    expect(src).not.toMatch(/window\.localStorage|sessionToken|mfaToken/);
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });

  it("accept-invite page delegates auth to relay endpoints", () => {
    const src = read("(auth)/accept-invite/page.tsx");
    expect(src).toContain('fetch(`/api/auth/invite/${token}`)');
    expect(src).toContain('fetch("/api/auth/invite/accept"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });
});
