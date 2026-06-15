const rbacPkg = require("@rbac/rbac");
const RBAC = rbacPkg.default || rbacPkg;
const RbacConfig = require("../models/rbacConfigModel");
const defaultRbacRoles = require("../constants/defaultRbacRoles");
const { BUILTIN_ROLE_KEYS } = require("../constants/permissionsCatalog");
const mongoose = require("mongoose");

/** @type {Map<string, { instance: unknown, etag: number, roles: object }>} */
const cacheByOrg = new Map();

function cacheKeyForOrg(organizationId) {
  if (!organizationId) return "legacy";
  return String(
    organizationId._id != null ? organizationId._id : organizationId
  );
}

function cloneRoles(base) {
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    out[k] = {
      can: [...(v.can || [])],
      ...(v.inherits ? { inherits: [...v.inherits] } : {}),
    };
  }
  return out;
}

function mergeBuiltinOverrides(roles, overrides) {
  if (!overrides || typeof overrides !== "object") return;
  for (const key of BUILTIN_ROLE_KEYS) {
    const o = overrides[key];
    if (o && Array.isArray(o.can)) {
      roles[key] = {
        can: [...o.can],
        ...(o.inherits ? { inherits: [...o.inherits] } : {}),
      };
    }
  }
}

function applyCustomRoles(roles, customList) {
  if (!Array.isArray(customList)) return;
  for (const cr of customList) {
    if (!cr || !cr.key) continue;
    const key = String(cr.key).toLowerCase();
    const entry = { can: [...(cr.can || [])] };
    if (
      cr.inheritsFrom &&
      BUILTIN_ROLE_KEYS.includes(String(cr.inheritsFrom).toLowerCase())
    ) {
      entry.inherits = [String(cr.inheritsFrom).toLowerCase()];
    }
    roles[key] = entry;
  }
}

function buildRolesFromConfigDoc(doc) {
  const roles = cloneRoles(defaultRbacRoles);
  if (doc) {
    mergeBuiltinOverrides(roles, doc.builtinOverrides);
    applyCustomRoles(roles, doc.customRoles);
  }
  return roles;
}

/**
 * @param {import("mongoose").Types.ObjectId | string | null | undefined} organizationId
 */
async function loadConfigDoc(organizationId) {
  const oid =
    organizationId != null
      ? organizationId instanceof mongoose.Types.ObjectId
        ? organizationId
        : new mongoose.Types.ObjectId(String(organizationId))
      : null;

  if (oid) {
    let doc = await RbacConfig.findOne({ organization: oid });
    if (!doc) {
      doc = await RbacConfig.create({
        organization: oid,
        builtinOverrides: {},
        customRoles: [],
      });
    }
    return doc;
  }

  // Legacy / dev users with no organization: never use findById("singleton") — that string is
  // not a valid ObjectId and Mongoose throws CastError, breaking GET /api/user and permission checks.
  let doc = await RbacConfig.findOne({
    $or: [{ organization: null }, { organization: { $exists: false } }],
  }).sort({ createdAt: 1 });
  if (!doc) {
    try {
      doc = await RbacConfig.create({
        organization: null,
        builtinOverrides: {},
        customRoles: [],
      });
    } catch {
      doc = await RbacConfig.findOne({
        $or: [{ organization: null }, { organization: { $exists: false } }],
      }).sort({ createdAt: 1 });
    }
  }
  if (!doc) {
    throw new Error("RbacConfig: could not load or create org-less config document.");
  }
  return doc;
}

/**
 * @param {import("mongoose").Types.ObjectId | string | null | undefined} organizationId
 */
async function getRbac(organizationId) {
  const key = cacheKeyForOrg(organizationId);
  const doc = await loadConfigDoc(
    organizationId != null ? organizationId : null
  );
  const etag = doc.updatedAt ? doc.updatedAt.getTime() : 0;
  const hit = cacheByOrg.get(key);
  if (hit && hit.etag === etag) {
    return hit.instance;
  }
  const roles = buildRolesFromConfigDoc(doc);
  const instance = RBAC({ enableLogger: false })(roles);
  cacheByOrg.set(key, { instance, etag, roles });
  return instance;
}

function getCachedRolesForOrg(organizationId) {
  const key = cacheKeyForOrg(organizationId);
  return cacheByOrg.get(key)?.roles || null;
}

function invalidateRbacCache(organizationId) {
  if (organizationId != null) {
    cacheByOrg.delete(cacheKeyForOrg(organizationId));
    return;
  }
  cacheByOrg.clear();
}

/**
 * @param {string} roleKey
 * @param {string} operation
 * @param {import("mongoose").Types.ObjectId | string | null | undefined} organizationId
 */
async function canAccessOperation(roleKey, operation, organizationId = null) {
  const rbac = await getRbac(organizationId);
  const rk = String(roleKey || "").toLowerCase();
  if (!rk || !operation) return false;
  const roles = getCachedRolesForOrg(organizationId);
  if (!roles) return rbac.can(rk, operation);
  const perms = listEffectivePermissionsForKey(roles, rk);
  if (perms.includes("*")) return true;
  return rbac.can(rk, operation);
}

function listEffectivePermissionsForKey(roles, roleKey) {
  const key = String(roleKey || "").toLowerCase();
  const r = roles[key];
  if (!r) return [];
  const seen = new Set();
  const out = [];
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const role = roles[name];
    if (!role) return;
    if (role.inherits) {
      for (const p of role.inherits) visit(p);
    }
    for (const c of role.can || []) {
      if (!seen.has(`op:${c}`)) {
        seen.add(`op:${c}`);
        out.push(c);
      }
    }
  };
  visit(key);
  return out;
}

module.exports = {
  getRbac,
  canAccessOperation,
  loadConfigDoc,
  buildRolesFromConfigDoc,
  invalidateRbacCache,
  listEffectivePermissionsForKey,
  getCachedRolesForOrg,
};
