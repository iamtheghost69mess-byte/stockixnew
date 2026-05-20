# Production Deploy Checklist

Complete every item before going live. Check each box manually.

## Before First Deploy

### Secrets
- [ ] Generated fresh secrets with `node scripts/generate-env-secrets.js`
- [ ] `infra/prod/.env` has values different from `.env` (dev)
- [ ] Rotated leaked secrets from commit `09a7152d` if ever used in prod
- [ ] `SESSION_SECRET` is 64+ char hex
- [ ] `AUTH_TOKEN_SECRET` is 64+ char hex
- [ ] `LICENSE_SIGNING_SECRET` is 32+ char hex

### Manual Fields (required)
- [ ] `CF_DNS_API_TOKEN` — Cloudflare DNS API token set
- [ ] `MAIL_PASSWORD` — Resend API key set
- [ ] `ACME_EMAIL` — Real email for Let's Encrypt set
- [ ] `STOCKIX_REPO` — Correct server path set (`/opt/stockix/stockixnew`)

### Manual Fields (optional but recommended)
- [ ] `S3_ACCESS_KEY_ID` — Backblaze B2 key set (for file uploads)
- [ ] `S3_SECRET_ACCESS_KEY` — Backblaze B2 secret set
- [ ] `S3_BUCKET` — Bucket name set

### Domain & Network
- [ ] DNS A record points to server IP
- [ ] `ROOT_DOMAIN` in `infra/prod/.env` matches actual domain
- [ ] `DASHBOARD_URL` set to `https://[your-domain]`
- [ ] `PUBLIC_BASE_URL_SCHEME=https`
- [ ] Ports 80 and 443 open on server firewall
- [ ] Traefik can reach Cloudflare DNS API

### Database
- [ ] `POSTGRES_PASSWORD` is strong (not `postgres`)
- [ ] `DATABASE_URL` uses Docker service name `postgres` not `127.0.0.1`
- [ ] Migrations run on production DB before starting app

### Security
- [ ] `SIGNUP_DISABLED=true`
- [ ] `NODE_ENV=production`
- [ ] `ALLOW_BOOTSTRAP_LOGIN=false`
- [ ] No `.env` files committed to git
- [ ] Git history reviewed for leaked secrets

### Deploy
- [ ] `pnpm infra:worker:build` run on server
- [ ] `docker compose --env-file infra/prod/.env up -d --build`
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Dashboard loads at `https://[your-domain]`
- [ ] Login works with `PLATFORM_ADMIN_EMAIL` + `PLATFORM_ADMIN_PASSWORD`
- [ ] Provision a test tenant end to end
- [ ] Signup returns 403 on `POST /api/auth/register`

## After Deploy

- [ ] SSL certificate issued by Let's Encrypt (green padlock)
- [ ] Email sends correctly (test with a real email)
- [ ] Backups configured for Postgres volume
