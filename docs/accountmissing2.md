# Stockix Finance — Remaining Gaps

**Last updated:** Tuesday, May 20, 2026

> **All code gaps are closed.** Remaining work is **live staging/prod smoke tests** only.

**Related:** [MASTER_AUDIT.md](MASTER_AUDIT.md) · [docs/STAGING_VERIFICATION.md](docs/STAGING_VERIFICATION.md)

---

## Operator-only (before prod cutover)

| Item | Action |
|------|--------|
| Migrations on **staging/prod** | `pnpm db:migrate`; finance `cli:system:migrate:latest` + `cli:tenants:migrate:latest` |
| Worker **redeploy** | Deploy `infra/worker-service/.runtime/worker.js` |
| **Live E2E** | Unchecked rows in [docs/STAGING_VERIFICATION.md](docs/STAGING_VERIFICATION.md) |

---

## Deferred (out of scope)

| Item | Notes |
|------|--------|
| JWT license claims in finance token | Not required; `tenant_licenses` + `LicenseGuard` + boot meta |

---

*End of file.*
