#!/bin/bash
cd ~/dev/stokcix/stockixnew

{
echo "### 1. find . -name 'package.json' -not -path '*/node_modules/*' | xargs grep -l '\"name\": \"@repo/shared\"' 2>/dev/null"
find . -name "package.json" -not -path "*/node_modules/*" | xargs grep -l '"name": "@repo/shared"' 2>/dev/null

echo -e "\n### 2. cat packages/shared/package.json"
cat packages/shared/package.json 2>/dev/null

echo -e "\n### 3. cat packages/shared/src/tenant-dns.ts"
cat packages/shared/src/tenant-dns.ts 2>/dev/null

echo -e "\n### 4. find . -name 'tenant-dns.ts' -not -path '*/node_modules/*'"
find . -name "tenant-dns.ts" -not -path "*/node_modules/*" 2>/dev/null

echo -e "\n### 5. cat pnpm-workspace.yaml"
cat pnpm-workspace.yaml 2>/dev/null

echo -e "\n### 6. grep -rn 'paths' tsconfig.base.json 2>/dev/null || grep -rn 'paths' tsconfig.json 2>/dev/null"
grep -rn "paths" tsconfig.base.json 2>/dev/null || grep -rn "paths" tsconfig.json 2>/dev/null

echo -e "\n### 7. cat apps/api/tsconfig.json"
cat apps/api/tsconfig.json 2>/dev/null

echo -e "\n### 8. cat infra/worker-service/tsconfig.json"
cat infra/worker-service/tsconfig.json 2>/dev/null

echo -e "\n### 9. grep -rn 'packages/shared' apps/ infra/ --include='*.json' | grep -v node_modules"
grep -rn "packages/shared" apps/ infra/ --include="*.json" | grep -v node_modules 2>/dev/null

echo -e "\n### 10. grep -rn '@repo/shared' apps/api/src/ infra/worker-service/ --include='*.ts' | head -20"
grep -rn "@repo/shared" apps/api/src/ infra/worker-service/ --include="*.ts" | head -20 2>/dev/null
} > pkg-diagnostic.md
