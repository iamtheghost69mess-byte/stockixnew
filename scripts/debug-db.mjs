import postgres from "postgres";
import { loadRootEnv } from "./load-root-env.mjs";

loadRootEnv(import.meta.url);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(databaseUrl)) {
  console.error("Refusing to run: DATABASE_URL must target localhost for safety.");
  process.exit(1);
}

const sql = postgres(databaseUrl);

try {
  const cols = await sql.unsafe(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'owners' order by ordinal_position",
  );
  console.log("owners columns:", cols.map((c) => c.column_name));

  const migrations = await sql.unsafe(
    "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 10",
  );
  console.log("migrations:", migrations);
} finally {
  await sql.end({ timeout: 1 });
}
