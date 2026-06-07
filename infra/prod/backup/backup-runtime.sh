#!/bin/bash
# Runtime assets: Redis RDB, Traefik dynamic config, encrypted tenant env dirs.
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

B2_BUCKET="${BACKUP_B2_BUCKET:?BACKUP_B2_BUCKET not set}"
B2_KEY_ID="${BACKUP_B2_KEY_ID:?BACKUP_B2_KEY_ID not set}"
B2_APP_KEY="${BACKUP_B2_APP_KEY:?BACKUP_B2_APP_KEY not set}"
B2_ENDPOINT="${BACKUP_B2_ENDPOINT:?BACKUP_B2_ENDPOINT not set}"
B2_PREFIX="${BACKUP_B2_PREFIX:-stockix-platform-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

REDIS_CONTAINER="${HEALTH_REDIS_CONTAINER:-stockix-shared-stockix-redis-1}"
TENANT_REDIS_PASSWORD="${TENANT_REDIS_PASSWORD:-}"
TRAEFIK_DIR="${TRAEFIK_DYNAMIC_DIR:-/traefik-dynamic}"
TENANT_ENVS_DIR="${TENANT_ENV_ROOT:-/tenant-envs}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

aws configure set aws_access_key_id "$B2_KEY_ID" >/dev/null
aws configure set aws_secret_access_key "$B2_APP_KEY" >/dev/null

upload_backup() {
  local local_file="$1"
  local remote_name="$2"
  local bytes
  bytes=$(stat -c%s "$local_file" 2>/dev/null || stat -f%z "$local_file")
  if [ "$bytes" -lt 512 ]; then
    echo "[backup-runtime] ERROR: ${remote_name} suspiciously small (${bytes} bytes)"
    rm -f "$local_file"
    return 1
  fi
  aws --endpoint-url "${B2_ENDPOINT}" s3 cp \
    "$local_file" \
    "s3://${B2_BUCKET}/${B2_PREFIX}/${remote_name}" \
    --storage-class STANDARD
  echo "[backup-runtime] Uploaded: s3://${B2_BUCKET}/${B2_PREFIX}/${remote_name}"
  rm -f "$local_file"
}

prune_prefix() {
  local prefix_pattern="$1"
  local cutoff_epoch=$(( $(date +%s) - RETENTION_DAYS * 86400 ))
  local cutoff_date
  cutoff_date=$(date -u -d "@${cutoff_epoch}" +%Y%m%d 2>/dev/null \
    || date -u -r "${cutoff_epoch}" +%Y%m%d)
  aws --endpoint-url "${B2_ENDPOINT}" s3 ls "s3://${B2_BUCKET}/${B2_PREFIX}/" \
    | awk '{print $4}' \
    | grep -E "^${prefix_pattern}" || true \
    | while read -r fname; do
        [ -z "$fname" ] && continue
        FILE_DATE=$(echo "$fname" | grep -oE '[0-9]{8}' | head -1)
        if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$cutoff_date" ]; then
          aws --endpoint-url "${B2_ENDPOINT}" s3 rm "s3://${B2_BUCKET}/${B2_PREFIX}/${fname}"
          echo "[backup-runtime] Pruned: ${fname}"
        fi
      done
}

echo "[backup-runtime] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting runtime asset backup..."

REDIS_FILE="/tmp/redis_${TIMESTAMP}.rdb"
REDIS_CLI=(docker exec "$REDIS_CONTAINER" redis-cli)
if [ -n "$TENANT_REDIS_PASSWORD" ] && [ "$TENANT_REDIS_PASSWORD" != "__MUST_OVERRIDE__" ]; then
  REDIS_CLI+=(-a "$TENANT_REDIS_PASSWORD")
fi
"${REDIS_CLI[@]}" BGSAVE >/dev/null
sleep 2
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "$REDIS_FILE"
upload_backup "$REDIS_FILE" "redis/redis_${TIMESTAMP}.rdb"
prune_prefix "redis/redis_"

if [ -d "$TRAEFIK_DIR" ]; then
  TRAEFIK_FILE="/tmp/traefik_${TIMESTAMP}.tar.gz"
  tar -czf "$TRAEFIK_FILE" -C "$TRAEFIK_DIR" .
  upload_backup "$TRAEFIK_FILE" "traefik/traefik_${TIMESTAMP}.tar.gz"
  prune_prefix "traefik/traefik_"
else
  echo "[backup-runtime] WARN: TRAEFIK dynamic dir missing at ${TRAEFIK_DIR} — skipping"
fi

if [ -d "$TENANT_ENVS_DIR" ]; then
  if [ -z "$BACKUP_ENCRYPTION_KEY" ] || [ "$BACKUP_ENCRYPTION_KEY" = "__MUST_OVERRIDE__" ]; then
    echo "[backup-runtime] ERROR: BACKUP_ENCRYPTION_KEY must be set for tenant-env backups"
    exit 1
  fi
  TENANT_ENV_FILE="/tmp/tenant_envs_${TIMESTAMP}.tar.gz.gpg"
  tar -czf - -C "$TENANT_ENVS_DIR" . \
    | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_ENCRYPTION_KEY" \
      -o "$TENANT_ENV_FILE"
  upload_backup "$TENANT_ENV_FILE" "tenant-envs/tenant_envs_${TIMESTAMP}.tar.gz.gpg"
  prune_prefix "tenant-envs/tenant_envs_"
else
  echo "[backup-runtime] WARN: tenant env root missing at ${TENANT_ENVS_DIR} — skipping"
fi

echo "[backup-runtime] $(date -u +%Y-%m-%dT%H:%M:%SZ) Runtime backup complete."
