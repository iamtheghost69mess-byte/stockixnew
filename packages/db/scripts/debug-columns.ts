import postgres from "postgres";
import { dbConfig } from "@repo/config";

const sql = postgres(
  dbConfig.databaseUrl ?? "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform",
);

try {
  const cols = await sql.unsafe(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'owners' order by ordinal_position",
  );
  console.log("owners columns:", cols.map((c) => c.column_name));

  const migrations = await sql.unsafe(
    "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 20",
  );
  console.log("migrations:", migrations);
} catch (error) {
  console.error(error);
} finally {
  await sql.end({ timeout: 1 });
}
