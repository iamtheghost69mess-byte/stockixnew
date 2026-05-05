FROM node:14.21.3 as build

WORKDIR /app

# Copy lerna.json for the version injection in craco.config.js
COPY lerna.json ./

WORKDIR /app/packages/webapp

# Copy ONLY webapp package.json
COPY ./packages/webapp/package*.json ./

# Install ONLY webapp dependencies to avoid hoisting conflicts with server's Webpack 5
RUN npm install --legacy-peer-deps

# Copy webapp source
COPY ./packages/webapp ./

# Build the webapp isolated from the monorepo
ENV SKIP_PREFLIGHT_CHECK=true
RUN npm run build

FROM nginx

COPY ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/webapp/build /usr/share/nginx/html
