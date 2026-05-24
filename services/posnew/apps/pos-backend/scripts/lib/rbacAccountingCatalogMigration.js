/**
 * Pure helpers for {@link ../migrate-rbac-accounting-catalog-permissions.js}.
 * Keeps merge rules unit-testable without a Mongo connection.
 */

/** @readonly */
const READ_BUNDLE = Object.freeze([
  "backoffice.accounting.expenses.read",
  "backoffice.accounting.approvals.read",
  "backoffice.accounting.consolidated.read",
]);

/** @readonly */
const WRITE_BUNDLE = Object.freeze([
  "backoffice.accounting.expenses.write",
  "backoffice.accounting.approvals.write",
]);

/**
 * @param {readonly string[]} can
 * @returns {boolean}
 */
function hasAccountingWildcard(can) {
  if (!Array.isArray(can)) return false;
  for (const raw of can) {
    const s = String(raw ?? "").trim();
    if (s === "*" || s === "backoffice.*" || s === "backoffice.accounting.*") {
      return true;
    }
  }
  return false;
}

/**
 * Conservative read bundle: GL read + accounting read, no wildcard → add missing catalog reads.
 * @param {readonly string[]} can
 * @returns {string[]}
 */
function computeReadBundleAdds(can) {
  if (!Array.isArray(can) || can.length === 0) return [];
  if (hasAccountingWildcard(can)) return [];
  const set = new Set(can.map((x) => String(x).trim()));
  if (!set.has("backoffice.accounting.gl.read")) return [];
  if (!set.has("backoffice.accounting.read")) return [];
  return READ_BUNDLE.filter((id) => !set.has(id));
}

/**
 * Optional write bundle: manual journal write, no wildcard → add expense + approval write (not approve).
 * @param {readonly string[]} can
 * @param {boolean} includeWrites
 * @returns {string[]}
 */
function computeWriteBundleAdds(can, includeWrites) {
  if (!includeWrites || !Array.isArray(can) || can.length === 0) return [];
  if (hasAccountingWildcard(can)) return [];
  const set = new Set(can.map((x) => String(x).trim()));
  if (!set.has("backoffice.accounting.gl.write")) return [];
  return WRITE_BUNDLE.filter((id) => !set.has(id));
}

/**
 * @param {readonly string[]} can
 * @param {boolean} includeWrites
 * @returns {string[]}
 */
function computeAllAdds(can, includeWrites) {
  const a = computeReadBundleAdds(can);
  const b = computeWriteBundleAdds(can, includeWrites);
  const out = [...a];
  for (const x of b) {
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/**
 * @param {readonly string[]} can
 * @param {readonly string[]} adds
 * @returns {string[]}
 */
function applyAdds(can, adds) {
  if (!Array.isArray(can)) return [];
  if (!adds.length) return [...can.map((x) => String(x))];
  const base = can.map((x) => String(x));
  const merged = [...base];
  for (const id of adds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

module.exports = {
  READ_BUNDLE,
  WRITE_BUNDLE,
  hasAccountingWildcard,
  computeReadBundleAdds,
  computeWriteBundleAdds,
  computeAllAdds,
  applyAdds,
};
