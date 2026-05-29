const User = require("../models/userModel");
const Organization = require("../models/organizationModel");

const BOOTSTRAP_ROLES = [
  "admin",
  "manager",
  "waiter",
  "cashier",
  "kitchen",
  "hostess",
];

/**
 * Rebuild organization.defaultCredentials as masked rows from bootstrap users
 * (username/name matches role). Never invents plaintext PINs.
 */
async function syncDefaultCredentialsFromUsers(orgId) {
  const org = await Organization.findById(orgId);
  if (!org) {
    const err = new Error("Organization not found.");
    err.status = 404;
    throw err;
  }

  const existingByRole = new Map();
  for (const row of org.defaultCredentials || []) {
    if (!row?.role) continue;
    existingByRole.set(String(row.role).toLowerCase(), row);
  }

  const users = await User.find({
    organization: orgId,
    role: { $in: BOOTSTRAP_ROLES },
  })
    .select("role username name")
    .lean();

  const synced = [];
  for (const user of users) {
    const role = String(user.role || "").toLowerCase();
    const username = String(user.username || "").toLowerCase();
    const name = String(user.name || "").toLowerCase();
    if (!BOOTSTRAP_ROLES.includes(role)) continue;
    if (username !== role && name !== role) continue;
    const prev = existingByRole.get(role);
    synced.push({
      role,
      username: username || role,
      pinMasked: prev?.pinMasked ?? "••••••",
      pinLastTwo: prev?.pinLastTwo ?? "",
    });
  }

  org.defaultCredentials = synced;
  await org.save();

  return {
    organizationId: String(orgId),
    syncedCount: synced.length,
    defaultCredentials: synced,
  };
}

module.exports = {
  BOOTSTRAP_ROLES,
  syncDefaultCredentialsFromUsers,
};
