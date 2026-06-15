# Production backups (Postgres + shared MySQL + Mongo)

The `db-backup` service in [`../docker-compose.yml`](../docker-compose.yml) runs [`backup.sh`](backup.sh) on a cron schedule (**02:00 and 14:00 UTC**).

## What is backed up

| Target | Script | B2 object prefix |
|--------|--------|------------------|
| Control plane Postgres | `backup.sh` | `stockix_platform_*.dump.gz` |
| Shared MySQL (all tenant schemas) | `backup-shared.sh` | `shared_mysql_*.sql.gz` |
| Shared Mongo (all `{slug}_pos` DBs, oplog) | `backup-shared.sh` | `shared_mongo_*.archive.gz` |

Uploads use Backblaze B2 (S3-compatible API).

## Required environment (`infra/prod/.env`)

- `BACKUP_B2_BUCKET`, `BACKUP_B2_KEY_ID`, `BACKUP_B2_APP_KEY`, `BACKUP_B2_ENDPOINT`
- `BACKUP_B2_PREFIX` (default `stockix-platform-backups`)
- `BACKUP_RETENTION_DAYS` (default `30`)
- `SHARED_MYSQL_ROOT_PASSWORD` (required for MySQL dump; Mongo dump runs without it)
- Optional overrides: `BACKUP_POSTGRES_CONTAINER`, `BACKUP_MYSQL_CONTAINER`, `BACKUP_MONGO_CONTAINER`

Shared stack must be running (`stockix-shared` project) before MySQL/Mongo dumps succeed.

## Manual run

```bash
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env \
  run --rm db-backup /backup/backup.sh
```

## Restore (sketch)

**Postgres:** download `.dump.gz`, `gunzip`, `pg_restore` into `stockix_platform` (see [`../OPERATIONS.md`](../OPERATIONS.md)).

**MySQL:** `gunzip -c shared_mysql_*.sql.gz | docker exec -i stockix-shared-stockix-mysql-1 mysql -uroot -p`

**Mongo:** `docker exec -i stockix-shared-stockix-mongo-1 mongorestore --gzip --archive --drop` (test on staging first).

Verify restores in staging before relying on backups for production recovery.
