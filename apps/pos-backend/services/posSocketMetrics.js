/** Lightweight counters for POS Socket.IO (exposed on GET /health). */

let activeConnections = 0;
let totalConnectionsAccepted = 0;

function onConnectionOpen() {
  activeConnections += 1;
  totalConnectionsAccepted += 1;
}

function onConnectionClose() {
  activeConnections = Math.max(0, activeConnections - 1);
}

function getPosSocketMetricsSnapshot() {
  return {
    activeConnections,
    totalConnectionsAccepted,
  };
}

module.exports = { onConnectionOpen, onConnectionClose, getPosSocketMetricsSnapshot };
