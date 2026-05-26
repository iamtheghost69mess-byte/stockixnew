const MenuItem = require("../models/menuItemModel");
const Ingredient = require("../models/ingredientModel");
const IntegrationItemMapping = require("../models/integrationItemMappingModel");
const IntegrationIngredientMapping = require("../models/integrationIngredientMappingModel");
const IntegrationVendorMapping = require("../models/integrationVendorMappingModel");
const Supplier = require("../models/supplierModel");
const IntegrationConfig = require("../models/integrationConfigModel");

/**
 * Mapping readiness report for Finance bridge operators.
 * @param {string} organizationId
 */
async function getIntegrationMappingCoverage(organizationId) {
  const orgId = organizationId;

  const [menuItems, ingredients, suppliers, itemMappings, ingMappings, vendorMappings, cfg] =
    await Promise.all([
      MenuItem.find({ organization: orgId, status: { $ne: "archived" } })
        .select("_id name inventoryImpact")
        .lean(),
      Ingredient.find({ organization: orgId, status: { $ne: "archived" } })
        .select("_id name")
        .lean(),
      Supplier.find({ organization: orgId }).select("_id name").lean(),
      IntegrationItemMapping.find({ organization: orgId })
        .select("posMenuItemId bigcapitalItemId")
        .lean(),
      IntegrationIngredientMapping.find({ organization: orgId })
        .select("posIngredientId bigcapitalItemId")
        .lean(),
      IntegrationVendorMapping.find({ organization: orgId })
        .select("posSupplierId bigcapitalVendorId")
        .lean(),
      IntegrationConfig.findOne({ organization: orgId }).lean(),
    ]);

  const mappedMenuIds = new Set(itemMappings.map((m) => String(m.posMenuItemId)));
  const mappedIngIds = new Set(ingMappings.map((m) => String(m.posIngredientId)));
  const mappedSupplierIds = new Set(
    vendorMappings.map((m) => String(m.posSupplierId))
  );

  const sellableMenu = menuItems.filter(
    (m) => (m.inventoryImpact || "stockable") !== "service"
  );
  const unmappedMenuItems = sellableMenu
    .filter((m) => !mappedMenuIds.has(String(m._id)))
    .map((m) => ({ id: String(m._id), name: m.name || "" }));

  const unmappedIngredients = ingredients
    .filter((i) => !mappedIngIds.has(String(i._id)))
    .map((i) => ({ id: String(i._id), name: i.name || "" }));

  const unmappedSuppliers = suppliers
    .filter((s) => !mappedSupplierIds.has(String(s._id)))
    .map((s) => ({ id: String(s._id), name: s.name || "" }));

  const bc = cfg?.bigcapital || {};
  const salesReady =
    Boolean(bc.enabled)
    && Boolean(bc.defaultWalkInCustomerId)
    && Boolean(bc.defaultCashDepositAccountId)
    && unmappedMenuItems.length === 0;

  const inventoryReady =
    Boolean(bc.enabled)
    && Boolean(bc.defaultVendorId || vendorMappings.length > 0)
    && unmappedIngredients.length === 0;

  return {
    integrationEnabled: Boolean(bc.enabled),
    financeTenantId: bc.financeTenantId ?? null,
    sales: {
      sellableMenuItemCount: sellableMenu.length,
      mappedMenuItemCount: sellableMenu.length - unmappedMenuItems.length,
      unmappedMenuItems,
      ready: salesReady,
    },
    inventory: {
      ingredientCount: ingredients.length,
      mappedIngredientCount: ingredients.length - unmappedIngredients.length,
      unmappedIngredients,
      supplierCount: suppliers.length,
      mappedSupplierCount: suppliers.length - unmappedSuppliers.length,
      unmappedSuppliers,
      defaultVendorId: bc.defaultVendorId ?? null,
      ready: inventoryReady,
    },
    bridgeReady: salesReady && inventoryReady,
  };
}

module.exports = {
  getIntegrationMappingCoverage,
};
