# syntax=docker/dockerfile:1

# ---- Dependencies --------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci

# ---- Development (docker-compose.yml) ------------------------------------------------------
# The source is bind-mounted over /app and node_modules lives in a named volume, so the image
# only provides Node and a first copy of the dependencies. See docker-compose.yml.
FROM deps AS dev
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
# Lets the start command detect a changed lockfile and reinstall into the node_modules volume.
RUN cp package-lock.json node_modules/.installed-lock && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0"]

# ---- Build stage ---------------------------------------------------------------------------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
# Public content is fetched at request time (ISR); an unreachable API during the build is fine.
RUN npm run build

# ---- Runtime stage -------------------------------------------------------------------------
# next.config.ts sets `output: 'standalone'`: server.js plus only the files it needs.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/robots.txt" > /dev/null || exit 1

CMD ["node", "server.js"]
