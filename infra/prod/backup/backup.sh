#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="stockix_platform_${TIMESTAMP}.dump.gz.gpg"

# Mandatory encryption key check
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set}"

# Backblaze B2 config (S3-compatible)
B2_BUCKET="${BACKUP_B2_BUCKET:?BACKUP_B2_BUCKET not set}"
B2_KEY_ID="${BACKUP_B2_KEY_ID:?BACKUP_B2_KEY_ID not set}"
B2_APP_KEY="${BACKUP_B2_APP_KEY:?BACKUP_B2_APP_KEY not set}"
B2_ENDPOINT="${BACKUP_B2_ENDPOINT:?BACKUP_B2_ENDPOINT not set}"
# Format: https://s3.<region>.backblazeb2.com

B2_PREFIX="${BACKUP_B2_PREFIX:-stockix-platform-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_CONTAINER="${BACKUP_POSTGRES_CONTAINER:-stockix-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-stockix_platform}"

# Configure credentials for this process (S3-compatible auth)
aws configure set aws_access_key_id "$B2_KEY_ID" >/dev/null
aws configure set aws_secret_access_key "$B2_APP_KEY" >/dev/null

echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) Starting backup..."

docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  | gzip \
  | gpg --symmetric --batch --yes --passphrase "$BACKUP_ENCRYPTION_KEY" --cipher-algo AES256 > "/tmp/${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "/tmp/${BACKUP_FILE}" | cut -f1)
echo "[backup] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

BACKUP_BYTES=$(stat -c%s "/tmp/${BACKUP_FILE}" 2>/dev/null || stat -f%z "/tmp/${BACKUP_FILE}")
if [ "$BACKUP_BYTES" -lt 10240 ]; then
  echo "[backup] ERROR: Backup file suspiciously small (${BACKUP_BYTES} bytes) � aborting upload"
  rm -f "/tmp/${BACKUP_FILE}"
  exit 1
fi

aws --endpoint-url "${B2_ENDPOINT}" s3 cp \
  "/tmp/${BACKUP_FILE}" \
  "s3://${B2_BUCKET}/${B2_PREFIX}/${BACKUP_FILE}" \
  --storage-class STANDARD

echo "[backup] Uploaded: s3://${B2_BUCKET}/${B2_PREFIX}/${BACKUP_FILE}"
rm -f "/tmp/${BACKUP_FILE}"

echo "[backup] Pruning backups older than ${RETENTION_DAYS} days..."
CUTOFF_EPOCH=$(( $(date +%s) - RETENTION_DAYS * 86400 ))
CUTOFF_DATE=$(date -u -d "@${CUTOFF_EPOCH}" +%Y%m%d 2>/dev/null \
  || date -u -r "${CUTOFF_EPOCH}" +%Y%m%d)

aws --endpoint-url "${B2_ENDPOINT}" s3 ls "s3://${B2_BUCKET}/${B2_PREFIX}/" \
  | awk '{print $4}' \
  | while read -r fname; do
      [ -z "$fname" ] && continue
      FILE_DATE=$(echo "$fname" | grep -oE '[0-9]{8}' | head -1)
      if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
        aws --endpoint-url "${B2_ENDPOINT}" s3 rm "s3://${B2_BUCKET}/${B2_PREFIX}/${fname}"
        echo "[backup] Pruned: ${fname}"
      fi
    done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/backup-shared.sh" ]; then
  bash "${SCRIPT_DIR}/backup-shared.sh"
fi

echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) Backup complete."
echo "[backup] Retention: ${RETENTION_DAYS} days | Bucket: ${B2_BUCKET}/${B2_PREFIX}"
