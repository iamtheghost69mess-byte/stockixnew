#!/usr/bin/env bash

echo "================================="
echo "PNPM MONOREPO INSPECTION"
echo "================================="

echo
echo "[1] Lockfile Size"
ls -lh pnpm-lock.yaml

echo
echo "[2] Lockfile Version"
grep "^lockfileVersion:" pnpm-lock.yaml

echo
echo "[3] Workspace Packages"
cat pnpm-workspace.yaml

echo
echo "[4] Apps"
find apps -maxdepth 2 -name package.json

echo
echo "[5] Packages"
find packages -maxdepth 2 -name package.json

echo
echo "[6] Services"
find services -maxdepth 2 -name package.json

echo
echo "[7] Total Locked Packages"
grep -c "resolution:" pnpm-lock.yaml

echo
echo "[8] Top Dependencies"
grep -A100 "dependencies:" package.json

echo
echo "================================="
echo "DONE"
echo "================================="