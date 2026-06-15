const User = require("../models/userModel");
const Location = require("../models/locationModel");
const config = require("../config/config");
const {
  onConnectionOpen,
  onConnectionClose,
} = require("./posSocketMetrics");
const { PLATFORM_AUD } = require("../utils/platformAuthTokens");
const { POS_AUD, verifyAccessToken } = require("../utils/authTokens");
const { resolveOrganizationIdFromUser } = require("../utils/tenantOrg");
const { posOrgRoom, posOrgLocationRoom } = require("../utils/posSocketRooms");

/**
 * @param {import("socket.io").Server} io
 * @param {{ redisAdapter?: import("socket.io").Adapter }} [opts]
 */
function attachPosSocketServer(io, opts = {}) {
  if (opts.redisAdapter) {
    io.adapter(opts.redisAdapter);
  }

  io.use(async (socket, next) => {
    try {
      const h = socket.handshake;
      let rawToken =
        (h.auth && h.auth.token) ||
        (typeof h.query?.token === "string" ? h.query.token : null);

      if (!rawToken && h.headers.cookie) {
        const cookie = require("cookie");
        const cookies = cookie.parse(h.headers.cookie);
        rawToken = cookies.accessToken || null;
      }

      if (!rawToken || typeof rawToken !== "string") {
        return next(new Error("Unauthorized: missing token"));
      }

      let decoded;
      try {
        decoded = verifyAccessToken(rawToken.trim());
      } catch {
        return next(new Error("Unauthorized: invalid token"));
      }

      if (decoded.aud === PLATFORM_AUD) {
        return next(new Error("Unauthorized: platform token not allowed"));
      }
      if (decoded.aud && decoded.aud !== POS_AUD) {
        return next(new Error("Unauthorized: invalid audience"));
      }

      const user = await User.findById(decoded._id);
      if (!user) {
        return next(new Error("Unauthorized: user not found"));
      }

      const tenantOrgId = resolveOrganizationIdFromUser(user);
      if (!tenantOrgId) {
        return next(new Error("Forbidden: user has no organization"));
      }

      if (
        decoded.organizationId &&
        String(decoded.organizationId) !== String(tenantOrgId)
      ) {
        return next(new Error("Forbidden: token organization mismatch"));
      }

      const requestedLoc =
        (h.auth && h.auth.locationId) ||
        (typeof h.query?.locationId === "string" ? h.query.locationId : null);

      socket.data.userId = String(user._id);
      socket.data.organizationId = String(tenantOrgId);
      socket.data.locationId = null;

      socket.join(posOrgRoom(tenantOrgId));

      if (requestedLoc && String(requestedLoc).trim()) {
        const locId = String(requestedLoc).trim();
        if (user.location != null && String(user.location) !== locId) {
          return next(new Error("Forbidden: location not allowed for user"));
        }
        const loc = await Location.findById(locId).select("organization").lean();
        if (!loc || String(loc.organization || "") !== String(tenantOrgId)) {
          return next(new Error("Forbidden: invalid location"));
        }
        socket.data.locationId = locId;
        socket.join(posOrgLocationRoom(tenantOrgId, locId));
      }

      return next();
    } catch (e) {
      return next(e instanceof Error ? e : new Error("Unauthorized"));
    }
  });

  const clientPacketWindowMs = Math.min(
    60_000,
    Math.max(
      2000,
      Number.parseInt(String(process.env.POS_SOCKET_CLIENT_WINDOW_MS || "10000"), 10) ||
        10000
    )
  );
  const clientPacketMax = Math.min(
    5000,
    Math.max(
      20,
      Number.parseInt(String(process.env.POS_SOCKET_CLIENT_MAX_PACKETS || "200"), 10) ||
        200
    )
  );

  io.on("connection", (socket) => {
    onConnectionOpen();
    let clientPackets = 0;
    let clientWindowReset = Date.now() + clientPacketWindowMs;
    socket.use((packet, next) => {
      const now = Date.now();
      if (now > clientWindowReset) {
        clientPackets = 0;
        clientWindowReset = now + clientPacketWindowMs;
      }
      clientPackets += 1;
      if (clientPackets > clientPacketMax) {
        return next(new Error("Too many client events; slow down."));
      }
      next();
    });
    socket.on("disconnect", () => {
      onConnectionClose();
    });
    if (config.nodeEnv === "development") {
      // eslint-disable-next-line no-console
      console.log(
        `[socket] connected user=${socket.data.userId} org=${socket.data.organizationId}` +
          (socket.data.locationId ? ` loc=${socket.data.locationId}` : "")
      );
    }
  });
}

module.exports = { attachPosSocketServer };
