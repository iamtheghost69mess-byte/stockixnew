/**
 * Stub monthly catalog prices (cents) keyed by `Subscription.planKey` / `Organization.planKey`.
 * Replace with provider price book or DB-backed plans when billing integration is complete.
 */
const PLAN_MONTHLY_PRICE_CENTS = Object.freeze({
  standard: 9_900,
  pro: 19_900,
  enterprise: 49_900,
});

function monthlyPriceCentsForPlanKey(planKey) {
  const k = String(planKey || "standard")
    .toLowerCase()
    .trim();
  return PLAN_MONTHLY_PRICE_CENTS[k] ?? PLAN_MONTHLY_PRICE_CENTS.standard;
}

module.exports = {
  PLAN_MONTHLY_PRICE_CENTS,
  monthlyPriceCentsForPlanKey,
};
