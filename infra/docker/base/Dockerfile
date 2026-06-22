# syntax=docker/dockerfile:1
# Shared base image for all Stockix Node.js services (api, dashboard, pos-backend, pos-frontend2).
# Does NOT include docker-cli — the infra-worker has its own base stage for that.
# Published to GHCR as: ghcr.io/<org>/stockix/base:node22-<sha>
# Rebuilt in build-and-publish.yml whenever this file changes.

FROM node:22-alpine

RUN apk add --no-cache \
      libc6-compat \
      dumb-init \
    && apk upgrade --no-cache \
    && corepack enable \
    && corepack prepare pnpm@9.15.9 --activate \
    && node --version \
    && pnpm --version

WORKDIR /app

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
