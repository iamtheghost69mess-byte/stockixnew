#!/usr/bin/env node
/**
 * CI guard: Finance tenancy invariants for cross-tenant isolation.
 * Verifies CLS tenantId is set from organizationId (not stale user.tenantId).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(serverRoot, "src");

function read(rel) {
  const abs = join(srcRoot, rel);
  if (!existsSync(abs)) {
    return { abs, content: null };
  }
  return { abs, content: readFileSync(abs, "utf8") };
}

const checks = [
  {
    file: "modules/Tenancy/TenancyGlobal.guard.ts",
    mustInclude: [
      "clsService.set('tenantId', tenant.id)",
      "findOne({ organizationId })",
    ],
    label: "TenancyGlobalGuard resolves tenantId from organizationId",
  },
  {
    file: "modules/Auth/commands/AuthSignin.service.ts",
    mustInclude: [
      "findOne({ organizationId: payload.organizationId })",
      "clsService.set('tenantId', tenant.id)",
    ],
    mustNotInclude: ["clsService.set('tenantId', user.tenantId)"],
    label: "AuthSignin resolves tenant from JWT organizationId",
  },
  {
    file: "modules/Auth/commands/SwitchTenant.service.ts",
    mustInclude: [
      "clsService.set('tenantId', tenant.id)",
      "clsService.set('organizationId', tenant.organizationId)",
    ],
    label: "SwitchTenant updates CLS tenant context",
  },
  {
    file: "common/interceptors/request-context.interceptor.ts",
    mustInclude: ["tenantId: this.cls.get('tenantId')"],
    label: "RequestContextInterceptor logs tenantId",
  },
  {
    file: "common/filters/global-exception.filter.ts",
    mustInclude: ["tenantId: this.cls.get('tenantId')"],
    label: "GlobalExceptionFilter traces tenantId",
  },
];

const failures = [];

for (const check of checks) {
  const { content } = read(check.file);
  if (content === null) {
    failures.push({ file: check.file, reason: "file missing" });
    continue;
  }
  for (const needle of check.mustInclude ?? []) {
    if (!content.includes(needle)) {
      failures.push({
        file: check.file,
        reason: `${check.label}: expected "${needle}"`,
      });
    }
  }
  for (const needle of check.mustNotInclude ?? []) {
    if (content.includes(needle)) {
      failures.push({
        file: check.file,
        reason: `${check.label}: forbidden "${needle}"`,
      });
    }
  }
}

const passing = checks.length - new Set(failures.map((f) => f.file)).size;
console.log(
  `Finance tenant scope audit: ${checks.length - failures.length}/${checks.length} checks passed`,
);

for (const check of checks) {
  const failed = failures.some((f) => f.file === check.file);
  console.log(`  ${failed ? "FAIL" : "OK "} ${check.label}`);
}

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(`  ${f.file}: ${f.reason}`);
  }
  process.exit(1);
}
