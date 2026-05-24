# Implementation Plan — Bigcapital SaaS Gaps

**Last updated:** Tuesday, May 20, 2026

---

## Completed

- Tasks 1–10 (signup, wizard, license, users API, org number, switcher, COA copy, license UI, LemonSqueezy)
- **Gap closure pass:** owner dashboard Users UI, sub-org settings copy, worker rebuild, dev migrations, API tests
- **Partials / go-live pass:** wizard redirect (no congrats), AuthMeta docs, `onConflict` COA copy, license log no-op, Jest config fix, 91+21 automated tests

---

## Remaining (operations only — live environments)

| # | Item | Action |
|---|------|--------|
| 1 | Staging/prod migrations | `pnpm db:migrate` + finance `cli:system:migrate:latest` + `cli:tenants:migrate:latest` |
| 2 | Worker redeploy | Deploy after `pnpm infra:worker:build` |
| 3 | Manual staging QA | [docs/STAGING_VERIFICATION.md](docs/STAGING_VERIFICATION.md) |

---

## Rules

- Read [accountmissing2.md](accountmissing2.md) before new work
- Migrations backward compatible; new endpoints include curl examples in comments
- TypeScript strict; follow existing DI patterns
