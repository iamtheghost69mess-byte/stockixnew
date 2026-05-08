FROM node:20-alpine AS build

USER root

WORKDIR /app

# Install package-local dependencies (avoid monorepo workspace:* resolution in image builds).
COPY ./packages/webapp/package*.json /app/packages/webapp/
RUN npm --prefix ./packages/webapp install --legacy-peer-deps --package-lock=false

# Build webapp package
COPY ./packages/webapp /app/packages/webapp
RUN npm --prefix ./packages/webapp run build

FROM nginx

COPY ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/webapp/build /usr/share/nginx/html
