#!/usr/bin/env node
/**
 * End-to-end accounting verification for Studio flows (AR, AP, credit notes, reports).
 * Creates a throwaway Organization, runs service-layer checks, then deletes all seeded data.
 *
 * Requires: MONGODB_URI in env (see .env)
 *
 * Run: npm run test:accounting:studio --prefix apps/pos-backend
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const Order = require("../models/orderModel");
const Supplier = require("../models/supplierModel");
const Location = require("../models/locationModel");
const Ingredient = require("../models/ingredientModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const VendorBill = require("../models/vendorBillModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const CreditNote = require("../models/creditNoteModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const AccountingConfig = require("../models/accountingConfigModel");
const AccountingAccount = require("../models/accountingAccountModel");
const AccountingSequence = require("../models/accountingSequenceModel");
const Budget = require("../models/budgetModel");
/** Register models used by postOrderSaleLedger populate (items.menuItem → category → revenueAccount). */
require("../models/menuItemModel");
require("../models/categoryModel");
const accountingService = require("../services/accountingService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

async function cleanupOrganization(orgId) {
  if (!orgId) return;
  const oid = orgId;
  await JournalAuditLog.deleteMany({ organization: oid });
  await JournalEntry.deleteMany({ organization: oid });
  await CreditNote.deleteMany({ organization: oid });
  await AccountingInvoice.deleteMany({ organization: oid });
  await VendorBill.deleteMany({ organization: oid });
  await PurchaseOrder.deleteMany({ organization: oid });
  await Order.deleteMany({ organization: oid });
  await Customer.deleteMany({ organization: oid });
  await Supplier.deleteMany({ organization: oid });
  await Location.deleteMany({ organization: oid });
  await Ingredient.deleteMany({ organization: oid });
  await Budget.deleteMany({ organization: oid });
  await AccountingConfig.deleteMany({ organization: oid });
  await AccountingAccount.deleteMany({ organization: oid });
  const idSuffix = `:${String(oid)}`;
  await AccountingSequence.deleteMany({
    _id: {
      $in: [
        `journalEntry${idSuffix}`,
        `invoiceNumber${idSuffix}`,
        `vendorBill${idSuffix}`,
        `creditNote${idSuffix}`,
        `accountingSession${idSuffix}`,
        `accountingInvoice${idSuffix}`,
      ],
    },
  });
  await Organization.deleteOne({ _id: oid });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const ts = Date.now();
  let org = null;
  let failed = false;

  try {
    console.log("\n=== Accounting studio verification ===\n");

    org = await Organization.create({
      name: `Studio verify org ${ts}`,
      slug: `studio-verify-${ts}`,
    });
    const orgId = org._id;
    const now = new Date();

    console.log("--- Setup: chart & config ---");
    await accountingService.ensureDefaultAccountsAndConfig(orgId);

    const customer = await Customer.create({
      organization: orgId,
      name: `Studio Customer ${ts}`,
    });

    console.log("--- Order: onOrderBecamePaid persists posting flags ---");
    const cashOrder = await Order.create({
      organization: orgId,
      orderStatus: "paid",
      billingMode: "immediate",
      paymentMethod: "cash",
      paymentSplits: [{ methodKey: "cash", amount: 25 }],
      paidAt: now,
      bills: {
        total: 22,
        tax: 3,
        totalWithTax: 25,
        taxLines: [{ code: "standard", label: "VAT", amount: 3 }],
      },
    });
    await accountingService.onOrderBecamePaid(cashOrder, "pending", null);
    const cashReload = await Order.findById(cashOrder._id).lean();
    assert(
      cashReload.accountingSaleStatus === "ok",
      `sale status expected ok, got ${cashReload.accountingSaleStatus}`
    );
    assert(
      cashReload.accountingCogsStatus === "ok" ||
        cashReload.accountingCogsStatus === "skipped",
      `cogs expected ok or skipped, got ${cashReload.accountingCogsStatus}`
    );
    const snap = accountingService.accountingPostingFromOrder(cashReload);
    assert(snap.sale.status === "ok", "API snapshot sale should be ok");

    console.log("--- Order: misconfigured GL sets sale failed ---");
    await AccountingConfig.updateOne(
      { organization: orgId },
      { $set: { defaultRevenueAccount: null } }
    );
    const badOrder = await Order.create({
      organization: orgId,
      orderStatus: "paid",
      billingMode: "immediate",
      paymentSplits: [{ methodKey: "cash", amount: 10 }],
      paidAt: now,
      bills: {
        total: 8,
        tax: 2,
        totalWithTax: 10,
        taxLines: [{ code: "standard", amount: 2 }],
      },
    });
    await accountingService.onOrderBecamePaid(badOrder, "pending", null);
    const badReload = await Order.findById(badOrder._id).lean();
    assert(
      badReload.accountingSaleStatus === "failed",
      `sale should be failed without revenue account, got ${badReload.accountingSaleStatus}`
    );
    assert(
      badReload.accountingCogsStatus === "skipped",
      `cogs should be skipped when sale fails, got ${badReload.accountingCogsStatus}`
    );
    const badSnap = accountingService.accountingPostingFromOrder(badReload);
    assert(badSnap.sale.status === "failed", "snapshot sale should be failed");
    assert(badSnap.sale.error && String(badSnap.sale.error).length > 0, "snapshot should include error");

    const revAcc = await AccountingAccount.findOne({ organization: orgId, code: "4000" });
    assert(revAcc, "revenue 4000 should exist to restore config");
    await AccountingConfig.updateOne(
      { organization: orgId },
      { $set: { defaultRevenueAccount: revAcc._id } }
    );

    console.log("--- AR: on-account sale, invoice, aging, payments, credit note ---");
    const order = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      billingMode: "on_account",
      paymentMethod: "on_account",
      paidAt: now,
      bills: {
        total: 100,
        tax: 10,
        totalWithTax: 110,
        taxLines: [{ code: "standard", label: "VAT", amount: 10 }],
      },
    });

    const saleEntry = await accountingService.postOrderSaleLedger(order._id, null);
    assert(saleEntry, "postOrderSaleLedger should create an entry for on_account paid order");

    const inv = await accountingService.issueInvoiceFromOrder({ orderId: order._id });
    assert(inv.status === "posted", `invoice should be posted, got ${inv.status}`);
    assert(inv.total === 110, `invoice total expected 110, got ${inv.total}`);

    const aging = await accountingService.arAgingReport({ organizationId: orgId, asOf: now });
    const inAging = aging.invoices.find((r) => r.invoiceNumber === inv.invoiceNumber);
    assert(inAging, "invoice should appear in AR aging");

    await accountingService.postArPayment({
      customerId: customer._id,
      amount: 50,
      organizationId: orgId,
    });
    let invMid = await AccountingInvoice.findById(inv._id);
    assert(invMid.status === "partial", "after50 payment status should be partial");

    await accountingService.issueCreditNote(inv._id, { amount: 20, reason: "Studio test" }, null);
    invMid = await AccountingInvoice.findById(inv._id);
    assert(
      Math.abs(Number(invMid.amountPaid) - 70) < 0.02,
      `amountPaid should reflect payment + CN (~70), got ${invMid.amountPaid}`
    );

    await accountingService.postArPayment({
      customerId: customer._id,
      amount: 40,
      organizationId: orgId,
    });
    const invFinal = await AccountingInvoice.findById(inv._id);
    assert(invFinal.status === "paid", `final status should be paid, got ${invFinal.status}`);

    console.log("--- AP: vendor bill post, pay, void ---");
    const supplier = await Supplier.create({ organization: orgId, name: `Studio Supplier ${ts}` });
    const location = await Location.create({ organization: orgId, name: `Studio Loc ${ts}` });
    const ingredient = await Ingredient.create({
      organization: orgId,
      name: `Studio Ing ${ts}`,
      unitCost: 10,
      location: location._id,
    });

    const poPaid = await PurchaseOrder.create({
      organization: orgId,
      supplier: supplier._id,
      location: location._id,
      status: "received",
      lines: [
        {
          ingredient: ingredient._id,
          description: "Line A",
          quantityOrdered: 5,
          quantityReceived: 5,
          unitCost: 10,
        },
      ],
    });

    const billPaid = await accountingService.createVendorBillFromPO(poPaid._id, {}, null);
    assert(billPaid.total === 50, `vendor bill total expected 50, got ${billPaid.total}`);
    await accountingService.postVendorBill(billPaid._id, null);
    const paidBill = await accountingService.recordVendorBillPayment(
      billPaid._id,
      50,
      { method: "cash", date: now },
      null
    );
    assert(paidBill.status === "paid", `vendor bill should be paid, got ${paidBill.status}`);

    const poVoid = await PurchaseOrder.create({
      organization: orgId,
      supplier: supplier._id,
      location: location._id,
      status: "received",
      lines: [
        {
          ingredient: ingredient._id,
          description: "Line B",
          quantityOrdered: 3,
          quantityReceived: 3,
          unitCost: 10,
        },
      ],
    });
    const billVoid = await accountingService.createVendorBillFromPO(poVoid._id, {}, null);
    await accountingService.postVendorBill(billVoid._id, null);
    const voided = await accountingService.voidVendorBill(billVoid._id, null);
    assert(voided.status === "void", `void bill status expected void, got ${voided.status}`);
    const voidJournal = await JournalEntry.findOne({
      organization: orgId,
      sourceType: "vendor_bill_void",
      sourceId: billVoid._id,
    });
    assert(voidJournal, "void should create reversal journal");

    console.log("--- Reports: trial balance, P&L, balance sheet, cash flow, budget vs actual ---");
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const tb = await accountingService.trialBalance({ start, end, organizationId: orgId });
    assert(tb.balanced, `trial balance should balance (debits ${tb.totalDebit} credits ${tb.totalCredit})`);

    const pl = await accountingService.profitAndLoss({ start, end, organizationId: orgId });
    assert(pl.revenue > 0, "P&L should show revenue from sale");

    const bs = await accountingService.balanceSheet({ asOf: end, organizationId: orgId });
    assert(bs.totalAssets >= 0, "balance sheet should return assets total");

    const cf = await accountingService.cashFlowReport({ start, end, organizationId: orgId });
    assert(cf.categories && typeof cf.categories.netChange === "number", "cash flow should return categories");

    const revenueAcc = await AccountingAccount.findOne({ organization: orgId, code: "4000" });
    assert(revenueAcc, "revenue account 4000 should exist");
    await Budget.create({
      organization: orgId,
      accountId: revenueAcc._id,
      fiscalYear: y,
      periodMonth: m,
      budgetedAmount: 50_000,
    });
    const bva = await accountingService.budgetVsActual(orgId, { fiscalYear: y, periodMonth: m });
    assert(Array.isArray(bva) && bva.length >= 1, "budgetVsActual should return rows");
    assert(bva[0].actual >= 0, "budget vs actual should compute actual for revenue account");

    console.log("\n=== All checks passed ===\n");
  } catch (err) {
    failed = true;
    console.error("\n=== VERIFICATION FAILED ===\n");
    console.error(err);
  } finally {
    if (org) {
      console.log("Cleaning up seeded organization…");
      await cleanupOrganization(org._id);
    }
    await mongoose.disconnect();
    console.log("Disconnected.");
  }

  process.exit(failed ? 1 : 0);
}

main();
