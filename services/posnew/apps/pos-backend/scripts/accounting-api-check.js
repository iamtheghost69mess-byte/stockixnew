/**
 * Full accounting backend suite (11 capability areas + seed-style data).
 * Run from pos-backend: npm run test:accounting
 *
 * Optional HTTP: ACCOUNTING_HTTP=1 API_BASE_URL=... ACCOUNTING_LOGIN_EMAIL=... ACCOUNTING_LOGIN_PASSWORD=...
 *
 * Multi-tender: `paymentSplits` on paid orders is validated in `tests/unit/orderPaymentSplits.test.js` and posted
 * via `postOrderSaleLedger` (split tender debits). Extend HTTP mode with a PATCH paid + splits case when needed.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");

require("../models/accountingAccountModel");
require("../models/journalEntryModel");
require("../models/accountingConfigModel");
require("../models/accountingSessionModel");
require("../models/accountingSequenceModel");
require("../models/journalAuditLogModel");
require("../models/fxRateModel");
require("../models/accountingInvoiceModel");
require("../models/accountingPeriodModel");
require("../models/accountingSyncLogModel");
require("../models/orderModel");
require("../models/tableModel");
require("../models/userModel");
require("../models/customerModel");

const accountingService = require("../services/accountingService");
const JournalEntry = require("../models/journalEntryModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const User = require("../models/userModel");
const Customer = require("../models/customerModel");
const FxRate = require("../models/fxRateModel");
const AccountingPeriod = require("../models/accountingPeriodModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const AccountingSyncLog = require("../models/accountingSyncLogModel");
const Recipe = require("../models/recipeModel");
const AccountingConfig = require("../models/accountingConfigModel");
const MenuItem = require("../models/menuItemModel");
const Category = require("../models/categoryModel");
const GiftCard = require("../models/giftCardModel");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

async function cleanupTags(prefix) {
  const orders = await Order.find({
    "customerDetails.name": new RegExp(`^${prefix}`),
  }).select("_id");
  const ids = orders.map((o) => o._id);
  await JournalEntry.deleteMany({ order: { $in: ids } });
  await Order.deleteMany({ _id: { $in: ids } });
}

async function runDbTests() {
  const TAG = "AcctTest";
  await mongoose.connect(config.databaseURI);
  await cleanupTags(TAG);

  section("1 Multi-currency / reporting currency");
  const {
    resolveAnchorOrganizationId,
  } = require("../utils/resolveAnchorOrganizationId");
  const orgId = await resolveAnchorOrganizationId();
  await accountingService.ensureDefaultAccountsAndConfig(orgId);
  const cfg = await AccountingConfig.findOne({ organization: orgId });
  assert(cfg.companyCurrency, "companyCurrency");
  cfg.companyCurrency = "USD";
  await cfg.save();

  section("2 Sale + explicit discount / tax lines / tips (GL dimensions)");
  const table = await Table.findOne();
  const user = await User.findOne();
  assert(table && user, "need table + user");
  const o1 = await Order.create({
    organization: orgId,
    table: table._id,
    waiter: user._id,
    orderStatus: "paid",
    paidAt: new Date(),
    paymentMethod: "Cash",
    documentCurrency: "USD",
    fxRateToCompany: 1,
    billingMode: "immediate",
    loyaltyDiscountAmount: 5,
    tipAmount: 3,
    bills: {
      total: 100,
      tax: 12,
      totalWithTax: 110,
      taxLines: [
        { code: "standard", label: "Standard", amount: 10 },
        { code: "reduced", label: "Reduced", amount: 2 },
      ],
    },
    items: [],
    customerDetails: { name: `${TAG} A`, phone: "-", guests: 1 },
  });
  await JournalEntry.deleteMany({ order: o1._id });
  const jeSale = await accountingService.postOrderSaleLedger(o1._id, user._id);
  assert(jeSale && jeSale.lines.length >= 4, "sale lines with tax split + discount + tips");
  assert(
    jeSale.metadata && jeSale.metadata.tableNo === table.tableNo,
    "sale journal metadata.tableNo for GL / export"
  );
  assert(
    jeSale.metadata &&
      jeSale.metadata.grossPreDiscount === 112 &&
      jeSale.metadata.discountPercentOfGross != null,
    "sale journal metadata gross + discount %"
  );
  const tb1 = await accountingService.trialBalance({ organizationId: orgId });
  assert(tb1.balanced, "TB after sale");

  section("3 COGS + inventory relief");
  const cogsJe = await accountingService.postOrderCogsLedger(o1._id, user._id);
  if (cogsJe) {
    const tbC = await accountingService.trialBalance({ organizationId: orgId });
    assert(tbC.balanced, "TB after COGS");
  } else {
    console.log("  (skip COGS — no recipe cost for empty order)");
  }

  section("4 Partial refund");
  const ref = await accountingService.postOrderRefund({
    orderId: o1._id,
    amount: 20,
    userId: user._id,
    idempotencyKey: `test-refund:${o1._id}`,
  });
  assert(ref.sourceType === "order_refund", "refund journal");
  assert(
    (await accountingService.trialBalance({ organizationId: orgId })).balanced,
    "TB after refund"
  );

  section("5 AR + customer balance + payment");
  const cust = await Customer.create({
    name: `${TAG} Customer`,
    phone: "555-0199",
    arBalance: 0,
  });
  const oAr = await Order.create({
    organization: orgId,
    table: table._id,
    waiter: user._id,
    customer: cust._id,
    orderStatus: "paid",
    paidAt: new Date(),
    paymentMethod: "On Account",
    billingMode: "on_account",
    bills: { total: 50, tax: 5, totalWithTax: 55 },
    items: [],
    customerDetails: { name: `${TAG} AR`, phone: "-", guests: 1 },
  });
  await JournalEntry.deleteMany({ order: oAr._id });
  await accountingService.postOrderSaleLedger(oAr._id, user._id);
  const cAfter = await Customer.findById(cust._id).lean();
  assert(cAfter.arBalance >= 54.99 && cAfter.arBalance <= 55.01, "AR balance bumped");
  await accountingService.postArPayment({
    customerId: cust._id,
    amount: 25,
    userId: user._id,
    idempotencyKey: `ar-pay:${cust._id}:1`,
    organizationId: orgId,
  });
  const cPaid = await Customer.findById(cust._id).lean();
  assert(
    cPaid.arBalance >= 29.99 && cPaid.arBalance <= 30.01,
    "AR reduced after payment"
  );

  section("6 FX, invoices, AR aging, period close guard");
  await FxRate.deleteMany({
    organization: orgId,
    fromCurrency: "TST",
    toCurrency: "USD",
  });
  await FxRate.create({
    organization: orgId,
    effectiveDate: new Date("2025-01-15T00:00:00.000Z"),
    fromCurrency: "TST",
    toCurrency: "USD",
    rate: 2,
    note: "api-check",
  });
  const fx = await accountingService.resolveFxRateFromTable(
    "TST",
    "USD",
    new Date("2025-06-01T00:00:00.000Z"),
    orgId
  );
  assert(fx === 2, "FX resolve uses latest on/before date");

  const inv = await accountingService.issueInvoiceFromOrder({
    orderId: oAr._id,
    dueDays: 14,
  });
  assert(inv.invoiceNumber && inv.total >= 54, "invoice from order");

  const aging = await accountingService.arAgingReport({
    organizationId: orgId,
  });
  assert(aging.buckets && Array.isArray(aging.invoices), "aging report");

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  await accountingService.closeAccountingPeriod({
    year: y,
    month: m,
    userId: user._id,
    organizationId: orgId,
  });
  let blocked = false;
  try {
    const cashAcc = await mongoose
      .model("AccountingAccount")
      .findOne({ organization: orgId, code: "1000" });
    const revAcc = await mongoose
      .model("AccountingAccount")
      .findOne({ organization: orgId, code: "4000" });
    await accountingService.createJournalEntry(
      {
        organization: orgId,
        entryDate: new Date(),
        memo: "should fail — closed period",
        sourceType: "manual",
        sourceId: null,
        companyCurrency: "USD",
        lines: [
          { account: cashAcc._id, debit: 0.01, credit: 0, memo: "x" },
          { account: revAcc._id, debit: 0, credit: 0.01, memo: "x" },
        ],
      },
      {
        idempotencyKey: `blocked-je-${TAG}-${Date.now()}`,
        userId: user._id,
        auditAction: "test",
      }
    );
  } catch (e) {
    blocked =
      e.status === 400 || String(e.message || "").toLowerCase().includes("closed");
  }
  assert(blocked, "posting blocked in closed period");
  await AccountingPeriod.deleteOne({ year: y, month: m, organization: orgId });

  const r = await Recipe.findOne().lean();
  if (r && r.menuItem) {
    const oCogs = await Order.create({
      organization: orgId,
      table: table._id,
      waiter: user._id,
      orderStatus: "paid",
      paidAt: new Date(),
      paymentMethod: "Cash",
      billingMode: "immediate",
      bills: { total: 10, tax: 1, totalWithTax: 11 },
      items: [{ menuItem: r.menuItem, quantity: 1 }],
      customerDetails: { name: `${TAG} Cogs`, phone: "-", guests: 1 },
    });
    await JournalEntry.deleteMany({ order: oCogs._id });
    await accountingService.postOrderSaleLedger(oCogs._id, user._id);
    const cogsJe = await accountingService.postOrderCogsLedger(oCogs._id, user._id);
    if (cogsJe) {
      await accountingService.postOrderRefund({
        orderId: oCogs._id,
        amount: 5.5,
        userId: user._id,
        idempotencyKey: `cogs-refund-${TAG}-${oCogs._id}`,
      });
      const cogsRef = await JournalEntry.findOne({
        sourceType: "cogs_refund",
        order: oCogs._id,
      });
      assert(cogsRef, "cogs_refund after partial refund");
    }
    await JournalEntry.deleteMany({ order: oCogs._id });
    await Order.deleteOne({ _id: oCogs._id });
  }

  await AccountingInvoice.deleteMany({ order: oAr._id });
  await FxRate.deleteMany({ organization: orgId, fromCurrency: "TST" });

  section("7 P&L + balance sheet");
  const pnl = await accountingService.profitAndLoss({ organizationId: orgId });
  assert(typeof pnl.revenue === "number", "pnl revenue");
  const bs = await accountingService.balanceSheet({
    asOf: new Date().toISOString(),
    organizationId: orgId,
  });
  assert(typeof bs.totalAssets === "number", "bs assets");

  section("8 Audit trail");
  const auditCount = await JournalAuditLog.countDocuments({
    organization: orgId,
  });
  assert(auditCount > 0, "audit logs exist");

  section("9 Offline sync ack (idempotent)");
  const s1 = await accountingService.acknowledgeSyncBatch({
    batchId: `batch-${TAG}-1`,
    orderIds: [o1._id],
    userId: user._id,
    organizationId: orgId,
  });
  assert(!s1.reused, "first ack");
  const s2 = await accountingService.acknowledgeSyncBatch({
    batchId: `batch-${TAG}-1`,
    orderIds: [o1._id],
    userId: user._id,
    organizationId: orgId,
  });
  assert(s2.reused, "second ack idempotent");

  section("10 ERP export (CSV + JSON shape)");
  const entries = await JournalEntry.find({ organization: orgId })
    .limit(5)
    .populate("lines.account");
  const csv = accountingService.journalsToCsvRows(entries);
  assert(csv.includes("entryNumber"), "csv header");
  assert(csv.split("\n").length >= 2, "csv rows");

  section("11 Idempotent manual journal");
  const cash = await mongoose
    .model("AccountingAccount")
    .findOne({ organization: orgId, code: "1000" });
  const rev = await mongoose
    .model("AccountingAccount")
    .findOne({ organization: orgId, code: "4000" });
  const { entry: m1, reused: r1 } = await accountingService.createJournalEntry(
    {
      organization: orgId,
      memo: "idem test",
      sourceType: "manual",
      sourceId: null,
      companyCurrency: "USD",
      lines: [
        { account: cash._id, debit: 1, credit: 0, memo: "a" },
        { account: rev._id, debit: 0, credit: 1, memo: "b" },
      ],
    },
    { idempotencyKey: "idem-test-key-unique", userId: user._id, auditAction: "test" }
  );
  const { entry: m2, reused: r2 } = await accountingService.createJournalEntry(
    {
      organization: orgId,
      memo: "idem test",
      sourceType: "manual",
      sourceId: null,
      companyCurrency: "USD",
      lines: [
        { account: cash._id, debit: 1, credit: 0, memo: "a" },
        { account: rev._id, debit: 0, credit: 1, memo: "b" },
      ],
    },
    { idempotencyKey: "idem-test-key-unique", userId: user._id, auditAction: "test" }
  );
  assert(String(m1._id) === String(m2._id) && r2, "idempotency replay");

  section("12 Standard cost COGS path");
  const catStd = await Category.create({
    organization: orgId,
    name: `${TAG} CatStd`,
  });
  const miStd = await MenuItem.create({
    name: `${TAG} StdItem`,
    price: 20,
    category: catStd._id,
    standardUnitCost: 6,
    inventoryImpact: "service",
  });
  const prevCostMeth = cfg.defaultCostMethod;
  const prevAutoCogs = cfg.autoPostCogsOnPaid;
  cfg.defaultCostMethod = "standard";
  cfg.autoPostCogsOnPaid = true;
  await cfg.save();
  const oStd = await Order.create({
    organization: orgId,
    table: table._id,
    waiter: user._id,
    orderStatus: "paid",
    paidAt: new Date(),
    paymentMethod: "Cash",
    billingMode: "immediate",
    bills: { total: 20, tax: 0, totalWithTax: 20 },
    items: [{ menuItem: miStd._id, quantity: 3 }],
    customerDetails: { name: `${TAG} StdCogs`, phone: "-", guests: 1 },
  });
  await JournalEntry.deleteMany({ order: oStd._id });
  await accountingService.postOrderSaleLedger(oStd._id, user._id);
  const jeStdCogs = await accountingService.postOrderCogsLedger(oStd._id, user._id);
  assert(jeStdCogs, "standard COGS JE created");
  const cogsLine = (jeStdCogs.lines || []).find(
    (l) => Number(l.debit) > 0 && String(l.memo || "").toLowerCase().includes("cogs")
  );
  assert(
    cogsLine && Math.abs(Number(cogsLine.debit) - 18) < 0.02,
    "COGS uses standardUnitCost × qty"
  );
  cfg.defaultCostMethod = prevCostMeth;
  cfg.autoPostCogsOnPaid = prevAutoCogs;
  await cfg.save();
  await JournalEntry.deleteMany({ order: oStd._id });
  await Order.deleteOne({ _id: oStd._id });
  await MenuItem.deleteOne({ _id: miStd._id });
  await Category.deleteOne({ _id: catStd._id });

  section("13 Gift card issue + redeem");
  const gcIdem = `gc-issue-${TAG}`;
  const { code: gcCode } = await accountingService.issueGiftCard({
    amount: 12,
    userId: user._id,
    idempotencyKey: gcIdem,
    organizationId: orgId,
  });
  assert(gcCode, "gift card code");
  await accountingService.redeemGiftCard({
    code: gcCode,
    amount: 5,
    userId: user._id,
    idempotencyKey: `gc-redeem-${TAG}-1`,
    organizationId: orgId,
  });
  const gcDoc = await GiftCard.findOne({ code: gcCode });
  assert(gcDoc && gcDoc.balance >= 6.99 && gcDoc.balance <= 7.01, "gift balance after redeem");
  await JournalEntry.deleteMany({ idempotencyKey: gcIdem });
  await JournalEntry.deleteMany({ idempotencyKey: `gc-redeem-${TAG}-1` });
  await GiftCard.deleteMany({ code: gcCode });

  section("14 Offline sync key uniqueness (Mongo)");
  const syncKey = `offline-${TAG}-uniq`;
  await Order.deleteMany({ offlineSyncKey: syncKey });
  const oOff = await Order.create({
    organization: orgId,
    table: table._id,
    waiter: user._id,
    orderStatus: "paid",
    paidAt: new Date(),
    offlineSyncKey: syncKey,
    paymentMethod: "Cash",
    bills: { total: 1, tax: 0, totalWithTax: 1 },
    items: [],
    customerDetails: { name: `${TAG} Off`, phone: "-", guests: 1 },
  });
  let dupBlocked = false;
  try {
    await Order.create({
      organization: orgId,
      table: table._id,
      waiter: user._id,
      orderStatus: "paid",
      paidAt: new Date(),
      offlineSyncKey: syncKey,
      paymentMethod: "Cash",
      bills: { total: 1, tax: 0, totalWithTax: 1 },
      items: [],
      customerDetails: { name: `${TAG} Off2`, phone: "-", guests: 1 },
    });
  } catch (e) {
    dupBlocked =
      e && (e.code === 11000 || String(e.message || "").includes("duplicate"));
  }
  assert(dupBlocked, "duplicate offlineSyncKey rejected at DB");
  await Order.deleteOne({ _id: oOff._id });

  section("Full reversal (separate order — not mixed with refund)");
  const oRev = await Order.create({
    organization: orgId,
    table: table._id,
    waiter: user._id,
    orderStatus: "paid",
    paidAt: new Date(),
    paymentMethod: "Cash",
    bills: { total: 40, tax: 4, totalWithTax: 44 },
    items: [],
    customerDetails: { name: `${TAG} Rev`, phone: "-", guests: 1 },
  });
  await JournalEntry.deleteMany({ order: oRev._id });
  await accountingService.postOrderSaleLedger(oRev._id, user._id);
  await accountingService.reverseOrderCogsLedger(oRev._id, user._id);
  await accountingService.reverseOrderSaleLedger(oRev._id, user._id);
  assert(
    (await accountingService.trialBalance({ organizationId: orgId })).balanced,
    "TB after reversal"
  );
  await JournalEntry.deleteMany({ order: oRev._id });
  await Order.deleteOne({ _id: oRev._id });

  section("Cleanup");
  await JournalEntry.deleteMany({ order: { $in: [o1._id, oAr._id] } });
  await JournalEntry.deleteMany({ idempotencyKey: "idem-test-key-unique" });
  await Order.deleteMany({ _id: { $in: [o1._id, oAr._id] } });
  await Customer.deleteOne({ _id: cust._id });
  await AccountingSyncLog.deleteMany({ batchId: `batch-${TAG}-1` });

  await mongoose.disconnect();
  console.log("\n✓ accounting-api-check (full DB suite): OK\n");
}

async function runHttpSmoke() {
  const base = process.env.API_BASE_URL || "http://localhost:4444";
  const email = process.env.ACCOUNTING_LOGIN_EMAIL;
  const password = process.env.ACCOUNTING_LOGIN_PASSWORD;
  if (!email || !password) {
    console.warn("HTTP suite skipped (set ACCOUNTING_LOGIN_EMAIL/PASSWORD)");
    return;
  }
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(loginRes.ok, `login ${loginRes.status}`);
  const loginBody = await loginRes.json();
  const setCookie = loginRes.headers.getSetCookie?.() || [];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(";")[0]).join("; ")
    : "";
  const headers = {
    Authorization: `Bearer ${loginBody.accessToken}`,
    Cookie: cookieHeader,
  };

  const paths = [
    "/api/accounting/trial-balance",
    "/api/accounting/reports/pnl",
    "/api/accounting/reports/balance-sheet?asOf=" +
      encodeURIComponent(new Date().toISOString()),
    "/api/accounting/export/integration.json",
    "/api/accounting/audit-log?page=1&limit=5",
    "/api/accounting/fx/rates",
    "/api/accounting/reports/ar-aging",
    "/api/accounting/periods",
  ];
  for (const p of paths) {
    const r = await fetch(`${base}${p}`, { headers });
    assert(r.ok, `${p} -> ${r.status}`);
  }
  const csv = await fetch(`${base}/api/accounting/export/journals.csv`, { headers });
  assert(csv.ok && (await csv.text()).length > 5, "csv export");
  const endQ = encodeURIComponent(new Date().toISOString().slice(0, 10));
  const xlsx = await fetch(
    `${base}/api/accounting/export/trial-balance.xlsx?end=${endQ}`,
    { headers }
  );
  assert(xlsx.ok, `tb xlsx -> ${xlsx.status}`);
  const pdf = await fetch(
    `${base}/api/accounting/export/trial-balance.pdf?end=${endQ}`,
    { headers }
  );
  assert(pdf.ok, `tb pdf -> ${pdf.status}`);
  console.log("✓ accounting HTTP smoke: OK");
}

async function main() {
  await runDbTests();
  if (process.env.ACCOUNTING_HTTP === "1") await runHttpSmoke();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
