const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const User = require("../models/userModel");
const Location = require("../models/locationModel");
const PublicMenuBranding = require("../models/publicMenuBrandingModel");
const IdempotencyRecord = require("../models/idempotencyRecordModel");
const { writeAudit, auditFromRequest } = require("../services/platformAuditService");
const { addJob } = require("../services/jobQueue");
const { recordEvent } = require("../services/productEventService");
const { bootstrapOrganization } = require("../services/orgBootstrapService");
const {
  storeFullCredentials,
  peekFullCredentials,
  consumeFullCredentials,
} = require("../services/bootstrapCredentialReveal");
const { syncDefaultCredentialsFromUsers } = require("../services/defaultCredentialsSync");
const { isDisposableEmail, trackSignupIp, maybeOpenFraudCase } = require(
  "../services/abuseSignals"
);
const { computePinLookup } = require("../utils/pinLookup");
const TenantApiRequestMetric = require("../models/tenantApiRequestMetricModel");
const { validateLifecycleTransition } = require("../utils/orgLifecycleTransitions");
const Payment = require("../models/paymentModel");
const MenuItem = require("../models/menuItemModel");
const { getOrganizationAccessState } = require("../services/licenseWindowService");
const { OrgAccessCache } = require("../services/orgAccessCache");
const {
  logLicenseWindowUpdated,
  logAccessStateTransitionIfChanged,
} = require("../services/accessStateAuditService");
const config = require("../config/config");

const DEFAULT_ORG_ENTITLEMENTS = {
  maxLocations: 5,
  maxUsers: 25,
  maxOrdersPerMonth: 10000,
  modules: { inventory: true, accounting: true },
};

const RESERVED_SUBDOMAIN_NAMES = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cdn",
  "dashboard",
  "dev",
  "docs",
  "files",
  "ftp",
  "help",
  "imap",
  "internal",
  "localhost",
  "login",
  "logout",
  "mail",
  "platform",
  "pop",
  "prod",
  "root",
  "signin",
  "signup",
  "smtp",
  "staging",
  "static",
  "status",
  "support",
  "system",
  "test",
  "uploads",
  "www",
]);

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ date?: Date | null, error?: string }}
 */
function parseLicenseDateValue(value, fieldName) {
  if (value === null || value === "") return { date: null };
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    return { error: `${fieldName} must be a valid ISO date-time.` };
  }
  return { date: d };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeStringField(value) {
  return value == null ? "" : String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasValue(value) {
  return value !== undefined;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} primary
 * @param {string} alias
 * @returns {unknown}
 */
function readAliasedField(body, primary, alias) {
  if (Object.prototype.hasOwnProperty.call(body, primary)) return body[primary];
  if (Object.prototype.hasOwnProperty.call(body, alias)) return body[alias];
  return undefined;
}

/**
 * @param {string} timezone
 * @returns {boolean}
 */
function isValidIanaTimezone(timezone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {{ required?: boolean }} [options]
 * @returns {{ value?: string, error?: string }}
 */
function parseTimezoneField(value, fieldName, options = {}) {
  const required = options.required === true;
  if (value === undefined) {
    if (required) return { error: `${fieldName} is required.` };
    return {};
  }
  const tz = normalizeStringField(value);
  if (!tz) {
    if (required) return { error: `${fieldName} is required.` };
    return { value: "" };
  }
  if (!isValidIanaTimezone(tz)) {
    return { error: `${fieldName} must be a valid IANA timezone (e.g. Asia/Beirut).` };
  }
  return { value: tz };
}

/**
 * @param {string[] | undefined} roles
 * @returns {boolean}
 */
function canCorrectOrgLocation(roles) {
  const effectiveRoles = Array.isArray(roles) ? roles : [];
  return effectiveRoles.includes("platform_owner") || effectiveRoles.includes("platform_support_write");
}

/**
 * @param {Record<string, any>} organization
 * @returns {Record<string, any>}
 */
function withOrganizationAccessState(organization) {
  const source =
    organization && typeof organization.toObject === "function"
      ? organization.toObject()
      : { ...(organization || {}) };
  return {
    ...source,
    accessState: getOrganizationAccessState(source),
  };
}

const listOrgs = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { slug: q.toLowerCase() },
      ];
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const cursor = String(req.query.cursor || "").trim();
    if (cursor) {
      try {
        const idPart = Buffer.from(cursor, "base64url").toString("utf8");
        if (mongoose.Types.ObjectId.isValid(idPart)) {
          filter._id = { $lt: new mongoose.Types.ObjectId(idPart) };
        }
      } catch {
        /* ignore invalid cursor */
      }
    }
    const rows = await Organization.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map(withOrganizationAccessState);
    const nextCursor =
      hasMore && data.length
        ? Buffer.from(String(data[data.length - 1]._id), "utf8").toString(
            "base64url"
          )
        : null;
    res.json({ success: true, data, nextCursor });
  } catch (e) {
    next(e);
  }
};

const createOrg = async (req, res, next) => {
  try {
    const idemKey = req.headers["idempotency-key"];
    if (idemKey) {
      const existing = await IdempotencyRecord.findOne({ key: idemKey });
      if (existing) {
        return res.status(existing.statusCode).json(existing.body);
      }
    }

    const requestBody = req.body || {};
    const {
      name,
      slug,
      planKey,
      ownerEmail,
      ownerName,
      country,
      city,
      entitlements: entInput,
      stockixTenantId: stockixTenantIdInput,
      adminEmail: adminEmailInput,
    } = requestBody;
    const ownerEmailResolved =
      ownerEmail != null && String(ownerEmail).trim() !== ""
        ? ownerEmail
        : adminEmailInput;
    const licenseStartInput = readAliasedField(
      requestBody,
      "licenseStartDate",
      "licenseStartsAt",
    );
    const licenseEndInput = readAliasedField(
      requestBody,
      "licenseEndDate",
      "licenseEndsAt",
    );
    const timezoneInput = hasValue(requestBody.timezone)
      ? requestBody.timezone
      : "Asia/Beirut";
    if (!name || !slug) {
      return next(createHttpError(400, "name and slug are required."));
    }
    const slugNorm = String(slug).trim().toLowerCase();
    if (RESERVED_SUBDOMAIN_NAMES.has(slugNorm)) {
      const err = createHttpError(409, "This tenant subdomain is reserved.");
      err.code = "SLUG_RESERVED";
      return next(err);
    }
    const timezoneParsed = parseTimezoneField(timezoneInput, "timezone", {
      required: true,
    });
    if (timezoneParsed.error) {
      return next(createHttpError(400, timezoneParsed.error));
    }
    if (ownerEmailResolved && isDisposableEmail(ownerEmailResolved)) {
      await maybeOpenFraudCase("disposable_email_signup", {
        metadata: { ownerEmail: ownerEmailResolved },
      });
      return next(createHttpError(400, "Email domain is not allowed."));
    }
    const ipCount = await trackSignupIp(req.ip);
    if (ipCount > 25) {
      await maybeOpenFraudCase("signup_velocity_ip", {
        metadata: { ip: req.ip, count: ipCount },
      });
    }

    const stockixTenantIdResolved =
      stockixTenantIdInput != null && String(stockixTenantIdInput).trim() !== ""
        ? String(stockixTenantIdInput).trim()
        : config.stockixTenantId
          ? String(config.stockixTenantId).trim()
          : "";

    const createPayload = {
      name: String(name).trim(),
      slug: slugNorm,
      planKey: planKey ? String(planKey) : "standard",
      ownerEmail: ownerEmailResolved
        ? String(ownerEmailResolved).trim().toLowerCase()
        : "",
      ownerName: ownerName ? String(ownerName).trim() : "",
      stockixTenantId: stockixTenantIdResolved,
      country: normalizeStringField(country),
      city: normalizeStringField(city),
      timezone: timezoneParsed.value || "Asia/Beirut",
      lifecycle: "active",
    };

    const licenseStartProvided = licenseStartInput !== undefined;
    const licenseEndProvided = licenseEndInput !== undefined;
    if (licenseStartProvided) {
      const r = parseLicenseDateValue(licenseStartInput, "licenseStartDate");
      if (r.error) return next(createHttpError(400, r.error));
      createPayload.licenseStartsAt = r.date;
    }
    if (licenseEndProvided) {
      const r = parseLicenseDateValue(licenseEndInput, "licenseEndDate");
      if (r.error) return next(createHttpError(400, r.error));
      createPayload.licenseEndsAt = r.date;
    }
    if (!licenseStartProvided) {
      createPayload.licenseStartsAt = new Date();
    }
    if (!licenseEndProvided) {
      const anchor =
        createPayload.licenseStartsAt instanceof Date &&
        createPayload.licenseStartsAt != null
          ? createPayload.licenseStartsAt
          : new Date();
      const end = new Date(anchor.getTime());
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      createPayload.licenseEndsAt = end;
    }
    if (entInput && typeof entInput === "object" && !Array.isArray(entInput)) {
      const merged = {
        ...DEFAULT_ORG_ENTITLEMENTS,
        ...entInput,
        modules: {
          ...DEFAULT_ORG_ENTITLEMENTS.modules,
          ...(entInput.modules && typeof entInput.modules === "object" && !Array.isArray(entInput.modules)
            ? entInput.modules
            : {}),
        },
      };
      createPayload.entitlements = merged;
    }

    const org = await Organization.create(createPayload);
    // Ensure each tenant starts with a default branch immediately.
    await Location.findOneAndUpdate(
      { organization: org._id, code: "MAIN" },
      {
        $setOnInsert: {
          organization: org._id,
          name: "Main",
          code: "MAIN",
          address: "",
        },
      },
      { upsert: true, new: false }
    );
    await PublicMenuBranding.findOneAndUpdate(
      { organization: org._id, scopeKey: "default" },
      {
        $setOnInsert: {
          organization: org._id,
          scopeKey: "default",
          location: null,
          displayName: String(org.name || "Menu").trim(),
          tagline: "",
          logoUrl: "",
          accentColor: "#ca8a04",
          showPrices: true,
        },
      },
      { upsert: true, new: false }
    );

    const queueResult = await addJob("provisioning", "org_bootstrap", {
      organizationId: String(org._id),
    });
    let bootstrapMode = "queue";
    let fullCredentials = null;
    if (!queueResult?.queued) {
      const bootstrapResult = await bootstrapOrganization({
        organizationId: String(org._id),
      });
      bootstrapMode = "sync_fallback";
      fullCredentials = bootstrapResult?.fullCredentials ?? null;
    }
    if (fullCredentials?.length) {
      await storeFullCredentials(String(org._id), fullCredentials);
    }
    await recordEvent({
      eventType: "organization.created",
      organizationId: org._id,
      actor: {
        kind: "platform_user",
        id: String(req.platformUser?._id || ""),
      },
      correlationId: res.locals.requestId,
    });
    await recordEvent({
      eventType: "tenant.admin_provisioned",
      organizationId: org._id,
      actor: {
        kind: "platform_user",
        id: String(req.platformUser?._id || ""),
      },
      metadata: { hasAdmin: true }
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.create",
      actorPlatformUser: req.platformUser?._id,
      actorApiKeyPrefix: req.platformAuth?.keyPrefix || "",
      organization: org._id,
      metadata: {
        ownerEmail: ownerEmailResolved || null,
        ownerName: ownerName || null,
        planKey: org.planKey,
        bootstrapQueued: bootstrapMode === "queue",
        bootstrapMode,
      }
    });

    const latestOrg = await Organization.findById(org._id).lean();
    let orgPayload = latestOrg ? { ...latestOrg } : org.toObject();
    if (bootstrapMode === "queue") {
      const { defaultCredentials: _dc, ...rest } = orgPayload;
      orgPayload = rest;
    }
    orgPayload = withOrganizationAccessState(orgPayload);
    const responseBody = {
      success: true,
      data: orgPayload,
      bootstrapMode,
    };
    if (bootstrapMode === "sync_fallback" && fullCredentials?.length) {
      responseBody.fullCredentials = fullCredentials;
    }
    if (idemKey) {
      await IdempotencyRecord.create({
        key: idemKey,
        route: "POST /organizations",
        statusCode: 201,
        body: responseBody,
      });
    }
    res.status(201).json(responseBody);
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(409, "Slug already exists."));
    }
    next(e);
  }
};

const getOrg = async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return next(createHttpError(404, "Organization not found."));
    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

/** Resolve POS organization by Stockix control-plane tenant UUID. */
const getOrgByStockixTenant = async (req, res, next) => {
  try {
    const tenantId = String(req.params.tenantId || "").trim();
    if (!tenantId) {
      return next(createHttpError(400, "tenantId is required."));
    }
    const org = await Organization.findOne({ stockixTenantId: tenantId });
    if (!org) {
      return next(
        createHttpError(404, "Organization not found for Stockix tenant."),
      );
    }
    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

/**
 * After POST /organizations returns 201, async `org_bootstrap` may still be running.
 * Poll this until `readyForPinLogin` is true before expecting PIN login to succeed.
 */
const getOrgProvisioningStatus = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const org = await Organization.findById(orgId)
      .select("isBootstrapped lifecycle slug name provisioningSteps timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt")
      .lean();
    if (!org) return next(createHttpError(404, "Organization not found."));
    const adminCount = await User.countDocuments({
      organization: orgId,
      role: "admin",
    });
    const accessState = getOrganizationAccessState(org);
    const lifecycleActive = String(org.lifecycle || "active").toLowerCase() === "active";
    const readyForPinLogin =
      lifecycleActive &&
      accessState.status === "active" &&
      !accessState.blocked &&
      org.isBootstrapped === true &&
      adminCount > 0;
    const payload = {
      organizationId: String(orgId),
      slug: org.slug,
      name: org.name,
      lifecycle: org.lifecycle,
      isBootstrapped: !!org.isBootstrapped,
      adminUserCount: adminCount,
      hasAdminUser: adminCount > 0,
      readyForPinLogin,
      provisioningSteps: org.provisioningSteps || [],
    };
    if (readyForPinLogin) {
      const fullCredentials = await peekFullCredentials(orgId);
      if (fullCredentials?.length) {
        payload.fullCredentials = fullCredentials;
      }
    }
    res.json({
      success: true,
      data: payload,
    });
  } catch (e) {
    next(e);
  }
};

/** Rebuild masked defaultCredentials from bootstrap users (no plaintext PIN recovery). */
const repairOrgCredentials = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const result = await syncDefaultCredentialsFromUsers(orgId);
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.credentials_repaired",
      organization: orgId,
      actorPlatformUser: req.platformUser?._id,
      metadata: { syncedCount: result.syncedCount },
    });
    res.json({ success: true, data: result });
  } catch (e) {
    if (e?.status === 404) return next(createHttpError(404, e.message));
    next(e);
  }
};

/** Delete one-time bootstrap PINs from the reveal store after Stockix persisted them. */
const consumeProvisioningCredentials = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const org = await Organization.findById(orgId).select("_id slug").lean();
    if (!org) return next(createHttpError(404, "Organization not found."));
    const consumed = await consumeFullCredentials(orgId);
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.provisioning_credentials_consumed",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: { hadCredentials: Array.isArray(consumed) && consumed.length > 0 },
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/** Manually trigger or resume a failed provisioning orchestrator for an organization. */
const retryProvisioning = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    
    // Add job to Bull queue or run sync if needed
    const queueResult = await addJob("provisioning", "org_bootstrap", {
      organizationId: String(orgId),
    });
    
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.provisioning_retry",
      organization: orgId,
      actorPlatformUser: req.platformUser?._id,
      metadata: { queued: !!queueResult?.queued }
    });
    
    res.json({ success: true, message: "Provisioning restart triggered.", queued: !!queueResult?.queued });
  } catch (e) {
    next(e);
  }
};

const patchOrgLifecycle = async (req, res, next) => {
  try {
    const { lifecycle, lifecycleReasonCode, lifecycleNote, supportTicketId } =
      req.body || {};
    const org = await Organization.findById(req.params.id);
    if (!org) return next(createHttpError(404, "Organization not found."));
    if (lifecycle) {
      const check = validateLifecycleTransition(org.lifecycle, lifecycle);
      if (!check.ok) {
        return next(createHttpError(400, check.message));
      }
      org.lifecycle = lifecycle;
    }
    if (lifecycleReasonCode !== undefined) {
      org.lifecycleReasonCode = String(lifecycleReasonCode);
    }
    if (lifecycleNote !== undefined) org.lifecycleNote = String(lifecycleNote);
    await org.save();
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.lifecycle",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: {
        lifecycle: org.lifecycle,
        lifecycleReasonCode,
        supportTicketId: supportTicketId || undefined,
      },
    });
    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

function utcDayStringsInclusive(daysBack) {
  const out = [];
  const n = Math.max(1, Math.min(31, Number(daysBack) || 1));
  for (let i = 0; i < n; i += 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function sumBsonBytesForOrg(collectionName, orgObjectId) {
  const coll = mongoose.connection.collection(collectionName);
  const rows = await coll
    .aggregate([
      { $match: { organization: orgObjectId } },
      {
        $group: {
          _id: null,
          approximateBytes: { $sum: { $bsonSize: "$$ROOT" } },
          documents: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const row = rows[0];
  return {
    approximateBytes: Number(row?.approximateBytes) || 0,
    documents: Number(row?.documents) || 0,
  };
}

async function aggregateTenantApiUsage(orgObjectId, dayUtcList) {
  const match = { organization: orgObjectId, dayUtc: { $in: dayUtcList } };
  const [totalRows, byStatus, topEndpoints] = await Promise.all([
    TenantApiRequestMetric.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]),
    TenantApiRequestMetric.aggregate([
      { $match: match },
      { $group: { _id: "$statusFamily", count: { $sum: "$count" } } },
    ]),
    TenantApiRequestMetric.aggregate([
      { $match: match },
      {
        $group: {
          _id: { method: "$method", endpointKey: "$endpointKey" },
          count: { $sum: "$count" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);
  const total = Number(totalRows[0]?.total) || 0;
  const byStatusFamily = {};
  for (const r of byStatus) {
    if (r._id) byStatusFamily[r._id] = Number(r.count) || 0;
  }
  const top = topEndpoints.map((r) => ({
    method: r._id?.method || "",
    endpointKey: r._id?.endpointKey || "",
    count: Number(r.count) || 0,
  }));
  return { total, byStatusFamily, topEndpoints: top };
}

/** Batch rollup for org list: users count + last-24h API traffic by status family (UTC day bucket). */
const listOrgsHealthSummary = async (req, res, next) => {
  try {
    const raw = String(req.query.ids || "").trim();
    if (!raw) {
      return res.json({ success: true, data: [] });
    }
    const idStrings = raw
      .split(",")
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 100);
    const orgObjectIds = [];
    for (const s of idStrings) {
      if (mongoose.Types.ObjectId.isValid(s)) {
        orgObjectIds.push(new mongoose.Types.ObjectId(s));
      }
    }
    if (orgObjectIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const days1 = utcDayStringsInclusive(1);

    const [apiRollups, userCounts] = await Promise.all([
      TenantApiRequestMetric.aggregate([
        {
          $match: {
            organization: { $in: orgObjectIds },
            dayUtc: { $in: days1 },
          },
        },
        {
          $group: {
            _id: { org: "$organization", sf: "$statusFamily" },
            count: { $sum: "$count" },
          },
        },
      ]),
      User.aggregate([
        { $match: { organization: { $in: orgObjectIds } } },
        { $group: { _id: "$organization", usersCount: { $sum: 1 } } },
      ]),
    ]);

    const byOrg = new Map();
    for (const oid of orgObjectIds) {
      const idStr = String(oid);
      byOrg.set(idStr, {
        organizationId: idStr,
        usersCount: 0,
        totalRequests24h: 0,
        byStatusFamily: {},
      });
    }

    for (const row of userCounts) {
      const key = String(row._id);
      const slot = byOrg.get(key);
      if (slot) slot.usersCount = Number(row.usersCount) || 0;
    }

    for (const row of apiRollups) {
      const orgId = String(row._id.org);
      const sf = row._id.sf;
      const slot = byOrg.get(orgId);
      if (!slot) continue;
      const c = Number(row.count) || 0;
      slot.byStatusFamily[sf] = (slot.byStatusFamily[sf] || 0) + c;
      slot.totalRequests24h += c;
    }

    const data = [];
    for (const slot of byOrg.values()) {
      const total = slot.totalRequests24h;
      const s5 = slot.byStatusFamily["5xx"] || 0;
      const s4 = slot.byStatusFamily["4xx"] || 0;
      const rate5 = total > 0 ? s5 / total : 0;
      const rate4 = total > 0 ? s4 / total : 0;
      let healthLevel = "ok";
      if (total > 0) {
        if (rate5 >= 0.1 || rate4 >= 0.4) {
          healthLevel = "down";
        } else if (rate5 >= 0.02 || rate4 >= 0.2) {
          healthLevel = "degraded";
        }
      }
      data.push({
        organizationId: slot.organizationId,
        usersCount: slot.usersCount,
        totalRequests24h: total,
        failedRequests24h: s5 + s4,
        byStatusFamily: slot.byStatusFamily,
        healthLevel,
      });
    }

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

const getOrgObservability = async (req, res, next) => {
  try {
    const orgId = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(orgId)) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    const org = await Organization.findById(orgId).select("usageCounters name slug").lean();
    if (!org) return next(createHttpError(404, "Organization not found."));

    const days1 = utcDayStringsInclusive(1);
    const days7 = utcDayStringsInclusive(7);
    const days30 = utcDayStringsInclusive(30);

    const [
      api1,
      api7,
      api30,
      usersCount,
      locationsCount,
      menuItemsCount,
      ordersCount,
      paymentsCount,
      ordersStorage,
      usersStorage,
      menuItemsStorage,
      ingredientsStorage,
    ] = await Promise.all([
      aggregateTenantApiUsage(orgObjectId, days1),
      aggregateTenantApiUsage(orgObjectId, days7),
      aggregateTenantApiUsage(orgObjectId, days30),
      User.countDocuments({ organization: orgId }),
      Location.countDocuments({ organization: orgId }),
      MenuItem.countDocuments({ organization: orgId }),
      mongoose.connection.collection("orders").countDocuments({ organization: orgObjectId }),
      Payment.countDocuments({ organization: orgId }),
      sumBsonBytesForOrg("orders", orgObjectId),
      sumBsonBytesForOrg("users", orgObjectId),
      sumBsonBytesForOrg("menuitems", orgObjectId),
      sumBsonBytesForOrg("ingredients", orgObjectId),
    ]);

    const storageByCollection = {
      orders: ordersStorage,
      users: usersStorage,
      menuitems: menuItemsStorage,
      ingredients: ingredientsStorage,
    };
    const approximateTotalBytes =
      ordersStorage.approximateBytes +
      usersStorage.approximateBytes +
      menuItemsStorage.approximateBytes +
      ingredientsStorage.approximateBytes;

    const generatedAt = new Date().toISOString();

    res.json({
      success: true,
      data: {
        organizationId: orgId,
        generatedAt,
        apiUsage: {
          windows: {
            last24hUtcDays: days1,
            last7dUtcDays: days7,
            last30dUtcDays: days30,
            requests: {
              last24h: api1.total,
              last7d: api7.total,
              last30d: api30.total,
            },
            byStatusFamily: {
              last24h: api1.byStatusFamily,
              last7d: api7.byStatusFamily,
              last30d: api30.byStatusFamily,
            },
            topEndpoints: {
              last24h: api1.topEndpoints,
              last7d: api7.topEndpoints,
              last30d: api30.topEndpoints,
            },
          },
          note:
            "Request counts are aggregated from tenant HTTP traffic (UTC calendar-day buckets). Intra-day 'last24h' uses today's UTC bucket only.",
        },
        usageCountersSnapshot: org.usageCounters || null,
        storage: {
          approximateTotalBytes,
          note:
            "Byte totals sum BSON sizes for a subset of collections (orders, users, menu items, ingredients) — an approximation, not MongoDB storageEngine allocation.",
          byCollection: storageByCollection,
        },
        entityCounts: {
          users: usersCount,
          locations: locationsCount,
          menuItems: menuItemsCount,
          orders: ordersCount,
          payments: paymentsCount,
        },
      },
    });
  } catch (e) {
    next(e);
  }
};

const patchOrgLicense = async (req, res, next) => {
  try {
    const body = req.body || {};
    const org = await Organization.findById(req.params.id);
    if (!org) return next(createHttpError(404, "Organization not found."));
    const previousState = getOrganizationAccessState(org).status;

    const licenseStartInput = readAliasedField(
      body,
      "licenseStartDate",
      "licenseStartsAt",
    );
    const licenseEndInput = readAliasedField(
      body,
      "licenseEndDate",
      "licenseEndsAt",
    );

    if (licenseStartInput !== undefined) {
      const r = parseLicenseDateValue(licenseStartInput, "licenseStartDate");
      if (r.error) return next(createHttpError(400, r.error));
      org.licenseStartsAt = r.date;
    }
    if (licenseEndInput !== undefined) {
      const r = parseLicenseDateValue(licenseEndInput, "licenseEndDate");
      if (r.error) return next(createHttpError(400, r.error));
      org.licenseEndsAt = r.date;
    }

    await org.save();
    await OrgAccessCache.invalidateOrgAccessCache(org._id);
    const nextAccessState = getOrganizationAccessState(org);
    await logLicenseWindowUpdated({
      orgId: org._id,
      previousState,
      newState: nextAccessState.status,
      reason: nextAccessState.reason,
      actorPlatformUser: req.platformUser?._id,
      actorApiKeyPrefix: req.platformAuth?.keyPrefix || "",
      requestId: res.locals?.requestId,
      traceparent: res.locals?.traceparent,
    });
    await logAccessStateTransitionIfChanged(org._id, nextAccessState, {
      actorType: req.platformAuth?.keyPrefix ? "api_key" : "platform_user",
      actorPlatformUser: req.platformUser?._id,
      actorApiKeyPrefix: req.platformAuth?.keyPrefix || "",
      requestId: res.locals?.requestId,
      traceparent: res.locals?.traceparent,
    });
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.license",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: {
        licenseStartsAt: org.licenseStartsAt,
        licenseEndsAt: org.licenseEndsAt,
      },
    });
    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

/** Support-only correction for organization location data. */
const patchOrgLocationSupport = async (req, res, next) => {
  try {
    if (!canCorrectOrgLocation(req.platformUser?.roles)) {
      return next(createHttpError(403, "Only support can correct organization location."));
    }
    const body = req.body || {};
    const org = await Organization.findById(req.params.id);
    if (!org) return next(createHttpError(404, "Organization not found."));

    const hasCountry = Object.prototype.hasOwnProperty.call(body, "country");
    const hasCity = Object.prototype.hasOwnProperty.call(body, "city");
    const hasTimezone = Object.prototype.hasOwnProperty.call(body, "timezone");
    if (!hasCountry && !hasCity && !hasTimezone) {
      return next(createHttpError(400, "No location fields provided."));
    }

    if (hasCountry) org.country = normalizeStringField(body.country);
    if (hasCity) org.city = normalizeStringField(body.city);
    if (hasTimezone) {
      const tz = parseTimezoneField(body.timezone, "timezone", { required: true });
      if (tz.error) return next(createHttpError(400, tz.error));
      org.timezone = tz.value;
    }

    await org.save();
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.location_support_correction",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: {
        country: org.country,
        city: org.city,
        timezone: org.timezone,
      },
    });
    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

const patchEntitlements = async (req, res, next) => {
  try {
    const { entitlements, entitlementsSchemaVersion } = req.body || {};
    const orgId = req.params.id;
    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));
    if (entitlements && typeof entitlements === "object" && !Array.isArray(entitlements)) {
      if (Object.prototype.hasOwnProperty.call(entitlements, "maxUsers")) {
        const desiredMaxUsers = Number(entitlements.maxUsers);
        if (Number.isFinite(desiredMaxUsers)) {
          const userCount = await User.countDocuments({ organization: orgId });
          if (desiredMaxUsers < userCount) {
            return next(
              createHttpError(
                400,
                `maxUsers (${desiredMaxUsers}) cannot be below current staff count (${userCount}). Remove users or raise the cap.`
              )
            );
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(entitlements, "maxLocations")) {
        const desiredMaxLocs = Number(entitlements.maxLocations);
        if (Number.isFinite(desiredMaxLocs)) {
          const locCount = await Location.countDocuments({ organization: orgId });
          if (desiredMaxLocs < locCount) {
            return next(
              createHttpError(
                400,
                `maxLocations (${desiredMaxLocs}) cannot be below current branch count (${locCount}). Remove branches or raise the cap.`
              )
            );
          }
        }
      }
      org.entitlements = entitlements;
    }
    if (entitlementsSchemaVersion != null) {
      org.entitlementsSchemaVersion = entitlementsSchemaVersion;
    }
    await org.save();
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.entitlements",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
    });
    res.json({ success: true, data: org });
  } catch (e) {
    next(e);
  }
};

const deleteOrg = async (req, res, next) => {
  try {
    const org = await Organization.findByIdAndDelete(req.params.id);
    if (!org) return next(createHttpError(404, "Organization not found."));
    
    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.delete",
      actorPlatformUser: req.platformUser?._id,
      metadata: { deletedOrganizationId: String(org._id) },
    });
    
    res.json({ success: true, data: org });
  } catch (e) {
    next(e);
  }
};

/** Return bootstrap staff PINs for platform operators (API key / platform JWT). */
const getOrgCredentials = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const org = await Organization.findById(orgId).select("defaultCredentials slug").lean();
    if (!org) return next(createHttpError(404, "Organization not found."));

    const creds = Array.isArray(org.defaultCredentials) ? org.defaultCredentials : [];
    const roles = creds
      .filter((c) => c && c.role)
      .map((c) => ({
        role: String(c.role).toLowerCase().trim(),
        username:
          c.username != null && String(c.username).trim() !== ""
            ? String(c.username).toLowerCase().trim()
            : c.name != null && String(c.name).trim() !== ""
              ? String(c.name).toLowerCase().trim()
              : String(c.role).toLowerCase().trim(),
        pinMasked: c.pinMasked != null ? String(c.pinMasked) : "",
        pinLastTwo: c.pinLastTwo != null ? String(c.pinLastTwo) : "",
      }));

    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.credentials_viewed",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: { roleCount: roles.length },
    });

    res.json({ success: true, data: { roles } });
  } catch (e) {
    next(e);
  }
};

/** Body: { role: "cashier" } — same behavior as PATCH .../credentials/:role/reset-pin */
const resetOrgPin = async (req, res, next) => {
  const role = String(req.body?.role || "").toLowerCase().trim();
  if (!role) {
    return next(createHttpError(400, "role is required."));
  }
  req.params.role = role;
  return resetCredentialRolePin(req, res, next);
};

/** Reset PIN for the default bootstrap user where `username` or `name` and `role` match (e.g. `waiter`). Updates `defaultCredentials`. */
const resetCredentialRolePin = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const roleNorm = String(req.params.role || "").toLowerCase().trim();
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    if (!User.ROLES.includes(roleNorm)) {
      return next(createHttpError(400, "Invalid role."));
    }

    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));

    const user = await User.findOne({
      organization: orgId,
      role: roleNorm,
      $or: [{ username: roleNorm }, { name: roleNorm }],
    }).select("+pin");
    if (!user) {
      return next(
        createHttpError(
          404,
          `No default staff user found for role "${roleNorm}" (expected username/name and role to match).`
        )
      );
    }

    let newPin = null;
    for (let i = 0; i < 100; i++) {
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      const lookup = computePinLookup(candidate);
      const taken = await User.exists({
        organization: orgId,
        pinLookup: lookup,
        _id: { $ne: user._id },
      });
      if (!taken) {
        newPin = candidate;
        break;
      }
    }
    if (!newPin) {
      return next(createHttpError(503, "Could not allocate a unique PIN—retry."));
    }

    const creds = Array.isArray(org.defaultCredentials)
      ? org.defaultCredentials.map((c) =>
          c && String(c.role).toLowerCase() === roleNorm
            ? {
                role: roleNorm,
                username: roleNorm,
                pinMasked: newPin.replace(/./g, "•"),
                pinLastTwo: newPin.slice(-2),
              }
            : {
                role: c.role,
                username:
                  c.username != null && String(c.username).trim() !== ""
                    ? String(c.username).toLowerCase().trim()
                    : c.name,
                pinMasked: c.pinMasked,
                pinLastTwo: c.pinLastTwo,
              }
        )
      : [];
    const hasRow = creds.some((c) => c && String(c.role).toLowerCase() === roleNorm);
    if (!hasRow) {
      creds.push({
        role: roleNorm,
        username: roleNorm,
        pinMasked: newPin.replace(/./g, "•"),
        pinLastTwo: newPin.slice(-2),
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        user.pin = newPin;
        await user.save({ session });
        org.defaultCredentials = creds;
        await org.save({ session });
      });
    } finally {
      await session.endSession();
    }

    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.credential_role_pin_reset",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: { role: roleNorm, userId: String(user._id) },
    });

    res.json({
      success: true,
      data: {
        role: roleNorm,
        pin: newPin,
        defaultCredentials: creds.map((c) => ({
          role: c.role,
          username: c.username,
          pinMasked: c.pinMasked,
          pinLastTwo: c.pinLastTwo,
        })),
      },
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("already assigned")) {
      return next(createHttpError(409, "PIN collision—retry the request."));
    }
    next(e);
  }
};

const suspendOrg = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(orgId))) {
      return next(createHttpError(400, "Invalid organization id."));
    }
    const org = await Organization.findById(orgId);
    if (!org) return next(createHttpError(404, "Organization not found."));

    const reason = String(req.body?.reason || "license_revoked").trim();
    if (org.lifecycle !== "suspended") {
      const check = validateLifecycleTransition(org.lifecycle, "suspended");
      if (!check.ok) {
        return next(createHttpError(400, check.message));
      }
      org.lifecycle = "suspended";
      org.lifecycleReasonCode = reason.slice(0, 64);
      org.lifecycleNote = reason;
      await org.save();
      await OrgAccessCache.invalidateOrgAccessCache(org._id);
    }

    await writeAudit({
      ...auditFromRequest(req, res),
      action: "platform.org.suspend",
      organization: org._id,
      actorPlatformUser: req.platformUser?._id,
      metadata: { reason, lifecycle: org.lifecycle },
    });

    res.json({ success: true, data: withOrganizationAccessState(org) });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listOrgs,
  listOrgsHealthSummary,
  createOrg,
  getOrg,
  getOrgByStockixTenant,
  getOrgObservability,
  getOrgProvisioningStatus,
  consumeProvisioningCredentials,
  repairOrgCredentials,
  patchOrgLifecycle,
  suspendOrg,
  patchOrgLicense,
  patchOrgLocationSupport,
  patchEntitlements,
  deleteOrg,
  getOrgCredentials,
  resetCredentialRolePin,
  resetOrgPin,
  retryProvisioning,
};
