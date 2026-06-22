#!/usr/bin/env bash
# Bootstrap MySQL async replication from stockix-mysql (primary) to stockix-mysql-replica.
#
# Run ONCE after first deploying stockix-mysql-replica.
# Safe to run again — idempotent for the STOP SLAVE / RESET SLAVE steps.
#
# Prerequisites:
#   • Both containers running and healthy in the stockix-shared Docker project
#   • SHARED_MYSQL_ROOT_PASSWORD set in the environment or infra/prod/.env
#   • The replica volume is EMPTY (no prior data) — mysqldump handles the initial sync
#
# Usage (from repo root on the production server):
#   source infra/prod/.env && bash ops/bootstrap-mysql-replica.sh

set -euo pipefail

PRIMARY_CONTAINER="stockix-mysql"
REPLICA_CONTAINER="stockix-mysql-replica"
REPL_USER="replicator"
REPL_PASS="${REPL_USER_PASSWORD:-replpassword_change_me}"
ROOT_PASS="${SHARED_MYSQL_ROOT_PASSWORD:?SHARED_MYSQL_ROOT_PASSWORD is required}"

echo "==> 1/5  Creating replication user on primary..."
docker exec "$PRIMARY_CONTAINER" mysql -uroot -p"$ROOT_PASS" -e "
  CREATE USER IF NOT EXISTS '${REPL_USER}'@'%' IDENTIFIED WITH mysql_native_password BY '${REPL_PASS}';
  GRANT REPLICATION SLAVE ON *.* TO '${REPL_USER}'@'%';
  FLUSH PRIVILEGES;
"
echo "     Replication user created."

echo "==> 2/5  Taking consistent snapshot of primary..."
docker exec "$PRIMARY_CONTAINER" mysqldump \
  -uroot -p"$ROOT_PASS" \
  --single-transaction \
  --source-data=2 \
  --all-databases \
  --triggers \
  --routines \
  --events \
  > /tmp/stockix-mysql-snapshot.sql
echo "     Snapshot written to /tmp/stockix-mysql-snapshot.sql"

# Extract the binary log coordinates embedded by --source-data=2
BINLOG_FILE=$(grep "^-- CHANGE MASTER TO" /tmp/stockix-mysql-snapshot.sql | grep -oP "MASTER_LOG_FILE='\K[^']+")
BINLOG_POS=$(grep  "^-- CHANGE MASTER TO" /tmp/stockix-mysql-snapshot.sql | grep -oP "MASTER_LOG_POS=\K[0-9]+")
echo "     Primary binlog position: ${BINLOG_FILE}:${BINLOG_POS}"

echo "==> 3/5  Restoring snapshot on replica..."
docker exec -i "$REPLICA_CONTAINER" mysql -uroot -p"$ROOT_PASS" < /tmp/stockix-mysql-snapshot.sql
echo "     Snapshot restored."

echo "==> 4/5  Configuring replication channel..."
docker exec "$REPLICA_CONTAINER" mysql -uroot -p"$ROOT_PASS" -e "
  STOP SLAVE;
  RESET SLAVE ALL;
  CHANGE MASTER TO
    MASTER_HOST='${PRIMARY_CONTAINER}',
    MASTER_USER='${REPL_USER}',
    MASTER_PASSWORD='${REPL_PASS}',
    MASTER_LOG_FILE='${BINLOG_FILE}',
    MASTER_LOG_POS=${BINLOG_POS},
    MASTER_CONNECT_RETRY=10,
    GET_MASTER_PUBLIC_KEY=1;
  START SLAVE;
"
echo "     Replication channel configured."

echo "==> 5/5  Verifying replica status..."
docker exec "$REPLICA_CONTAINER" mysql -uroot -p"$ROOT_PASS" -e "SHOW SLAVE STATUS\G" \
  | grep -E "Slave_IO_Running|Slave_SQL_Running|Seconds_Behind_Master|Last_Error"

echo ""
echo "Bootstrap complete. Monitor replica lag:"
echo "  docker exec ${REPLICA_CONTAINER} mysql -uroot -p\${SHARED_MYSQL_ROOT_PASSWORD} -e 'SHOW SLAVE STATUS\\G' | grep Seconds_Behind_Master"

rm -f /tmp/stockix-mysql-snapshot.sql
