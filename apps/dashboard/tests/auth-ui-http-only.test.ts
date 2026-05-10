import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "app");
const componentsRoot = join(process.cwd(), "components");

function readApp(rel: string) {
  return readFileSync(join(appRoot, rel), "utf8");
}

function readComponent(rel: string) {
  return readFileSync(join(componentsRoot, rel), "utf8");
}

describe("dashboard auth pages stay HTTP-only", () => {
  it("login form only uses dashboard relay endpoint", () => {
    const src = readComponent("login-form.tsx");
    expect(src).toContain('fetch("/api/session/login"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
    expect(src).not.toContain("sessionToken");
    expect(src).not.toContain("mfaToken");
  });

  it("forgot-password page only uses dashboard relay endpoint", () => {
    const src = readApp("(auth)/forgot-password/page.tsx");
    expect(src).toContain('fetch("/api/session/password/forgot"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });

  it("reset-password page only uses dashboard relay endpoint", () => {
    const src = readApp("(auth)/reset-password/page.tsx");
    expect(src).toContain('fetch("/api/session/password/reset"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });

  it("settings page uses relay endpoints and no token storage", () => {
    const src = readApp("(dashboard)/settings/page.tsx");
    expect(src).toContain('fetch("/api/security/mfa/status"');
    expect(src).toContain('fetch("/api/security/mfa/begin"');
    expect(src).toContain('fetch("/api/security/mfa/enable"');
    expect(src).toContain('fetch("/api/security/mfa/disable"');
    expect(src).not.toMatch(/window\.localStorage|sessionToken|mfaToken/);
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });

  it("accept-invite page delegates auth to relay endpoints", () => {
    const src = readApp("(auth)/accept-invite/page.tsx");
    expect(src).toContain('fetch(`/api/auth/invite/${token}`)');
    expect(src).toContain('fetch("/api/auth/invite/accept"');
    expect(src).not.toMatch(/fetch\(\s*["']\/auth\//);
  });
});
