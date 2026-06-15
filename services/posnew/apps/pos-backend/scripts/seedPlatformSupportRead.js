/**
 * Create platform_support_read user for RBAC testing (E2E / staging).
 * PLATFORM_SUPPORT_READ_EMAIL, PLATFORM_SUPPORT_READ_PASSWORD required.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const config = require("../config/config");
const PlatformUser = require("../models/platformUserModel");

async function main() {
  const email = process.env.PLATFORM_SUPPORT_READ_EMAIL;
  const password = process.env.PLATFORM_SUPPORT_READ_PASSWORD;
  if (!email || !password) {
    console.error("Set PLATFORM_SUPPORT_READ_EMAIL and PLATFORM_SUPPORT_READ_PASSWORD");
    process.exit(1);
  }
  await mongoose.connect(config.databaseURI);
  const emailNorm = String(email).trim().toLowerCase();
  const exists = await PlatformUser.findOne({ email: emailNorm });
  if (exists) {
    exists.roles = ["platform_support_read"];
    exists.status = "active";
    exists.passwordHash = await bcrypt.hash(String(password), 10);
    await exists.save();
    console.log("Updated platform_support_read:", exists.email);
    await mongoose.disconnect();
    return;
  }
  const passwordHash = await bcrypt.hash(String(password), 10);
  const u = await PlatformUser.create({
    email: emailNorm,
    passwordHash,
    roles: ["platform_support_read"],
    status: "active",
  });
  console.log("Created platform_support_read:", u.email, u._id.toString());
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
