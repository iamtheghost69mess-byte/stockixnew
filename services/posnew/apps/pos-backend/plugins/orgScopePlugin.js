/**
 * Mongoose plugin: adds optional `organization` scope and helpers.
 * Apply to tenant-owned models: schema.plugin(require('./plugins/orgScopePlugin'));
 */
function orgScopePlugin(schema) {
  schema.add({
    organization: {
      type: require("mongoose").Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
  });

  schema.index({ organization: 1, updatedAt: -1 });

  schema.statics.scopedToOrganization = function scopedToOrganization(orgId) {
    const q = {};
    if (orgId) q.organization = orgId;
    return this.find(q);
  };

  schema.statics.requireOrgFilter = function requireOrgFilter(orgId) {
    if (!orgId) {
      throw new Error("organization scope required");
    }
    return { organization: orgId };
  };
}

module.exports = orgScopePlugin;
