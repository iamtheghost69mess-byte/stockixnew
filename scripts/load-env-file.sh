#!/usr/bin/env bash
# Load KEY=VALUE lines from a dotenv file without source/eval (semicolons in values are safe).
# Usage: load-env-file.sh /path/to/.env
set -euo pipefail

file="${1:?usage: load-env-file.sh path/to/.env}"
if [ ! -f "$file" ]; then
  echo "ERROR: env file not found: $file" >&2
  exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [ -z "$line" ] && continue
  case "$line" in
    \#*) continue ;;
  esac
  case "$line" in
    export\ *) line="${line#export }" ;;
  esac
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    export "${key}=${value}"
  fi
done <"$file"
