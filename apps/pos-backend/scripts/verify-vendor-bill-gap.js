#!/usr/bin/env node
/**
 * Verification script for Gap 1: VendorBill Model and Lifecycle.
 * Verifies creation from PO, posting (journal entry), payment (journal entry), and voiding (reversal).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Supplier = require("../models/supplierModel");
const Location = require("../models/locationModel");
const Ingredient = require("../models/ingredientModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const VendorBill = require("../models/vendorBillModel");
const JournalEntry = require("../models/journalEntryModel");
const JournalAuditLog = require("../models/journalAuditLogModel");
const accountingService = require("../services/accountingService");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const ts = Date.now();
  let org, supplier, location, ingredient, po;

  try {
    // 1. Setup
    console.log("--- 1. Setup ---");
    org = await Organization.create({ name: `VB Test Org ${ts}`, slug: `vb-test-${ts}` });
    const orgId = org._id;

    // Ensure default accounts exist
    await accountingService.ensureDefaultAccountsAndConfig(orgId);
    console.log("Default accounts created.");

    supplier = await Supplier.create({ organization: orgId, name: "VB Test Supplier" });
    location = await Location.create({ organization: orgId, name: "VB Test Location" });
    ingredient = await Ingredient.create({ organization: orgId, name: "VB Test Ingredient", unitCost: 10 });
    
    po = await PurchaseOrder.create({
      organization: orgId,
      supplier: supplier._id,
      location: location._id,
      status: "received", // Received PO to bill from
      lines: [{
        ingredient: ingredient._id,
        description: "Test Ingredient",
        quantityOrdered: 5,
        quantityReceived: 5,
        unitCost: 10
      }]
    });
    console.log("PO created.");

    // 2. Create VendorBill from PO
    console.log("--- 2. Create VendorBill from PO ---");
    const bill = await accountingService.createVendorBillFromPO(po._id, {}, null);
    console.log(`VendorBill created: ${bill.vendorBillNumber}, Status: ${bill.status}, Total: ${bill.total}`);
    if (bill.lines.length !== 1) throw new Error("Expected 1 line in bill");
    if (bill.total !== 50) throw new Error("Expected total 50");

    // 3. Post VendorBill
    console.log("--- 3. Post VendorBill ---");
    const postedBill = await accountingService.postVendorBill(bill._id, null);
    console.log(`VendorBill status: ${postedBill.status}`);
    if (postedBill.status !== "posted") throw new Error("Expected status posted");

    // Verify Journal Entry
    const postJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "vendor_bill", sourceId: bill._id });
    if (!postJournal) throw new Error("Journal entry not found for posted bill");
    console.log("Journal entry created for posting.");
    
    // Check line-level debit: Inventory Asset (1200) since it has ingredientId
    const inventoryLine = postJournal.lines.find(l => l.debit > 0);
    if (!inventoryLine) throw new Error("Debit line missing");
    // We check account code later if needed, but for now just presence
    console.log(`Debit line found: ${inventoryLine.debit}`);

    const apLine = postJournal.lines.find(l => l.credit > 0);
    if (!apLine) throw new Error("Credit line (AP) missing");
    console.log(`Credit line (AP) found: ${apLine.credit}`);

    // Verify Audit Log
    const auditPosted = await JournalAuditLog.findOne({ organization: orgId, action: "vendor_bill.posted" });
    if (!auditPosted) throw new Error("Audit log missing for post");
    console.log("Audit log found for post.");

    // 4. Record Payment
    console.log("--- 4. Record Payment ---");
    const paidBill = await accountingService.recordVendorBillPayment(bill._id, 50, { method: "cash", date: new Date() }, null);
    console.log(`VendorBill status: ${paidBill.status}, Amount Paid: ${paidBill.amountPaid}`);
    if (paidBill.status !== "paid") throw new Error("Expected status paid");

    // Verify Payment Journal Entry
    const payJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "vendor_bill_payment", sourceId: bill._id });
    if (!payJournal) throw new Error("Journal entry not found for payment");
    console.log("Journal entry created for payment.");

    const apDebitLine = payJournal.lines.find(l => l.debit > 0);
    if (!apDebitLine) throw new Error("Debit line (AP closure) missing");
    console.log(`AP Debit line found: ${apDebitLine.debit}`);

    // 5. Void VendorBill
    console.log("--- 5. Void VendorBill ---");
    // We'll create another bill to void after posting because voiding a paid bill is usually more complex, 
    // but the service allows it based on requirements.
    const bill2 = await accountingService.createVendorBillFromPO(po._id, {}, null);
    await accountingService.postVendorBill(bill2._id, null);
    const voidedBill = await accountingService.voidVendorBill(bill2._id, null);
    console.log(`VendorBill2 status: ${voidedBill.status}`);
    if (voidedBill.status !== "void") throw new Error("Expected status void");

    // Verify Reversal Journal
    const voidJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "vendor_bill_void", sourceId: bill2._id });
    if (!voidJournal) throw new Error("Reversal journal entry not found for void");
    console.log("Reversal journal entry created for void.");
    
    // Check reversal lines (should be opposite of posting)
    const originalJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "vendor_bill", sourceId: bill2._id });
    if (voidJournal.lines.length !== originalJournal.lines.length) throw new Error("Reversal lines count mismatch");
    console.log("Reversal lines validated.");

    console.log("\nVERIFICATION SUCCESSFUL!");

  } catch (err) {
    console.error("\nVERIFICATION FAILED:");
    console.error(err);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    if (org) {
      const orgId = org._id;
      await JournalAuditLog.deleteMany({ organization: orgId });
      await JournalEntry.deleteMany({ organization: orgId });
      await VendorBill.deleteMany({ organization: orgId });
      await PurchaseOrder.deleteMany({ organization: orgId });
      await Ingredient.deleteMany({ organization: orgId });
      await Location.deleteMany({ organization: orgId });
      await Supplier.deleteMany({ organization: orgId });
      await Organization.deleteOne({ _id: orgId });
    }
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

main();
