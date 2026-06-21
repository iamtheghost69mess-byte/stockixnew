#!/usr/bin/env node
/**
 * Verification script for Gap 3: CreditNote Model and Lifecycle.
 * Verifies that Credit Notes reverse revenue and AR.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const Order = require("../models/orderModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const CreditNote = require("../models/creditNoteModel");
const JournalEntry = require("../models/journalEntryModel");
const accountingService = require("../services/accountingService");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const ts = Date.now();
  let org, customer, invoice;

  try {
    // 1. Setup
    console.log("--- 1. Setup ---");
    org = await Organization.create({ name: `CN Test Org ${ts}`, slug: `cn-test-${ts}` });
    const orgId = org._id;
    await accountingService.ensureDefaultAccountsAndConfig(orgId);

    customer = await Customer.create({ organization: orgId, name: "CN Test Customer" });
    
    // Create an invoice
    const order = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      bills: { total: 100, tax: 0, totalWithTax: 100 }
    });
    invoice = await accountingService.issueInvoiceFromOrder({ orderId: order._id });
    console.log(`Invoice created: ${invoice.invoiceNumber}, Total: ${invoice.total}`);

    // 2. Issue Credit Note
    console.log("--- 2. Issue Credit Note ---");
    const cn = await accountingService.issueCreditNote(invoice._id, { amount: 40, reason: "Adjustment" }, null);
    console.log(`Credit Note created: ${cn.creditNoteNumber}, Status: ${cn.status}, Total: ${cn.total}`);

    // 3. Verify Journal Entry
    console.log("--- 3. Verify Journal Entry ---");
    const journal = await JournalEntry.findOne({ organization: orgId, sourceType: "credit_note", sourceId: cn._id });
    if (!journal) throw new Error("Journal entry not found for Credit Note");
    
    const revenueLine = journal.lines.find(l => l.debit > 0);
    const arLine = journal.lines.find(l => l.credit > 0);
    
    if (!revenueLine || revenueLine.debit !== 40) throw new Error("Incorrect revenue debit line");
    if (!arLine || arLine.credit !== 40) throw new Error("Incorrect AR credit line");
    console.log("Journal entry validated (Revenue Reversed, AR Reduced).");

    // 4. Verify Invoice Impact
    console.log("--- 4. Verify Invoice Impact ---");
    const updatedInv = await AccountingInvoice.findById(invoice._id);
    console.log(`Invoice amountPaid (offset): ${updatedInv.amountPaid}, Status: ${updatedInv.status}`);
    if (updatedInv.amountPaid !== 40) throw new Error("Invoice amountPaid not updated by Credit Note");
    if (updatedInv.status !== "partial") throw new Error("Invoice status should be partial");

    console.log("\nVERIFICATION SUCCESSFUL!");

  } catch (err) {
    console.error("\nVERIFICATION FAILED:");
    console.error(err);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    if (org) {
      const orgId = org._id;
      await CreditNote.deleteMany({ organization: orgId });
      await JournalEntry.deleteMany({ organization: orgId });
      await AccountingInvoice.deleteMany({ organization: orgId });
      await Order.deleteMany({ organization: orgId });
      await Customer.deleteMany({ organization: orgId });
      await Organization.deleteOne({ _id: orgId });
    }
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

main();
