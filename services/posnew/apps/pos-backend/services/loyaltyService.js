const LoyaltyConfig = require("../models/loyaltyConfigModel");

/**
 * @param {import("mongoose").Types.ObjectId | null} [organizationId]
 */
async function getLoyaltyConfig(organizationId = null) {
  if (organizationId) {
    let c = await LoyaltyConfig.findOne({
      key: "default",
      organization: organizationId,
    });
    if (!c) {
      c = await LoyaltyConfig.create({
        key: "default",
        organization: organizationId,
      });
    }
    return c;
  }
  let c = await LoyaltyConfig.findOne({
    key: "default",
    $or: [{ organization: null }, { organization: { $exists: false } }],
  });
  if (!c) {
    c = await LoyaltyConfig.create({ key: "default" });
  }
  return c;
}

module.exports = { getLoyaltyConfig };
