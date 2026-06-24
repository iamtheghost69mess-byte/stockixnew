const mongoose = require("mongoose");

const LIFECYCLE = [
  "draft",
  "active",
  "suspended",
  "pending_closure",
  "deleted",
];

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    },
    externalRef: { type: String, trim: true, default: "" },
    /** Stockix control-plane tenant UUID (provision worker / TENANT_ID env). */
    stockixTenantId: {
      type: String,
      trim: true,
      default: "",
      index: { sparse: true },
    },
    ownerEmail: { type: String, trim: true, lowercase: true, default: "" },
    ownerName: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    timezone: { type: String, trim: true, default: "Asia/Beirut" },
    /** Last 2 digits masked (e.g. ••••56) after bootstrap or PIN reset—PIN itself is only stored hashed on User. */
    initialAdminPinHint: { type: String, trim: true, default: "" },
    /** Masked bootstrap staff PIN hints (full PINs only returned once via provision flow). */
    defaultCredentials: {
      type: [
        {
          role: { type: String, trim: true },
          name: { type: String, trim: true },
          username: { type: String, trim: true, lowercase: true },
          pinMasked: { type: String, trim: true },
          pinLastTwo: { type: String, trim: true },
        },
      ],
      default: undefined,
    },
    isBootstrapped: { type: Boolean, default: false },
    lifecycle: {
      type: String,
      enum: LIFECYCLE,
      default: "draft",
      index: true,
    },
    lifecycleReasonCode: { type: String, trim: true, default: "" },
    lifecycleNote: { type: String, trim: true, default: "" },
 
    /** Progress tracking for the platform bootstrap orchestrator. */
    provisioningSteps: {
      type: [
        {
          step: { type: String, required: true },
          status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
          error: { type: String, default: "" },
          completedAt: { type: Date },
        }
      ],
      default: [],
    },

    planKey: { type: String, trim: true, default: "standard" },
    entitlementsSchemaVersion: { type: Number, default: 1, min: 1 },
    entitlements: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        maxLocations: 5,
        maxUsers: 25,
        maxOrdersPerMonth: 10000,
        modules: { inventory: true, accounting: true },
      }),
    },

    usageCounters: {
      ordersThisMonth: { type: Number, default: 0, min: 0 },
      apiCallsThisMonth: { type: Number, default: 0, min: 0 },
      usagePeriodYm: { type: String, trim: true, default: "" },
    },

    /** Commercial license window (owner console); optional enforcement elsewhere. */
    licenseStartsAt: { type: Date, default: null },
    licenseEndsAt: { type: Date, default: null },
    /** Stockix control-plane license key (STXI or legacy STKX). */
    licenseKey: { type: String, trim: true, default: null },
    licenseKeyFormat: { type: String, trim: true, default: null },
    /** STXI location scope synced from Stockix license row. */
    scopedLocationId: { type: String, trim: true, default: null },
    acceptStkxUntil: { type: Date, default: null },
    invoiceCurrency: { type: String, trim: true, uppercase: true, default: "USD" },

    dataRegion: { type: String, trim: true, default: "" },
    legalEntityCountry: { type: String, trim: true, default: "" },
    ipAllowlist: { type: [String], default: undefined },
    sessionTtlOverrideSeconds: { type: Number, default: null, min: 60 },

    legalAcceptance: {
      tosVersion: { type: String, trim: true, default: "" },
      tosAcceptedAt: { type: Date, default: null },
      tosAcceptedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      privacyVersion: { type: String, trim: true, default: "" },
      privacyAcceptedAt: { type: Date, default: null },
      privacyAcceptedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },

    exportRequestedAt: { type: Date, default: null },
    deletionRequestedAt: { type: Date, default: null },
    deletionScheduledAt: { type: Date, default: null },

    /**
     * When true, POS GL writes are suppressed and accounting reads are proxied from Finance.
     * Set automatically by the control plane when the accounting (Finance) module is active.
     * Prevents double-posting when both the POS GL engine and Finance are writing the same events.
     */
    accountingRelayMode: { type: Boolean, default: false, index: true },
    /** Finance application URL — set by control plane when accounting module is provisioned. */
    financeUrl: { type: String, trim: true, default: "" },

    /** Optional parent org for consolidated reporting (child tenants). */
    parentOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    /** Tenant first-login operational setup wizard state. */
    setupWizard: {
      isComplete: { type: Boolean, default: false, index: true },
      currentStep: { type: Number, min: 1, max: 8, default: 1 },
      completedSteps: { type: [Number], default: [] },
      completedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ parentOrganization: 1, lifecycle: 1 });
organizationSchema.index({ lifecycle: 1, updatedAt: -1 });
organizationSchema.index({ planKey: 1 });

async function invalidateAccessCacheForDocument(doc) {
  const orgId = doc?._id;
  if (!orgId) return;
  try {
    // eslint-disable-next-line global-require
    const { OrgAccessCache } = require("../services/orgAccessCache");
    await OrgAccessCache.invalidateOrgAccessCache(orgId);
  } catch {
    // ignore cache invalidation failures
  }
}

async function invalidateAccessCacheForQuery(query) {
  const conditions = query?.getQuery?.() || {};
  if (!conditions || Object.keys(conditions).length === 0) return;
  try {
    // eslint-disable-next-line global-require
    const { OrgAccessCache } = require("../services/orgAccessCache");
    const ids = await query.model.find(conditions).distinct("_id");
    await Promise.all(ids.map((orgId) => OrgAccessCache.invalidateOrgAccessCache(orgId)));
  } catch {
    // ignore cache invalidation failures
  }
}

organizationSchema.post("save", invalidateAccessCacheForDocument);
organizationSchema.post("findOneAndUpdate", invalidateAccessCacheForDocument);
organizationSchema.post("updateOne", async function onUpdateOne() {
  await invalidateAccessCacheForQuery(this);
});
organizationSchema.post("updateMany", async function onUpdateMany() {
  await invalidateAccessCacheForQuery(this);
});

const Organization = mongoose.model("Organization", organizationSchema);
Organization.LIFECYCLE = LIFECYCLE;
module.exports = Organization;
