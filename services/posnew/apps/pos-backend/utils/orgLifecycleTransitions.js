const Organization = require("../models/organizationModel");

const LIFECYCLE = Organization.LIFECYCLE || [
  "draft",
  "active",
  "suspended",
  "pending_closure",
  "deleted",
];

/** @type {Record<string, string[]>} */
const ALLOWED_FROM = {
  draft: ["active", "deleted"],
  active: ["suspended", "pending_closure", "deleted"],
  suspended: ["active", "pending_closure", "deleted"],
  pending_closure: ["active", "deleted"],
  deleted: [],
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateLifecycleTransition(from, to) {
  const a = String(from || "").trim();
  const b = String(to || "").trim();
  if (a === b) return { ok: true };
  if (!LIFECYCLE.includes(a)) {
    return { ok: false, message: `Invalid current lifecycle "${a}".` };
  }
  if (!LIFECYCLE.includes(b)) {
    return { ok: false, message: `Invalid target lifecycle "${b}".` };
  }
  const allowed = ALLOWED_FROM[a] || [];
  if (!allowed.includes(b)) {
    return {
      ok: false,
      message: `Cannot change lifecycle from "${a}" to "${b}". Allowed: ${allowed.join(", ") || "none"}.`,
    };
  }
  return { ok: true };
}

module.exports = {
  validateLifecycleTransition,
  LIFECYCLE,
  ALLOWED_FROM,
};
