const dns = require("dns");
const mongoose = require("mongoose");
const config = require("./config");
const User = require("../models/userModel");

/**
 * On some Windows setups Node's SRV resolver fails (`querySrv ECONNREFUSED`) while
 * `nslookup` works. Override resolvers with `MONGODB_DNS_SERVERS` (comma-separated),
 * or in non-production use public DNS when using `mongodb+srv://` if unset.
 */
function applyMongoDnsIfNeeded(databaseUri) {
  const fromEnv = String(process.env.MONGODB_DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  const isSrv =
    typeof databaseUri === "string" && databaseUri.startsWith("mongodb+srv://");
  const isProd = config.nodeEnv === "production";

  let servers = fromEnv;
  if (servers.length === 0 && isSrv && !isProd) {
    servers = ["1.1.1.1", "8.8.8.8"];
  }

  if (servers.length > 0) {
    dns.setServers(servers);
  }
}

const connectDB = async () => {
  try {
    applyMongoDnsIfNeeded(config.databaseURI);
    const conn = await mongoose.connect(config.databaseURI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    try {
      await User.syncIndexes();
      console.log("User model indexes synced");
    } catch (syncErr) {
      console.warn(`User.syncIndexes: ${syncErr.message}`);
    }
  } catch (error) {
    console.log(`Database connection failed: ${error.message}`);
    process.exit();
  }
};

module.exports = connectDB;
