const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const RbacConfig = require("../models/rbacConfigModel");
const User = require("../models/userModel");
const Category = require("../models/categoryModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const accountingService = require("./accountingService");
const { recordEvent } = require("./productEventService");
const { computePinLookup } = require("../utils/pinLookup");
 
const DEFAULT_BOOTSTRAP_ROLES = [
  "admin",
  "manager",
  "waiter",
  "cashier",
  "kitchen",
  "hostess",
];
 
const STEPS = [
  { id: "infrastructure", label: "Core Infrastructure" },
  { id: "identity", label: "Identity & RBAC" },
  { id: "accounting", label: "Fiscal Ledger" },
  { id: "menu", label: "Menu Baseline" },
  { id: "branding", label: "Tenant Branding" },
  { id: "finalization", label: "Platform Finalization" },
];
 
async function allocateUniqueSixDigitPin() {
  for (let i = 0; i < 100; i++) {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinLookup = computePinLookup(pin);
    const taken = await User.exists({ pinLookup });
    if (!taken) return pin;
  }
  throw new Error("bootstrap_pin_allocation_exhausted");
}
 
/**
 * Professional Platform Bootstrap Orchestrator.
 * Handles organization provisioning through a stateful, resumable pipeline.
 */
async function bootstrapOrganization({ organizationId }) {
  if (!organizationId || !mongoose.Types.ObjectId.isValid(String(organizationId))) {
    return { ok: false, reason: "invalid_organization_id" };
  }
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
 
  // Initialize steps in DB if missing
  await Organization.findByIdAndUpdate(orgId, {
    $setOnInsert: {
      provisioningSteps: STEPS.map(s => ({ step: s.id, status: "pending" }))
    }
  }, { upsert: false });
 
  const updateStep = async (stepId, status, error = "") => {
    await Organization.updateOne(
      { _id: orgId, "provisioningSteps.step": stepId },
      { 
        $set: { 
          "provisioningSteps.$.status": status,
          "provisioningSteps.$.error": error,
          "provisioningSteps.$.completedAt": status === "completed" ? new Date() : undefined
        } 
      }
    );
  };
 
  try {
    // 1. CORE INFRASTRUCTURE
    await updateStep("infrastructure", "in_progress");
    const hasLoc = await Location.exists({ organization: orgId });
    if (!hasLoc) {
      await Location.create({ organization: orgId, name: "Main", code: "MAIN" });
    }
    await updateStep("infrastructure", "completed");
 
    // 2. IDENTITY & RBAC
    await updateStep("identity", "in_progress");
    await RbacConfig.findOneAndUpdate(
      { organization: orgId },
      { $setOnInsert: { organization: orgId, builtinOverrides: {}, customRoles: [] } },
      { upsert: true }
    );
 
    const userCount = await User.countDocuments({ organization: orgId });
    if (userCount === 0) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const defaultCredentials = [];
          for (const role of DEFAULT_BOOTSTRAP_ROLES) {
            const pin = await allocateUniqueSixDigitPin();
            await User.create(
              [{ name: role, username: role, role, organization: orgId, pin }],
              { session }
            );
            defaultCredentials.push({ role, username: role, pin });
          }
          await Organization.findByIdAndUpdate(orgId, { $set: { defaultCredentials } }, { session });
        });
      } finally {
        await session.endSession();
      }
    }
    await updateStep("identity", "completed");
 
    // 3. ACCOUNTING
    await updateStep("accounting", "in_progress");
    await accountingService.ensureDefaultAccountsAndConfig(orgId);
    await updateStep("accounting", "completed");
 
    // 4. MENU BASELINE
    await updateStep("menu", "in_progress");
    const existingCat = await Category.exists({ organization: orgId });
    if (!existingCat) {
      await Category.insertMany(
        [
          { name: "Main Course", color: "#ef4444" },
          { name: "Beverages", color: "#0ea5e9" },
        ].map((c) => ({ ...c, organization: orgId }))
      );
    }
    await updateStep("menu", "completed");
 
    // 5. BRANDING
    await updateStep("branding", "in_progress");
    const org = await Organization.findById(orgId).select("name").lean();
    await PublicMenuBranding.findOneAndUpdate(
      { organization: orgId, scopeKey: "default" },
      {
        $setOnInsert: {
          organization: orgId,
          scopeKey: "default",
          displayName: String(org?.name || "Menu").trim(),
          accentColor: "#ca8a04",
          showPrices: true,
        },
      },
      { upsert: true }
    );
    await updateStep("branding", "completed");
 
    // 6. FINALIZATION
    await updateStep("finalization", "in_progress");
    await recordEvent({
      eventType: "tenant.bootstrap.complete",
      organizationId: orgId,
      metadata: { infrastructure: true, identity: true, accounting: true },
    });
    await Organization.findByIdAndUpdate(orgId, { isBootstrapped: true });
    await updateStep("finalization", "completed");
 
    return { ok: true };
  } catch (e) {
    // Record failure in the current active step
    await Organization.updateOne(
      { _id: orgId, "provisioningSteps.status": "in_progress" },
      { $set: { "provisioningSteps.$.status": "failed", "provisioningSteps.$.error": e.message } }
    );
    return { ok: false, reason: e.message };
  }
}
 
module.exports = { bootstrapOrganization, STEPS };
