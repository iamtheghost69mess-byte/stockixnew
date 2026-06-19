#!/usr/bin/env bash
# Polls origin for changes on the active branch. Triggers branch-deploy.sh
# when new commits arrive or the active branch switches.
#
# Driven by systemd timer (every 60s). Never run directly in production —
# call branch-deploy.sh <branch> for manual deploys.
#
# Control:
#   echo "architecture" > /opt/stockix/active-branch   # switch branch
#   echo "main"         > /opt/stockix/active-branch   # switch back
#
# Log: /var/log/stockix/poll.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ACTIVE_BRANCH_FILE="/opt/stockix/active-branch"
LOG_FILE="/var/log/stockix/poll.log"
STATE_FILE="/var/lib/stockix/last-deployed-sha"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() { printf '[%s] [POLL] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE}"; }

mkdir -p /var/log/stockix /var/lib/stockix

# ── Read active branch ────────────────────────────────────────────────────────

if [ ! -f "${ACTIVE_BRANCH_FILE}" ]; then
  log "No active-branch file found at ${ACTIVE_BRANCH_FILE} — nothing to do."
  log "Create it:  echo <branch> > ${ACTIVE_BRANCH_FILE}"
  exit 0
fi

TARGET="$(tr -d '[:space:]' < "${ACTIVE_BRANCH_FILE}")"

if [ -z "${TARGET}" ]; then
  log "active-branch file is empty — nothing to do."
  exit 0
fi

# ── Fetch origin for target branch ────────────────────────────────────────────

cd "${REPO_ROOT}"

if ! git fetch --quiet origin "${TARGET}" 2>/dev/null; then
  log "WARN: git fetch failed for branch '${TARGET}' — skipping this cycle."
  exit 0
fi

# ── Read current state ────────────────────────────────────────────────────────

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
ORIGIN_SHA="$(git rev-parse "origin/${TARGET}" 2>/dev/null || echo '')"
LAST_SHA="$(cat "${STATE_FILE}" 2>/dev/null || echo '')"

if [ -z "${ORIGIN_SHA}" ]; then
  log "WARN: Branch 'origin/${TARGET}' not found on remote."
  exit 0
fi

# ── Decide ────────────────────────────────────────────────────────────────────

REASON=''

if [ "${CURRENT_BRANCH}" != "${TARGET}" ]; then
  REASON="branch switched: ${CURRENT_BRANCH} → ${TARGET}"
elif [ "${LOCAL_SHA}" != "${ORIGIN_SHA}" ]; then
  REASON="new commits: ${LOCAL_SHA:0:7} → ${ORIGIN_SHA:0:7}"
elif [ "${LAST_SHA}" != "${ORIGIN_SHA}" ]; then
  REASON="state mismatch — redeploying for consistency"
fi

if [ -z "${REASON}" ]; then
  log "${TARGET} is up to date @ ${LOCAL_SHA:0:7} — nothing to do."
  exit 0
fi

log "Triggering deploy (${REASON})."
"${SCRIPT_DIR}/branch-deploy.sh" "${TARGET}"
