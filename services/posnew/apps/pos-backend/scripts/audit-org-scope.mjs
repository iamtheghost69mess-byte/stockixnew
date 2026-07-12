#!/usr/bin/env node
/**
 * Advisory (non-blocking) audit: enumerates direct Mongoose calls against
 * org-scoped models (models that apply plugins/orgScopePlugin.js) which don't
 * obviously pass an `organization` filter, across controllers/ and services/.
 *
 * This is a heuristic text scan, not a real call-graph — it exists to turn
 * "we think ~2 call sites use the scoping helpers out of 38 models" into an
 * actual enumerated list, so the orgScopePlugin.js pre-hook (currently
 * log-only) can eventually be flipped to enforcing with real data instead of
 * a guess. It does not fail the build; it only reports.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "models");
const scanDirs = ["controllers", "services"].map((d) => join(root, d));

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.endsWith(".js") && !entry.endsWith(".test.js")) out.push(full);
  }
  return out;
}

// Model files that apply orgScopePlugin — the set of org-scoped Mongoose model names.
const orgScopedModelFiles = new Set(
  collectJsFiles(modelsDir).filter((f) => readFileSync(f, "utf8").includes("orgScopePlugin")),
);

const QUERY_METHODS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "updateOne",
  "updateMany",
  "countDocuments",
];
const SAFE_MARKERS = ["organization", "allowCrossOrg", "scopedToOrganization", "requireOrgFilter"];

const findings = [];
for (const dir of scanDirs) {
  let files;
  try {
    files = collectJsFiles(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    const source = readFileSync(file, "utf8");

    // Map local require() bindings to whether they point at an org-scoped model.
    const localVars = new Map();
    const requireRe = /const\s+([A-Za-z0-9_]+)\s*=\s*require\(["'`](\.\.?\/[^"'`]*models\/[^"'`]+)["'`]\)/g;
    let rm;
    while ((rm = requireRe.exec(source)) !== null) {
      const varName = rm[1];
      const resolved = join(file, "..", rm[2].endsWith(".js") ? rm[2] : `${rm[2]}.js`);
      const isOrgScoped = [...orgScopedModelFiles].some((f) => f === resolved || f.endsWith(rm[2] + ".js"));
      localVars.set(varName, isOrgScoped);
    }

    for (const [varName, isOrgScoped] of localVars) {
      if (!isOrgScoped) continue;
      const callRe = new RegExp(`\\b${varName}\\.(${QUERY_METHODS.join("|")})\\(`, "g");
      let cm;
      while ((cm = callRe.exec(source)) !== null) {
        const windowText = source.slice(cm.index, cm.index + 300);
        const looksSafe = SAFE_MARKERS.some((m) => windowText.includes(m));
        if (!looksSafe) {
          const line = source.slice(0, cm.index).split("\n").length;
          findings.push({ file: relative(root, file), line, model: varName, method: cm[1] });
        }
      }
    }
  }
}

console.log(`Org-scope call-site audit: ${findings.length} query call(s) without an obvious organization filter`);
for (const f of findings) {
  console.log(`  REVIEW  ${f.file}:${f.line}  ${f.model}.${f.method}(...)`);
}
console.log(
  "\nThis is advisory only (exit 0 always) — cross-reference with the orgScopePlugin.js warning log at" +
    " runtime before deciding what to fix vs. what's a legitimate cross-org query.",
);
