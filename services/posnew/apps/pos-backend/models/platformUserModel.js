const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const PLATFORM_ROLES = [
  "platform_owner",
  "platform_support_read",
  "platform_support_write",
  "platform_finance",
  "platform_engineer",
];

const platformUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [String],
      default: () => ["platform_support_read"],
      validate: {
        validator(arr) {
          return arr.every((r) => PLATFORM_ROLES.includes(r));
        },
        message: "Invalid platform role",
      },
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    mfaEnabled: { type: Boolean, default: false },
    /** Encrypted payload via fieldEncryption helper — store as Mixed blob */
    mfaSecretEncrypted: { type: mongoose.Schema.Types.Mixed, default: null },
    backupCodesHashes: { type: [String], select: false, default: undefined },
    lastLoginAt: { type: Date, default: null },
    currentRefreshJti: { type: String, select: false, default: null },
    refreshTokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

platformUserSchema.index({ email: 1 }, { unique: true });

platformUserSchema.methods.comparePassword = async function comparePassword(plain) {
  return bcrypt.compare(String(plain), this.passwordHash);
};

platformUserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.currentRefreshJti;
    delete ret.backupCodesHashes;
    delete ret.mfaSecretEncrypted;
    return ret;
  },
});

const PlatformUser = mongoose.model("PlatformUser", platformUserSchema);
PlatformUser.PLATFORM_ROLES = PLATFORM_ROLES;
module.exports = PlatformUser;
