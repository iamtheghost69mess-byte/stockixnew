const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const { computePinLookup } = require("../utils/pinLookup");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Database Repair...");

  const orgs = await Organization.find({}).lean();
  let repairedCount = 0;

  for (const org of orgs) {
    const users = await User.find({ organization: org._id, role: { $in: User.ROLES } })
      .select("+pin +pinLookup")
      .lean();

    if (users.length === 0) continue;

    console.log(`Auditing Org: ${org.slug || org.name} (${users.length} users)`);
    
    // Default roles to care about
    const rolesToCheck = ["admin", "manager", "waiter", "cashier", "kitchen"];
    
    // We'll rebuild defaultCredentials based solely on what's actually in the User table
    let newDefaultCredentials = [];
    let needsRepair = false;

    // Use a Map to quickly lookup the existing defaultCredentials
    const currentCredsObj = {};
    if (org.defaultCredentials) {
        for (const c of org.defaultCredentials) {
            currentCredsObj[c.role] = String(c.pin);
        }
    }

    for (const u of users) {
      if (!rolesToCheck.includes(u.role)) continue;

      let actualPin = null;
      if (u.pinLookup) {
        for (let i = 100000; i <= 999999; i++) {
          if (computePinLookup(i.toString()) === u.pinLookup) {
            actualPin = i.toString();
            break;
          }
        }
      }

      if (actualPin) {
        newDefaultCredentials.push({
          role: u.role,
          name: u.role,
          pin: actualPin,
        });

        if (currentCredsObj[u.role] !== actualPin) {
          console.log(`  Mismatch found! ${u.role}: User PIN is ${actualPin}, but Org said ${currentCredsObj[u.role] || "null"}`);
          needsRepair = true;
        }
      }
    }

    // Check if the lengths are different, meaning missing or extra credentials
    if (org.defaultCredentials && org.defaultCredentials.length !== newDefaultCredentials.length) {
      needsRepair = true;
    } else if (!org.defaultCredentials && newDefaultCredentials.length > 0) {
      needsRepair = true;
    }

    if (needsRepair) {
      // Actually update the DB
      await Organization.findByIdAndUpdate(org._id, {
        $set: { defaultCredentials: newDefaultCredentials }
      });
      console.log(`  [Repaired] Successfully synced defaultCredentials for ${org.slug}`);
      repairedCount++;
    } else {
      console.log(`  [OK] Credentials in sync.`);
    }
  }

  console.log(`\nRepair completed! Fixed ${repairedCount} organizations.`);
  process.exit();
}

main().catch((e) => {
  console.error("Repair script failed:", e);
  process.exit(1);
});
