import { apiConfig } from "@repo/config";
import { createDb } from "@repo/db";
import { owners } from "@repo/db/schema";
import { isNotNull } from "drizzle-orm";
import { encryptMfaSecret } from "../services/mfa/mfa.js";

async function run() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const hex = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY of 64 hex characters is required to encrypt legacy MFA secrets");
  }

  const db = createDb(databaseUrl);
  const allOwners = await db
    .select({ id: owners.id, email: owners.email, mfaSecret: owners.mfaSecret })
    .from(owners)
    .where(isNotNull(owners.mfaSecret));

  let migratedCount = 0;
  for (const owner of allOwners) {
    const secret = owner.mfaSecret;
    if (secret && !secret.startsWith("enc:v1:")) {
      const encrypted = encryptMfaSecret(secret);
      await db
        .update(owners)
        .set({ mfaSecret: encrypted })
        .where(eq(owners.id, owner.id));
      migratedCount++;
      process.stdout.write(`Migrated MFA secret for owner: ${owner.email}\n`);
    }
  }

  process.stdout.write(`Completed migration. Total secrets migrated: ${migratedCount}\n`);
}

// Helper to keep eq defined if not imported
import { eq } from "drizzle-orm";

void run();
