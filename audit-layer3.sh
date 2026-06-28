#!/bin/bash
set -e
OUT="layer3.md"

echo "# Layer 3: Environment Variables Audit" > $OUT

echo "## 1. Direct process.env Access" >> $OUT
echo "" >> $OUT

dirs=("apps/api/src/" "apps/pos-backend/" "services/pms/src/" "services/stockix-finance/packages/server/src/" "infra/worker-service/src/" "infra/worker-service/domain/")

for d in "${dirs[@]}"; do
  echo "### Directory: $d" >> $OUT
  echo '```text' >> $OUT
  res=$(grep -rn "process\.env\." $d || true)
  if [ -z "$res" ]; then
    echo "0 results found. Executed: grep -rn \"process\.env\.\" $d" >> $OUT
  else
    echo "$res" >> $OUT
  fi
  echo '```' >> $OUT
done

echo "## 2. Existing Config Helpers" >> $OUT
echo '```text' >> $OUT
grep -rnE "(requireEnv|getEnv|mustEnv|validateEnv|parseEnv)" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=build || echo "No helpers found" >> $OUT
echo '```' >> $OUT

echo "## 3. All .env Files" >> $OUT
echo "" >> $OUT
env_files=$(find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*")
for f in $env_files; do
  echo "### File: $f" >> $OUT
  echo '```text' >> $OUT
  grep -v "^#" $f | grep "=" | sed 's/=.*/=***/' >> $OUT
  echo '```' >> $OUT
done

echo "## 4. dotenv Imports" >> $OUT
echo '```text' >> $OUT
grep -rn "dotenv" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=build || true >> $OUT
grep -rn "config()" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=build || true >> $OUT
echo '```' >> $OUT

echo "## 6. Fallback Patterns — Real Scan" >> $OUT
for d in "${dirs[@]}"; do
  echo "### Fallbacks in: $d" >> $OUT
  echo '```text' >> $OUT
  grep -rnE "(\?\? '|\?\? \"|\|\| '|\|\| \"|process\.env.*(\|\||\?\?))" $d || echo "No fallbacks found" >> $OUT
  echo '```' >> $OUT
done

echo "Done running script"
