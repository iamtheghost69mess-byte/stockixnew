import mysql from "mysql2/promise";

const host = process.env.WORKER_SHARED_MYSQL_HOST || "127.0.0.1";
const password = process.env.SHARED_MYSQL_ROOT_PASSWORD;
if (!password) {
  console.error("SHARED_MYSQL_ROOT_PASSWORD missing");
  process.exit(1);
}

const suffix = process.argv[2] ?? "mq3zk";
const conn = await mysql.createConnection({
  host,
  port: 3306,
  user: "root",
  password,
});

const [dbs] = await conn.query("SHOW DATABASES LIKE 'stockix_tenant_%'");
console.log("databases:", dbs);

const dbRow = dbs[0];
const dbName = dbRow
  ? Object.values(dbRow)[0]
  : null;
if (!dbName) {
  await conn.end();
  process.exit(0);
}

const [cols] = await conn.query(`DESCRIBE \`${dbName}\`.contacts`);
console.log(
  "contacts:",
  cols.map((r) => `${r.Field}:${r.Null}:${r.Default ?? "null"}`).join("\n  "),
);

try {
  const [insert] = await conn.query(
    `INSERT INTO \`${dbName}\`.contacts (contact_service, contact_type, display_name, currency_code, active, balance, opening_balance, opening_balance_exchange_rate, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [
      "customer",
      "individual",
      "Walk-in Customer TEST",
      "USD",
      1,
      0,
      0,
      1,
      "",
    ],
  );
  console.log("test insert ok", insert.insertId);
  await conn.query(`DELETE FROM \`${dbName}\`.contacts WHERE id = ?`, [
    insert.insertId,
  ]);
} catch (err) {
  console.error("test insert failed:", err.code, err.sqlMessage ?? err.message);
}

await conn.end();
