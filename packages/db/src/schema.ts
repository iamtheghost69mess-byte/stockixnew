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

/** SaaS platform operators (Stockix owners). Auth fields come in a later phase. */
export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("super_admin"),
    status: text("status").notNull().default("active"),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    inviteToken: text("invite_token"),
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
  ],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  subdomain: varchar("subdomain", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("provisioning"),
  // provisioning | active | suspended | failed
  isPrimary: boolean("is_primary").notNull().default(false),
  financeOrganizationId: varchar("finance_organization_id", { length: 255 }),
  provisioningError: text("provisioning_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    /** MongoDB URL scoped to the tenant stack (e.g. mongodb://mongo/stockix). */
    mongoUrl: text("mongo_url").notNull(),
    lastError: text("last_error"),
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

export const pmsProperties = pgTable(
  "pms_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("hotel"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_properties_tenant_idx").on(t.tenantId)],
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
    type: text("type").notNull().default("standard"),
    capacity: integer("capacity").notNull().default(2),
    rateCents: integer("rate_cents").notNull().default(0),
    status: text("status").notNull().default("available"),
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
    bookingStatus: text("booking_status").notNull().default("confirmed"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_bookings_tenant_idx").on(t.tenantId),
    index("pms_bookings_property_idx").on(t.propertyId),
  ],
);

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
    importUrl: text("import_url"),
    exportToken: text("export_token").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_ical_channels_tenant_idx").on(t.tenantId),
    uniqueIndex("pms_ical_export_token_unique").on(t.exportToken),
  ],
);

export const pmsStaff = pgTable(
  "pms_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("receptionist"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_staff_tenant_idx").on(t.tenantId)],
);

export const pmsCleaningTasks = pgTable(
  "pms_cleaning_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pmsRooms.id, { onDelete: "cascade" }),
    scheduledDate: text("scheduled_date").notNull(),
    status: text("status").notNull().default("pending"),
    assigneeId: uuid("assignee_id").references(() => pmsStaff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_cleaning_tasks_tenant_idx").on(t.tenantId)],
);

export const pmsMessageTemplates = pgTable(
  "pms_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("email"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_message_templates_tenant_idx").on(t.tenantId)],
);
