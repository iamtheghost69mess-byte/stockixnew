# Secret rotation runbook — git history exposure

**Created:** 2026-05-26  
**Trigger:** `.env` and related env files appeared in git history.

## Exposure scope (from `git log`)

| Path | Commits |
|------|---------|
| `.env` | `9c0184ad`, `4b5a2e61`, `a730543a` (removed in `09a7152d`) |
| `infra/prod/.env` | `9c0184ad`, `4b5a2e61`, `09a7152d` |
| `apps/api/.env` | (none in sampled history) |
| `apps/dashboard/.env` | (none in sampled history) |
| `services/stockix-finance/.env` | `4b2539c2`, `4b5a2e61`, `09a7152d` |

Inspect each commit (do **not** paste values into tickets):

```bash
git show <commit-hash>:.env
git show <commit-hash>:infra/prod/.env
```

## Rotation checklist

Rotate **every** value that was ever committed. Generate new values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Secret | Action |
|--------|--------|
| `DATABASE_URL` / Postgres password | `ALTER USER` + update all compose env |
| `SESSION_SECRET` | New 64-char hex |
| `PLATFORM_API_SECRET` | New 64-char hex |
| `WORKER_SECRET` | New 32+ char hex |
| `AUTH_TOKEN_SECRET` | New 64-char hex |
| `DEPLOYMENT_SECRET_KEY` | New 64-char hex |
| `LICENSE_SIGNING_SECRET` | New ≥32 char string; **re-sync all POS tenant envs** |
| `RESEND_WEBHOOK_SECRET` | Regenerate in Resend dashboard |
| `RESEND_API_KEY` / `MAIL_PASSWORD` | Regenerate in Resend |
| `CLOUDFLARE_API_TOKEN` | Regenerate in Cloudflare |
| `CHATWOOT_SECRET_KEY_BASE` / `CHATWOOT_DB_PASSWORD` | Regenerate |
| Per-tenant `INTERNAL_API_SECRET` | Rotate per tenant stack under `TENANT_ENV_ROOT` |

## Production steps

1. Update `infra/prod/.env` on the server (never commit).
2. `pnpm env:sync-prod` if using root `.env` fallback.
3. Invalidate sessions:
   ```sql
   UPDATE owners SET session_version = session_version + 1;
   ```
4. Redeploy: `docker compose --env-file .env up -d --build api dashboard infra-worker`
5. Re-clone or `git fetch && git reset --hard origin/main` after history purge.

## Git history purge (coordinate with team)

```bash
# BFG: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin --force --all
git push origin --force --tags
```

## Verification

```bash
grep -r "OLD_SECRET_VALUE" .   # 0 matches after rotation
git log --oneline -- .env      # empty after BFG
```

## CI prevention

`.github/workflows/secret-scan.yml` runs gitleaks on every push/PR.
