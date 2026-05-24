export function composeProjectName(slug: string): string {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

/** Docker named volume for MariaDB; unique per tenant slug (avoids cross-stack datadir contention). */
export function tenantMysqlVolumeName(slug: string): string {
  return `${composeProjectName(slug)}-mysql`;
}
