# Deploy Repair Report

**Date:** 2026-05-28  
**Scope:** Production deploy SSH script, env loading, pnpm non-interactive install, rollback

## Every issue found

| # | Issue | Severity | File | Fix applied |
|---|-------|----------|------|-------------|
| 1 | `source infra/prod/.env` executes semicolons in values (e.g. `SECURITY_HSTS`) | CRITICAL | `deploy.yml` | `scripts/load-env-file.sh` + `. scripts/load-env-file.sh` |
| 2 | `pnpm install` prompts in non-interactive SSH (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR`) | CRITICAL | `deploy.yml`, `.npmrc` | `CI=true`, `rm -rf node_modules`, `confirm-modules-purge=false`, `--ignore-scripts` |
| 3 | `PREV_*` captured after trap but after migrate — rollback on early failure had no IDs | HIGH | `deploy.yml` | Save `PREV_*` immediately after `cd` repo, before `trap` |
| 4 | Rollback did not `exit 1` — job could appear successful | HIGH | `deploy.yml` | `rollback()` ends with `exit 1` |
| 5 | Rollback required all three `PREV_*` — partial rollback impossible | MEDIUM | `deploy.yml` | Per-image rollback if any `PREV_*` exists |
| 6 | Unquoted `SECURITY_*` in `.env.example` | HIGH | `infra/prod/.env.example` | Quoted `SECURITY_HSTS` and `SECURITY_CSP_BASE` |
| 7 | Staging deploy still used `source` + bare `pnpm install` | HIGH | `deploy-staging.yml` | Same safe env + pnpm pattern |
| 8 | `verify-stockix-server.sh` used `source .env` | MEDIUM | `scripts/verify-stockix-server.sh` | Uses `load-env-file.sh` |

## Already fixed (prior pass — verified)

| Item | Status |
|------|--------|
| Image tags `stockix-*:latest` in compose | OK |
| Self-contained Dockerfiles | OK |
| Image inspect before `up --no-build` | OK |
| No `docker builder prune` on every deploy | OK (removed earlier) |

## Files changed

- `.github/workflows/deploy.yml` — full remote script repair
- `.github/workflows/deploy-staging.yml` — safe env + pnpm
- `scripts/load-env-file.sh` — new safe loader
- `scripts/verify-stockix-server.sh` — use safe loader
- `.npmrc` — `confirm-modules-purge=false`
- `infra/prod/.env.example` — quoted security headers
- `infra/prod/OPERATIONS.md` — do not `source` prod `.env`

## Verification results

| Check | Result |
|-------|--------|
| No `source` in deploy workflows | PASS |
| No `:prod` in `infra/prod/docker-compose.yml` | PASS |
| `docker compose config` | PASS |
| Workflow YAML parse | PASS |
| Architecture boundaries | Run `pnpm lint:boundaries` on merge |

## Operator action on VPS

After pull, fix **live** `infra/prod/.env` if `SECURITY_HSTS` is still unquoted:

```bash
SECURITY_HSTS="max-age=31536000; includeSubDomains"
SECURITY_CSP_BASE="default-src 'self'; ..."
```

Or copy from updated `infra/prod/.env.example`.

## Verdict

**DEPLOY SHOULD WORK ON NEXT RUN** after merge, provided VPS `.env` uses quoted security values or the new loader is used (deploy no longer sources `.env`).
