// Stub base class — replaces the real AgingSummaryTable during webpack bundling
// to break its circular dependency (R.pipe mixin chain reads AgingReport before
// AgingReport is fully initialized). FinancialStatements routes register normally;
// the actual report logic can be restored once the circular dep is restructured.
export abstract class AgingSummaryTable {}
