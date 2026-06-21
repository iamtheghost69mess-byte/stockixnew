/**
 * Create initial platform owner user (interactive-safe defaults via env).
 * PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_PASSWORD required.
 *
 * Optional sample notifications (empty collection only):
 *   npm run seed:platform-fixtures
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const config = require("../config/config");
const PlatformUser = require("../models/platformUserModel");

async function main() {
  const email = process.env.PLATFORM_OWNER_EMAIL;
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  if (!email || !password) {
    console.error("Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD");
    process.exit(1);
  }
  await mongoose.connect(config.databaseURI);
  const exists = await PlatformUser.findOne({
    email: String(email).trim().toLowerCase(),
  });
  if (exists) {
    console.log("Platform user already exists:", exists.email);
    await mongoose.disconnect();
    return;
  }
  const passwordHash = await bcrypt.hash(String(password), 10);
  const u = await PlatformUser.create({
    email: String(email).trim().toLowerCase(),
    passwordHash,
    roles: ["platform_owner"],
    status: "active",
  });
  console.log("Created platform owner:", u.email, u._id.toString());
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
