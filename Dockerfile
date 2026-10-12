# syntax=docker/dockerfile:1.7
# ——— build: baza treści kursów + aplikacja webowa ———
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run content && npx vite build

# ——— runtime: serwer, statyczne pliki i treść kursów ———
# Treść z repozytorium (content-seed) trafia przy starcie na wolumen /app/var, gdzie
# panel administratora może ją edytować; baza treści budowana jest tam przy starcie.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8000 HOST=0.0.0.0     CONTENT_SEED_DIR=/app/content-seed CONTENT_DIR=/app/var/courses DATA_DIR=/app/var
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY scripts/content-lib.ts scripts/content-db.ts ./scripts/
COPY content/courses ./content-seed
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/var && chown node:node /app/var
USER node
VOLUME /app/var
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/api/health >/dev/null || exit 1
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.ts"]
