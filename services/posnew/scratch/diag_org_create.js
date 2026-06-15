
require("dotenv").config({ path: "/home/montaser/posnew/apps/pos-backend/.env" });
const mongoose = require("mongoose");
const path = require("path");

const root = "/home/montaser/posnew";
const connectDB = require(path.join(root, "apps/pos-backend/config/database"));
const Organization = require(path.join(root, "apps/pos-backend/models/organizationModel"));
const { addJob } = require(path.join(root, "apps/pos-backend/services/jobQueue"));

async function diagnostic() {
  console.log("Connecting to:", process.env.MONGODB_URI);
  await connectDB();
  console.log("Connected to DB");

  try {
    const name = "Diagnostic Org " + Date.now();
    const slug = "diag-org-" + Date.now();
    const ownerEmail = "diag@example.com";
    const ownerName = "Diag Owner";

    console.log("Creating organization...");
    const org = await Organization.create({
      name,
      slug,
      ownerEmail,
      ownerName,
      lifecycle: "active",
    });
    console.log("Org created:", org._id);

    console.log("Adding job...");
    await addJob("provisioning", "org_bootstrap", {
      organizationId: String(org._id),
      ownerEmail,
      ownerName,
      adminPin: "123456"
    });
    console.log("Job added");

    console.log("All steps passed!");
  } catch (e) {
    console.error("FAILED during diagnostic:");
    console.error(e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

diagnostic();
