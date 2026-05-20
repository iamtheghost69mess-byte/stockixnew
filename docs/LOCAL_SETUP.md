# Local Development Setup

## ⚠️ Security Notice

Commit `09a7152d` contained real secrets in a deleted `.env` file.
The following were exposed in git history:

- `PLATFORM_API_SECRET`
- `SESSION_SECRET`
- `PLATFORM_ADMIN_PASSWORD`

These have been rotated in both `.env` and `infra/prod/.env`.
If any of these values were ever deployed to a live server — rotate them on that server immediately.
To permanently scrub from git history, run `git filter-repo` or use BFG Repo-Cleaner (separate operation, requires force push).

## Environment Setup

1. Copy example: `cp .env.example .env`
2. Generate secrets: `node scripts/generate-env-secrets.js`
3. Paste generated values into the secret fields in `.env` (see table below)
4. Set `PLATFORM_ADMIN_EMAIL` to your email
5. Start services: `pnpm dev`

Env loading: `@repo/config` (`packages/config`) loads repo-root `.env` first, then `.env.local` overrides. API and Dashboard both use this path — do not rely on `apps/api/.env` alone.

Variable reference: see comments in `.env.example` and `packages/config/src/index.ts`.

## Secret Variables (must be set)

| Variable | Purpose | How to generate |
|---|---|---|
| SESSION_SECRET | Cookie signing | `node -e "require('crypto').randomBytes(64).toString('hex')"` |
| AUTH_TOKEN_SECRET | JWT signing | same as above |
| LICENSE_SIGNING_SECRET | POS license JWT | `node -e "require('crypto').randomBytes(32).toString('hex')"` |
| DEPLOYMENT_SECRET_KEY | Tenant secret derivation | same as above |
| PLATFORM_API_SECRET | Dashboard→API auth | same as above |
| WORKER_SECRET | Worker job auth | same as above |
| BOOTSTRAP_ADMIN_PASSWORD | First admin login | choose a strong password |
| PLATFORM_ADMIN_PASSWORD | Dashboard admin login | choose a strong password |

Or run once: `node scripts/generate-env-secrets.js`

## Database (local)

Default control-plane Postgres (from `infra/dev/docker-compose.yml`):

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform
```

Start Postgres: `docker compose -f infra/dev/docker-compose.yml up -d`

## Mail Setup (local)

For local email testing install Mailpit:

- Download: https://github.com/axllent/mailpit
- Run: `mailpit`
- Set in `.env`: `MAIL_HOST=localhost`, `MAIL_PORT=1025`, `MAIL_SECURE=false`
- View emails at: http://localhost:8025

For production, use Resend SMTP:

- `MAIL_HOST=smtp.resend.com`
- `MAIL_PORT=587`
- `MAIL_USERNAME=resend`
- `MAIL_PASSWORD=[your Resend API key]`
- `MAIL_SECURE=false`

Transactional mail in tenant finance apps uses Nodemailer over these SMTP settings (no Resend SDK).

## Verify env completeness

```bash
node -e "
const fs = require('fs');
const example = fs.readFileSync('.env.example', 'utf8');
const env = fs.readFileSync('.env', 'utf8');
const exampleKeys = [...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]);
const envKeys = [...env.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]);
const missing = exampleKeys.filter(k => !envKeys.includes(k));
console.log('Missing from .env:', missing.length ? missing : 'NONE');
"
```
