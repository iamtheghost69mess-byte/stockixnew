# Single-stage production build (more reliable for native modules)
FROM node:20

WORKDIR /app

# Install build tools and production utilities
RUN apt-get update && apt-get install -y --no-install-recommends curl dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest and config
COPY apps/pos-backend/package.json ./
COPY .npmrc ./

# Install dependencies standalone
RUN npm install --legacy-peer-deps --no-audit

# Copy application source
COPY apps/pos-backend ./

# Ensure uploads directory exists and is writable
RUN mkdir -p uploads && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=8010
EXPOSE 8010


ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
