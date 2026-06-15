const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const MAX_GLOBAL_USER_PAGE_SIZE = 200;
const MAX_GLOBAL_USER_SEARCH_LENGTH = 128;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const listGlobalUsers = async (req, res, next) => {
  try {
    const { status, search, organizationId } = req.query;
    const limit = Math.min(
      parseNonNegativeInt(req.query.limit, 100),
      MAX_GLOBAL_USER_PAGE_SIZE
    );
    const skip = parseNonNegativeInt(req.query.skip, 0);
    const match = {};
    if (status) match.status = status;
    if (organizationId) match.organization = organizationId;
    if (search) {
      const sanitizedSearch = String(search).trim().slice(
        0,
        MAX_GLOBAL_USER_SEARCH_LENGTH
      );
      const searchRegex = new RegExp(escapeRegex(sanitizedSearch), "i");
      match.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }
    
    const users = await User.find(match)
      .populate("organization", "name status")
      .populate("location", "name")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    
    const count = await User.countDocuments(match);
    res.json({ success: true, data: { users, total: count } });
  } catch (e) {
    next(e);
  }
};

const getGlobalUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("organization", "name status domain")
      .populate("location", "name");
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

const setGlobalUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
       const err = new Error("Invalid status");
       err.status = 400;
       throw err;
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }
    user.status = status;
    await user.save();
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

const triggerGlobalUserPasswordReset = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("+passwordHash +pinLookup +pin");
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }
    
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(tempPassword, salt);
    // Erase pin memory
    user.pin = undefined;
    user.pinLookup = undefined;
    user.currentRefreshJti = null;

    await user.save();
    res.json({ success: true, message: "User password reset triggered." });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listGlobalUsers,
  getGlobalUser,
  setGlobalUserStatus,
  triggerGlobalUserPasswordReset,
};
