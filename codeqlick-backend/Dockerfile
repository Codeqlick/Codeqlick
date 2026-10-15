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
ENV NODE_ENV=development
# Lets the start command detect a changed lockfile and reinstall into the node_modules volume.
RUN cp package-lock.json node_modules/.installed-lock && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---- Build stage ---------------------------------------------------------------------------
FROM deps AS build

COPY . .
# The generated client lands in src/generated/prisma and is compiled together with the app.
# prisma.config.ts reads DATABASE_URL, which generate doesn't need, so a placeholder is enough.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
  && npm run build

# NOTE: dev dependencies are intentionally NOT pruned (`npm prune --omit=dev` is skipped).
# The container runs `prisma migrate deploy` on start and the Prisma CLI (`prisma`) and the
# TypeScript config loader it needs are dev dependencies. Keeping them makes the image larger
# but avoids adding extra runtime dependencies or a separate migration image.

# ---- Runtime stage -------------------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
# `prisma db seed` (first admin) runs prisma/seed.ts with tsx and imports the generated client.
COPY --from=build --chown=node:node /app/src/generated ./src/generated

# Uploaded images. Created here so the volume mounted on it starts out owned by `node`.
RUN mkdir uploads && chown node:node uploads

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/v1/health" > /dev/null || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
