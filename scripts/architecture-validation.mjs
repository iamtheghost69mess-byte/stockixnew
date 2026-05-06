import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const ignore = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", "agent-transcripts", "terminals", "mcps"]);

const violations = [];

function posix(p) {
  return p.split(path.sep).join("/");
}

function isCode(file) {
  return exts.has(path.extname(file));
}

function collectSpecs(content) {
  const out = [];
  const patterns = [
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(content))) out.push(m[1]);
  }
  return out;
}

function resolveRelative(file, spec) {
  if (!spec.startsWith(".")) return null;
  return posix(path.relative(root, path.resolve(root, path.dirname(file), spec)));
}

function add(phase, file, reason) {
  violations.push({ phase, file, reason });
}

function validateFile(file, content) {
  const specs = collectSpecs(content);
  const resolved = specs.map((s) => ({ spec: s, abs: resolveRelative(file, s) }));

  // Phase 1: dashboard UI isolation (no DB and no auth orchestration in UI pages)
  if (file.startsWith("apps/dashboard/")) {
    if (/@repo\/db|createDb\(|drizzle/.test(content)) add("Phase 1", file, "dashboard DB access pattern");
    const isDashboardUiPage = file.startsWith("apps/dashboard/app/") && file.endsWith(".tsx") && !file.startsWith("apps/dashboard/app/api/");
    if (isDashboardUiPage) {
      if (/\b(?:fetch|authApiFetch)\(\s*["']\/api\/auth\/(reconfirm|mfa\/(?:begin|enable|disable|status)|verify-mfa|login)/.test(content)) {
        add("Phase 1", file, "dashboard UI auth-flow orchestration");
      }
      if (/window\.prompt|requiresMfa|handleVerifyMfa|password\s*!==\s*confirmPassword/.test(content)) {
        add("Phase 1", file, "dashboard UI auth decision logic");
      }
    }
  }

  // Phase 2: auth/session logic only in API
  if (!file.startsWith("apps/api/src/") && file.startsWith("apps/dashboard/") && !file.includes("/tests/")) {
    if (/signSession|signMfaToken|verifyMfaToken|verifySession|checkRateLimit|resetRateLimit|verifyRecentAuthToken|signRecentAuthToken/.test(content)) {
      add("Phase 2", file, "auth/session logic outside API");
    }
    if (/localStorage\.setItem\([^)]*(session|mfa)|localStorage\.getItem\([^)]*(session|mfa)|localStorage\.removeItem\([^)]*(session|mfa)/i.test(content)) {
      add("Phase 2", file, "dashboard token/session storage logic");
    }
    if (/from\s+["']node:crypto["']|crypto\./.test(content)) {
      add("Phase 2", file, "dashboard cryptographic logic");
    }
    if (/\bgetSessionToken\b|\bsetSessionToken\b|\bgetMfaToken\b|\bsetMfaToken\b|\bclearAuthTokens\b/.test(content)) {
      add("Phase 2", file, "dashboard auth-token lifecycle helpers");
    }
    if (/\b(?:fetch|authApiFetch)\(\s*["']\/auth\/(session\/validate|reconfirm|mfa\/(?:begin|enable|disable|status)|verify-mfa|login)/.test(content) && !file.startsWith("apps/dashboard/app/api/")) {
      add("Phase 2", file, "dashboard direct auth orchestration in UI layer");
    }
    if (/me\?\.role\s*===|session\.role|role\s*===\s*ROLE\./.test(content)) {
      add("Phase 2", file, "dashboard role-based authorization decisions");
    }
  }

  // Phase 3: DB purity
  if (file.startsWith("packages/db/src/")) {
    if (/getNextPending|claimNext|insertTenantJob|updateTenantJob|listTenantJobs|getTenantJobById|attempts\s*\+\s*1|status:\s*"running"/.test(content)) {
      add("Phase 3", file, "DB queue orchestration logic");
    }
  }
  // Phase 3: worker purity
  if (file === "infra/worker-service/src/worker.ts") {
    if (/attempts\s*\+\s*1|maxAttempts|tenant\.suspend|tenant\.reactivate|if\s*\(\s*job\.type\s*===\s*["']tenant\.(?:suspend|reactivate)["']/.test(content)) {
      add("Phase 3", file, "worker lifecycle/orchestration logic");
    }
    if (/tenantLifecycleJobs|getTenantJobById|updateTenantJob/.test(content)) {
      add("Phase 3", file, "worker owns job-claim/state-transition logic");
    }
    if (/status:\s*["']running["']|status:\s*["']failed["']|status:\s*["']completed["']/.test(content)) {
      add("Phase 3", file, "worker embeds job-state policy values");
    }
  }
  // Phase 3: infra domain purity
  if (file.startsWith("infra/worker-service/domain/provisioning/")) {
    if (/while\s*\(|attempt\s*\+=|composeUpDataServices|composeRunMigration|composeUpApplicationStack|allocateTenantPort|transaction\(/.test(content)) {
      add("Phase 3", file, "infra provisioning workflow orchestration");
    }
  }

  // Phase 4: env governance
  if (/process\.env/.test(content)) {
    const allowed =
      file.startsWith("packages/config/") ||
      file.startsWith("scripts/") ||
      file.includes("/scripts/") ||
      file.includes("playwright.config") ||
      file.includes("webpack.common") ||
      file.includes("craco.config");
    if (!allowed) add("Phase 4", file, "forbidden process.env usage");
  }
  if (file.startsWith("packages/config/src/")) {
    for (const { spec, abs } of resolved) {
      const raw = abs ?? spec;
      if (raw.startsWith("apps/") || raw.startsWith("infra/") || raw.startsWith("services/") || raw.startsWith("packages/db/") || spec.startsWith("@repo/db")) {
        add("Phase 4", file, `config leaf-node violation: ${spec}`);
      }
    }
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = posix(path.relative(root, abs));
    if (e.isDirectory()) await walk(abs);
    else if (e.isFile() && isCode(rel)) validateFile(rel, await readFile(abs, "utf8"));
  }
}

await walk(root);

const phases = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
const status = Object.fromEntries(phases.map((p) => [p, "PASS"]));
for (const v of violations) status[v.phase] = "FAIL";

console.log("ARCHITECTURE VALIDATION REPORT");
console.log("-----------------------------");
for (const p of phases) console.log(`${p}: ${status[p]}`);
console.log("");
console.log("VIOLATIONS:");
if (!violations.length) console.log("- none");
for (const v of violations) console.log(`- ${v.file}: ${v.reason}`);
const ok = phases.every((p) => status[p] === "PASS");
console.log("");
console.log("FINAL RESULT:");
console.log(`PRODUCTION READY: ${ok ? "YES" : "NO"}`);
process.exit(ok ? 0 : 1);
