const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { computePinLookup } = require("../utils/pinLookup");

/** Staff login titles only; each must exist in `defaultRbacRoles`. Accountant templates live in RBAC only. */
const ROLES = ["admin", "manager", "waiter", "cashier", "kitchen", "hostess"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_-]{3,30}$/,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
      required: false,
    },

    role: {
      type: String,
      required: true,
      enum: ROLES,
      lowercase: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    pin: {
      type: String,
      required: function pinRequired() {
        return !this.passwordHash;
      },
      select: false,
    },

    pinLookup: {
      type: String,
      required: function pinLookupRequired() {
        return !this.passwordHash;
      },
      select: false,
    },

    currentRefreshJti: {
      type: String,
      select: false,
    },

    /** Tenant organization (required after SaaS cutover). */
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },

    /** Branch scope; null for “super” admins who can see all locations. */
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    /** Multi-branch assignment list; `location` remains primary/default branch. */
    locations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Location",
      },
    ],

    /** Versioned legal acceptance at user level (optional; org-level also exists). */
    legalAcceptance: {
      tosVersion: { type: String, trim: true, default: "" },
      tosAcceptedAt: { type: Date, default: null },
      privacyVersion: { type: String, trim: true, default: "" },
      privacyAcceptedAt: { type: Date, default: null },
    },

    /**
     * Optional RBAC profile key (usually a custom role from RbacConfig).
     * When unset, permissions use `role` (built-in waiter, cashier, …).
     */
    permissionRole: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    pinFailedAttempts: {
      type: Number,
      default: 0,
    },
    pinLockedUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: null,
      email: { $type: "string" },
    },
  }
);
userSchema.index(
  { organization: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      email: { $type: "string" },
    },
  }
);
userSchema.index(
  { organization: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { organization: { $type: "objectId" } },
  }
);
userSchema.index(
  { organization: 1, username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      username: { $type: "string" },
    },
  }
);
userSchema.index(
  { organization: 1, pinLookup: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organization: { $type: "objectId" },
      pinLookup: { $type: "string" },
    },
  }
);

userSchema.pre("validate", function ensureUsernameForLegacy(next) {
  if (this.username != null && String(this.username).trim() !== "") {
    return next();
  }
  const base = String(this.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const fallback = base.length >= 3 ? base : String(base || "user").padEnd(3, "0");
  this.username = fallback;
  next();
});

userSchema.pre("validate", function normalizeAssignedLocations(next) {
  try {
    const normalized = Array.isArray(this.locations)
      ? this.locations
          .map((value) => String(value || "").trim())
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      : [];
    if (this.location && mongoose.Types.ObjectId.isValid(String(this.location))) {
      normalized.push(String(this.location));
    }
    const deduped = [...new Set(normalized)];
    this.locations = deduped.map((value) => new mongoose.Types.ObjectId(value));
    if (!this.location && deduped.length > 0) {
      this.location = new mongoose.Types.ObjectId(deduped[0]);
    }
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Validation runs before `save`; `pinLookup` must exist when `pin` is required.
 * Plain PIN hashing still happens in `pre('save')`.
 */
userSchema.pre("validate", function setPinLookupForValidate(next) {
  try {
    if (this.passwordHash) return next();
    if (!this.pin) return next();
    const s = String(this.pin);
    if (s.startsWith("$2a$") || s.startsWith("$2b$") || s.startsWith("$2y$")) {
      return next();
    }
    if (!/^\d{4,6}$/.test(s)) return next();
    this.pinLookup = computePinLookup(s);
    next();
  } catch (e) {
    next(e);
  }
});

userSchema.pre("save", async function hashPin(next) {
  try {
    if (!this.isModified("pin")) {
      return next();
    }
    if (!this.pin) {
      return next();
    }

    const plain = this.pin;
    if (typeof plain !== "string" || !/^\d{4,6}$/.test(plain)) {
      const err = new Error("PIN must be 4 to 6 digits.");
      err.status = 400;
      return next(err);
    }

    const UserModel = this.constructor;
    const lookup = computePinLookup(plain);
    const dupQuery = {
      pinLookup: lookup,
      _id: { $ne: this._id },
    };
    if (this.organization) {
      dupQuery.organization = this.organization;
    } else {
      dupQuery.organization = null;
    }
    const existing = await UserModel.findOne(dupQuery).select("+pinLookup");

    if (existing) {
      const err = new Error("This PIN is already assigned to another user.");
      err.status = 400;
      return next(err);
    }

    this.pinLookup = lookup;
    const salt = await bcrypt.genSalt(10);
    this.pin = await bcrypt.hash(plain, salt);
    next();
  } catch (e) {
    next(e);
  }
});

/** API alias for `locations` (checklist / client parity). */
userSchema
  .virtual("locationIds")
  .get(function getLocationIds() {
    return this.locations || [];
  })
  .set(function setLocationIds(value) {
    if (Array.isArray(value)) {
      this.locations = value;
    }
  });

userSchema.methods.comparePassword = async function comparePassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(String(plain), this.passwordHash);
};

userSchema.set("toObject", { virtuals: true });

userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    delete ret.pin;
    delete ret.pinLookup;
    delete ret.passwordHash;
    delete ret.currentRefreshJti;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);
User.ROLES = ROLES;
module.exports = User;
