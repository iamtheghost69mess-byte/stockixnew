#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execa } from "execa";
import postgres from "postgres";

import {
  API,
  SuiteError,
  assertEqual,
  assertTruthy,
  createApiClient,
  resolveAuth,
} from "./lib/provision-suite-lib.mjs";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const sql = postgres(dbUrl);
const authHeadersRef = { current: {} };
const { api } = createApiClient(authHeadersRef);

const results = [];
let apiErrors = [];
let validationErrors = [];
let dbErrors = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(passed ? `  ✓ ${name}` : `  ✗ ${name}: ${detail}`);
}

function captureApiError(method, endpoint, status, body) {
  apiErrors.push({ method, endpoint, status, body });
}

async function runScenario(name, fn) {
  console.log(`\n${"═".repeat(72)}\n  ${name}\n${"═".repeat(72)}`);
  try {
    await fn();
    record(name, true);
    return true;
  } catch (err) {
    const msg = err instanceof SuiteError ? err.message : (err instanceof Error ? err.message : String(err));
    record(name, false, msg);
    return false;
  }
}

async function verifyDatabase(roleId, expectedSlug, expectedPerms) {
  const [role] = await sql`SELECT * FROM platform_roles WHERE id = ${roleId} LIMIT 1`;
  if (!role) throw new SuiteError(`Role ${roleId} not found in DB`);
  if (role.slug !== expectedSlug) throw new SuiteError(`Role slug mismatch in DB`);
  
  // Checking permissions
  const dbPerms = role.permissions;
  if (!Array.isArray(dbPerms) || dbPerms.join(',') !== expectedPerms.join(',')) {
    throw new SuiteError(`Permissions mismatch in DB. Expected ${expectedPerms}, got ${dbPerms}`);
  }
}

async function testRoleCrud() {
  // 1. Get initial roles
  let res = await api("GET", "/admin/roles");
  if (!res.ok) {
    captureApiError("GET", "/admin/roles", res.status, res.data);
    throw new SuiteError(`GET /admin/roles failed: HTTP ${res.status}`);
  }
  const initialCount = res.data.roles.length;
  assertTruthy(initialCount >= 1, "Should have at least 1 role (super_admin)");

  // 2. Create custom role
  const roleSlug = `custom_e2e_${Date.now()}`;
  res = await api("POST", "/admin/roles", {
    name: "E2E Custom Role",
    slug: roleSlug,
    permissions: ["tenants.read"]
  }, { "Idempotency-Key": `create-role-${Date.now()}` });
  if (!res.ok) {
    captureApiError("POST", "/admin/roles", res.status, res.data);
    throw new SuiteError(`POST /admin/roles failed: HTTP ${res.status}`);
  }
  const roleId = res.data.role.id;
  assertTruthy(roleId, "Role ID must be returned");

  await verifyDatabase(roleId, roleSlug, ["tenants.read"]);

  // 3. Patch custom role
  res = await api("PATCH", `/admin/roles/${roleId}`, {
    name: "E2E Updated Role",
    permissions: ["tenants.read", "tenants.write"]
  }, { "Idempotency-Key": `patch-role-${Date.now()}` });
  if (!res.ok) {
    captureApiError("PATCH", `/admin/roles/${roleId}`, res.status, res.data);
    throw new SuiteError(`PATCH /admin/roles failed: HTTP ${res.status}`);
  }
  await verifyDatabase(roleId, roleSlug, ["tenants.read", "tenants.write"]);

  // 4. Delete custom role
  res = await api("DELETE", `/admin/roles/${roleId}`, undefined, { "Idempotency-Key": `delete-role-${Date.now()}` });
  if (!res.ok) {
    captureApiError("DELETE", `/admin/roles/${roleId}`, res.status, res.data);
    throw new SuiteError(`DELETE /admin/roles failed: HTTP ${res.status}`);
  }
  
  const [deletedRole] = await sql`SELECT * FROM platform_roles WHERE id = ${roleId} LIMIT 1`;
  if (deletedRole) {
    dbErrors.push(`Role ${roleId} was not deleted from DB`);
    throw new SuiteError(`Role ${roleId} was not deleted from DB`);
  }
}

async function testOwnerRoleAssignment() {
  const email = `rbac-e2e-${Date.now()}@example.com`;
  
  // 1. Create owner
  let res = await api("POST", "/owners", {
    email,
    name: "RBAC E2E Owner"
  });
  if (!res.ok) {
    captureApiError("POST", "/owners", res.status, res.data);
    throw new SuiteError(`POST /owners failed: HTTP ${res.status}`);
  }
  const ownerId = res.data.owner.id;

  // 2. Patch owner role
  res = await api("PATCH", `/owners/${ownerId}`, {
    role: "support_agent"
  });
  if (!res.ok) {
    captureApiError("PATCH", `/owners/${ownerId}`, res.status, res.data);
    throw new SuiteError(`PATCH /owners failed: HTTP ${res.status}`);
  }
  assertEqual(res.data.owner.role, "support_agent", "Role should be support_agent");

  // 3. Verify DB audit logs for owner update
  const audits = await sql`SELECT * FROM admin_audit_log WHERE target_owner_id = ${ownerId} ORDER BY created_at DESC LIMIT 5`;
  const roleChangeLog = audits.find(a => a.action === "owner.role_changed");
  if (!roleChangeLog) {
    dbErrors.push("Audit log for owner.role_changed missing");
    throw new SuiteError("Audit log for owner.role_changed missing");
  }

  // Cleanup
  await api("DELETE", `/owners/${ownerId}`);
}

async function testUiIntegration() {
  try {
    const { stdout, stderr } = await execa("pnpm", ["--filter", "dashboard", "test:e2e", "rbac"], {
      stdio: "pipe",
      env: { ...process.env, CI: "1" }
    });
    console.log(stdout);
  } catch (err) {
    console.error(err.stdout || err.stderr || err.message);
    throw new SuiteError(`UI tests failed: ${err.message}`);
  }
}

async function generateReport() {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const content = `# RBAC Integration & Regression Test Suite Report

## Test Summary
- **Total Tests:** ${total}
- **Passed:** ${passed}
- **Failed:** ${total - passed}

### Results List
${results.map(r => `- [${r.passed ? "PASS" : "FAIL"}] ${r.name} ` + (r.detail ? `(${r.detail})` : "")).join("\n")}

## API Errors
${apiErrors.length === 0 ? "No API errors detected." : apiErrors.map(e => `- \`${e.method} ${e.endpoint}\`: HTTP ${e.status}\n  \`\`\`json\n  ${JSON.stringify(e.body, null, 2)}\n  \`\`\``).join("\n")}

## Database Errors
${dbErrors.length === 0 ? "No Database errors detected." : dbErrors.map(e => `- ${e}`).join("\n")}

## Validation Errors
${validationErrors.length === 0 ? "No Validation errors detected." : validationErrors.map(e => `- ${e}`).join("\n")}

## Suggested Fixes
- None at this time, check specific failing tests above if any.
`;

  const reportPath = path.resolve(process.cwd(), "rbac-regression-report.md");
  await fs.writeFile(reportPath, content, "utf-8");
  console.log(`\nReport generated: ${reportPath}`);
}

async function main() {
  console.log("Starting RBAC Regression Suite...");
  
  await resolveAuth(authHeadersRef);

  // Run multiple iterations to ensure idempotency and stability
  const ITERATIONS = 3;
  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`\n=== Iteration ${i} of ${ITERATIONS} ===`);
    await runScenario(`API: Role CRUD operations (Iter ${i})`, testRoleCrud);
    await runScenario(`API: Owner role assignment (Iter ${i})`, testOwnerRoleAssignment);
  }
  
  await runScenario(`UI: Playwright Integration Tests`, testUiIntegration);

  await generateReport();
  
  await sql.end();
  
  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
