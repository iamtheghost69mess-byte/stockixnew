#!/bin/sh
# Install git pre-commit hook to block .env commits.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$ROOT/scripts/git-hooks/pre-commit-env-block.sh"
HOOK_DST="$ROOT/.git/hooks/pre-commit"

if [ ! -d "$ROOT/.git/hooks" ]; then
  echo "Not a git repository: $ROOT"
  exit 1
fi

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "Installed pre-commit hook: $HOOK_DST"
