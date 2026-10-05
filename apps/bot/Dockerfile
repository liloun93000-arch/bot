# Contexte de build attendu : racine du monorepo (voir docker-compose.yml)
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci
COPY packages/core packages/core
COPY apps/bot apps/bot
RUN npm run build -w packages/core && npm run build -w apps/bot && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
COPY data/catalogue.md ./data/catalogue.md
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "apps/bot/dist/index.js"]
