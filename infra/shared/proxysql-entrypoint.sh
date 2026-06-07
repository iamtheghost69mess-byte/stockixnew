#!/bin/sh
set -eu

if [ -z "${SHARED_MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "SHARED_MYSQL_ROOT_PASSWORD is required for stockix-mysql-proxy" >&2
  exit 1
fi

# Escape sed replacement metacharacters in the root password.
escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\/&|]/\\&/g'
}

ROOT_ESCAPED="$(escape_sed "${SHARED_MYSQL_ROOT_PASSWORD}")"
sed "s|__MYSQL_ROOT_PASSWORD__|${ROOT_ESCAPED}|g" /etc/proxysql.cnf.template > /etc/proxysql.cnf

exec proxysql -f /etc/proxysql.cnf -D /var/lib/proxysql
