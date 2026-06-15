#!/usr/bin/env node
/**
 * Verification script for Gap 4: Line-level Tax Breakdown for Invoices.
 * Verifies that taxDetails are frozen on the invoice.
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
    org = await Organization.create({ name: `Tax Test Org ${ts}`, slug: `tax-test-${ts}` });
    const orgId = org._id;

    customer = await Customer.create({ organization: orgId, name: "Tax Test Customer" });
    
    // Create an order with detailed tax lines
    order = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      bills: {
        total: 100,
        tax: 15,
        totalWithTax: 115,
        taxLines: [
          { code: "VAT", label: "Value Added Tax", amount: 10 },
          { code: "ST", label: "Service Tax", amount: 5 }
        ]
      }
    });
    console.log("Order created with VAT and Service Tax.");

    // 2. Issue Invoice
    console.log("--- 2. Issue Invoice From Order ---");
    const inv = await accountingService.issueInvoiceFromOrder({ orderId: order._id });
    console.log(`Invoice created: ${inv.invoiceNumber}, Tax: ${inv.tax}`);
    
    if (!inv.taxDetails || inv.taxDetails.length !== 2) {
      throw new Error(`Expected 2 taxDetails entries, found ${inv.taxDetails?.length}`);
    }

    const vat = inv.taxDetails.find(t => t.code === "VAT");
    const st = inv.taxDetails.find(t => t.code === "ST");

    if (!vat || vat.amount !== 10) throw new Error("VAT amount mismatch");
    if (!st || st.amount !== 5) throw new Error("Service Tax amount mismatch");
    
    console.log("Tax details correctly frozen on invoice.");

    // 3. Fallback Test
    console.log("--- 3. Testing Fallback ---");
    const orderFallback = await Order.create({
      organization: orgId,
      customer: customer._id,
      orderStatus: "paid",
      bills: {
        total: 50,
        tax: 5,
        totalWithTax: 55,
        taxLines: [] // Empty
      }
    });
    const inv2 = await accountingService.issueInvoiceFromOrder({ orderId: orderFallback._id });
    if (inv2.taxDetails?.length === 1 && inv2.taxDetails[0].code === "TAX") {
      console.log("Fallback correctly triggered for missing tax lines.");
    } else {
      throw new Error("Fallback failed");
    }

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
