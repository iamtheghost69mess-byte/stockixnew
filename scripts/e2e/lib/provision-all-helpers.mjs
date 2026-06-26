/**
 * Extra helpers for the all-scenarios provisioning validation suite.
 * Covers PMS health, Chatwoot account verification, auth edge-cases,
 * licensing checks, and report generation.
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ─── PMS ────────────────────────────────────────────────────────────────────

export const PMS_BASE_URL = (process.env.PMS_BASE_URL ?? "http://localhost:3003").replace(/\/$/, "");

/**
 * Returns { ok, status } — gracefully returns ok:false if service is down.
 * PMS may not be deployed in all environments; caller decides whether to fail.
 */
export async function verifyPmsHealth() {
  for (const path of ["/health", "/ready", "/api/health"]) {
    try {
      const res = await fetch(`${PMS_BASE_URL}${path}`, { signal: AbortSignal.timeout(6_000) });
      if (res.ok) return { ok: true, status: res.status, path };
    } catch {
      /* next path */
    }
  }
  return { ok: false };
}

// ─── Chat / Chatwoot ─────────────────────────────────────────────────────────

export const CHATWOOT_BASE_URL = (process.env.CHATWOOT_BASE_URL ?? "").replace(/\/$/, "");
export const CHATWOOT_API_KEY = process.env.CHATWOOT_API_ACCESS_TOKEN ?? "";

export async function verifyChatwootAccount(accountId) {
  if (!CHATWOOT_BASE_URL || !CHATWOOT_API_KEY || !accountId) return { ok: false, reason: "unconfigured" };
  try {
    const res = await fetch(`${CHATWOOT_BASE_URL}/platform/api/v1/accounts/${accountId}`, {
      headers: { api_access_token: CHATWOOT_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Query chatwootAccountId via the control-plane DB (read-only). */
export async function resolveChatwootAccountId(tenantId) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  try {
    const sql = (await import("postgres")).default;
    const pg = sql(dbUrl, { max: 1 });
    try {
      const rows = await pg`
        SELECT o.chatwoot_account_id
        FROM organizations o
        WHERE o.tenant_id = ${tenantId}
          AND o.chatwoot_account_id IS NOT NULL
        LIMIT 1
      `;
      return rows[0]?.chatwoot_account_id ?? null;
    } finally {
      await pg.end({ timeout: 5 });
    }
  } catch {
    return null;
  }
}

// ─── Finance auth edge-cases ──────────────────────────────────────────────────

export async function assertFinanceBadPasswordRejected(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: email, password: "wrong-password-INVALID-12345!" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 200) throw new Error(`Finance bad-password returned 200 — expected 401/422`);
  return { ok: true, status: res.status };
}

// ─── Licensing ────────────────────────────────────────────────────────────────

export async function assertTenantHasModules(api, tenantId, expectedModules) {
  const res = await api("GET", `/tenants/${tenantId}`);
  if (!res.ok) throw new Error(`GET /tenants/${tenantId} → HTTP ${res.status}`);
  const tenant = res.data?.tenant ?? res.data;
  let modules;
  try {
    modules = JSON.parse(tenant?.modules ?? "[]");
  } catch {
    modules = tenant?.modules ?? [];
  }
  for (const mod of expectedModules) {
    if (!modules.includes(mod)) throw new Error(`Module "${mod}" not in tenant.modules: ${JSON.stringify(modules)}`);
  }
  return modules;
}

// ─── Credentials document ────────────────────────────────────────────────────

const credStore = [];

export function storeCredentials(entry) {
  credStore.push(entry);
}

export function getAllCredentials() {
  return [...credStore];
}

// ─── Report generation ───────────────────────────────────────────────────────

export function writeScriptprovMd(scenarioResults, extraNotes = []) {
  const failures = scenarioResults.filter((r) => !r.passed);
  const passed = scenarioResults.filter((r) => r.passed);

  const lines = [
    "# Provisioning Validation Report",
    "",
    `**Date**: ${new Date().toISOString()}`,
    `**Scenarios**: ${scenarioResults.length} total — ${passed.length} passed, ${failures.length} failed`,
    "",
  ];

  if (failures.length === 0) {
    lines.push("## Result: ALL PASSED", "");
    lines.push(`All ${scenarioResults.length} provisioning scenarios completed successfully.`, "");
  } else {
    lines.push("## Failures", "");
    for (const f of failures) {
      lines.push(`### ✗ ${f.name}`);
      lines.push("");
      lines.push(`**Error**: ${f.error}`);
      if (f.slug) lines.push(`**Slug**: \`${f.slug}\``);
      if (f.modules?.length) lines.push(`**Modules**: ${f.modules.join(", ")}`);
      if (f.events?.length) {
        lines.push("", "**Last 10 provision events**:");
        lines.push("```json");
        for (const e of f.events.slice(-10)) lines.push(JSON.stringify(e));
        lines.push("```");
      }
      lines.push("");
    }
  }

  if (extraNotes.length) {
    lines.push("## Notes", "");
    for (const note of extraNotes) lines.push(`- ${note}`);
    lines.push("");
  }

  const creds = getAllCredentials();
  if (creds.length) {
    lines.push("## Credentials (provisioned during this run)", "");
    lines.push("| Scenario | Slug | Module | Credential | Value |");
    lines.push("|----------|------|--------|------------|-------|");
    for (const c of creds) {
      lines.push(`| ${c.scenario} | \`${c.slug}\` | ${c.module || "—"} | ${c.credential} | \`${c.value}\` |`);
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const dest = join(REPO_ROOT, "scriptprov.md");
  writeFileSync(dest, content, "utf8");
  return dest;
}
