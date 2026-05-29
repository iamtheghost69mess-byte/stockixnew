const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const Order = require("../models/orderModel");
const Payment = require("../models/paymentModel");
const PosAuditLog = require("../models/posAuditLogModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const { parsePaginationQuery } = require("../utils/listPagination");
const {
  assertStaffCreateAllowed,
  maxUsersFromEntitlements,
} = require("../services/entitlementService");
const { loadConfigDoc } = require("../services/rbacService");

const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;

/**
 * Accept either `locationIds` or `locations` (or both) on staff APIs.
 * @returns {string[] | null} `null` when neither field was sent.
 */
function mergeLocationIdsFromBody(body) {
  if (!body || typeof body !== "object") return null;
  const has =
    body.locationIds !== undefined ||
    body.locations !== undefined;
  if (!has) return null;
  const a = Array.isArray(body.locationIds) ? body.locationIds : [];
  const b = Array.isArray(body.locations) ? body.locations : [];
  return [
    ...new Set(
      [...a, ...b]
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

/**
 * Resolves custom roles from `RbacConfig` for the given tenant (`organizationId`) or the legacy
 * org-less document — same semantics as {@link loadConfigDoc} (never `findById("singleton")`).
 *
 * @param {string} permissionRole
 * @param {import("mongoose").Types.ObjectId | null | undefined} organizationId
 */
async function assertValidCustomPermissionRole(permissionRole, organizationId) {
  const key = String(permissionRole).toLowerCase().trim();
  if (!key) {
    const err = new Error("Invalid permission role.");
    err.status = 400;
    throw err;
  }
  const doc = await loadConfigDoc(organizationId ?? null);
  const ok = (doc?.customRoles || []).some(
    (c) => String(c.key).toLowerCase() === key
  );
  if (!ok) {
    const err = new Error(
      "permissionRole must match a custom role defined in RBAC settings (Dashboard → Roles)."
    );
    err.status = 400;
    throw err;
  }
  return key;
}

const normalizeRole = (role) => {
  if (role == null || role === "") return null;
  return String(role).toLowerCase().trim();
};

const normalizeUsername = (username) => {
  if (username == null) return null;
  const normalized = String(username).trim().toLowerCase();
  return normalized || null;
};

async function staffLimitsPayload(orgId) {
  const org = await Organization.findById(orgId)
    .select("entitlements licenseStartsAt licenseEndsAt")
    .lean();
  const staffCount = await User.countDocuments({ organization: orgId });
  const maxUsers = maxUsersFromEntitlements(org?.entitlements);
  return {
    maxUsers,
    staffCount,
    licenseStartsAt: org?.licenseStartsAt ?? null,
    licenseEndsAt: org?.licenseEndsAt ?? null,
  };
}

function sanitizeStaffListRow(u) {
  const o =
    u && typeof u.toObject === "function"
      ? u.toObject({ virtuals: true })
      : { ...(u || {}) };
  const pinLookup = o.pinLookup;
  delete o.pinLookup;
  delete o.pin;
  delete o.passwordHash;
  delete o.currentRefreshJti;
  o.hasLoginPin = Boolean(pinLookup);
  o.pinFailedAttempts = Number(o.pinFailedAttempts || 0);
  o.pinLockedUntil = o.pinLockedUntil || null;
  return o;
}

async function resolveStaffAssignedLocations({ orgId, locationIds }) {
  const rawIds = Array.isArray(locationIds) ? locationIds : [];
  const deduped = [...new Set(rawIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (deduped.length === 0) return [];
  if (!deduped.every((value) => mongoose.Types.ObjectId.isValid(value))) {
    throw createHttpError(400, "Each assigned location must be a valid id.");
  }
  const rows = await Location.find({
    _id: { $in: deduped },
    organization: orgId,
  })
    .select("_id")
    .lean();
  if (rows.length !== deduped.length) {
    throw createHttpError(400, "One or more assigned locations do not belong to your organization.");
  }
  return deduped;
}

async function logPosStaffAudit(req, action, targetUserId, metadata = {}) {
  const organizationId = req.tenantOrganizationId || req.user?.organization || null;
  if (!organizationId) return;
  await PosAuditLog.create({
    organization: organizationId,
    location: req.locationScopeId || null,
    user: req.user?._id || null,
    action: String(action || "").trim(),
    metadata: {
      targetUserId: targetUserId ? String(targetUserId) : "",
      ...(metadata && typeof metadata === "object" ? metadata : {}),
    },
  });
}

const listStaff = async (req, res, next) => {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(403, "Organization is required to list staff."));
    }
    const filter = { organization: orgId };
    const pag = parsePaginationQuery(req.query);
    const base = User.find(filter)
      .select("+pinLookup")
      .populate("location", "name code")
      .populate("locations", "name code")
      .sort({ name: 1 });

    const [users, total, limits] = await Promise.all([
      base.clone().skip(pag.skip).limit(pag.limit),
      User.countDocuments(filter),
      staffLimitsPayload(orgId),
    ]);
    res.status(200).json({
      success: true,
      data: users.map(sanitizeStaffListRow),
      page: pag.page,
      limit: pag.limit,
      total,
      limits,
    });
  } catch (error) {
    next(error);
  }
};

const getStaff = async (req, res, next) => {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(403, "Organization is required."));
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid user id."));
    }
    const user = await User.findOne({ _id: id, organization: orgId })
      .select("+pinLookup")
      .populate("location", "name code")
      .populate("locations", "name code");
    if (!user) {
      return next(createHttpError(404, "User not found."));
    }
    res.status(200).json({ success: true, data: sanitizeStaffListRow(user) });
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const {
      name,
      username,
      phone,
      email,
      pin,
      role,
      permissionRole,
      status,
      isActive,
      primaryLocationId,
    } = req.body;

    if (!name || !username || !pin || !role) {
      return next(createHttpError(400, "Name, username, pin, and role are required."));
    }

    const r = normalizeRole(role);
    if (!User.ROLES.includes(r)) {
      return next(
        createHttpError(400, `Role must be one of: ${User.ROLES.join(", ")}.`)
      );
    }

    if (req.user.role === "manager" && r === "admin") {
      return next(createHttpError(403, "Managers cannot create admin accounts."));
    }

    let permKey = null;
    try {
      const orgId = req.tenantOrganizationId;
      if (!orgId) {
        return next(createHttpError(403, "Organization is required to create staff."));
      }
      const usernameNorm = normalizeUsername(username);
      if (!usernameNorm || !USERNAME_REGEX.test(usernameNorm)) {
        return next(
          createHttpError(
            400,
            "username must be 3-30 characters and use only letters, numbers, underscores, or hyphens."
          )
        );
      }
      const usernameTaken = await User.exists({
        organization: orgId,
        username: usernameNorm,
      });
      if (usernameTaken) {
        return res.status(409).json({
          success: false,
          code: "USERNAME_TAKEN",
          message: "This username is already used in this organization.",
        });
      }

      if (permissionRole != null && String(permissionRole).trim() !== "") {
        try {
          permKey = await assertValidCustomPermissionRole(permissionRole, orgId);
        } catch (e) {
          if (e.status) return next(createHttpError(e.status, e.message));
          throw e;
        }
      }
      const statusNorm =
        status !== undefined
          ? String(status).toLowerCase().trim()
          : isActive === false
            ? "suspended"
            : "active";
      if (!["active", "suspended"].includes(statusNorm)) {
        return next(createHttpError(400, "status must be active or suspended."));
      }

      try {
        await assertStaffCreateAllowed(orgId);
      } catch (e) {
        if (e.status) return next(createHttpError(e.status, e.message));
        throw e;
      }

      const mergedLocationIds = mergeLocationIdsFromBody(req.body);
      const assignedLocationIds = await resolveStaffAssignedLocations({
        orgId,
        locationIds: mergedLocationIds != null ? mergedLocationIds : [],
      });
      const primaryLocation =
        primaryLocationId && mongoose.Types.ObjectId.isValid(String(primaryLocationId))
          ? String(primaryLocationId)
          : assignedLocationIds[0] || null;
      if (
        primaryLocation &&
        assignedLocationIds.length > 0 &&
        !assignedLocationIds.includes(primaryLocation)
      ) {
        return next(createHttpError(400, "primaryLocationId must be one of locationIds."));
      }
      const newUser = await User.create({
        organization: orgId,
        name: name.trim(),
        username: usernameNorm,
        phone: phone ? String(phone).trim() : undefined,
        email:
          email != null && String(email).trim() !== ""
            ? String(email).trim().toLowerCase()
            : undefined,
        pin: String(pin),
        role: r,
        permissionRole: permKey,
        status: statusNorm,
        location: primaryLocation,
        locations: assignedLocationIds,
      });
      const created = await User.findById(newUser._id)
        .select("+pinLookup")
        .populate("location", "name code")
        .populate("locations", "name code");
      await logPosStaffAudit(req, "staff_created", newUser._id, {
        role: String(newUser.role || ""),
      });
      res.status(201).json({
        success: true,
        message: "Staff member created.",
        data: sanitizeStaffListRow(created),
      });
    } catch (e) {
      if (e.code === 11000) {
        const kp = e.keyPattern || {};
        if (kp.organization && kp.name) {
          return next(
            createHttpError(409, "A user with this name already exists in this organization.")
          );
        }
        if (kp.organization && kp.username) {
          return res.status(409).json({
            success: false,
            code: "USERNAME_TAKEN",
            message: "This username is already used in this organization.",
          });
        }
        if (kp.organization && kp.pinLookup) {
          return next(createHttpError(400, "This PIN is already assigned to another user."));
        }
        if (kp.pinLookup) {
          return next(createHttpError(400, "This PIN is already assigned to another user."));
        }
        if (kp.organization && kp.email) {
          return next(
            createHttpError(409, "A user with this email already exists in this organization.")
          );
        }
        return next(createHttpError(409, "Duplicate key."));
      }
      if (e.status === 400) {
        return next(createHttpError(400, e.message));
      }
      next(e);
    }
  } catch (error) {
    next(error);
  }
};

const updateStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid user id."));
    }

    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(403, "Organization is required."));
    }

    const user = await User.findOne({ _id: id, organization: orgId });
    if (!user) {
      return next(createHttpError(404, "User not found."));
    }

    const previousStatus = String(user.status || "active").toLowerCase();

    if (req.user.role === "manager" && user.role === "admin") {
      return next(createHttpError(403, "Managers cannot modify admin accounts."));
    }

    const {
      name,
      username,
      phone,
      email,
      pin,
      role,
      permissionRole,
      status,
      isActive,
      primaryLocationId,
    } = req.body;

    if (name !== undefined) user.name = String(name).trim();
    if (username !== undefined) {
      const usernameNorm = normalizeUsername(username);
      if (!usernameNorm || !USERNAME_REGEX.test(usernameNorm)) {
        return next(
          createHttpError(
            400,
            "username must be 3-30 characters and use only letters, numbers, underscores, or hyphens."
          )
        );
      }
      const usernameTaken = await User.exists({
        organization: orgId,
        username: usernameNorm,
        _id: { $ne: user._id },
      });
      if (usernameTaken) {
        return res.status(409).json({
          success: false,
          code: "USERNAME_TAKEN",
          message: "This username is already used in this organization.",
        });
      }
      user.username = usernameNorm;
    }
    if (phone !== undefined) user.phone = phone ? String(phone).trim() : undefined;
    if (email !== undefined) {
      user.email = email != null && String(email).trim() !== "" ? String(email).trim().toLowerCase() : undefined;
    }

    if (status !== undefined) {
      const s = String(status).toLowerCase().trim();
      if (!["active", "suspended"].includes(s)) {
        return next(createHttpError(400, "status must be active or suspended."));
      }
      user.status = s;
    } else if (isActive !== undefined) {
      user.status = isActive ? "active" : "suspended";
    }

    if (permissionRole !== undefined) {
      if (permissionRole === null || permissionRole === "") {
        user.permissionRole = null;
      } else {
        try {
          user.permissionRole = await assertValidCustomPermissionRole(
            permissionRole,
            orgId
          );
        } catch (e) {
          if (e.status) return next(createHttpError(e.status, e.message));
          throw e;
        }
      }
    }

    if (role !== undefined) {
      const r = normalizeRole(role);
      if (!User.ROLES.includes(r)) {
        return next(
          createHttpError(400, `Role must be one of: ${User.ROLES.join(", ")}.`)
        );
      }
      if (req.user.role === "manager" && r === "admin") {
        return next(createHttpError(403, "Managers cannot assign the admin role."));
      }
      user.role = r;
    }

    if (pin !== undefined && pin !== "") {
      if (!/^\d{4,6}$/.test(String(pin))) {
        return next(createHttpError(400, "PIN must be 4 to 6 digits."));
      }
      user.pin = String(pin);
      user.pinFailedAttempts = 0;
      user.pinLockedUntil = null;
    }
    const mergedUpdateLocationIds = mergeLocationIdsFromBody(req.body);
    if (mergedUpdateLocationIds !== null) {
      const assignedLocationIds = await resolveStaffAssignedLocations({
        orgId,
        locationIds: mergedUpdateLocationIds,
      });
      user.locations = assignedLocationIds;
      if (assignedLocationIds.length === 0) {
        user.location = null;
      } else if (
        !user.location ||
        !assignedLocationIds.includes(String(user.location))
      ) {
        user.location = assignedLocationIds[0];
      }
    }
    if (primaryLocationId !== undefined) {
      if (primaryLocationId === null || primaryLocationId === "") {
        user.location = null;
      } else if (!mongoose.Types.ObjectId.isValid(String(primaryLocationId))) {
        return next(createHttpError(400, "primaryLocationId must be a valid id."));
      } else {
        const pid = String(primaryLocationId);
        const allowed = Array.isArray(user.locations)
          ? user.locations.map((value) => String(value))
          : [];
        if (allowed.length > 0 && !allowed.includes(pid)) {
          return next(createHttpError(400, "primaryLocationId must be one of locationIds."));
        }
        const exists = await Location.exists({ _id: pid, organization: orgId });
        if (!exists) {
          return next(createHttpError(400, "primaryLocationId does not belong to your organization."));
        }
        user.location = pid;
      }
    }

    try {
      const nextStatus = String(user.status || "active").toLowerCase();
      const becomingSuspended =
        nextStatus === "suspended" && previousStatus !== "suspended";
      await user.save();
      if (becomingSuspended) {
        await User.updateOne({ _id: user._id }, { $unset: { currentRefreshJti: 1 } });
        await logPosStaffAudit(req, "staff_deactivated", user._id, {
          previousStatus,
          nextStatus,
        });
      }
      const fresh = await User.findById(user._id)
        .select("+pinLookup")
        .populate("location", "name code")
        .populate("locations", "name code");
      res.status(200).json({
        success: true,
        message: "Staff member updated.",
        data: sanitizeStaffListRow(fresh),
      });
    } catch (e) {
      if (e.code === 11000) {
        const kp = e.keyPattern || {};
        if (kp.organization && kp.username) {
          return res.status(409).json({
            success: false,
            code: "USERNAME_TAKEN",
            message: "This username is already used in this organization.",
          });
        }
        if (kp.organization && kp.pinLookup) {
          return next(createHttpError(400, "This PIN is already assigned to another user."));
        }
        return next(createHttpError(400, "This PIN is already assigned to another user."));
      }
      if (e.status === 400) {
        return next(createHttpError(400, e.message));
      }
      next(e);
    }
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(403, "Organization is required."));
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid user id."));
    }

    if (String(id) === String(req.user._id)) {
      return next(createHttpError(400, "You cannot delete your own account."));
    }

    const user = await User.findOne({ _id: id, organization: orgId });
    if (!user) {
      return next(createHttpError(404, "User not found."));
    }

    if (req.user.role === "manager" && user.role === "admin") {
      return next(createHttpError(403, "Managers cannot delete admin accounts."));
    }

    if (user.role === "admin") {
      const adminCount = await User.countDocuments({
        role: "admin",
        organization: orgId,
      });
      if (adminCount <= 1) {
        return next(createHttpError(400, "Cannot delete the last admin account."));
      }
    }

    const [orderRefs, paymentRefs, posAuditRefs, journalAuditRefs] = await Promise.all([
      Order.countDocuments({
        organization: orgId,
        waiter: user._id,
      }),
      Payment.countDocuments({
        organization: orgId,
        $or: [{ user: user._id }, { createdBy: user._id }],
      }),
      PosAuditLog.countDocuments({
        organization: orgId,
        user: user._id,
      }),
      JournalAuditLog.countDocuments({
        organization: orgId,
        user: user._id,
      }),
    ]);
    const totalRefs = orderRefs + paymentRefs + posAuditRefs + journalAuditRefs;
    if (totalRefs > 0) {
      return res.status(400).json({
        success: false,
        code: "STAFF_DELETE_BLOCKED_REFERENCES",
        message:
          "Cannot delete staff with existing records. Deactivate this account instead.",
      });
    }

    await User.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Staff member removed." });
  } catch (error) {
    next(error);
  }
};

const unlockStaffPin = async (req, res, next) => {
  try {
    const orgId = req.tenantOrganizationId;
    if (!orgId) {
      return next(createHttpError(403, "Organization is required."));
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createHttpError(400, "Invalid user id."));
    }

    const user = await User.findOne({ _id: id, organization: orgId });
    if (!user) {
      return next(createHttpError(404, "User not found."));
    }

    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    const fresh = await User.findById(user._id)
      .select("+pinLookup")
      .populate("location", "name code")
      .populate("locations", "name code");

    return res.status(200).json({
      success: true,
      message: "Staff PIN lock reset.",
      data: sanitizeStaffListRow(fresh),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  unlockStaffPin,
};
