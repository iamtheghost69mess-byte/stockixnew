#!/bin/sh
# Prevent committing files that contain platform secrets.
set -eu

BLOCKED_PATHS="
.env
.env.local
.env.production
.env.production.local
infra/prod/.env
infra/staging/.env
apps/api/.env
apps/dashboard/.env
"

STAGED=$(git diff --cached --name-only)

for path in $BLOCKED_PATHS; do
  if echo "$STAGED" | grep -qx "$path"; then
    echo "BLOCKED: Attempting to commit ${path}"
    echo "This file contains secrets and must never be committed."
    echo "Use: git reset HEAD -- ${path}"
    exit 1
  fi
done

# Block any other .env under apps/ or services/ (except examples)
echo "$STAGED" | while IFS= read -r file; do
  case "$file" in
    */.env)
      case "$file" in
        *.env.example|*/.env.example) continue ;;
      esac
      echo "BLOCKED: Attempting to commit ${file}"
      echo "Use .env.example for templates only."
      exit 1
      ;;
  esac
done

exit 0
