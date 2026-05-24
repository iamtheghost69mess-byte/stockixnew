/**
 * Provision scenario tests — API behavior, retries, and timing expectations.
 *
 * Usage:
 *   pnpm --filter api provision-scenarios
 *   pnpm --filter api provision-scenarios -- --full
 *
 * Env: same as provision-smoke.mjs (STOCKIX_API_URL, OWNER_ID, PROVISION_POLL_MS, PROVISION_MAX_MS, PROVISION_ADMIN_EMAIL)
 *
 * ## Will a "retry" continue?
 *
 * 1) Polling GET /tenants/provision-status/:correlationId
 *    → YES. Keep polling the same correlationId until status is complete or failed.
 *
 * 2) POST /tenants again with the SAME slug after a run has inserted the tenant row
 *    → NO. API returns 409 "Tenant slug already exists". It does not resume the old job.
 *    → Use a NEW slug for a new stack, or remove the tenant row in Stockix Postgres first.
 *
 * 3) POST /tenants again with the same slug while the FIRST job is still running
 *    → Usually 409 once the first transaction commits; there is a short race where two 202s
 *    → could occur before the row exists — avoid double-submitting the same slug from the UI.
 *
 * 4) Provision failed AFTER the tenant row was created
 *    → Retrying the same slug returns 409. Cleanup: delete tenant/deployment rows or use another slug.
 *
 * ## How long does it take?
 *
 * • This script (quick scenarios only): ~1–5 seconds.
 * • Full provision (--full): typically 5–20 minutes on a warm machine with images cached;
 *   first-time pulls + MySQL + migrations can push toward 20–45+ minutes.
 * • Duplicate-slug check (409): immediate after the first provision finishes.
 */

import { env } from "@repo/config";

const API = env.STOCKIX_API_URL.replace(
  /\/$/,
  "",
);
const POLL_MS = env.PROVISION_POLL_MS;
const MAX_MS = env.PROVISION_MAX_MS;

const wantFull = process.argv.includes("--full");

async function readJson(res) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { _raw: t };
  }
}

function fail(msg, extra) {
  console.error("\n❌", msg);
  if (extra != null) console.error(extra);
  process.exit(1);
}

function section(title) {
  console.log("\n──", title, "──\n");
}

async function pollStatus(correlationId) {
  const deadline = Date.now() + MAX_MS;
  const t0 = Date.now();
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const sRes = await fetch(`${API}/tenants/provision-status/${correlationId}`);
    const s = await readJson(sRes);
    if (sRes.status === 404) fail("provision-status 404", s);
    if (!sRes.ok) fail(`provision-status HTTP ${sRes.status}`, s);
    if (s.status === "failed") {
      fail("Provisioning failed", { error: s.error, cause: s.cause });
    }
    if (s.status === "complete") {
      return { s, elapsedSec: Math.round((Date.now() - t0) / 1000) };
    }
    process.stdout.write(
      `  [poll] ${s.status} ${Math.round((Date.now() - t0) / 1000)}s\r`,
    );
  }
  fail(`Timeout after ${MAX_MS}ms`);
}

async function postTenants(body) {
  return fetch(`${API}/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runQuickScenarios(ownerId) {
  section("S1 — Invalid body (expect 400)");
  const bad = await postTenants({
    slug: "valid-slug-only",
    name: "x",
    owner_id: ownerId,
    // missing admin_email, names
  });
  const badJ = await readJson(bad);
  if (bad.status !== 400) {
    fail(`Expected HTTP 400 for invalid body, got ${bad.status}`, badJ);
  }
  console.log("✓ POST /tenants invalid body →", bad.status, badJ.error ?? badJ);

  section("S2 — Unknown owner_id (expect 400)");
  const badOwner = await postTenants({
    slug: `sc-${Date.now().toString(36)}`,
    name: "Scenario",
    owner_id: "00000000-0000-4000-8000-000000000001",
    admin_email: "a@b.co",
    admin_first_name: "A",
    admin_last_name: "B",
  });
  const boJ = await readJson(badOwner);
  if (badOwner.status !== 400) {
    fail(`Expected HTTP 400 for bad owner, got ${badOwner.status}`, boJ);
  }
  console.log("✓ POST /tenants bad owner →", badOwner.status, boJ.error ?? boJ);

  section("S3 — Invalid slug pattern (expect 400)");
  const badSlug = await postTenants({
    slug: "Bad_Caps_Slug",
    name: "x",
    owner_id: ownerId,
    admin_email: "a@b.co",
    admin_first_name: "A",
    admin_last_name: "B",
  });
  const bsJ = await readJson(badSlug);
  if (badSlug.status !== 400) {
    fail(`Expected HTTP 400 for bad slug, got ${badSlug.status}`, bsJ);
  }
  console.log("✓ POST /tenants bad slug →", badSlug.status);

  section("S4 — Duplicate slug when tenant already exists (expect 409)");
  const tRes = await fetch(`${API}/tenants`);
  const tJ = await readJson(tRes);
  if (!tRes.ok) fail("GET /tenants", tJ);
  const existing = (tJ.tenants ?? [])[0];
  if (!existing) {
    console.log(
      "⊘ Skip: no tenants yet. After a successful provision, re-run this script to assert 409 on duplicate slug.",
    );
  } else {
    const dup = await postTenants({
      slug: existing.slug,
      name: "Duplicate attempt",
      owner_id: ownerId,
      admin_email: "dup@localhost.test",
      admin_first_name: "D",
      admin_last_name: "D",
    });
    const dupJ = await readJson(dup);
    if (dup.status !== 409) {
      fail(`Expected HTTP 409 for duplicate slug ${existing.slug}, got ${dup.status}`, dupJ);
    }
    console.log("✓ POST /tenants duplicate slug →", dup.status, dupJ.error ?? dupJ);
    console.log(
      "  (Retry with the same slug does NOT continue provisioning — start a new slug or delete the tenant in Stockix DB.)",
    );
  }

  section("S5 — Polling the same correlationId (continues until terminal)");
  console.log(
    "⊘ Not executed without a live job. When you have a correlationId from 202, polling GET /tenants/provision-status/:id continues until complete|failed.",
  );
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Stockix provision scenarios                                     ║
╚══════════════════════════════════════════════════════════════════╝
Timing guide:
  • Quick tests (this run without --full): ~1–5 s
  • One full Docker provision (--full):  ~5–20 min typical (cached images)
  • Cold start (image pull + MySQL + migrations): often 15–45+ min
`);

  console.log("API:", API, wantFull ? "(includes --full provision)" : "(quick only)");

  const h = await fetch(`${API}/health`);
  if (!h.ok) fail(`GET /health → ${h.status}`, await readJson(h));
  console.log("✓ GET /health");

  const oRes = await fetch(`${API}/owners`);
  const o = await readJson(oRes);
  if (!oRes.ok) fail(`GET /owners → ${oRes.status}`, o);
  const owners = o.owners ?? [];
  if (owners.length === 0) {
    fail("No owners. Run: pnpm --filter @repo/db db:seed:local");
  }
  const ownerId = env.OWNER_ID ?? owners[0].id;
  console.log("✓ GET /owners, using owner_id:", ownerId);

  await runQuickScenarios(ownerId);

  if (!wantFull) {
    console.log(`
── Next step ──

  pnpm --filter api provision-scenarios -- --full

That will: provision one new tenant (Docker), measure wall time, then POST the same slug again and assert 409 (retry does not continue).
`);
    return;
  }

  section("FULL — Provision new tenant, then duplicate POST (expect 409)");
  const slug = `scenario-${Date.now().toString(36)}`;
  const body = {
    slug,
    name: `Scenario full ${slug}`,
    owner_id: ownerId,
    admin_email: env.PROVISION_ADMIN_EMAIL,
    admin_first_name: "Scenario",
    admin_last_name: "Full",
  };

  console.log("POST /tenants (first)", body);
  const tFull0 = Date.now();
  const pRes = await postTenants(body);
  const accepted = await readJson(pRes);
  if (pRes.status !== 202 || !accepted.accepted || !accepted.correlationId) {
    fail("First POST /tenants expected 202", { status: pRes.status, accepted });
  }
  const { correlationId } = accepted;
  console.log("✓ 202 correlationId:", correlationId);

  console.log("Polling until complete (same correlationId — this is the supported retry path)…");
  const { s, elapsedSec } = await pollStatus(correlationId);
  const wallMin = ((Date.now() - tFull0) / 60000).toFixed(2);
  console.log(`\n✓ Provision complete in ~${elapsedSec}s (poll) / ${wallMin} min wall`);

  console.log("\nPOST /tenants (retry SAME slug — expect 409, not resume)");
  const p2 = await postTenants(body);
  const j2 = await readJson(p2);
  if (p2.status !== 409) {
    fail(`Expected 409 on duplicate slug after success, got ${p2.status}`, j2);
  }
  console.log("✓ Retry same slug →", p2.status, j2.error ?? j2);
  console.log(`
Summary:
  • Same correlationId + polling: OK (continues).
  • Same slug + new POST after success: 409 (does not continue; use new slug or DB cleanup).
  • oneTimeAdminPassword: ${s.oneTimeAdminPassword ? "(present in last status)" : "(null — job may have expired)"}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
