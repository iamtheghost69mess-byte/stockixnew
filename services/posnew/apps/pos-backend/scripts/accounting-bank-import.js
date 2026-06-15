/**
 * Bank CSV v1 import selftest.
 * Pure-parser cases always run; persistence/dedupe cases run when MONGODB_URI is set.
 *
 * Run: node scripts/accounting-bank-import.js
 *  or: npm run test:accounting:bank-import --prefix apps/pos-backend
 */
require("dotenv").config();
const assert = require("assert");
const mongoose = require("mongoose");

const config = require("../config/config");
const bankCsvImportService = require("../services/bankCsvImportService");
const BankStatementLine = require("../models/bankStatementLineModel");

function section(name) {
  console.log(`\n── ${name} ──`);
}

function buf(text) {
  return Buffer.from(text, "utf8");
}

/* ---------------- Pure-parser cases (no DB) ---------------- */

function testHappyPathParse() {
  section("parser: happy path");
  const csv = [
    "postedAt,amount,description,externalId",
    "2026-04-10,125.50,Coffee subscription,EXT-001",
    "2026-04-11,-42.00,Stripe payout,EXT-002",
    "2026-04-12,1000.00,Owner deposit,",
  ].join("\n");
  const { rows, errors } = bankCsvImportService.parseBankCsv(buf(csv));
  assert.strictEqual(errors.length, 0, "no errors expected");
  assert.strictEqual(rows.length, 3, "3 rows parsed");
  assert.strictEqual(rows[0].amount, 125.5);
  assert.strictEqual(rows[1].amount, -42);
  assert.strictEqual(rows[0].externalId, "EXT-001");
  assert.strictEqual(rows[2].externalId, "", "missing externalId -> empty string");
  assert.ok(rows[2].dedupeKey.length > 0, "fallback dedupeKey produced");
}

function testRowErrors() {
  section("parser: row errors (bad date, bad amount)");
  const csv = [
    "postedAt,amount,description",
    "not-a-date,10.00,bad date",
    "2026-04-10,abc,bad amount",
    "2026-04-11,25.00,ok",
  ].join("\n");
  const { rows, errors } = bankCsvImportService.parseBankCsv(buf(csv));
  assert.strictEqual(rows.length, 1, "one valid row");
  assert.strictEqual(errors.length, 2, "two row errors");
  assert.ok(errors[0].reason.includes("postedAt"));
  assert.ok(errors[1].reason.includes("amount"));
}

function testLocaleAmounts() {
  section("parser: locale amounts");
  const csv = [
    "postedAt,amount,description",
    "2026-04-10,\"1,234.56\",en-us",
    "2026-04-10,\"1.234,56\",de-de",
    "2026-04-10,\"-12,50\",comma-decimal",
  ].join("\n");
  const { rows, errors } = bankCsvImportService.parseBankCsv(buf(csv));
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(rows[0].amount, 1234.56);
  assert.strictEqual(rows[1].amount, 1234.56);
  assert.strictEqual(rows[2].amount, -12.5);
}

function testMissingRequiredColumn() {
  section("parser: missing required column");
  const csv = ["description,externalId", "foo,bar"].join("\n");
  let threw = false;
  try {
    bankCsvImportService.parseBankCsv(buf(csv));
  } catch (e) {
    threw = /Missing required column/.test(e.message);
  }
  assert.ok(threw, "should reject when required header missing");
}

function testEmptyFile() {
  section("parser: empty file");
  let threw = false;
  try {
    bankCsvImportService.parseBankCsv(buf(""));
  } catch (e) {
    threw = /empty/i.test(e.message);
  }
  assert.ok(threw, "should reject empty buffer");
}

function testOversizedFile() {
  section("parser: oversized file");
  const big = Buffer.alloc(bankCsvImportService._internal.MAX_BYTES + 1, 0x20);
  let threw = false;
  try {
    bankCsvImportService.parseBankCsv(big);
  } catch (e) {
    threw = /too large/i.test(e.message);
  }
  assert.ok(threw, "should reject > MAX_BYTES");
}

function testTooManyRows() {
  section("parser: too many rows");
  const header = "postedAt,amount";
  const rows = [];
  for (let i = 0; i < bankCsvImportService._internal.MAX_ROWS + 1; i += 1) {
    rows.push("2026-04-10,1.00");
  }
  let threw = false;
  try {
    bankCsvImportService.parseBankCsv(buf([header, ...rows].join("\n")));
  } catch (e) {
    threw = /Too many rows/i.test(e.message);
  }
  assert.ok(threw, "should reject > MAX_ROWS");
}

function testQuotedFields() {
  section("parser: quoted fields with commas and escaped quotes");
  const csv = [
    "postedAt,amount,description,externalId",
    '2026-04-10,10.00,"Hello, ""World""","EXT-Q1"',
  ].join("\n");
  const { rows, errors } = bankCsvImportService.parseBankCsv(buf(csv));
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].description, 'Hello, "World"');
  assert.strictEqual(rows[0].externalId, "EXT-Q1");
}

/* ---------------- DB-backed cases ---------------- */

async function testDbDedupeAndPersist(orgId) {
  section("db: happy path persist");
  await BankStatementLine.deleteMany({ organization: orgId });
  const csv = [
    "postedAt,amount,description,externalId",
    "2026-04-10,125.50,Coffee subscription,EXT-001",
    "2026-04-11,-42.00,Stripe payout,EXT-002",
  ].join("\n");
  const r1 = await bankCsvImportService.importBankCsv(buf(csv), orgId);
  assert.strictEqual(r1.imported, 2, "two lines imported");
  assert.strictEqual(r1.duplicates.length, 0);
  assert.strictEqual(r1.errors.length, 0);
  const count1 = await BankStatementLine.countDocuments({ organization: orgId });
  assert.strictEqual(count1, 2, "two persisted");

  section("db: dedupe by externalId");
  const r2 = await bankCsvImportService.importBankCsv(buf(csv), orgId);
  assert.strictEqual(r2.imported, 0, "re-import yields zero");
  assert.strictEqual(r2.duplicates.length, 2, "both duplicates detected");
  assert.ok(r2.duplicates.every((d) => /externalId/.test(d.reason)));

  section("db: dedupe by natural key (no externalId)");
  const csvNat = ["postedAt,amount,description", "2026-04-12,10.00,Tip jar"].join("\n");
  const n1 = await bankCsvImportService.importBankCsv(buf(csvNat), orgId);
  assert.strictEqual(n1.imported, 1);
  const n2 = await bankCsvImportService.importBankCsv(buf(csvNat), orgId);
  assert.strictEqual(n2.imported, 0, "natural-key duplicate blocked");
  assert.strictEqual(n2.duplicates.length, 1);
  assert.ok(/natural key/.test(n2.duplicates[0].reason));

  section("db: partial accept with row errors");
  await BankStatementLine.deleteMany({ organization: orgId });
  const mixed = [
    "postedAt,amount,description,externalId",
    "2026-05-01,1.00,valid,EXT-V1",
    "bad,2.00,invalid date,",
    "2026-05-02,abc,invalid amount,",
    "2026-05-03,3.00,another valid,EXT-V2",
  ].join("\n");
  const r3 = await bankCsvImportService.importBankCsv(buf(mixed), orgId);
  assert.strictEqual(r3.imported, 2, "two valid rows persisted");
  assert.strictEqual(r3.errors.length, 2, "two rows rejected");

  section("db: tenant isolation");
  const otherOrg = new mongoose.Types.ObjectId();
  const rOther = await bankCsvImportService.importBankCsv(buf(csv), otherOrg);
  assert.strictEqual(rOther.imported, 2, "other tenant can import same externalIds");
  await BankStatementLine.deleteMany({ organization: otherOrg });
  await BankStatementLine.deleteMany({ organization: orgId });
}

async function main() {
  testHappyPathParse();
  testRowErrors();
  testLocaleAmounts();
  testMissingRequiredColumn();
  testEmptyFile();
  testOversizedFile();
  testTooManyRows();
  testQuotedFields();

  if (!config.databaseURI) {
    console.log("\n[skip] MONGODB_URI not set — skipping db-backed cases.");
    return;
  }

  await mongoose.connect(config.databaseURI);
  const {
    resolveAnchorOrganizationId,
  } = require("../utils/resolveAnchorOrganizationId");
  const orgId = await resolveAnchorOrganizationId();
  if (!orgId) {
    console.log("\n[skip] no anchor organization — skipping db-backed cases.");
    await mongoose.disconnect();
    return;
  }
  try {
    await testDbDedupeAndPersist(orgId);
  } finally {
    await mongoose.disconnect();
  }
}

main()
  .then(() => {
    console.log("\nOK — bank CSV v1 import selftest passed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFAIL:", err && err.stack ? err.stack : err);
    process.exit(1);
  });
