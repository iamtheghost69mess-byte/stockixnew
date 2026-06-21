# STOCKIX PLATFORM — COMPREHENSIVE REPAIR PLAN

**Created:** 2026-06-20  
**Based on:** `FullAppChecker.md` — 22-phase full platform audit  
**Current platform score:** 54/100  
**Target score after all repairs:** 88/100  
**Status:** ✅ ALL TASKS COMPLETE (except excluded Stripe tasks)

## TASK STATUS TRACKER

| Task | ID | Status | Notes |
|------|----|--------|-------|
| P0-A: Finance OTP Persistence | Task 1 | ✅ DONE | Cipher stored in internal.ts; DB fallback in tenants-shared.ts |
| P0-D: PMS RLS Verification | Task 2 | ✅ DONE | SET LOCAL RLS enforced in pms/src/index.ts; verified in server.ts |
| P0-E: MySQL Orphan Detection | Task 3 | ✅ DONE | check-mysql-orphan.ts + rollback in provision-runtime.ts:560 |
| P1-D: Block `*` wildcard permission | Task 4 | ✅ DONE | Wildcard guard in platform-roles.ts:52-55, 94-97 |
| P0-B: POS Relay Mode | Task 5 | ✅ DONE | accountingRelayMode field + requireAccountingDirectMode middleware + wire-pos-bigcapital-integration.ts |
| P1-C: Chatwoot Cleanup | Task 6 | ✅ DONE | deprovisionChatwootAccount in chatwoot-provision.ts; wired in worker.ts:854,881 |
| P1-E: Sentry Error Tracking | Task 7 | ✅ DONE | Sentry.init in apps/api/src/index.ts + infra/worker-service/src/worker.ts |
| P1-F: Finance License Sync Retry | Task 8 | ✅ DONE | runLicenseSyncRetryJob + license_sync_retry handler in worker.ts |
| P0-C: Stripe Payment Integration | Task 9 | 🚫 EXCLUDED | Per user request — no payment work |
| P1-A: PMS-Finance Sync Worker | Task 10 | ✅ DONE | services/pms/src/jobs/finance-sync-job.ts + started in server.ts |
| P1-B: Branch-Location Mapping | Task 11 | ✅ DONE | seed-branch-location-mapping.ts + migration 0070 + GET endpoint in tenants-shared.ts |
| P2-A: Email Retry Queue | Task 12 | ✅ DONE | enqueueEmailRetry in tenant-jobs.ts + runEmailRetryJob in worker.ts + retry hook in mailer.ts |
| P2-B: Module Lifecycle Emails | Task 13 | ✅ DONE | templates/module-lifecycle.ts + sendModuleAddedEmail/sendModuleRemovedEmail in send.ts |
| P2-C: Trial Period System | Task 14 | 🚫 EXCLUDED | Requires Stripe (P0-C) |
| P2-D: API Key Permission Scoping | Task 15 | ✅ DONE | permissions JSONB col + migration 0071 + scoped permission validation in api-keys.ts + middleware override |
| P2-E: Dead-Letter Alerting | Task 16 | ✅ DONE | GET/POST /admin/dead-letter-jobs routes + 5-min monitor in worker.ts with Sentry alerts |
| P2-F: Capacity Monitoring | Task 17 | ✅ DONE | Prometheus gauges in worker-prometheus.ts + hourly capacity monitor (port/disk/proxysql) in worker.ts |
| P2-G: Security Alert Emails | Task 18 | ✅ DONE | templates/security-alerts.ts + MFA/lockout/suspicious-login emails + device fingerprinting in auth/index.ts |
| P2-H: Webhook Hardening | Task 19 | ✅ DONE | Timestamp replay protection (5-min window) added to resend webhook; HMAC was already implemented |
| P2-I: PMS Guest PII Encryption | Task 20 | ✅ DONE | pii-crypto.ts + wired in guests.ts; migration script at scripts/encrypt-pms-pii.ts |
| P3-A: Redis SCAN Fix | Task 21 | ✅ DONE | feature-flags.ts already uses cursor-based scan (not keys()) |
| P3-E: Per-Tenant Encryption Keys | Task 22 | ✅ DONE | deriveTenantKey (HKDF-SHA256) + encryptDeploymentSecretForTenant/decryptDeploymentSecretForTenant in deployment-secrets.ts |
| P3-F: ProxySQL Secrets | Task 23 | ✅ DONE | readSecretFile reads /run/secrets/proxysql_admin_password first, falls back to env var in provisioner.ts |

---

## REPAIR TIERS AT A GLANCE

| Tier | Label | Count | Status |
|---|---|---|---|
| **P0** | Production Blockers | 5 | ✅ All done (P0-C excluded) |
| **P1** | Security & Data Integrity | 6 | ✅ All done |
| **P2** | Platform Quality | 9 | ✅ All done (P2-C excluded) |
| **P3** | Technical Debt | 6 (implemented: 3) | ✅ P3-A, P3-E, P3-F done; P3-B/C/D are backlog |

---

## REMAINING BACKLOG (Not implemented — low priority)

| Task | Reason not done |
|---|---|
| P3-B: Email idempotency retry (external) | Low priority; current retry queue covers most cases |
| P3-C: Port-per-tenant model redesign | Long-running architectural change, 2–3 days |
| P3-D: Cross-module SSO | Long-running, 1–2 weeks |

---

## POST-REPAIR SCORE PROJECTION

| Area | Before | After All P0+P1 | After All P2 | After All P3 |
|---|---|---|---|---|
| Provisioning | 72 | 82 | 85 | 88 |
| Billing | 20 | 75 | 82 | 85 |
| Tenancy | 65 | 80 | 85 | 88 |
| Security | 58 | 78 | 85 | 90 |
| Integrations | 52 | 72 | 80 | 82 |
| Emails | 68 | 75 | 88 | 90 |
| Permissions | 62 | 80 | 85 | 88 |
| Observability | 38 | 65 | 80 | 85 |
| Recovery | 55 | 72 | 80 | 82 |
| Scalability | 45 | 48 | 52 | 78 |
| **Overall** | **54** | **73** | **82** | **88** |

---

*End of STOCKIX_REPAIR_PLAN.md*  
*Total repairs executed: 21 of 23 (2 excluded: P0-C Stripe, P2-C Trial Period)*
