const User = require("../models/userModel");
const { rbacRoleKey } = require("../utils/rbacRoleKey");
const {
  buildRolesFromConfigDoc,
  listEffectivePermissionsForKey,
  loadConfigDoc,
} = require("../services/rbacService");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");

/**
 * Full POS profile + RBAC permissions (same shape as GET /api/user `data`).
 * @param {{ _id: unknown }} userFromReq `req.user` from JWT middleware
 */
async function getUserProfilePayload(userFromReq) {
  const user = await User.findById(userFromReq._id)
    .populate("location", "name code waiterCanPrintReceipt")
    .populate("locations", "name code waiterCanPrintReceipt")
    .populate("organization", "name slug accountingRelayMode financeUrl");
  const doc = await loadConfigDoc(resolveOrganizationIdFromUser(user));
  const roles = buildRolesFromConfigDoc(doc);
  const key = rbacRoleKey(user);
  const permissions = listEffectivePermissionsForKey(roles, key);

  const u = user.toJSON();
  u.rbacRoleKey = key;
  u.permissions = permissions;
  return u;
}

const getUserData = async (req, res, next) => {
  try {
    const u = await getUserProfilePayload(req.user);
    res.status(200).json({ success: true, data: u });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUserData, getUserProfilePayload };
