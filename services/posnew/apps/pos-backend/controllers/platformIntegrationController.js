const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Location = require("../models/locationModel");
const IntegrationConfig = require("../models/integrationConfigModel");
const AccountingConfig = require("../models/accountingConfigModel");
const { ensureDefaultAccountsAndConfig } = require("../services/accountingService");

function maskIntegrationConfig(doc) {
  const safe = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  if (safe.bigcapital?.internalSecret) {
    safe.bigcapital.internalSecret = "***";
  }
  return safe;
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

/**
 * Provision-time wiring: enable Bigcapital bridge for a POS organization.
 * Called by Stockix worker with platform API key after accounting+pos provision.
 */
const wireBigcapitalIntegration = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(orgId)) {
      return next(createHttpError(400, "Invalid organization id"));
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return next(createHttpError(404, "Organization not found"));
    }

    const body = req.body || {};
    const existing = await IntegrationConfig.findOne({ organization: orgId });

    const prior = existing?.bigcapital?.toObject?.() || existing?.bigcapital || {};
    const merged = {
      ...prior,
      enabled: body.enabled !== false,
      internalBaseUrl:
        typeof body.internalBaseUrl === "string" && body.internalBaseUrl.trim()
          ? body.internalBaseUrl.trim()
          : prior.internalBaseUrl || "",
      internalSecret:
        typeof body.internalSecret === "string" && body.internalSecret.length > 0
          ? body.internalSecret
          : prior.internalSecret || "",
      financeTenantId:
        parsePositiveInt(body.financeTenantId) ?? prior.financeTenantId,
      defaultWalkInCustomerId:
        parsePositiveInt(body.defaultWalkInCustomerId) ?? prior.defaultWalkInCustomerId,
      defaultCashDepositAccountId:
        parsePositiveInt(body.defaultCashDepositAccountId) ??
        prior.defaultCashDepositAccountId,
      defaultCardDepositAccountId:
        parsePositiveInt(body.defaultCardDepositAccountId) ??
        prior.defaultCardDepositAccountId,
      defaultWarehouseId:
        parsePositiveInt(body.defaultWarehouseId) ?? prior.defaultWarehouseId,
      serviceChargeItemId:
        parsePositiveInt(body.serviceChargeItemId) ?? prior.serviceChargeItemId,
      discountItemId:
        parsePositiveInt(body.discountItemId) ?? prior.discountItemId,
      syncStatus: "idle",
      lastSyncError: null,
    };

    if (!merged.internalBaseUrl) {
      return next(
        createHttpError(400, "internalBaseUrl is required for Bigcapital integration")
      );
    }
    if (!merged.financeTenantId) {
      return next(createHttpError(400, "financeTenantId is required"));
    }
    if (
      !merged.defaultWalkInCustomerId
      || !merged.defaultCashDepositAccountId
      || !merged.defaultCardDepositAccountId
    ) {
      return next(
        createHttpError(
          400,
          "defaultWalkInCustomerId, defaultCashDepositAccountId, and defaultCardDepositAccountId are required"
        )
      );
    }

    let locationMapping = Array.isArray(body.locationMapping)
      ? body.locationMapping
      : existing?.bigcapital?.locationMapping || [];

    if (
      (!locationMapping || locationMapping.length === 0)
      && merged.defaultWarehouseId
    ) {
      const mainLoc = await Location.findOne({
        organization: orgId,
        code: { $in: ["MAIN", "main"] },
      }).select("_id");
      if (mainLoc?._id) {
        locationMapping = [
          {
            posLocationId: mainLoc._id,
            bigcapitalWarehouseId: merged.defaultWarehouseId,
          },
        ];
      }
    }

    if (locationMapping.length > 0) {
      merged.locationMapping = locationMapping.map((row) => ({
        posLocationId: row.posLocationId,
        bigcapitalBranchId: row.bigcapitalBranchId,
        bigcapitalWarehouseId: row.bigcapitalWarehouseId,
      }));
    }

    const config = await IntegrationConfig.findOneAndUpdate(
      { organization: orgId },
      { $set: { bigcapital: merged } },
      { new: true, upsert: true }
    );

    if (merged.enabled) {
      await ensureDefaultAccountsAndConfig(orgId);
      await AccountingConfig.findOneAndUpdate(
        { organization: orgId },
        { $set: { bigcapitalIntegrationEnabled: true } },
        { upsert: true }
      );
    }

    res.status(200).json({
      success: true,
      data: {
        organizationId: orgId,
        integration: maskIntegrationConfig(config),
        bigcapitalIntegrationEnabled: Boolean(merged.enabled),
      },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  wireBigcapitalIntegration,
};
