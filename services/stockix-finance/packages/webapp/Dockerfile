FROM node:14.21.3 as build

WORKDIR /app
RUN npm install -g pnpm@7

# Copy lerna.json for the version injection in craco.config.js
COPY lerna.json ./

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./

WORKDIR /app/packages/webapp

# Copy ONLY webapp package.json
COPY ./packages/webapp/package*.json ./

WORKDIR /app
# Install ONLY webapp dependencies to avoid hoisting conflicts with server's Webpack 5
RUN pnpm i --frozen-lockfile --filter @stockix/webapp...

WORKDIR /app/packages/webapp

# Copy webapp source
COPY ./packages/webapp ./

# Build the webapp isolated from the monorepo
ENV SKIP_PREFLIGHT_CHECK=true
RUN pnpm run build

FROM nginx

COPY ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/webapp/build /usr/share/nginx/html
