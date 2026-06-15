# Shared infrastructure monitoring

[`healthcheck.sh`](healthcheck.sh) probes the `stockix-shared` stack via `docker exec`:

- MySQL: `mysqladmin ping`
- MongoDB: `rs.status().ok === 1`
- Redis: `redis-cli ping`

## Environment

Set in `infra/prod/.env` (see `.env.example`):

- `SHARED_MYSQL_ROOT_PASSWORD` — required for MySQL ping
- `ALERT_WEBHOOK_URL` — optional; JSON `{"text":"..."}` POST on failure (Slack-compatible incoming webhook)
- `HEALTH_MYSQL_CONTAINER`, `HEALTH_MONGO_CONTAINER`, `HEALTH_REDIS_CONTAINER` — override container names if project prefix differs

## Cron example (host)

```bash
# Every 5 minutes
*/5 * * * * SHARED_MYSQL_ROOT_PASSWORD='...' ALERT_WEBHOOK_URL='https://...' \
  /opt/stockix/stockixnew/infra/prod/monitoring/healthcheck.sh >> /var/log/stockix-health.log 2>&1
```

Requires Docker CLI on the host and running `stockix-shared` containers.

## Manual run

```bash
export SHARED_MYSQL_ROOT_PASSWORD='...'
export ALERT_WEBHOOK_URL='https://hooks.slack.com/...'  # optional
bash infra/prod/monitoring/healthcheck.sh
echo $?  # 0 = healthy
```
