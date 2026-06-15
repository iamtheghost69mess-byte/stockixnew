const createHttpError = require("http-errors");
const RbacConfig = require("../models/rbacConfigModel");
const { PERMISSIONS, BUILTIN_ROLE_KEYS } = require("../constants/permissionsCatalog");
const defaultRbacRoles = require("../constants/defaultRbacRoles");
const {
  invalidateRbacCache,
  buildRolesFromConfigDoc,
  listEffectivePermissionsForKey,
  loadConfigDoc,
} = require("../services/rbacService");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");
const { validateRbacPayload } = require("../utils/rbacPayloadValidation");

async function resolveRbacDoc(req) {
  const orgId = resolveOrganizationIdFromUser(req.user);
  return loadConfigDoc(orgId);
}

const getCatalog = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        permissions: PERMISSIONS,
        builtinRoleKeys: BUILTIN_ROLE_KEYS,
        defaults: defaultRbacRoles,
      },
    });
  } catch (e) {
    next(e);
  }
};

const getConfig = async (req, res, next) => {
  try {
    const doc = await resolveRbacDoc(req);
    res.status(200).json({
      success: true,
      data: {
        builtinOverrides: doc.builtinOverrides || {},
        customRoles: doc.customRoles || [],
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

const putConfig = async (req, res, next) => {
  try {
    const { builtinOverrides, customRoles } = req.body || {};
    if (builtinOverrides != null && typeof builtinOverrides !== "object") {
      return next(createHttpError(400, "builtinOverrides must be an object."));
    }
    if (customRoles != null && !Array.isArray(customRoles)) {
      return next(createHttpError(400, "customRoles must be an array."));
    }

    if (
      builtinOverrides?.admin?.can &&
      Array.isArray(builtinOverrides.admin.can) &&
      !builtinOverrides.admin.can.includes("*")
    ) {
      return next(
        createHttpError(
          400,
          'Built-in admin role must include the "*" permission.'
        )
      );
    }

    const keys = new Set(BUILTIN_ROLE_KEYS);
    if (Array.isArray(customRoles)) {
      for (const cr of customRoles) {
        const k = String(cr.key || "").toLowerCase();
        if (!k || keys.has(k)) {
          return next(
            createHttpError(
              400,
              `Custom role key "${cr.key}" is invalid or conflicts with a built-in role.`
            )
          );
        }
        keys.add(k);
      }
    }

    const payloadErr = validateRbacPayload(
      builtinOverrides ?? null,
      customRoles ?? null
    );
    if (payloadErr) {
      return next(createHttpError(400, payloadErr));
    }

    const orgId = resolveOrganizationIdFromUser(req.user);
    const setPayload = {
      ...(builtinOverrides != null ? { builtinOverrides } : {}),
      ...(customRoles != null ? { customRoles } : {}),
    };
    let doc;
    if (orgId) {
      doc = await RbacConfig.findOneAndUpdate(
        { organization: orgId },
        { $set: { ...setPayload, organization: orgId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      const existing = await loadConfigDoc(null);
      doc = await RbacConfig.findByIdAndUpdate(
        existing._id,
        { $set: setPayload },
        { new: true }
      );
    }

    invalidateRbacCache(orgId);
    res.status(200).json({
      success: true,
      message: "RBAC configuration updated.",
      data: {
        builtinOverrides: doc.builtinOverrides || {},
        customRoles: doc.customRoles || [],
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

const getMe = async (req, res, next) => {
  try {
    const doc = await resolveRbacDoc(req);
    const roles = buildRolesFromConfigDoc(doc);
    const key = rbacRoleKey(req.user);
    const permissions = listEffectivePermissionsForKey(roles, key);
    res.status(200).json({
      success: true,
      data: {
        rbacRoleKey: key,
        userRole: req.user.role,
        permissionRole: req.user.permissionRole || null,
        permissions,
      },
    });
  } catch (e) {
    next(e);
  }
};

const listCustomRoles = async (req, res, next) => {
  try {
    const doc = await resolveRbacDoc(req);
    res.status(200).json({
      success: true,
      data: doc.customRoles || [],
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getCatalog,
  getConfig,
  putConfig,
  getMe,
  listCustomRoles,
};
