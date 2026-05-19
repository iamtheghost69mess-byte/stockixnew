import { tenants } from "./schema.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

type Db = PostgresJsDatabase<typeof schema>;

const ORG_NUMBER_PATTERN = /^ORG-(\d+)$/;

/**
 * Allocates the next ORG-##### organization number across Stockix tenants.
 */
export async function allocateOrganizationNumber(db: Db): Promise<string> {
  const rows = await db
    .select({ organizationNumber: tenants.organizationNumber })
    .from(tenants);

  let max = 0;
  for (const row of rows) {
    const value = row.organizationNumber;
    if (!value) continue;
    const match = value.match(ORG_NUMBER_PATTERN);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1]!, 10));
    }
  }

  return `ORG-${String(max + 1).padStart(5, "0")}`;
}
