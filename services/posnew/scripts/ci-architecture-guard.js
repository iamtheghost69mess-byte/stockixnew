/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function walkFiles(startDir, fileFilter = (p) => p.endsWith(".js") || p.endsWith(".ts") || p.endsWith(".tsx")) {
  const out = [];
  const stack = [startDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === "coverage"
        ) {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (fileFilter(full)) out.push(full);
    }
  }
  return out;
}

function toRepoPath(absPath) {
  return absPath.replace(`${root}${path.sep}`, "").replaceAll("\\", "/");
}

function findMatches(content, regex) {
  const lines = content.split(/\r?\n/);
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (regex.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return matches;
}

function scanRule(files, rule) {
  const violations = [];
  for (const file of files) {
    const repoPath = toRepoPath(file);
    if (rule.excludePaths && rule.excludePaths.some((p) => repoPath.startsWith(p))) continue;
    if (rule.onlyPaths && !rule.onlyPaths.some((p) => repoPath.startsWith(p))) continue;
    if (rule.allowPaths && rule.allowPaths.some((p) => repoPath === p)) continue;
    const content = fs.readFileSync(file, "utf8");
    const hits = findMatches(content, rule.pattern);
    for (const hit of hits) {
      violations.push({
        rule: rule.name,
        file: repoPath,
        line: hit.line,
        text: hit.text,
      });
    }
  }
  return violations;
}

const backendRuntime = walkFiles(path.join(root, "apps", "pos-backend"), (p) => {
  const rp = toRepoPath(p);
  if (!rp.match(/\.(js|ts|tsx)$/)) return false;
  if (rp.startsWith("apps/pos-backend/tests/")) return false;
  if (rp.startsWith("apps/pos-backend/scripts/")) return false;
  if (rp.startsWith("apps/pos-backend/postman/")) return false;
  return true;
});

const saasDashSource = walkFiles(path.join(root, "apps", "saas-dash", "src"));
const checkFiles = [...backendRuntime, ...saasDashSource];

const rules = [
  {
    name: "forbidden lifecycle access check",
    pattern: /lifecycle\s*===\s*["']active["']/,
  },
  {
    name: "forbidden subscriptionStatus usage",
    pattern: /\bsubscriptionStatus\b/,
  },
  {
    name: "forbidden enforceOrShadowLicenseWindow usage outside engine",
    pattern: /\benforceOrShadowLicenseWindow\s*\(/,
    allowPaths: [
      "apps/pos-backend/services/licenseWindowService.js",
      "apps/pos-backend/tests/unit/license-window-service.test.js",
    ],
  },
  {
    name: "forbidden accountingService usage in saas-dash",
    pattern: /\baccountingService\b/,
    onlyPaths: ["apps/saas-dash/"],
  },
  {
    name: "extractSubdomainOrg must not enforce access",
    pattern: /(enforceOrganizationAccess|getOrganizationAccessState|OrgAccessCache|evaluateLicenseWindow|enforceOrShadowLicenseWindow)/,
    onlyPaths: ["apps/pos-backend/middlewares/extractSubdomainOrg.js"],
  },
];

const violations = rules.flatMap((rule) => scanRule(checkFiles, rule));

if (violations.length > 0) {
  console.error("Architecture guard failed. Forbidden patterns detected:");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} [${v.rule}] ${v.text}`);
  }
  process.exit(1);
}

console.log("Architecture guard passed. No forbidden patterns found.");
