# Align with server (Node 18+). Node 14 is EOL and breaks modern transitive syntax (e.g. ||=).
FROM node:20-alpine AS build

USER root

WORKDIR /app

RUN npm config set legacy-peer-deps true \
  && npm config set package-lock false \
  && npm config set fetch-timeout 600000 \
  && npm config set fetch-retries 10 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000

COPY package.json lerna.json ./
COPY packages/webapp/package.json ./packages/webapp/package.json
COPY packages/server/package.json ./packages/server/package.json

ENV CI=1
ENV HUSKY=0
ENV NODE_OPTIONS=--max-old-space-size=8192

RUN npm install -w @bigcapital/webapp --include-workspace-root --no-audit --no-fund

COPY ./packages/webapp /app/packages/webapp
RUN npm run build:webapp

FROM nginx:alpine

COPY ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/webapp/build /usr/share/nginx/html
