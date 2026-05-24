import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

describe("phase3 worker/db purity regression checks", () => {
  it("worker drives jobs via internal HTTP; DB writes are fallback-only", () => {
    const worker = readRepoFile("infra/worker-service/src/worker.ts");
    // Primary path: claim / complete / heartbeat / fail through API (not direct job repo helpers).
    expect(worker).not.toMatch(/getTenantJobById|updateTenantJob/);
    expect(worker).toContain("/internal/jobs/claim");
    expect(worker).toContain("/internal/jobs/");
    // Fallback persistence may update tenantLifecycleJobs when reporting failure to the API fails.
    expect(worker).toContain("tenantLifecycleJobs");
  });

  it("db package does not expose workflow state-machine helpers", () => {
    const dbIndex = readRepoFile("packages/db/src/index.ts");
    expect(dbIndex).not.toMatch(/claimNext|retry|orchestr/i);
  });
});
