# Provisioning Audit — Stockix Multi-Tenant SaaS
**Date:** 2026-05-30  
**Audited by:** Claude Code (Swarm Investigation)  
**Status:** In Progress

---

## 1. Executive Summary

**FINDINGS COMPILED** — Full architecture analysis complete.

### What is Working
- Journaled state machine (idempotent operations via tenantProvisionEvents)
- Standalone Accounting provisioning (cleanest path: Org Create → Finance Stack → Bootstrap → READY)
- Combined POS+Accounting provisioning (all paths exercised, integration step runs)
- Multi-tenant data isolation (advisory locks, separate Finance tenant IDs)
- Email notifications (10 types, all branded, Resend SMTP working)
- Subdomain routing (dynamic Caddy config, wildcard SSL)
- License validation at add-module time (validateLicenseModulesForTenant)

### What is Broken (High Severity)
- 🚨 **add_module job handler missing** (Gap #1): Type="add_module" enqueued but provision-runtime never processes it; Finance/POS stacks never re-provision for module upgrades
- 🚨 **No explicit rollback on failure** (Gap #2): Provision crashes leave tenant stuck in "provisioning"; no cleanup or "failed" status
- **Readiness checks not gated by module** (Gap #3): POS-only tenants fail READY status because checks wait for Finance health (never triggers)
- **No "failed" terminal state** (Gap #4): Indefinite stuck state on errors

### What is Missing Entirely
- Module upgrade workflow UI (owners can't trigger "Add Accounting")
- Provision status dashboard (no visibility into job queue or stuck tenants)
- Rollback/retry admin tool (no way to recover from provision failures)
- Org-level module enforcement (no runtime guards preventing access to unlicensed features)
- Credential rotation policy (default credentials in journal indefinitely)

### Top 5 Production Blockers
1. 🚨 Implement add_module handler — module upgrades fail silently
2. 🚨 Add rollback logic — provision failures leave zombies indefinitely
3. Module-gate readiness checks — POS-only tenants won't become READY
4. Add "failed" terminal state — required to detect stuck provisioning
5. Build provision status dashboard — required for ops monitoring

### Risk Level per Module
- **Standalone POS:** ⚠️ PARTIAL (readiness checks not module-gated; may fail to reach READY)
- **Standalone Accounting:** ✅ WORKING (cleanest path; all steps present)
- **Combined:** ✅ WORKING (all paths exercised; integration runs)
- **POS → Add Accounting:** ⚠️ PARTIAL (add_module handler missing; Finance stack never provisions)
- **Accounting → Add POS:** ⚠️ PARTIAL (same handler issue)
- **Production 15+ tenants:** ⚠️ PARTIAL (advisory lock prevents race; module gating safe; email best-effort; missing parent module sync)

---

## 2. Module Status Matrix

| Scenario | Org Create | Module Provision | Data Seed | Subdomain | Email | Login | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| Standalone POS | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ PARTIAL | Readiness checks not gated by module; checks for Finance even though Finance not provisioned |
| Standalone Accounting | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ WORKING | Cleanest path; all steps present |
| Combined | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ WORKING | All paths exercised; integration step runs |
| POS → Add Accounting | ✅ | ⚠️ | ❓ | ✅ | ❓ | ❓ | ⚠️ PARTIAL | Module add enqueued but handler missing (Gap #1); Finance stack never provisions |
| Accounting → Add POS | ✅ | ⚠️ | ❓ | ✅ | ❓ | ❓ | ⚠️ PARTIAL | Same as above; handler missing |
| Failure & Rollback | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ BROKEN | No rollback on error; stuck in "provisioning"; no "failed" status (Gap #2) |
| Production 15+ tenants | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ WORKING | Advisory lock prevents race; module gating safe; email best-effort; org parent validation missing |
| Local Development | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ PARTIAL | Same handler issue as module add scenarios |

---

## 3. Provisioning Algorithm (Current)

**Journaled State Machine with Module Branching:**

```
REQUEST(202) → VALIDATE → ENQUEUE JOB → JOURNAL_RECOVER → PROVISION_STACKS → JOURNAL_MARK → READINESS_CHECKS → READY
```

### Request Phase
**File:** `apps/api/src/routes/tenants.ts:972-1050`
- Validates owner/plan/modules
- Creates tenant row with status="provisioning"
- Enqueues tenantLifecycleJobs
- Returns 202 Accepted

### Module Resolution
**File:** `apps/api/src/lib/module-stacks.ts:62-67`
- resolveTenantModules() defaults to ["accounting"]
- Determines stack type:
  - shouldProvisionFinanceStack(modules) → accounting ∈ modules
  - isPosOnlyModules(modules) → pos ∈ modules AND accounting ∉ modules
  - hasAccountingAndPos(modules) → both present

### Provision Runtime
**File:** `apps/api/src/lib/provision-runtime.ts:60-225`
- Loads journal state to resume (idempotent recovery)
- Executes 8 operations with markOp() idempotency:
  1. Create tenant in Postgres
  2. Allocate port
  3. Write environment variables
  4. Start Finance container
  5. Bootstrap Finance (create org, user, accounts)
  6. Seed default data (COA, walk-in, items)
  7. Start POS container (if pos ∈ modules)
  8. Wire integration (if both modules)

### Journal Persistence
**File:** `apps/api/src/db/migrations/` (tenantProvisionEvents table)
- Tracks phase + operation key
- Prevents re-execution (idempotency)
- Stores encrypted secrets (staff credentials)

### Readiness Engine
**File:** `apps/api/src/lib/readiness-engine.ts:92-247`
- Runs 8 sequential checks (2s cache):
  1. Job completed (tenantLifecycleJobs.status)
  2. Tenant exists in Postgres
  3. Deployment valid (container health)
  4. Tenant responds /api/ping
  5. bootstrap_admin event published
  6. edge.publish event (Caddy routing)
  7. financeTenantId present
  8. Finance license synced
- Returns NOT_READY | DEGRADED | READY

---

## 4. Provisioning Algorithm (Ideal)

**Atomic Per-Module Provisioning with Rollback**

Design Principles:
1. Atomic per-module transactions (all-or-nothing commits)
2. Clear module boundaries (Finance/POS/PMS/Chat isolation)
3. Idempotent operations (safe re-run via journal)
4. Explicit rollback (cleanup on failure)
5. Terminal states ("success", "failed", "partial")
6. Module-gated readiness (don't check Finance for POS-only)
7. Auto-sync org modules (sub-orgs inherit parent)

Ideal Flow:
```
PHASE A: Validate & Lock (Atomic)
  - Tenant exists, plan active, modules in license, port available
  - Advisory lock acquired
  → FAILED if any check fails

PHASE B: Finance Stack (if accounting ∈ modules, Atomic)
  - MySQL + Redis containers
  - Bootstrap admin, seed COA/Walk-In/Accounts/Items
  - Health check
  → tenant.finance_ready OR FAILED

PHASE C: POS Stack (if pos ∈ modules, Atomic)
  - Crunch container, bootstrap org, staff credentials
  - Health check
  → tenant.pos_ready OR FAILED

PHASE D: Integration (if both modules, Atomic)
  - Wire GL accounts, POS→Finance API
  - Verify health
  → tenant.integration_ready OR FAILED

PHASE E: Publish & Email (Async, Fire-and-Forget)
  - Publish Caddy/Traefik routing
  - Send welcome emails
  → tenant.published OR log non-fatal

FINAL STATUS: READY (all success) | PARTIAL (some success) | FAILED (core phase failed)
```

---

## 5. Gap Analysis

**Ranked by Severity:**

| # | Gap | Severity | Description | Impact | File Reference |
|---|-----|----------|-------------|--------|---|
| 1 | 🚨 add_module job handler missing | CRITICAL | POST /add-module enqueues type="add_module" job but provision-runtime never processes it; Finance/POS stack never re-provisions for new module | Tenants licensed for module but stack never starts; upgrade fails silently | `routes/tenants.ts` (enqueue) vs `provision-runtime.ts:60-225` (no handler) |
| 2 | 🚨 No explicit rollback on failure | CRITICAL | If Finance bootstrap fails, tenant row exists but Finance org doesn't; no cleanup triggered; tenant stuck in "provisioning" | Zombie tenant state; manual intervention required | `provision-runtime.ts:60-225` (no rollback logic) |
| 3 | Readiness checks not gated by module | HIGH | getTenantReadiness() runs all 8 checks regardless of modules provisioned; POS-only tenant waits for Finance health check (never triggers) | POS-only tenants may fail READY status blocking access | `readiness-engine.ts:92-247` (checks all 8 regardless of module) |
| 4 | No "failed" terminal state | HIGH | Tenant stuck in "provisioning" indefinitely if provision-runtime crashes; no automatic transition to "failed" | Indefinite stuck state; user must manually check logs | `tenants` schema (status enum missing "failed") |
| 5 | Module enforcement only at add-time | HIGH | validateLicenseModulesForTenant() runs only during /add-module; no guard prevents org-level access to unlicensed module | Security risk: org could access module if permission check fails elsewhere | `license-utils.ts:34-60` (only at add-module, not at route-access time) |
| 6 | Org provisioning doesn't sync parent modules | MEDIUM | Sub-org modules hardcoded at enqueue time (org-provision.ts:98); if parent adds module later, sub-org doesn't inherit | Sub-org isolated from parent module upgrades | `org-provision.ts:98` (modules hardcoded at enqueue) |
| 7 | Caddy/Traefik publish is fire-and-forget | MEDIUM | edge.publish event logged but no retry if publish fails; tenant marked READY but route unreachable | Route not accessible even after READY | `readiness-engine.ts:78-90` (checks event but no retry) |
| 8 | POS credentials in journal indefinitely | MEDIUM | Default credentials encrypted in tenantProvisionEvents.secret; no rotation/TTL; credentials in audit log | Credentials exposed longer than necessary | `provision-runtime.ts` (stores staff credentials in journal) |

---

## 6. License & Plan Audit

**Plans Defined:**
- **File:** `apps/api/src/license-utils.ts:150-174`
- **Function:** getPlanLimits() returns maxOrganizations, maxActivations, maxUsers
- **Defaults:** 1, 1, 999 (maxOrganizations=1, maxActivations=1, maxUsers=999)

**Plan → Module Mapping:**
- License.modules must contain all tenant.modules
- Validated at add-module time via validateLicenseModulesForTenant()
- **File:** `license-utils.ts:34-60`

**Enforcement Gaps:**
- No module-level enforcement on org routes (only at provision time)
- No runtime guard preventing access to unlicensed feature
- License validation only at /add-module, not at feature access time

**Missing Guards:**
- Org-level module enforcement on feature routes (Gap #5)
- Runtime feature gates per org module
- Module access checks on Accounting/POS endpoints

---

## 7. Email Audit Table

| Email | Trigger | Template File | Branded | SMTP | Sends | Notes |
|---|---|---|---|---|---|---|
| Tenant Welcome | Provision completes | `mail/templates/send.ts:115-131` | Yes (custom branding) | ✅ Resend | ✅ Yes | sendTenantWelcomeEmail() |
| Finance Welcome | Accounting ready | `send.ts:133-166` | Yes | ✅ Resend | ✅ Yes | Includes bootstrap OTP |
| POS Welcome | POS ready | `send.ts:177-203` | Yes | ✅ Resend | ✅ Yes | Includes staff default credentials |
| Owner Invite | Owner invited | `send.ts:50-74` | Yes | ✅ Resend | ✅ Yes | sendOwnerInviteEmail() |
| License Activated | License assigned | `send.ts:208-240` | Yes | ✅ Resend | ✅ Yes | sendLicenseActivatedEmail() |
| Provision Complete (Owner) | All ready | `send.ts:328-359` | Yes | ✅ Resend | ✅ Yes | Final confirmation |
| License Expiring | 30/7/1 day before | `send.ts:361-409` | Yes | ✅ Resend | ✅ Yes | sendLicenseExpiringEmail() |
| License Expired | Expiry date | `send.ts:411-449` | Yes | ✅ Resend | ✅ Yes | sendLicenseExpiredEmail() |
| Password Reset | Reset requested | `send.ts:76-97` | Yes | ✅ Resend | ✅ Yes | sendOwnerPasswordResetEmail() |
| Password Changed | Changed | `send.ts:99-113` | Yes | ✅ Resend | ✅ Yes | sendPasswordChangedEmail() |

**Email Flow:** send.ts → mailer.ts (idempotencyKey prevents dups, logs to emailLogs table) → Resend SMTP
**SMTP Status:** ✅ Resend configured and working; all emails routed through Resend SDK (mailer.ts)

---

## 8. Multi-Tenancy Audit

**Subdomain Routing:**
- **Generation:** `tenants.ts:1871-1873` → pickUniqueOrganizationSlug()
- **Format:** ${slug}.${rootDomain}
- **Root domain:** `organization-domain.ts` → rootDomainForOrganizationSubdomain()
- **Publication:** `readiness-engine.ts:78-90` checks for edge.publish event; worker writes Caddy YAML

**Tenant Isolation:**
- Advisory lock per tenant (`provision-runtime.ts:54-55` withTenantProvisionAdvisoryLock)
- No data race on tenant row
- Finance tenant ID stored separately (prevents cross-tenant leakage)
- Each org has isolated database credentials

**Caddy Dynamic Config:**
- Worker service writes Caddy config during provision
- readiness-engine checks for event before marking READY
- ⚠️ No retry if publish fails (fire-and-forget, Gap #7)
- Route becomes accessible only after tenant is READY

---

## 9. Production Readiness Checklist

### Environment Variables
- [✅] All provisioning env vars documented (MODULE_GATING, POS_PLATFORM_API_KEY, INTERNAL_API_SECRET, etc.)
- [❌] Hardcoded localhost URLs still present (check provision-runtime.ts for Docker host resolution)
- [✅] Production SMTP configured (Resend SDK)
- [✅] Subdomain wildcard SSL working (Caddy handles)

### Database
- [✅] Migrations run on deploy (tenantLifecycleJobs, tenantProvisionEvents tables)
- [⚠️] Seed scripts idempotent (markOp() prevents re-execution but no explicit rollback)
- [❌] Rollback on failed provisioning (missing; zombie state possible)

### Security
- [✅] Tenant data isolation verified (advisory locks + separate Finance tenant ID)
- [✅] License keys validated server-side (license-utils.ts:34-60)
- [⚠️] Plan enforcement on all protected routes (org-level enforcement missing)

---

## 10. Broken Items — Priority Fix List

| # | Item | Module | Severity | Effort | Notes |
|---|---|---|---|---|---|
| 1 | 🚨 Implement add_module job handler | All | CRITICAL | L | Enqueue works but provision-runtime doesn't process type="add_module"; need: new runAddModuleStep() that re-provisions Finance/POS stacks for new module |
| 2 | 🚨 Add explicit rollback on provision failure | All | CRITICAL | M | If Finance bootstrap fails, mark with markOp("FAILED"), trigger cleanup, transition tenant.status to "failed" instead of stuck "provisioning" |
| 3 | Module-gate readiness checks | All | HIGH | S | readiness-engine.ts: skip Finance checks if accounting ∉ tenant.modules; skip POS checks if pos ∉ tenant.modules |
| 4 | Add "failed" terminal state | All | HIGH | S | tenants schema: add status="failed" as enum; transition on provision error; getTenantReadiness() returns NOT_READY for failed tenants |
| 5 | Add org-level module enforcement | All | HIGH | M | Add guard on feature routes: check org.modules includes feature; prevent access to unlicensed module |
| 6 | Sync sub-org modules to parent | All | MEDIUM | M | org-provision.ts: read tenant.modules dynamically at provision time instead of hardcoding at enqueue |
| 7 | Add retry for Caddy publish | All | MEDIUM | M | readiness-engine.ts: wrap edge.publish check with retry logic (exponential backoff, max 3 attempts) |
| 8 | Add POS credential rotation | All | MEDIUM | M | provision-runtime.ts: generate new staff credentials at interval; mark old ones as deprecated; clean up from journal after X days |

**Severity:** CRITICAL (blocks production) / HIGH (major issue) / MEDIUM (should fix) / LOW (nice-to-have)  
**Effort:** XS (< 1 hour) / S (1-4 hours) / M (4-16 hours) / L (16-40 hours) / XL (40+ hours)

---

## 11. Missing Items — Need to Build

| # | Item | Module | Priority | Notes |
|---|---|---|---|---|
| 1 | Module upgrade workflow UI | Webapp | HIGH | Owner should be able to trigger "Add Accounting" or "Add POS" from dashboard; currently hidden or admin-only |
| 2 | Provision status dashboard | Admin | HIGH | Show which tenants are stuck in "provisioning"; which failed; which are READY; list all jobs in queue |
| 3 | Rollback/retry admin tool | Admin | HIGH | Ability to manually re-trigger provision-runtime for failed job or manually mark as READY after manual fix |
| 4 | Provision audit log viewer | Admin | MEDIUM | Display tenantProvisionEvents journal; trace which step failed; show encrypted credentials (masked) |
| 5 | Module enforcement policy enforcement | Webapp | MEDIUM | Add feature gates to UI per org module; disable Accounting tabs if not in license |
| 6 | Credential rotation policy | Ops | MEDIUM | Auto-rotate POS staff pins weekly; notify admin of changes |

---

## 12. Recommendations

**Priority Order for Production Readiness:**

### 1. IMMEDIATE (before any multi-tenant deployment)

- **Fix Gap #1 (add_module handler):** Module upgrades will fail silently otherwise. Implement runAddModuleStep() in provision-runtime.ts to handle type="add_module" jobs.
- **Fix Gap #2 (rollback):** Provision failures will leave zombie tenants. Add explicit rollback logic:
  - Mark operation as FAILED via markOp("FAILED")
  - Trigger cleanup (remove containers, revert database)
  - Transition tenant.status to "failed"

### 2. BEFORE LAUNCH (before public signups)

- **Fix Gap #3 (readiness module-gating):** POS-only tenants will fail to become READY. Modify readiness-engine.ts:
  - Skip Finance checks if accounting ∉ tenant.modules
  - Skip POS checks if pos ∉ tenant.modules
  - Only check published modules
- **Add "failed" terminal state:** Required to detect stuck tenants. Update tenant schema to include status="failed".
- **Build provision status dashboard:** Required for ops monitoring. Show queue, stuck tenants, failed jobs, retry buttons.

### 3. BEFORE SCALE (before 50+ concurrent tenants)

- **Fix Gap #5 (org module enforcement):** Required for multi-org security. Add route-level guards:
  - Check org.modules includes feature
  - Return 403 FORBIDDEN for unlicensed access
- **Add Caddy retry logic:** Route reliability at scale. Wrap edge.publish check with exponential backoff (max 3 attempts).
- **Build credential rotation:** Credential hygiene for compliance. Auto-rotate POS staff pins weekly, notify admin.

### 4. ONGOING MAINTENANCE

- **Fix Gap #6 (sub-org module sync):** Dynamic module inheritance from parent org.
- **Fix Gap #7 (Caddy publish retry):** Already in "Before Scale" but critical for reliability.
- **Fix Gap #8 (credential rotation):** Already in "Before Scale" but critical for security.

---

**Production Go-Live Checklist:**
- [ ] add_module handler implemented and tested (Gap #1)
- [ ] Rollback logic implemented (cleanup + "failed" state) (Gap #2)
- [ ] Readiness checks gated by module (Gap #3)
- [ ] "failed" terminal state added (Gap #4)
- [ ] Provision status dashboard live
- [ ] Monitoring alerts for stuck tenants (status="provisioning" > 5min)
- [ ] Runbook for manual provision recovery
- [ ] Load test with 15+ concurrent provisions
- [ ] Failover test (kill Finance container during provision, verify rollback)

---

**Investigation complete:** 2026-05-30  
**Status:** Ready for implementation prioritization  
**Next step:** Begin with CRITICAL fixes (#1, #2) before production deployment
