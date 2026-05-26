const createHttpError = require("http-errors");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const OrgInvitation = require("../models/orgInvitationModel");
const PosAuditLog = require("../models/posAuditLogModel");
const { computePinLookup } = require("../utils/pinLookup");
const {
  POS_AUD,
  verifyAccessToken,
  issueTokenPair,
  verifyRefreshToken,
} = require("../utils/authTokens");
const { PLATFORM_AUD } = require("../utils/platformAuthTokens");
const { setAuthCookies, clearAuthCookies } = require("../utils/authCookies");
const { getUserProfilePayload } = require("./userController");
const { enforceActiveOrganizationById } = require("../middlewares/requireActiveOrganization");
const { enforceApprovedDeviceForOrganization } = require("../middlewares/deviceAuth");

const normalizeRole = (role) => {
  if (role == null || role === "") return null;
  return String(role).toLowerCase().trim();
};

const PIN_LOCKOUT_THRESHOLD = 3;
const PIN_LOCKOUT_MS = 5 * 60 * 1000;
const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;

function buildLoginError(status, message, code, extras = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extras);
  return err;
}

function normalizeUsernameBase(value) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  if (base.length >= 3 && USERNAME_REGEX.test(base)) return base;
  if (!base) return "user";
  return base.padEnd(3, "0").slice(0, 30);
}

async function allocateUniqueUsername({ baseValue, organizationId, excludeUserId = null }) {
  const base = normalizeUsernameBase(baseValue);
  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const candidate = `${base.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
    const query = {
      organization: organizationId || null,
      username: candidate,
    };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }
    const taken = await User.exists(query);
    if (!taken) return candidate;
  }
  return `${base.slice(0, 27)}-${Date.now().toString().slice(-2)}`;
}

/** Block POS login/refresh when the organization is outside license window. */
async function assertOrganizationActiveForUser(user, requestId) {
  if (!user || !user.organization) return;
  const oid = user.organization._id || user.organization;
  const org = await Organization.findById(oid)
    .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt lifecycle")
    .lean();
  if (!org) {
    const err = new Error("Organization not found.");
    err.status = 403;
    err.code = "ORGANIZATION_NOT_FOUND";
    throw err;
  }
  await enforceActiveOrganizationById(oid, {
    requestId,
    routeKey: "tenant.auth.assertOrganizationActiveForUser",
  });
}

/** Block POS access when staff `status` is `suspended` (Staff Management “inactive”). */
function assertPosUserAccountActive(user) {
  if (!user) return;
  const st = String(user.status ?? "active").toLowerCase();
  if (st === "suspended") {
    const err = new Error("This account has been deactivated. Contact your administrator.");
    err.status = 403;
    err.code = "USER_SUSPENDED";
    throw err;
  }
}

const register = async (req, res, next) => {
  try {
    const { name, username, email, password, role, phone, pin } = req.body;

    if (!name || !email || !password || !role) {
      return next(
        createHttpError(400, "Name, email, password, and role are required.")
      );
    }

    if (String(password).length < 8) {
      return next(
        createHttpError(400, "Password must be at least 8 characters.")
      );
    }

    const r = normalizeRole(role);
    if (!User.ROLES.includes(r)) {
      return next(
        createHttpError(
          400,
          `Role must be one of: ${User.ROLES.join(", ")}.`
        )
      );
    }

    if (req.user.role === "manager" && r === "admin") {
      return next(createHttpError(403, "Managers cannot create admin accounts."));
    }

    const emailNorm = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const doc = {
      name: String(name).trim(),
      username: await allocateUniqueUsername({
        baseValue: username || emailNorm.split("@")[0] || name,
        organizationId: null,
      }),
      email: emailNorm,
      passwordHash,
      role: r,
      phone: phone ? String(phone).trim() : undefined,
    };

    if (pin !== undefined && pin !== null && String(pin) !== "") {
      if (!/^\d{4,6}$/.test(String(pin))) {
        return next(createHttpError(400, "PIN must be 4 to 6 digits."));
      }
      doc.pin = String(pin);
    }

    const newUser = await User.create(doc);
    res.status(201).json({
      success: true,
      message: "User registered.",
      data: newUser,
    });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Email already registered."));
    }
    next(e);
  }
};

const loginWithPin = async (pin, options = {}) => {
  if (!pin) {
    throw buildLoginError(400, "PIN is required.");
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    throw buildLoginError(400, "PIN must be 4 to 6 digits.");
  }
  const pinLookup = computePinLookup(pin);
  const pinQuery = { pinLookup };
  if (options.subdomainOrg?._id) {
    pinQuery.organization = options.subdomainOrg._id;
  }
  const foundUser = await User.findOne(pinQuery)
    .select("+pin +pinFailedAttempts +pinLockedUntil")
    .populate("location", "name code waiterCanPrintReceipt")
    .populate("locations", "name code waiterCanPrintReceipt");
  if (!foundUser) {
    throw buildLoginError(401, "Invalid PIN.", "INVALID_PIN");
  }

  const now = new Date();
  const lockedUntil = foundUser.pinLockedUntil ? new Date(foundUser.pinLockedUntil) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    const remainingSeconds = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
    throw buildLoginError(
      423,
      "Account locked.",
      "ACCOUNT_LOCKED",
      { remainingSeconds }
    );
  }

  const isMatch = await bcrypt.compare(String(pin), foundUser.pin);
  if (!isMatch) {
    const failedAttempts = Number(foundUser.pinFailedAttempts || 0) + 1;
    if (failedAttempts >= PIN_LOCKOUT_THRESHOLD) {
      foundUser.pinFailedAttempts = 0;
      foundUser.pinLockedUntil = new Date(now.getTime() + PIN_LOCKOUT_MS);
      await foundUser.save();
      throw buildLoginError(
        423,
        "Account locked.",
        "ACCOUNT_LOCKED",
        { remainingSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000) }
      );
    }

    foundUser.pinFailedAttempts = failedAttempts;
    foundUser.pinLockedUntil = null;
    await foundUser.save();
    throw buildLoginError(
      401,
      "Invalid PIN.",
      "INVALID_PIN",
      { remainingAttempts: PIN_LOCKOUT_THRESHOLD - failedAttempts }
    );
  }

  if (foundUser.pinFailedAttempts !== 0 || foundUser.pinLockedUntil) {
    foundUser.pinFailedAttempts = 0;
    foundUser.pinLockedUntil = null;
    await foundUser.save();
  }
  return foundUser;
};

const loginWithPassword = async (email, password, options = {}) => {
  if (!email || !password) {
    const err = new Error("Email and password are required.");
    err.status = 400;
    throw err;
  }
  const subdomainOrgId = options.subdomainOrg?._id || null;
  if (!subdomainOrgId) {
    throw buildLoginError(
      400,
      "Organization context is required for password login.",
      "MISSING_ORGANIZATION_CONTEXT"
    );
  }
  const emailNorm = String(email).trim().toLowerCase();
  const foundUser = await User.findOne({
    email: emailNorm,
    organization: subdomainOrgId,
  }).select(
    "+passwordHash"
  );
  if (!foundUser || !foundUser.passwordHash) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }
  const ok = await foundUser.comparePassword(password);
  if (!ok) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }
  return foundUser;
};

const login = async (req, res, next) => {
  try {
    const { pin, email, password } = req.body;
    let user;
    if (pin) {
      user = await loginWithPin(pin, { subdomainOrg: req.subdomainOrg });
    } else {
      user = await loginWithPassword(email, password, {
        subdomainOrg: req.subdomainOrg,
      });
    }

    user = await User.findById(user._id)
      .populate("location", "name code waiterCanPrintReceipt")
      .populate("locations", "name code waiterCanPrintReceipt")
      .populate("organization", "lifecycle name");

    assertPosUserAccountActive(user);
    await assertOrganizationActiveForUser(user, res.locals?.requestId);

    const { accessToken, refreshToken } = await issueTokenPair(user);
    setAuthCookies(res, accessToken, refreshToken);
    const auditOrgId = user.organization?._id || user.organization || null;
    if (auditOrgId) {
      await PosAuditLog.create({
        organization: auditOrgId,
        location: user.location?._id || user.location || null,
        user: user._id,
        action: "staff_login",
        metadata: { method: pin ? "pin" : "password" },
      });
    }

    res.status(200).json({
      success: true,
      message: "User login successfully.",
      data: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error.status) {
      const payload = {
        success: false,
        message: error.message,
        code: error.code,
      };
      if (Number.isFinite(error.remainingAttempts)) {
        payload.remainingAttempts = error.remainingAttempts;
      }
      if (Number.isFinite(error.remainingSeconds)) {
        payload.remainingSeconds = error.remainingSeconds;
      }
      return res.status(error.status).json(payload);
    }
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return next(createHttpError(401, "Refresh token required via cookie."));
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return next(createHttpError(401, "Invalid or expired refresh token."));
    }

    const user = await User.findById(payload._id)
      .select("+currentRefreshJti")
      .populate("organization", "lifecycle name");
    if (!user || user.currentRefreshJti !== payload.jti) {
      return next(createHttpError(401, "Invalid refresh token."));
    }

    try {
      assertPosUserAccountActive(user);
      await assertOrganizationActiveForUser(user, res.locals?.requestId);
    } catch (e) {
      if (e.status) {
        const he = createHttpError(e.status, e.message);
        if (e.code) he.code = e.code;
        return next(he);
      }
      throw e;
    }

    const { accessToken, refreshToken } = await issueTokenPair(user);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      success: true,
      message: "Token refreshed.",
      accessToken,
      refreshToken,
    });
  } catch (e) {
    next(e);
  }
};

const logout = async (req, res, next) => {
  try {
    const actor = await User.findById(req.user._id)
      .select("_id organization location")
      .lean();
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { currentRefreshJti: 1 },
    });
    if (actor?.organization) {
      await PosAuditLog.create({
        organization: actor.organization,
        location: actor.location || null,
        user: actor._id,
        action: "staff_logout",
        metadata: {},
      });
    }
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: "User logout successfully." });
  } catch (e) {
    next(e);
  }
};

function readPosAccessTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }
  return null;
}

/**
 * Always responds 200. Reports whether a valid POS access token is present (cookie or Bearer).
 * Avoids calling GET /api/user on the login page (which returns 401 when logged out).
 */
const session = async (req, res) => {
  try {
    const token = readPosAccessTokenFromRequest(req);
    if (!token) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    let decodeToken;
    try {
      decodeToken = verifyAccessToken(token);
    } catch {
      return res.status(200).json({ success: true, authenticated: false });
    }

    if (decodeToken.aud === PLATFORM_AUD) {
      return res.status(200).json({ success: true, authenticated: false });
    }
    if (decodeToken.aud && decodeToken.aud !== POS_AUD) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const user = await User.findById(decodeToken._id);
    if (!user) {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const acct = String(user.status ?? "active").toLowerCase();
    if (acct === "suspended") {
      return res.status(200).json({ success: true, authenticated: false });
    }

    try {
      await assertOrganizationActiveForUser(user, req.requestId);
    } catch {
      return res.status(200).json({ success: true, authenticated: false });
    }

    const u = await getUserProfilePayload(user);
    return res.status(200).json({
      success: true,
      authenticated: true,
      data: u,
    });
  } catch {
    return res.status(200).json({ success: true, authenticated: false });
  }
};

const acceptInvitation = async (req, res, next) => {
  try {
    const { invitationId, token, password, name } = req.body || {};
    if (!invitationId || !token) {
      return next(
        createHttpError(400, "invitationId and token are required.")
      );
    }
    if (!mongoose.Types.ObjectId.isValid(String(invitationId))) {
      return next(createHttpError(400, "Invalid invitationId."));
    }

    const inv = await OrgInvitation.findById(invitationId).select(
      "+tokenHash"
    );
    if (!inv) return next(createHttpError(404, "Invitation not found."));

    const invOrg = await Organization.findById(inv.organization)
      .select("timezone licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt lifecycle")
      .lean();
    if (!invOrg) {
      return next(createHttpError(403, "Organization not found."));
    }
    await enforceActiveOrganizationById(inv.organization, {
      requestId: res.locals?.requestId,
      routeKey: "tenant.auth.acceptInvitation",
      traceparent: req.headers?.traceparent || res.locals?.traceparent,
    });
    if (inv.acceptedAt) {
      return next(createHttpError(409, "Invitation already accepted."));
    }
    if (inv.expiresAt < new Date()) {
      return next(createHttpError(410, "Invitation expired."));
    }

    const tokenOk = await bcrypt.compare(String(token), inv.tokenHash);
    if (!tokenOk) {
      return next(createHttpError(403, "Invalid token."));
    }

    let role = normalizeRole(inv.roleHint) || "waiter";
    if (!User.ROLES.includes(role)) {
      role = "waiter";
    }

    const emailNorm = inv.email;
    let user = await User.findOne({ email: emailNorm }).select(
      "+passwordHash"
    );

    if (!user) {
      if (!password || String(password).length < 8) {
        return next(
          createHttpError(
            400,
            "Password is required (min 8 characters) for new accounts."
          )
        );
      }
      const dispName = name ? String(name).trim() : emailNorm.split("@")[0];
      const passwordHash = await bcrypt.hash(String(password), 10);
      const usernameBase = dispName || emailNorm.split("@")[0];
      user = await User.create({
        name: dispName,
        username: await allocateUniqueUsername({
          baseValue: usernameBase,
          organizationId: inv.organization,
        }),
        email: emailNorm,
        passwordHash,
        role,
        organization: inv.organization,
      });
    } else {
      if (
        user.organization &&
        String(user.organization) !== String(inv.organization)
      ) {
        return next(
          createHttpError(409, "User belongs to another organization.")
        );
      }
      user.organization = inv.organization;
      user.role = role;
      if (!user.username) {
        const nameBase = String(user.name || emailNorm.split("@")[0] || "user");
        user.username = await allocateUniqueUsername({
          baseValue: nameBase,
          organizationId: inv.organization,
          excludeUserId: user._id,
        });
      }
      if (password != null && String(password) !== "") {
        if (String(password).length < 8) {
          return next(
            createHttpError(400, "Password must be at least 8 characters.")
          );
        }
        user.passwordHash = await bcrypt.hash(String(password), 10);
      }
      await user.save();
    }

    inv.acceptedAt = new Date();
    await inv.save();

    user = await User.findById(user._id)
      .populate("location", "name code waiterCanPrintReceipt")
      .populate("locations", "name code waiterCanPrintReceipt");
    await enforceApprovedDeviceForOrganization(req, res, inv.organization);
    const { accessToken, refreshToken } = await issueTokenPair(user);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      success: true,
      message: "Invitation accepted.",
      data: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (e) {
    if (e.code === 11000) {
      return next(createHttpError(400, "Email conflict."));
    }
    next(e);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  session,
  loginWithPin,
  loginWithPassword,
  acceptInvitation,
};
