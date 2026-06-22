import postgres from "postgres";

async function run() {
  const client = postgres("postgres://postgres:postgres@localhost:54330/stockix_platform");
  
  try {
    await client`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "chatwoot_account_id" text;`;
    console.log("Column added successfully!");
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();
