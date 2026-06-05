#!/usr/bin/env bash
# Idempotent single-node replica set bootstrap for stockix-shared MongoDB.
# Waits for mongod, initiates rs0 if needed, then blocks until PRIMARY.
set -euo pipefail

MONGO_HOST="${MONGO_RS_INIT_HOST:-stockix-mongo}"
MONGO_PORT="${MONGO_RS_INIT_PORT:-27017}"
RS_ID="${MONGO_RS_ID:-rs0}"
MEMBER_HOST="${MONGO_RS_MEMBER_HOST:-stockix-mongo:27017}"
PING_RETRIES="${MONGO_RS_PING_RETRIES:-30}"
PRIMARY_RETRIES="${MONGO_RS_PRIMARY_RETRIES:-30}"
SLEEP_SECS="${MONGO_RS_SLEEP_SECS:-2}"

uri="mongodb://${MONGO_HOST}:${MONGO_PORT}"

echo "[rs-init] waiting for mongod at ${uri}…"
for ((i = 1; i <= PING_RETRIES; i++)); do
  if mongosh "${uri}" --quiet --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)'; then
    echo "[rs-init] mongod ping ok"
    break
  fi
  if ((i == PING_RETRIES)); then
    echo "[rs-init] ERROR: mongod not reachable after ${PING_RETRIES} attempts" >&2
    exit 1
  fi
  sleep "${SLEEP_SECS}"
done

mongosh "${uri}" --quiet --eval "
  const rsId = '${RS_ID}';
  const memberHost = '${MEMBER_HOST}';
  try {
    const status = rs.status();
    if (status.ok === 1) {
      print('[rs-init] replica set already initiated');
      quit(0);
    }
  } catch (e) {
    // not initiated yet
  }
  print('[rs-init] initiating replica set ' + rsId + '…');
  const result = rs.initiate({ _id: rsId, members: [{ _id: 0, host: memberHost }] });
  if (!result.ok) {
    print('[rs-init] ERROR: rs.initiate failed: ' + tojson(result));
    quit(1);
  }
"

echo "[rs-init] waiting for PRIMARY…"
for ((i = 1; i <= PRIMARY_RETRIES; i++)); do
  if mongosh "${uri}" --quiet --eval "
    const s = rs.status();
    if (s.ok !== 1) quit(1);
    const primary = s.members.find(m => m.stateStr === 'PRIMARY');
    quit(primary ? 0 : 1);
  "; then
    echo "[rs-init] replica set ${RS_ID} is PRIMARY — ready"
    exit 0
  fi
  sleep "${SLEEP_SECS}"
done

echo "[rs-init] ERROR: replica set did not reach PRIMARY in time" >&2
exit 1
