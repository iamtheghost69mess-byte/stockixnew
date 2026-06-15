const express = require("express");
const mongoose = require("mongoose");
const config = require("../config/config");
const { getConnection } = require("../services/jobQueue");
const { getPosSocketMetricsSnapshot } = require("../services/posSocketMetrics");

const router = express.Router();

router.get("/health", (req, res) => {
  const io = req.app.get("io");
  const posSocket =
    io && typeof io.engine?.clientsCount === "number"
      ? {
          engineClientsCount: io.engine.clientsCount,
          ...getPosSocketMetricsSnapshot(),
        }
      : getPosSocketMetricsSnapshot();
  res.json({
    ok: true,
    service: "pos-backend",
    env: config.nodeEnv,
    posSocket,
  });
});

/** Prometheus text 0.0.4 (no prom-client dependency) — POS socket gauges only. */
router.get("/metrics", (req, res) => {
  const io = req.app.get("io");
  const snap = getPosSocketMetricsSnapshot();
  const engine =
    io && typeof io.engine?.clientsCount === "number"
      ? io.engine.clientsCount
      : 0;
  const body = [
    "# HELP pos_socket_engine_clients Socket.IO engine clientsCount",
    "# TYPE pos_socket_engine_clients gauge",
    `pos_socket_engine_clients ${engine}`,
    "# HELP pos_socket_active_connections Tracked POS socket connections (adapter-aware hooks)",
    "# TYPE pos_socket_active_connections gauge",
    `pos_socket_active_connections ${snap.activeConnections}`,
    "# HELP pos_socket_total_connections_accepted Cumulative accepted connections since process start",
    "# TYPE pos_socket_total_connections_accepted counter",
    `pos_socket_total_connections_accepted ${snap.totalConnectionsAccepted}`,
    "",
  ].join("\n");
  res.type("text/plain; version=0.0.4").send(body);
});

router.get("/ready", async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = true;
  if (config.redisUrl) {
    try {
      const c = getConnection();
      if (c && typeof c.ping === "function") {
        await c.ping();
      } else {
        redisOk = false;
      }
    } catch {
      redisOk = false;
    }
  }
  const ok = mongoOk && redisOk;
  res.status(ok ? 200 : 503).json({
    ok,
    mongo: mongoOk,
    redis: redisOk,
  });
});

module.exports = router;
