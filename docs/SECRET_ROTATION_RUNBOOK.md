# Secret Rotation Runbook

## When to rotate

- `.env` committed to git history (current incident — see `infra/prod/OPERATIONS.md`)
- Team member offboarded
- Security incident
- Annual policy rotation

## Generate new secrets

64-byte hex (session, API secrets):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

32-byte hex (shorter keys):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use the repo helper:

```bash
node scripts/generate-env-secrets.js
```

## Rotation checklist

### Step 1 — Generate and record new values

- [ ] `DATABASE_URL` / Postgres password
- [ ] `SESSION_SECRET` (128+ char hex)
- [ ] `PLATFORM_API_SECRET`
- [ ] `WORKER_SECRET`
- [ ] `AUTH_TOKEN_SECRET`
- [ ] `DEPLOYMENT_SECRET_KEY`
- [ ] `LICENSE_SIGNING_SECRET` (min 48 chars; sync to every POS tenant stack)
- [ ] `INTERNAL_API_SECRET` (per-tenant Finance `.env` where used)
- [ ] `RESEND_WEBHOOK_SECRET` (Resend dashboard → Webhooks → signing secret)
- [ ] `MAIL_PASSWORD` (Resend API key for SMTP)
- [ ] `CF_DNS_API_TOKEN` (Cloudflare API token)
- [ ] `BACKUP_B2_*` (Backblaze application key if compromised)
- [ ] `CHATWOOT_API_ACCESS_TOKEN` (after Chatwoot admin login)

### Step 2 — Update production server only

```bash
ssh deploy@<EC2_HOST>
nano /opt/stockix/stockixnew/infra/prod/.env
# Update every rotated value — never commit this file
pnpm env:sync-prod --confirm-server
```

### Step 3 — Invalidate active owner sessions

```sql
UPDATE owners SET session_version = COALESCE(session_version, 0) + 1;
```

### Step 4 — Restart control plane

```bash
cd /opt/stockix/stockixnew/infra/prod
docker compose --env-file .env up -d --build api api-bullmq infra-worker dashboard
```

### Step 5 — Verify

```bash
curl -fsS "https://api.${ROOT_DOMAIN}/ready"
```

Re-sync `LICENSE_SIGNING_SECRET` to all POS tenant env files under `TENANT_ENV_ROOT`.

### Step 6 — Purge git history (coordinate with team)

**Warning:** force-push required. All developers must re-clone or hard-reset after this.

```bash
# BFG Repo-Cleaner — https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files ".env" --no-blob-protection
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push origin --force --all
git push origin --force --tags
```

After force push, each developer:

```bash
git fetch origin && git reset --hard origin/main
```

### Step 7 — Record completion

In `infra/prod/OPERATIONS.md` header:

```text
SECRETS ROTATED: YYYY-MM-DD — all credentials replaced after git history exposure
Rotated by: <name>
Verified by: <name>
```

## Prevention

- `scripts/git-hooks/pre-commit-env-block.sh` — install via `bash scripts/install-pre-commit-env-hook.sh`
- `.github/workflows/secret-scan.yml` — Gitleaks on every push/PR
- Never store secrets in source — use `infra/prod/.env` on the server only
