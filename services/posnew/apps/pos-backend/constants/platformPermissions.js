/** Granular platform permissions used by `middlewares/platformRbac.js` */

const P = {
  ORG_READ: "org:read",
  ORG_WRITE: "org:write",
  METRICS_READ: "metrics:read",
  WEBHOOK_ADMIN: "webhook:admin",
  QUEUE_ADMIN: "queue:admin",
  FLAG_ADMIN: "flag:admin",
  IMPERSONATE: "impersonate",
  COMPLIANCE_RUN: "compliance:run",
  INVITE_ADMIN: "invite:admin",
  AUDIT_READ: "audit:read",
};

const ROLE_DEFAULT_PERMISSIONS = {
  platform_owner: Object.values(P),
  platform_support_read: [
    P.ORG_READ,
    P.METRICS_READ,
    P.AUDIT_READ,
  ],
  platform_support_write: [
    P.ORG_READ,
    P.ORG_WRITE,
    P.METRICS_READ,
    P.AUDIT_READ,
    P.WEBHOOK_ADMIN,
    P.INVITE_ADMIN,
    P.FLAG_ADMIN,
    P.COMPLIANCE_RUN,
    P.IMPERSONATE,
  ],
  platform_finance: [P.ORG_READ, P.METRICS_READ, P.AUDIT_READ, P.COMPLIANCE_RUN],
  platform_engineer: [
    P.ORG_READ,
    P.METRICS_READ,
    P.QUEUE_ADMIN,
    P.FLAG_ADMIN,
    P.AUDIT_READ,
    P.COMPLIANCE_RUN,
  ],
};

function permissionsForRoles(roles, apiScopes = []) {
  const set = new Set(apiScopes);
  for (const r of roles || []) {
    const perms = ROLE_DEFAULT_PERMISSIONS[r];
    if (perms) perms.forEach((x) => set.add(x));
  }
  return [...set];
}

function hasPermission(roles, permission, apiScopes = []) {
  if ((roles || []).includes("platform_owner")) return true;
  const eff = permissionsForRoles(roles, apiScopes);
  if (permission === P.ORG_READ && eff.includes(P.ORG_WRITE)) return true;
  return eff.includes(permission);
}

module.exports = {
  P,
  ROLE_DEFAULT_PERMISSIONS,
  permissionsForRoles,
  hasPermission,
};
