require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../config/config");
const Organization = require("../models/organizationModel");

async function main() {
  await mongoose.connect(config.databaseURI);
  const org = await Organization.findOne({ slug: "test24" });
  if (org) {
    console.log("Found organization with slug 'test24':");
    console.log(JSON.stringify(org, null, 2));
  } else {
    console.log("No organization found with slug 'test24'");
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
