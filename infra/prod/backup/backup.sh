#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="stockix_platform_${TIMESTAMP}.dump.gz"
S3_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET not set}"
S3_PREFIX="${BACKUP_S3_PREFIX:-stockix-platform-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_CONTAINER="${BACKUP_POSTGRES_CONTAINER:-stockix-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-stockix_platform}"

echo "[backup] Starting platform backup at $TIMESTAMP"

docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  --format=custom \
  | gzip > "/tmp/$BACKUP_FILE"

aws s3 cp "/tmp/$BACKUP_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILE"
echo "[backup] Uploaded: s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILE"
rm -f "/tmp/$BACKUP_FILE"

CUTOFF=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-"${RETENTION_DAYS}"d +%Y-%m-%d)
aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | awk '{print $4}' | while read -r f; do
  FILE_DATE=$(echo "$f" | grep -oE '[0-9]{8}' | head -1 | sed 's/\(....\)\(..\)\(..\)/\1-\2-\3/')
  if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF" ]]; then
    aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/$f" || true
    echo "[backup] Pruned old backup: $f"
  fi
done

echo "[backup] Backup complete. Retention: ${RETENTION_DAYS} days."
