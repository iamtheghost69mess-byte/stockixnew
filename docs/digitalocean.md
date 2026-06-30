# Stockix — Production Deployment on DigitalOcean

Step-by-step guide for deploying the complete Stockix stack (API, Dashboard, Finance, POS, PMS, MySQL, MongoDB, Redis, monitoring) on a single DigitalOcean Droplet using Docker Swarm — exactly how the existing production infrastructure works, minus AWS.

---

## Prerequisites

Before you start:

| Item | Where to get it |
|------|----------------|
| DigitalOcean account | digitalocean.com |
| Domain name + Cloudflare account | cloudflare.com (free plan works) |
| Cloudflare API token (DNS edit) | Cloudflare dashboard → My Profile → API Tokens |
| GitHub account with access to this repo | — |
| Resend account + verified sending domain | resend.com |
| Backblaze B2 bucket | backblaze.com |
| Sentry project (optional but recommended) | sentry.io |

---

## Part 1 — DigitalOcean Droplet

### Step 1.1 — Choose Droplet Size

The Stockix stack is memory-heavy. Choose based on expected tenant count:

| Tenants | RAM | vCPU | Storage | DO Slug | ~Price |
|---------|-----|------|---------|---------|-------|
| 0–5 (staging / early prod) | 8 GB | 4 | 160 GB | `s-4vcpu-8gb` | $48/mo |
| 5–20 (production) | 16 GB | 8 | 320 GB | `s-8vcpu-16gb` | $96/mo |
| 20–50 (growth) | 32 GB | 8 | 640 GB | `s-8vcpu-32gb` | $192/mo |

**Recommendation for first production deployment: `s-8vcpu-16gb` (16 GB / 8 vCPU / 320 GB SSD)**

Why: MySQL + MongoDB alone need 1-2 GB. PostgreSQL + Redis + Traefik + API + Dashboard + Worker + Prometheus + Grafana + Tempo accounts for ~6-8 GB at baseline. Each tenant Finance stack adds ~300 MB; each POS stack adds ~500 MB.

### Step 1.2 — Create the Droplet

In the DigitalOcean control panel:

1. **Create → Droplets**
2. **Region**: choose the closest to your users (Frankfurt / Amsterdam for EU, NYC / SFO for US)
3. **OS**: Ubuntu 22.04 LTS (x64)
4. **Size**: pick from the table above
5. **Additional storage**: Add a **Volume** of 100–500 GB for `/opt/stockix` (where tenant data, DB files, and backups are stored). Mount it at `/opt/stockix`.
6. **Authentication**: SSH Key (add your public key). Do not use password auth.
7. **Hostname**: `stockix-prod` or similar
8. **Backups**: Enable DigitalOcean weekly backups (optional but recommended)
9. Click **Create Droplet**

Note the **public IPv4** address — you need it in every following step.

### Step 1.3 — Create a Firewall

In DigitalOcean → Networking → Firewalls → Create Firewall:

**Inbound rules:**

| Protocol | Port | Source |
|----------|------|--------|
| TCP | 22 | Your office IP (restrict SSH) |
| TCP | 80 | All IPv4/IPv6 |
| TCP | 443 | All IPv4/IPv6 |

**Outbound rules:** Allow all (default)

Apply the firewall to your droplet. All other ports (5432, 3306, 27017, 6379, 4000, etc.) are internal — never exposed to the public internet, only reachable inside Docker overlay networks.

---

## Part 2 — DNS (Cloudflare)

### Step 2.1 — Point Your Domain to the Droplet

In Cloudflare DNS for your domain (example: `yourdomain.com`):

Add these **A records** pointing to your Droplet IP. **Set proxy status to DNS only (grey cloud)** — Traefik handles TLS, Cloudflare proxying will break it.

| Name | Type | Value | Proxy |
|------|------|-------|-------|
| `api` | A | `<droplet-ip>` | DNS only |
| `app` | A | `<droplet-ip>` | DNS only |
| `grafana` | A | `<droplet-ip>` | DNS only |
| `traefik` | A | `<droplet-ip>` | DNS only |
| `alertmanager` | A | `<droplet-ip>` | DNS only |
| `pms` | A | `<droplet-ip>` | DNS only |
| `pos` | A | `<droplet-ip>` | DNS only |
| `*` | A | `<droplet-ip>` | DNS only |

The wildcard `*` catches all tenant subdomains provisioned dynamically.

### Step 2.2 — Create a Cloudflare API Token

This token is used by Traefik for ACME DNS-01 TLS challenge:

1. Cloudflare → My Profile → API Tokens → Create Token
2. Use template: **Edit zone DNS**
3. Zone Resources: Include → Specific zone → your domain
4. Copy the token — this is `CF_DNS_API_TOKEN`

---

## Part 3 — Server Setup

SSH into the droplet as root:

```bash
ssh root@<droplet-ip>
```

### Step 3.1 — System Packages

```bash
apt-get update && apt-get upgrade -y
apt-get install -y \
  curl git ca-certificates gnupg lsb-release \
  htop jq ufw fail2ban unzip awscli
```

### Step 3.2 — Mount the Block Volume

If you added a volume in Step 1.2, format and mount it:

```bash
# Check the device name (usually /dev/sda or /dev/disk/by-id/...)
lsblk

# Format (only if brand new — SKIP if you already have data)
mkfs.ext4 -L stockix-data /dev/sda   # replace /dev/sda with actual device

# Mount
mkdir -p /opt/stockix
mount /dev/sda /opt/stockix

# Persist across reboots
echo "/dev/sda /opt/stockix ext4 defaults,nofail 0 2" >> /etc/fstab
```

If you skipped the block volume, `/opt/stockix` will use the root disk:

```bash
mkdir -p /opt/stockix
```

### Step 3.3 — Install Docker

```bash
# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify version (must be >= 24)
docker version
```

### Step 3.4 — Install Node.js 22 + pnpm

The deploy script runs `pnpm db:migrate` directly on the server:

```bash
# Install Node.js 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22

# Enable corepack and activate pnpm
corepack enable
corepack prepare pnpm@9.15.9 --activate

# Verify
node --version   # should print v22.x.x
pnpm --version   # should print 9.15.9
```

### Step 3.5 — Authenticate with GHCR

Docker images are hosted on GitHub Container Registry. Create a GitHub Personal Access Token (PAT) with `read:packages` scope, then:

```bash
echo "<GITHUB_PAT>" | docker login ghcr.io -u <github-username> --password-stdin
```

To make this survive reboots:

```bash
# The login writes credentials to /root/.docker/config.json — persist it
cat /root/.docker/config.json   # verify it contains ghcr.io auth entry
```

### Step 3.6 — Clone the Repository

```bash
mkdir -p /opt/stockix
cd /opt/stockix

git clone https://github.com/<your-org>/<your-repo>.git stockixnew
cd stockixnew

# Confirm you are on the correct branch
git checkout main
```

### Step 3.7 — Create Required Directories

```bash
mkdir -p /opt/stockix/tenants          # per-tenant .env files
mkdir -p /opt/stockix/traefik-dynamic  # Traefik dynamic config (written by worker)
mkdir -p /opt/stockix/backups          # local backup staging area
```

---

## Part 4 — Environment Configuration

### Step 4.1 — Generate Secrets

Run this on the server to generate all required secrets at once:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "AUTH_TOKEN_SECRET=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "PLATFORM_JWT_SECRET=$(openssl rand -hex 32)"
echo "LICENSE_SIGNING_SECRET=$(openssl rand -hex 32)"
echo "PLATFORM_API_SECRET=$(openssl rand -hex 32)"
echo "WORKER_SECRET=$(openssl rand -hex 32)"
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"
echo "DEPLOYMENT_SECRET_KEY=$(openssl rand -hex 32)"
echo "SHARED_MYSQL_ROOT_PASSWORD=$(openssl rand -hex 24)"
echo "TENANT_REDIS_PASSWORD=$(openssl rand -hex 24)"
echo "BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)"
```

Copy the output — you will paste these into the `.env` file below.

### Step 4.2 — Create `infra/prod/.env`

```bash
cp /opt/stockix/stockixnew/.env.example /opt/stockix/stockixnew/infra/prod/.env
nano /opt/stockix/stockixnew/infra/prod/.env
```

Fill in **every value**. The critical ones are listed below. Use your actual domain, droplet IP, and generated secrets:

```bash
# ── ENVIRONMENT ─────────────────────────────────────────────────
NODE_ENV=production

# ── DOMAIN  (replace yourdomain.com with your actual domain) ────
ROOT_DOMAIN=yourdomain.com
PUBLIC_BASE_URL_SCHEME=https
API_DOMAIN=api.yourdomain.com
STOCKIX_API_URL=https://api.yourdomain.com
DASHBOARD_URL=https://app.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com

# ── DASHBOARD PUBLIC VARS ────────────────────────────────────────
NEXT_PUBLIC_STOCKIX_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=https
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=yourdomain.com
NEXT_PUBLIC_PMS_API_URL=https://pms.yourdomain.com

# ── TLS (Traefik + Cloudflare) ───────────────────────────────────
ACME_EMAIL=your@email.com
CF_DNS_API_TOKEN=<cloudflare-api-token-from-step-2.2>

# ── POSTGRES ─────────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generated>
POSTGRES_DB=stockix_platform
POSTGRES_HOST_PORT=54330
DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@pgbouncer:5432/stockix_platform

# ── REDIS ────────────────────────────────────────────────────────
CONTROL_PLANE_REDIS_URL=redis://control-plane-redis:6379/0
RUN_BULLMQ_CONSUMERS=true

# ── SHARED TENANT INFRA ──────────────────────────────────────────
SHARED_MYSQL_ROOT_PASSWORD=<generated>
SHARED_MYSQL_HOST=stockix-mysql
SHARED_MONGO_HOST=stockix-mongo
MYSQL_PROXY_HOST=stockix-mysql-proxy
MYSQL_PROXY_PORT=6033
WORKER_MYSQL_PROXY_PORT=6033
TENANT_REDIS_HOST=stockix-redis
TENANT_REDIS_PASSWORD=<generated>

# ── PLATFORM SECRETS ─────────────────────────────────────────────
PLATFORM_API_SECRET=<generated>
WORKER_SECRET=<generated>
INTERNAL_API_SECRET=<generated>
SESSION_SECRET=<generated>
AUTH_TOKEN_SECRET=<generated>
JWT_SECRET=<generated>
PLATFORM_JWT_SECRET=<generated>
LICENSE_SIGNING_SECRET=<generated>
DEPLOYMENT_SECRET_KEY=<generated>

# ── ADMIN ────────────────────────────────────────────────────────
PLATFORM_ADMIN_EMAIL=admin@yourdomain.com
PLATFORM_ADMIN_PASSWORD=<strong-password>
BOOTSTRAP_ADMIN_EMAIL=bootstrap@yourdomain.com
BOOTSTRAP_ADMIN_PASSWORD=<strong-password>
ALLOW_BOOTSTRAP_LOGIN=false
SIGNUP_DISABLED=true

# ── PATHS (must match actual server paths) ───────────────────────
REPO_ROOT=/opt/stockix/stockixnew
STOCKIX_REPO=/opt/stockix/stockixnew
STOCKIX_TENANT_APP_ROOT=/opt/stockix/stockixnew/services/stockix-finance
TENANT_ENV_ROOT=/opt/stockix/tenants
TRAEFIK_DYNAMIC_DIR=/opt/stockix/traefik-dynamic
POS_APP_ROOT=/opt/stockix/stockixnew/apps/pos-backend
PMS_APP_ROOT=/opt/stockix/stockixnew/services/pms

# ── WORKER ───────────────────────────────────────────────────────
WORKER_HEALTH_PORT=9090
WORKER_CONCURRENCY=2
WORKER_JOB_EXECUTION_TIMEOUT_MS=600000
WORKER_INTERNAL_NETWORK=stockix_internal
TRAEFIK_NETWORK=stockix_public
MAX_TENANT_PORT=4999
# Generate: htpasswd -nb admin yourpassword
TRAEFIK_DASHBOARD_BASIC_AUTH=admin:$$apr1$$...

# ── MAIL (Resend) ─────────────────────────────────────────────────
MAIL_HOST=smtp.resend.com
MAIL_PORT=587
MAIL_USERNAME=resend
MAIL_PASSWORD=<resend-api-key>
MAIL_SECURE=false
MAIL_FROM_NAME=Your Platform Name
MAIL_FROM_ADDRESS=noreply@mail.yourdomain.com
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=noreply@mail.yourdomain.com
RESEND_WEBHOOK_SECRET=<from-resend-dashboard>

# ── STORAGE (Backblaze B2) ────────────────────────────────────────
S3_REGION=us-east-005           # match your B2 region
S3_ACCESS_KEY_ID=<b2-key-id>
S3_SECRET_ACCESS_KEY=<b2-app-key>
S3_BUCKET=<b2-bucket-name>
S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
S3_FORCE_PATH_STYLE=true

# ── BACKUPS ───────────────────────────────────────────────────────
BACKUP_B2_BUCKET=<b2-bucket-name>
BACKUP_B2_KEY_ID=<b2-key-id>
BACKUP_B2_APP_KEY=<b2-app-key>
BACKUP_B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
BACKUP_B2_PREFIX=stockix-prod-backups
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=<generated>
BACKUP_POSTGRES_CONTAINER=stockix_postgres.1.<task-id>   # set after first deploy
BACKUP_MYSQL_CONTAINER=stockix-shared_stockix-mysql.1.<task-id>

# ── MONITORING ────────────────────────────────────────────────────
GRAFANA_ADMIN_PASSWORD=<generated>
PAGERDUTY_KEY=<pagerduty-routing-key>       # optional
SLACK_WEBHOOK_URL=https://hooks.slack.com/... # optional

# ── SENTRY ────────────────────────────────────────────────────────
SENTRY_DSN=<sentry-dsn>
NEXT_PUBLIC_SENTRY_DSN=<sentry-dsn>
SENTRY_ENVIRONMENT=production

# ── MONGODB ───────────────────────────────────────────────────────
MONGODB_DATABASE_URL=mongodb://stockix-mongo:27017/{slug}_pos?replicaSet=rs0&directConnection=true

# ── PROXYSQL ─────────────────────────────────────────────────────
PROXYSQL_ADMIN_USER=admin
PROXYSQL_ADMIN_PASSWORD=admin

# ── SECURITY HEADERS ─────────────────────────────────────────────
SECURITY_HSTS=max-age=31536000; includeSubDomains
SECURITY_X_FRAME_OPTIONS=DENY
SECURITY_REFERRER_POLICY=strict-origin-when-cross-origin
SECURITY_X_CONTENT_TYPE_OPTIONS=nosniff
SECURITY_CSP_BASE=default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'

# ── MULTI-PRODUCT ─────────────────────────────────────────────────
POS_PLATFORM_BASE_URL=http://host.docker.internal:8010
POS_PLATFORM_API_KEY=<generated-32-char>
POS_FRONTEND_URL=https://pos.yourdomain.com
POS_HOST_PORT=8010
POS_FRONTEND_HOST_PORT=3001

PMS_PORT=3003
PMS_BASE_URL=http://host.docker.internal:3003
PMS_ICAL_SYNC_INTERVAL_MS=600000
NEXT_PUBLIC_PMS_API_URL=https://pms.yourdomain.com

GOTENBERG_URL=http://stockix-gotenberg:3000
GOTENBERG_DOCS_URL=http://server:3000/public/

# ── CHATWOOT (optional — leave blank to skip chat provisioning) ───
CHATWOOT_BASE_URL=
CHATWOOT_API_ACCESS_TOKEN=

# ── MISC ──────────────────────────────────────────────────────────
LICENSE_SIGNING_SECRET=<same-as-above>
DEFAULT_LICENSE_TERM_DAYS=365
PROVISION_MODULE_GATING=1
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_SECONDS=30
DB_CONNECT_TIMEOUT_SECONDS=10
DB_MAX_LIFETIME_SECONDS=1800
PORT=4000
AGENDASH_AUTH_USER=agendash
AGENDASH_AUTH_PASSWORD=<generated>
```

> **Security note:** This file contains all secrets. Its permissions should be `600 root:root`:
> ```bash
> chmod 600 /opt/stockix/stockixnew/infra/prod/.env
> ```

---

## Part 5 — First-Time Deployment

### Step 5.1 — Install pnpm Dependencies (for migrations)

```bash
cd /opt/stockix/stockixnew
NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --filter @repo/db...
```

### Step 5.2 — Initialize Docker Swarm

```bash
cd /opt/stockix/stockixnew

# The script auto-detects the primary IP. You can override it explicitly:
SWARM_ADVERTISE_ADDR=<droplet-private-ip> sudo bash infra/deploy/swarm-init.sh
```

This script does the following automatically:
1. Checks Docker version (must be >= 24)
2. Initializes Docker Swarm (single manager node)
3. Creates 4 overlay networks: `stockix_public`, `stockix_internal`, `stockix_socket_proxy_network`, `stockix-shared`
4. Deploys the `stockix-shared` stack (MySQL, MongoDB, Redis, ProxySQL, Gotenberg)
5. Waits for MySQL and Redis to become healthy
6. Initializes the MongoDB replica set (`rs0`)
7. Deploys the main `stockix` stack (Traefik, API, Dashboard, Worker, Postgres, monitoring)
8. Runs a health check loop against `https://api.yourdomain.com/health`

If everything passes, you will see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stockix is now running in Docker Swarm mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If the health check fails, run:

```bash
docker service ls
docker service logs stockix_api --tail 50
docker service logs stockix_traefik --tail 20
```

### Step 5.3 — Create Docker Swarm Secrets

Swarm secrets are a separate, encrypted store inside Docker — even if someone reads the `.env` file, secrets are additionally protected at rest:

```bash
sudo bash /opt/stockix/stockixnew/infra/deploy/secrets-init.sh
```

The script reads `infra/prod/.env` and creates 10 Docker secrets:
- `postgres_password`
- `session_secret`
- `auth_token_secret`
- `jwt_secret`
- `license_signing_secret`
- `platform_api_secret`
- `worker_secret`
- `deployment_secret_key`
- `backup_encryption_key`
- `shared_mysql_root_password`

Verify they were created:

```bash
docker secret ls
```

### Step 5.4 — Run Database Migrations

The `swarm-init.sh` script does not run Postgres migrations. Run them now:

```bash
cd /opt/stockix/stockixnew

export DATABASE_URL="postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:54330/stockix_platform"
pnpm --filter @repo/db db:migrate
```

If you get a connection error, the Postgres container may still be starting. Wait 30 seconds and retry. To check:

```bash
docker service ps stockix_postgres
```

### Step 5.5 — Verify the Stack is Running

```bash
# All services should show REPLICAS as N/N
docker service ls

# Expected services:
# stockix_traefik          1/1
# stockix_api              2/2
# stockix_api-bullmq       1/1
# stockix_dashboard        2/2
# stockix_infra-worker     1/1
# stockix_postgres         1/1
# stockix_pgbouncer        1/1
# stockix_control-plane-redis  1/1
# stockix_prometheus       1/1
# stockix_grafana          1/1
# stockix_tempo            1/1
# stockix_alertmanager     1/1
# stockix_node-exporter    (global)
# stockix_redis-exporter   1/1
# stockix_postgres-exporter 1/1
# stockix_db-backup        1/1
# stockix-shared_stockix-mysql       1/1
# stockix-shared_stockix-mysql-proxy 1/1
# stockix-shared_stockix-mongo       1/1
# stockix-shared_stockix-redis       1/1
# stockix-shared_stockix-gotenberg   1/1
```

### Step 5.6 — Smoke Test

```bash
# API health check
curl -s https://api.yourdomain.com/health
# Expected: {"status":"ok","version":"..."}

# API readiness (checks DB + Redis connectivity)
curl -s https://api.yourdomain.com/ready

# Dashboard
curl -s -o /dev/null -w "%{http_code}" https://app.yourdomain.com
# Expected: 200 or 307 (redirect to login)
```

---

## Part 6 — CI/CD Setup (GitHub Actions)

The existing GitHub Actions workflows use SSH to deploy to the server. You need to update the GitHub repository secrets to point to the DigitalOcean droplet instead of AWS EC2.

### Step 6.1 — Create an SSH Deploy Key

On your local machine (or on the droplet):

```bash
ssh-keygen -t ed25519 -C "stockix-deploy" -f ~/.ssh/stockix_deploy -N ""
```

Add the **public key** to the droplet's authorized keys:

```bash
cat ~/.ssh/stockix_deploy.pub >> /root/.ssh/authorized_keys
# or if using a non-root user:
# cat ~/.ssh/stockix_deploy.pub | ssh root@<droplet-ip> "cat >> ~/.ssh/authorized_keys"
```

### Step 6.2 — Add GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value |
|-------------|-------|
| `EC2_HOST` | `<droplet-public-ip>` (the DigitalOcean IP — despite the name it works for any SSH host) |
| `EC2_USER` | `root` (or the user you SSH as) |
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/stockix_deploy` (the **private** key) |
| `GHCR_TOKEN` | GitHub PAT with `write:packages` scope |

For staging (if you have a separate staging droplet or use the same one):

| Secret Name | Value |
|-------------|-------|
| `STAGING_EC2_HOST` | `<staging-droplet-ip>` |
| `STAGING_EC2_USER` | `root` |
| `STAGING_SSH_PRIVATE_KEY` | Private key for staging droplet |

### Step 6.3 — How CI/CD Works After This

1. **Push to `main`** → `build-and-publish.yml` runs gate checks + builds all Docker images → pushes to GHCR
2. **Push to `architecture2`** → Same as above + `deploy-staging.yml` auto-deploys to staging via SSH
3. **Manual production deploy** → GitHub Actions → `deploy-production.yml` → trigger `workflow_dispatch` with a release SHA

The deploy script (`infra/deploy/deploy.sh`) on the server:
- `git pull` the latest code from the branch
- Loads `infra/prod/.env`
- Runs Postgres migrations with pnpm
- Pulls new Docker images from GHCR
- Tags them as `stockix-api:latest`, `stockix-dashboard:latest`, `stockix-infra-worker:latest`
- Runs `docker stack deploy` to update the Swarm
- Loops the health check 12 × 15 seconds

---

## Part 7 — Post-Deploy Configuration

### Step 7.1 — Generate Traefik Dashboard Password

The Traefik dashboard is protected by HTTP Basic Auth. Generate the password hash:

```bash
apt-get install -y apache2-utils
htpasswd -nb admin yourpassword
# Output: admin:$apr1$...$...
```

Put the output in `TRAEFIK_DASHBOARD_BASIC_AUTH` in `infra/prod/.env`. Note: dollar signs in the hash must be escaped as `$$` in the env file.

### Step 7.2 — Update Backup Container Names

After the first deploy, find the actual Swarm task container names for the backup script:

```bash
docker ps --format '{{.Names}}' | grep postgres
docker ps --format '{{.Names}}' | grep mysql
docker ps --format '{{.Names}}' | grep mongo
```

Update `infra/prod/.env`:

```bash
BACKUP_POSTGRES_CONTAINER=stockix_postgres.1.<task-id>
BACKUP_MYSQL_CONTAINER=stockix-shared_stockix-mysql.1.<task-id>
BACKUP_MONGO_CONTAINER=stockix-shared_stockix-mongo.1.<task-id>
```

### Step 7.3 — Configure Alertmanager (Optional)

Edit `infra/prod/alertmanager/alertmanager.yml` to add your Slack webhook URL and/or PagerDuty routing key. Then redeploy:

```bash
docker stack deploy --compose-file infra/prod/docker-compose.yml stockix
```

### Step 7.4 — Access the Monitoring Stack

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | `https://grafana.yourdomain.com` | admin / `GRAFANA_ADMIN_PASSWORD` |
| Traefik dashboard | `https://traefik.yourdomain.com` | admin / `TRAEFIK_DASHBOARD_BASIC_AUTH` value |
| Alertmanager | `https://alertmanager.yourdomain.com` | none |
| Prometheus | Internal only (not exposed by default) | — |

---

## Part 8 — Subsequent Deployments

After the first bootstrap, all future deploys use a single command:

```bash
bash /opt/stockix/stockixnew/infra/deploy/deploy.sh production <sha>
```

Or via GitHub Actions → Actions → "Deploy Production" → Run workflow → enter the SHA from `build-and-publish.yml`.

### Rollback

If a deploy breaks something:

```bash
sudo bash /opt/stockix/stockixnew/infra/deploy/rollback.sh
```

---

## Part 9 — Key Operational Commands

```bash
# Service status
docker service ls
docker service ps stockix_api --no-trunc

# Logs
docker service logs stockix_api --tail 100 --follow
docker service logs stockix_dashboard --tail 50
docker service logs stockix_infra-worker --tail 100

# Scale (e.g., take API to 3 replicas)
docker service scale stockix_api=3

# Restart a service
docker service update --force stockix_api

# Database access (Postgres)
docker exec -it $(docker ps -q -f name=stockix_postgres) \
  psql -U postgres -d stockix_platform

# MySQL access
docker exec -it $(docker ps -q -f name=stockix-shared_stockix-mysql) \
  mysql -u root -p<SHARED_MYSQL_ROOT_PASSWORD>

# Redis CLI (control plane)
docker exec -it $(docker ps -q -f name=stockix_control-plane-redis) redis-cli

# Update a single service to a new image without full stack deploy
docker service update \
  --image ghcr.io/<org>/stockix-api:<sha> \
  stockix_api

# Force Swarm to rebalance tasks across nodes
docker service update --force stockix_api
```

---

## Part 10 — Reference Architecture

```
DigitalOcean Droplet
├── 443/80 → Traefik (TLS via Cloudflare DNS-01)
│   ├── api.yourdomain.com     → stockix_api (2 replicas, port 4000)
│   ├── app.yourdomain.com     → stockix_dashboard (2 replicas, port 3000)
│   ├── grafana.yourdomain.com → stockix_grafana
│   ├── traefik.yourdomain.com → Traefik dashboard
│   └── *.yourdomain.com       → per-tenant stacks (written dynamically by worker)
│
├── Docker Swarm Stacks
│   ├── stockix (main stack)
│   │   ├── traefik          — reverse proxy + TLS
│   │   ├── socket-proxy     — docker.sock proxy for worker
│   │   ├── postgres         — control-plane PostgreSQL 16
│   │   ├── pgbouncer        — connection pooler
│   │   ├── control-plane-redis — rate limiting + BullMQ
│   │   ├── api (×2)         — Hono REST API
│   │   ├── api-bullmq (×1)  — background job consumer
│   │   ├── dashboard (×2)   — Next.js operator UI
│   │   ├── infra-worker     — tenant provisioner
│   │   ├── prometheus        — metrics
│   │   ├── alertmanager      — alerts → Slack/PagerDuty
│   │   ├── grafana           — dashboards
│   │   ├── tempo             — distributed traces
│   │   └── db-backup         — nightly backup → Backblaze B2
│   │
│   └── stockix-shared (shared tenant infrastructure)
│       ├── stockix-mysql      — MySQL 8 (all tenant Finance DBs)
│       ├── stockix-mysql-proxy — ProxySQL connection pooler
│       ├── stockix-mongo      — MongoDB 6 (all tenant POS DBs)
│       ├── stockix-redis      — tenant Redis (queues + sessions)
│       └── stockix-gotenberg  — Chromium PDF renderer
│
└── Per-tenant stacks (provisioned dynamically by infra-worker)
    ├── Finance: NestJS server + migration container
    └── POS: Express backend + 3 workers + Next.js frontend
```

---

## Checklist

Before considering the deployment production-ready, verify all of the following:

- [ ] Droplet created, firewall configured, SSH access working
- [ ] All DNS A records pointing to droplet IP (with DNS-only / grey cloud)
- [ ] Cloudflare API token created and set in `.env`
- [ ] All `<GENERATE_NEW>` values replaced in `infra/prod/.env`
- [ ] `POSTGRES_PASSWORD` placeholder replaced in `DATABASE_URL` with actual password
- [ ] `PLATFORM_JWT_SECRET` is set (never leave empty)
- [ ] `INTERNAL_API_SECRET` is set (never leave empty)
- [ ] `ALLOW_BOOTSTRAP_LOGIN=false` in production
- [ ] `SIGNUP_DISABLED=true` in production (unless you want open registration)
- [ ] Docker installed and version >= 24
- [ ] Node.js 22 + pnpm 9.15.9 installed
- [ ] GHCR authenticated (`docker login ghcr.io`)
- [ ] Repository cloned to `/opt/stockix/stockixnew`
- [ ] `swarm-init.sh` completed without errors
- [ ] `secrets-init.sh` completed, all 10 secrets visible in `docker secret ls`
- [ ] Postgres migrations ran successfully
- [ ] All services show `N/N` replicas in `docker service ls`
- [ ] `https://api.yourdomain.com/health` returns 200
- [ ] `https://app.yourdomain.com` loads the login page
- [ ] Grafana accessible at `https://grafana.yourdomain.com`
- [ ] GitHub repository secrets set (`EC2_HOST`, `EC2_USER`, `SSH_PRIVATE_KEY`)
- [ ] Test push to `main` triggers build-and-publish and completes successfully
- [ ] Manual deploy via `deploy-production.yml` workflow tested
- [ ] Backup container names updated in `.env` and backup tested manually
