const { isVerifiedUser } = require("./tokenVerification");
const { attachTenantOrganization } = require("./attachTenantOrganization");
const { requireTenantOrganization } = require("./tenancyScope");
const { requireActiveOrganization } = require("./requireActiveOrganization");
const { requireSetupComplete } = require("./requireSetupComplete");
const { locationScope } = require("./locationScope");
const { locationMiddleware } = require("./locationMiddleware");
const { productEventMutation } = require("./productEventMutation");
const { meterTenantApiCall } = require("./usageMetering");

/** Authenticated POS user with `req.tenantOrganizationId` when assigned. */
const authedTenant = [
  isVerifiedUser,
  attachTenantOrganization,
  requireTenantOrganization(),
  requireActiveOrganization,
  requireSetupComplete,
  meterTenantApiCall,
  productEventMutation,
];

/** Adds location scope + org validation for location vs organization. */
const authedTenantLocation = [
  isVerifiedUser,
  attachTenantOrganization,
  requireTenantOrganization(),
  requireActiveOrganization,
  requireSetupComplete,
  meterTenantApiCall,
  locationScope,
  locationMiddleware,
  productEventMutation,
];

module.exports = {
  isVerifiedUser,
  attachTenantOrganization,
  requireActiveOrganization,
  locationScope,
  locationMiddleware,
  meterTenantApiCall,
  productEventMutation,
  authedTenant,
  authedTenantLocation,
};
