/**
 * Schema / data migrations — run with `npm run migrate:schema`.
 * Keep migrations idempotent; registration order is execution order.
 */

const orgBackfillMigrations = require("./orgBackfillMigrations");
const accountingOrgScopeMigration = require("./2026-04-10-005-accounting-org-scope");
const userLocationIdsBackfill = require("./2026-04-27-004-user-locationIds-backfill");
const stockDeductPaymentOnly = require("./2026-04-28-006-stock-deduct-payment-only");
const pinLookupPerOrg = require("./2026-05-24-007-pin-lookup-per-org");

module.exports = [
  {
    migrationId: "2026-04-09-001-entitlements-schema-version",
    description: "Ensure Organization.entitlementsSchemaVersion defaults are set.",
    async run() {
      const Organization = require("../models/organizationModel");
      await Organization.updateMany(
        { $or: [{ entitlementsSchemaVersion: null }, { entitlementsSchemaVersion: { $exists: false } }] },
        { $set: { entitlementsSchemaVersion: 1 } }
      );
    },
  },
  {
    migrationId: "2026-04-09-002-org-usage-period",
    description: "Initialize usage counter period marker where missing.",
    async run() {
      const Organization = require("../models/organizationModel");
      const now = new Date();
      const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      await Organization.updateMany(
        {
          $or: [
            { "usageCounters.usagePeriodYm": "" },
            { "usageCounters.usagePeriodYm": { $exists: false } },
          ],
        },
        { $set: { "usageCounters.usagePeriodYm": ym } }
      );
    },
  },
  {
    migrationId: "2026-04-09-003-ensure-rbac-per-org",
    description:
      "Ensure each Organization has an RbacConfig document (empty overrides).",
    async run() {
      const Organization = require("../models/organizationModel");
      const RbacConfig = require("../models/rbacConfigModel");
      const orgs = await Organization.find({}).select("_id").lean();
      for (const o of orgs) {
        const exists = await RbacConfig.findOne({ organization: o._id });
        if (!exists) {
          await RbacConfig.create({
            organization: o._id,
            builtinOverrides: {},
            customRoles: [],
          });
        }
      }
    },
  },
  ...orgBackfillMigrations,
  accountingOrgScopeMigration,
  userLocationIdsBackfill,
  stockDeductPaymentOnly,
  pinLookupPerOrg,
];
