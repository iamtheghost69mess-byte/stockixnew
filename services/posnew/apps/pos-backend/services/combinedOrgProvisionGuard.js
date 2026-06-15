const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const config = require("../config/config");

/**
 * Combined POS+Accounting stacks set FINANCE_INTERNAL_BASE_URL on the POS compose project.
 */
function isCombinedPosStack() {
  return Boolean(String(process.env.FINANCE_INTERNAL_BASE_URL || "").trim());
}

/**
 * Block ad-hoc platform org creation on combined tenants (use control-plane org provision).
 * Worker bootstrap is allowed via stockix-provision-* idempotency keys.
 *
 * @param {{ stockixTenantId?: string, idempotencyKey?: string }} params
 * @throws {import('http-errors').HttpError}
 */
async function assertCanCreatePlatformOrg(params) {
  const idem = params.idempotencyKey ? String(params.idempotencyKey).trim() : "";
  if (idem.startsWith("stockix-provision-")) {
    return;
  }
  if (!isCombinedPosStack()) {
    return;
  }

  const tenantId = String(
    params.stockixTenantId || config.stockixTenantId || ""
  ).trim();
  if (!tenantId) {
    return;
  }

  const existingCount = await Organization.countDocuments({
    stockixTenantId: tenantId,
    lifecycle: { $ne: "deleted" },
  });
  if (existingCount === 0) {
    return;
  }

  const err = createHttpError(
    409,
    "Additional organizations for combined POS+Accounting tenants must be created via the Stockix control plane (POST /tenants/:tenantId/organizations). Platform POST /organizations is limited to the initial provision bootstrap.",
  );
  err.code = "COMBINED_ORG_REQUIRES_CONTROL_PLANE";
  throw err;
}

module.exports = {
  isCombinedPosStack,
  assertCanCreatePlatformOrg,
};
