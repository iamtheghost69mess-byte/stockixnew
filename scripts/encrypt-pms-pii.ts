/**
 * Data migration script: encrypt existing plaintext PMS guest PII fields.
 *
 * Prerequisites:
 *   - PMS_FIELD_ENCRYPTION_KEY env var must be set (64 hex chars = 32 bytes).
 *   - DATABASE_URL must point to the PMS database.
 *
 * Run:
 *   PMS_FIELD_ENCRYPTION_KEY=<key> DATABASE_URL=<url> npx tsx scripts/encrypt-pms-pii.ts [--dry-run]
 *
 * Idempotent: already-encrypted values (prefix "enc:v1:") are skipped.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, isNotNull, or } from "drizzle-orm";
import { pmsGuests } from "../packages/pms-db/src/schema.js";
import { encryptPmsField } from "../services/pms/src/lib/pii-crypto.js";

const PII_FIELDS = [
  "nationality",
  "dateOfBirth",
  "idNumber",
  "passportNumber",
  "passportExpiry",
  "issuedBy",
  "visaNumber",
  "visaFrom",
  "visaTo",
] as const;

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required");

  const key = process.env.PMS_FIELD_ENCRYPTION_KEY?.trim();
  if (!key || key.length !== 64) throw new Error("PMS_FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");

  const sql = postgres(dbUrl, { max: 1 });
  const db = drizzle(sql);

  const rows = await db
    .select({ id: pmsGuests.id, ...Object.fromEntries(PII_FIELDS.map((f) => [f, pmsGuests[f]])) })
    .from(pmsGuests);

  console.log(`Found ${rows.length} guest rows to process.`);

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of rows) {
    const updates: Partial<typeof pmsGuests.$inferInsert> = {};
    let needsUpdate = false;

    for (const field of PII_FIELDS) {
      const value = row[field] as string | null | undefined;
      if (!value || value.startsWith("enc:v1:")) continue;
      updates[field] = encryptPmsField(value);
      needsUpdate = true;
    }

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] Would encrypt PII for guest ${row.id}: fields=${Object.keys(updates).join(", ")}`);
      updated++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        const { eq } = await import("drizzle-orm");
        await tx.update(pmsGuests).set({ ...updates, updatedAt: new Date() }).where(eq(pmsGuests.id, row.id));

        // Verify: read back and decrypt
        const [verify] = await tx.select(Object.fromEntries(PII_FIELDS.map((f) => [f, pmsGuests[f]]))).from(pmsGuests).where(eq(pmsGuests.id, row.id)).limit(1);
        const { decryptPmsField } = await import("../services/pms/src/lib/pii-crypto.js");
        for (const field of PII_FIELDS) {
          if (field in updates) {
            const decrypted = decryptPmsField(verify[field] as string | null);
            const original = row[field] as string | null;
            if (decrypted !== original) throw new Error(`Verification failed for guest ${row.id} field ${field}`);
          }
        }
      });
      updated++;
      if (updated % 100 === 0) console.log(`Progress: ${updated} updated, ${skipped} skipped, ${errored} errors`);
    } catch (err) {
      errored++;
      console.error(`Error processing guest ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  await sql.end();
  console.log(`\nDone. Updated: ${updated}, Skipped (already encrypted): ${skipped}, Errors: ${errored}`);
  if (errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
