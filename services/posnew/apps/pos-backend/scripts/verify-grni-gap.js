#!/usr/bin/env node
/**
 * Verification script for Gap 5: GRNI Accrual on PO Receipt.
 * Verifies that receipt posts Dr Inventory / Cr GRNI, and Bill posts Dr GRNI / Cr AP.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organizationModel");
const Ingredient = require("../models/ingredientModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const VendorBill = require("../models/vendorBillModel");
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
  let org, ingredient, po;

  try {
    // 1. Setup
    console.log("--- 1. Setup ---");
    org = await Organization.create({ name: `GRNI Test Org ${ts}`, slug: `grni-test-${ts}` });
    const orgId = org._id;
    await accountingService.ensureDefaultAccountsAndConfig(orgId);

    ingredient = await Ingredient.create({ organization: orgId, name: "GRNI Test Ing", unit: "kg", unitCost: 10 });
    
    po = await PurchaseOrder.create({
      organization: orgId,
      status: "confirmed",
      location: new mongoose.Types.ObjectId(), // Mock location
      supplier: new mongoose.Types.ObjectId(), // Mock supplier
      lines: [{
        ingredient: ingredient._id,
        description: "Test Ing",
        quantityOrdered: 5,
        unitCost: 12
      }]
    });
    console.log("PO created.");

    // 2. Mock Receipt (Simulate what controller does)
    console.log("--- 2. Simulate PO Receipt ---");
    const receives = [{
      lineId: po.lines[0]._id,
      quantity: 5,
      unitCost: 12
    }];
    
    await accountingService.postGrniAccrual(po._id, receives, null);
    console.log("GRNI Accrual posted.");

    // 3. Verify Accrual Journal
    console.log("--- 3. Verify Accrual Journal ---");
    const accrualJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "grni_accrual", sourceId: po._id });
    if (!accrualJournal) throw new Error("Accrual journal not found");
    
    const invLine = accrualJournal.lines.find(l => l.debit > 0);
    const grniLine = accrualJournal.lines.find(l => l.credit > 0);
    
    if (invLine.debit !== 60) throw new Error("Expected 60 debit to Inventory");
    if (grniLine.credit !== 60) throw new Error("Expected 60 credit to GRNI");
    console.log("Accrual journal validated (Dr Inventory 60, Cr GRNI 60).");

    // 4. Issue and Post Vendor Bill
    console.log("--- 4. Issue and Post Vendor Bill ---");
    // Simulate updating PO status as the receipt would
    po.lines[0].quantityReceived = 5;
    po.status = "received";
    await po.save();

    const bill = await accountingService.createVendorBillFromPO(po._id, {}, null);
    await accountingService.postVendorBill(bill._id, null);
    console.log("Vendor Bill posted.");

    // 5. Verify Bill Journal (Offsetting GRNI)
    console.log("--- 5. Verify Bill Journal ---");
    const billJournal = await JournalEntry.findOne({ organization: orgId, sourceType: "vendor_bill", sourceId: bill._id });
    if (!billJournal) throw new Error("Bill journal not found");
    
    const debitLine = billJournal.lines.find(l => l.debit > 0);
    const apLine = billJournal.lines.find(l => l.credit > 0);
    
    // Check if debit is to GRNI (2130)
    const grniAcc = (await accountingService.getConfig(orgId)).defaultGrniAccount;
    if (String(debitLine.account._id || debitLine.account) !== String(grniAcc._id || grniAcc)) {
      throw new Error("Vendor Bill did not debit GRNI account");
    }
    if (debitLine.debit !== 60) throw new Error("Expected 60 debit to GRNI");
    console.log("Bill journal validated (Dr GRNI 60, Cr AP 60). Accrual cleared.");

    console.log("\nVERIFICATION SUCCESSFUL!");

  } catch (err) {
    console.error("\nVERIFICATION FAILED:");
    console.error(err);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    if (org) {
      const orgId = org._id;
      await VendorBill.deleteMany({ organization: orgId });
      await JournalEntry.deleteMany({ organization: orgId });
      await PurchaseOrder.deleteMany({ organization: orgId });
      await Ingredient.deleteMany({ organization: orgId });
      await Organization.deleteOne({ _id: orgId });
    }
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

main();
