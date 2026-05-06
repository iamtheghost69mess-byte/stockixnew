import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

describe("phase3 worker/db purity regression checks", () => {
  it("worker does not own job claim/status transitions", () => {
    const worker = readRepoFile("infra/worker-service/src/worker.ts");
    expect(worker).not.toMatch(/tenantLifecycleJobs|getTenantJobById|updateTenantJob/);
    expect(worker).not.toMatch(/status:\s*"running"|status:\s*"failed"|status:\s*"completed"/);
    expect(worker).toContain("/internal/jobs/claim");
    expect(worker).toContain("/internal/jobs/");
  });

  it("db package does not expose workflow state-machine helpers", () => {
    const dbIndex = readRepoFile("packages/db/src/index.ts");
    expect(dbIndex).not.toMatch(/claimNext|retry|orchestr/i);
  });
});
