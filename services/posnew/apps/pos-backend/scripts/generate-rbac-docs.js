/**
 * Generates roles/GENERATED-role-matrix.md from repo RBAC defaults.
 * Run: npm run docs:rbac --prefix pos-backend
 */
const fs = require("fs");
const path = require("path");

const { PERMISSIONS } = require("../constants/permissionsCatalog");
const defaultRbacRoles = require("../constants/defaultRbacRoles");

const repoRoot = path.resolve(__dirname, "..", "..");
const outFile = path.join(repoRoot, "roles", "GENERATED-role-matrix.md");

function patternCoversPermission(pattern, permId) {
  if (pattern === "*") return true;
  if (pattern === permId) return true;
  if (typeof pattern !== "string" || typeof permId !== "string") return false;
  if (pattern.endsWith(".*")) {
    const stem = pattern.slice(0, -2);
    return permId === stem || permId.startsWith(`${stem}.`);
  }
  return false;
}

function roleHasPermission(roleEntry, permId) {
  const list = roleEntry?.can;
  if (!Array.isArray(list)) return false;
  for (const p of list) {
    if (patternCoversPermission(p, permId)) return true;
  }
  return false;
}

function main() {
  const roleKeys = Object.keys(defaultRbacRoles);
  const permRows = PERMISSIONS.filter((p) => p.id !== "*");

  const lines = [];
  lines.push("# Generated role ↔ permission matrix (repo defaults)");
  lines.push("");
  lines.push(
    "> **AUTO-GENERATED** by `pos-backend/scripts/generate-rbac-docs.js`. " +
      "Do not edit by hand. Run `npm run docs:rbac --prefix pos-backend` after changing " +
      "`defaultRbacRoles.js` or `permissionsCatalog.js`."
  );
  lines.push("");
  lines.push("Tenant **Dashboard → Roles & permissions** overrides are **not** included here.");
  lines.push("");
  lines.push("## By role (effective `can[]` patterns)");
  lines.push("");
  for (const key of roleKeys) {
    const entry = defaultRbacRoles[key];
    const can = entry?.can || [];
    lines.push(`### ${key}`);
    lines.push("");
    for (const c of can) {
      lines.push(`- \`${c}\``);
    }
    lines.push("");
  }

  lines.push("## By permission (default roles that include it)");
  lines.push("");
  lines.push(
    `| Permission id | Label | ${roleKeys.map((k) => `\`${k}\``).join(" | ")} |`,
  );
  lines.push(
    `| --- | --- | ${roleKeys.map(() => "---").join(" | ")} |`,
  );

  for (const p of permRows) {
    const cells = roleKeys.map((k) => (roleHasPermission(defaultRbacRoles[k], p.id) ? "✓" : "—"));
    const label = String(p.label || "").replace(/\|/g, "\\|");
    lines.push(`| \`${p.id}\` | ${label} | ${cells.join(" | ")} |`);
  }

  lines.push("");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log("Wrote", outFile);
}

main();
