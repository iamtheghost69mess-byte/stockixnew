#!/usr/bin/env node
/**
 * Verification script for Gap 2: AccountingInvoice Lifecycle Update.
 * Verifies that invoices issued from orders are 'posted' and included in AR Aging + Payments.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const Order = require("../models/orderModel");
const AccountingInvoice = require("../models/accountingInvoiceModel");
const accountingService = require("../services/accountingService");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const ts = Date.now();
  let org, customer, order;

  try {
    // 1. Setup
    console.log("--- 1. Setup ---");
    org = await Organization.create({ name: `Invoice Test Org ${ts}`, slug: `inv-test-${ts}` });
    const orgId = org._id;

    customer = await Customer.create({ organization: orgId, name: "Inv Test Customer" });
    
    order = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      bills: { total: 100, tax: 10, totalWithTax: 110 }
    });
    console.log("Order created.");

    // 2. Issue Invoice
    console.log("--- 2. Issue Invoice From Order ---");
    const inv = await accountingService.issueInvoiceFromOrder({ orderId: order._id });
    console.log(`Invoice created: ${inv.invoiceNumber}, Status: ${inv.status}, Total: ${inv.total}`);
    if (inv.status !== "posted") throw new Error("Expected status 'posted'");

    // 3. Verify AR Aging Inclusion
    console.log("--- 3. Verify AR Aging Report ---");
    const report = await accountingService.arAgingReport({ organizationId: orgId });
    const found = report.invoices.find(i => i.invoiceNumber === inv.invoiceNumber);
    if (!found) throw new Error("Invoice not found in AR Aging report");
    console.log("Invoice correctly included in AR Aging.");

    // 4. Record Payment (Verify postArPayment recognizes 'posted')
    console.log("--- 4. Record AR Payment ---");
    // We need to seed default accounts for postArPayment to work
    await accountingService.ensureDefaultAccountsAndConfig(orgId);
    
    const payment = await accountingService.postArPayment({
      customerId: customer._id,
      amount: 110,
      organizationId: orgId
    });
    
    const updatedInv = await AccountingInvoice.findById(inv._id);
    console.log(`Updated Invoice Status: ${updatedInv.status}, Amount Paid: ${updatedInv.amountPaid}`);
    if (updatedInv.status !== "paid") throw new Error("Expected status 'paid' after full payment");

    console.log("\nVERIFICATION SUCCESSFUL!");

  } catch (err) {
    console.error("\nVERIFICATION FAILED:");
    console.error(err);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    if (org) {
      const orgId = org._id;
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
