# Stockix Local Development — Professional Setup

## Single Source of Truth: `.env` 

All configuration originates from the **root `.env` file** (`.env` + `.env.local` overrides).

### Setup (One-time)

```bash
# 1. Bootstrap environment from templates
pnpm bootstrap:env

# 2. Start database (fixes port 54330 Windows conflict if needed)
# For Windows Hyper-V port conflicts, .env contains: POSTGRES_HOST_PORT=15432
pnpm db:up && pnpm db:wait && pnpm db:migrate && pnpm db:seed:local
```

### Daily Development

```bash
# Start everything (API + Dashboard + Worker + PMS)
pnpm dev

# Or individual services:
pnpm dev:apps                # API + Dashboard only (fastest)
pnpm dev:pms:stack         # PMS API + UI
```

Login credentials are in `.env`:
- **Platform admin**: `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`  
- **Dashboard**: http://127.0.0.1:3000
- **API**: http://127.0.0.1:4000
- **PMS**: http://127.0.0.1:3003

---

## Fixed: Slow Builds & Constant Rebuilding

### What Was Fixed

1. **Database Migrations** — Applied all 54 migrations including new `0054_tenant_status_failed`
2. **Windows Port Binding** — Set `POSTGRES_HOST_PORT=15432` to bypass Hyper-V reserved ports (54247–54346)
3. **Next.js Watch Options** — Optimized webpack ignore patterns to prevent unrelated file changes from triggering rebuilds
   - Ignores: `node_modules`, `.turbo`, `infra/`, `services/`, `.claude/`
   - Aggregation timeout: 500ms (was 300ms)

### Environment Configuration

**Root `.env` loads automatically into:**
- `apps/api/src/index.ts` (via `@repo/config`)
- `apps/dashboard/next.config.ts` (via `loadEnvFilesAtRoot()`)
- All dev scripts (`scripts/dev-*.mjs`)

**Override locally (never commit):**
```bash
# Copy for machine-specific overrides
cp .env .env.local
# Edit .env.local with your settings
```

---

## Performance Tips

### Skip POS (speeds up startup 2–3x if not needed)
```bash
STOCKIX_DEV_SKIP_POS=1 pnpm dev
```

### Reuse API across multiple dashboard sessions
```bash
# Terminal 1: Start API once
pnpm dev:apps -- --filter api

# Terminal 2+: Start dashboard only (reuses API on 4000)
STOCKIX_DEV_REUSE_API=1 pnpm dev:apps -- --filter dashboard
```

### Kill stale dev processes
```bash
pnpm dev:kill
```

---

## Database Operations

| Command | Purpose |
|---------|---------|
| `pnpm db:up` | Start Postgres + Redis |
| `pnpm db:down` | Stop containers |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed:local` | Seed platform admin |
| `pnpm db:seed:pms-demo` | Seed PMS demo tenant |
| `pnpm db:reset:local` | Full reset (drop + recreate) |

---

## Troubleshooting

### "Failed to bind port" (Windows)
✅ **Fixed**: `.env` now has `POSTGRES_HOST_PORT=15432`

### Dashboard keeps rebuilding
✅ **Fixed**: Next.js watch options optimized in `apps/dashboard/next.config.ts`

### API not starting
1. Check port 4000 is free: `netstat -ano | findstr :4000` (Windows)
2. Run `pnpm dev:kill` to clean up stale processes
3. Restart with `pnpm dev`

### Database migration fails
1. Ensure all migrations exist: `ls packages/db/drizzle/ | wc -l` (should be 54)
2. Check database is healthy: `pnpm db:wait`
3. Reset if needed: `pnpm db:reset:local`

---

## Architecture

```
pnpm dev (dev-stockix.mjs)
├── Load .env + .env.local
├── Docker: Postgres (port 54330) + Redis
├── Migrations: 54 applied
├── API (port 4000) ← waits for healthy API before proceeding
├── Dashboard (port 3000) ← Node/tsx + Next.js webpack with optimized watch
├── Worker (port 9090)
└── POS (port 3001) ← skip with STOCKIX_DEV_SKIP_POS=1
```

**Key files for configuration:**
- `.env` / `.env.local` — Single source of truth ✅
- `scripts/load-root-env.mjs` — Loads env in dev scripts
- `packages/config/index.ts` — Loads env in API/Dashboard
- `apps/dashboard/next.config.ts` — Webpack watch optimization
- `infra/dev/docker-compose.yml` — Database port mapping

---

## Next Steps

- Run `pnpm dev` and verify all services start without rebuilding
- Test API health: `curl http://127.0.0.1:4000/health`
- Login to dashboard: http://127.0.0.1:3000
- Tail logs: `docker logs -f dev-postgres-1`
