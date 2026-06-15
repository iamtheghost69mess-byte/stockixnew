const createHttpError = require("http-errors");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const AccountingConfig = require("../models/accountingConfigModel");
const Zone = require("../models/zoneModel");
const Ingredient = require("../models/ingredientModel");
const MenuItem = require("../models/menuItemModel");
const Recipe = require("../models/recipeModel");
const StockLot = require("../models/stockLotModel");
const Device = require("../models/deviceModel");
const User = require("../models/userModel");
const { assertTenantOrganization } = require("../utils/tenantOrg");

const MAX_STEP = 4;

function uniqSortedSteps(steps = []) {
  return [...new Set((steps || []).map((s) => Number(s)).filter((s) => s >= 1 && s <= MAX_STEP))].sort(
    (a, b) => a - b
  );
}

async function getMainLocation(orgId) {
  return Location.findOne({ organization: orgId }).sort({ createdAt: 1 });
}

async function buildGoLiveChecklist(orgId) {
  const [
    mainLocation,
    cfg,
    zoneCount,
    ingredientCount,
    recipeCount,
    menuItemCount,
    openingLotsCount,
    deviceMapped,
    staffCount,
  ] = await Promise.all([
    getMainLocation(orgId),
    AccountingConfig.findOne({ organization: orgId }).lean(),
    Zone.countDocuments({ organization: orgId, status: "active" }),
    Ingredient.countDocuments({
      organization: orgId,
      reorderThreshold: { $gt: 0 },
      reorderQuantity: { $gt: 0 },
    }),
    Recipe.countDocuments({ organization: orgId, "ingredients.0": { $exists: true } }),
    MenuItem.countDocuments({ organization: orgId }),
    StockLot.countDocuments({ organization: orgId, source: "opening_stock" }),
    Device.countDocuments({ organization: orgId, status: "approved" }),
    User.countDocuments({ organization: orgId, status: { $ne: "suspended" } }),
  ]);

  const requiresOpeningStock = ["fifo", "fefo"].includes(String(cfg?.defaultCostMethod || "fifo"));
  const locationReady = Boolean(mainLocation?.country && mainLocation?.timezone);
  const inventoryPolicyReady = Boolean(cfg?.defaultCostMethod && cfg?.stockDeductTrigger);
  const posRegisterReady = Boolean(cfg?.defaultPosSourceLocation) || deviceMapped > 0;

  return {
    mainLocationProfile: locationReady,
    inventoryPolicyConfigured: inventoryPolicyReady,
    hasAtLeastOneZone: zoneCount > 0,
    hasIngredientWithReorderRule: ingredientCount > 0,
    hasMenuItemWithBom: menuItemCount > 0 && recipeCount > 0,
    openingStockEnteredIfRequired: requiresOpeningStock ? openingLotsCount > 0 : true,
    posRegisterHasAssignedLocation: posRegisterReady,
    hasStaffAssigned: staffCount > 0,
    requiresOpeningStock,
  };
}

function checklistFailures(checklist) {
  // Advisory: not required to go live — configured post-setup in the dashboard
  const advisoryOnly = new Set([
    "hasIngredientWithReorderRule",
    "openingStockEnteredIfRequired",
    "hasMenuItemWithBom",
  ]);
  return Object.entries(checklist)
    .filter(
      ([key, ok]) =>
        key !== "requiresOpeningStock" &&
        !advisoryOnly.has(key) &&
        ok === false
    )
    .map(([key]) => key);
}

async function markStepComplete(org, stepNumber) {
  const completedSteps = uniqSortedSteps([...(org.setupWizard?.completedSteps || []), stepNumber]);
  org.setupWizard = {
    isComplete: Boolean(org.setupWizard?.isComplete),
    currentStep: Math.min(MAX_STEP, Math.max(stepNumber + 1, Number(org.setupWizard?.currentStep || 1))),
    completedSteps,
    completedAt: org.setupWizard?.completedAt || null,
  };
  await org.save();
}

async function validateAndApplyStep(stepNumber, body, orgId) {
  // ── Step 1: Business Identity ─────────────────────────────────────────────
  if (stepNumber === 1) {
    const {
      displayName,
      country,
      timezone,
      city,
      phone,
      address,
      taxVatNumber,
      receiptHeaderText,
      receiptFooterText,
      logoUrl,
      tagline,
    } = body || {};

    if (!displayName || !String(displayName).trim()) {
      throw createHttpError(400, "displayName (business name) is required for step 1.");
    }
    if (!country || !String(country).trim()) {
      throw createHttpError(400, "country is required for step 1.");
    }
    if (!timezone || !String(timezone).trim()) {
      throw createHttpError(400, "timezone is required for step 1.");
    }

    const mainLocation = await getMainLocation(orgId);
    if (!mainLocation) throw createHttpError(400, "No location found for organization.");

    mainLocation.country = String(country).trim();
    mainLocation.city = String(city || "").trim();
    mainLocation.timezone = String(timezone).trim();
    mainLocation.phone = String(phone || "").trim();
    mainLocation.address = String(address || "").trim();
    mainLocation.taxVatNumber = String(taxVatNumber || "").trim();
    await mainLocation.save();

    const branding = await PublicMenuBranding.findOneAndUpdate(
      { organization: orgId, scopeKey: "default" },
      {
        $set: {
          displayName: String(displayName).trim(),
          tagline: String(tagline || "").trim(),
          receiptHeaderText: String(receiptHeaderText || "").trim(),
          receiptFooterText: String(receiptFooterText || "").trim(),
          ...(logoUrl ? { logoUrl: String(logoUrl).trim() } : {}),
        },
      },
      { new: true, upsert: true }
    );
    return { mainLocation, branding };
  }

  // ── Step 2: Inventory Policy ──────────────────────────────────────────────
  if (stepNumber === 2) {
    const { defaultCostMethod, stockDeductTrigger, strictOversellMode } = body || {};

    const method = String(defaultCostMethod || "").toLowerCase();
    if (!["fifo", "fefo", "weighted_average", "standard"].includes(method)) {
      throw createHttpError(400, "defaultCostMethod must be fifo | fefo | weighted_average | standard.");
    }
    const triggerRaw = String(stockDeductTrigger || "payment").toLowerCase();
    if (!["kitchen_send", "payment", "both"].includes(triggerRaw)) {
      throw createHttpError(400, "stockDeductTrigger must be kitchen_send | payment | both.");
    }
    const oversell = String(strictOversellMode || "block").toLowerCase();
    if (!["block", "warn"].includes(oversell)) {
      throw createHttpError(400, "strictOversellMode must be block | warn.");
    }

    const cfg = await AccountingConfig.findOneAndUpdate(
      { organization: orgId },
      {
        $set: {
          defaultCostMethod: method,
          stockDeductTrigger: "payment",
          strictOversell: oversell === "block",
          // Safe defaults — adjustable later in Settings
          reserveStockOnPending: true,
          inventoryAlertsEnabled: false,
          inventoryExpiryAlertDays: 7,
          inventoryAlertWebhookUrl: "",
        },
      },
      { new: true, upsert: true }
    );
    return { config: cfg };
  }

  // ── Step 3: First Zone ────────────────────────────────────────────────────
  if (stepNumber === 3) {
    const { zoneName, mainLocationName } = body || {};

    if (!zoneName || !String(zoneName).trim()) {
      throw createHttpError(400, "zoneName is required for step 3.");
    }

    const mainLocation = await getMainLocation(orgId);
    if (!mainLocation) throw createHttpError(400, "No location found for organization.");

    if (mainLocationName && String(mainLocationName).trim()) {
      mainLocation.name = String(mainLocationName).trim();
    }
    await mainLocation.save();

    let zoneCount = await Zone.countDocuments({ organization: orgId, status: "active" });
    if (zoneCount <= 0) {
      const newZone = await Zone.create({
        organization: orgId,
        location: mainLocation._id,
        name: String(zoneName).trim(),
        zoneType: "bulk",
        status: "active",
      });
      mainLocation.defaultZone = newZone._id;
      await mainLocation.save();
      zoneCount = 1;
    } else {
      const firstZone = await Zone.findOne({ organization: orgId, status: "active" }).sort({ createdAt: 1 });
      if (firstZone) {
        firstZone.name = String(zoneName).trim();
        await firstZone.save();
      }
    }

    // Auto-configure POS defaults and staff permissions — no separate step required
    await AccountingConfig.findOneAndUpdate(
      { organization: orgId },
      {
        $set: {
          defaultPosSourceLocation: String(mainLocation._id),
          orderLocationBehavior: "table_location",
          sessionOpenCloseBehavior: "manual",
          cashierCanViewStockLevels: false,
          cashierCanViewCostData: false,
          requireApprovalsForVendorPosting: false,
          requireApprovalsForExpensePosting: false,
        },
      },
      { upsert: true, new: false }
    );

    return { zoneCount, mainLocation: { _id: String(mainLocation._id), name: mainLocation.name } };
  }

  // ── Step 4: Launch check ──────────────────────────────────────────────────
  if (stepNumber === 4) {
    const checklist = await buildGoLiveChecklist(orgId);
    const failed = checklistFailures(checklist);
    if (failed.length > 0) {
      throw createHttpError(400, `Go-live checklist incomplete: ${failed.join(", ")}`);
    }
    return { checklist };
  }

  throw createHttpError(400, "Invalid setup step number.");
}

async function getSetupStatus(req, res, next) {
  try {
    const orgId = assertTenantOrganization(req);
    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));

    const setupWizard = org.setupWizard || {
      isComplete: false,
      currentStep: 1,
      completedSteps: [],
      completedAt: null,
    };

    const [checklist, locations, zoneCount, mainLocation, branding, cfg, firstZone] = await Promise.all([
      buildGoLiveChecklist(orgId),
      Location.find({ organization: orgId }).select("_id name").sort({ createdAt: 1 }).lean(),
      Zone.countDocuments({ organization: orgId, status: "active" }),
      getMainLocation(orgId),
      PublicMenuBranding.findOne({ organization: orgId, scopeKey: "default" }).lean(),
      AccountingConfig.findOne({ organization: orgId }).lean(),
      Zone.findOne({ organization: orgId, status: "active" }).sort({ createdAt: 1 }).lean(),
    ]);

    const failed = checklistFailures(checklist);

    res.status(200).json({
      success: true,
      data: {
        isBootstrapped: Boolean(org.isBootstrapped),
        setupWizard: {
          isComplete: Boolean(setupWizard.isComplete),
          currentStep: Number(setupWizard.currentStep || 1),
          completedSteps: uniqSortedSteps(setupWizard.completedSteps || []),
          completedAt: setupWizard.completedAt || null,
        },
        checklist,
        failedItems: failed,
        readyToGoLive: failed.length === 0,
        locations: (locations || []).map((l) => ({ _id: String(l._id), name: String(l.name || "") })),
        locationCount: Array.isArray(locations) ? locations.length : 0,
        zoneCount,
        currentData: {
          displayName: String(branding?.displayName || ""),
          tagline: String(branding?.tagline || ""),
          receiptHeaderText: String(branding?.receiptHeaderText || ""),
          receiptFooterText: String(branding?.receiptFooterText || ""),
          logoUrl: String(branding?.logoUrl || ""),
          country: String(mainLocation?.country || ""),
          city: String(mainLocation?.city || ""),
          timezone: String(mainLocation?.timezone || ""),
          phone: String(mainLocation?.phone || ""),
          address: String(mainLocation?.address || ""),
          taxVatNumber: String(mainLocation?.taxVatNumber || ""),
          mainLocationName: String(mainLocation?.name || ""),
          defaultCostMethod: String(cfg?.defaultCostMethod || "fifo"),
          stockDeductTrigger: String(cfg?.stockDeductTrigger || "payment"),
          strictOversellMode: cfg?.strictOversell === false ? "warn" : "block",
          zoneName: String(firstZone?.name || ""),
        },
      },
    });
  } catch (e) {
    next(e);
  }
}

async function patchSetupStep(req, res, next) {
  try {
    const orgId = assertTenantOrganization(req);
    const stepNumber = Number(req.params.stepNumber);
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > MAX_STEP) {
      return next(createHttpError(400, `stepNumber must be between 1 and ${MAX_STEP}.`));
    }

    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));
    if (!org.isBootstrapped) {
      return next(createHttpError(400, "Organization must be bootstrapped before setup wizard."));
    }
    if (org.setupWizard?.isComplete) {
      return next(createHttpError(409, "Setup wizard is already complete."));
    }

    const completed = new Set(uniqSortedSteps(org.setupWizard?.completedSteps || []));
    for (let i = 1; i < stepNumber; i += 1) {
      if (!completed.has(i)) {
        return next(createHttpError(400, `Step ${i} must be completed before step ${stepNumber}.`));
      }
    }

    const data = await validateAndApplyStep(stepNumber, req.body || {}, orgId);
    await markStepComplete(org, stepNumber);

    res.status(200).json({
      success: true,
      data: {
        stepNumber,
        applied: data,
        setupWizard: org.setupWizard,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function completeSetup(req, res, next) {
  try {
    const orgId = assertTenantOrganization(req);
    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));
    if (!org.isBootstrapped) {
      return next(createHttpError(400, "Organization must be bootstrapped before setup wizard."));
    }

    const completed = new Set(uniqSortedSteps(org.setupWizard?.completedSteps || []));
    for (let i = 1; i <= 3; i++) {
      if (!completed.has(i)) {
        return next(createHttpError(400, `Step ${i} must be completed before Go Live.`));
      }
    }

    const checklist = await buildGoLiveChecklist(orgId);
    const failed = checklistFailures(checklist);
    if (failed.length > 0) {
      return next(createHttpError(400, `Go-live checklist incomplete: ${failed.join(", ")}`));
    }

    org.setupWizard = {
      isComplete: true,
      currentStep: MAX_STEP,
      completedSteps: uniqSortedSteps([1, 2, 3, 4]),
      completedAt: new Date(),
    };
    await org.save();

    res.status(200).json({
      success: true,
      data: {
        setupWizard: org.setupWizard,
        checklist,
        readyToGoLive: true,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getSetupStatus,
  patchSetupStep,
  completeSetup,
};
