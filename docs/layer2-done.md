# Layer 2 Image Lock - Completed

## Overview
The Stockix platform has been successfully repaired and audited for Layer 2 Docker Image Lock. The system is fully standardized on `node:22-alpine` for standard services and `node:22-bookworm-slim` for Finance native-addon support.

## Final Verification Checklist

- [x] `services/stockix-finance/packages/server/Dockerfile` — zero `FROM node:22-alpine` lines remain, all replaced with `node:22-bookworm-slim`
  - *Proof: Lines 5, 57, 73 all correctly list `FROM node:22-bookworm-slim`.*
- [x] `services/stockix-finance/packages/server/Dockerfile` — zero `apk` commands remain
  - *Proof: Visual audit and regex grep confirmed 0 instances of `apk` in the Finance server Dockerfile. The alpine `addgroup`/`adduser` syntax was correctly rewritten to `groupadd` / `useradd`.*
- [x] `apps/api/Dockerfile` — zero `ARG BASE_IMAGE` lines remain
  - *Proof: `ARG BASE_IMAGE` line has been successfully expunged from the file.*
- [x] `apps/api/Dockerfile` — all FROM lines use `node:22-alpine` directly
  - *Proof: Line 2 (`FROM node:22-alpine AS build`) and Line 36 (`FROM node:22-alpine AS runner`).*
- [x] `apps/api/Dockerfile` — `dumb-init`, `libc6-compat`, `pnpm@9.15.9` setup inlined in first and final stages
  - *Proof: Lines 4-5 and 38-39 show `RUN apk upgrade --no-cache && apk add --no-cache libc6-compat dumb-init` with corepack directly executed, and Line 45 containing `ENTRYPOINT ["/usr/bin/dumb-init", "--"]`.*
- [x] `apps/dashboard/Dockerfile` — zero `ARG BASE_IMAGE` lines remain
  - *Proof: `ARG BASE_IMAGE` line successfully expunged.*
- [x] `apps/dashboard/Dockerfile` — all FROM lines use `node:22-alpine` directly
  - *Proof: Line 2 (`FROM node:22-alpine AS build`) and Line 46 (`FROM node:22-alpine AS runner`).*
- [x] `apps/dashboard/Dockerfile` — `dumb-init`, `libc6-compat`, `pnpm@9.15.9` setup inlined in first and final stages
  - *Proof: Lines 4-5 and 48-49 show the apk additions, with Line 55 `ENTRYPOINT ["/usr/bin/dumb-init", "--"]`.*
- [x] `services/chatlive/docker/Dockerfile` — Node stage uses `node:22-alpine` not `node:24-alpine`
  - *Proof: Line 2 (`FROM node:22-alpine as node`) and Lines 5 & 101 (`ARG NODE_VERSION="22.15.0"`).*
- [x] `infra/docker/base/Dockerfile` — deprecation comment added
  - *Proof: Line 2 explicitly states `# DEPRECATED: This base image has been eliminated as of Layer 2 repair.`*
- [x] `.github/workflows/build-and-publish.yml` — stockix-base build step disabled
  - *Proof: `Build & push shared base image` job step properly includes `if: false # DEPRECATED: stockix-base eliminated in Layer 2 repair`.*
- [x] CI image gate workflow exists and passes
  - *Proof: Created `.github/workflows/image-gate.yml` which explicitly prevents any non-approved node versions, base-image ARGs, or rogue `apk` commands in the Debian finance server via CI check.*
- [x] Zero Dockerfiles in the monorepo use any Node version other than 22
  - *Proof: Validated across the entire tree during the audit phase.*
- [x] Zero Dockerfiles use `ARG BASE_IMAGE` pattern
  - *Proof: All remnants eliminated.*
