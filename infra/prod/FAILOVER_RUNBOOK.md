# EC2 Failover Runbook

## When to use this

Primary EC2 is unreachable or control-plane services are down.

## Decision tree

| Symptom | Action |
|---------|--------|
| Instance running, apps unhealthy | [Step A — Container restart](#step-a--container-restart-25-minutes) |
| Instance stopped/terminated | [Step B — Instance recovery](#step-b--instance-recovery-1560-minutes) |

## Step A — Container restart (2–5 minutes)

```bash
ssh deploy@<PRIMARY_EC2_IP>
cd /opt/stockix/stockixnew/infra/prod
docker compose --env-file .env restart
sleep 30
curl -fsS "https://api.${ROOT_DOMAIN}/ready"
```

## Step B — Instance recovery (15–60 minutes)

### Option 1 — Reboot instance

1. AWS Console → EC2 → Instance state → **Reboot**
2. Wait 3–5 minutes
3. Verify `restart: unless-stopped` services came back: `docker compose ps`

### Option 2 — Restore on spare instance

1. Launch spare EC2 (same region/VPC security groups as production)
2. Clone repo and install deps:

```bash
git clone <REPO_URL> /opt/stockix/stockixnew
cd /opt/stockix/stockixnew
corepack enable && pnpm install --frozen-lockfile
```

3. Copy `infra/prod/.env` from secure backup (never from git)
4. Download latest B2 backup:

```bash
source infra/prod/.env
AWS_ACCESS_KEY_ID=$BACKUP_B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BACKUP_B2_APP_KEY \
aws s3 ls "s3://$BACKUP_B2_BUCKET/$BACKUP_B2_PREFIX/" \
  --endpoint-url "$BACKUP_B2_ENDPOINT" | sort | tail -5
```

5. Restore Postgres (see `infra/prod/OPERATIONS.md` § Restore procedure)
6. Deploy:

```bash
cd infra/prod
docker compose --env-file .env up -d --build --wait
```

7. Update Cloudflare A records for API and dashboard to spare instance IP (TTL 60s recommended before drill)
8. Verify: `curl -fsS https://api.<ROOT_DOMAIN>/ready`

## Recovery time objectives

| Scenario | Typical time |
|----------|----------------|
| Container restart | 2–5 min |
| Instance reboot | 10–20 min |
| Full backup restore + DNS | 30–90 min |
| DNS propagation (TTL 60s) | 1–5 min |

## Quarterly DR drill

- [ ] Restore latest B2 dump to non-production instance
- [ ] Verify `/ready` and dashboard login
- [ ] Record in `infra/prod/OPERATIONS.md`: `DR drill passed: YYYY-MM-DD`
