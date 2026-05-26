# Section 2.3 — License enforcement in POS (manual E2E)

Code paths: `apps/api/src/pos-license-sync.ts`, `services/posnew/apps/pos-backend` (`patchOrgLicense`, `requireActiveOrganization`, `stxiLicenseValidate.js`).

**Prerequisites:** Staging control plane + POS linked tenant; `LICENSE_SIGNING_SECRET` identical on API and POS (see `infra/prod/OPERATIONS.md`).

## Suspend / reactivate → POS lifecycle

- [ ] From dashboard, suspend an active license for a tenant with POS module and linked `posOrganizationId`.
- [ ] API response includes `posSync: "ok"` (or `failed` with `errors` containing `pos:` if POS is stopped).
- [ ] POS org `lifecycle` is `suspended` (`GET /api/platform/v1/organizations/:id` or Mongo).
- [ ] Reactivate license; POS org lifecycle returns to `active`.
- [ ] Optional negative: set `LICENSE_SYNC_STRICT=1` on API, stop POS proxy, suspend again → HTTP `502` `license_sync_failed`.

## STXI key sync and enforcement

- [ ] Generate or assign STXI license with `scopedLocationId` for tenant + location.
- [ ] POS org document has `licenseKey`, `stockixTenantId`, `scopedLocationId` (via platform `PATCH .../license`).
- [ ] PIN login at **matching** location succeeds.
- [ ] PIN login at **different** location returns `403` with `code: license_key_invalid` (or `license_key_location_required` when location unknown).
- [ ] Wrong checksum / tampered key → `license_key_invalid`.
- [ ] `GET .../organizations/:id/provisioning-status` shows `licenseKeyValidForDefaultLocation: true` when key matches default/scoped location.

## Automated tests (repo)

```bash
cd apps/api && npx vitest run tests/license-suspend.test.ts tests/pos-license-sync.test.ts
cd services/posnew/apps/pos-backend && node --test tests/unit/stxi-license-validate.test.js tests/unit/organization-lifecycle-access.test.js
npm run test:saas-integration   # record pass/fail + date below
```

| Run | Date | Result | Notes |
|-----|------|--------|-------|
| `test:saas-integration` | | | |
