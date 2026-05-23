const bcrypt = require("bcrypt");
const PlatformApiKey = require("../models/platformApiKeyModel");
const { P } = require("../constants/platformPermissions");

const PROVISION_KEY_LABEL = "stockix-provision";

/**
 * When POS_PLATFORM_API_KEY is set, ensure a matching PlatformApiKey exists in Mongo
 * so Stockix worker provisioning can call /api/platform/v1/* on a fresh tenant stack.
 */
async function ensureProvisionPlatformApiKey() {
  const raw = process.env.POS_PLATFORM_API_KEY;
  if (!raw || String(raw).trim().length < 10) {
    return;
  }
  const apiKey = String(raw).trim();
  const keyPrefix = apiKey.slice(0, 16);
  const existing = await PlatformApiKey.findOne({
    keyPrefix,
    revokedAt: null,
    label: PROVISION_KEY_LABEL,
  })
    .select("+keyHash")
    .limit(1);

  if (existing && (await bcrypt.compare(apiKey, existing.keyHash))) {
    return;
  }

  const keyHash = await bcrypt.hash(apiKey, 10);
  await PlatformApiKey.findOneAndUpdate(
    { label: PROVISION_KEY_LABEL },
    {
      $set: {
        label: PROVISION_KEY_LABEL,
        keyHash,
        keyPrefix,
        scopes: [P.ORG_READ, P.ORG_WRITE, "*"],
        revokedAt: null,
      },
    },
    { upsert: true, new: true },
  );
  console.log("[pos] provision platform API key synced from POS_PLATFORM_API_KEY");
}

module.exports = { ensureProvisionPlatformApiKey };
