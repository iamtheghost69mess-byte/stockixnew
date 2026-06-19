#!/usr/bin/env bash
# One-time server setup for the branch-tracking deploy system.
# Run once as root (or with sudo) on the VPS.
#
# What this does:
#   1. Makes deploy/poll scripts executable
#   2. Installs stockix-branch.service + stockix-branch.timer into systemd
#   3. Enables and starts the timer (polls every 60s)
#   4. Creates /opt/stockix/active-branch pointing to "main" if not already set
#
# Usage (on VPS):
#   sudo bash /opt/stockix/stockixnew/scripts/setup-branch-deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
UNIT_DIR="/etc/systemd/system"
ACTIVE_BRANCH_FILE="/opt/stockix/active-branch"

# ── Root check ────────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must be run as root (sudo $0)" >&2
  exit 1
fi

echo "=== Stockix branch deploy setup ==="
echo "Repo root: ${REPO_ROOT}"

# ── Permissions ───────────────────────────────────────────────────────────────

chmod +x "${SCRIPT_DIR}/branch-deploy.sh"
chmod +x "${SCRIPT_DIR}/branch-poll.sh"
echo "  [✓] Scripts are executable."

# ── Systemd service ───────────────────────────────────────────────────────────
# Generated dynamically so REPO_ROOT is baked in correctly regardless of
# where the repo is cloned on this server.

cat > "${UNIT_DIR}/stockix-branch.service" << EOF
[Unit]
Description=Stockix branch deploy
Documentation=file://${REPO_ROOT}/scripts/branch-deploy.sh
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/branch-poll.sh
TimeoutStartSec=600
StandardOutput=journal
StandardError=journal
# Prevent systemd from killing the process group mid-deploy
KillMode=process
EOF

# ── Systemd timer ─────────────────────────────────────────────────────────────

cat > "${UNIT_DIR}/stockix-branch.timer" << EOF
[Unit]
Description=Stockix branch deploy — poll origin every 60 seconds
After=network-online.target

[Timer]
# First fire 30s after boot (let docker settle)
OnBootSec=30
# Then fire every 60s after the last run completes
OnUnitActiveSec=60
# Allow up to 5s clock drift
AccuracySec=5

[Install]
WantedBy=timers.target
EOF

echo "  [✓] Systemd units written to ${UNIT_DIR}."

# ── Enable and start ──────────────────────────────────────────────────────────

systemctl daemon-reload
systemctl enable stockix-branch.timer
systemctl start  stockix-branch.timer
echo "  [✓] Timer enabled and started."

# ── Active branch file ────────────────────────────────────────────────────────

if [ ! -f "${ACTIVE_BRANCH_FILE}" ]; then
  echo "main" > "${ACTIVE_BRANCH_FILE}"
  echo "  [✓] Created ${ACTIVE_BRANCH_FILE} → main"
else
  echo "  [~] ${ACTIVE_BRANCH_FILE} already exists: $(cat "${ACTIVE_BRANCH_FILE}")"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "=== Setup complete ==="
echo ""
echo "  Switch to architecture branch:"
echo "    echo 'architecture' > ${ACTIVE_BRANCH_FILE}"
echo ""
echo "  Switch back to main:"
echo "    echo 'main' > ${ACTIVE_BRANCH_FILE}"
echo ""
echo "  Manual immediate deploy:"
echo "    ${SCRIPT_DIR}/branch-deploy.sh <branch>"
echo ""
echo "  Watch live deploy logs:"
echo "    journalctl -fu stockix-branch.service"
echo ""
echo "  Check poll status:"
echo "    systemctl status stockix-branch.timer"
echo ""
echo "  View deploy history:"
echo "    tail -f /var/log/stockix/deploy.log"
