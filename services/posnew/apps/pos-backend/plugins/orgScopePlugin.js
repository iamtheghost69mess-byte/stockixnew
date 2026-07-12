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

  // --- Visibility-only org-scope guard (warns, does not block) ---
  // Logs when a query on an org-scoped model has no `organization` filter and
  // hasn't explicitly opted out via `.setOptions({ allowCrossOrg: true })`.
  // Intentionally non-blocking: most controllers have never been audited for
  // which queries legitimately need cross-org access (e.g. platform-level
  // aggregation jobs), so failing closed here would risk breaking real
  // behavior blind. Use `scripts/audit-org-scope.mjs` to enumerate the actual
  // call sites, then flip enforcement on as a deliberate follow-up once that
  // list has been reviewed.
  schema.pre(
    [
      "find",
      "findOne",
      "findOneAndUpdate",
      "findOneAndDelete",
      "updateOne",
      "updateMany",
      "countDocuments",
    ],
    function orgScopeWarn(next) {
      const filter = typeof this.getFilter === "function" ? this.getFilter() : {};
      const options = typeof this.getOptions === "function" ? this.getOptions() : {};
      const hasOrgFilter = Object.prototype.hasOwnProperty.call(filter, "organization");
      if (!hasOrgFilter && !options.allowCrossOrg) {
        const modelName = this.model && this.model.modelName ? this.model.modelName : "UnknownModel";
        console.warn(
          `[orgScopePlugin] unscoped ${this.op || "query"} on ${modelName} — no organization filter` +
            " and no allowCrossOrg opt-out. Review with scripts/audit-org-scope.mjs.",
        );
      }
      next();
    },
  );
}

module.exports = orgScopePlugin;
