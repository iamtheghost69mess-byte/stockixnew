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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_unique").on(t.slug)],
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
