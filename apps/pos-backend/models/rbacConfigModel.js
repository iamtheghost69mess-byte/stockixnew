const mongoose = require("mongoose");

/**
 * RBAC config: one document per organization (or legacy singleton with organization null).
 */
const customRoleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9][a-z0-9-]{1,62}$/,
    },
    label: { type: String, required: true, trim: true },
    can: { type: [String], default: [] },
    inheritsFrom: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
  },
  { _id: false }
);

const rbacConfigSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    builtinOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
    customRoles: { type: [customRoleSchema], default: [] },
  },
  { timestamps: true }
);

rbacConfigSchema.index(
  { organization: 1 },
  { unique: true, partialFilterExpression: { organization: { $type: "objectId" } } }
);

module.exports = mongoose.model("RbacConfig", rbacConfigSchema);
