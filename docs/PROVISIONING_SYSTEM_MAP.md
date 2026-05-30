# Stockix Provisioning System - Complete Map

**Investigation Date:** 2026-05-30  
**Focus:** Multi-tenant SaaS with 3 modules (POS, Accounting, Combined)

---

## 1. ORGANIZATION/TENANT CREATION

### Where Organizations Are Created

**Tenant Creation (Main Provisioning Entry Point)**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 972-1127
- **Endpoint:** `POST /tenants`
- **What Happens:**
  - Validates owner_id, plan_slug, modules array (accounting/pos/pms/chat)
  - Slug validation: lowercase DNS-like format (line 959-960)
  - Plan must be active (line 996-1003)
  - If assign_existing_license_id provided, validates it exists and is "unassigned" (line 1005-1020)
  - Checks for slug collision and cleans up orphaned runtime artifacts (line 1022-1067)
  - Creates `tenantLifecycleJobs` record with type="tenant.provision" (line 1096-1111)
  - Returns HTTP 202 with `correlationId` for async polling (line 1113-1127)
  - **Key Fields Set:** slug, name, ownerId, adminEmail, adminFirstName, adminLastName, planSlug, modules, assignExistingLicenseId

**Organization (Child Org) Creation**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 1792-1910
- **Endpoint:** `POST /tenants/:tenantId/organizations`
- **What Happens:**
  - Validates tenant scope (line 1796-1797)
  - License eligibility check: must have active license (line 1833-1851)
  - Plan limit check: can create org based on license.maxOrganizations (line 1853-1862)
  - Generates unique slug from org name (line 1871)
  - **Assigns Subdomain:** `${slug}.${rootDomain}` truncated to 255 chars (line 1872-1873)
  - Inserts into `organizations` table with status="provisioning" (line 1875-1885)
  - Sets `isPrimary=true` if first org in tenant (line 1883)
  - **Immediately calls** `enqueueOrgProvisioning()` to queue worker job (line 1891)
  - Logs audit event (line 1895-1901)

### What Triggers Org Provisioning

**Immediate Bootstrap After Org Creation**
- **File:** `apps/api/src/org-provision.ts`
- **Line:** 12-105
- **Function:** `enqueueOrgProvisioning()`
- **What Happens:**
  - Fetches organization and parent tenant details (line 17-48)
  - Gets parent tenant's deployment internalPort (line 50-55)
  - Builds mainTenantInternalBaseUrl for internal communication (line 57-61)
  - Creates `tenantLifecycleJobs` record with type="organization.provision" (line 83-104)
  - Payload includes: organizationId, organizationSlug, isPrimary, parent tenant info, tenantModules
  - **No return value** - job queued asynchronously

### Bootstrap/Seed Logic

**Provision Job Execution**
- **File:** `infra/worker-service/src/provision-runtime.ts`
- **Starting Point:** Provision job claimed from queue
- **Key Setup Steps:**
  1. Validates required environment (apiConfig, posConfig) (line 80-96)
  2. Allocates tenant port for Docker (line 8)
  3. Builds tenant environment variables (line 26-28)
  4. Writes .env file atomically (line 27)
  5. **For Finance (Accounting Module):**
     - Calls `seedFinancePosDefaults()` (line 34)
     - Seeds chart of accounts if finance + pos (line 31-33)
  6. **For POS Module:**
     - Provisions POS stack via `provisionPosStackTracked()` (line 124-139)
     - Generates default staff PINs/usernames
  7. **For Combined (POS + Accounting):**
     - Wires Bigcapital integration via `wirePosBigcapitalIntegration()` (line 235-256)
     - Links POS payment accounts to accounting (line 173-267)

---

## 2. MODULE ASSIGNMENT & PROVISIONING

### How Orgs Get Assigned Modules

**At Provision Time (Initial Assignment)**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 968
- **Mechanism:** `modules` array in POST /tenants body
- **Default:** `["accounting"]` if not provided
- **Stored In:** `tenants.modules` (JSON string)

**After Provisioning (Module Addition)**
- **File:** `apps/api/src/routes/tenant-modules.ts`
- **Line:** 57-149
- **Endpoint:** `POST /tenants/:tenantId/add-module`
- **Requirements:** super_admin role only
- **What Happens:**
  - Validates module not already present (line 93-99)
  - Updates both `tenants.modules` AND `licenses.modules` (line 42-49)
  - Sets tenant status to "provisioning" (line 104)
  - Creates job with type="add_module" (line 115-127)
  - Returns 202 with jobId and new module list (line 138-148)

**Module Removal**
- **File:** `apps/api/src/routes/tenant-modules.ts`
- **Line:** 151-200+
- **Endpoint:** `POST /tenants/:tenantId/remove-module`
- **Constraint:** At least one module must remain

### How System Knows Which Data to Seed

**Module Resolution**
- **File:** `infra/worker-service/src/provision-runtime.ts`
- **Line:** 60-67
- **Functions:**
  - `resolveTenantModules(modules)` - parses module array
  - `shouldProvisionFinanceStack(modules)` - true if includes "accounting"
  - `hasAccountingAndPos(modules)` - true if both present
  - `isPosOnlyModules(modules)` - true if only "pos"
  - `provisionPmsStack(modules)` - provisions PMS if included

**Conditional Seeding Based on Modules**
- **If "accounting" ∈ modules:**
  - Seeds Finance organization (line 23 of create-control-plane-app.ts)
  - Calls `seedFinancePosDefaults()` (infra/worker-service/domain/provisioning/adapters/seed-finance-pos-defaults.ts)
  - Creates chart of accounts with MENA defaults (line 23)
  
- **If "pos" ∈ modules:**
  - Seeds POS organization
  - Generates default staff users with PINs (line 140-148 of provision-runtime.ts)
  - Creates default menu categories/items via POS API
  
- **If both "accounting" + "pos":**
  - Wires integration between systems (line 228-266 of provision-runtime.ts)

### Can Modules Be Added Later?

**YES - Fully Supported**
- Via `POST /tenants/:tenantId/add-module`
- Creates async job to provision new stack
- Existing data is preserved, new defaults are seeded
- License must include the module being added

---

## 3. DEFAULT DATA SEEDING

### Default Staff Users Created

**POS Staff Credentials**
- **File:** `infra/worker-service/src/provision-runtime.ts`
- **Line:** 140-149
- **Source:** POS provisioning result `posDefaultCredentials`
- **What Gets Created:**
  - Multiple staff users with different roles
  - Each user gets PIN (encrypted)
  - Credentials stored in `tenantProvisionEvents` (secret phase)
  - **Sent via Email:** `sendPosWelcomeEmail()` to adminEmail (line 143-149)
  - Masked for display: `maskPinForDisplay()` (apps/api/src/routes/tenants.ts:260-264)

**Finance Bootstrap Admin**
- Created automatically by Finance API during tenant provision
- **Detection:** `hasBootstrapAdminEvent()` checks for "tenant.bootstrap_admin" in journal (apps/api/src/provisioning/readiness-engine.ts:64-76)
- One-time password (OTP) generated and encrypted
- **Sent via Email:** `sendFinanceWelcomeEmail()` with OTP (apps/api/src/mail/send.ts:133-166)
- Stored encrypted in `tenantProvisionEvents` with meta.type="bootstrap_admin_otp"

### Default Accounts/Chart of Accounts Created

**Finance Defaults Seeding**
- **File:** `infra/worker-service/domain/provisioning/adapters/seed-finance-pos-defaults.ts`
- **Line:** 22-88
- **Endpoint Called:** `POST /api/internal/tenants/:financeTenantId/seed-pos-defaults`
- **What Gets Created:**
  ```
  - walkInCustomerId (required)
  - cashAccountId (for POS cash payments) (required)
  - cardAccountId (for POS card payments) (required)
  - serviceChargeItemId (optional)
  - discountItemId (optional)
  - defaultVendorId (optional)
  - inventoryAccountId (optional)
  - inventoryVarianceAccountId (optional)
  ```
- **Storage:** Returned IDs persisted in `tenantDeployments` table (line 269-300 of provision-runtime.ts)
- **MENA Defaults:** Uses predefined chart structure with MENA localization (line 23 of provision-runtime.ts)

### Default Menu Categories/Items Created (POS)

**POS Default Setup**
- **File:** `infra/worker-service/src/module-stacks.ts`
- **Location:** Delegated to POS provisioning service
- **Created Via:** POS platform API during `provisionPosStackTracked()`
- **What:** Default menu hierarchy, categories, items, prices
- **Not explicitly shown in logs** but executed during POS stack provision

### Seed Idempotency

**Seeds Are Idempotent With Guards**
- **Finance defaults:** Checked if already seeded (line 204-214 of provision-runtime.ts)
  - Skips if journal already has "tenant.wire_pos_integration" operation
  - Re-runs if health check fails
- **Bootstrap admin:** Only created once by Finance API
- **Retryable:** Jobs can be retried; operation journal prevents duplicate work

---

## 4. LICENSE & PLAN LOGIC

### Plan Definition

**Plans Table Structure**
- **File:** `apps/api/src/license-utils.ts`
- **Line:** 150-174
- **Function:** `getPlanLimits(db, planSlug)`
- **Fields Stored in `plans` Table:**
  - `slug` (e.g., "starter", "professional", "enterprise")
  - `name` (display name)
  - `maxOrganizations` (how many child orgs can be created)
  - `maxActivations` (how many separate tenants on one license)
  - `maxUsers` (concurrent users limit for provisioning)
  - `isActive` (soft-delete flag)
- **Default Fallback:** maxOrganizations=1, maxActivations=1, maxUsers=999

### How Plan Maps to Modules

**Plan ↔ License ↔ Modules Flow**
- **File:** `apps/api/src/mail/send.ts`
- **Line:** 208-240
- **License table has:**
  - `planSlug` - references plans.slug
  - `modules` - JSON array of enabled modules (line 304)
  - `isPerpetual` - if perpetual, far-future expiry cap (line 138-141 of license-utils.ts)
  
- **Plan does NOT directly specify modules**
  - Each license instance specifies which modules it covers
  - License validation checks tenant modules ⊆ license modules (line 34-60 of license-utils.ts)

### Plan Enforcement Guard

**Module Gating**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 1833-1851
- **Checks Before Org Creation:**
  ```
  1. License expired? → 402 LICENSE_EXPIRED
  2. No active license? → 402 NO_ACTIVE_LICENSE
  3. Organization limit reached? → 402 PLAN_LIMIT_REACHED
  ```

**License Module Validation**
- **File:** `apps/api/src/license-utils.ts`
- **Line:** 34-60
- **Function:** `validateLicenseModulesForTenant(tenantModulesJson, licenseModules)`
- **Rule:** Every module in license must be enabled on tenant

**Module Enforcement During Add**
- **File:** `apps/api/src/routes/tenant-modules.ts`
- **Line:** 94-99
- **Check:** Module being added must exist in active license or fail

### Trial Creation & Expiry

**License Lifecycle**
- **File:** `apps/api/src/license-constants.ts`
- **Constants:**
  - `DEFAULT_LICENSE_TERM_DAYS` - how long new licenses last
  - `DEFAULT_GRACE_PERIOD_DAYS` - grace period after expiry
- **Status Values:** unassigned → assigned → active → expired
- **Perpetual Flag:** If true, ignores expiresAt date

**Trial Detection**
- **No explicit "trial" type** - trials are just time-limited licenses with expiresAt set
- **Expiry Emails Triggered By Jobs:**
  - **File:** `apps/api/src/jobs/license-expiry-milestone.ts` - sends expiring warnings
  - **File:** `apps/api/src/jobs/license-expiry-queue.ts` - handles expiry state transitions

**License Status Transitions**
- **File:** `apps/api/src/tenant-license-lifecycle.ts`
- Handles suspend (applyTenantLicenseSuspend) and reactivate (applyTenantLicenseReactivate)

---

## 5. SUBDOMAIN ASSIGNMENT

### How Subdomains Assigned to Orgs

**Subdomain Generation at Org Creation**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 1871-1873
- **Code:**
  ```ts
  const slug = await pickUniqueOrganizationSlug(db, body.name);
  const root = rootDomainForOrganizationSubdomain();
  const subdomain = `${slug}.${root}`.slice(0, 255);
  ```
- **Storage:** Persisted in `organizations.subdomain` column

**Slug Generation**
- **File:** `apps/api/src/routes/tenants.ts`
- **Line:** 184-205
- **Function:** `pickUniqueOrganizationSlug()`
- **Process:**
  1. Slugify name: lowercase, remove special chars, limit to 70 chars
  2. Append random 4-char suffix for uniqueness
  3. Check collision against existing slugs
  4. Retry up to 16 times before failing

### Auto-Generated vs Admin-Assigned

**Fully Auto-Generated**
- No admin/user input for subdomain
- Deterministic based on org name + random suffix
- Collision detection prevents duplicates
- Immutable after creation (never shown as editable in UI)

### How Caddy Knows About Subdomains

**Dynamic Route Publication**
- **File:** `apps/api/src/provisioning/readiness-engine.ts`
- **Line:** 78-90
- **Detection:** `isRouteActiveFromEvents()` checks for "edge.publish" event
  - Meta.slug matches organization slug
  - Phase="journal" means operation completed

**Worker-Side Route Creation**
- **Not shown in control-plane code** - happens in worker-service
- **Writes:** Caddy dynamic config YAML to `${apiConfig.traefikDynamicDir}/tenant-${slug}.yml`
- **Caddy Reload:** Assumes Caddy configured to watch that directory

**DNS/Dynamic Reload**
- No explicit DNS check in code
- Assumes:
  - Root domain wildcard DNS (* A record) points to Caddy IP
  - Caddy configured to hot-reload YAML changes
  - No manual Caddy restart needed

---

## 6. EMAIL TRIGGER POINTS

### All Email Templates

**Location:** `apps/api/src/mail/templates/`

**Template Files:**
- `tenant-welcome.ts` - Tenant provisioning complete
- `finance-welcome.ts` - Finance module ready
- `pos-welcome.ts` - POS module ready
- `owner-invite.ts` - Owner account invitation
- `license-activated.ts` - License assigned
- `provision-complete-owner.ts` - Tenant fully provisioned
- `license-expiring.ts` - License expiry milestone
- `license-expired.ts` - License passed expiry
- `password-reset.ts` - Password reset link
- `password-changed.ts` - Confirmation of pwd change
- `layout.ts` - Email layout wrapper

### Every Email Sent During Provisioning

**Tenant Provisioning Complete**
- **Sent:** When provision job completes successfully
- **Function:** `sendTenantWelcomeEmail()` (apps/api/src/mail/send.ts:115-131)
- **Line:** 115-131
- **To:** tenantAdminEmail
- **Subject:** `Welcome to Stockix — {tenantName}`
- **Content:** Login URL, organization number, tenant details
- **Idempotency Key:** `tenant-welcome/{organizationNumber}`

**Finance Module Ready (Accounting)**
- **Sent:** After Finance stack deployed and ready
- **Function:** `sendFinanceWelcomeEmail()` (apps/api/src/mail/send.ts:133-166)
- **Line:** 133-166
- **To:** tenantAdminEmail
- **Subject:** `Your {brandName} account is ready`
- **Content:** 
  - Finance login URL
  - Admin email
  - **One-Time Password (OTP)** for bootstrap
  - List of enabled modules
- **Idempotency Key:** `finance-welcome/{adminEmail}/{loginUrl}`
- **Storage:** OTP encrypted and stored in provision events

**POS Module Ready**
- **Sent:** After POS stack deployed with default staff credentials
- **Function:** `sendPosWelcomeEmail()` (apps/api/src/mail/send.ts:177-203)
- **Line:** 177-203
- **To:** tenantAdminEmail
- **Subject:** `Your {brandName} POS staff credentials`
- **Content:**
  - POS login URL
  - Table of staff users with:
    - Role (Cashier, Manager, etc.)
    - Username
    - PIN (masked in display)
- **Idempotency Key:** `pos-welcome/{adminEmail}/{posUrl}`

**License Activated**
- **Sent:** When license assigned to tenant and status="active"
- **Function:** `sendLicenseActivatedEmail()` (apps/api/src/mail/send.ts:208-240)
- **Line:** 208-240
- **To:** tenantAdminEmail
- **Subject:** `Your {brandName} license is active`
- **Content:**
  - Plan name
  - Modules included
  - Valid from date
  - Expiry date (if not perpetual)
  - Login URL
- **Idempotency Key:** `license-activated/{licenseId}`

**Provision Complete (Owner)**
- **Sent:** After entire provisioning pipeline finishes
- **Function:** `sendProvisionCompleteOwnerEmail()` (apps/api/src/mail/send.ts:328-359)
- **Line:** 328-359
- **To:** ownerEmail
- **Subject:** `Tenant provisioned: {tenantName}`
- **Content:**
  - Tenant summary
  - Dashboard link to manage tenant
  - Module list
  - Admin contact email
- **Idempotency Key:** `provision-complete-owner/{tenantId}`

**License Expiring Soon**
- **Sent:** At milestones (30/7/1 day before expiry)
- **Function:** `sendLicenseExpiringEmail()` (apps/api/src/mail/send.ts:361-409)
- **Line:** 361-409
- **To:** tenantAdminEmail
- **Subject:** `Your Stockix license expires soon`
- **Content:**
  - Days remaining
  - Expiry date
  - Action link to renew
- **Idempotency Key:** `license-expiring/{licenseId}/{milestoneDays}`
- **Triggered By:** `apps/api/src/jobs/license-expiry-milestone.ts`

**License Expired**
- **Sent:** Day after expiry passes
- **Function:** `sendLicenseExpiredEmail()` (apps/api/src/mail/send.ts:411-449)
- **Line:** 411-449
- **To:** tenantAdminEmail
- **Subject:** `Your Stockix license has expired`
- **Content:**
  - Expiry date
  - Grace period duration
  - Grace period end date
  - Reactivation instructions
- **Idempotency Key:** `license-expired/{tenantId}/{today}`
- **Triggered By:** `apps/api/src/jobs/license-expiry-queue.ts`

**Owner Invitation**
- **Sent:** When owner account created/invited
- **Function:** `sendOwnerInviteEmail()` (apps/api/src/mail/send.ts:50-74)
- **Line:** 50-74
- **To:** ownerEmail
- **Subject:** `You're invited to Stockix`
- **Content:**
  - Role assigned
  - Invitation link with token
- **Idempotency Key:** `owner-invite/{email}/{urlSuffix}`

**Password Reset**
- **Sent:** When owner requests password reset
- **Function:** `sendOwnerPasswordResetEmail()` (apps/api/src/mail/send.ts:76-97)
- **Line:** 76-97
- **To:** ownerEmail
- **Subject:** `Reset your Stockix password`
- **Content:**
  - Reset link with token (time-limited)
- **Idempotency Key:** `password-reset/{email}/{urlSuffix}`

**Password Changed Confirmation**
- **Sent:** After password successfully changed
- **Function:** `sendPasswordChangedEmail()` (apps/api/src/mail/send.ts:99-113)
- **Line:** 99-113
- **To:** ownerEmail
- **Subject:** `Your Stockix password was changed`
- **Content:** Confirmation, time changed, security note
- **Idempotency Key:** `password-changed-{ownerId}-{day}`

### Email Configuration

**Mail Infrastructure**
- **File:** `apps/api/src/mail/mailer.ts`
- **Supported Modes:**
  1. **SMTP via Resend** (recommended):
     - `MAIL_HOST=smtp.resend.com`
     - `MAIL_PORT=587`
     - `MAIL_USERNAME=resend`
     - `MAIL_PASSWORD={RESEND_API_KEY}`
  2. **Resend SDK Direct:**
     - `RESEND_API_KEY=re_[key]`
- **From Address:** `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` (env vars)

**Email Delivery Tracking**
- **File:** `apps/api/src/mail/mailer.ts`
- **Function:** `mailSendSucceeded(result)` - checks result.status
- **Idempotency:** Same idempotencyKey prevents resend within grace period
- **Logging:** Email events tracked in `emailLogs` table

---

## 7. PROVISIONING WORKFLOW & READINESS

### Tenant Readiness Checks

**8 Readiness Status Checks**
- **File:** `apps/api/src/provisioning/readiness-engine.ts`
- **Function:** `getTenantReadiness(db, correlationId)`
- **Line:** 92-247

| Check | What | Where |
|-------|------|-------|
| jobCompleted | Provision job status="completed" | tenantLifecycleJobs table |
| tenantExists | Tenant row created in DB | tenants table |
| deploymentValid | Deployment has port, status≠failed | tenantDeployments table |
| tenantResponding | Ping /api/ping succeeds (5s timeout) | Docker container network |
| authReady | "tenant.bootstrap_admin" event logged | tenantProvisionEvents journal |
| routeActive | "edge.publish" event with matching slug | tenantProvisionEvents journal |
| financeTenantLinked | financeTenantId set if accounting module | tenantDeployments.financeTenantId |
| financeLicenseSynced | "[finance-license] synced" message logged | tenantProvisionEvents journal |

### Readiness Status States

**THREE STATES:**
1. **NOT_READY** - Core checks failing, provision not progressing
2. **DEGRADED** - Job complete but some post-deploy checks pending
3. **READY** - All checks pass, tenant fully operational

### Provision Event Journal

**Event Tracking System**
- **File:** `apps/api/src/lib/provision-events.ts`
- **Table:** `tenantProvisionEvents`
- **Columns:**
  - `correlationId` - links to provision job
  - `tenantId` - which tenant
  - `phase` - "api", "progress", "journal", "secret", "resume", "cancel"
  - `meta` - JSON object with operationKey, IDs, URLs
  - `message` - human-readable log line
  - `createdAt` - timestamp

**Event Phases:**
- **api** - Initial provision request acceptance
- **progress** - Step in progress
- **journal** - Step completed (idempotency check point)
- **secret** - Encrypted credentials (passwords, OTPs, PINs)
- **resume** - Skipping already-completed step on retry
- **cancel** - User-requested cancellation

**Key Journal Operations:**
- `tenant.bootstrap_admin` - Finance bootstrap admin created
- `edge.publish` - Route published to Caddy
- `tenant.wire_pos_integration` - POS-Finance integration wired
- `finance.license.synced` - License data synced to Finance

---

## 8. KEY FILES REFERENCE

### Control Plane API (apps/api/src/)

**Tenants Routes**
- `routes/tenants.ts` - Tenant CRUD, provisioning POST, credentials retrieval
- `routes/tenant-modules.ts` - Module add/remove operations
- `routes/internal.ts` - Job lifecycle, license hooks, provision event callbacks

**Licenses & Plans**
- `license-utils.ts` - License queries, module validation, plan limits
- `license-constants.ts` - DEFAULT_LICENSE_TERM_DAYS, DEFAULT_GRACE_PERIOD_DAYS
- `routes/licenses.ts` - License CRUD, assignment, activation

**Mail System**
- `mail/send.ts` - All email dispatch functions
- `mail/mailer.ts` - SMTP/Resend configuration
- `mail/templates/` - Email template functions
- `routes/email-logs.ts` - Email delivery logging

**Provisioning**
- `provisioning/readiness-engine.ts` - 8-check readiness evaluation
- `provisioning/readiness-reconciler.ts` - Periodic readiness reconciliation
- `provisioning/stuck-reconciler.ts` - Detect stuck provision jobs
- `org-provision.ts` - Queue organization provision jobs
- `provision-trace.ts` - Event logging abstraction

**Authentication & Modules**
- `services/auth/stockix-product-token.ts` - Parse/serialize tenant modules
- `middleware/rbac.ts` - Role-based access control with module checks

### Worker Service (infra/worker-service/)

**Provision Execution**
- `src/provision-runtime.ts` - Main provision orchestration loop
- `src/module-stacks.ts` - Module-specific provisioning logic
- `domain/provisioning/adapters/` - Individual provision steps:
  - `seed-finance-pos-defaults.ts` - Call Finance seed endpoint
  - `sync-finance-license.ts` - Sync license to Finance
  - `activate-finance-warehouses.ts` - Setup Finance inventory
  - `wire-pos-bigcapital-integration.ts` - Link POS to Finance
  - `copy-coa-across-stacks.ts` - Share COA between orgs

**Environment & Config**
- `domain/provisioning/tenant-env.ts` - Build and write .env files
- `domain/env-paths.ts` - Directory structure for tenant runtime

### Database Schema (packages/db/src/)

**Key Tables**
- `tenants` - Main tenant/organization record (modules, status, adminEmail)
- `tenantDeployments` - Docker deployment state (status, port, error, financeTenantId)
- `tenantLifecycleJobs` - Job queue (type, status, payload, attempts)
- `tenantProvisionEvents` - Provision event journal (phase, meta, message)
- `tenantConfig` - Tenant configuration (branding, settings)
- `organizations` - Child organizations (slug, subdomain, isPrimary)
- `licenses` - License records (planSlug, modules, expiresAt, isPerpetual)
- `plans` - Plan definitions (slug, maxOrganizations, maxActivations, maxUsers)
- `owners` - Owner/admin accounts
- `emailLogs` - Email send history

---

## 9. FULL PROVISIONING FLOW (SEQUENCE)

```
1. POST /tenants (control-plane API)
   ├─ Validate input (owner, plan, modules)
   ├─ Assign license (optional)
   ├─ Create tenantLifecycleJobs (type=tenant.provision)
   └─ Return 202 with correlationId

2. Worker Claims Job
   ├─ Create tenants row
   ├─ Create tenantDeployments row
   ├─ Allocate port, slug, subdomain
   └─ Create directories

3. Resolve Modules & Conditionally Provision Stacks
   ├─ IF "accounting" ∈ modules:
   │  ├─ Deploy Finance stack (Docker compose)
   │  ├─ Create Finance tenant
   │  ├─ Create bootstrap admin
   │  ├─ Call POST /seed-pos-defaults
   │  │  └─ Returns: walkInCustomerId, cashAccountId, cardAccountId
   │  └─ Log journal event: tenant.bootstrap_admin
   ├─ IF "pos" ∈ modules:
   │  ├─ Deploy POS stack (Docker compose)
   │  ├─ Create POS organization
   │  ├─ Generate default staff credentials
   │  └─ Store encrypted in tenantProvisionEvents
   └─ IF "pms" ∈ modules:
      └─ Deploy PMS stack

4. If "accounting" AND "pos" (Combined Module)
   ├─ Call wirePosBigcapitalIntegration()
   │  ├─ Link POS payment accounts → Finance accounts
   │  ├─ Set service charge, discount, vendor defaults
   │  └─ Log journal event: tenant.wire_pos_integration
   └─ Update tenantDeployments with finance IDs

5. Publish Route & Sync License
   ├─ Write Caddy YAML config (tenant-{slug}.yml)
   ├─ Log journal event: edge.publish
   ├─ Sync license to Finance system
   └─ Log journal event: finance.license.synced

6. Mark Job Complete
   ├─ Update job status="completed"
   ├─ Update tenant status="active"
   └─ Update deployment status="active"

7. Send Emails (in order)
   ├─ sendTenantWelcomeEmail()
   ├─ sendFinanceWelcomeEmail() [if accounting]
   │  └─ Contains: OTP for bootstrap admin
   ├─ sendPosWelcomeEmail() [if pos]
   │  └─ Contains: staff PINs and usernames
   ├─ sendLicenseActivatedEmail()
   └─ sendProvisionCompleteOwnerEmail()

8. Readiness Polling (GET /tenants/provision-status/:correlationId)
   └─ Returns: status (NOT_READY/DEGRADED/READY), checks, reasons
```

---

## 10. DIAGNOSTIC QUERIES

### Check Provision Status
```
GET /tenants/provision-status/{correlationId}
- correlationId from initial POST /tenants response
- Returns: 8 readiness checks, overall status, failure reasons
- Cache: 2 seconds (READINESS_CACHE_TTL_MS)
```

### Check Tenant Readiness
```
SELECT * FROM tenantLifecycleJobs
WHERE correlationId = '{id}' AND type = 'tenant.provision'
ORDER BY createdAt DESC LIMIT 1;
```

### View Provision Event Journal
```
SELECT phase, meta, message, createdAt
FROM tenantProvisionEvents
WHERE correlationId = '{id}'
ORDER BY createdAt ASC;
```

### Verify Module Assignment
```
SELECT modules FROM tenants WHERE id = '{tenantId}';
-- Returns JSON string, parse to get ["accounting", "pos", ...]
```

### Check License-Module Alignment
```
SELECT 
  t.modules as tenant_modules,
  l.modules as license_modules
FROM tenants t
LEFT JOIN licenses l ON l.tenantId = t.id AND l.status = 'active'
WHERE t.id = '{tenantId}';
```

---

## SUMMARY TABLE

| Aspect | Key File | Key Function | Entry Point |
|--------|----------|--------------|-------------|
| **Tenant Creation** | routes/tenants.ts:972 | POST /tenants | Line 972 |
| **Org Creation** | routes/tenants.ts:1792 | POST /tenants/:id/organizations | Line 1792 |
| **Module Assignment** | routes/tenants.ts:968 | POST body modules array | Initial provision |
| **Module Addition** | routes/tenant-modules.ts:57 | POST /add-module | Line 57 |
| **Finance Seeding** | infra/.../seed-finance-pos-defaults.ts:22 | seedFinancePosDefaults() | Line 22 |
| **POS Seeding** | provision-runtime.ts:98 | runPosProvisionStep() | Line 98 |
| **Subdomain** | routes/tenants.ts:1871 | pickUniqueOrganizationSlug() | Line 1871 |
| **License Plan** | license-utils.ts:150 | getPlanLimits() | Line 150 |
| **License Activation** | routes/tenants.ts:1005 | assign_existing_license_id | Line 1005 |
| **Email: Tenant Welcome** | mail/send.ts:115 | sendTenantWelcomeEmail() | Line 115 |
| **Email: Finance Ready** | mail/send.ts:133 | sendFinanceWelcomeEmail() | Line 133 |
| **Email: POS Ready** | mail/send.ts:177 | sendPosWelcomeEmail() | Line 177 |
| **Email: License Active** | mail/send.ts:208 | sendLicenseActivatedEmail() | Line 208 |
| **Email: Provision Done** | mail/send.ts:328 | sendProvisionCompleteOwnerEmail() | Line 328 |
| **Readiness Check** | provisioning/readiness-engine.ts:92 | getTenantReadiness() | Line 92 |
| **Event Journal** | lib/provision-events.ts | appendProvisionEventSafe() | Event logging |

