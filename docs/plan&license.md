# Plans & License System — Complete Audit & Repair

Check every detail: schema, API, enforcement, UI, expiry, unlimited vs dated.

**Reference:** `docs/PROVISIONING_REFERENCE.md`, `docs/FUNCTIONAL_AUDIT.md`

**Workflow:** Read-only first pass → map every gap → apply fixes → verify → output `LICENSE_SYSTEM_AUDIT.md`

---

## BLOCK 1 — SCHEMA AUDIT

### 1.1 Plans table

```bash
grep -A 80 "plans.*pgTable\|export const plans" packages/db/src/schema.ts | head -80
ls packages/db/drizzle/ | grep -i "plan\|license\|billing"
cat packages/db/drizzle/0025_plans_billing_fields.sql
cat packages/db/drizzle/0035_plans_max_users.sql
```

Document every column: name, slug, description, maxOrganizations, maxActivations, maxUsers, pricing, billingInterval, isActive, isPublic, sortOrder, features.

### 1.2 Licenses table

```bash
grep -A 120 "licenses.*pgTable\|export const licenses" packages/db/src/schema.ts | head -120
grep -A 40 "licenseHistory\|license_history" packages/db/src/schema.ts | head -40
```

Document: licenseKey format, status values, modules, planSlug, tenantId, expiresAt, isPerpetual, gracePeriodDays, limits, revocation fields.

### 1.3 Unlimited vs dated logic

```bash
grep -rn "isPerpetual\|expiresAt\|unlimited" apps/api/src/license-utils.ts apps/api/src/license-http.ts apps/api/src/license-expire-followup.ts
grep -n "expireDueLicenses\|gracePeriod" infra/worker-service/src/worker.ts apps/api/src/license-expire-followup.ts
```

---

## BLOCK 2 — LICENSE API AUDIT

### 2.1 Generate endpoint

Read `apps/api/src/license-http.ts` — `POST /licenses/generate`. Document defaults, plan requirement, RBAC.

### 2.2 Assign endpoint

Document plan limit copy, duplicate-license policy.

### 2.3 Extend / revoke / suspend

Document Finance sync, POS suspend, activation deactivation.

### 2.4 `getPlanLimits()` — `apps/api/src/license-utils.ts`

### 2.5 Finance sync — `apps/api/src/finance-license.client.ts`

---

## BLOCK 3 — LICENSE ENFORCEMENT AUDIT

### 3.1 Finance — `LicenseGuard.middleware.ts`, org/user limits

### 3.2 POS — `requireActiveOrganization.js`, `LICENSE_ENFORCEMENT_MODE`

### 3.3 Control plane — provision blocks, plan activation checks

---

## BLOCK 4 — LICENSE EXPIRY SYSTEM AUDIT

### 4.1 Expiry worker — `worker.ts`, `license-expire-followup.ts`

### 4.2 Expiry emails — `apps/api/src/mail/send.ts`

### 4.3 Unlimited / provision auto-license — `apps/api/src/index.ts`

---

## BLOCK 5 — DASHBOARD UI AUDIT

### 5.1 Plans page — `apps/dashboard/app/(dashboard)/plans/page.tsx`

### 5.2 Generate dialog — `apps/dashboard/components/license-generate-dialog.tsx`

### 5.3 Tenant detail license section — `apps/dashboard/app/(dashboard)/tenants/[id]/page.tsx`

---

## BLOCK 6 — AUTO-LICENSE ON PROVISION

Read auto-license block in `apps/api/src/index.ts` and `infra/worker-service/src/provision-runtime.ts` sync.

---

## BLOCK 7 — KNOWN GAPS CHECKLIST

| Gap | Check |
|-----|-------|
| G2 | `maxUsers` on plans |
| G3 | `maxOrganizations` sync to Finance on provision |
| G10 | Generate dialog modules (not accounting-only default) |
| — | Unlimited toggle in generate UI |
| — | Grace period UI |
| — | Plan limits on auto-license |
| — | `isPerpetual=false` without `expiresAt` rejected at API |
| — | 30-day expiry warning window |
| G9 | POS license window vs Stockix license |

---

## BLOCK 8 — FIXES (apply after audit)

See `LICENSE_SYSTEM_AUDIT.md` → **Gaps Fixed** and **Still Outstanding** for what was applied in this pass.

---

## STEP 9 — VERIFY

```bash
cd packages/db && npx tsc --noEmit
pnpm db:migrate
cd apps/api && npx tsc --noEmit && pnpm test
cd apps/dashboard && npx tsc --noEmit
cd services/stockix-finance/packages/server && npx tsc --noEmit
cd infra/worker-service && npx tsc --noEmit
```

---

## CRITICAL RULES

- `isPerpetual=true` must ALWAYS skip expiry worker
- `expiresAt=null` without `isPerpetual=true` is a bug — validate at generate
- `maxOrganizations` must reach Finance on EVERY license sync
- Expiry emails must be idempotent (mail idempotency keys)
- Auto-license on provision must be `isPerpetual=true` by default
- Grace period must block writes not reads (Finance); POS suspend only after grace
- Modules on license must match modules on tenant record
- All TypeScript checks must pass before finishing
