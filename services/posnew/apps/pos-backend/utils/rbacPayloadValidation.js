const { PERMISSIONS, BUILTIN_ROLE_KEYS } = require("../constants/permissionsCatalog");

/** @type {Set<string>} */
let catalogIdSet = null;

/** @type {Set<string>} */
let builtinKeySet = null;

function getBuiltinKeySet() {
  if (!builtinKeySet) {
    builtinKeySet = new Set(BUILTIN_ROLE_KEYS.map((k) => String(k).toLowerCase()));
  }
  return builtinKeySet;
}

function getCatalogIdSet() {
  if (!catalogIdSet) {
    catalogIdSet = new Set(
      PERMISSIONS.filter((p) => p && p.id && p.id !== "*").map((p) => String(p.id))
    );
  }
  return catalogIdSet;
}

/**
 * @param {string} stem
 * @param {Set<string>} ids
 */
function stemCoversCatalogId(stem, ids) {
  if (!stem || stem.endsWith(".")) return false;
  for (const id of ids) {
    if (id === stem || id.startsWith(`${stem}.`)) return true;
  }
  return false;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function isValidPermissionToken(token) {
  const t = String(token || "").trim();
  if (!t) return false;
  if (t === "*") return true;
  const ids = getCatalogIdSet();
  if (ids.has(t)) return true;
  if (!/^[a-z0-9][a-z0-9._*-]*$/.test(t)) return false;
  if (t.endsWith(".*")) {
    const stem = t.slice(0, -2);
    return stemCoversCatalogId(stem, ids);
  }
  return false;
}

/**
 * @param {unknown} canList
 * @param {string} contextLabel
 * @returns {string | null}
 */
function validateCanArray(canList, contextLabel) {
  if (!Array.isArray(canList)) {
    return `${contextLabel}: "can" must be an array.`;
  }
  for (const raw of canList) {
    const token = String(raw ?? "").trim();
    if (!isValidPermissionToken(token)) {
      return `${contextLabel}: unknown or invalid permission "${raw}".`;
    }
  }
  return null;
}

/**
 * @param {unknown} inherits
 * @param {string} contextLabel
 * @param {Set<string>} allowedKeys
 * @returns {string | null}
 */
function validateInheritsArray(inherits, contextLabel, allowedKeys) {
  if (inherits == null) return null;
  if (!Array.isArray(inherits)) {
    return `${contextLabel}: "inherits" must be an array.`;
  }
  for (const raw of inherits) {
    const k = String(raw ?? "").toLowerCase().trim();
    if (!k || !allowedKeys.has(k)) {
      return `${contextLabel}: invalid inherits entry "${raw}".`;
    }
  }
  return null;
}

/**
 * @param {unknown} builtinOverrides
 * @param {unknown} customRoles
 * @returns {string | null}
 */
function validateRbacConfigPayload(builtinOverrides, customRoles) {
  const builtins = getBuiltinKeySet();
  if (builtinOverrides != null) {
    if (typeof builtinOverrides !== "object" || Array.isArray(builtinOverrides)) {
      return "builtinOverrides must be a plain object.";
    }
    for (const [roleKey, entry] of Object.entries(builtinOverrides)) {
      const rk = String(roleKey).toLowerCase();
      if (!builtins.has(rk)) {
        return `builtinOverrides: unknown built-in role key "${roleKey}".`;
      }
      if (!entry || typeof entry !== "object") {
        return `builtinOverrides.${roleKey} must be an object.`;
      }
      const err = validateCanArray(entry.can, `builtinOverrides.${roleKey}`);
      if (err) return err;
      const inhErr = validateInheritsArray(
        entry.inherits,
        `builtinOverrides.${roleKey}`,
        builtins
      );
      if (inhErr) return inhErr;
    }
  }
  if (customRoles != null) {
    if (!Array.isArray(customRoles)) {
      return "customRoles must be an array.";
    }
    /** @type {Set<string>} */
    const seenCustomKeys = new Set();
    for (let i = 0; i < customRoles.length; i += 1) {
      const cr = customRoles[i];
      const label = `customRoles[${i}]`;
      if (!cr || typeof cr !== "object") {
        return `${label} must be an object.`;
      }
      const rawKey = cr.key;
      const ck = String(rawKey ?? "").toLowerCase().trim();
      if (!ck || !/^[a-z][a-z0-9_]{0,63}$/.test(ck)) {
        return `${label}: invalid role key "${rawKey}".`;
      }
      if (seenCustomKeys.has(ck)) {
        return `${label}: duplicate custom role key "${ck}".`;
      }
      seenCustomKeys.add(ck);
      if (builtins.has(ck)) {
        return `${label}: key "${rawKey}" conflicts with a built-in role.`;
      }
      if (cr.inheritsFrom != null && String(cr.inheritsFrom).trim() !== "") {
        const parent = String(cr.inheritsFrom).toLowerCase().trim();
        if (!builtins.has(parent)) {
          return `${label}: inheritsFrom must be a built-in role key; got "${cr.inheritsFrom}".`;
        }
      }
      const err = validateCanArray(cr.can, label);
      if (err) return err;
    }
  }
  return null;
}

/** Alias for {@link validateRbacConfigPayload} (plan / API naming). */
const validateRbacPayload = validateRbacConfigPayload;

module.exports = {
  validateRbacConfigPayload,
  validateRbacPayload,
  validateCanArray,
  isValidPermissionToken,
};
