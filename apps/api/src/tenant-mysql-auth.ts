/**
 * MySQL app-user rejections during BigCapital migration are usually caused by an
 * existing Docker volume that was initialized with different DB_* secrets than the
 * current tenant `.env`. Retrying migration does not fix that.
 */

/** True if Docker / mysql client output indicates wrong app password (not transient). */
export function isMysqlAppCredentialMismatch(output: string): boolean {
  const s = output.toLowerCase();
  return (
    s.includes("er_access_denied") ||
    s.includes("access denied for user")
  );
}

export function mysqlCredentialMismatchHint(slug: string): string {
  return (
    `MySQL rejected DB_PASSWORD for this tenant (credentials out of sync with the existing MySQL data volume). ` +
    `Retries do not fix this. Production-safe repair (align DB user to tenant .env): ` +
    `pnpm repair:tenant-mysql -- ${slug}`
  );
}
