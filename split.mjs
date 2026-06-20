import fs from "fs";

const content = fs.readFileSync("packages/db/src/schema.ts", "utf8");
const pmsMarker = "// ─── PMS: Core tables";
const idx = content.indexOf(pmsMarker);
if (idx === -1) throw new Error("Not found");

const pmsContent = content.substring(idx);
const newDbContent = content.substring(0, idx);

fs.writeFileSync(
  "packages/pms-db/src/schema.ts",
  "import { AnyPgColumn, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';\n" +
  "import { tenants, owners } from '@repo/db/schema';\n\n" +
  pmsContent
);
fs.writeFileSync("packages/db/src/schema.ts", newDbContent);
console.log("Split successful");
