TASK: Full provisioning audit across all three product modules.
Output a professional audit document saved as `docs/provchecker.md`.

═══════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════

This is a whitelabeled multi-tenant SaaS platform with three product modules:

  MODULE A — Standalone POS
  MODULE B — Standalone Accounting (BigCapital fork)
  MODULE C — Combined POS + Accounting

The platform runs on:
- NestJS/Express API
- Next.js frontend (dashboard + per-module apps)
- MongoDB
- Hostinger VPS (production)
- Caddy reverse proxy with subdomain routing
- Multi-tenant: each organization gets its own subdomain

Provisioning for Accounting (Module B) is reported as working.
Provisioning for POS (Module A) and Combined (Module C) status is UNKNOWN.

═══════════════════════════════════════════════════════════
PHASE 1 — CODEBASE AUDIT (READ ONLY, NO CHANGES YET)
═══════════════════════════════════════════════════════════

Scan the entire monorepo and locate every file related to:

1. PROVISIONING LOGIC
   - Organization creation / bootstrap
   - Tenant setup flows
   - Module assignment (which module does this org get?)
   - Plan / license assignment at signup
   - Default data seeding per module
     (default staff users, default accounts, default settings)
   - Subdomain creation / registration
   - Database setup per tenant

2. LICENSE & PLAN LOGIC
   - Plan definitions (what plans exist? free/trial/paid?)
   - Plan → module mapping (which plan unlocks which module?)
   - License key generation and validation
   - Plan enforcement (are there guards that block features
     if wrong plan?)
   - Upgrade/downgrade logic
   - Trial expiry logic

3. EMAIL NOTIFICATIONS
   - What emails are sent during provisioning?
   - What emails are sent when a module is added/upgraded?
   - Are email templates customized with platform branding
     or are they raw BigCapital defaults?
   - Is SMTP actually wired and working for each email type?
   - List every email trigger found in the codebase with
     its status (wired/broken/missing)

4. MODULE SWITCHING & EXPANSION
   - Can a Standalone POS org later add Accounting?
   - Can a Standalone Accounting org later add POS?
   - Is there a migration/upgrade path in the code?
   - What happens to existing data when a module is added?
   - Is there UI for the owner to upgrade their module?

5. MULTI-TENANCY & SUBDOMAIN
   - How are subdomains assigned per org?
   - Does Caddy config update dynamically or manually?
   - Can one subdomain org have multiple modules?
   - Is there isolation between tenants?
   - What happens if provisioning fails halfway?
     Is there a rollback?

6. PRODUCTION vs LOCAL DIFFERENCES
   - Are there any hardcoded localhost URLs?
   - Are environment variables properly split between
     local and production configs?
   - Are there any provisioning steps that only work
     locally but would fail in production? (file paths,
     ports, self-signed certs, etc.)
   - Is there a seed/migration that must run on first
     deploy that isn't documented?

═══════════════════════════════════════════════════════════
PHASE 2 — TEST SCENARIO MAPPING
═══════════════════════════════════════════════════════════

For each of the following scenarios, trace the full code
path from API call → database → email → frontend response.
Mark each step as: ✅ WORKING | ⚠️ PARTIAL | ❌ BROKEN | ❓ UNKNOWN

SCENARIO 1: New tenant signs up for Standalone POS
  - Org created
  - POS module provisioned
  - Default data seeded (staff, settings, menu categories)
  - Subdomain assigned
  - Welcome email sent
  - Owner can log in and access POS dashboard
  - Accounting is NOT accessible

SCENARIO 2: New tenant signs up for Standalone Accounting
  - Org created
  - Accounting module provisioned
  - Default accounts chart seeded
  - Default 5 staff users created (admin/manager/etc)
  - Subdomain assigned
  - Welcome email sent
  - Owner can log in and access Accounting dashboard
  - POS is NOT accessible

SCENARIO 3: New tenant signs up for Combined POS + Accounting
  - Org created
  - Both modules provisioned
  - All default data seeded for both modules
  - Subdomain assigned
  - Welcome email sent
  - Owner can access both dashboards
  - Data is shared (customers, items sync between modules)

SCENARIO 4: Standalone POS org upgrades to add Accounting
  - Upgrade triggered (by owner or by admin)
  - Accounting provisioned on existing org
  - Existing POS data preserved
  - Accounting default data seeded without overwriting
  - Notification email sent
  - New features unlocked in UI

SCENARIO 5: Standalone Accounting org adds POS
  - Same as Scenario 4 but reversed
  - Existing accounting data preserved
  - POS provisioned cleanly

SCENARIO 6: Provisioning failure / rollback
  - What happens if DB write fails mid-provisioning?
  - What happens if email fails to send?
  - Is the org left in a broken half-provisioned state?
  - Is there a retry mechanism?
  - Is there an admin tool to manually re-provision?

SCENARIO 7: Production deploy
  - Does provisioning work with real subdomains?
  - Does Caddy pick up new tenants without restart?
  - Are all env vars available in production that
    provisioning depends on?
  - Does email work in production SMTP config?

SCENARIO 8: Local development
  - Can a developer provision all 3 module types locally?
  - Are there mock/stub modes for email?
  - Are subdomains handled locally (hosts file / local DNS)?

═══════════════════════════════════════════════════════════
PHASE 3 — ALGORITHM DOCUMENTATION
═══════════════════════════════════════════════════════════

Write out the provisioning algorithm as it CURRENTLY EXISTS
in the code (not how it should work — what it actually does).
Use pseudocode + file references. Format:

  STEP 1: [what happens] → [file:line]
  STEP 2: [what happens] → [file:line]
  ...

Do this for each module type separately.
Then write the IDEAL algorithm showing what it should be.
Mark the delta between current and ideal as GAPS.

═══════════════════════════════════════════════════════════
PHASE 4 — EMAIL AUDIT
═══════════════════════════════════════════════════════════

For every email in the system, document:

  EMAIL ID: e.g. welcome_email
  TRIGGER: what event fires it
  TEMPLATE FILE: path to template
  BRANDING: custom UI? or raw BigCapital default?
  SMTP WIRED: yes/no
  ACTUALLY SENDS: yes/no/broken
  MISSING: what should be in this email that isn't

Known broken emails to verify:
  - User invitation email (reported broken, never reaches SMTP)
  - Invoice send email (To address not picked up)
  - Password reset email (reported working)
  - Welcome/onboarding email (unknown)
  - Module upgrade notification email (unknown/likely missing)
  - Trial expiry warning email (unknown/likely missing)

═══════════════════════════════════════════════════════════
PHASE 5 — OUTPUT: provchecker.md
═══════════════════════════════════════════════════════════

Create the file at: docs/provchecker.md

Structure it exactly as follows:

# Provisioning Audit — [Platform Name]
**Date:** [today]
**Audited by:** Cursor AI
**Status:** In Progress / Complete

---

## 1. Executive Summary
- What is working
- What is broken
- What is missing entirely
- Critical blockers before production
- Risk level per module (LOW / MEDIUM / HIGH / CRITICAL)

---

## 2. Module Status Matrix

| Scenario | Org Create | Module Provision | Data Seed | Subdomain | Email | Login | Status |
|---|---|---|---|---|---|---|---|
| Standalone POS | | | | | | | |
| Standalone Accounting | | | | | | | |
| Combined | | | | | | | |
| POS → Add Accounting | | | | | | | |
| Accounting → Add POS | | | | | | | |

Fill each cell with ✅ ⚠️ ❌ ❓

---

## 3. Provisioning Algorithm (Current)
[pseudocode per module with file references]

---

## 4. Provisioning Algorithm (Ideal)
[what it should look like]

---

## 5. Gap Analysis
[delta between current and ideal, ranked by priority]

---

## 6. License & Plan Audit
- Plans defined
- Plan → module mapping
- Enforcement gaps
- Missing guards

---

## 7. Email Audit Table

| Email | Trigger | Template | Branded | SMTP | Sends | Notes |
|---|---|---|---|---|---|---|

---

## 8. Multi-Tenancy Audit
- Subdomain routing
- Tenant isolation
- Caddy dynamic config

---

## 9. Production Readiness Checklist

### Environment Variables
- [ ] All provisioning env vars documented
- [ ] No hardcoded localhost URLs
- [ ] Production SMTP configured
- [ ] Subdomain wildcard SSL working

### Database
- [ ] Migrations run on deploy
- [ ] Seed scripts idempotent
- [ ] Rollback on failed provisioning

### Security
- [ ] Tenant data isolation verified
- [ ] License keys validated server-side
- [ ] Plan enforcement on all protected routes

---

## 10. Broken Items — Priority Fix List

| # | Item | Module | Severity | Effort | Notes |
|---|---|---|---|---|---|

Severity: CRITICAL / HIGH / MEDIUM / LOW
Effort: XS / S / M / L / XL

---

## 11. Missing Items — Need to Build

| # | Item | Module | Priority | Notes |
|---|---|---|---|---|

---

## 12. Recommendations
[ordered list of what to fix/build first]

═══════════════════════════════════════════════════════════
EXECUTION RULES
═══════════════════════════════════════════════════════════

- DO NOT modify any code during this audit
- DO NOT guess — if you cannot find the code for something,
  mark it ❓ UNKNOWN and note which file you expected it in
- DO reference exact file paths and line numbers for every
  finding
- If you find something critical and broken, flag it with
  🚨 at the top of that section
- When done with the audit, list the top 5 things that
  would prevent this from going to production right now
- Save the file and confirm the path