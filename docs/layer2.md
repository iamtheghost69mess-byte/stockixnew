# Layer 2 Audit: Docker Image Lock

## 1. Find Every Dockerfile in the Monorepo

- **`services/chatlive/docker/Dockerfile`**
  - Line 2: `FROM node:24-alpine as node` (Base: `node:24-alpine`)
  - Line 3: `FROM ruby:3.4.4-alpine3.21 AS pre-builder` (Base: `ruby:3.4.4-alpine3.21`)
  - Line 99: `FROM ruby:3.4.4-alpine3.21` (Base: `ruby:3.4.4-alpine3.21`)
  - Multi-stage: Yes (node, pre-builder, unnamed final stage)

- **`apps/pos-frontend2/Dockerfile`**
  - Line 4: `FROM node:22-alpine AS build` (Base: `node:22-alpine`)
  - Line 41: `FROM node:22-alpine AS runner` (Base: `node:22-alpine`)
  - Multi-stage: Yes (build, runner)

- **`apps/api/Dockerfile`**
  - Line 3: `FROM ${BASE_IMAGE} AS build` (Base: `${BASE_IMAGE}`)
  - Line 30: `FROM ${BASE_IMAGE} AS runner` (Base: `${BASE_IMAGE}`)
  - Multi-stage: Yes (build, runner)

- **`services/stockix-finance/docker/mongo/Dockerfile`**
  - Line 1: `FROM mongo:5.0` (Base: `mongo:5.0`)
  - Multi-stage: No

- **`services/stockix-finance/docker/mariadb/Dockerfile`**
  - Line 1: `FROM mariadb:10.2` (Base: `mariadb:10.2`)
  - Multi-stage: No

- **`services/stockix-finance/docker/redis/Dockerfile`**
  - Line 1: `FROM redis:6.2.21` (Base: `redis:6.2.21`)
  - Multi-stage: No

- **`services/stockix-finance/docker/nginx/Dockerfile`**
  - Line 1: `FROM nginx:1.11` (Base: `nginx:1.11`)
  - Multi-stage: No

- **`services/stockix-finance/packages/server/Dockerfile`**
  - Line 5: `FROM node:22-alpine AS deps` (Base: `node:22-alpine`)
  - Line 24: `FROM deps AS build-webapp` (Base: `deps`)
  - Line 31: `FROM build-webapp AS build-app` (Base: `build-webapp`)
  - Line 42: `FROM build-app AS prod-deps` (Base: `build-app`)
  - Line 50: `FROM deps AS migration-source` (Base: `deps`)
  - Line 54: `FROM migration-source AS migration-prod-deps` (Base: `migration-source`)
  - Line 57: `FROM node:22-alpine AS migration-runtime` (Base: `node:22-alpine`)
  - Line 73: `FROM node:22-alpine AS runtime` (Base: `node:22-alpine`)
  - Multi-stage: Yes (deps, build-webapp, build-app, prod-deps, migration-source, migration-prod-deps, migration-runtime, runtime)

- **`apps/dashboard/Dockerfile`**
  - Line 3: `FROM ${BASE_IMAGE} AS build` (Base: `${BASE_IMAGE}`)
  - Line 39: `FROM ${BASE_IMAGE} AS runner` (Base: `${BASE_IMAGE}`)
  - Multi-stage: Yes (build, runner)

- **`services/pms/frontend/Dockerfile`**
  - Line 1: `FROM node:22-alpine AS deps` (Base: `node:22-alpine`)
  - Line 6: `FROM node:22-alpine AS builder` (Base: `node:22-alpine`)
  - Line 13: `FROM node:22-alpine AS runner` (Base: `node:22-alpine`)
  - Multi-stage: Yes (deps, builder, runner)

- **`apps/pos-backend/Dockerfile`**
  - Line 5: `FROM node:22-alpine AS build` (Base: `node:22-alpine`)
  - Line 25: `FROM node:22-alpine AS runner` (Base: `node:22-alpine`)
  - Multi-stage: Yes (build, runner)

- **`services/pms/Dockerfile`**
  - Line 1: `FROM node:22-alpine AS base` (Base: `node:22-alpine`)
  - Line 5: `FROM base AS build` (Base: `base`)
  - Line 11: `FROM node:22-alpine AS runner` (Base: `node:22-alpine`)
  - Multi-stage: Yes (base, build, runner)

- **`infra/worker-service/Dockerfile`**
  - Line 16: `FROM node:22-alpine AS base` (Base: `node:22-alpine`)
  - Line 24: `FROM base AS build` (Base: `base`)
  - Line 65: `FROM node:22-alpine AS worker` (Base: `node:22-alpine`)
  - Multi-stage: Yes (base, build, worker)

- **`infra/docker/base/Dockerfile`**
  - Line 7: `FROM node:22-alpine` (Base: `node:22-alpine`)
  - Multi-stage: No

- **`infra/pos-tenant-stack/Dockerfile.pos-frontend-stub`**
  - Line 4: `FROM busybox:1.37.0-musl` (Base: `busybox:1.37.0-musl`)
  - Multi-stage: No

## 2. Classify Every Base Image Found

| Dockerfile Path | Stage | Base Image | OS Family | Node Version | Approved? |
|---|---|---|---|---|---|
| `services/chatlive/docker/Dockerfile` | node | `node:24-alpine` | alpine | 24 | ❌ NOT APPROVED (Wrong Node version - not 22) |
| `services/chatlive/docker/Dockerfile` | pre-builder | `ruby:3.4.4-alpine3.21` | alpine | N/A | ❌ NOT APPROVED (Non-node base image) |
| `services/chatlive/docker/Dockerfile` | (final) | `ruby:3.4.4-alpine3.21` | alpine | N/A | ❌ NOT APPROVED (Non-node base image) |
| `apps/pos-frontend2/Dockerfile` | build, runner | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `apps/api/Dockerfile` | build, runner | `${BASE_IMAGE}` | N/A | N/A | ❌ NOT APPROVED (Non-node base image used where node is expected / Unpinned tag) |
| `services/stockix-finance/docker/mongo/Dockerfile` | (final) | `mongo:5.0` | debian/ubuntu | N/A | ❌ NOT APPROVED (Non-node base image) |
| `services/stockix-finance/docker/mariadb/Dockerfile` | (final) | `mariadb:10.2` | debian/ubuntu | N/A | ❌ NOT APPROVED (Non-node base image) |
| `services/stockix-finance/docker/redis/Dockerfile` | (final) | `redis:6.2.21` | debian/ubuntu | N/A | ❌ NOT APPROVED (Non-node base image) |
| `services/stockix-finance/docker/nginx/Dockerfile` | (final) | `nginx:1.11` | debian/ubuntu | N/A | ❌ NOT APPROVED (Non-node base image) |
| `services/stockix-finance/packages/server/Dockerfile` | all stages | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `apps/dashboard/Dockerfile` | build, runner | `${BASE_IMAGE}` | N/A | N/A | ❌ NOT APPROVED (Non-node base image used where node is expected / Unpinned tag) |
| `services/pms/frontend/Dockerfile` | deps, builder, runner | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `apps/pos-backend/Dockerfile` | build, runner | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `services/pms/Dockerfile` | base, build, runner | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `infra/worker-service/Dockerfile` | base, build, worker | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `infra/docker/base/Dockerfile` | (final) | `node:22-alpine` | alpine | 22 | ✅ Approved (Tier A) |
| `infra/pos-tenant-stack/Dockerfile.pos-frontend-stub` | (final) | `busybox:1.37.0-musl` | musl | N/A | ❌ NOT APPROVED (Non-node base image) |

## 3. Find Every docker-compose.yml That References Images

No `image:` directives referencing Node-based base images directly (e.g., `image: node:20` or `image: node:24-alpine`) were found in any `docker-compose.yml` files. All compose files reference either pre-built application images or auxiliary services (Redis, Postgres, etc.).

## 4. Find Every .github/workflows File That References Docker Images

- **`.github/workflows/deploy-preview.yml`**
  - Line 34: `uses: docker/build-push-action@v5` (API image)
  - Line 44: `uses: docker/build-push-action@v5` (Dashboard image)

- **`.github/workflows/build-and-publish.yml`**
  - Line 35: `uses: docker/build-push-action@v6` (stockix-base image)
  - Line 47: `uses: docker/build-push-action@v6` (API image)
  - Line 59: `uses: docker/build-push-action@v6` (Dashboard image)
  - Line 71: `uses: docker/build-push-action@v6` (Worker Service image)
  - Line 83: `uses: docker/build-push-action@v6` (Finance Server image)

- **`.github/workflows/ci.yml`**
  - Line 13: `NODE_VERSION: "22.22.1"` (Environment variable)

No hardcoded `--build-arg NODE_VERSION=` or equivalent was found inside `build-args` for Docker actions.

## 5. Find Any ARG or ENV That Controls the Base Image

- **`services/chatlive/docker/Dockerfile`**
  - Line 5: `ARG NODE_VERSION="24.13.0"`
  - Line 101: `ARG NODE_VERSION="24.13.0"`
  - Note: Neither is actively used in a `FROM` line.

- **`apps/api/Dockerfile`**
  - Line 2: `ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22`
  - Line 3: `FROM ${BASE_IMAGE} AS build`
  - Line 30: `FROM ${BASE_IMAGE} AS runner`
  - Default: `ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22`

- **`apps/dashboard/Dockerfile`**
  - Line 2: `ARG BASE_IMAGE=ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22`
  - Line 3: `FROM ${BASE_IMAGE} AS build`
  - Line 39: `FROM ${BASE_IMAGE} AS runner`
  - Default: `ghcr.io/iamtheghost69mess-byte/stockix/stockix-base:node22`

## 6. Identify Which Services Need Tier A vs Tier B

- **API / Control Plane (`apps/api/Dockerfile`)**
  - Current base: `${BASE_IMAGE}` (`stockix-base:node22`)
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Lightweight API service.
  - Needs Change: YES.

- **Worker Service (`infra/worker-service/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Lightweight background jobs.
  - Needs Change: NO.

- **POS Backend (`apps/pos-backend/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Standard Node API.
  - Needs Change: NO.

- **POS Frontend (`apps/pos-frontend2/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Static/NextJS UI.
  - Needs Change: NO.

- **Dashboard (`apps/dashboard/Dockerfile`)**
  - Current base: `${BASE_IMAGE}` (`stockix-base:node22`)
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Web dashboard UI.
  - Needs Change: YES.

- **PMS API (`services/pms/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Standard Node API.
  - Needs Change: NO.

- **PMS Frontend (`services/pms/frontend/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier A (`node:22-alpine`)
  - Reason: Static UI.
  - Needs Change: NO.

- **Finance / Bigcapital Server (`services/stockix-finance/packages/server/Dockerfile`)**
  - Current base: `node:22-alpine`
  - Required Tier: Tier B (`node:22-bookworm-slim`)
  - Reason: Requires glibc for native packages (`better-sqlite3`, `sqlite3` identified in `package.json`).
  - Needs Change: YES.

## 7. Check for .dockerignore Files

- **`services/chatlive/docker/Dockerfile`** -> Uses `/services/chatlive/.dockerignore`. Excludes `node_modules`.
- **`apps/pos-frontend2/Dockerfile`** -> Uses root `/.dockerignore`. Excludes `node_modules`, build artifacts.
- **`apps/api/Dockerfile`** -> Uses root `/.dockerignore`. Excludes `node_modules`, build artifacts.
- **`services/stockix-finance/packages/server/Dockerfile`** -> Uses `/services/stockix-finance/.dockerignore`. Excludes `node_modules`.
- **`apps/dashboard/Dockerfile`** -> Uses root `/.dockerignore`. Excludes `node_modules`, build artifacts.
- **`services/pms/frontend/Dockerfile`** -> Uses root `/.dockerignore`.
- **`apps/pos-backend/Dockerfile`** -> Uses root `/.dockerignore`.
- **`services/pms/Dockerfile`** -> Uses root `/.dockerignore`.
- **`infra/worker-service/Dockerfile`** -> Uses `/infra/worker-service/.dockerignore`. Excludes `**/node_modules/.cache`.
- **`infra/docker/base/Dockerfile`** -> Uses root `/.dockerignore`.
- **`infra/pos-tenant-stack/Dockerfile.pos-frontend-stub`** -> Uses root `/.dockerignore`.

## 8. Summary Table

| File | Current Image | Required Image | Action Needed | Severity |
|---|---|---|---|---|
| `services/chatlive/docker/Dockerfile` | `node:24-alpine`, `ruby` | `ruby` / `node:22-alpine` | Fix Node version | HIGH |
| `apps/pos-frontend2/Dockerfile` | `node:22-alpine` | `node:22-alpine` | None | LOW |
| `apps/api/Dockerfile` | `${BASE_IMAGE}` | `node:22-alpine` | Switch to Tier A image directly | HIGH |
| `services/stockix-finance/docker/*` | `mongo:5.0`, `mariadb:10.2`... | N/A | None (non-node services) | LOW |
| `services/stockix-finance/packages/server/Dockerfile` | `node:22-alpine` | `node:22-bookworm-slim` | Switch to Tier B (glibc for SQLite) | CRITICAL |
| `apps/dashboard/Dockerfile` | `${BASE_IMAGE}` | `node:22-alpine` | Switch to Tier A image directly | HIGH |
| `services/pms/frontend/Dockerfile` | `node:22-alpine` | `node:22-alpine` | None | LOW |
| `apps/pos-backend/Dockerfile` | `node:22-alpine` | `node:22-alpine` | None | LOW |
| `services/pms/Dockerfile` | `node:22-alpine` | `node:22-alpine` | None | LOW |
| `infra/worker-service/Dockerfile` | `node:22-alpine` | `node:22-alpine` | None | LOW |
| `infra/docker/base/Dockerfile` | `node:22-alpine` | Deprecate | Remove custom base image | LOW |
| `infra/pos-tenant-stack/Dockerfile.pos-frontend-stub` | `busybox:1.37.0-musl` | `busybox` | None | LOW |
