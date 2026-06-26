# Stockix Monorepo — Post-Audit Implementation Plan

**Date:** 2026-06-22  
**Based on:** finalprod.md (audit + repair cycle pass 1 & 2)  
**Scope:** All remaining ❌ NOT DONE + ACCEPTED-deferred items across the full monorepo

---

## How to Read This Plan

Each item maps back to a section in `finalprod.md`. Items are grouped by when they must be done — not by difficulty. "ACCEPTED" items from the audit are deferred by design; this plan makes them actionable.

| Phase | Window | Gate |
|-------|--------|------|
| **Phase 0** | Before go-live (hours) | Server provisioned, secrets set, drill done |
| **Phase 1** | Sprint 1 post-launch (~2 weeks) | System stable, users onboarded |
| **Phase 2** | Sprint 2 (~4 weeks post-launch) | Phase 1 complete |
| **Phase 3** | Sprint 3+ (ongoing) | Phase 2 complete |

---

## Phase 0 — Before Go-Live (Mandatory Pre-Launch Steps)

These are not code changes — they are server-side operations and GitHub configuration that must be completed before the first production deploy.

---

### P0-01: Initialize Docker Swarm on Production Server

**Source:** §5 (Docker Swarm Configuration) — `infra/deploy/swarm-init.sh` was written and committed but not yet run.

**Why it matters:** Without Swarm init, `docker stack deploy` will fail. All resource limits, `deploy.replicas`, and Traefik `deploy.labels` defined in the compose file are ignored by plain `docker compose up`.

**Steps (on production server):**
```bash
# SSH into production server
ssh <prod-server>

# Pull latest code
cd /opt/stockix
git pull origin main

# Run swarm init (idempotent — safe to re-run)
sudo bash infra/deploy/swarm-init.sh

# Verify
docker node ls          # should show one Manager node
docker network ls       # should show overlay networks
```

**Acceptance criteria:** `docker node ls` shows `Status: Ready`, `Availability: Active`, `Manager Status: Leader`.

---

### P0-02: Bootstrap Docker Swarm Secrets

**Source:** §5 (Secrets Management), R-07 + R-17 — `infra/deploy/secrets-init.sh` written and committed.

**Why it matters:** The prod compose file declares 10 secrets as `external: true`. Without running `secrets-init.sh`, `docker stack deploy` will fail with "secret not found."

**Steps (on production server, after P0-01):**
```bash
# Ensure .env is populated with all required vars
nano /opt/stockix/infra/prod/.env    # fill in all secrets

# Create Docker secrets
sudo bash infra/deploy/secrets-init.sh

# Verify
docker secret ls    # should list all 10 secrets
```

**Acceptance criteria:** `docker secret ls` lists all 10 required secrets. `docker stack deploy` completes without "secret not found" errors.

---

### P0-03: Add GitHub Actions Secrets

**Source:** §8 (CI/CD), §23 (GitHub Actions secrets to add)

**Steps (GitHub → Settings → Secrets → Actions):**

| Secret Name | Value | Required? |
|-------------|-------|-----------|
| `STAGING_API_URL` | HTTPS URL of staging API (e.g., `https://api.staging.yourdomain.com`) | **Required** — gates production deploy |
| `BACKUP_B2_REPLICA_BUCKET` | Second B2 bucket name | Optional (cross-region replication) |
| `BACKUP_B2_REPLICA_ENDPOINT` | Second B2 region endpoint | Optional (cross-region replication) |

**Acceptance criteria:** Trigger `deploy-production.yml` manually — `verify-staging` job succeeds and gate passes before production deploy runs.

---

### P0-04: Run DR Drill and Commit the Log

**Source:** §4 (Backup Strategy), R-10 — `scripts/dr-drill.sh` comprehensive drill written and committed.

**Steps (on any server with B2 credentials and backup access):**
```bash
# Run the drill
bash scripts/dr-drill.sh

# Open the generated log file
nano infra/prod/dr-drill-logs/$(date +%Y-%m-%d).log

# Fill in the operator fields:
#   RESTORE_TESTED: YES / NO
#   RTO_MINUTES: (how long restore took)
#   DRILL_OPERATOR: (your name)

# Commit the drill log
git add infra/prod/dr-drill-logs/
git commit -m "ops: DR drill $(date +%Y-%m-%d) — restore tested"
git push origin main
```

**Acceptance criteria:** `infra/prod/dr-drill-logs/` has a file dated today with `RESTORE_TESTED: YES`. DR drill log committed to main.

---

### P0-05: Verify B2 Backup Upload Is Live

**Source:** §20 (Backblaze B2 Backups) — scripts correct but bucket upload requires live credentials.

**Steps:**
```bash
# On production server, after backup cron runs (or trigger manually):
docker exec stockix_db-backup bash /scripts/backup.sh

# Check the Prometheus metric was written
cat /var/lib/prometheus/textfile/*.prom | grep backup_last_success

# In Grafana infra dashboard — "Hours since last backup" should be green
```

**Acceptance criteria:** Grafana "Hours since last backup" panel shows < 1 hour. B2 bucket contains a file uploaded in the last 30 minutes.

---

## Phase 1 — Sprint 1 (High Priority, Post-Launch)

These are items the audit marked "Post-Launch" but that affect reliability or data integrity at scale. Complete within 2 weeks of go-live.

---

### P1-01: Redis Provision Pub/Sub Bus — Enables API Horizontal Scaling

**Source:** §11 (Scalability), §23 (Remaining deferred items)  
**Audit verdict:** ACCEPTED (Post-Launch) — api pinned at `replicas: 1`

**Why it matters:** The API SSE (`/v1/provision/stream`) holds in-process state — open EventSource connections are tied to the process instance. With 1 replica this works; with 2+ replicas a client connecting to replica B won't see events published by replica A. This is the only reason api is capped at `replicas: 1`.

**Implementation:**

**Step 1 — Publish provision events to Redis on the API side:**  
In `apps/api/src/provisioning/provision-stream.service.ts` (or wherever SSE events are emitted), replace the in-memory EventEmitter with a Redis Pub/Sub publish:

```typescript
// BEFORE — in-memory emitter
this.eventEmitter.emit(`provision:${tenantId}`, event);

// AFTER — Redis pub/sub
await this.redisClient.publish(`provision:${tenantId}`, JSON.stringify(event));
```

**Step 2 — Subscribe on the SSE handler:**  
In the SSE controller/gateway, replace EventEmitter listener with a Redis subscriber:

```typescript
// In the GET /provision/stream handler:
const subscriber = this.redisClient.duplicate();    // Redis requires dedicated connection per sub
await subscriber.subscribe(`provision:${tenantId}`);

subscriber.on('message', (channel, message) => {
  res.write(`data: ${message}\n\n`);
});

req.on('close', () => {
  subscriber.unsubscribe();
  subscriber.quit();
});
```

**Step 3 — Update compose file:**  
In `infra/prod/docker-compose.yml`, change api `replicas: 1` to `replicas: 2` and remove the comment about waiting for the provision bus:
```yaml
api:
  deploy:
    replicas: 2    # horizontal scaling enabled after Redis provision bus
```

**Step 4 — Test:**  
Open two SSE connections to two different api replicas (use Traefik sticky-session or two direct-hit curl streams), trigger a provision, verify both streams receive the events.

**Files to change:**
- `apps/api/src/provisioning/provision-stream.service.ts` (or equivalent)
- `apps/api/src/provisioning/provision-stream.controller.ts`
- `infra/prod/docker-compose.yml` (replicas: 2)

**Acceptance criteria:** Kill one api replica mid-provision. Client connected to the surviving replica still receives all subsequent events. `docker service scale stockix_api=2` works without breaking provision SSE.

---

### P1-02: License Sync Periodic Reconciliation

**Source:** §16 (License Sync)  
**Audit verdict:** ACCEPTED (Post-Launch) — event-driven only, no reconciliation if state diverges

**Why it matters:** If a Finance stack restarts unexpectedly after a license change was queued but before the `syncFinanceLicenseForStockixTenant()` call completed, the Finance app could be running with a stale (wrong) license for an indefinite period. No mechanism catches this divergence.

**Implementation:**

**Step 1 — Add a BullMQ repeatable reconciliation job in `apps/infra-worker`:**

In `apps/infra-worker/src/jobs/license-reconcile.job.ts`:
```typescript
export const RECONCILE_QUEUE = 'license-reconcile';

@Processor(RECONCILE_QUEUE)
export class LicenseReconcileProcessor extends WorkerHost {
  async process(): Promise<void> {
    const activeTenants = await db.select().from(tenants)
      .where(eq(tenants.status, 'active'));

    for (const tenant of activeTenants) {
      const license = await db.select().from(licenses)
        .where(eq(licenses.tenantId, tenant.id))
        .orderBy(desc(licenses.createdAt))
        .limit(1);

      if (!license[0]) continue;

      await syncFinanceLicenseForStockixTenant(tenant, license[0]);
    }
  }
}
```

**Step 2 — Register as a daily repeatable job** (run at 03:00 UTC daily, off-peak):
```typescript
await queue.add('reconcile', {}, {
  repeat: { cron: '0 3 * * *' },
  jobId: 'daily-license-reconcile'
});
```

**Step 3 — Add a manual trigger endpoint** `POST /internal/jobs/reconcile-licenses` (internal route, existing infra pattern).

**Files to change:**
- `apps/infra-worker/src/jobs/license-reconcile.job.ts` (new)
- `apps/infra-worker/src/worker.ts` (register processor + queue)
- `apps/api/src/routes/internal.ts` (manual trigger endpoint)

**Acceptance criteria:** Manually diverge a Finance license (direct DB edit). Wait for reconcile job to fire (or trigger manually). Finance license re-synced to correct state without manual intervention.

---

### P1-03: SPF / DKIM / DMARC Verification Script

**Source:** §15 (Email System)  
**Audit verdict:** ACCEPTED (Post-Launch) — DNS-level, not verifiable from code

**Why it matters:** Without SPF/DKIM/DMARC, emails from Stockix (password resets, welcome emails, invoices) will land in spam. No code currently verifies these records are correctly set.

**Implementation — add a DNS check script:**

Create `scripts/verify-email-dns.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-yourdomain.com}"
ERRORS=0

echo "=== Email DNS Verification for $DOMAIN ==="

# SPF check
SPF=$(dig +short TXT "$DOMAIN" | grep "v=spf1" || true)
if [ -z "$SPF" ]; then
  echo "❌ SPF: No SPF record found for $DOMAIN"
  ERRORS=$((ERRORS+1))
else
  echo "✅ SPF: $SPF"
fi

# DKIM check (Resend uses resend._domainkey)
DKIM=$(dig +short TXT "resend._domainkey.$DOMAIN" || true)
if [ -z "$DKIM" ]; then
  echo "❌ DKIM: No resend._domainkey TXT record found"
  ERRORS=$((ERRORS+1))
else
  echo "✅ DKIM: found"
fi

# DMARC check
DMARC=$(dig +short TXT "_dmarc.$DOMAIN" | grep "v=DMARC1" || true)
if [ -z "$DMARC" ]; then
  echo "❌ DMARC: No _dmarc TXT record found"
  ERRORS=$((ERRORS+1))
else
  echo "✅ DMARC: $DMARC"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "RESULT: $ERRORS check(s) failed. Fix DNS before go-live."
  exit 1
else
  echo "RESULT: All email DNS records verified ✅"
fi
```

**Add to CI as a non-blocking informational step in `ci.yml`:**
```yaml
- name: Verify email DNS (informational)
  run: bash scripts/verify-email-dns.sh ${{ vars.PRODUCTION_DOMAIN }} || true
```

**Acceptance criteria:** `bash scripts/verify-email-dns.sh yourdomain.com` exits 0 with all three checks green. Script committed and passing on the production domain before go-live.

---

### P1-04: Centralize Email Templates

**Source:** §15 (Email System) — ❌ NOT DONE  
**Current state:** Three isolated template systems:
- Control plane: `apps/api/src/mail/templates/` (Resend React Email or HTML)
- POS backend: `apps/pos-backend/` (separate HTML templates)  
- Finance: `stockix-finance/packages/server/src/modules/*/views/` (Handlebars/Pug)

**Why it matters:** Sending a Stockix-branded email currently means updating logo, colors, footer, and legal text in three separate places. Any rebranding requires three PRs.

**Implementation approach (incremental — do not block launch):**

**Sprint 1 goal: Single source of truth for shared assets only.**

Create `packages/email-shared/`:
```
packages/email-shared/
  src/
    layouts/base.html          # shared header/footer/logo/colors
    components/button.html     # CTA button
    components/divider.html
    helpers/interpolate.ts     # {{variable}} substitution
  package.json                 # "name": "@repo/email-shared"
```

**Step 1:** Extract the shared header (logo, brand color, domain) and footer (legal text, unsubscribe) into `layouts/base.html`. Each app's existing template becomes a content block that slots into the base.

**Step 2:** Update each app to consume `@repo/email-shared` layout:
- `apps/api/src/mail/` — wrap existing templates with the shared base
- `apps/pos-backend/` — update `nodemailer` templates to use base
- Finance — this app is a separate stack; pass shared assets at provision time via the existing `syncOrganizationNameToFinance` pattern

**Step 3:** Add `@repo/email-shared` to `turbo.json` build pipeline.

**Full template unification** (Handlebars vs React Email vs HTML) is a Sprint 3 item — too much risk to rush.

**Files to create/change:**
- `packages/email-shared/` (new package)
- `packages/email-shared/src/layouts/base.html`
- `turbo.json` (add email-shared to build pipeline)
- `apps/api/src/mail/templates/*.{tsx,html}` (wrap with base)
- `apps/pos-backend/` (update templates)
- `package.json` (add `@repo/email-shared` to api + pos-backend)

**Acceptance criteria:** Change the logo URL in `packages/email-shared/src/layouts/base.html` — all apps pick up the change after rebuild. No duplicated header/footer markup across apps.

---

## Phase 2 — Sprint 2 (Medium Priority)

---

### P2-01: Branch Deploy Tooling + Feature Branch Subdomains

**Source:** §14 (Branch Strategy) — ❌ NOT DONE  
**Audit verdict:** Explicitly out of scope for repair cycle

**Why it matters:** Currently CI only builds on `main`. Feature branches must be reviewed in a shared staging environment, creating a review bottleneck when multiple features are in flight.

**Implementation:**

**Step 1 — Add a `deploy-preview.yml` GitHub Actions workflow:**
```yaml
name: Deploy Preview
on:
  pull_request:
    types: [opened, synchronize]
    branches: [main]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build preview images
        run: |
          docker build -t ghcr.io/${{ github.repository }}/api:pr-${{ github.event.number }} ./apps/api
          docker push ghcr.io/${{ github.repository }}/api:pr-${{ github.event.number }}

      - name: Deploy to preview server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PREVIEW_SERVER_HOST }}
          key: ${{ secrets.PREVIEW_SERVER_SSH_KEY }}
          script: |
            PR=${{ github.event.number }}
            SUBDOMAIN="pr-${PR}.preview.yourdomain.com"
            # Deploy isolated stack with unique project name
            docker compose -p stockix-pr-${PR} \
              -f infra/preview/docker-compose.yml \
              up -d

      - name: Comment preview URL on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview deployed: https://pr-${{ github.event.number }}.preview.yourdomain.com'
            })
```

**Step 2 — Create `infra/preview/docker-compose.yml`:**  
Lightweight compose with only api + dashboard (no full Finance stack — too heavy for preview). Database: shared preview Postgres with per-PR schema prefix.

**Step 3 — Add cleanup workflow** `deploy-preview-cleanup.yml`:
```yaml
on:
  pull_request:
    types: [closed]
jobs:
  cleanup:
    steps:
      - run: docker compose -p stockix-pr-${{ github.event.number }} down -v
```

**Step 4 — Traefik wildcard for preview subdomains:**  
Add `*.preview.yourdomain.com` to the wildcard cert. Add a Traefik `FileProvider` rule that routes `pr-{n}.preview.yourdomain.com` to the correct container.

**Infrastructure required:**
- One additional server or extra capacity on staging for preview stacks
- DNS wildcard `*.preview.yourdomain.com → preview-server-IP`
- GitHub Secrets: `PREVIEW_SERVER_HOST`, `PREVIEW_SERVER_SSH_KEY`

**Files to create:**
- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-preview-cleanup.yml`
- `infra/preview/docker-compose.yml`
- `infra/preview/traefik-dynamic.yml` (wildcard routing rule)

**Acceptance criteria:** Open a PR → comment appears within 5 minutes with a live preview URL. Close the PR → preview stack is torn down automatically.

---

### P2-02: Legacy API Route Cleanup (Sunset 2026-09-20)

**Source:** §10 (API Design) — `Sunset: Sat, 20 Sep 2026` header already set on unversioned routes

**Why it matters:** The Sunset date is 89 days away from the audit date. Routes with `Deprecation: true` + `Sunset: 2026-09-20` headers must actually be removed on or before that date, otherwise the headers are misleading.

**Implementation:**

**Step 1 — Identify all unversioned routes with the Sunset header:**
```bash
grep -r "Sunset" apps/api/src/ --include="*.ts" -l
grep -r "Deprecation" apps/api/src/ --include="*.ts" -l
```

**Step 2 — Audit all consumers of these routes:**  
Check `apps/dashboard/`, `apps/pos-frontend2/`, and any external integrations that call unversioned endpoints. Log all callers in `docs/api-sunset-2026-09-20.md`.

**Step 3 — Migrate callers to `/v1/*` routes:**  
Update all internal dashboard and POS frontend API calls from unversioned paths to `/v1/*`.

**Step 4 — Remove the legacy route handlers on 2026-09-15** (5 days buffer before Sunset date):
```bash
# Find and remove all routes with Sunset headers
# Remove route handlers + their controllers/services
# Run pnpm run check:routes to verify no orphaned paths remain
```

**Step 5 — Verify CI route checks still pass:**
```bash
pnpm run check:routes
pnpm run check:known-paths
pnpm run check:api-structure
```

**Files to audit:**
- `apps/api/src/routes/` — all files with `Deprecation` / `Sunset` headers
- `apps/dashboard/` — all API call sites
- `apps/pos-frontend2/` — all API call sites

**Acceptance criteria:** Zero routes with `Deprecation: true` header. `pnpm run check:routes` passes. No 404s on any dashboard or POS page after route removal. Complete by 2026-09-15.

---

### P2-03: Dev-as-Prod Mirror for Local Development

**Source:** §6 (Dev vs Production Environments)  
**Audit verdict:** ACCEPTED (Post-Launch)

**Why it matters:** Local dev currently runs only Postgres + Redis (`infra/dev/docker-compose.yml`). Developers cannot reproduce provision flows, Finance stack behavior, or Traefik routing locally. Staging is shared — concurrent developers block each other.

**Implementation:**

Create `infra/dev/docker-compose.full.yml` — a full local mirror:

```yaml
# Full local stack — mirrors production topology
# Usage: docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml up

services:
  traefik:
    image: traefik:v3
    ports: ["80:80", "8080:8080"]
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    labels:
      - "traefik.http.routers.api.rule=Host(`api.localhost`)"
    environment:
      DATABASE_URL: postgresql://stockix:stockix@postgres:5432/stockix_dev
      REDIS_URL: redis://redis:6379

  dashboard:
    build: { context: ., dockerfile: apps/dashboard/Dockerfile }
    labels:
      - "traefik.http.routers.dashboard.rule=Host(`dashboard.localhost`)"

  infra-worker:
    build: { context: ., dockerfile: apps/infra-worker/Dockerfile }
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # required for tenant provisioning

  finance-demo:
    # Pre-built Finance stack for one local demo tenant
    image: ghcr.io/${{ vars.GHCR_NAMESPACE }}/stockix-finance-server:latest
    labels:
      - "traefik.http.routers.finance.rule=Host(`finance.localhost`)"
```

Add to `package.json`:
```json
"dev:full": "docker compose -f infra/dev/docker-compose.yml -f infra/dev/docker-compose.full.yml up",
"dev:minimal": "docker compose -f infra/dev/docker-compose.yml up"
```

**Acceptance criteria:** `pnpm dev:full` brings up a local stack reachable at `api.localhost`, `dashboard.localhost`. A full provision flow (new tenant → Finance stack) completes locally without hitting staging.

---

## Phase 3 — Sprint 3+ (Long-Term Optimization)

---

### P3-01: Shared Base Docker Images

**Source:** §3 (Shared Docker Images)  
**Audit verdict:** ACCEPTED (Post-Launch Optimization)

**Why it matters:** All 4 Node services (`FROM node:22-alpine`) redundantly pull the same base layers. A shared base image with pre-installed global tooling (pnpm, tini) cuts image build time and ensures all services use identical system packages.

**Implementation:**

**Step 1 — Create `infra/docker/base/Dockerfile`:**
```dockerfile
FROM node:22-alpine AS stockix-base
RUN apk add --no-cache tini dumb-init
RUN npm install -g pnpm@9
WORKDIR /app
ENTRYPOINT ["/sbin/tini", "--"]
```

**Step 2 — Publish to GHCR in `build-and-publish.yml`:**
```yaml
- name: Build and push base image
  uses: docker/build-push-action@v5
  with:
    context: infra/docker/base
    push: true
    tags: ghcr.io/${{ github.repository }}/base:node22
    cache-from: type=gha
```

**Step 3 — Update all 4 app Dockerfiles:**
```dockerfile
# BEFORE
FROM node:22-alpine

# AFTER
FROM ghcr.io/<org>/stockix/base:node22
```

**Files to change:**
- `infra/docker/base/Dockerfile` (new)
- `.github/workflows/build-and-publish.yml` (build base first)
- `apps/api/Dockerfile`
- `apps/dashboard/Dockerfile`
- `apps/infra-worker/Dockerfile`
- `services/stockix-finance/Dockerfile` (if it exists; or the build step in CI)

**Acceptance criteria:** All 4 Docker builds share the base layer (verified by `docker history` showing identical base layers). CI build time reduced by >30% for incremental pushes.

---

### P3-02: Shared UI Library Consolidation

**Source:** §2 (Shared UI Package)  
**Audit verdict:** ACCEPTED (Deferred to UI Refactor)

**Current state:**
- `@repo/ui-core` — 40+ primitives (dashboard only)
- `@repo/ui-shared` — MetaForm, MetaTable (dashboard + POS)
- Finance — entirely separate (Blueprint.js + styled-components, not from `@repo`)
- POS frontend — `data-table.tsx`, `date-range-picker.tsx` duplicated locally

**Implementation (incremental — do not attempt Finance migration first):**

**Sprint 3a — POS frontend deduplication:**
1. Audit `apps/pos-frontend2/components/` for components with equivalents in `@repo/ui-core`.
2. For each duplicate (`data-table`, `date-range-picker`, etc.): add `@repo/ui-core` as dependency, replace local component with the shared import, delete local file.
3. Run POS frontend tests after each replacement.

**Sprint 3b — MetaForm/MetaTable adoption:**  
Identify 2–3 CRUD pages in the dashboard that still use hand-rolled forms. Migrate them to `MetaForm`. Document the pattern.

**Sprint 3c — Finance UI migration (long-term, separate epic):**  
Finance uses Blueprint.js v5 on a Vite build completely separate from the Turborepo. Migration to `@repo/ui-core` requires:
- Auditing all Blueprint.js usage (180+ components estimated)
- Deciding: extend `@repo/ui-core` with Finance-specific patterns, or keep Finance isolated
- If migrating: create `packages/ui-finance/` as a thin shim that re-exports `@repo/ui-core` with Finance-specific theme overrides

**Acceptance criteria (Sprint 3a):** Zero locally duplicated component files in `apps/pos-frontend2/` that have equivalents in `@repo/ui-core`. POS frontend `pnpm build` succeeds.

---

### P3-03: Meta-Driven UI Expansion

**Source:** §13 (Meta-driven UI)  
**Audit verdict:** ACCEPTED (Technical Debt)

**Current state:** `MetaForm` and `MetaTable` exist in `packages/ui-shared/`. Only used on one page (api-keys).

**Implementation — adopt across 5+ pages in dashboard:**

Priority pages for MetaForm/MetaTable conversion (high CRUD turnover, low custom logic):

| Page | Type | Effort |
|------|------|--------|
| Tenants list | MetaTable | Low |
| Tenant detail / edit | MetaForm | Medium |
| Plans management | MetaTable + MetaForm | Medium |
| Owner management | MetaTable | Low |
| Audit log viewer | MetaTable (read-only) | Low |

**For each page:**
1. Define the schema object (columns/fields, validation, labels).
2. Replace the hand-rolled `<table>` / `<form>` with `<MetaTable schema={...} />` / `<MetaForm schema={...} />`.
3. Write a snapshot test for the schema object.

**Acceptance criteria:** 5+ dashboard pages use MetaForm or MetaTable. Adding a new column to a managed page requires only a schema change, not a JSX change.

---

### P3-04: MySQL Read Replicas

**Source:** §11 (Scalability) — "First bottleneck: Single MySQL instance"  
**Audit verdict:** ACCEPTED (By Design)

**Current state:** Single MySQL instance, 1000 max_connections, 256MB InnoDB buffer. All Finance tenant DBs co-located.

**Why this matters as you scale:** Each Finance tenant provisioned = one MySQL database. At ~50 tenants, read-heavy report generation starts competing with write transactions from active users. The shared MySQL becomes the throughput ceiling.

**Implementation (when tenant count exceeds 50):**

**Step 1 — Enable MySQL binary logging** (if not already on):
```sql
-- In MySQL config (my.cnf):
[mysqld]
log_bin = mysql-bin
binlog_format = ROW
server_id = 1
```

**Step 2 — Add a read replica container** to `infra/prod/docker-compose.yml`:
```yaml
mysql-replica:
  image: mysql:8
  environment:
    MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
  command:
    - --server-id=2
    - --log_bin=mysql-bin
    - --relay_log=relay-bin
    - --read_only=1
  deploy:
    resources:
      limits: { memory: 2g, cpus: "1.0" }
```

**Step 3 — Update Finance provisioning** to pass a `MYSQL_READ_HOST` env var alongside `MYSQL_HOST`. Report-generating services (BalanceSheet, P&L, etc.) read from replica; write operations (transactions, journal entries) use primary.

**Step 4 — Connection routing in Finance:**  
In Finance's Knex config, add a read/write split:
```typescript
const knex = Knex({
  client: 'mysql2',
  connection: isReadQuery ? process.env.MYSQL_READ_HOST : process.env.MYSQL_HOST,
});
```

**Trigger condition:** Begin this work when average report generation time exceeds 3 seconds on p95, or when MySQL `SHOW PROCESSLIST` regularly shows >50 active connections.

**Acceptance criteria:** Balance Sheet report P95 latency drops by >40% under load. `SHOW SLAVE STATUS\G` on replica shows `Seconds_Behind_Master: 0`.

---

## Implementation Ownership Matrix

| ID | Item | Phase | Owner | Est. Effort | Hard Deadline |
|----|------|-------|-------|-------------|---------------|
| P0-01 | Swarm init on prod server | 0 | DevOps | 30min | Before deploy |
| P0-02 | Bootstrap Docker secrets | 0 | DevOps | 20min | Before deploy |
| P0-03 | Add GitHub Actions secrets | 0 | DevOps | 10min | Before deploy |
| P0-04 | DR drill + commit log | 0 | Any engineer | 1h | Before deploy |
| P0-05 | Verify B2 backup live | 0 | DevOps | 30min | Before deploy |
| P1-01 | Redis provision pub/sub bus | 1 | Backend | 1 day | Sprint 1 |
| P1-02 | License sync reconciliation job | 1 | Backend | 4h | Sprint 1 |
| P1-03 | SPF/DKIM/DMARC verify script | 1 | DevOps | 2h | Sprint 1 |
| P1-04 | Email template shared base | 1 | Full-stack | 1 day | Sprint 1 |
| P2-01 | Branch deploy + preview URLs | 2 | DevOps | 2 days | Sprint 2 |
| P2-02 | Legacy API route cleanup | 2 | Backend | 1 day | **2026-09-15** |
| P2-03 | Dev-as-prod local mirror | 2 | DevOps | 1 day | Sprint 2 |
| P3-01 | Shared base Docker images | 3 | DevOps | 4h | Sprint 3 |
| P3-02 | Shared UI lib consolidation | 3 | Frontend | 3 days | Sprint 3 |
| P3-03 | Meta-driven UI expansion | 3 | Frontend | 3 days | Sprint 3 |
| P3-04 | MySQL read replicas | 3 | Backend/DevOps | 2 days | At 50 tenants |

---

## Definition of Done (Full Plan)

### Phase 0 complete when:
- [ ] `docker node ls` shows Swarm Leader on prod
- [ ] `docker secret ls` shows 10 secrets
- [ ] `deploy-production.yml` verify-staging gate passes
- [ ] DR drill log committed with `RESTORE_TESTED: YES`
- [ ] B2 backup metric visible in Grafana (< 1h since last backup)

### Phase 1 complete when:
- [ ] `docker service scale stockix_api=2` works without breaking provision SSE
- [ ] License divergence test: artificially stale license re-synced within 24h by reconcile job
- [ ] `bash scripts/verify-email-dns.sh <domain>` exits 0 on production domain
- [ ] Email header/footer change in `packages/email-shared/` propagates to all 3 apps

### Phase 2 complete when:
- [ ] PR open → preview URL comment in <5 minutes
- [ ] PR close → preview stack removed automatically
- [ ] Zero dashboard/POS calls to unversioned API routes
- [ ] `pnpm dev:full` starts full local stack in one command

### Phase 3 complete when:
- [ ] All 4 Docker images FROM `ghcr.io/.../base:node22`
- [ ] Zero duplicated component files in `apps/pos-frontend2/`
- [ ] 5+ dashboard pages use MetaForm/MetaTable
- [ ] MySQL read replica serving Finance report queries (when needed)

---

*Plan based on finalprod.md audit — 2026-06-22. All P0 items must be completed before the first production deploy.*
