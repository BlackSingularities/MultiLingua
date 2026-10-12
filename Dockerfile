# syntax=docker/dockerfile:1.7
# ——— build: baza treści kursów + aplikacja webowa ———
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run content && npx vite build

# ——— runtime: tylko serwer, statyczne pliki i baza tylko do odczytu ———
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8000 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/data/content.db ./data/content.db
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/api/health >/dev/null || exit 1
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.ts"]
