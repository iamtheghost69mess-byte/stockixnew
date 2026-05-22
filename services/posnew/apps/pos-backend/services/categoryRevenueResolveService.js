const mongoose = require("mongoose");
const Category = require("../models/categoryModel");

const MAX_PARENT_WALK = 32;

function normalizeIdRef(ref) {
  if (ref == null) return null;
  if (typeof ref === "object" && ref !== null && ref._id != null) {
    return String(ref._id);
  }
  return String(ref);
}

/**
 * Walk leaf → root; return first non-null revenueAccount ObjectId string, or null.
 *
 * @param {string|null|undefined} leafCategoryId
 * @param {Map<string, { _id?: unknown; parentCategory?: unknown; revenueAccount?: unknown }>} byId
 * @returns {string|null}
 */
function resolveRevenueAccountIdFromCategoryMap(leafCategoryId, byId) {
  let curId = leafCategoryId != null ? String(leafCategoryId) : null;
  const seen = new Set();
  let depth = 0;
  while (curId && depth < MAX_PARENT_WALK && !seen.has(curId)) {
    seen.add(curId);
    const node = byId.get(curId);
    if (!node) {
      return null;
    }
    const ra = node.revenueAccount;
    if (ra != null) {
      const sid = normalizeIdRef(ra);
      return sid && mongoose.Types.ObjectId.isValid(sid) ? sid : null;
    }
    const p = node.parentCategory;
    curId = p != null ? normalizeIdRef(p) : null;
    depth += 1;
  }
  return null;
}

/**
 * Lean category rows for one org: `_id`, `name`, `parentCategory`, `revenueAccount`.
 * `name` is used for Studio / journal display paths; revenue resolution ignores it.
 *
 * @param {import("mongoose").Types.ObjectId|string|null|undefined} organizationId
 * @returns {Promise<Map<string, object>>}
 */
async function buildMenuCategoryRevenueIndex(organizationId) {
  if (!organizationId) {
    return new Map();
  }
  const cats = await Category.find({ organization: organizationId })
    .select("_id name parentCategory revenueAccount")
    .lean();
  return new Map(cats.map((c) => [String(c._id), c]));
}

/**
 * Root › … › leaf path for a menu category leaf (by name), or "" if unknown.
 *
 * @param {string|null|undefined} leafCategoryId
 * @param {Map<string, { name?: unknown; parentCategory?: unknown }>} byId
 * @returns {string}
 */
function menuCategoryPathFromMap(leafCategoryId, byId) {
  let curId = leafCategoryId != null ? String(leafCategoryId) : null;
  const parts = [];
  const seen = new Set();
  let depth = 0;
  while (curId && depth < MAX_PARENT_WALK && !seen.has(curId)) {
    seen.add(curId);
    const node = byId.get(curId);
    if (!node) {
      break;
    }
    const label =
      node.name != null && String(node.name).trim() !== ""
        ? String(node.name).trim()
        : "Category";
    parts.push(label);
    const p = node.parentCategory;
    curId = p != null ? normalizeIdRef(p) : null;
    depth += 1;
  }
  if (!parts.length) {
    return "";
  }
  return parts.reverse().join(" › ");
}

/**
 * Display name of the leaf category only.
 *
 * @param {string|null|undefined} leafCategoryId
 * @param {Map<string, { name?: unknown }>} byId
 * @returns {string}
 */
function menuCategoryLeafNameFromMap(leafCategoryId, byId) {
  if (leafCategoryId == null) {
    return "";
  }
  const node = byId.get(String(leafCategoryId));
  if (!node || node.name == null) {
    return "";
  }
  return String(node.name).trim();
}

/**
 * Async helper when no index is available (e.g. tests / one-off scripts).
 *
 * @param {string|import("mongoose").Types.ObjectId|null|undefined} leafCategoryId
 * @param {import("mongoose").Types.ObjectId|string|null|undefined} organizationId
 * @returns {Promise<import("mongoose").Types.ObjectId|null>}
 */
async function resolveRevenueAccountIdForCategoryLeaf(leafCategoryId, organizationId) {
  const idx = await buildMenuCategoryRevenueIndex(organizationId);
  const sid = resolveRevenueAccountIdFromCategoryMap(
    leafCategoryId != null ? String(leafCategoryId) : null,
    idx
  );
  return sid ? new mongoose.Types.ObjectId(sid) : null;
}

module.exports = {
  resolveRevenueAccountIdFromCategoryMap,
  buildMenuCategoryRevenueIndex,
  resolveRevenueAccountIdForCategoryLeaf,
  menuCategoryPathFromMap,
  menuCategoryLeafNameFromMap,
};
