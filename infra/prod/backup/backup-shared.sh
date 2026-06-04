#!/bin/bash
# Shared MySQL + Mongo backup (tenant data on stockix-shared stack).
# Invoked from backup.sh after Postgres dump.
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

B2_BUCKET="${BACKUP_B2_BUCKET:?BACKUP_B2_BUCKET not set}"
B2_KEY_ID="${BACKUP_B2_KEY_ID:?BACKUP_B2_KEY_ID not set}"
B2_APP_KEY="${BACKUP_B2_APP_KEY:?BACKUP_B2_APP_KEY not set}"
B2_ENDPOINT="${BACKUP_B2_ENDPOINT:?BACKUP_B2_ENDPOINT not set}"
B2_PREFIX="${BACKUP_B2_PREFIX:-stockix-platform-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

MYSQL_CONTAINER="${BACKUP_MYSQL_CONTAINER:-stockix-shared-stockix-mysql-1}"
MONGO_CONTAINER="${BACKUP_MONGO_CONTAINER:-stockix-shared-stockix-mongo-1}"
MYSQL_ROOT_PASSWORD="${SHARED_MYSQL_ROOT_PASSWORD:-}"

aws configure set aws_access_key_id "$B2_KEY_ID" >/dev/null
aws configure set aws_secret_access_key "$B2_APP_KEY" >/dev/null

upload_backup() {
  local local_file="$1"
  local remote_name="$2"
  local bytes
  bytes=$(stat -c%s "$local_file" 2>/dev/null || stat -f%z "$local_file")
  if [ "$bytes" -lt 1024 ]; then
    echo "[backup-shared] ERROR: ${remote_name} suspiciously small (${bytes} bytes)"
    rm -f "$local_file"
    return 1
  fi
  aws --endpoint-url "${B2_ENDPOINT}" s3 cp \
    "$local_file" \
    "s3://${B2_BUCKET}/${B2_PREFIX}/${remote_name}" \
    --storage-class STANDARD
  echo "[backup-shared] Uploaded: s3://${B2_BUCKET}/${B2_PREFIX}/${remote_name}"
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
          echo "[backup-shared] Pruned: ${fname}"
        fi
      done
}

echo "[backup-shared] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting shared data backup..."

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  echo "[backup-shared] WARN: SHARED_MYSQL_ROOT_PASSWORD unset — skipping MySQL dump"
else
  MYSQL_FILE="/tmp/shared_mysql_${TIMESTAMP}.sql.gz"
  docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
    mysqldump -uroot \
    --all-databases \
    --single-transaction \
    --routines \
    --events \
    --set-gtid-purged=OFF \
    2>/dev/null | gzip > "$MYSQL_FILE"
  upload_backup "$MYSQL_FILE" "shared_mysql_${TIMESTAMP}.sql.gz"
  prune_prefix "shared_mysql_"
fi

MONGO_FILE="/tmp/shared_mongo_${TIMESTAMP}.archive.gz"
docker exec "$MONGO_CONTAINER" \
  mongodump --quiet --oplog --gzip --archive=- > "$MONGO_FILE"
upload_backup "$MONGO_FILE" "shared_mongo_${TIMESTAMP}.archive.gz"
prune_prefix "shared_mongo_"

echo "[backup-shared] $(date -u +%Y-%m-%dT%H:%M:%SZ) Shared backup complete."
