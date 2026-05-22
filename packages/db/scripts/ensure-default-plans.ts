/**
 * Ensures default billing plans exist (starter, growth, pro, enterprise).
 * Safe to run after every migrate — uses ON CONFLICT DO NOTHING.
 */
import { dbConfig } from "@repo/config";
import postgres from "postgres";

const url = dbConfig.databaseUrl;

const DEFAULT_PLANS = [
  { name: "Starter", slug: "starter", sortOrder: 1, description: "For small businesses getting started" },
  { name: "Growth", slug: "growth", sortOrder: 2, description: "For growing teams needing more power" },
  { name: "Pro", slug: "pro", sortOrder: 3, description: "For established businesses at scale" },
  {
    name: "Enterprise",
    slug: "enterprise",
    sortOrder: 4,
    description: "Custom pricing for large operations",
  },
] as const;

export async function ensureDefaultPlans(sql: postgres.Sql): Promise<number> {
  let inserted = 0;
  for (const plan of DEFAULT_PLANS) {
    const rows = await sql`
      INSERT INTO plans (name, slug, sort_order, description, is_active, is_public, max_organizations, max_activations)
      VALUES (
        ${plan.name},
        ${plan.slug},
        ${plan.sortOrder},
        ${plan.description},
        true,
        true,
        1,
        1
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) inserted += 1;
  }
  return inserted;
}

async function main(): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const inserted = await ensureDefaultPlans(sql);
    if (inserted > 0) {
      console.log(`Seeded ${inserted} default plan(s).`);
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

void main();
