const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const { computePinLookup } = require("../utils/pinLookup");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Database Repair...");

  // Pre-compute all PIN hashes
  console.log("Pre-computing all 6-digit PIN hashes... (Takes ~1 second)");
  const hashMap = new Map();
  for (let i = 100000; i <= 999999; i++) {
    const p = i.toString();
    hashMap.set(computePinLookup(p), p);
  }
  console.log("Hash table ready!");

  const orgs = await Organization.find({}).lean();
  let repairedCount = 0;

  for (const org of orgs) {
    const users = await User.find({ organization: org._id, role: { $in: User.ROLES } })
      .select("+pin +pinLookup")
      .lean();

    if (users.length === 0) continue;

    const rolesToCheck = ["admin", "manager", "waiter", "cashier", "kitchen"];
    
    let newDefaultCredentials = [];
    let needsRepair = false;

    const currentCredsObj = {};
    if (org.defaultCredentials) {
        for (const c of org.defaultCredentials) {
            currentCredsObj[c.role] = String(c.pin);
        }
    }

    for (const u of users) {
      if (!rolesToCheck.includes(u.role)) continue;

      let actualPin = null;
      if (u.pinLookup && hashMap.has(u.pinLookup)) {
        actualPin = hashMap.get(u.pinLookup);
      }

      if (actualPin) {
        newDefaultCredentials.push({
          role: u.role,
          name: u.role,
          pin: actualPin,
        });

        if (currentCredsObj[u.role] !== actualPin) {
          console.log(`  [Mismatch] Org: ${org.slug} | Role: ${u.role} | Real PIN: ${actualPin} | Old PIN: ${currentCredsObj[u.role] || "null"}`);
          needsRepair = true;
        }
      }
    }

    if (org.defaultCredentials && org.defaultCredentials.length !== newDefaultCredentials.length) {
      needsRepair = true;
    } else if (!org.defaultCredentials && newDefaultCredentials.length > 0) {
      needsRepair = true;
    }

    if (needsRepair) {
      await Organization.findByIdAndUpdate(org._id, {
        $set: { defaultCredentials: newDefaultCredentials }
      });
      console.log(`  [Repaired] Successfully synced defaultCredentials for ${org.slug}`);
      repairedCount++;
    } else {
      // console.log(`  [OK] ${org.slug}`);
    }
  }

  console.log(`\nRepair completed! Fixed ${repairedCount} organizations.`);
  process.exit();
}

main().catch((e) => {
  console.error("Repair script failed:", e);
  process.exit(1);
});
