#!/usr/bin/env node
/**
 * Verification script for Gap 6: Customer Deposits for Overpayments.
 * Verifies that excess payments are recorded as deposits and unapplied credit.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const Order = require("../models/orderModel");
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
    org = await Organization.create({ name: `Deposit Test Org ${ts}`, slug: `dep-test-${ts}` });
    const orgId = org._id;
    await accountingService.ensureDefaultAccountsAndConfig(orgId);

    customer = await Customer.create({ organization: orgId, name: "Overpayment Customer" });
    
    // Create an invoice for $100
    const order = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      bills: { total: 100, tax: 0, totalWithTax: 100 }
    });
    invoice = await accountingService.issueInvoiceFromOrder({ orderId: order._id });
    console.log(`Invoice created: ${invoice.invoiceNumber}, Total: ${invoice.total}`);

    // Update customer AR balance (simulating the order posting logic)
    await Customer.updateOne({ _id: customer._id }, { $inc: { arBalance: 100 } });

    // 2. Record Overpayment ($150)
    console.log("--- 2. Record Overpayment ($150 for $100 invoice) ---");
    const payment = await accountingService.postArPayment({
      customerId: customer._id,
      amount: 150,
      organizationId: orgId
    });
    console.log("Payment recorded.");

    // 3. Verify Journal Entry
    console.log("--- 3. Verify Journal Entry ---");
    const journal = await JournalEntry.findOne({ organization: orgId, sourceType: "ar_payment" });
    if (!journal) throw new Error("Journal entry not found");
    
    const cashLine = journal.lines.find(l => l.debit === 150);
    const arLine = journal.lines.find(l => l.credit === 100); // Only applied 100
    const depositLine = journal.lines.find(l => l.credit === 50); // Excess
    
    if (!cashLine) throw new Error("Incorrect Cash line");
    if (!arLine) throw new Error("Incorrect AR line");
    if (!depositLine) throw new Error("Missing/Incorrect Customer Deposit line");
    console.log("Journal entry validated (Dr Cash 150, Cr AR 100, Cr Deposit 50).");

    // 4. Verify Customer Impact
    console.log("--- 4. Verify Customer Record ---");
    const updatedCustomer = await Customer.findById(customer._id);
    console.log(`Customer AR Balance: ${updatedCustomer.arBalance}, Unapplied Credit: ${updatedCustomer.unappliedCredit}`);
    
    if (updatedCustomer.arBalance !== 0) throw new Error(`Expected AR Balance 0, found ${updatedCustomer.arBalance}`);
    if (updatedCustomer.unappliedCredit !== 50) throw new Error(`Expected Unapplied Credit 50, found ${updatedCustomer.unappliedCredit}`);
    console.log("Customer record validated.");

    console.log("\nVERIFICATION SUCCESSFUL!");

  } catch (err) {
    console.error("\nVERIFICATION FAILED:");
    console.error(err);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    if (org) {
      const orgId = org._id;
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
