/**
 * Validates POS ↔ Finance integration config for provision resume and health checks.
 * @param {object|null|undefined} integrationConfig - IntegrationConfig document or lean object
 * @param {object} [opts]
 * @param {boolean} [opts.requireAccountingFlag] - When true, AccountingConfig.bigcapitalIntegrationEnabled must be set (tenant UI path only)
 */
function evaluateBigcapitalIntegrationHealth(integrationConfig, opts = {}) {
  const bc = integrationConfig?.bigcapital;
  if (!bc) {
    return { healthy: false, reason: "integration_config_missing" };
  }
  if (!bc.enabled) {
    return { healthy: false, reason: "integration_disabled" };
  }
  if (!bc.financeTenantId) {
    return { healthy: false, reason: "finance_tenant_id_missing" };
  }
  if (!String(bc.internalBaseUrl || "").trim()) {
    return { healthy: false, reason: "internal_base_url_missing" };
  }
  if (!String(bc.internalSecret || "").trim()) {
    return { healthy: false, reason: "internal_secret_missing" };
  }
  if (!bc.defaultWalkInCustomerId) {
    return { healthy: false, reason: "walk_in_customer_missing" };
  }
  if (!bc.defaultCashDepositAccountId || !bc.defaultCardDepositAccountId) {
    return { healthy: false, reason: "deposit_accounts_missing" };
  }
  if (opts.requireAccountingFlag && !opts.accountingIntegrationEnabled) {
    return { healthy: false, reason: "accounting_integration_flag_off" };
  }
  return { healthy: true };
}

module.exports = {
  evaluateBigcapitalIntegrationHealth,
};
