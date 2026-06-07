import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Configurable platform roles (system + custom). */
export const platformRoles = pgTable(
  "platform_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("platform_roles_slug_unique").on(t.slug)],
);

export type PlatformRole = typeof platformRoles.$inferSelect;
export type NewPlatformRole = typeof platformRoles.$inferInsert;

/** SaaS platform operators (Stockix owners). Auth fields come in a later phase. */
export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("super_admin"),
    roleId: uuid("role_id").references(() => platformRoles.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("active"),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    inviteToken: text("invite_token"),
    inviteTokenHash: text("invite_token_hash"),
    inviteTokenExpiresAt: timestamp("invite_token_expires_at", {
      withTimezone: true,
    }),
    invitedById: uuid("invited_by_id").references((): AnyPgColumn => owners.id),
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("owners_email_unique").on(t.email)],
);

/** Customer org / tenant row. ownerId uses restrict so tenants must be reassigned before owner delete. */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    /** Stockix bootstrap admin (not the Stockix platform owner). */
    adminEmail: text("admin_email").notNull(),
    adminFirstName: text("admin_first_name").notNull(),
    adminLastName: text("admin_last_name").notNull(),
    /** provisioning | active | partial | failed | suspended | stopped */
    status: text("status").notNull().default("active"),
    planSlug: text("plan_slug").notNull().default("starter"),
    /** JSON array of licensed product modules, e.g. ["accounting","pos"]. */
    modules: text("modules").notNull().default('["accounting"]'),
    /** Chatwoot account id when chat module is provisioned. */
    chatwootAccountId: text("chatwoot_account_id"),
    /** Human-readable org identifier (ORG-00001). */
    organizationNumber: varchar("organization_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_slug_unique").on(t.slug),
    uniqueIndex("tenants_organization_number_unique").on(t.organizationNumber),
    index("tenants_owner_id_idx").on(t.ownerId),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
    status: varchar("status", { length: 50 }).notNull().default("provisioning"),
    // provisioning | active | suspended | failed
    isPrimary: boolean("is_primary").notNull().default(false),
    financeOrganizationId: varchar("finance_organization_id", { length: 255 }),
    /** Mongo ObjectId of the POS organization wired to this control-plane org. */
    posOrganizationId: text("pos_organization_id"),
    provisioningError: text("provisioning_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("organizations_tenant_id_idx").on(t.tenantId),
    uniqueIndex("organizations_tenant_slug_unique").on(t.tenantId, t.slug),
  ],
);

/** Optional per-owner access to a specific organization (future enforcement / Team matrix). */
export const ownerOrganizationAccess = pgTable(
  "owner_organization_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("owner_org_access_owner_org_unique").on(t.ownerId, t.organizationId),
    index("owner_org_access_owner_idx").on(t.ownerId),
    index("owner_org_access_tenant_idx").on(t.tenantId),
  ],
);

/** White-label and display config; one row per tenant (cascade on tenant delete). */
export const tenantConfig = pgTable("tenant_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  appName: text("app_name"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  /** URL-safe public discovery token (not tenant UUID). */
  publicDiscoverySlug: text("public_discovery_slug"),
  branding: jsonb("branding").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-tenant Stockix Docker Compose stack metadata (MySQL/Mongo/Redis live in that stack —
 * not in Stockix Postgres). Stockix handles internal multi-tenancy inside its MySQL layer.
 */
export const tenantDeployments = pgTable(
  "tenant_deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    /** Unique Docker Compose project name per tenant (e.g. stockix_tenant_acme). */
    composeProjectName: text("compose_project_name").notNull(),
    /** Internal port the tenant stack exposes to Traefik (host networking / overlay TBD). */
    internalPort: integer("internal_port").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlPassword: text("mysql_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlRootPassword: text("mysql_root_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    jwtSecret: text("jwt_secret").notNull(),
    /** MongoDB URL scoped to the tenant (e.g. mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0). */
    mongoUrl: text("mongo_url").notNull(),
    lastError: text("last_error"),
    /** When tenant.status is partial: pos_failed | wire_failed */
    partialFailureKind: text("partial_failure_kind"),
    registrationCompletedAt: timestamp("registration_completed_at", {
      withTimezone: true,
    }),
    /** Finance stack tenant id (numeric) for internal license sync. */
    financeTenantId: integer("finance_tenant_id"),
    /** Bigcapital primary warehouse id (code 10001) for POS integration defaultWarehouseId. */
    financeDefaultWarehouseId: integer("finance_default_warehouse_id"),
    /** Finance walk-in customer for POS Bigcapital sync. */
    financeWalkInCustomerId: integer("finance_walk_in_customer_id"),
    financeCashAccountId: integer("finance_cash_account_id"),
    financeCardAccountId: integer("finance_card_account_id"),
    /** POS platform organization id (Mongo ObjectId string). */
    posOrganizationId: text("pos_organization_id"),
    /** Public POS web app URL (Traefik: https://{slug}-pos.{domain}). */
    posUrl: text("pos_url"),
    /** Encrypted bootstrap Finance admin password (`enc:v1:*`) until cleared by operator. */
    financeAdminPassword: text("finance_admin_password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tenant_deployments_tenant_id_idx").on(t.tenantId),
    uniqueIndex("tenant_deployments_compose_project_name_unique").on(
      t.composeProjectName,
    ),
  ],
);

/**
 * Append-only audit + live trace for Stockix provisioning (see migration 0003).
 * `correlation_id` matches the async job id returned from POST /tenants.
 */
export const tenantProvisionEvents = pgTable(
  "tenant_provision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    correlationId: text("correlation_id").notNull(),
    slug: text("slug"),
    tenantId: uuid("tenant_id"),
    parentTenantId: uuid("parent_tenant_id"),
    deploymentId: uuid("deployment_id"),
    phase: text("phase").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tpe_correlation_created_idx").on(t.correlationId, t.createdAt)],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => owners.id),
    action: text("action").notNull(),
    targetTenantId: uuid("target_tenant_id").references(() => tenants.id),
    targetOwnerId: uuid("target_owner_id").references(() => owners.id),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("admin_audit_log_actor_created_idx").on(t.actorId, t.createdAt),
    index("admin_audit_log_tenant_created_idx").on(t.targetTenantId, t.createdAt),
    index("admin_audit_log_owner_created_idx").on(t.targetOwnerId, t.createdAt),
  ],
);

/** Named API keys (sk_live_*) for programmatic access; secret stored as hash only. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 32 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    index("api_keys_owner_id_idx").on(t.ownerId),
  ],
);

export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    actorId: uuid("actor_id").notNull().references(() => owners.id, {
      onDelete: "cascade",
    }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("api_idempotency_keys_actor_key_unique").on(t.actorId, t.key),
    index("api_idempotency_keys_actor_created_idx").on(t.actorId, t.createdAt),
    index("api_idempotency_keys_expires_idx").on(t.expiresAt),
  ],
);

export const tenantLifecycleJobs = pgTable(
  "tenant_lifecycle_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    claimToken: uuid("claim_token"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_lifecycle_jobs_status_run_at_idx").on(t.status, t.runAt, t.priority),
    index("tenant_lifecycle_jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("tenant_lifecycle_jobs_correlation_created_idx").on(t.correlationId, t.createdAt),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    maxOrganizations: integer("max_organizations").notNull().default(1),
    maxActivations: integer("max_activations").notNull().default(1),
    maxUsers: integer("max_users").notNull().default(999),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Price in smallest currency unit (e.g. cents). Null = custom / not set. */
    priceMonthly: integer("price_monthly"),
    priceAnnually: integer("price_annually"),
    currency: text("currency").default("USD"),
    billingInterval: text("billing_interval"),
    isPublic: boolean("is_public").notNull().default(false),
    /** JSON array of feature strings for display. */
    features: text("features"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("plans_slug_unique").on(t.slug)],
);

export const licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseKey: text("license_key").notNull(),
    /** `stkx` legacy random keys; `stxi` tenant+location+checksum keys. */
    keyFormat: text("key_format").notNull().default("stkx"),
    /** POS location ObjectId string when key is location-scoped (STXI). */
    scopedLocationId: text("scoped_location_id"),
    product: text("product").notNull().default("platform"),
    /** JSON array of product modules this license grants. */
    modules: text("modules").notNull().default('["accounting"]'),
    planSlug: text("plan_slug").notNull().default("starter"),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("unassigned"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isPerpetual: boolean("is_perpetual").notNull().default(false),
    maxActivations: integer("max_activations").notNull().default(1),
    maxOrganizations: integer("max_organizations").notNull().default(1),
    maxUsers: integer("max_users"),
    // -1 = unlimited
    activationCount: integer("activation_count").notNull().default(0),
    gracePeriodDays: integer("grace_period_days").notNull().default(7),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("licenses_key_unique").on(t.licenseKey),
    index("licenses_tenant_id_idx").on(t.tenantId),
    index("licenses_tenant_status_idx").on(t.tenantId, t.status),
    index("licenses_status_idx").on(t.status),
    index("licenses_product_idx").on(t.product),
    index("licenses_expires_at_idx").on(t.expiresAt),
  ],
);

/** In-app alerts for SaaS owners (provision, license, job lifecycle). */
export const ownerNotifications = pgTable(
  "owner_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id").references(() => licenses.id, { onDelete: "set null" }),
    correlationId: text("correlation_id"),
    actionUrl: text("action_url"),
    actionLabel: text("action_label"),
    readAt: timestamp("read_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_notifications_owner_id_idx").on(t.ownerId),
    index("owner_notifications_owner_unread_idx").on(t.ownerId, t.readAt),
    index("owner_notifications_created_at_idx").on(t.createdAt),
    index("owner_notifications_owner_created_idx").on(t.ownerId, t.createdAt),
  ],
);

export type OwnerNotification = typeof ownerNotifications.$inferSelect;
export type NewOwnerNotification = typeof ownerNotifications.$inferInsert;

/** Outbound transactional email attempts (control plane SMTP). */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    deliveryStatus: text("delivery_status"),
    error: text("error"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("email_logs_created_at_idx").on(t.createdAt),
    index("email_logs_template_key_idx").on(t.templateKey),
    index("email_logs_provider_message_id_idx").on(t.providerMessageId),
    index("email_logs_tenant_id_idx").on(t.tenantId),
  ],
);

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;

export const licenseHistory = pgTable(
  "license_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    previousValues: text("previous_values"),
    newValues: text("new_values"),
    notes: text("notes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("license_history_license_id_idx").on(t.licenseId),
    index("license_history_created_at_idx").on(t.createdAt),
  ],
);

export const licenseActivations = pgTable(
  "license_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, {
        onDelete: "cascade",
      }),
    hardwareFingerprint: text("hardware_fingerprint").notNull(),
    machineName: text("machine_name"),
    ipAddress: text("ip_address"),
    activationStatus: text("activation_status").notNull().default("active"),
    offlineToken: text("offline_token"),
    offlineTokenExpiresAt: timestamp("offline_token_expires_at", {
      withTimezone: true,
    }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedById: uuid("deactivated_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lic_act_license_id_idx").on(t.licenseId),
    index("lic_act_fingerprint_idx").on(t.hardwareFingerprint),
    uniqueIndex("lic_act_license_fingerprint_unique").on(
      t.licenseId,
      t.hardwareFingerprint,
    ),
  ],
);

export const blacklistedFingerprints = pgTable(
  "blacklisted_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hardwareFingerprint: text("hardware_fingerprint").notNull(),
    reason: text("reason"),
    blacklistedById: uuid("blacklisted_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("blacklisted_fp_unique").on(t.hardwareFingerprint)],
);

// ─── PMS: Core tables ────────────────────────────────────────────────────────
// TODO(security): isolate PMS to per-tenant Postgres before public launch

export const pmsProperties = pgTable(
  "pms_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** hotel | hostel | villa | apartment | guesthouse | resort */
    type: text("type").notNull().default("hotel"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    /** 24h format, e.g. "14:00" */
    checkInTime: text("check_in_time").notNull().default("14:00"),
    checkOutTime: text("check_out_time").notNull().default("12:00"),
    minNights: integer("min_nights").notNull().default(1),
    /** Days forward from today to accept bookings via OTA iCal. */
    bookingWindow: integer("booking_window").notNull().default(365),
    cleaningEnabled: boolean("cleaning_enabled").notNull().default(true),
    /** Durable slug for iCal export URL — set once, never changes. */
    feedSlug: text("feed_slug").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_properties_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_properties_feed_slug_unique").on(t.feedSlug),
  ],
);

export const pmsRooms = pgTable(
  "pms_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** standard | deluxe | suite | dormitory | villa */
    type: text("type").notNull().default("standard"),
    capacity: integer("capacity").notNull().default(2),
    rateCents: integer("rate_cents").notNull().default(0),
    /** available | occupied | maintenance | cleaning */
    status: text("status").notNull().default("available"),
    description: text("description"),
    /** JSON array of amenity strings, e.g. ["wifi","ac","minibar"] */
    amenities: text("amenities").notNull().default("[]"),
    floor: integer("floor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_rooms_tenant_idx").on(t.tenantId),
    index("pms_rooms_property_idx").on(t.propertyId),
  ],
);

export const pmsGuests = pgTable(
  "pms_guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    // Compliance / registration fields (passport, visa)
    nationality: text("nationality"),
    dateOfBirth: text("date_of_birth"),
    /** passport | national_id | driving_license */
    idType: text("id_type"),
    idNumber: text("id_number"),
    passportNumber: text("passport_number"),
    passportExpiry: text("passport_expiry"),
    issuedBy: text("issued_by"),
    visaNumber: text("visa_number"),
    visaFrom: text("visa_from"),
    visaTo: text("visa_to"),
    hasVisa: boolean("has_visa").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_guests_tenant_idx").on(t.tenantId)],
);

export const pmsBookings = pgTable(
  "pms_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pmsRooms.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => pmsGuests.id, { onDelete: "cascade" }),
    checkIn: text("check_in").notNull(),
    checkOut: text("check_out").notNull(),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    /** confirmed | checked_in | checked_out | cancelled | no_show */
    bookingStatus: text("booking_status").notNull().default("confirmed"),
    /** pending | partial | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("pending"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    /** direct | airbnb | booking | vrbo | expedia | other */
    platform: text("platform").notNull().default("direct"),
    specialRequests: text("special_requests"),
    notes: text("notes"),
    /** Actual check-in/out timestamps recorded at the front desk. */
    checkInActualAt: timestamp("check_in_actual_at", { withTimezone: true }),
    checkOutActualAt: timestamp("check_out_actual_at", { withTimezone: true }),
    /** pending | synced | failed — Finance SaleReceipt sync state. */
    accountingSyncStatus: text("accounting_sync_status").notNull().default("pending"),
    /** Finance SaleReceipt id after successful sync. */
    financeReceiptId: integer("finance_receipt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_bookings_tenant_idx").on(t.tenantId),
    index("pms_bookings_property_idx").on(t.propertyId),
    index("pms_bookings_status_idx").on(t.bookingStatus),
    index("pms_bookings_check_in_idx").on(t.checkIn),
  ],
);

export const pmsPayments = pgTable(
  "pms_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => pmsBookings.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /** cash | card | bank_transfer | online | other */
    method: text("method").notNull().default("cash"),
    /** completed | pending | refunded | failed */
    status: text("status").notNull().default("completed"),
    transactionId: text("transaction_id"),
    /** Finance SalePayment id after sync. */
    financePaymentId: integer("finance_payment_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_payments_tenant_idx").on(t.tenantId),
    index("pms_payments_booking_idx").on(t.bookingId),
  ],
);

// ─── PMS: iCal channel sync ───────────────────────────────────────────────────

export const pmsIcalChannels = pgTable(
  "pms_ical_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** airbnb | booking | vrbo | expedia | direct | other */
    platform: text("platform").notNull().default("other"),
    importUrl: text("import_url"),
    exportToken: text("export_token").notNull(),
    /** Days to block before a booking starts (cleaning buffer). */
    bufferBefore: integer("buffer_before").notNull().default(1),
    /** Days to block after a booking ends (cleaning buffer). */
    bufferAfter: integer("buffer_after").notNull().default(1),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_ical_channels_tenant_idx").on(t.tenantId),
    index("pms_ical_channels_property_idx").on(t.propertyId),
    uniqueIndex("pms_ical_export_token_unique").on(t.exportToken),
  ],
);

/** Synced iCal events from OTA platforms — source of truth for availability. */
export const pmsCalendarEvents = pgTable(
  "pms_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** Source platform slug (airbnb, booking, etc.) */
    platform: text("platform").notNull(),
    /** iCal UID — unique per property+platform, used for upsert/dedup. */
    icalUid: text("ical_uid").notNull(),
    summary: text("summary").notNull().default(""),
    /** YYYY-MM-DD inclusive start. */
    startDate: text("start_date").notNull(),
    /** YYYY-MM-DD exclusive end (iCal convention). */
    endDate: text("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cal_events_tenant_idx").on(t.tenantId),
    index("pms_cal_events_property_platform_idx").on(t.propertyId, t.platform),
    uniqueIndex("pms_cal_events_uid_unique").on(t.propertyId, t.platform, t.icalUid),
  ],
);

/** Audit trail for iCal sync runs. */
export const pmsSyncLogs = pgTable(
  "pms_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null",
    }),
    /** info | warn | error | success */
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_sync_logs_tenant_idx").on(t.tenantId),
    index("pms_sync_logs_property_idx").on(t.propertyId),
  ],
);

/** Open / closed date overrides per property. */
export const pmsDateOverrides = pgTable(
  "pms_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    date: text("date").notNull(),
    /** open | closed */
    type: text("type").notNull().default("closed"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_date_overrides_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_date_overrides_property_date_unique").on(t.propertyId, t.date),
  ],
);

// ─── PMS: Housekeeping ────────────────────────────────────────────────────────

export const pmsStaff = pgTable(
  "pms_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** receptionist | manager | housekeeping | maintenance */
    role: text("role").notNull().default("receptionist"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_staff_tenant_idx").on(t.tenantId)],
);

/** Cleaner profiles — lightweight, no login required. */
export const pmsCleaners = pgTable(
  "pms_cleaners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_cleaners_tenant_idx").on(t.tenantId)],
);

/** Per-property cleaner assignment with priority ranking (0 = primary). */
export const pmsCleanerAssignments = pgTable(
  "pms_cleaner_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    cleanerId: uuid("cleaner_id")
      .notNull()
      .references(() => pmsCleaners.id, { onDelete: "cascade" }),
    /** 0 = primary cleaner, 1 = first backup, etc. */
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cleaner_assignments_tenant_idx").on(t.tenantId),
    index("pms_cleaner_assignments_property_idx").on(t.propertyId),
    uniqueIndex("pms_cleaner_assignments_property_cleaner_unique").on(
      t.propertyId,
      t.cleanerId,
    ),
  ],
);

export const pmsCleaningTasks = pgTable(
  "pms_cleaning_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "set null",
    }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pmsRooms.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    scheduledDate: text("scheduled_date").notNull(),
    /** pending | in_progress | done | skipped */
    status: text("status").notNull().default("pending"),
    assigneeId: uuid("assignee_id").references(() => pmsStaff.id, {
      onDelete: "set null",
    }),
    cleanerId: uuid("cleaner_id").references(() => pmsCleaners.id, {
      onDelete: "set null",
    }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    /** JSON array of photo URLs captured at completion. */
    photos: text("photos").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_cleaning_tasks_tenant_idx").on(t.tenantId),
    index("pms_cleaning_tasks_date_idx").on(t.scheduledDate),
  ],
);

// ─── PMS: Property manager delegation ────────────────────────────────────────

/** Grants a staff/user delegate access to manage a specific property. */
export const pmsPropertyManagers = pgTable(
  "pms_property_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => pmsStaff.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_property_managers_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_property_managers_property_staff_unique").on(
      t.propertyId,
      t.staffId,
    ),
  ],
);

/** Invite tokens for granting property manager access. */
export const pmsPropertyManagerInvites = pgTable(
  "pms_property_manager_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => pmsProperties.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdById: uuid("created_by_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    /** Filled once the invite is accepted. */
    acceptedByStaffId: uuid("accepted_by_staff_id").references(() => pmsStaff.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_pm_invites_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_pm_invites_token_unique").on(t.token),
  ],
);

// ─── PMS: Messaging ───────────────────────────────────────────────────────────

export const pmsMessageTemplates = pgTable(
  "pms_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** email | sms | whatsapp */
    channel: text("channel").notNull().default("email"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    /** pre_arrival | check_in | check_out | post_stay | custom */
    trigger: text("trigger").notNull().default("custom"),
    /** Days offset from trigger event (negative = before). */
    sendOffsetDays: integer("send_offset_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_message_templates_tenant_idx").on(t.tenantId),
    index("pms_message_templates_property_idx").on(t.propertyId),
  ],
);

// ─── PMS: Guest pre-arrival forms ────────────────────────────────────────────

export const pmsGuestFormTemplates = pgTable(
  "pms_guest_form_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => pmsProperties.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** JSON array of {id,type,label,required,helpText?,options?} */
    fields: text("fields").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_guest_form_templates_tenant_idx").on(t.tenantId),
    index("pms_guest_form_templates_property_idx").on(t.propertyId),
  ],
);

/** One submission per booking — holds the share token and captured answers. */
export const pmsGuestFormSubmissions = pgTable(
  "pms_guest_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => pmsBookings.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => pmsGuestFormTemplates.id, { onDelete: "cascade" }),
    /** Unguessable 32-char base64url — possession is the only auth. */
    shareToken: text("share_token").notNull(),
    /** JSON array of {fieldId,type,label,value} — null until submitted. */
    answers: text("answers"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_guest_form_submissions_tenant_idx").on(t.tenantId),
    index("pms_guest_form_submissions_booking_idx").on(t.bookingId),
    uniqueIndex("pms_guest_form_submissions_token_unique").on(t.shareToken),
  ],
);
