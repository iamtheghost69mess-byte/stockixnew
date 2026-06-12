export function composeProjectName(slug: string): string {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

/** Docker named volume for MariaDB; unique per tenant slug (avoids cross-stack datadir contention). */
export function tenantMysqlVolumeName(slug: string): string {
  return `${composeProjectName(slug)}-mysql`;
}

/** Docker auto-named volume for MongoDB; Compose generates <project>_mongo since no explicit name: is set. */
export function tenantMongoVolumeName(slug: string): string {
  return `${composeProjectName(slug)}_mongo`;
}
